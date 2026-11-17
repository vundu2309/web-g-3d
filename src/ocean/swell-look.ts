/**
 * How the long swell is PAINTED on the open sea (purely visual: the mesh, the boats' water and
 * `waves.ts` are untouched). The water shader reads the long and medium waves apart from the
 * chop and uses them three ways: the normal is exaggerated so each face catches or loses the
 * light, the trough is darker and the crest paler, and the tallest crests get white foam
 * streaks, only when the sea state is high. Numbers live here so a test can pin their meaning.
 */
export const SWELL_SHADING = {
  /** Extra tilt given to the swell's slope in the normal (1 = the true slope on top of itself). */
  exaggerate: 3.0,
  /** Share of the chop's tilt kept on the open sea (the swell's faces read through it). */
  chopKeep: 0.4,
  /** Share of the fine ripple tilt kept on the open sea, so the big faces are not buried in speckle. */
  detailKeep: 0.3,
  /** How strongly a face tilted toward (or away from) the sun is lit (or shaded). */
  face: 7,
  /** Brightness of the water body in the deepest trough and on the tallest crest. */
  trough: 0.5,
  crest: 1.12,
};
/** White foam on tall crests. */
export const CREST_FOAM = {
  /** The sea state (0..1) below which there is no crest foam, and above which it is full. */
  seaFrom: 0.55,
  seaTo: 0.92,
  /** Height (-1..1 of the sea's reach) plus steepness weight where foam begins and is full. */
  from: 0.34,
  to: 0.66,
  /** How much of the crest foam is painted at most. */
  strength: 0.85,
};
/** 0 below `seaFrom`, 1 above `seaTo`, smooth between: how much the sea has foam on its crests. */
export function crestFoamAmount(seaState: number): number {
  const t = Math.min(
    1,
    Math.max(
      0,
      (seaState - CREST_FOAM.seaFrom) / (CREST_FOAM.seaTo - CREST_FOAM.seaFrom),
    ),
  );
  return t * t * (3 - 2 * t);
}
