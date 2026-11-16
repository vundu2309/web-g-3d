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

/** Hull mass (kg) and the box it is, the same as `HULL` in boat-physics.ts. */
export const HULL_BOX = { mass: 900, width: 2.8, length: 7.4 } as const;

/** Moment of inertia of the hull about the vertical axis (kg m^2). */
export const YAW_INERTIA =
  (HULL_BOX.mass / 12) * (HULL_BOX.width ** 2 + HULL_BOX.length ** 2);

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

/** Torque about the vertical axis (N m) that damps a yaw rate (rad/s) in the water. */
export function yawDampingTorque(yawRate: number): number {
  return -yawRate * YAW_INERTIA * YAW_WATER_DAMPING;
}

/** The turn rate (rad/s) a full rudder settles to at full authority. */
export function topTurnRate(authority = 1): number {
  return (
    (RUDDER * authority) /
    (YAW_INERTIA * (BODY_ANGULAR_DAMPING + YAW_WATER_DAMPING))
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
