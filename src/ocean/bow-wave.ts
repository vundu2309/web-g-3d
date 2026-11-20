/**
 * The bow wave of a boat that speeds up (pure geometry and rules, no Babylon; ocean/wake-mesh.ts
 * draws it, tests/bow-wave.test.mjs pins it). It is a visual only: the water mesh and the waves
 * are untouched (the boats float on exactly what is drawn); the drag the bow wave causes is in
 * boat-physics.ts.
 *
 * Two parts, both measured in the boat's own frame (`u` metres ahead of the boat, `v` metres to
 * its right):
 *  - the CREST: a sheet of foamy water lifted off the sea round the stem and back along both
 *    sides of the hull, three vertices across (the outer toe on the water, the crest, the inner
 *    edge against the planking). Its height, width and opacity grow with the speed and fall away
 *    when the boat slows, so a still boat has none and the small ripple collar of hull-water.ts
 *    is all it shows.
 *  - the SPRAY: a few droplets and puffs of mist that leave the crest above BOW_SPRAY_FROM m/s
 *    and fly up and back in a short arc. A droplet is a pure function of its index, the time and
 *    the speed, so there is no state, and the same droplet is drawn at every frame rate.
 */
import { hullHalfWidth } from "./hull-water.ts";
import { boatTier, type BoatTierSpec } from "./boat-tier.ts";

/**
 * Every function below takes the boat (boat-tier.ts: where its stem is and its waterline) as a last
 * argument, the first boat by default: a longer hull throws its bow wave from farther ahead.
 */
const FIRST: BoatTierSpec = boatTier(0);

/** How far ahead of the first boat's position the stem is (m). */
export const BOW_TIP = FIRST.bowTip;
/** Where the crest ends behind the stem along the hull (m ahead of the boat's position). */
export const CREST_TAIL = 0.3;
/** Points along the crest, from the port tail round the stem to the starboard tail (odd). */
export const CREST_POINTS = 17;
/** Vertices across the crest: outer toe, crest, inner edge. */
export const CREST_ACROSS = 3;
/** The crest has begun to rise from this speed (m/s) and is full at CREST_FULL. */
export const CREST_FROM = 1.5;
export const CREST_FULL = 9;
/** The tallest the crest gets (m above the waves) and the width of its toe (m beyond the hull). */
export const CREST_HEIGHT = 0.6;
export const CREST_TOE = 1.2;
/** Above this speed (m/s) the bow throws spray; it is at its fullest at SPRAY_FULL. */
export const BOW_SPRAY_FROM = 6;
export const SPRAY_FULL = 10;
/** Droplets in the pool (each is drawn only when the speed is high enough for its share). */
export const SPRAY_COUNT = 32;
/** Seconds a droplet flies. */
export const SPRAY_LIFE = 0.85;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const hash = (i: number, seed: number) => {
  let h = Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** How much bow wave there is at a speed along the keel, 0 (none) to 1 (full): it builds with the speed and falls back as it drops. */
export const crestLevel = (speed: number) =>
  smooth(CREST_FROM, CREST_FULL, speed);

/**
 * The shape of the crest at a speed and moment: the three vertices of each of CREST_POINTS
 * points in the boat's frame (`u` ahead, `v` to the right, `y` above the waves), an opacity for
 * each point and the foam coordinates. `phase` (seconds) churns the foam along the hull.
 */
export interface CrestGeometry {
  u: Float32Array;
  v: Float32Array;
  y: Float32Array;
  /** Opacity of each vertex, 0 to 1. */
  alpha: Float32Array;
  /** Foam texture coordinates, two per vertex. */
  uv: Float32Array;
}

export const crestGeometry = (): CrestGeometry => {
  const n = CREST_POINTS * CREST_ACROSS;
  return {
    u: new Float32Array(n),
    v: new Float32Array(n),
    y: new Float32Array(n),
    alpha: new Float32Array(n),
    uv: new Float32Array(n * 2),
  };
};

/** Index of vertex `k` (0 outer toe, 1 crest, 2 inner edge) of point `i`. */
export const crestVertex = (i: number, k: number) => i * CREST_ACROSS + k;

/** The waterline point of the crest: `s` from -1 (port tail) through 0 (the stem) to 1 (starboard tail). */
export function crestWaterline(
  s: number,
  hull: BoatTierSpec = FIRST,
): { u: number; v: number } {
  const a = Math.abs(s);
  // Most of the points sit along the sides, the stem is rounded.
  const u = hull.bowTip - (hull.bowTip - CREST_TAIL) * Math.pow(a, 0.8);
  const hw = hullHalfWidth(u - 0.2, hull.waterline) * 1.02;
  return { u, v: Math.sign(s) * hw };
}

/** Fills `out` for a boat doing `speed` m/s at time `time` (s). */
export function layCrest(
  speed: number,
  time: number,
  out: CrestGeometry,
  hull: BoatTierSpec = FIRST,
) {
  const level = crestLevel(speed);
  const height = CREST_HEIGHT * level * (0.85 + 0.15 * Math.sin(time * 5.1));
  const toe = CREST_TOE * (0.55 + 0.45 * level);
  let arc = 0;
  let last = crestWaterline(-1, hull);
  for (let i = 0; i < CREST_POINTS; i++) {
    const s = (i / (CREST_POINTS - 1)) * 2 - 1;
    const w = crestWaterline(s, hull);
    // The outward direction: the normal of the waterline there (the tangent turned a quarter),
    // pointing forward at the stem and out to the side along the hull.
    const e = crestWaterline(clamp(s + 0.02, -1, 1), hull);
    const d = crestWaterline(clamp(s - 0.02, -1, 1), hull);
    let tu = e.u - d.u;
    let tv = e.v - d.v;
    const len = Math.hypot(tu, tv) || 1;
    tu /= len;
    tv /= len;
    // Along increasing s the outline runs port -> stem -> starboard; the outside is to the left
    // of that direction when seen from above in the (u, v) plane with v to the right.
    let nu = -tv;
    let nv = tu;
    if (nu * (w.u - 1.2) + nv * w.v < 0) {
      nu = -nu;
      nv = -nv;
    }
    // Tallest at the stem and a little behind it, tapering to nothing at the tails.
    const a = Math.abs(s);
    const body = 1 - smooth(0.25, 1, a);
    const peak = height * (0.25 + 0.75 * body);
    // A short push forward of the whole crest, so the water is shoved ahead of the stem.
    const push = 0.25 * level * body;
    arc += Math.hypot(w.u - last.u, w.v - last.v);
    last = w;
    const offsets = [toe * (0.35 + 0.65 * body), toe * 0.4 * (0.4 + body), 0];
    const heights = [0.0, peak, peak * 0.7];
    // Opacity: strong at the stem, fading to nothing at the tails and at the outer toe.
    const base = smooth(CREST_FROM, 4, speed) * (0.45 + 0.6 * body);
    const tail = 1 - smooth(0.8, 1, a);
    for (let k = 0; k < CREST_ACROSS; k++) {
      const at = crestVertex(i, k);
      out.u[at] = w.u + nu * offsets[k]! + push;
      out.v[at] = w.v + nv * offsets[k]!;
      out.y[at] = heights[k]!;
      out.alpha[at] = Math.min(1, base * tail);
      // Foam: across in metres from the crest line, along the outline, flowing back as time passes.
      out.uv[at * 2] = 0.13 + (offsets[k]! - offsets[1]!) / 5.5;
      out.uv[at * 2 + 1] = arc / 5.5 + 0.37 - time * 0.45 * (0.3 + level);
    }
  }
}

/** One droplet of spray in the boat's frame. */
export interface Droplet {
  u: number;
  v: number;
  y: number;
  /** Half the side of its square sprite (m). */
  size: number;
  /** 0 to 1. */
  alpha: number;
}

/** Whether the pool's droplet `i` is in use at this speed: the faster the boat, the more of the pool flies. */
export const dropletActive = (i: number, speed: number) =>
  hash(i, 3) < smooth(BOW_SPRAY_FROM - 0.4, SPRAY_FULL, speed) * 0.95;

/** Droplet `i` (0 to SPRAY_COUNT - 1) at time `time` (s) for a boat doing `speed` m/s. */
export function dropletAt(
  i: number,
  time: number,
  speed: number,
  hull: BoatTierSpec = FIRST,
): Droplet {
  const mist = hash(i, 11) < 0.2;
  const life = SPRAY_LIFE * (mist ? 1.35 : 1);
  const rate = 0.9 + hash(i, 5) * 0.7;
  const age = ((time * rate + hash(i, 7)) % 1) * life;
  const side = hash(i, 9) < 0.5 ? -1 : 1;
  const fast = clamp((speed - BOW_SPRAY_FROM) / (SPRAY_FULL - BOW_SPRAY_FROM));
  // Leaves the crest a little behind the stem, on the side it is thrown to.
  const u0 = hull.bowTip - 0.4 - hash(i, 13) * 1.6;
  const hw = hullHalfWidth(u0 - 0.2, hull.waterline);
  // Water that has left the boat stays where it was thrown: it falls behind the bow at the boat's
  // speed (less the push it was given forward).
  const u = u0 - (speed - 1.5) * 0.55 * age;
  // Never above the deck: beside the hull wherever the droplet has drifted to.
  const lateral = hw + 0.3 + (2.2 + hash(i, 17) * 2.6) * age;
  const v =
    side * Math.max(lateral, hullHalfWidth(u - 0.2, hull.waterline) + 0.35);
  const lift = 2.6 + 2.2 * fast + hash(i, 19) * 1.4;
  const y = 0.35 + lift * age - 4.9 * age * age;
  const t = age / life;
  const fade = smooth(0, 0.08, t) * (1 - smooth(0.55, 1, t));
  return {
    u,
    v,
    y: Math.max(0.05, y),
    size: mist ? 0.45 + hash(i, 23) * 0.4 : 0.14 + hash(i, 29) * 0.14,
    alpha: fade * (mist ? 0.4 : 1) * (dropletActive(i, speed) ? 1 : 0),
  };
}
