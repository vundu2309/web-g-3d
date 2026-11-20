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
import { boatTier, hullSamples } from "./boat-tier.ts";

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

/**
 * The reach of a hull's push along and across its keel, and how far behind its middle the stern is
 * (m): the first boat's. The boats of the upgrade shop push farther (boat-tier.ts `wake`), and a
 * hull says which boat it is with `tier`.
 */
export const HULL_LENGTH = boatTier(0).wake.length;
export const HULL_WIDTH = boatTier(0).wake.width;
export const HULL_STERN = boatTier(0).wake.stern;
/** Metres of height a hull lifts per metre per second of speed, per second (all its points together). */
export const HULL_PUSH = 0.6;
/** White water per second under the stern at full speed. */
export const WASH_RATE = 2;
/** The slope where the surface starts to break, and the white water per second a steep one makes. */
export const BREAK_SLOPE = 0.075;
export const BREAK_RATE = 2.5;
/** Below this a boat stirs nothing; from FULL it stirs the most (m/s). */
export const HULL_FROM = 1.2;
export const HULL_FULL = 9.5;

/**
 * The hull as the water feels it: points on the bottom of the hull (stern, midship and bow on each
 * side, the same six the boat floats on, in the hull's own axes: x to starboard, z toward the stern).
 */
export const HULL_POINTS: readonly (readonly [number, number])[] = [
  -1, 1,
].flatMap((side) => [3, 0, -3].map((z) => [side * 1.1, z] as const));
/**
 * The six points' pushes cancel between the two ends of the hull (the water ahead of one point is
 * the water behind the next), so together they lift less than one dipole of the hull's whole
 * length did; this brings the wake back to the size it had.
 */
export const POINT_GAIN = 3;
/** How many times more water a point pushes per m/s across the keel than along it. */
export const SIDE_PUSH = 2.5;
/** How far one point's push reaches along its own motion and across it (m). */
export const POINT_LENGTH = 1.9;
export const POINT_WIDTH = 1.0;
/**
 * Height the water gains per metre a hull sinks into it (a rising hull draws water in): the
 * volume of the section's footprint spread over the cells round it. The hull's vertical speed
 * is the one relative to the sea's own waves (a hull riding a wave displaces nothing more).
 */
export const HEAVE_PUSH = 0.35;
/** How far a point's sinking or rising spreads (m), and the fastest vertical speed counted (m/s). */
export const HEAVE_REACH = 1.5;
export const HEAVE_MAX = 4;
/** White water a point throws up per second when it plunges faster than SLAM_FROM (m/s). */
export const SLAM_FROM = 1;
export const SLAM_FOAM = 0.9;

/** One point of the hull: where it is, how it moves (m/s) and how deep in the water it is. */
export interface HullPoint {
  x: number;
  z: number;
  /** Horizontal velocity of the point (m/s), the turn of the hull and its slide included. */
  vx: number;
  vz: number;
  /** Vertical velocity relative to the sea's own waves (m/s): negative while it sinks into the water. */
  vy: number;
  /** 0 out of the water, 1 well in it. */
  wet: number;
}

export interface Hull {
  x: number;
  z: number;
  /** 0 is -Z, a quarter turn is +X. */
  heading: number;
  /** m/s. */
  speed: number;
  /**
   * The motion of the hull's points when it is known (your own boat, from the physics). Without
   * it the points are those of a hull moving straight at `speed` on a level keel, which is all
   * the game knows of another player's boat.
   */
  points?: readonly HullPoint[];
  /** Which boat it is (boat-tier.ts, 0 to 3); the first boat when not given. */
  tier?: number;
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

/** The points of a hull that only has a pose and a speed: moving straight along its keel, not heaving. */
export function pointsOf(hull: Hull): readonly HullPoint[] {
  if (hull.points) return hull.points;
  const fx = Math.sin(hull.heading);
  const fz = -Math.cos(hull.heading);
  const rx = Math.cos(hull.heading);
  const rz = Math.sin(hull.heading);
  return hullSamples(hull.tier).map(({ x: lx, z: lz }) => ({
    x: hull.x + rx * lx - fx * lz,
    z: hull.z + rz * lx - fz * lz,
    vx: fx * hull.speed,
    vz: fz * hull.speed,
    vy: 0,
    wet: 1,
  }));
}

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
    const points = pointsOf(hull);
    const share = POINT_GAIN / HULL_POINTS.length;
    for (const point of points) this.pushPoint(point, hull.heading, share, dt);
    // The propeller churns white water behind the stern, whatever the points do.
    // A propeller lifted out of the water churns nothing: the wash goes with how wet the hull is.
    let wet = 0;
    for (const point of points) wet += point.wet;
    const speedK = (hullSpeed(hull.speed) * wet) / points.length;
    if (speedK <= 0) return;
    const fx = Math.sin(hull.heading);
    const fz = -Math.cos(hull.heading);
    const rx = Math.cos(hull.heading);
    const rz = Math.sin(hull.heading);
    const { wake } = boatTier(hull.tier);
    const reach = wake.reach;
    const i0 = Math.floor((hull.x - reach) / SIM_CELL);
    const i1 = Math.floor((hull.x + reach) / SIM_CELL);
    const j0 = Math.floor((hull.z - reach) / SIM_CELL);
    const j1 = Math.floor((hull.z + reach) / SIM_CELL);
    const half = SIM_N / 2 - 2;
    for (let cj = j0; cj <= j1; cj++) {
      if (Math.abs(cj - this.cj) > half) continue;
      for (let ci = i0; ci <= i1; ci++) {
        if (Math.abs(ci - this.ci) > half) continue;
        const dx = (ci + 0.5) * SIM_CELL - hull.x;
        const dz = (cj + 0.5) * SIM_CELL - hull.z;
        const along = dx * fx + dz * fz;
        const across = dx * rx + dz * rz;
        const at = wrap(cj) * SIM_N + wrap(ci);
        const lateral = (across * across) / (wake.width * wake.width);
        const back = (along + wake.stern) / 2.2;
        const wash = Math.exp(-back * back - lateral);
        if (wash > 0.02)
          this.foam[at] = Math.min(
            1,
            this.foam[at]! + dt * WASH_RATE * speedK * wash,
          );
      }
    }
  }

  /**
   * One point of a hull. Two things move the water: the point sliding through it (the water it
   * parts is lifted ahead of the point along its motion and let fall behind it, so a hull that
   * turns on the spot or slides sideways pushes the water too, not only one that goes ahead) and
   * the point sinking into it or rising out of it (the volume it takes up spreads round it and
   * rings out as waves; a hull rising draws the water in). Both go with how wet the point is.
   */
  private pushPoint(
    point: HullPoint,
    heading: number,
    share: number,
    dt: number,
  ) {
    if (point.wet <= 0) return;
    const speed = Math.hypot(point.vx, point.vz);
    const slide = hullSpeed(speed) > 0;
    // The hull's side is a long wall (the draft along the whole length) and its bow a narrow
    // wedge: the same speed across the keel pushes SIDE_PUSH times more water than along it.
    const along = point.vx * Math.sin(heading) - point.vz * Math.cos(heading);
    const across = point.vx * Math.cos(heading) + point.vz * Math.sin(heading);
    const push = Math.hypot(along, SIDE_PUSH * across);
    const sink = -Math.max(-HEAVE_MAX, Math.min(HEAVE_MAX, point.vy));
    if (!slide && Math.abs(sink) < 1e-4) return;
    const ux = slide ? point.vx / speed : 0;
    const uz = slide ? point.vz / speed : 0;
    const reach = Math.ceil(2.5 * Math.max(POINT_LENGTH, HEAVE_REACH));
    const i0 = Math.floor((point.x - reach) / SIM_CELL);
    const i1 = Math.floor((point.x + reach) / SIM_CELL);
    const j0 = Math.floor((point.z - reach) / SIM_CELL);
    const j1 = Math.floor((point.z + reach) / SIM_CELL);
    const half = SIM_N / 2 - 2;
    const lift = slide ? HULL_PUSH * share * push * point.wet * dt : 0;
    const heave = HEAVE_PUSH * sink * point.wet * dt;
    const slam =
      sink > SLAM_FROM ? SLAM_FOAM * (sink - SLAM_FROM) * point.wet * dt : 0;
    const length2 = POINT_LENGTH * POINT_LENGTH;
    const width2 = POINT_WIDTH * POINT_WIDTH;
    const reach2 = HEAVE_REACH * HEAVE_REACH;
    for (let cj = j0; cj <= j1; cj++) {
      if (Math.abs(cj - this.cj) > half) continue;
      for (let ci = i0; ci <= i1; ci++) {
        if (Math.abs(ci - this.ci) > half) continue;
        const dx = (ci + 0.5) * SIM_CELL - point.x;
        const dz = (cj + 0.5) * SIM_CELL - point.z;
        const at = wrap(cj) * SIM_N + wrap(ci);
        let add = 0;
        if (slide) {
          const along = dx * ux + dz * uz;
          const across = dx * -uz + dz * ux;
          add +=
            lift *
            (along / length2) *
            Math.exp(-(along * along) / length2 - (across * across) / width2);
        }
        const near = Math.exp(-(dx * dx + dz * dz) / reach2);
        add += heave * near;
        this.h[at] = this.h[at]! + add;
        if (slam > 0) this.foam[at] = Math.min(1, this.foam[at]! + slam * near);
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
