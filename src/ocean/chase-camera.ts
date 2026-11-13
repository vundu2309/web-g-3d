/**
 * The chase camera's framing, as plain numbers and maths (no Babylon, so it is tested directly):
 * where it sits behind the boat, how it keeps clear of islands and piers, and how it looks ahead
 * into a turn. The scene (babylon-scene.ts) applies these every frame.
 */
export const CHASE = {
  /** Default view: how far behind the boat (m), how high (m) and how far ahead it looks (m). */
  back: 17.5,
  height: 9.6,
  lookAhead: 34,
  /** The closer, lower view while fishing. */
  fishingBack: 12.5,
  fishingHeight: 6.4,
  /** The camera stays this far outside an island's shore circle or a pier (m). */
  margin: 2.5,
  /** The closest it comes to the boat, and its lowest height when it has to come that close (m). */
  minReach: 3.5,
  minHeight: 3.2,
  /** How fast the camera comes in when something is in the way, and how fast it goes back (1 / s). */
  inRate: 10,
  outRate: 1.4,
  /** Looking into a turn: radians of lead per radian per second of turning, the most, how fast it follows. */
  leadPerRate: 0.5,
  leadMax: 0.5,
  leadRate: 2.2,
} as const;

/** Something solid in the sea: the shore circle of an island or a pier. */
export interface Circle {
  x: number;
  z: number;
  radius: number;
}

interface Point {
  x: number;
  z: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * How far along the line from the boat to where the camera wants to be (0..1) it can go before
 * the line runs into an obstacle (kept `margin` clear), so the camera never ends up inside a hill
 * or with an island between it and the boat. A circle the boat is already inside (near a shore)
 * is left to `pushOut`.
 */
export function clearFraction(
  boat: Point,
  want: Point,
  obstacles: readonly Circle[],
  margin: number = CHASE.margin,
): number {
  const dx = want.x - boat.x;
  const dz = want.z - boat.z;
  const a = dx * dx + dz * dz;
  if (a === 0) return 1;
  let fraction = 1;
  for (const o of obstacles) {
    const r = o.radius + margin;
    const fx = boat.x - o.x;
    const fz = boat.z - o.z;
    const c = fx * fx + fz * fz - r * r;
    if (c <= 0) continue;
    const b = 2 * (dx * fx + dz * fz);
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const entry = (-b - Math.sqrt(disc)) / (2 * a);
    if (entry >= 0 && entry < fraction) fraction = entry;
  }
  return fraction;
}

/**
 * The camera's reach (m) once the obstacles are taken into account: the wanted reach scaled by
 * `fraction`, but never closer than CHASE.minReach (or the wanted reach itself, if shorter).
 */
export const reachFor = (reach: number, fraction: number): number =>
  Math.min(reach, Math.max(CHASE.minReach, reach * fraction));

/** The camera height for a reach that was shortened: lower the closer it is. */
export function heightFor(
  height: number,
  reach: number,
  wantedReach: number,
): number {
  if (wantedReach <= 0) return height;
  const share = clamp(reach / wantedReach, 0, 1);
  return Math.min(height, CHASE.minHeight + (height - CHASE.minHeight) * share);
}

/**
 * Moves the shortening `current` (0..1) toward `target`: fast when it must come in (so the
 * camera is never late to an obstacle), slowly when it can go back out (so it does not pump).
 */
export function easeClear(
  current: number,
  target: number,
  seconds: number,
): number {
  const rate = target < current ? CHASE.inRate : CHASE.outRate;
  return (
    current + (target - current) * (1 - Math.exp(-rate * Math.max(0, seconds)))
  );
}

/** A point moved to the edge of any obstacle circle (plus `margin`) it is inside; others unchanged. */
export function pushOut(
  point: Point,
  obstacles: readonly Circle[],
  margin: number = CHASE.margin,
): Point {
  let x = point.x;
  let z = point.z;
  for (const o of obstacles) {
    const r = o.radius + margin;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d < 1e-6) {
      x = o.x + r;
      continue;
    }
    x = o.x + (dx / d) * r;
    z = o.z + (dz / d) * r;
  }
  return { x, z };
}

/**
 * How far the camera looks to one side of the boat's heading (radians, positive to the right,
 * the way a right turn increases the heading): into the turn, so the view swings ahead of the
 * bow. It follows the turning rate smoothly and returns to zero when the boat goes straight.
 */
export function turnLead(
  lead: number,
  yawRate: number,
  seconds: number,
): number {
  const target = clamp(
    yawRate * CHASE.leadPerRate,
    -CHASE.leadMax,
    CHASE.leadMax,
  );
  return (
    lead +
    (target - lead) * (1 - Math.exp(-CHASE.leadRate * Math.max(0, seconds)))
  );
}
