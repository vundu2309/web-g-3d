import {
  ARM_ROOT,
  ARM_SLOPE,
  BOW,
  STERN,
  type WakeTrail,
} from "./wake-trail.ts";

/**
 * The foam buffer, pure part (no GPU, so tests can read it). The white water behind a boat is no
 * longer a ribbon laid on the sea: every boat records where it has been for FOAM_LIFE seconds
 * (a `WakeTrail` kept longer than the old strips), each recorded point drops a few round puffs of
 * foam that grow and fade as they age, and all the puffs are drawn into a small texture that
 * follows the camera (foam-buffer-pass.ts). The water's shader reads that texture and turns its
 * density into white water broken into bubbles (water.ts). So the wake bends with a turn, two
 * wakes that cross add up, a fast boat leaves more than a slow one, and nothing in it is a straight
 * line, a strip or an edge: only the density of the foam is stored, the lace comes from the
 * shader.
 *
 * Three kinds of puff: the churned WASH under and behind the stern (several, scattered across the
 * width, growing wide with age), the ARMS (one each side that the bow throws out, moving sideways
 * as the boat sails on, so they line up at the Kelvin angle on their own but stay soft and break
 * up) and the BOW puff, a short-lived burst at the stem when the boat is going fast.
 */
/** Seconds a point of a boat's foam trail is kept. */
export const FOAM_LIFE = 12;
/** Seconds between the points of a foam trail. */
export const FOAM_STEP = 0.05;
/** Puffs are tuned for a point every 0.14 s; a shorter step lays more of them, so each is weaker. */
const STEP_K = FOAM_STEP / 0.14;
/** The texture is this many texels each way and covers FOAM_WINDOW metres each way. */
export const FOAM_SIZE = 512;
export const FOAM_WINDOW = 192;
/** Metres in one texel. */
export const FOAM_TEXEL = FOAM_WINDOW / FOAM_SIZE;
/** The most puffs drawn in a frame (the rest of the oldest are dropped). */
export const FOAM_MAX = 5000;
/** Floats per puff: x, z (world, m), radius (m), strength (0 to 1), seed (0 to 1). */
export const PUFF = 5;

/** A boat slower than this leaves no foam; from FULL_SPEED it leaves the most (m/s). */
export const FOAM_FROM = 1.5;
export const FOAM_FULL = 9;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** A cheap deterministic hash in 0..1 of a number (the same puff gets the same scatter every frame). */
export const hash01 = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** How much foam a boat at `speed` churns up, 0 to 1. */
export const foamSpeed = (speed: number) => smooth(FOAM_FROM, FOAM_FULL, speed);

/**
 * The wash's strength and radius at an age: strong and narrow at the stern, wider and fainter
 * as it spreads, gone after FOAM_LIFE. `speedK` is `foamSpeed` of the boat when it was laid.
 */
export const washStrength = (age: number, speedK: number) =>
  speedK *
  0.95 *
  Math.exp(-age / 4.2) *
  (1 - smooth(FOAM_LIFE * 0.7, FOAM_LIFE, age));
export const washRadius = (age: number) => 0.85 + 0.42 * Math.pow(age, 0.92);

/** The arms' strength and radius at an age (they fade sooner and stay thinner than the wash). */
export const armStrength = (age: number, speedK: number) =>
  speedK *
  0.6 *
  Math.exp(-age / 2.4) *
  (1 - smooth(FOAM_LIFE * 0.5, FOAM_LIFE * 0.8, age));
export const armRadius = (age: number) => 0.32 + 0.1 * Math.pow(age, 0.9);

/** The bow burst: only while the point is fresh. */
export const bowStrength = (age: number, speedK: number) =>
  speedK * speedK * 0.7 * (1 - smooth(0.2, 1.6, age));

/** How much of the arms is left while the boat turns at `yaw` rad/s (none in a hard turn). */
export const armKeep = (yaw: number) => 1 - smooth(0.5, 1.2, Math.abs(yaw));

/**
 * Writes the puffs of `trails` at time `now` into `out` (PUFF floats each, oldest first within a
 * boat), keeping only those within `reach` metres of (cx, cz), and returns how many it wrote.
 */
export function foamPuffs(
  trails: Iterable<WakeTrail>,
  now: number,
  cx: number,
  cz: number,
  reach: number,
  out: Float32Array,
): number {
  let n = 0;
  const room = Math.floor(out.length / PUFF);
  const put = (
    x: number,
    z: number,
    radius: number,
    strength: number,
    seed: number,
  ) => {
    if (strength < 0.01 || n >= room) return;
    if (Math.abs(x - cx) > reach + radius || Math.abs(z - cz) > reach + radius)
      return;
    const at = n * PUFF;
    out[at] = x;
    out[at + 1] = z;
    out[at + 2] = radius;
    out[at + 3] = Math.min(1, strength);
    out[at + 4] = seed;
    n++;
  };
  for (const trail of trails) {
    const samples = trail.samples;
    const newest = samples[samples.length - 1];
    if (!newest) continue;
    for (const s of samples) {
      const age = now - s.t;
      if (age < 0 || age > FOAM_LIFE) continue;
      const speedK = foamSpeed(s.speed);
      if (speedK <= 0) continue;
      const fx = Math.sin(s.heading);
      const fz = -Math.cos(s.heading);
      // Right of the heading: heading 0 is -Z and a quarter turn is +X.
      const rx = Math.cos(s.heading);
      const rz = Math.sin(s.heading);
      const seed = hash01(s.dist * 1.7 + s.t);
      // The wash: four puffs scattered across the width of the stern, widening with age.
      const wash = washStrength(age, speedK);
      if (wash > 0.01) {
        const radius = washRadius(age);
        const spread = 0.5 + 0.3 * age;
        for (let k = 0; k < 2; k++) {
          const side = (hash01(s.dist * 3.1 + k * 17.3) - 0.5) * 2 * spread;
          const back = (hash01(s.dist * 5.3 + k * 7.9) - 0.5) * 1.2;
          put(
            s.x - fx * (STERN + back) + rx * side,
            s.z - fz * (STERN + back) + rz * side,
            radius * (0.8 + 0.4 * hash01(s.dist * 9.1 + k)),
            wash * (k === 0 ? 0.8 : 0.55),
            hash01(seed * 31 + k),
          );
        }
      }
      // The arms: one puff each side that moves out from the stem at the Kelvin slope.
      const arm = armStrength(age, speedK) * armKeep(s.yaw);
      if (arm > 0.01) {
        const behind = Math.max(0, newest.dist - s.dist);
        const out_ = ARM_ROOT + ARM_SLOPE * behind;
        const radius = armRadius(age);
        for (const side of [-1, 1]) {
          put(
            s.x + fx * BOW + rx * side * out_,
            s.z + fz * BOW + rz * side * out_,
            radius,
            arm * STEP_K * 1.6,
            hash01(seed * 17 + side),
          );
        }
      }
      // The bow burst, only on the freshest points.
      const burst = bowStrength(age, speedK);
      if (burst > 0.01)
        put(
          s.x + fx * (BOW - 0.4),
          s.z + fz * (BOW - 0.4),
          0.45 + 0.2 * age,
          burst * STEP_K * 1.2,
          seed,
        );
    }
  }
  return n;
}

/**
 * The window of the buffer for a camera at (x, z): its centre snapped to a whole texel, so the
 * foam does not shimmer as the camera moves.
 */
export function foamWindow(x: number, z: number) {
  return {
    cx: Math.round(x / FOAM_TEXEL) * FOAM_TEXEL,
    cz: Math.round(z / FOAM_TEXEL) * FOAM_TEXEL,
    size: FOAM_WINDOW,
  };
}
