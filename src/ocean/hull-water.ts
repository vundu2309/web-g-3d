/**
 * The water round a hull (pure maths and constants, no Babylon; the shader in water.ts builds
 * its GLSL from these so the two cannot drift, and tests/hull-water.test.mjs checks them).
 *
 * `hullWater` in the water shader paints a collar of ragged white water lapping at the planking
 * and rings of ripple that spread from the hull, whether the boat moves or not. Everything is
 * measured from the waterline outline in "edge" units: metres from the outline times
 * EDGE_PER_METRE, so the collar and the rings are as thick along the keel as across it. (They
 * were once measured as a stretched ellipse, which made the collar a 7 m tail behind the
 * stern and cut it off in a hard circle where the 10 m reach of the effect ended.)
 *
 * Every boat has its own outline (the tiers of the upgrade shop, boat-tier.ts `waterline`): the
 * functions take it as a last argument (the first boat's by default) and the shader gets it per
 * boat from `glslBoatShape`. The collar and the rings themselves are the same in metres for every
 * boat: EDGE_PER_METRE does not depend on the outline.
 */
import { boatTier, type Waterline } from "./boat-tier.ts";

/**
 * The waterline is an ellipse-like outline `beam` wide amidships and drawn to a point at the bow;
 * `scale` turns its size into the edge units of the collar and the rings; the rings have this
 * wavelength (edge units), spread `rate` wavelengths a second and tilt the water by `height` (m,
 * so a slope of height x 2 pi / wavelength).
 */
export const HULL_WATER = {
  halfLength: boatTier(0).waterline.halfLength,
  beam: boatTier(0).waterline.beam,
  shift: 0.2,
  scale: 1.2,
  wavelength: 2.1,
  rate: 0.5,
  height: 0.11,
};

/**
 * Edge units in one metre from the waterline outline: the same for every boat (the first boat's
 * beam sets it), so the collar and the rings are as wide in metres round a big hull as round a small.
 */
export const EDGE_PER_METRE = HULL_WATER.scale / HULL_WATER.beam;

/** The outline of the first boat, which the functions below use unless they are given another. */
const FIRST_LINE: Waterline = boatTier(0).waterline;

/** The ripples' slope fades to nothing between these two edge units. */
export const RING_FADE = { from: 3.2, to: 5.4 };

/**
 * The foam of the ring crests is gone by this edge unit (about 1.5 m from the hull): the rings
 * themselves keep going as ripples, only their first crests catch a little white water.
 */
export const FOAM_REACH = 1.3;

/** How strong the foam of the ring crests is at most (the collar's is 1). */
export const CREST_FOAM = 0.35;

/**
 * The collar: a narrow ragged lap of foam along the waterline, like a real boat's. Widths are
 * metres from the outline and are the most the foam can ever reach (the ragged edge is a smooth
 * fall-off inside them, and the gaps below cut it into pieces).
 *   side   the width along the planking: `min` where the noise is low, `max` where it is high;
 *   bow    the splash at the stem: how many times wider the collar gets over the forward
 *          `bowSpan` metres of the hull, and the metres past the tip where it is gone;
 *   stern  the wash behind the transom: how many times wider, how far behind the stern it runs
 *          before it is gone (the wake strips take the white water on from there);
 *   gaps   the collar is cut into pieces where a slow noise is below `gaps.from`, and whole
 *          where it is above `gaps.to` (a smooth step between, so the cut is never hard).
 */
export const COLLAR = {
  side: { min: 0.5, max: 0.9 },
  bow: { boost: 1.4, span: 1.8, past: 0.2 },
  stern: { boost: 1.3, span: 1.0, past: 0.15 },
  gaps: { from: 0.3, to: 0.62 },
};

/** The farthest the collar can ever reach from the waterline along the sides (m). */
export const COLLAR_SIDE_MAX = COLLAR.side.max;

/**
 * The shader does nothing farther than this from the middle of a hull (m): a plain cut-off for
 * speed. Every effect has faded to nothing before it, so the cut is never seen.
 */
export const HULL_REACH = 12;

/**
 * The same cut-off for a hull whose outline is `halfLength` long (the first boat's is 3.9, which
 * gives HULL_REACH): the farthest effect is the ring fade, a fixed distance beyond the outline.
 * The shader uses the longest hull's (one reach for every boat, so no per-boat branch is needed
 * before the cut).
 */
export const hullReach = (halfLength: number) =>
  halfLength + (HULL_REACH - FIRST_LINE.halfLength);
export const HULL_REACH_MAX = hullReach(
  Math.max(...[0, 1, 2, 3].map((tier) => boatTier(tier).waterline.halfLength)),
);

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Half the width of the waterline `u` metres ahead of the middle of the hull (the shift already
 * added): wide amidships, drawn in to a point at the bow, a little narrower at the stern, and
 * rounded off to nothing at both ends like an ellipse.
 */
export function hullHalfWidth(u: number, line: Waterline = FIRST_LINE): number {
  const { beam, halfLength, stern, tip } = line;
  const c = Math.min(halfLength, Math.max(-halfLength, u));
  const width =
    c > 0
      ? mix(beam, tip, smooth(0, halfLength, c))
      : mix(beam, stern, smooth(0, halfLength, -c));
  return width * Math.sqrt(Math.max(0, 1 - (c / halfLength) ** 2));
}

/**
 * Metres from the waterline outline (0 on and inside it) of the point `u` ahead of and `v` to
 * the side of the hull's middle (`u` already has HULL_WATER.shift added): the distance to a
 * rounded box, sideways beyond the half width and lengthways beyond the ends, so it is in metres
 * (the same along the keel as across it) and rings measured from it are the shape of the hull,
 * not a stretched ellipse. (A level set of an ellipse's r divided by its gradient was tried: it
 * is right close to the hull and badly wrong beyond the thin bow, where it left a band of
 * "close" water along the axis.)
 */
export function hullDistance(
  u: number,
  v: number,
  line: Waterline = FIRST_LINE,
): number {
  const du = Math.max(Math.abs(u) - line.halfLength, 0);
  const dv = Math.max(Math.abs(v) - hullHalfWidth(u, line), 0);
  return Math.hypot(du, dv);
}

/** The edge unit the collar and the rings are measured in. */
export const hullEdge = (u: number, v: number, line: Waterline = FIRST_LINE) =>
  hullDistance(u, v, line) * EDGE_PER_METRE;

/** How much of the rings' slope is left at an edge unit (the CPU twin of the shader's `fade`). */
export const ringFade = (edge: number) =>
  Math.exp(-edge / 3.2) *
  smooth(0, 0.5, edge) *
  (1 - smooth(RING_FADE.from, RING_FADE.to, edge));

/**
 * The widest the collar can be (m, before the gaps cut it) at a point `u` ahead of the hull's
 * middle (shift added) where the noise `lap` (0 to 1) is at its highest: the CPU twin of the
 * shader's `collarWidth`. It is the same width at the stem as the bow splash makes it, shrinks to
 * nothing `COLLAR.bow.past` metres beyond the tip, and runs on past the stern for
 * `COLLAR.stern.past` metres.
 */
export function collarWidth(
  u: number,
  lap: number,
  halfLength: number = FIRST_LINE.halfLength,
): number {
  const { side, bow, stern } = COLLAR;
  const base = mix(side.min, side.max, Math.min(1, Math.max(0, lap)));
  const toBow =
    1 + (bow.boost - 1) * smooth(halfLength - bow.span, halfLength - 0.4, u);
  const toStern =
    1 +
    (stern.boost - 1) * (1 - smooth(-halfLength, -halfLength + stern.span, u));
  // Gone past the tip of the bow, and a little beyond the stern.
  const ahead = 1 - smooth(halfLength, halfLength + bow.past, u);
  const behind = smooth(
    -halfLength - stern.past,
    -halfLength - stern.past * 0.5,
    u,
  );
  return base * toBow * toStern * ahead * behind;
}

/**
 * The collar's foam (0 to 1) at a point: the CPU twin of the shader's collar. `lap` is the ragged
 * width noise, `gap` the cut-into-pieces noise, both 0 to 1.
 */
export function collarFoam(
  u: number,
  v: number,
  lap: number,
  gap: number,
  line: Waterline = FIRST_LINE,
): number {
  const metres = hullDistance(u, v, line);
  const width = collarWidth(u, lap, line.halfLength);
  const whole = smooth(COLLAR.gaps.from, COLLAR.gaps.to, gap);
  return (
    (1 - smooth(0.02, Math.max(width, 0.03), metres)) *
    whole *
    (0.85 + 0.15 * lap)
  );
}

/**
 * The GLSL of hullEdge, taking the point in the hull's frame (u ahead, v to the side) and the
 * boat's outline (the half length, the beam, the transom's and the stem's half width, which
 * \`boatShape\` in boat-tier.ts gives per boat).
 */
export function glslHullEdge(): string {
  const f = (n: number) => n.toFixed(4);
  return `float hullEdge(float u, float v, float halfLength, float beam, float stern, float tip) {
  // Half the width of the waterline: wide amidships, drawn in to a point at the bow, a little narrower at the stern, rounded off at both ends.
  float c = clamp(u, -halfLength, halfLength);
  float hw = (c > 0.0 ? mix(beam, tip, smoothstep(0.0, halfLength, c)) : mix(beam, stern, smoothstep(0.0, halfLength, -c))) * sqrt(max(1.0 - (c * c) / (halfLength * halfLength), 0.0));
  // Metres from the outline: the distance to a rounded box.
  return length(vec2(max(abs(u) - halfLength, 0.0), max(abs(v) - hw, 0.0))) * ${f(EDGE_PER_METRE)};
}`;
}

/**
 * The GLSL of collarWidth, taking the point's `u`, the noise `lap` and the outline's half length
 * (the same maths, so the tests that measure the TypeScript measure the shader's collar).
 */
export function glslCollarWidth(): string {
  const f = (n: number) => n.toFixed(4);
  const { side, bow, stern } = COLLAR;
  return `float collarWidth(float u, float lap, float L) {
  float base = mix(${f(side.min)}, ${f(side.max)}, clamp(lap, 0.0, 1.0));
  float toBow = 1.0 + ${f(bow.boost - 1)} * smoothstep(L - ${f(bow.span)}, L - 0.4, u);
  float toStern = 1.0 + ${f(stern.boost - 1)} * (1.0 - smoothstep(-L, -L + ${f(stern.span)}, u));
  float ahead = 1.0 - smoothstep(L, L + ${f(bow.past)}, u);
  float behind = smoothstep(-L - ${f(stern.past)}, -L - ${f(stern.past * 0.5)}, u);
  return base * toBow * toStern * ahead * behind;
}`;
}
