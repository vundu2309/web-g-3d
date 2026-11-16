/**
 * How dark a boat's shadow on the water is and how soft its edge (pure numbers, no Babylon; the
 * shader in water.ts builds its GLSL from them and tests/hull-water.test.mjs checks them).
 *
 * A shadow on open water is not black: the sky still lights it and the water scatters light
 * from below. The first version took 90 % of the sun's light and 45 % of the rest, which on the
 * dark deep water of the sunset made a hard black slab. It now takes 62 % of the sun's light and
 * 20 % of the rest, and its edge softens with the height it is thrown from.
 */
export const SHADOW = {
  /** Share of the sun's light (body, glitter, foam) a full shadow takes away. */
  sun: 0.62,
  /** Share of the water's own colour a full shadow takes away (the sky light the hull blocks). */
  sky: 0.2,
  /** Share of the mirrored sky a full shadow takes away. */
  mirror: 0.2,
  /** Where a footprint starts to fade (1 is its outline). */
  edgeFrom: 0.4,
  /** The edge grows this much softer per metre of height the slice is thrown from. */
  penumbra: 0.12,
};

/**
 * The share of its light the water keeps in a full shadow, when `sunShare` (0..1) of the light
 * that reaches it comes from the sun (the shader's `incident`, then the body factor).
 */
export const shadowKeeps = (sunShare: number) =>
  (1 - sunShare * SHADOW.sun) * (1 - SHADOW.sky);
