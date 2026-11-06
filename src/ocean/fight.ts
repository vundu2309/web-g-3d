/**
 * The tug of war with a hooked fish. Pure maths and a small state machine: no rendering,
 * no DOM, no clock of its own, so it is tested with a seeded generator and a bot.
 *
 * The player holds the button to reel and lets go to give line. The fish is in one of
 * three moods and the right move depends on it:
 *
 * - **surge** (bật sức): it bursts away and drags line out. Stop reeling and it wears
 *   itself out; reel against it and the line tension shoots up until the line snaps.
 * - **strong** (sung sức): it pulls steadily and surges now and then. Short pulls win a
 *   little line and tire it; reeling for too long lets the tension build until it snaps.
 * - **tired** (đuối sức): it can be brought in. Let it rest for long and it recovers.
 *
 * The fish reaches the boat when the distance runs out. Everything it does is shown by
 * the screen as motion (the line, the rod, the fish, the button), never as text.
 */

export type FightMood = "surge" | "strong" | "tired";

/** How a kind of animal fights; the species table picks one for each species. */
export type FightStyle =
  | "steady"
  | "runner"
  | "heavy"
  | "jet"
  | "crawler"
  | "glider";

interface StyleSpec {
  /** Seconds between surges while strong, [min, max]. */
  gap: readonly [number, number];
  /** Seconds a surge lasts, [min, max]. 0 means this animal never surges. */
  surge: readonly [number, number];
  /** Metres per second it drags line out during a surge. */
  run: number;
  /** Stamina (0..1) lost per second while surging. */
  tireSurge: number;
  /** Stamina lost per second while it is reeled in against its strength. */
  tirePress: number;
  /** Multiplier on how fast the line tension builds while reeling. */
  tension: number;
}

export const FIGHT_STYLES: Record<FightStyle, StyleSpec> = {
  // Small and quick to tire: short weak surges.
  steady: {
    gap: [3, 5],
    surge: [0.5, 0.9],
    run: 1.6,
    tireSurge: 0.4,
    tirePress: 0.14,
    tension: 0.9,
  },
  // Long fast runs.
  runner: {
    gap: [2.5, 4],
    surge: [1.2, 2],
    run: 4,
    tireSurge: 0.32,
    tirePress: 0.1,
    tension: 1.1,
  },
  // Few surges but heavy, and the line takes more strain.
  heavy: {
    gap: [4, 6],
    surge: [1, 1.6],
    run: 3,
    tireSurge: 0.28,
    tirePress: 0.08,
    tension: 1.3,
  },
  // Quick bursts, often.
  jet: {
    gap: [1.4, 2.4],
    surge: [0.35, 0.6],
    run: 3.2,
    tireSurge: 0.45,
    tirePress: 0.12,
    tension: 1,
  },
  // Never bursts: slow and stubborn, with a lot of stamina.
  crawler: {
    gap: [99, 99],
    surge: [0, 0],
    run: 0,
    tireSurge: 0,
    tirePress: 0.07,
    tension: 0.55,
  },
  // Wide gliding pulls.
  glider: {
    gap: [3, 5],
    surge: [0.9, 1.5],
    run: 2.4,
    tireSurge: 0.3,
    tirePress: 0.1,
    tension: 0.9,
  },
};

/** Line tension at which the line snaps. */
export const SNAP = 1;
/** Resting tension in each mood: a surge is taut, a tired fish hangs slack. */
export const TENSION_FLOOR: Record<FightMood, number> = {
  surge: 0.35,
  strong: 0.18,
  tired: 0.05,
};
/** Tension gained per second of reeling, by mood (before the style and weight scale it). */
const TENSION_GAIN: Record<FightMood, number> = {
  surge: 2.3,
  strong: 0.55,
  tired: 0.015,
};
/** How fast tension falls back to its resting level when the button is up. */
const RELAX = 1.1;
/** Metres per second the boat wins while reeling. A surging fish cannot be reeled in. */
const REEL_SPEED: Record<FightMood, number> = {
  surge: 0,
  strong: 1.1,
  tired: 4,
};
/** Metres per second the line drifts out when not reeling, outside a surge. */
const DRIFT: Record<FightMood, number> = { surge: 0, strong: 0.25, tired: 0.1 };
export const TIRED_BELOW = 0.3;
export const RECOVERED_ABOVE = 0.5;
/** Seconds of rest before a tired fish starts to recover. */
const REST_BEFORE_RECOVERY = 3;
const RECOVERY = 0.12;
/** The fish is landed within this distance of the boat (m). */
export const LANDED_WITHIN = 0.6;
/** After this long the fish shakes the hook (s), so a stalemate cannot last for ever. */
export const MAX_FIGHT_S = 70;
const START_TENSION = 0.2;

export type FightEvent =
  | { type: "surge" }
  | { type: "calm" }
  | { type: "tired" }
  | { type: "recovered" }
  | { type: "snap" }
  | { type: "escaped" }
  | { type: "shed" }
  | { type: "landed" };

export interface FightView {
  mood: FightMood;
  /** 0..1; 1 snaps the line. */
  tension: number;
  /** Metres from the boat; the fish is landed at 0. */
  distance: number;
  /** 0..1; 1 is fresh. */
  stamina: number;
  reeling: boolean;
  /** 0..1 of the start distance still to go (for a fish drawn nearer as it is reeled in). */
  progress: number;
  /** Seconds since the fight began. */
  elapsed: number;
}

export interface FightOptions {
  style: FightStyle;
  /** Where in its species' weight range this fish is, 0 (smallest) to 1 (biggest). */
  weight: number;
  /** Metres from the boat when the fish takes the hook. */
  distance: number;
  /** The line is out of reach at this distance and the fish is gone. */
  maxLine: number;
  rng?: () => number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

export class Fight {
  private mood: FightMood = "strong";
  private tension = START_TENSION;
  private stamina = 1;
  private distance: number;
  private readonly start: number;
  private reeling = false;
  private elapsed = 0;
  /** Seconds until the next surge while strong, or left in the current surge. */
  private timer: number;
  private rest = 0;
  private done = false;
  private readonly spec: StyleSpec;
  private readonly power: number;
  private readonly endurance: number;
  private readonly maxLine: number;
  private readonly rng: () => number;

  constructor(options: FightOptions) {
    this.spec = FIGHT_STYLES[options.style];
    const weight = clamp(options.weight, 0, 1);
    // Big fish pull harder and last longer.
    this.power = 0.75 + 0.6 * weight;
    this.endurance = 0.8 + 0.8 * weight;
    this.maxLine = options.maxLine;
    this.rng = options.rng ?? Math.random;
    this.distance = clamp(options.distance, 3, this.maxLine - 3);
    this.start = this.distance;
    // The first run comes soon after the hook is set.
    this.timer = this.spec.surge[1] > 0 ? 0.6 + this.rng() * 0.9 : Infinity;
  }

  get finished() {
    return this.done;
  }

  /** The player's button: true while held. */
  reel(on: boolean) {
    this.reeling = on;
  }

  view(): FightView {
    return {
      mood: this.mood,
      tension: this.tension,
      distance: this.distance,
      stamina: this.stamina,
      reeling: this.reeling,
      progress: clamp(1 - this.distance / this.start, 0, 1),
      elapsed: this.elapsed,
    };
  }

  /** Advances `seconds` of the fight and returns what happened, in order. */
  update(seconds: number): FightEvent[] {
    const events: FightEvent[] = [];
    // Small steps keep a slow frame from skipping over a snap.
    let left = Math.max(0, seconds);
    while (left > 0 && !this.done) {
      const step = Math.min(left, 0.05);
      left -= step;
      this.step(step, events);
    }
    return events;
  }

  private end(event: FightEvent, events: FightEvent[]) {
    this.done = true;
    events.push(event);
  }

  private setMood(mood: FightMood, event: FightEvent, events: FightEvent[]) {
    this.mood = mood;
    events.push(event);
  }

  private step(dt: number, events: FightEvent[]) {
    this.elapsed += dt;
    const spec = this.spec;
    const reeling = this.reeling;

    // --- Mood changes ---
    if (this.mood === "strong") {
      this.timer -= dt;
      if (this.timer <= 0 && spec.surge[1] > 0) {
        this.setMood("surge", { type: "surge" }, events);
        this.timer =
          spec.surge[0] + this.rng() * (spec.surge[1] - spec.surge[0]);
      }
    } else if (this.mood === "surge") {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.setMood("strong", { type: "calm" }, events);
        this.timer = spec.gap[0] + this.rng() * (spec.gap[1] - spec.gap[0]);
      }
    }

    // --- Stamina ---
    if (this.mood === "surge") {
      this.stamina -= (spec.tireSurge / this.endurance) * dt;
    } else if (this.mood === "strong") {
      // Short pulls wear it down; reeling into a taut line does not help.
      if (reeling && this.tension < 0.85)
        this.stamina -= (spec.tirePress / this.endurance) * dt;
      else this.stamina -= (0.02 / this.endurance) * dt;
    } else if (!reeling) {
      this.rest += dt;
      if (this.rest > REST_BEFORE_RECOVERY) this.stamina += RECOVERY * dt;
    }
    if (reeling) this.rest = 0;
    this.stamina = clamp(this.stamina, 0, 1);
    if (this.mood !== "tired" && this.stamina <= TIRED_BELOW)
      this.setMood("tired", { type: "tired" }, events);
    else if (this.mood === "tired" && this.stamina >= RECOVERED_ABOVE) {
      this.setMood("strong", { type: "recovered" }, events);
      this.timer = spec.gap[0] + this.rng() * (spec.gap[1] - spec.gap[0]);
      this.rest = 0;
    }

    // --- Tension ---
    const mood = this.mood;
    if (reeling) {
      this.tension += TENSION_GAIN[mood] * spec.tension * this.power * dt;
    } else {
      const floor = TENSION_FLOOR[mood];
      this.tension =
        this.tension > floor
          ? Math.max(floor, this.tension - RELAX * dt)
          : Math.min(floor, this.tension + RELAX * dt);
    }
    // A snap needs the player's pull: a surge alone only makes the line taut.
    if (reeling && this.tension >= SNAP) {
      this.tension = SNAP;
      return this.end({ type: "snap" }, events);
    }
    this.tension = clamp(this.tension, 0, SNAP);

    // --- Distance ---
    if (reeling) this.distance -= REEL_SPEED[mood] * dt;
    if (mood === "surge") {
      this.distance += spec.run * this.power * dt;
    } else if (!reeling) {
      this.distance += DRIFT[mood] * dt;
    }
    if (this.distance <= LANDED_WITHIN) {
      this.distance = 0;
      return this.end({ type: "landed" }, events);
    }
    if (this.distance >= this.maxLine) {
      this.distance = this.maxLine;
      return this.end({ type: "escaped" }, events);
    }
    if (this.elapsed >= MAX_FIGHT_S) return this.end({ type: "shed" }, events);
  }
}
