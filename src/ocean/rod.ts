/**
 * The rod as a spring: a pull on the tip (a fish, the weight of a catch) bends it, it
 * springs back and rings a little when the pull stops, and a fish that thrashes shakes
 * it. Pure maths in the boat's own axes; ocean/rod-visual.ts draws it. The tip position
 * it reports is where the line starts, so the line and the rod always agree.
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Where the rod is held and how it points at rest (boat axes: +X starboard, +Y up). */
export const ROD_BASE: V3 = { x: 1.25, y: 1.35, z: 2.52 };
export const ROD_LENGTH = 3.7;
/** Angle from the vertical, leaning out to starboard (rad). */
export const ROD_LEAN = 0.95;

const AXIS: V3 = { x: Math.sin(ROD_LEAN), y: Math.cos(ROD_LEAN), z: 0 };
/** Natural frequency about 2 Hz; lightly damped so it rings a few times. */
const STIFFNESS = 160;
const DAMPING = 3.2;
/** How far a full pull (1) bends the tip when held steady (m). */
const FULL_BEND = 1.35;
/** The tip never moves farther than this from rest (m). */
const MAX_BEND = 1.8;

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: V3) => Math.hypot(a.x, a.y, a.z);

export class RodSim {
  /** Tip offset from rest, perpendicular to the rod. */
  private offset: V3 = { x: 0, y: 0, z: 0 };
  private speed: V3 = { x: 0, y: 0, z: 0 };
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /** How far the rod is bent, 0 (straight) to 1 (as far as it goes). */
  get bend() {
    return Math.min(1, length(this.offset) / MAX_BEND);
  }

  /**
   * Advances `seconds`. `pull` is the force on the tip in boat axes (about 0..1 for a
   * fish, 1 being a hard pull); `shake` (0..1) is a fish thrashing.
   */
  step(seconds: number, pull: V3, shake = 0) {
    let left = Math.min(0.1, Math.max(0, seconds));
    // Small fixed steps keep the spring stable on a slow frame.
    while (left > 0) {
      const dt = Math.min(left, 1 / 120);
      left -= dt;
      // Only the part of the pull across the rod bends it.
      const along = dot(pull, AXIS);
      const force = {
        x: pull.x - AXIS.x * along,
        y: pull.y - AXIS.y * along,
        z: pull.z - AXIS.z * along,
      };
      const gain = STIFFNESS * FULL_BEND;
      if (shake > 0) {
        // A thrashing fish tugs in random directions many times a second.
        const jolt = shake * 260 * dt;
        this.speed.x += (this.rng() - 0.5) * jolt;
        this.speed.y += (this.rng() - 0.5) * jolt;
        this.speed.z += (this.rng() - 0.5) * jolt;
      }
      for (const axis of ["x", "y", "z"] as const) {
        const accel =
          force[axis] * gain -
          STIFFNESS * this.offset[axis] -
          DAMPING * this.speed[axis];
        this.speed[axis] += accel * dt;
        this.offset[axis] += this.speed[axis] * dt;
      }
      // Keep it across the rod, and inside its reach.
      const along2 = dot(this.offset, AXIS);
      this.offset.x -= AXIS.x * along2;
      this.offset.y -= AXIS.y * along2;
      this.offset.z -= AXIS.z * along2;
      const size = length(this.offset);
      if (size > MAX_BEND) {
        const k = MAX_BEND / size;
        this.offset.x *= k;
        this.offset.y *= k;
        this.offset.z *= k;
        this.speed.x *= 0.5;
        this.speed.y *= 0.5;
        this.speed.z *= 0.5;
      }
    }
  }

  /**
   * Points along the rod from the hand to the tip (`count` of them). The bend is spread
   * with most of it near the tip, like a real blank; the length stays the same.
   */
  points(count: number, out: V3[] = []): V3[] {
    const lean = {
      x: this.offset.x / ROD_LENGTH,
      y: this.offset.y / ROD_LENGTH,
      z: this.offset.z / ROD_LENGTH,
    };
    let x = ROD_BASE.x;
    let y = ROD_BASE.y;
    let z = ROD_BASE.z;
    const step = ROD_LENGTH / (count - 1);
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        const s = (i - 0.5) / (count - 1);
        const w = 2.1 * Math.pow(s, 1.7);
        let dx = AXIS.x + lean.x * w;
        let dy = AXIS.y + lean.y * w;
        let dz = AXIS.z + lean.z * w;
        const size = Math.hypot(dx, dy, dz) || 1;
        dx /= size;
        dy /= size;
        dz /= size;
        x += dx * step;
        y += dy * step;
        z += dz * step;
      }
      const point = out[i] ?? (out[i] = { x: 0, y: 0, z: 0 });
      point.x = x;
      point.y = y;
      point.z = z;
    }
    return out;
  }

  /** Where the line starts, in boat axes. */
  tip(): V3 {
    const points = this.points(12);
    return points[points.length - 1]!;
  }
}
