/**
 * How far each island prop (palm, rock, bush, hut) is drawn, and how: as plain numbers, with no
 * Babylon, so they are tested directly. Distances follow how big the prop looks, not a fixed range
 * per kind: the whole model while it is big, a coarser copy as it gets small, a coarser one still
 * far out, and then it fades away by dithering (the fade is `fadeAmount`, drawn by prop-fade.ts)
 * before it is dropped. The farthest a prop is drawn is where the fog has taken nearly all of it
 * (`FOG_CUT`), so its going is not seen.
 *
 * `size` is the longest side of the model (m); the angle a prop covers is size over distance (about
 * 490 pixels to the radian on a phone held wide, so 0.005 is two or three pixels).
 */
/** The whole model while the prop covers at least this angle. */
export const PROP_FULL_ANGLE = 0.07;
/** A coarser copy (about 45 % of the triangles) while it covers at least this. */
export const PROP_MID_ANGLE = 0.025;
/** The coarsest copy (about 18 %) down to this angle, then the prop is gone. */
export const PROP_END_ANGLE = 0.005;
/**
 * Beyond this distance (m) nothing is drawn however large: the sea's fog (FOG_DENSITY 0.0011, EXP2)
 * has covered 91 % of a thing 1,400 m away.
 */
export const FOG_CUT = 1400;
/** The last part of the way to the end (a fraction of the end distance) in which a prop fades out. */
export const FADE_BAND = 0.15;

export interface PropDistances {
  /** Up to here the whole model. */
  full: number;
  /** Up to here the mid copy. */
  mid: number;
  /** Up to here the far copy; it fades out over the last `FADE_BAND` of it. */
  end: number;
}

/** The distances at which a prop of this longest side changes level and goes. */
export function propDistances(size: number): PropDistances {
  const end = Math.min(size / PROP_END_ANGLE, FOG_CUT);
  // The levels must come in order and each have room, even where the fog cut shortens the end.
  const mid = Math.min(size / PROP_MID_ANGLE, end * 0.7);
  const full = Math.min(size / PROP_FULL_ANGLE, mid * 0.5);
  return { full, mid, end };
}

/** Triangles of the mid and far copies of a model of `triangles` triangles (at least 40 each). */
export function copyTriangles(triangles: number): { mid: number; far: number } {
  return {
    mid: Math.max(40, Math.round(triangles * 0.45)),
    far: Math.max(40, Math.round(triangles * 0.18)),
  };
}

/**
 * How much of a prop is drawn at `distance`: 1 until the fade band, then falling in a line to 0 at
 * `end`. The dithered fade shows that fraction of the model's pixels.
 */
export function fadeAmount(distance: number, end: number): number {
  const start = end * (1 - FADE_BAND);
  if (distance <= start) return 1;
  if (distance >= end) return 0;
  return (end - distance) / (end - start);
}
