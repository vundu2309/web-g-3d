import { HARBOR, SEA_BOUND, islandCollisionRadius, islands } from "./model.ts";
import { coastDistance } from "./shore.ts";
import {
  Fight,
  type FightMood,
  type FightStyle,
  type FightView,
} from "./fight.ts";
import {
  DEFAULT_LOADOUT,
  tierOf,
  type BaitTier,
  type Loadout,
} from "./upgrades.ts";

/**
 * Fishing rules. Pure maths and a small state machine, no rendering and no DOM:
 * what can be caught where, how a cast lands, how a fish nibbles and bites, and what
 * the player's fish store does. The screen and the 3D gear only draw this state.
 */

export type Zone = "shore" | "open" | "deep";
export type Rarity = 1 | 2 | 3;
export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  /** Relative chance in each zone (0 = never there). */
  zones: Record<Zone, number>;
  /** Lightest and heaviest fish, kg. */
  kg: readonly [number, number];
  /**
   * Length in cm of the longest side of a 1 kg animal; other sizes scale with the cube root of the
   * weight. Its 3D model is `public/models/fish-<id>.glb` (see ocean/glb-parts.ts).
   */
  lengthCm: number;
  /** How it fights once hooked (see ocean/fight.ts). */
  fight: FightStyle;
}

export const RARITY_NAMES: Record<Rarity, string> = {
  1: "Thường",
  2: "Hiếm",
  3: "Rất hiếm",
};

export const SPECIES: readonly Species[] = [
  {
    id: "ca-madeka",
    name: "Cá madeka",
    rarity: 1,
    zones: { shore: 4, open: 0, deep: 0 },
    kg: [0.01, 0.06],
    lengthCm: 23,
    fight: "steady",
  },
  {
    id: "cua-bien",
    name: "Cua biển",
    rarity: 1,
    zones: { shore: 4, open: 0, deep: 0 },
    kg: [0.2, 2],
    lengthCm: 16,
    fight: "glider",
  },
  {
    id: "sao-bien",
    name: "Sao biển",
    rarity: 1,
    zones: { shore: 3, open: 0, deep: 0 },
    kg: [0.05, 0.5],
    lengthCm: 22,
    fight: "crawler",
  },
  {
    id: "sua",
    name: "Sứa",
    rarity: 1,
    zones: { shore: 1, open: 3, deep: 1 },
    kg: [0.3, 4],
    lengthCm: 50,
    fight: "glider",
  },
  {
    id: "ca-he",
    name: "Cá hề",
    rarity: 2,
    zones: { shore: 3, open: 1, deep: 0 },
    kg: [0.03, 0.25],
    lengthCm: 22,
    fight: "steady",
  },
  {
    id: "ca-ngua",
    name: "Cá ngựa",
    rarity: 2,
    zones: { shore: 2, open: 0, deep: 0 },
    kg: [0.02, 0.12],
    lengthCm: 43,
    fight: "steady",
  },
  {
    id: "rua-bien",
    name: "Rùa biển",
    rarity: 2,
    zones: { shore: 1, open: 2, deep: 0 },
    kg: [20, 120],
    lengthCm: 22,
    fight: "glider",
  },
  {
    id: "tom-hum",
    name: "Tôm hùm",
    rarity: 3,
    zones: { shore: 1, open: 2, deep: 1 },
    kg: [0.5, 5],
    lengthCm: 35,
    fight: "jet",
  },
  {
    id: "ca-heo",
    name: "Cá heo",
    rarity: 3,
    zones: { shore: 0, open: 2, deep: 2 },
    kg: [60, 200],
    lengthCm: 42,
    fight: "runner",
  },
  {
    id: "ca-map",
    name: "Cá mập",
    rarity: 3,
    zones: { shore: 0, open: 1, deep: 3 },
    kg: [60, 400],
    lengthCm: 36,
    fight: "heavy",
  },
];

/**
 * How long a fish is drawn in the scene (m): its real length (cm at 1 kg, scaled by the
 * cube root of its weight), so it fits the 7.4 m boat: an anchovy is a hand long, a tuna
 * is as long as a person, a shark is half the boat. Only the very small ones are drawn
 * larger than life (at least 0.3 m) so they can still be seen. Used for the fish on the
 * line and the one hanging from the rod.
 */
export function drawnLength(species: { lengthCm: number }, kg: number): number {
  const real = (species.lengthCm * Math.cbrt(Math.max(0.01, kg))) / 100;
  return Math.min(4, Math.max(0.3, real));
}

const byId = new Map(SPECIES.map((species) => [species.id, species]));
export const speciesById = (id: string) => byId.get(id);

/**
 * Where in the sea a cast lands decides which fish are there: within SHORE_RANGE metres of a
 * beach is the shore, beyond DEEP_RANGE of every beach the deep sea. Measured from the real,
 * irregular coast (shore.ts); the ranges were 28 and 125 m from the island's radius circle,
 * which lies about 2.5 m beyond the sand on average, so the zones keep their size.
 */
export const SHORE_RANGE = 30;
export const DEEP_RANGE = 128;
export function zoneAt(x: number, z: number): Zone {
  const nearest = coastDistance(x, z);
  if (nearest < SHORE_RANGE) return "shore";
  // The harbor lies far from every island now, but the water beside it stays open sea: the
  // deep sea starts DEEP_RANGE metres beyond the harbor as well as beyond every beach.
  if (
    nearest > DEEP_RANGE &&
    Math.hypot(x - HARBOR.x, z - HARBOR.z) > DEEP_RANGE
  )
    return "deep";
  return "open";
}

export interface Catch {
  species: string;
  kg: number;
  cm: number;
}

/**
 * What the sea gives the lure where it lands, on top of the zone, the sweet spot and the bait
 * (decision 0020; the numbers come from fishing-conditions.ts, which reads the shared clock, so
 * this file stays free of it). Every part is optional and neutral when absent: without a
 * `Conditions` the same rng gives the same fish and the same draws as before they existed.
 */
export interface Conditions {
  /** A multiplier for the chance of each species, by id (1 when a species is not listed). */
  weights?: Readonly<Record<string, number>>;
  /** The chance that a fish which nibbles then bites (0.8 when absent). */
  biteChance?: number;
  /** A multiplier for the wait before the first nibble (1 when absent). */
  waitScale?: number;
  /** A giant: the weight is rolled from the top of the species' range. */
  giant?: boolean;
}

/** The chance that a fish which nibbles then bites. */
export const BITE_CHANCE = 0.8;
/** A giant weighs at least this share of the way from its lightest to its heaviest. */
export const GIANT_FROM = 0.88;

const RARITY_WEIGHT: Record<Rarity, number> = { 1: 100, 2: 40, 3: 10 };
/** Fishing the spot fish like (see castTarget) makes the better fish likelier. */
const SWEET_BOOST = 1.8;

/**
 * Chooses a fish for a zone. Small fish are common, big ones rare within a species. `bait` is
 * the bait tier in use (a row of UPGRADES.bait): it multiplies the weight of rarity 2 and 3
 * fish on top of the sweet spot. Without it every multiplier is 1, so the same rng gives the
 * same fish and uses the same draws as before the baits existed. `conditions` is the same kind
 * of optional extra (see `Conditions`).
 */
export function rollFish(
  zone: Zone,
  rng: () => number = Math.random,
  sweet = false,
  bait?: Pick<BaitTier, "rare2" | "rare3">,
  conditions?: Conditions,
): Catch {
  const weights = SPECIES.map(
    (species) =>
      species.zones[zone] *
      RARITY_WEIGHT[species.rarity] *
      (sweet && species.rarity > 1 ? SWEET_BOOST : 1) *
      (bait
        ? species.rarity === 2
          ? bait.rare2
          : species.rarity === 3
            ? bait.rare3
            : 1
        : 1) *
      (conditions?.weights?.[species.id] ?? 1),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let pick = rng() * total;
  let index = 0;
  for (; index < weights.length - 1; index++) {
    pick -= weights[index]!;
    if (pick < 0) break;
  }
  const species = SPECIES[index]!;
  const [low, high] = species.kg;
  // A giant is rolled from the top of the range; either way this is one draw.
  const raw = conditions?.giant
    ? low + (high - low) * (GIANT_FROM + (1 - GIANT_FROM) * rng())
    : low + (high - low) * Math.pow(rng(), 2.4);
  const kg = raw < 10 ? Math.round(raw * 100) / 100 : Math.round(raw * 10) / 10;
  return {
    species: species.id,
    kg,
    cm: Math.round(species.lengthCm * Math.cbrt(Math.max(kg, 0.01))),
  };
}

// ----- Casting -----

export const CAST_MIN = 8;
export const CAST_MAX = 40;
/** Holding the button for this long gives the full throw. */
export const CHARGE_MS = 1400;
/** Fish like this distance from the boat: not too close, not too far. */
export const SWEET_FROM = 22;
export const SWEET_TO = 30;
export const FLIGHT_MS = 600;
/** The line cannot stretch farther than this; a boat that drifts off reels it in. */
export const MAX_LINE = 48;
/** After a bite the player has exactly this long to pull. */
export const HOOK_WINDOW_MS = 1000;

export interface Point {
  x: number;
  z: number;
}

/** Casts go ahead and a little to starboard, where the rod points. */
export function castDirection(heading: number): Point {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = Math.sin(heading);
  const x = fx * 0.88 + rx * 0.47;
  const z = fz * 0.88 + rz * 0.47;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

export const castDistance = (power: number) =>
  CAST_MIN + Math.min(1, Math.max(0, power)) * (CAST_MAX - CAST_MIN);
/** The same sweet spot as a share of the power bar. */
export const SWEET_POWER: readonly [number, number] = [
  (SWEET_FROM - CAST_MIN) / (CAST_MAX - CAST_MIN),
  (SWEET_TO - CAST_MIN) / (CAST_MAX - CAST_MIN),
];

export interface CastTarget extends Point {
  distance: number;
  sweet: boolean;
  /** False when the lure would land on an island or outside the sea. */
  water: boolean;
}

export function castTarget(
  from: Point,
  direction: Point,
  power: number,
): CastTarget {
  const distance = castDistance(power);
  const x = from.x + direction.x * distance;
  const z = from.z + direction.z * distance;
  const water =
    Math.abs(x) < SEA_BOUND - 4 &&
    Math.abs(z) < SEA_BOUND - 4 &&
    islands.every(
      (island) =>
        Math.hypot(x - island.x, z - island.z) >
        islandCollisionRadius(island) + 1,
    );
  return {
    x,
    z,
    distance,
    sweet: distance >= SWEET_FROM && distance <= SWEET_TO,
    water,
  };
}

// ----- The fish's behaviour -----

export type Phase =
  | "idle"
  | "charging"
  | "flying"
  | "waiting"
  | "nibbling"
  | "biting"
  | "fighting";

export type FishingEvent =
  | { type: "fizzle" }
  | { type: "splash" }
  | { type: "nibble" }
  | { type: "bite" }
  | { type: "escaped" }
  | { type: "retrieved" }
  | { type: "hooked"; fish: Catch }
  | { type: "mood"; mood: FightMood }
  | { type: "lost"; reason: "snap" | "run" | "shed" | "cancel" }
  | { type: "caught"; fish: Catch };

export interface FishingView {
  phase: Phase;
  /** 0..1 while charging. */
  power: number;
  /** Where the lure is (or will land), once cast. */
  landing: Point | undefined;
  /** 0..1 progress of the throw. */
  flight: number;
  /** Seconds since each recent nibble, newest last (for the line to twitch). */
  nibbleAges: number[];
  /** 0..1 of the hook window used up, while a fish is on. */
  hurry: number;
  /** The tug of war, once the fish is hooked. */
  fight: FightView | undefined;
  /** Species id of the fish on the line, while fighting. */
  species: string | undefined;
  /** How heavy the fish on the line is for its kind, 0..1 (to draw it the right size). */
  size: number | undefined;
}

interface Round {
  /** Absolute times (ms) of the nibbles. */
  nibbles: number[];
  /** When the fish takes the hook, or undefined if it loses interest. */
  biteAt: number | undefined;
  endAt: number;
}

/** One round of a fish investigating the bait. */
export function planRound(
  from: number,
  sweet: boolean,
  rng: () => number,
  conditions?: Conditions,
): Round {
  const wait =
    (sweet ? 1800 + rng() * 2000 : 2500 + rng() * 3500) *
    (conditions?.waitScale ?? 1);
  const count = 1 + Math.floor(rng() * 3);
  const nibbles: number[] = [];
  let at = from + wait;
  for (let i = 0; i < count; i++) {
    nibbles.push(at);
    at += 500 + rng() * 600;
  }
  // Most fish that nibble then bite; some lose interest and a new one comes later.
  const bites = rng() < (conditions?.biteChance ?? BITE_CHANCE);
  const biteAt = bites ? at + rng() * 300 : undefined;
  return { nibbles, biteAt, endAt: biteAt ?? at + 400 };
}

export class Angler {
  private phase: Phase = "idle";
  private chargeStart = 0;
  private flightStart = 0;
  private landing: Point | undefined;
  private sweet = false;
  private zone: Zone = "open";
  private conditions: Conditions | undefined;
  private round: Round | undefined;
  private fired = 0;
  private fight: Fight | undefined;
  private hooked: Catch | undefined;
  private lastTick = 0;
  private readonly rng: () => number;
  private readonly emit: (event: FishingEvent) => void;
  private readonly speed: number;
  private readonly loadout: () => Loadout;
  private readonly conditionsAt:
    | ((x: number, z: number) => Conditions | undefined)
    | undefined;

  /**
   * `speed` only exists so tests on a slow software renderer can run a fight faster.
   * `loadout` says which rod and bait the player has; it is read when a fish takes the hook, so
   * a purchase counts from the next fish. The default is the free rod and bait.
   * `conditionsAt` says what the sea gives a lure that lands at a place (read when the lure
   * lands); without it nothing is added.
   */
  constructor(
    emit: (event: FishingEvent) => void,
    rng: () => number = Math.random,
    speed = 1,
    loadout: () => Loadout = () => DEFAULT_LOADOUT,
    conditionsAt?: (x: number, z: number) => Conditions | undefined,
  ) {
    this.emit = emit;
    this.conditionsAt = conditionsAt;
    this.rng = rng;
    this.speed = speed;
    this.loadout = loadout;
  }

  get busy() {
    return this.phase !== "idle";
  }

  /** Cast and line are out: the boat does not drive and others see it fishing. */
  get fishing() {
    return this.phase !== "idle" && this.phase !== "charging";
  }

  startCharge(now: number) {
    if (this.phase !== "idle") return;
    this.phase = "charging";
    this.chargeStart = now;
  }

  power(now: number) {
    return this.phase === "charging"
      ? // A frame's own clock can be a little earlier than a press that happened during it.
        Math.min(1, Math.max(0, (now - this.chargeStart) / CHARGE_MS))
      : 0;
  }

  /** Lets go of the button: throws if the lure would land on water. */
  release(now: number, from: Point, direction: Point) {
    if (this.phase !== "charging") return;
    const target = castTarget(from, direction, this.power(now));
    if (!target.water) {
      this.phase = "idle";
      this.emit({ type: "fizzle" });
      return;
    }
    this.landing = { x: target.x, z: target.z };
    this.sweet = target.sweet;
    this.zone = zoneAt(target.x, target.z);
    this.conditions = this.conditionsAt?.(target.x, target.z);
    this.phase = "flying";
    this.flightStart = now;
  }

  /**
   * The pull. Before a bite it just reels the line in; during the hook window it
   * lands the fish; after the window the fish is already gone.
   */
  pull(now: number, distance = 20) {
    if (this.phase === "charging") {
      this.phase = "idle";
      return;
    }
    if (this.phase === "idle") return;
    // The button is held to reel once the fish is on.
    if (this.phase === "fighting") {
      this.fight?.reel(true);
      return;
    }
    if (this.phase === "biting" && this.round?.biteAt !== undefined) {
      if (now - this.round.biteAt <= HOOK_WINDOW_MS) {
        const loadout = this.loadout();
        const fish = rollFish(
          this.zone,
          this.rng,
          this.sweet,
          tierOf("bait", loadout.baitUsed),
          this.conditions,
        );
        const species = speciesById(fish.species);
        const [low, high] = species?.kg ?? [0, 1];
        this.hooked = fish;
        this.fight = new Fight({
          style: species?.fight ?? "steady",
          weight: high > low ? (fish.kg - low) / (high - low) : 0,
          distance,
          maxLine: MAX_LINE,
          rng: this.rng,
          rodTension: tierOf("rod", loadout.rod).tension,
        });
        this.lastTick = now;
        this.round = undefined;
        this.phase = "fighting";
        this.emit({ type: "hooked", fish });
        return;
      }
    }
    this.reset();
    this.emit({ type: "retrieved" });
  }

  /** The player lets go of the button: the fish takes line, the tension falls. */
  letGo() {
    if (this.phase === "fighting") this.fight?.reel(false);
  }

  /** Line in at once, e.g. the boat drifted too far or the player left. */
  cancel() {
    if (this.phase === "idle") return;
    const wasFishing = this.fishing;
    const hadFish = this.phase === "fighting";
    this.reset();
    if (hadFish) this.emit({ type: "lost", reason: "cancel" });
    else if (wasFishing) this.emit({ type: "retrieved" });
  }

  private reset() {
    this.phase = "idle";
    this.landing = undefined;
    this.round = undefined;
    this.fired = 0;
    this.fight = undefined;
    this.hooked = undefined;
  }

  /** Advances time: nibbles, the bite and the fish getting away. */
  update(now: number) {
    if (this.phase === "fighting" && this.fight) {
      // A hidden tab can skip a long time: never advance more than a moment at once.
      const seconds =
        Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000)) * this.speed;
      this.lastTick = now;
      for (const event of this.fight.update(seconds)) {
        if (event.type === "surge" || event.type === "tired")
          this.emit({
            type: "mood",
            mood: event.type === "surge" ? "surge" : "tired",
          });
        else if (event.type === "calm" || event.type === "recovered")
          this.emit({ type: "mood", mood: "strong" });
        else if (event.type === "landed") {
          const fish = this.hooked;
          this.reset();
          if (fish) this.emit({ type: "caught", fish });
          return;
        } else if (
          event.type === "snap" ||
          event.type === "escaped" ||
          event.type === "shed"
        ) {
          this.reset();
          this.emit({
            type: "lost",
            reason: event.type === "escaped" ? "run" : event.type,
          });
          return;
        }
      }
      return;
    }
    if (this.phase === "flying") {
      if (now - this.flightStart < FLIGHT_MS) return;
      this.phase = "waiting";
      this.round = planRound(now, this.sweet, this.rng, this.conditions);
      this.fired = 0;
      this.emit({ type: "splash" });
    }
    if ((this.phase === "waiting" || this.phase === "nibbling") && this.round) {
      while (
        this.fired < this.round.nibbles.length &&
        now >= this.round.nibbles[this.fired]!
      ) {
        this.fired++;
        this.phase = "nibbling";
        this.emit({ type: "nibble" });
      }
      if (this.round.biteAt !== undefined && now >= this.round.biteAt) {
        this.phase = "biting";
        this.emit({ type: "bite" });
      } else if (this.round.biteAt === undefined && now >= this.round.endAt) {
        // Lost interest; another fish may come.
        this.round = planRound(now, this.sweet, this.rng, this.conditions);
        this.fired = 0;
        this.phase = "waiting";
      }
    }
    if (
      this.phase === "biting" &&
      this.round?.biteAt !== undefined &&
      now - this.round.biteAt > HOOK_WINDOW_MS
    ) {
      this.reset();
      this.emit({ type: "escaped" });
    }
  }

  /** How heavy the hooked fish is within its species' range, 0..1. */
  private hookedSize(): number | undefined {
    const fish = this.hooked;
    const species = fish ? speciesById(fish.species) : undefined;
    if (!fish || !species) return undefined;
    const [low, high] = species.kg;
    return high > low
      ? Math.min(1, Math.max(0, (fish.kg - low) / (high - low)))
      : 0;
  }

  view(now: number): FishingView {
    const round = this.round;
    const bite = round?.biteAt;
    return {
      phase: this.phase,
      power: this.power(now),
      landing: this.landing,
      flight:
        this.phase === "flying"
          ? Math.min(1, (now - this.flightStart) / FLIGHT_MS)
          : this.landing
            ? 1
            : 0,
      nibbleAges: round
        ? round.nibbles
            .slice(0, this.fired)
            .map((time) => (now - time) / 1000)
            .filter((age) => age < 1.2)
        : [],
      hurry:
        this.phase === "biting" && bite !== undefined
          ? Math.min(1, (now - bite) / HOOK_WINDOW_MS)
          : 0,
      fight: this.fight?.view(),
      species: this.fight ? this.hooked?.species : undefined,
      size: this.fight ? this.hookedSize() : undefined,
    };
  }
}

// ----- The fish store -----

export interface Stock {
  /** Fish held now. */
  n: number;
  /** Heaviest ever caught of the species, kg. */
  best: number;
}
export type Inventory = Record<string, Stock>;

export function addCatch(
  inventory: Inventory,
  fish: Catch,
): { inventory: Inventory; record: boolean } {
  const held = inventory[fish.species];
  const record = fish.kg > (held?.best ?? 0);
  return {
    inventory: {
      ...inventory,
      [fish.species]: {
        n: Math.min(9999, (held?.n ?? 0) + 1),
        best: Math.max(held?.best ?? 0, fish.kg),
      },
    },
    record,
  };
}

/**
 * Whether one more fish fits in a store of `slots` (1 slot is 1 fish). A store that already holds
 * more than it has slots (a fish store kept from before the slots, or a boat that was not
 * there yet) is left alone, never trimmed: it only cannot take another until it has room.
 */
export const canKeep = (inventory: Inventory, slots: number): boolean =>
  stockTotal(inventory) < slots;

/** Puts one fish back in the sea; the record weight stays. */
export function releaseOne(inventory: Inventory, id: string): Inventory {
  const held = inventory[id];
  if (!held || held.n <= 0) return inventory;
  return { ...inventory, [id]: { n: held.n - 1, best: held.best } };
}

export const stockTotal = (inventory: Inventory) =>
  Object.values(inventory).reduce((sum, stock) => sum + stock.n, 0);

/** Species the player holds, in the order of the species table. */
export const heldSpecies = (inventory: Inventory) =>
  SPECIES.filter((species) => (inventory[species.id]?.n ?? 0) > 0);
