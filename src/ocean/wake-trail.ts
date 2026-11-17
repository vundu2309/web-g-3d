/**
 * The visible wake of a boat as strips of white water laid on the sea along the path the
 * boat has just taken (pure geometry; ocean/wake-mesh.ts draws it). Three strips:
 * the churned wash behind the stern, which starts as wide as the hull and widens and
 * breaks up as it ages, and a thin arm to each side that runs back from the bow at the
 * angle of a real wake. Both follow the recorded path, so they bend with a turn instead
 * of staying straight. The foam on a strip is a noise texture fixed to the water (its
 * coordinate along the strip is the distance travelled, across it the metres from the
 * strip's middle), so it does not slide with the boat or stretch as the strip widens; the
 * shader cuts it away where the strip is faint, so it dissolves into soft patches.
 *
 * Every strip ends in nothing: its opacity is 0 at the end of its life, 0 where the trail
 * began (the first points taper in, so a boat that has just set off does not leave a strip
 * with a hard end), and the arms fade out in a turn, where a Kelvin V cannot exist (the
 * inner arm would sweep through the middle of the turn and the outer one draw a closed loop).
 */
/** Seconds a point of the trail lasts. */
export const TRAIL_LIFE = 3.6;
/** Seconds between recorded points. */
export const TRAIL_STEP = 0.08;
/** Points per strip: enough for TRAIL_LIFE at TRAIL_STEP, with a margin. */
export const TRAIL_SAMPLES = 48;
export const TRAIL_STRIPS = 3;
/** Vertices across a strip: the edges and the middle, so the strip can follow the waves under it. */
export const TRAIL_ACROSS = 3;
/** Seconds over which the first points of a new trail fade in (the trail never starts with a hard end). */
export const START_TAPER = 0.5;
/** How far behind the middle of the hull the wash starts (m). */
export const STERN = 2.8;
/** How far ahead of the boat's position the arms start (m): the stem (as in bow-wave.ts). */
export const BOW = 3.7;
/** The half angle of a Kelvin wake: asin(1/3), 19.47 degrees, whatever the speed. */
export const KELVIN_HALF_ANGLE = Math.asin(1 / 3);
/** Metres an arm moves sideways for each metre the boat has sailed since it was laid. */
export const ARM_SLOPE = Math.tan(KELVIN_HALF_ANGLE);
/** How far from the keel the arms start, at the stem (m). */
export const ARM_ROOT = 0.45;
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
  /** How fast the heading changes there (rad/s, positive turning right), smoothed. */
  yaw: number;
}

const TAU = Math.PI * 2;
const wrapAngle = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

export class WakeTrail {
  /** Oldest first. */
  readonly samples: TrailSample[] = [];
  private travelled = 0;
  private readonly life: number;
  private readonly step: number;

  /** `life` is how long a point is kept (s) and `step` the time between points (s). */
  constructor(life = TRAIL_LIFE, step = TRAIL_STEP) {
    this.life = life;
    this.step = step;
  }

  /** Records where the boat is; call it every frame (points are kept every TRAIL_STEP). */
  push(x: number, z: number, t: number) {
    const last = this.samples[this.samples.length - 1];
    if (!last || t < last.t) {
      this.restart(x, z, t);
      return;
    }
    const dt = t - last.t;
    if (dt < this.step) return;
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
    const raw = wrapAngle(heading - last.heading) / dt;
    // Smoothed, and not trusted at a crawl (where the heading is noise).
    const yaw = speed > 1 ? last.yaw * 0.5 + raw * 0.5 : last.yaw * 0.5;
    this.travelled += d;
    if (this.samples.length === 1) {
      last.heading = heading;
      last.speed = speed;
    }
    this.samples.push({
      x,
      z,
      t,
      dist: this.travelled,
      heading,
      speed,
      yaw,
    });
    while (this.samples.length > 1 && t - this.samples[0]!.t > this.life)
      this.samples.shift();
  }

  /** The speed of the newest point (m/s). */
  get speed() {
    return this.samples[this.samples.length - 1]?.speed ?? 0;
  }

  private restart(x: number, z: number, t: number) {
    this.samples.length = 0;
    this.travelled = 0;
    this.samples.push({ x, z, t, dist: 0, heading: 0, speed: 0, yaw: 0 });
  }
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * Where the strips go: TRAIL_ACROSS vertices (left edge, middle, right edge) per point, newest
 * point first, the strips one after the other.
 */
export interface TrailGeometry {
  /** x and z of each vertex. */
  xz: Float32Array;
  /** u (across, in tiles of the foam texture from the strip's middle) and v (along the path) of each vertex. */
  uv: Float32Array;
  /** 0..1 opacity of each vertex. */
  alpha: Float32Array;
  /** 0 at the left edge, 1 at the right edge (fixed: the shader fades the strip's sides with it). */
  across: Float32Array;
}

/** Index of the vertex `k` (0 left .. TRAIL_ACROSS - 1 right) of point `i` of strip `strip`. */
export const vertexAt = (strip: number, i: number, k: number) =>
  (strip * TRAIL_SAMPLES + i) * TRAIL_ACROSS + k;

export const trailGeometry = (): TrailGeometry => {
  const vertices = TRAIL_STRIPS * TRAIL_SAMPLES * TRAIL_ACROSS;
  const across = new Float32Array(vertices);
  for (let v = 0; v < vertices; v++)
    across[v] = (v % TRAIL_ACROSS) / (TRAIL_ACROSS - 1);
  return {
    xz: new Float32Array(vertices * 2),
    uv: new Float32Array(vertices * 2),
    alpha: new Float32Array(vertices),
    across,
  };
};

/** Opacity of the wash and of an arm at an age (s), before the speed scales it. */
export const washAlpha = (age: number) =>
  smooth(0, 0.2, age) * Math.pow(1 - smooth(1.2, TRAIL_LIFE, age), 1.1);
export const armAlpha = (age: number) =>
  smooth(0.04, 0.3, age) * Math.pow(1 - smooth(1.0, TRAIL_LIFE, age), 1.2);

/**
 * How the white core behind the stern varies along the path (a pure function of the distance
 * travelled, so it is fixed to the water): its width as a factor of the base width, and its
 * opacity as a factor. Slow, unequal waves, so the core swells and pinches and thins out in
 * patches instead of being a ruler-straight ribbon.
 */
export const coreWidth = (dist: number) =>
  1 + 0.15 * Math.sin(dist * 0.9) + 0.09 * Math.sin(dist * 2.3 + 1.1);
export const coreDensity = (dist: number) =>
  0.86 + 0.14 * Math.sin(dist * 1.7 + 0.6) + 0.06 * Math.sin(dist * 4.1);

/**
 * How much of an arm is left once the boat has turned `turned` radians since it was laid, and
 * while it turns at `yaw` rad/s: none in a hard turn, where the arms would cross themselves.
 */
export const armKeep = (turned: number, yaw: number) =>
  (1 - smooth(0.3, 1.1, Math.abs(turned))) *
  (1 - smooth(0.6, 1.4, Math.abs(yaw)));

/** Half the width of the wash at an age and turn radius: it never grows wider than the turn can hold. */
export const washHalfWidth = (age: number, radius: number) =>
  Math.min(1.2 + 0.85 * age, Math.max(1.3, 0.7 * radius));

/** Fills `out` from the trail at time `now`. */
export function layTrail(trail: WakeTrail, now: number, out: TrailGeometry) {
  const n = trail.samples.length;
  const first = trail.samples[0];
  const newest = trail.samples[n - 1];
  for (let strip = 0; strip < TRAIL_STRIPS; strip++)
    for (let i = 0; i < TRAIL_SAMPLES; i++) {
      // Past the oldest point, repeat it with nothing showing.
      const sample = trail.samples[Math.max(0, n - 1 - i)];
      const at = vertexAt(strip, i, 0);
      if (!sample || !first || !newest) {
        for (let k = 0; k < TRAIL_ACROSS; k++) {
          out.xz[(at + k) * 2] = 0;
          out.xz[(at + k) * 2 + 1] = 0;
          out.uv[(at + k) * 2] = 0;
          out.uv[(at + k) * 2 + 1] = 0;
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
      // The trail's own start tapers in, so it never ends in a hard cut.
      const taper = smooth(0, START_TAPER, sample.t - first.t);
      let cx: number;
      let cz: number;
      let half: number;
      let alpha: number;
      let v: number;
      let u0: number;
      if (strip === 0) {
        cx = sample.x - fx * STERN;
        cz = sample.z - fz * STERN;
        const radius = sample.speed / Math.max(Math.abs(sample.yaw), 0.05);
        // The core swells and pinches along the path, never wider than the turn holds.
        half = Math.min(
          washHalfWidth(age, radius) * coreWidth(sample.dist),
          Math.max(1.3, 0.7 * radius),
        );
        alpha =
          clamp((sample.speed - 1.2) / 6) *
          washAlpha(age) *
          0.95 *
          coreDensity(sample.dist) *
          taper;
        v = sample.dist / FOAM_TILE;
        u0 = 0;
      } else {
        const side = strip === 1 ? -1 : 1;
        // The arm leaves the stem and, for every metre the boat has sailed since, moves ARM_SLOPE
        // metres to the side: a straight line at the Kelvin half angle behind a boat that keeps
        // its course, and the path's own curve when it turns.
        const sailed = newest.dist - sample.dist;
        const lateral = ARM_ROOT + ARM_SLOPE * sailed;
        cx = sample.x + fx * BOW + rx * side * lateral;
        cz = sample.z + fz * BOW + rz * side * lateral;
        // A band that thickens as the foam piles up along it.
        half = 0.3 + 0.075 * sailed;
        const turned = wrapAngle(newest.heading - sample.heading);
        alpha =
          clamp((sample.speed - 4.5) / 3.5) *
          armAlpha(age) *
          0.9 *
          taper *
          armKeep(turned, sample.yaw);
        v = sample.dist / FOAM_TILE + (side < 0 ? 0.31 : 0.67);
        u0 = side < 0 ? 0.37 : 0.71;
      }
      if (!live) alpha = 0;
      for (let k = 0; k < TRAIL_ACROSS; k++) {
        const edge = (k / (TRAIL_ACROSS - 1)) * 2 - 1;
        out.xz[(at + k) * 2] = cx + rx * half * edge;
        out.xz[(at + k) * 2 + 1] = cz + rz * half * edge;
        out.uv[(at + k) * 2] = u0 + (half * edge) / FOAM_TILE;
        out.uv[(at + k) * 2 + 1] = v;
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

/**
 * Gradient (Perlin) noise that repeats every `fu` cells across and `fv` cells along, about
 * -1..1. Unlike value noise it has no flat plateaus at the lattice points, so thresholding it
 * gives round soft blobs instead of boxes with straight steps.
 */
function periodicGradientNoise(
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
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    const angle = hash(wrap(cx, fu), wrap(cy, fv), seed) * TAU;
    return Math.cos(angle) * dx + Math.sin(angle) * dy;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const ex = fade(sx);
  const ey = fade(sy);
  const a = corner(ix, iy, sx, sy);
  const b = corner(ix + 1, iy, sx - 1, sy);
  const c = corner(ix, iy + 1, sx, sy - 1);
  const d = corner(ix + 1, iy + 1, sx - 1, sy - 1);
  return (a + (b - a) * ex + (c - a) * ey + (a - b - c + d) * ex * ey) * 1.41;
}

/**
 * A square of foam noise, one byte a pixel: soft blobs and wisps that run along the path (long
 * in v), four octaves of gradient noise bent by a slow warp, squeezed through tanh instead of
 * a clamp so there are no flat white or black plateaus. The smallest feature is four pixels, so
 * the filtered texture stays smooth when it is magnified. Repeats along the path and across it.
 */
export function foamPixels(size = 128, seed = 7): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u0 = x / size;
      const v0 = y / size;
      const u = u0 + periodicGradientNoise(u0, v0, 2, 2, seed + 9) * 0.05;
      const v = v0 + periodicGradientNoise(u0, v0, 2, 2, seed + 10) * 0.05;
      const n =
        periodicGradientNoise(u, v, 6, 3, seed) * 0.5 +
        periodicGradientNoise(u, v, 12, 6, seed + 1) * 0.3 +
        periodicGradientNoise(u, v, 20, 10, seed + 2) * 0.15 +
        periodicGradientNoise(u, v, 32, 16, seed + 3) * 0.08;
      out[y * size + x] = Math.round((0.5 + 0.5 * Math.tanh(n * 2.8)) * 255);
    }
  return out;
}
