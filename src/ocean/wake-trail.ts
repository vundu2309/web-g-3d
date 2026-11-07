/**
 * The visible wake of a boat as strips of white water laid on the sea along the path the
 * boat has just taken (pure geometry; ocean/wake-mesh.ts draws it). Three strips:
 * the churned wash behind the stern, which starts as wide as the hull and widens and
 * breaks up as it ages, and a thin arm to each side that runs back from the bow at the
 * angle of a real wake. Both follow the recorded path, so they bend with a turn instead
 * of staying straight. The foam on a strip is a noise texture fixed to the water (its
 * coordinate along the strip is the distance travelled), so it does not slide with the
 * boat, and it is cut away where the strip is faint, so it dissolves into patches.
 */
/** Seconds a point of the trail lasts. */
export const TRAIL_LIFE = 3.6;
/** Seconds between recorded points. */
export const TRAIL_STEP = 0.08;
/** Points per strip: enough for TRAIL_LIFE at TRAIL_STEP, with a margin. */
export const TRAIL_SAMPLES = 48;
export const TRAIL_STRIPS = 3;
/** How far behind the middle of the hull the wash starts (m). */
export const STERN = 2.8;
/** How far ahead of it the arms start (m): at the bow. */
export const BOW = 1.5;
/** How fast the arms spread sideways (m/s): the spread speed of a wave, as in wake.ts. */
export const ARM_SPREAD = 4.6;
/** Metres of path in one tile of the foam texture. */
export const FOAM_TILE = 5.5;

export interface TrailSample {
  x: number;
  z: number;
  t: number;
  /** Distance travelled since the trail began (m). */
  dist: number;
  /** Heading (0 is -Z, a quarter turn is +X). */
  heading: number;
  /** Speed there (m/s). */
  speed: number;
}

export class WakeTrail {
  /** Oldest first. */
  readonly samples: TrailSample[] = [];
  private travelled = 0;

  /** Records where the boat is; call it every frame (points are kept every TRAIL_STEP). */
  push(x: number, z: number, t: number) {
    const last = this.samples[this.samples.length - 1];
    if (!last || t < last.t) {
      this.restart(x, z, t);
      return;
    }
    const dt = t - last.t;
    if (dt < TRAIL_STEP) return;
    const dx = x - last.x;
    const dz = z - last.z;
    const d = Math.hypot(dx, dz);
    const speed = d / dt;
    // A jump (a boat that appeared far away, a reconnect) is not a path.
    if (speed > 40) {
      this.restart(x, z, t);
      return;
    }
    const heading = d > 0.04 ? Math.atan2(dx, -dz) : last.heading;
    this.travelled += d;
    if (this.samples.length === 1) {
      last.heading = heading;
      last.speed = speed;
    }
    this.samples.push({ x, z, t, dist: this.travelled, heading, speed });
    while (this.samples.length > 1 && t - this.samples[0]!.t > TRAIL_LIFE)
      this.samples.shift();
  }

  /** The speed of the newest point (m/s). */
  get speed() {
    return this.samples[this.samples.length - 1]?.speed ?? 0;
  }

  private restart(x: number, z: number, t: number) {
    this.samples.length = 0;
    this.travelled = 0;
    this.samples.push({ x, z, t, dist: 0, heading: 0, speed: 0 });
  }
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** Where the strips go: two vertices (left, right) per point, newest point first. */
export interface TrailGeometry {
  /** x and z of each vertex. */
  xz: Float32Array;
  /** u (across, 0 left to 1 right) and v (along the path) of each vertex. */
  uv: Float32Array;
  /** 0..1 opacity of each vertex. */
  alpha: Float32Array;
}

export const trailGeometry = (): TrailGeometry => ({
  xz: new Float32Array(TRAIL_STRIPS * TRAIL_SAMPLES * 2 * 2),
  uv: new Float32Array(TRAIL_STRIPS * TRAIL_SAMPLES * 2 * 2),
  alpha: new Float32Array(TRAIL_STRIPS * TRAIL_SAMPLES * 2),
});

/** Opacity of the wash and of an arm at an age (s), before the speed scales it. */
export const washAlpha = (age: number) =>
  smooth(0, 0.2, age) * Math.pow(1 - smooth(0.9, TRAIL_LIFE, age), 1.1);
export const armAlpha = (age: number) =>
  smooth(0.04, 0.35, age) * Math.pow(1 - smooth(0.4, TRAIL_LIFE, age), 1.3);

/** Fills `out` from the trail at time `now`. */
export function layTrail(trail: WakeTrail, now: number, out: TrailGeometry) {
  const n = trail.samples.length;
  for (let strip = 0; strip < TRAIL_STRIPS; strip++)
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      // Past the oldest point, repeat it with nothing showing.
      const sample = trail.samples[Math.max(0, n - 1 - i)];
      const at = (strip * TRAIL_SAMPLES + i) * 2;
      if (!sample) {
        for (let k = 0; k < 2; k++) {
          out.xz[at * 2 + k * 2] = 0;
          out.xz[at * 2 + k * 2 + 1] = 0;
          out.alpha[at + k] = 0;
        }
        continue;
      }
      const live = i < n;
      const age = Math.max(0, now - sample.t);
      const fx = Math.sin(sample.heading);
      const fz = -Math.cos(sample.heading);
      const rx = Math.cos(sample.heading);
      const rz = Math.sin(sample.heading);
      let cx: number;
      let cz: number;
      let half: number;
      let alpha: number;
      let v: number;
      if (strip === 0) {
        cx = sample.x - fx * STERN;
        cz = sample.z - fz * STERN;
        half = 1.2 + 0.85 * age;
        alpha = clamp((sample.speed - 1.2) / 6) * washAlpha(age);
        v = sample.dist / FOAM_TILE;
      } else {
        const side = strip === 1 ? -1 : 1;
        // The arm runs back from the bow and spreads sideways as the wave does.
        const shift = BOW - (BOW + STERN) * smooth(0, 0.5, age);
        const lateral = 1.3 + ARM_SPREAD * age;
        cx = sample.x + fx * shift + rx * side * lateral;
        cz = sample.z + fz * shift + rz * side * lateral;
        half = 0.22 + 0.32 * age;
        alpha = clamp((sample.speed - 5) / 4) * armAlpha(age) * 0.8;
        v = sample.dist / 3 + (side < 0 ? 0 : 7.7);
      }
      if (!live) alpha = 0;
      for (let k = 0; k < 2; k++) {
        const edge = k === 0 ? -1 : 1;
        out.xz[at * 2 + k * 2] = cx + rx * half * edge;
        out.xz[at * 2 + k * 2 + 1] = cz + rz * half * edge;
        out.uv[at * 2 + k * 2] = k;
        out.uv[at * 2 + k * 2 + 1] = v;
        out.alpha[at + k] = alpha;
      }
    }
}

// ----- The foam texture -----

const hash = (x: number, y: number, seed: number) => {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const wrap = (i: number, period: number) => ((i % period) + period) % period;

/** Value noise that repeats every `fu` cells across and `fv` cells along. */
function periodicNoise(
  u: number,
  v: number,
  fu: number,
  fv: number,
  seed: number,
) {
  const x = u * fu;
  const y = v * fv;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = x - ix;
  const sy = y - iy;
  const ex = sx * sx * (3 - 2 * sx);
  const ey = sy * sy * (3 - 2 * sy);
  const a = hash(wrap(ix, fu), wrap(iy, fv), seed);
  const b = hash(wrap(ix + 1, fu), wrap(iy, fv), seed);
  const c = hash(wrap(ix, fu), wrap(iy + 1, fv), seed);
  const d = hash(wrap(ix + 1, fu), wrap(iy + 1, fv), seed);
  return a + (b - a) * ex + (c - a) * ey + (a - b - c + d) * ex * ey;
}

/**
 * A square of foam noise, one byte a pixel: streaks that run along the path (long in v,
 * fine across it) with a few bubbles. Repeats along the path and across it, so it tiles.
 */
export function foamPixels(size = 128, seed = 7): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const streaks =
        periodicNoise(u, v, 6, 2, seed) * 0.5 +
        periodicNoise(u, v, 14, 4, seed + 1) * 0.3 +
        periodicNoise(u, v, 30, 8, seed + 2) * 0.2;
      const bubbles = periodicNoise(u, v, 40, 40, seed + 3);
      const n = streaks * 0.85 + bubbles * 0.15;
      out[y * size + x] = Math.round(clamp((n - 0.5) * 3.4 + 0.5) * 255);
    }
  return out;
}
