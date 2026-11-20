/**
 * How the hull handles, as plain numbers (no Babylon, so tests read it directly). The
 * player's complaint was a boat that stalls, turns abruptly, slides off its heading and
 * wanders under steady keys: with only a quadratic keel drag across the hull and Havok's
 * soft angular damping, a full turn at cruise slid 20 to 27 degrees off its heading (up to
 * 4.8 m/s across the hull), lost a quarter of its speed, and kept turning 30 degrees and
 * for almost three seconds after the key was let go. Two rules fix it:
 *
 * - the keel grips the water in proportion to the sideways speed (a linear term on top of
 *   the old quadratic one), so a moving hull goes where it points and a slide dies in
 *   about a fifth of a second instead of seconds;
 * - the water damps the hull's turning (yaw) on top of Havok's damping, so the heading rate
 *   follows the rudder within about a third of a second and stops with it.
 */
import { FIRST_BOX, HULL_MASS } from "./boat-tier.ts";

/** Hull mass (kg) and the box of a hull (m). */
export interface HullBox {
  mass: number;
  width: number;
  length: number;
}

/**
 * The first boat's box (7.4 x 2.8 m, 900 kg): every number below was tuned on it. The bigger boats
 * of the upgrade shop have bigger boxes (boat-tier.ts) and the SAME mass; `handlingFor` keeps them
 * turning and leaning exactly as this one does.
 */
export const HULL_BOX: HullBox = {
  mass: HULL_MASS,
  width: FIRST_BOX.width,
  length: FIRST_BOX.length,
};

/** Moment of inertia of a box hull about the vertical axis (kg m^2). */
export const yawInertiaOf = (box: HullBox) =>
  (box.mass / 12) * (box.width ** 2 + box.length ** 2);

/** Moment of inertia of the first boat's hull about the vertical axis (kg m^2). */
export const YAW_INERTIA = yawInertiaOf(HULL_BOX);

/** Sideways speed the keel removes per second at full grip (1 / s): about 0.2 s to settle. */
export const KEEL_GRIP_RATE = 5;
/** Speed along the keel (m/s) at which the keel grips fully; a stopped hull has none. */
export const KEEL_GRIP_SPEED = 3;
/**
 * The share of the keel's sideways grip that stays when the hull is lifted out of the water
 * (a wave crest, planing lift): the keel is deep, so it still holds. Without it the grip fell
 * with the wet fraction and a boat turning at speed was shoved sideways, up to 2.9 m/s in
 * 0.25 s, each time a crest passed.
 */
export const KEEL_DRY_GRIP = 0.7;
/** Extra yaw damping from the water (1 / s), on top of Havok's own 0.9. */
export const YAW_WATER_DAMPING = 2.6;
/** Havok's angular damping of the body (1 / s), set in boat-physics.ts. */
export const BODY_ANGULAR_DAMPING = 0.9;
/** Rudder torque at full deflection, full authority (N m). Sized so the turn rate stays about 0.6 rad/s. */
export const RUDDER = 10000;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** 0 for a stopped hull, 1 once it moves along its keel at KEEL_GRIP_SPEED or faster. */
export function keelGrip(along: number): number {
  const t = clamp(Math.abs(along) / KEEL_GRIP_SPEED, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The force across the hull (N, along the side axis) for a sideways speed `across` and a
 * speed `along` the keel: quadratic water drag, a constant linear term and the keel's grip.
 */
export function crossForce(
  across: number,
  along: number,
  quadratic: number,
  linear: number,
  mass: number = HULL_BOX.mass,
): number {
  const grip = mass * KEEL_GRIP_RATE * keelGrip(along);
  return -(quadratic * Math.abs(across) + linear + grip) * across;
}

/**
 * What changes in the handling numbers when the box is not the first boat's. Havok works out the
 * body's inertia from the box and the mass, so the same rudder torque would turn a longer hull
 * more slowly and the same lean torque would lean a wider one less: the torques follow the
 * inertia and the lean follows the stiffness of the buoyancy (which grows with the square of the
 * sample points' spread). The result is a boat that turns at the same rate, leans as far and
 * answers the helm in the same time, only bigger. Every ratio is exactly 1 for the first boat.
 */
export interface Handling {
  /** Yaw inertia of the box (kg m^2): the water's damping of the turn is proportional to it. */
  yawInertia: number;
  /** Rudder torque at full deflection and authority (N m). */
  rudder: number;
  /** The lean into a turn is multiplied by this: the roll stiffness grows with the beam squared. */
  bank: number;
}

export function handlingFor(box: HullBox): Handling {
  const yawInertia = yawInertiaOf(box);
  const width = box.width / HULL_BOX.width;
  return {
    yawInertia,
    rudder: RUDDER * (yawInertia / YAW_INERTIA),
    bank: width * width,
  };
}

/** Torque about the vertical axis (N m) that damps a yaw rate (rad/s) in the water. */
export function yawDampingTorque(
  yawRate: number,
  yawInertia: number = YAW_INERTIA,
): number {
  return -yawRate * yawInertia * YAW_WATER_DAMPING;
}

/** The turn rate (rad/s) a full rudder settles to at full authority, for a hull of `box`. */
export function topTurnRate(authority = 1, box: HullBox = HULL_BOX): number {
  const { rudder, yawInertia } = handlingFor(box);
  return (
    (rudder * authority) /
    (yawInertia * (BODY_ANGULAR_DAMPING + YAW_WATER_DAMPING))
  );
}

/**
 * Where between the last two physics steps the drawn boat is. Physics runs in fixed steps
 * and a frame is never a whole number of them, so the drawn pose is blended by the time
 * left over (`remainder`, ms, less than one step) to avoid a frame with no step and the
 * next with two: the boat's heading and speed look steady at any frame rate.
 */
export function blendFraction(remainder: number, stepMs: number): number {
  if (!(stepMs > 0) || !Number.isFinite(remainder)) return 1;
  return clamp(remainder / stepMs, 0, 1);
}
