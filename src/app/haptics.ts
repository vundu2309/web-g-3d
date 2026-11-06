import type { FightView } from "../ocean/fight";

/**
 * The fight in the hand. While the fish surges the phone buzzes without a break, harder
 * (longer pulses, shorter gaps) as the line tightens; a taut line near the snap ticks as
 * a warning; a tired fish is quiet. It only calls `vibrate`, so a test can count the
 * calls. Phones whose browser cannot vibrate (Safari on iPhone does not) feel nothing.
 */
export type Vibrate = (pattern: number | number[]) => void;

/** Milliseconds between pulses while the fish surges, for a slack and a tight line. */
const SURGE_PULSE = { slack: 70, tight: 120 } as const;
const SURGE_GAP = 25;
const WARN_EVERY = 230;
const WARN_TENSION = 0.72;

export function createHaptics(vibrate: Vibrate) {
  let buzzing = false;
  let next = 0;

  return {
    /** Call every frame with the clock in ms and the fight (undefined when none). */
    tick(now: number, fight: FightView | undefined) {
      if (!fight) {
        this.stop();
        return;
      }
      if (fight.mood === "surge") {
        if (now < next) return;
        const on = Math.round(
          SURGE_PULSE.slack +
            (SURGE_PULSE.tight - SURGE_PULSE.slack) * fight.tension,
        );
        vibrate([on, SURGE_GAP]);
        buzzing = true;
        next = now + on + SURGE_GAP;
        return;
      }
      if (buzzing) {
        // The surge is over: cut the last pulse short.
        vibrate(0);
        buzzing = false;
      }
      if (fight.mood === "strong" && fight.tension >= WARN_TENSION) {
        if (now < next) return;
        vibrate(22);
        next = now + WARN_EVERY;
      }
    },
    /** Stops any buzz (the fish is landed, lost, or the player left). */
    stop() {
      if (buzzing) vibrate(0);
      buzzing = false;
      next = 0;
    },
  };
}
