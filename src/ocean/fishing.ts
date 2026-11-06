import { SEA_BOUND, islandCollisionRadius, islands } from "./model.ts";
import {
  Fight,
  type FightMood,
  type FightStyle,
  type FightView,
} from "./fight.ts";

/**
 * Fishing rules. Pure maths and a small state machine, no rendering and no DOM:
 * what can be caught where, how a cast lands, how a fish nibbles and bites, and what
 * the player's fish store does. The screen and the 3D gear only draw this state.
 */

export type Zone = "shore" | "open" | "deep";
export type Rarity = 1 | 2 | 3;
export type Shape =
  | "slim"
  | "round"
  | "diamond"
  | "puffer"
  | "chunky"
  | "torpedo"
  | "flat"
  | "sword";

export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  /** Relative chance in each zone (0 = never there). */
  zones: Record<Zone, number>;
  /** Lightest and heaviest fish, kg. */
  kg: readonly [number, number];
  /** Length in cm of a 1 kg fish; other sizes scale with the cube root of the weight. */
  lengthCm: number;
  shape: Shape;
  /** How it fights once hooked (see ocean/fight.ts). */
  fight: FightStyle;
  body: string;
  fin: string;
}

export const RARITY_NAMES: Record<Rarity, string> = {
  1: "Thường",
  2: "Hiếm",
  3: "Rất hiếm",
};

export const SPECIES: readonly Species[] = [
  {
    id: "ca-com",
    name: "Cá cơm",
    rarity: 1,
    zones: { shore: 5, open: 2, deep: 0 },
    kg: [0.05, 0.2],
    lengthCm: 24,
    shape: "slim",
    fight: "steady",
    body: "#8fc4e8",
    fin: "#5b9cc9",
  },
  {
    id: "ca-bong",
    name: "Cá bống",
    rarity: 1,
    zones: { shore: 5, open: 0, deep: 0 },
    kg: [0.1, 0.5],
    lengthCm: 22,
    shape: "round",
    fight: "steady",
    body: "#b99a6b",
    fin: "#8b6f44",
  },
  {
    id: "ca-chim",
    name: "Cá chim",
    rarity: 1,
    zones: { shore: 3, open: 4, deep: 1 },
    kg: [0.4, 2.5],
    lengthCm: 30,
    shape: "diamond",
    fight: "steady",
    body: "#c9d6e3",
    fin: "#8ea4bd",
  },
  {
    id: "ca-noc",
    name: "Cá nóc",
    rarity: 2,
    zones: { shore: 4, open: 1, deep: 0 },
    kg: [0.3, 1.8],
    lengthCm: 26,
    shape: "puffer",
    fight: "crawler",
    body: "#e6c35a",
    fin: "#c99a1c",
  },
  {
    id: "ca-mu",
    name: "Cá mú",
    rarity: 2,
    zones: { shore: 2, open: 4, deep: 1 },
    kg: [1, 12],
    lengthCm: 36,
    shape: "chunky",
    fight: "heavy",
    body: "#d98b5f",
    fin: "#a9582f",
  },
  {
    id: "ca-thu",
    name: "Cá thu đảo",
    rarity: 2,
    zones: { shore: 0, open: 4, deep: 3 },
    kg: [1, 9],
    lengthCm: 44,
    shape: "torpedo",
    fight: "runner",
    body: "#5aa7d6",
    fin: "#2f78a8",
  },
  {
    id: "ca-hong",
    name: "Cá hồng",
    rarity: 2,
    zones: { shore: 0, open: 3, deep: 3 },
    kg: [0.8, 6],
    lengthCm: 34,
    shape: "round",
    fight: "steady",
    body: "#e0584f",
    fin: "#b03a33",
  },
  {
    id: "ca-ngu",
    name: "Cá ngừ",
    rarity: 3,
    zones: { shore: 0, open: 1, deep: 4 },
    kg: [5, 45],
    lengthCm: 41,
    shape: "torpedo",
    fight: "runner",
    body: "#2f5fa8",
    fin: "#1d3f78",
  },
  {
    id: "ca-duoi",
    name: "Cá đuối",
    rarity: 3,
    zones: { shore: 0, open: 2, deep: 3 },
    kg: [3, 35],
    lengthCm: 30,
    shape: "flat",
    fight: "glider",
    body: "#8f7fb8",
    fin: "#64558f",
  },
  {
    id: "ca-kiem",
    name: "Cá kiếm",
    rarity: 3,
    zones: { shore: 0, open: 0, deep: 3 },
    kg: [20, 120],
    lengthCm: 52,
    shape: "sword",
    fight: "runner",
    body: "#3b4f8c",
    fin: "#243063",
  },
];

const byId = new Map(SPECIES.map((species) => [species.id, species]));
export const speciesById = (id: string) => byId.get(id);

/** Where in the sea a cast lands decides which fish are there. */
export const SHORE_RANGE = 28;
export const DEEP_RANGE = 125;
export function zoneAt(x: number, z: number): Zone {
  let nearest = Infinity;
  for (const island of islands)
    nearest = Math.min(
      nearest,
      Math.hypot(x - island.x, z - island.z) - island.radius,
    );
  return nearest < SHORE_RANGE
    ? "shore"
    : nearest > DEEP_RANGE
      ? "deep"
      : "open";
}

export interface Catch {
  species: string;
  kg: number;
  cm: number;
}

const RARITY_WEIGHT: Record<Rarity, number> = { 1: 100, 2: 40, 3: 10 };
/** Fishing the spot fish like (see castTarget) makes the better fish likelier. */
const SWEET_BOOST = 1.8;

/** Chooses a fish for a zone. Small fish are common, big ones rare within a species. */
export function rollFish(
  zone: Zone,
  rng: () => number = Math.random,
  sweet = false,
): Catch {
  const weights = SPECIES.map(
    (species) =>
      species.zones[zone] *
      RARITY_WEIGHT[species.rarity] *
      (sweet && species.rarity > 1 ? SWEET_BOOST : 1),
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
  const raw = low + (high - low) * Math.pow(rng(), 2.4);
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
  /** False when the bobber would land on an island or outside the sea. */
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
  /** Where the bobber is (or will land), once cast. */
  landing: Point | undefined;
  /** 0..1 progress of the throw. */
  flight: number;
  /** Seconds since each recent nibble, newest last (for the bobber to jerk). */
  nibbleAges: number[];
  /** 0..1 of the hook window used up, while a fish is on. */
  hurry: number;
  /** The tug of war, once the fish is hooked. */
  fight: FightView | undefined;
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
): Round {
  const wait = sweet ? 1800 + rng() * 2000 : 2500 + rng() * 3500;
  const count = 1 + Math.floor(rng() * 3);
  const nibbles: number[] = [];
  let at = from + wait;
  for (let i = 0; i < count; i++) {
    nibbles.push(at);
    at += 500 + rng() * 600;
  }
  // Most fish that nibble then bite; some lose interest and a new one comes later.
  const bites = rng() < 0.8;
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
  private round: Round | undefined;
  private fired = 0;
  private fight: Fight | undefined;
  private hooked: Catch | undefined;
  private lastTick = 0;
  private readonly rng: () => number;
  private readonly emit: (event: FishingEvent) => void;
  private readonly speed: number;

  /** `speed` only exists so tests on a slow software renderer can run a fight faster. */
  constructor(
    emit: (event: FishingEvent) => void,
    rng: () => number = Math.random,
    speed = 1,
  ) {
    this.emit = emit;
    this.rng = rng;
    this.speed = speed;
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
      ? Math.min(1, (now - this.chargeStart) / CHARGE_MS)
      : 0;
  }

  /** Lets go of the button: throws if the bobber would land on water. */
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
        const fish = rollFish(this.zone, this.rng, this.sweet);
        const species = speciesById(fish.species);
        const [low, high] = species?.kg ?? [0, 1];
        this.hooked = fish;
        this.fight = new Fight({
          style: species?.fight ?? "steady",
          weight: high > low ? (fish.kg - low) / (high - low) : 0,
          distance,
          maxLine: MAX_LINE,
          rng: this.rng,
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
      this.round = planRound(now, this.sweet, this.rng);
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
        this.round = planRound(now, this.sweet, this.rng);
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
