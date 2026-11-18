/**
 * The water the boats stir, simulated (pure part, no GPU, so tests can run it). A small grid of
 * water around the camera holds, in every cell, the height of the surface above the sea's own
 * waves, how fast it is rising, and how much white water floats on it. Every frame:
 *
 * - each hull pushes on the water: a moving hull lifts the water at its bow and lets it fall at
 *   its stern, in proportion to its speed (a dipole of volume, the water it parts and refills),
 *   and its propeller churns white water behind the stern;
 * - the height spreads as a wave (the wave equation at SIM_C m/s, a little damped, so the
 *   disturbance runs out from the boat and fades), which is all it takes for a boat faster than
 *   SIM_C to leave a V behind it whose half angle is asin(SIM_C / speed), for two wakes that
 *   cross to add up, and for a turn to bend the wake: none of that is written anywhere;
 * - where the surface gets steep it breaks into white water, and the white water thins out with
 *   time.
 *
 * Nothing is drawn from a recorded path or a ring: the same grid is what the water's shader
 * displaces and shades (water.ts reads it as a texture, `pack` below) and what the boats float on
 * (`sample` below, read by the physics), so what the eye sees and what the hull feels cannot
 * drift apart.
 *
 * The grid is a torus: a point of the world always lands on the same cell (its coordinates modulo
 * the size), and as the camera moves the cells that fall out of the window on one side are
 * cleared as they come in on the other, so nothing is copied or shifted. Only the middle of the
 * window is trusted (SIM_FADE_FROM to SIM_FADE_TO, see `simMask`); the edge is a sponge that eats
 * waves so none wraps round.
 */
/** Cells each way and metres in one (the window is SIM_SIZE metres across). */
export const SIM_N = 128;
export const SIM_CELL = 1;
export const SIM_SIZE = SIM_N * SIM_CELL;
/** How fast a disturbance spreads (m/s). */
export const SIM_C = 4.2;
/** The wave's own damping (1/s) and the white water's life (s). */
export const SIM_DAMP = 0.55;
export const FOAM_TAU = 5;
/** How fast white water spreads sideways (m²/s): a wash widens as it ages. */
export const FOAM_SPREAD = 0.7;
/** Longest step (s) the grid is run with; a longer frame is split. */
export const SIM_STEP = 0.04;
/** The mask: the window is trusted out to FROM (m from its middle) and not at all past TO. */
export const SIM_FADE_FROM = 0.34 * SIM_SIZE;
export const SIM_FADE_TO = 0.46 * SIM_SIZE;

/** The reach of a hull's push along and across its keel, and how far behind its middle the stern is (m). */
export const HULL_LENGTH = 3.2;
export const HULL_WIDTH = 1.2;
export const HULL_STERN = 2.8;
/** Metres of height a hull lifts per metre per second of speed, per second. */
export const HULL_PUSH = 0.6;
/** White water per second under the stern at full speed. */
export const WASH_RATE = 1.2;
/** The slope where the surface starts to break, and the white water per second a steep one makes. */
export const BREAK_SLOPE = 0.075;
export const BREAK_RATE = 2.5;
/** Below this a boat stirs nothing; from FULL it stirs the most (m/s). */
export const HULL_FROM = 1.2;
export const HULL_FULL = 9.5;

export interface Hull {
  x: number;
  z: number;
  /** 0 is -Z, a quarter turn is +X. */
  heading: number;
  /** m/s. */
  speed: number;
}

export interface SimSample {
  height: number;
  gx: number;
  gz: number;
  foam: number;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const wrap = (i: number) => ((i % SIM_N) + SIM_N) % SIM_N;
/** How many cells cell `i` is from the window's middle cell `c`, round the torus. */
const offset = (i: number, c: number) =>
  Math.abs(wrap(i - c + SIM_N / 2) - SIM_N / 2);

/** How far a hull at `speed` stirs the water, 0 to 1. */
export const hullSpeed = (speed: number) => smooth(HULL_FROM, HULL_FULL, speed);

/** 1 in the trusted middle of the window, 0 past its fade (offsets in m from the window's middle). */
export const simMask = (dx: number, dz: number) =>
  1 - smooth(SIM_FADE_FROM, SIM_FADE_TO, Math.max(Math.abs(dx), Math.abs(dz)));

export class RippleSim {
  /** Height (m), rate of rise (m/s) and white water (0 to 1) of each cell, row by row (z, then x). */
  readonly h = new Float32Array(SIM_N * SIM_N);
  readonly v = new Float32Array(SIM_N * SIM_N);
  readonly foam = new Float32Array(SIM_N * SIM_N);
  private readonly scratch = new Float32Array(SIM_N * SIM_N);
  /** The cell in the middle of the window. */
  private ci = 0;
  private cj = 0;
  private placed = false;
  /** The sponge at the edge of the window: 0 in the middle, 1 at the rim, by cells from the middle. */
  private readonly sponge = new Float32Array(SIM_N / 2 + 1);

  constructor() {
    for (let k = 0; k < this.sponge.length; k++)
      this.sponge[k] = smooth(0.3 * SIM_N, 0.5 * SIM_N, k);
  }

  /** The middle of the window (m): where the mask is centred. */
  get centreX() {
    return this.ci * SIM_CELL;
  }
  get centreZ() {
    return this.cj * SIM_CELL;
  }

  /** Slides the window to the camera at (x, z): cells that leave are cleared as they come in on the far side. */
  recentre(x: number, z: number) {
    const ni = Math.round(x / SIM_CELL);
    const nj = Math.round(z / SIM_CELL);
    if (
      !this.placed ||
      Math.abs(ni - this.ci) >= SIM_N ||
      Math.abs(nj - this.cj) >= SIM_N
    ) {
      this.h.fill(0);
      this.v.fill(0);
      this.foam.fill(0);
      this.ci = ni;
      this.cj = nj;
      this.placed = true;
      return;
    }
    // The window holds the cells from c - N/2 to c + N/2 - 1.
    while (this.ci < ni) {
      this.clearColumn(this.ci + SIM_N / 2);
      this.ci++;
    }
    while (this.ci > ni) {
      this.clearColumn(this.ci - SIM_N / 2 - 1);
      this.ci--;
    }
    while (this.cj < nj) {
      this.clearRow(this.cj + SIM_N / 2);
      this.cj++;
    }
    while (this.cj > nj) {
      this.clearRow(this.cj - SIM_N / 2 - 1);
      this.cj--;
    }
  }

  private clearColumn(cell: number) {
    const i = wrap(cell);
    for (let j = 0; j < SIM_N; j++) this.clearAt(j * SIM_N + i);
  }
  private clearRow(cell: number) {
    const row = wrap(cell) * SIM_N;
    for (let i = 0; i < SIM_N; i++) this.clearAt(row + i);
  }
  private clearAt(at: number) {
    this.h[at] = 0;
    this.v[at] = 0;
    this.foam[at] = 0;
  }

  /** Runs the water `dt` seconds with `hulls` moving through it. */
  step(dt: number, hulls: readonly Hull[]) {
    let left = Math.min(dt, 0.25);
    while (left > 1e-6) {
      const part = Math.min(left, SIM_STEP);
      this.advance(part, hulls);
      left -= part;
    }
  }

  private advance(dt: number, hulls: readonly Hull[]) {
    const { h, v, foam } = this;
    const N = SIM_N;
    for (const hull of hulls) this.push(hull, dt);
    const k = (SIM_C * SIM_C * dt) / (SIM_CELL * SIM_CELL);
    const damp = Math.exp(-SIM_DAMP * dt);
    for (let j = 0; j < N; j++) {
      const up = ((j + N - 1) % N) * N;
      const down = ((j + 1) % N) * N;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const at = row + i;
        const lap =
          h[row + ((i + N - 1) % N)]! +
          h[row + ((i + 1) % N)]! +
          h[up + i]! +
          h[down + i]! -
          4 * h[at]!;
        v[at] = (v[at]! + k * lap) * damp;
      }
    }
    // At the rim of the window the sponge eats the water, so no wave wraps round to the far side.
    const eat = 1 - Math.exp(-6 * dt);
    const fade = Math.exp(-dt / FOAM_TAU);
    const spread = (FOAM_SPREAD * dt) / (SIM_CELL * SIM_CELL);
    for (let j = 0; j < N; j++) {
      const row = j * N;
      const dj = offset(j, this.cj);
      for (let i = 0; i < N; i++) {
        const at = row + i;
        const edge = this.sponge[Math.max(offset(i, this.ci), dj)]!;
        const keep = 1 - edge * eat;
        h[at] = (h[at]! + v[at]! * dt) * keep;
        v[at] = v[at]! * keep;
        foam[at] = foam[at]! * keep;
      }
    }
    // Steep water breaks, and the white water thins out.
    for (let j = 0; j < N; j++) {
      const up = ((j + N - 1) % N) * N;
      const down = ((j + 1) % N) * N;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const at = row + i;
        const gx =
          (h[row + ((i + 1) % N)]! - h[row + ((i + N - 1) % N)]!) /
          (2 * SIM_CELL);
        const gz = (h[down + i]! - h[up + i]!) / (2 * SIM_CELL);
        const steep = Math.hypot(gx, gz);
        // The white water spreads a little (a diffusion) and thins out.
        const around =
          foam[row + ((i + N - 1) % N)]! +
          foam[row + ((i + 1) % N)]! +
          foam[up + i]! +
          foam[down + i]! -
          4 * foam[at]!;
        let f = (foam[at]! + spread * around) * fade;
        if (steep > BREAK_SLOPE)
          f += dt * BREAK_RATE * clamp((steep - BREAK_SLOPE) / 0.12);
        this.scratch[at] = f > 1 ? 1 : f < 0 ? 0 : f;
      }
    }
    foam.set(this.scratch);
  }

  /** One hull's push on the water around it for `dt` seconds. */
  private push(hull: Hull, dt: number) {
    const speedK = hullSpeed(hull.speed);
    if (speedK <= 0) return;
    const fx = Math.sin(hull.heading);
    const fz = -Math.cos(hull.heading);
    const rx = Math.cos(hull.heading);
    const rz = Math.sin(hull.heading);
    const reach = 9;
    const i0 = Math.floor((hull.x - reach) / SIM_CELL);
    const i1 = Math.floor((hull.x + reach) / SIM_CELL);
    const j0 = Math.floor((hull.z - reach) / SIM_CELL);
    const j1 = Math.floor((hull.z + reach) / SIM_CELL);
    const half = SIM_N / 2 - 2;
    const lift = HULL_PUSH * hull.speed * dt;
    const length2 = HULL_LENGTH * HULL_LENGTH;
    for (let cj = j0; cj <= j1; cj++) {
      if (Math.abs(cj - this.cj) > half) continue;
      for (let ci = i0; ci <= i1; ci++) {
        if (Math.abs(ci - this.ci) > half) continue;
        const dx = (ci + 0.5) * SIM_CELL - hull.x;
        const dz = (cj + 0.5) * SIM_CELL - hull.z;
        const along = dx * fx + dz * fz;
        const across = dx * rx + dz * rz;
        const at = wrap(cj) * SIM_N + wrap(ci);
        const lateral = (across * across) / (HULL_WIDTH * HULL_WIDTH);
        // The water the hull parts is lifted ahead of its middle and let fall behind it.
        const body = Math.exp(-(along * along) / length2 - lateral);
        this.h[at] = this.h[at]! + lift * (along / length2) * body;
        // The propeller churns white water behind the stern.
        const back = (along + HULL_STERN) / 2.2;
        const wash = Math.exp(-back * back - lateral);
        if (wash > 0.02)
          this.foam[at] = Math.min(
            1,
            this.foam[at]! + dt * WASH_RATE * speedK * wash,
          );
      }
    }
  }

  /** The surface at (x, z): its extra height, slope and white water, bilinear between the cells. */
  sample(x: number, z: number): SimSample {
    const mask = simMask(x - this.centreX, z - this.centreZ);
    if (mask <= 0) return { height: 0, gx: 0, gz: 0, foam: 0 };
    const qx = x / SIM_CELL - 0.5;
    const qz = z / SIM_CELL - 0.5;
    const ix = Math.floor(qx);
    const iz = Math.floor(qz);
    const fx = qx - ix;
    const fz = qz - iz;
    const at = (a: number, b: number) => wrap(b) * SIM_N + wrap(a);
    const bilinear = (value: (a: number, b: number) => number) =>
      (value(ix, iz) * (1 - fx) + value(ix + 1, iz) * fx) * (1 - fz) +
      (value(ix, iz + 1) * (1 - fx) + value(ix + 1, iz + 1) * fx) * fz;
    const gradX = (a: number, b: number) =>
      (this.h[at(a + 1, b)]! - this.h[at(a - 1, b)]!) / (2 * SIM_CELL);
    const gradZ = (a: number, b: number) =>
      (this.h[at(a, b + 1)]! - this.h[at(a, b - 1)]!) / (2 * SIM_CELL);
    return {
      height: bilinear((a, b) => this.h[at(a, b)]!) * mask,
      gx: bilinear(gradX) * mask,
      gz: bilinear(gradZ) * mask,
      foam: bilinear((a, b) => this.foam[at(a, b)]!) * mask,
    };
  }

  /** Writes the grid as the texture the water reads: height, slope x, slope z and white water per cell (RGBA, row by row). */
  pack(out: Float32Array) {
    const N = SIM_N;
    const { h, foam } = this;
    for (let j = 0; j < N; j++) {
      const up = ((j + N - 1) % N) * N;
      const down = ((j + 1) % N) * N;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const at = row + i;
        const o = at * 4;
        out[o] = h[at]!;
        out[o + 1] =
          (h[row + ((i + 1) % N)]! - h[row + ((i + N - 1) % N)]!) /
          (2 * SIM_CELL);
        out[o + 2] = (h[down + i]! - h[up + i]!) / (2 * SIM_CELL);
        out[o + 3] = foam[at]!;
      }
    }
  }
}

/** The grid's read in GLSL: the same bilinear read and mask as `sample`, from the packed texture. */
export function glslSim(): string {
  const f = (n: number) => n.toFixed(6);
  return `uniform highp sampler2D simMap;
uniform vec2 simCentre;
// x: extra height (m), yz: slope, w: white water.
vec4 simAt(vec2 p) {
  vec2 d = abs(p - simCentre);
  float mask = 1.0 - smoothstep(${f(SIM_FADE_FROM)}, ${f(SIM_FADE_TO)}, max(d.x, d.y));
  if (mask <= 0.0) return vec4(0.0);
  vec2 q = p / ${f(SIM_CELL)} - 0.5;
  vec2 i0 = floor(q);
  vec2 f = q - i0;
  vec4 a = texture2D(simMap, (i0 + 0.5) / ${f(SIM_N)});
  vec4 b = texture2D(simMap, (i0 + vec2(1.5, 0.5)) / ${f(SIM_N)});
  vec4 c = texture2D(simMap, (i0 + vec2(0.5, 1.5)) / ${f(SIM_N)});
  vec4 e = texture2D(simMap, (i0 + 1.5) / ${f(SIM_N)});
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y) * mask;
}`;
}
