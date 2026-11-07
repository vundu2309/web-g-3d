/**
 * The wake of the boats, a visual of the water only: each moving boat drops a ring of
 * wave every fraction of a second where it is; the ring spreads at a fixed speed, grows
 * wide and fades. Rings dropped along a line add up to the V of a real wake, and the V
 * is narrow for a fast boat and wide for a slow one (half angle asin(spread / speed)),
 * with no angle written anywhere. The water shader sums the rings from the same
 * constants (glslWake), so what the CPU tests is what the GPU draws.
 *
 * It does not push the boats: they float on the waves in waves.ts, as before. The ring a
 * boat has just made is faded in over its first second, so the water under the hull is
 * not displaced and the boat still floats on the surface it sees.
 */
/** Rings in the field at once; the oldest are overwritten. */
export const WAKE_MAX = 64;
/** How fast a ring spreads (m/s). */
export const WAKE_SPREAD = 4.2;
/** A ring is gone after this many seconds. */
export const WAKE_LIFE = 4.5;
/** Wavelength of the ripples in a ring (m). */
export const WAKE_WAVELENGTH = 2.6;
/** Height of a ring from a boat at full speed, at its strongest (m). */
export const WAKE_HEIGHT = 0.34;
/** A boat slower than this leaves no wake (m/s). */
export const WAKE_MIN_SPEED = 1.5;
/** Seconds between rings from one boat. */
export const WAKE_EVERY = 0.18;
/** A boat at this speed or more leaves the strongest wake (m/s). */
export const WAKE_FULL_SPEED = 10.5;

export interface WakeSample {
  /** Extra height of the water (m). */
  height: number;
  /** Extra slope, d height / dx and d height / dz. */
  gx: number;
  gz: number;
  /** 0..1 white water. */
  foam: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const K = (Math.PI * 2) / WAKE_WAVELENGTH;

/**
 * A field of rings: `data` is x, z, time dropped and strength for each ring, in the
 * order the shader reads them (a plain array, so it can be uploaded as is).
 */
export class WakeField {
  readonly data: number[] = new Array(WAKE_MAX * 4).fill(0);
  private next = 0;
  private readonly tracks = new Map<
    string,
    { x: number; z: number; t: number }
  >();

  /** Drops a ring at (x, z) at time t with a strength from 0 to 1. */
  emit(x: number, z: number, t: number, strength: number) {
    const at = this.next * 4;
    this.data[at] = x;
    this.data[at + 1] = z;
    this.data[at + 2] = t;
    this.data[at + 3] = strength;
    this.next = (this.next + 1) % WAKE_MAX;
  }

  /**
   * Follows one boat: call every frame with where it is. Works out its speed and drops a
   * ring now and then while it moves. Returns the speed (m/s).
   */
  track(id: string, x: number, z: number, t: number): number {
    const last = this.tracks.get(id);
    if (!last || t < last.t) {
      this.tracks.set(id, { x, z, t });
      return 0;
    }
    const dt = t - last.t;
    if (dt < WAKE_EVERY) return 0;
    const speed = Math.hypot(x - last.x, z - last.z) / dt;
    this.tracks.set(id, { x, z, t });
    // A jump (a boat that was far away, a reconnect) is not speed.
    if (speed > WAKE_MIN_SPEED && speed < 40)
      this.emit(
        x,
        z,
        t,
        Math.min(
          1,
          (speed - WAKE_MIN_SPEED) / (WAKE_FULL_SPEED - WAKE_MIN_SPEED),
        ),
      );
    return speed;
  }

  /** Stops following a boat that has left. */
  forget(id: string) {
    this.tracks.delete(id);
  }

  /** The rings at one point and time, as the shader works them out (for tests). */
  sample(x: number, z: number, t: number): WakeSample {
    return sampleWake(this.data, x, z, t);
  }
}

/** The CPU twin of the shader's wakeAt: the sum of every live ring at (x, z) at time t. */
export function sampleWake(
  data: ArrayLike<number>,
  x: number,
  z: number,
  t: number,
): WakeSample {
  let height = 0;
  let gx = 0;
  let gz = 0;
  let foam = 0;
  for (let i = 0; i < WAKE_MAX; i++) {
    const strength = data[i * 4 + 3]!;
    const age = t - data[i * 4 + 2]!;
    if (strength <= 0 || age <= 0 || age > WAKE_LIFE) continue;
    const dx = x - data[i * 4]!;
    const dz = z - data[i * 4 + 1]!;
    const d = Math.hypot(dx, dz);
    const radius = WAKE_SPREAD * age;
    const u = d - radius;
    const width = 1.4 + 0.5 * age;
    const envelope = Math.exp(-(u * u) / (width * width));
    const fade =
      (smooth(0.35, 1.2, age) * Math.exp(-age * 0.5) * strength) /
      Math.sqrt(1 + radius * 0.5);
    // White water right behind the boat, before the ring has left it.
    const trail =
      strength *
      smooth(0.1, 0.6, age) *
      (1 - smooth(1.2, 3.5, age)) *
      (1 - smooth(0.6, 2.2, d));
    foam += trail * 0.9;
    if (envelope < 0.01) continue;
    const phase = K * u;
    height += WAKE_HEIGHT * fade * Math.cos(phase) * envelope;
    foam += envelope * fade * smooth(0.55, 1, Math.cos(phase)) * 1.6;
    const slope =
      WAKE_HEIGHT *
      fade *
      envelope *
      (-K * Math.sin(phase) + Math.cos(phase) * ((-2 * u) / (width * width)));
    const inv = 1 / Math.max(d, 0.001);
    gx += slope * dx * inv;
    gz += slope * dz * inv;
  }
  return { height, gx, gz, foam: Math.min(1, foam) };
}

/** The same sum as GLSL, built from the constants above so the shader cannot drift. */
export function glslWake(): string {
  const f = (n: number) => n.toFixed(6);
  return `const int WAKE_MAX = ${WAKE_MAX};
uniform vec4 wake[WAKE_MAX];
// x: height, y and z: slope, w: white water.
vec4 wakeAt(vec2 p, float t) {
  float height = 0.0;
  vec2 grad = vec2(0.0);
  float foam = 0.0;
  for (int i = 0; i < WAKE_MAX; i++) {
    vec4 e = wake[i];
    float age = t - e.z;
    if (e.w <= 0.0 || age <= 0.0 || age > ${f(WAKE_LIFE)}) continue;
    vec2 delta = p - e.xy;
    float d = length(delta);
    float radius = ${f(WAKE_SPREAD)} * age;
    float u = d - radius;
    float width = 1.4 + 0.5 * age;
    float envelope = exp(-(u * u) / (width * width));
    float fade = smoothstep(0.35, 1.2, age) * exp(-age * 0.5) * e.w / sqrt(1.0 + radius * 0.5);
    float trail = e.w * smoothstep(0.1, 0.6, age) * (1.0 - smoothstep(1.2, 3.5, age)) * (1.0 - smoothstep(0.6, 2.2, d));
    foam += trail * 0.9;
    if (envelope < 0.01) continue;
    float phase = ${f(K)} * u;
    height += ${f(WAKE_HEIGHT)} * fade * cos(phase) * envelope;
    foam += envelope * fade * smoothstep(0.55, 1.0, cos(phase)) * 1.6;
    float slope = ${f(WAKE_HEIGHT)} * fade * envelope * (-${f(K)} * sin(phase) + cos(phase) * (-2.0 * u / (width * width)));
    grad += slope * delta / max(d, 0.001);
  }
  return vec4(height, grad, min(foam, 1.0));
}`;
}
