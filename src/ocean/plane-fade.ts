/**
 * How a seaplane comes into view and leaves it, as plain numbers (no Babylon, so tests read them
 * directly). A plane is drawn only within `range` of the camera, and only the nearest few: it must
 * not pop in or out at that edge. Its fade amount (1 whole, 0 gone) is the smaller of two things:
 *
 * - a distance taper: whole up to `band` metres inside the range, then thinning to nothing at the
 *   range itself, so a plane flying away dissolves before it is cut;
 * - a time fade: it rises over `FADE_IN` seconds when the plane is chosen to be drawn and falls over
 *   `FADE_OUT` when it is not (another plane came nearer, or it left the range), so a change in
 *   which planes are drawn is never a jump.
 *
 * The amount becomes the dithered fade (wildlife-scene.ts does the same for animals): the pixels
 * of the plane and its banner switch on or off in a fixed screen pattern, with no blending.
 */
export const FADE_IN = 1.5;
export const FADE_OUT = 1;
/** How far inside the range (m) the distance taper starts. */
export const FADE_BAND = 160;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** The distance taper: 1 up to `band` inside `range`, 0 at `range` and beyond, smooth between. */
export function distanceAmount(
  distance: number,
  range: number,
  band = FADE_BAND,
) {
  return smooth((range - distance) / band);
}

/** Moves `value` toward `target` at a rate of one whole fade per `seconds` (never past it). */
export function approach(
  value: number,
  target: number,
  dt: number,
  seconds: number,
) {
  const step = dt / seconds;
  return value < target
    ? Math.min(target, value + step)
    : Math.max(target, value - step);
}

/** The amount to draw with: the time fade, thinned by the distance. */
export const fadeAmount = (time: number, distance: number, range: number) =>
  Math.min(time, distanceAmount(distance, range));
