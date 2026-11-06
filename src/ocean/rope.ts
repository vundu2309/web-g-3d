/**
 * The fishing line as a rope: a chain of points pulled by gravity and held at a fixed
 * length between the rod tip and the fish (position-based, Verlet). It hangs in a curve
 * when there is slack and straightens when the line is taut, with nothing scripted.
 * Pure maths; ocean/fishing-gear.ts draws it.
 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const STEP = 1 / 60;

export class Rope {
  readonly count: number;
  /** x, y, z of every point, in order from the rod to the fish. */
  readonly positions: Float64Array;
  private readonly previous: Float64Array;
  private carry = 0;

  constructor(count = 22) {
    this.count = count;
    this.positions = new Float64Array(count * 3);
    this.previous = new Float64Array(count * 3);
  }

  /** Lays the rope straight between two points, at rest. */
  reset(a: Point3, b: Point3) {
    for (let i = 0; i < this.count; i++) {
      const t = i / (this.count - 1);
      this.positions[i * 3] = a.x + (b.x - a.x) * t;
      this.positions[i * 3 + 1] = a.y + (b.y - a.y) * t;
      this.positions[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    this.previous.set(this.positions);
  }

  /**
   * Advances `seconds` with both ends held at `a` and `b`. `length` is how much line
   * there is: more than the distance between the ends and the rope sags, equal and it
   * is straight. `floor` keeps the rope above the sea.
   */
  step(
    seconds: number,
    a: Point3,
    b: Point3,
    length: number,
    floor?: (x: number, z: number) => number,
  ) {
    this.carry += Math.min(0.1, Math.max(0, seconds));
    while (this.carry >= STEP) {
      this.carry -= STEP;
      this.substep(a, b, length, floor);
    }
    // Between steps the ends follow the rod and the fish exactly.
    this.pin(a, b);
  }

  private pin(a: Point3, b: Point3) {
    const last = (this.count - 1) * 3;
    this.positions[0] = a.x;
    this.positions[1] = a.y;
    this.positions[2] = a.z;
    this.positions[last] = b.x;
    this.positions[last + 1] = b.y;
    this.positions[last + 2] = b.z;
  }

  private substep(
    a: Point3,
    b: Point3,
    length: number,
    floor?: (x: number, z: number) => number,
  ) {
    const p = this.positions;
    const q = this.previous;
    // Tension swamps the weight of a taut line, so gravity only matters with slack:
    // it counts in full once there is 0.6 m of spare line, and not at all with none.
    const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1e-9;
    const slack = Math.min(1, Math.max(0, (length - span) / 0.6));
    const gravity = 9.8 * STEP * STEP * slack;
    for (let i = 1; i < this.count - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const at = i * 3 + k;
        const velocity = (p[at]! - q[at]!) * 0.97;
        q[at] = p[at]!;
        p[at] = p[at]! + velocity - (k === 1 ? gravity : 0);
      }
    }
    this.pin(a, b);
    const piece = length / (this.count - 1);
    for (let pass = 0; pass < 28; pass++) {
      for (let n = 0; n < this.count - 1; n++) {
        // Sweep one way, then the other, so the correction reaches the whole chain.
        const i = pass % 2 === 0 ? n : this.count - 2 - n;
        const j = i + 1;
        const dx = p[j * 3]! - p[i * 3]!;
        const dy = p[j * 3 + 1]! - p[i * 3 + 1]!;
        const dz = p[j * 3 + 2]! - p[i * 3 + 2]!;
        const size = Math.hypot(dx, dy, dz) || 1e-9;
        // A rope resists stretching but is free to fold up when the ends come closer.
        const error = (size - piece) / size;
        if (error <= 0) continue;
        const iFree = i > 0 ? 0.5 : 0;
        const jFree = j < this.count - 1 ? 0.5 : 0;
        const total = iFree + jFree || 1;
        const fi = iFree / total;
        const fj = jFree / total;
        p[i * 3] = p[i * 3]! + dx * error * fi;
        p[i * 3 + 1] = p[i * 3 + 1]! + dy * error * fi;
        p[i * 3 + 2] = p[i * 3 + 2]! + dz * error * fi;
        p[j * 3] = p[j * 3]! - dx * error * fj;
        p[j * 3 + 1] = p[j * 3 + 1]! - dy * error * fj;
        p[j * 3 + 2] = p[j * 3 + 2]! - dz * error * fj;
      }
      this.pin(a, b);
    }
    if (floor)
      for (let i = 1; i < this.count - 1; i++) {
        const low = floor(p[i * 3]!, p[i * 3 + 2]!) + 0.04;
        if (p[i * 3 + 1]! < low) p[i * 3 + 1] = low;
      }
  }

  /** Total length of the rope as drawn (how taut it is: near `length` when slack). */
  drawnLength(): number {
    let sum = 0;
    for (let i = 0; i < this.count - 1; i++)
      sum += Math.hypot(
        this.positions[i * 3 + 3]! - this.positions[i * 3]!,
        this.positions[i * 3 + 4]! - this.positions[i * 3 + 1]!,
        this.positions[i * 3 + 5]! - this.positions[i * 3 + 2]!,
      );
    return sum;
  }
}

/**
 * Vertices of a flat strip along the rope that always faces the viewer, so the line has
 * a width (a GL line is one pixel and vanishes at a distance). Two vertices per point:
 * out[6i..6i+2] and out[6i+3..6i+5]. The strip is wider the farther it is, in proportion,
 * between a thin cord up close and a still-visible line far away.
 */
export function ribbonPositions(
  points: readonly Point3[],
  eye: Point3,
  out: Float32Array,
  widthPerMetre = 0.005,
  minWidth = 0.035,
  maxWidth = 0.4,
): Float32Array {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const tz = b.z - a.z;
    const ex = eye.x - p.x;
    const ey = eye.y - p.y;
    const ez = eye.z - p.z;
    // Sideways = tangent x toward-the-viewer.
    let sx = ty * ez - tz * ey;
    let sy = tz * ex - tx * ez;
    let sz = tx * ey - ty * ex;
    const size = Math.hypot(sx, sy, sz) || 1;
    const dist = Math.hypot(ex, ey, ez);
    const half =
      Math.min(maxWidth, Math.max(minWidth, dist * widthPerMetre)) / 2;
    sx = (sx / size) * half;
    sy = (sy / size) * half;
    sz = (sz / size) * half;
    out[i * 6] = p.x - sx;
    out[i * 6 + 1] = p.y - sy;
    out[i * 6 + 2] = p.z - sz;
    out[i * 6 + 3] = p.x + sx;
    out[i * 6 + 4] = p.y + sy;
    out[i * 6 + 5] = p.z + sz;
  }
  return out;
}

/**
 * Smooths a rope for drawing: each inner point moves toward the average of its
 * neighbours, a few times, with both ends left where they are. It takes the saw-tooth
 * out of a rope whose ends bob on the waves while it has hardly any slack, and keeps the
 * curve.
 */
export function smoothRope(
  positions: ArrayLike<number>,
  out: Float64Array,
  passes = 3,
): Float64Array {
  const count = positions.length / 3;
  for (let i = 0; i < positions.length; i++) out[i] = positions[i]!;
  for (let pass = 0; pass < passes; pass++)
    for (let i = 1; i < count - 1; i++)
      for (let k = 0; k < 3; k++)
        out[i * 3 + k] =
          (out[(i - 1) * 3 + k]! +
            2 * out[i * 3 + k]! +
            out[(i + 1) * 3 + k]!) /
          4;
  return out;
}
