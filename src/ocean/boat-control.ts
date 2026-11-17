/**
 * What the player asks of the boat, as plain numbers (no DOM, no Babylon, so tests read it
 * directly). Keys are full deflection and the stick is analog; this turns both into the
 * steer and throttle the physics reads, in one place:
 *
 * - the stick wins while it is held (an analog value is already smooth and is passed on as is);
 * - keys move the rudder, they do not snap it: it takes RUDDER_RISE seconds to reach full lock
 *   and RUDDER_FALL seconds to centre, so a tap does not kick the hull into its sharpest turn
 *   (the yaw jerk of a full lock from a standing start was 122 deg/s^2, 72 with this ramp);
 * - the throttle is not smoothed here: the engine's thrust and the hull's drag already build and
 *   fade it gradually (`boat-physics.ts`);
 * - while fishing, or while the page cannot be played (hidden tab, open dialog), nothing is asked
 *   and the rudder centres at once, so the boat is not left with a lock set when play resumes.
 */

/** Seconds from centre to full lock with a key held. */
export const RUDDER_RISE = 0.35;
/** Seconds from full lock back to centre once the key is let go. */
export const RUDDER_FALL = 0.25;
/** The longest frame the ramp counts for (s): a tab that comes back must not jump the rudder. */
export const MAX_FRAME = 0.1;

export interface KeyDirections {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface StickReading {
  steer: number;
  throttle: number;
}

export interface BoatCommand {
  steer: number;
  throttle: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** The raw request before any smoothing: the stick when held, else the keys (full deflection). */
export function rawRequest(
  keys: KeyDirections,
  stick: StickReading,
): BoatCommand {
  return {
    steer: stick.steer || Number(keys.right) - Number(keys.left),
    throttle: stick.throttle || Number(keys.up) - Number(keys.down),
  };
}

/** Moves `value` toward `target` by at most `step`. */
function approach(value: number, target: number, step: number): number {
  return value + clamp(target - value, -step, step);
}

export interface BoatControl {
  /**
   * One frame of `dt` seconds. `playable` is false for a hidden tab or an open dialog and
   * `fishing` while a line is out; both ask nothing.
   */
  update(
    dt: number,
    keys: KeyDirections,
    stick: StickReading,
    playable: boolean,
    fishing: boolean,
  ): BoatCommand;
  /** The rudder as last given, for tests. */
  readonly rudder: number;
}

export function createBoatControl(): BoatControl {
  let rudder = 0;
  return {
    get rudder() {
      return rudder;
    },
    update(dt, keys, stick, playable, fishing) {
      if (!playable || fishing) {
        rudder = 0;
        return { steer: 0, throttle: 0 };
      }
      const frame = clamp(Number.isFinite(dt) ? dt : 0, 0, MAX_FRAME);
      const want = rawRequest(keys, stick);
      if (stick.steer) {
        // Analog: the finger already moves smoothly.
        rudder = clamp(stick.steer, -1, 1);
      } else {
        // Centring (no key, or a smaller deflection on the same side) is quicker than winding on;
        // a reversal counts as winding on.
        const windingOn =
          want.steer !== 0 &&
          (Math.sign(want.steer) !== Math.sign(rudder) ||
            Math.abs(want.steer) > Math.abs(rudder));
        const rate = windingOn ? 1 / RUDDER_RISE : 1 / RUDDER_FALL;
        rudder = approach(rudder, want.steer, rate * frame);
      }
      return { steer: rudder, throttle: clamp(want.throttle, -1, 1) };
    },
  };
}
