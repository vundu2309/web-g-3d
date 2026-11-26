import { atmosphereAt, type WeatherKind } from "./atmosphere.ts";
import { SPECIES, type Conditions, type Zone } from "./fishing.ts";
import { HOT_BOOST, HOT_WAIT, hotSpotAt } from "./hot-spots.ts";

/**
 * What the time of day and the weather give a lure (decision 0020), as plain numbers: which fish
 * are easier to meet at night, in rain or in fog, and how quickly they bite. It reads the SHARED
 * server clock (the `worldMs` the caller passes), never the sea's look (`SEA.*`): the look can be
 * pinned on a device, the bites cannot, so every player fishes in the same sea. The effect is
 * small and bounded: a species' chance is changed by between 0.5 and 2.5 times, the bite chance
 * is at most 0.95 and the wait is 0.8 to 1.2 times.
 *
 * `fishing.ts` knows nothing of this: it takes the `Conditions` this builds (or none, and then
 * nothing changes).
 */
export type Band = "night" | "twilight" | "day";

/** Daylight (0..1, atmosphere.ts) under which it is night, and under which it is twilight. */
export const NIGHT_BELOW = 0.15;
export const TWILIGHT_BELOW = 0.6;

/** One layer: multipliers for species by id, a bite chance to raise to, and a multiplier for the wait. */
interface Layer {
  weights?: Readonly<Record<string, number>>;
  bite?: number;
  wait?: number;
}

/** By the time of day. */
export const BANDS: Readonly<Record<Band, Layer>> = {
  night: {
    weights: {
      "tom-hum": 1.6,
      "ca-map": 1.4,
      "cua-bien": 1.3,
      "ca-heo": 0.6,
      "ca-he": 0.6,
    },
    wait: 1.1,
  },
  twilight: { weights: { "ca-ngua": 1.3 }, bite: 0.85, wait: 0.9 },
  day: { weights: { "ca-heo": 1.4, "ca-he": 1.3, "rua-bien": 1.2 } },
};

/** By the weather. */
export const SKIES: Readonly<Record<WeatherKind, Layer>> = {
  clear: {},
  overcast: { bite: 0.85 },
  rain: {
    weights: { "cua-bien": 1.4, "sao-bien": 1.3, sua: 1.2 },
    bite: 0.9,
    wait: 0.9,
  },
  fog: { weights: { sua: 1.5, "ca-map": 1.3 }, wait: 1.15 },
};

/** A species' product over the layers stays in this range, and a bite chance and a wait stay in theirs. */
export const WEIGHT_RANGE = [0.5, 2.5] as const;
export const BITE_MAX = 0.95;
export const WAIT_RANGE = [0.8, 1.2] as const;
/** A species counts as "easy to meet" from this multiplier up (what the book says). */
export const EASY_FROM = 1.15;

const clamp = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.min(hi, Math.max(lo, v));

export const bandOf = (daylight: number): Band =>
  daylight < NIGHT_BELOW
    ? "night"
    : daylight < TWILIGHT_BELOW
      ? "twilight"
      : "day";

/** The sea at a time, in the terms the player reads (the book's "Biển bây giờ"). */
export interface Sea {
  band: Band;
  weather: WeatherKind;
  /** The multiplier of each species the layers change (clamped); the others are 1. */
  weights: Record<string, number>;
  biteChance: number;
  waitScale: number;
  /** Species ids that are easy to meet now, the likeliest first. */
  easy: string[];
}

/** The time and the weather, without any place: the same everywhere on the sea. */
export function seaAt(worldMs: number): Sea {
  const a = atmosphereAt(worldMs);
  const band = bandOf(a.daylight);
  const weather = a.weather.kind;
  const layers = [BANDS[band], SKIES[weather]];
  const raw: Record<string, number> = {};
  for (const layer of layers)
    for (const [id, w] of Object.entries(layer.weights ?? {}))
      raw[id] = (raw[id] ?? 1) * w;
  const weights: Record<string, number> = {};
  for (const [id, w] of Object.entries(raw))
    weights[id] = clamp(w, WEIGHT_RANGE);
  const bite = Math.min(
    BITE_MAX,
    Math.max(0.8, ...layers.map((l) => l.bite ?? 0)),
  );
  const wait = clamp(
    layers.reduce((product, l) => product * (l.wait ?? 1), 1),
    WAIT_RANGE,
  );
  const easy = Object.entries(weights)
    .filter(([, w]) => w >= EASY_FROM)
    .sort((x, y) => y[1] - x[1])
    .map(([id]) => id);
  return { band, weather, weights, biteChance: bite, waitScale: wait, easy };
}

/** `Conditions` for the fishing rules from a sea (nothing in it is a place). */
export function conditionsOfSea(sea: Sea): Conditions {
  return {
    weights: sea.weights,
    biteChance: sea.biteChance,
    waitScale: sea.waitScale,
  };
}

/**
 * What the sea gives a lure that lands at (x, z) at `worldMs`: the time and the weather
 * (everywhere), and a hot spot's boost (where it lands in one). The species' multiplier from the
 * time and the weather stays inside its range; the hot spot's boost is applied after, so it keeps
 * its size.
 */
export function conditionsAt(
  worldMs: number,
  x: number,
  z: number,
): Conditions {
  const sea = seaAt(worldMs);
  const spot = hotSpotAt(worldMs, x, z);
  if (!spot) return conditionsOfSea(sea);
  return {
    weights: {
      ...sea.weights,
      [spot.species]: (sea.weights[spot.species] ?? 1) * HOT_BOOST,
    },
    biteChance: sea.biteChance,
    waitScale: clamp(sea.waitScale * HOT_WAIT, WAIT_RANGE),
  };
}

// ----- Where a species is found, from the same tables (the book reads this, so the words and the odds cannot drift) -----

export interface Habitat {
  /** Zones where the species is met, the likeliest first. */
  zones: Zone[];
  /** The times of day that favour it. */
  bands: Band[];
  /** The weathers that favour it. */
  weathers: WeatherKind[];
}

export function habitatOf(id: string): Habitat {
  const species = SPECIES.find((s) => s.id === id);
  const zones = (Object.entries(species?.zones ?? {}) as [Zone, number][])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([zone]) => zone);
  const bands = (Object.keys(BANDS) as Band[]).filter(
    (band) => (BANDS[band].weights?.[id] ?? 1) >= EASY_FROM,
  );
  const weathers = (Object.keys(SKIES) as WeatherKind[]).filter(
    (kind) => (SKIES[kind].weights?.[id] ?? 1) >= EASY_FROM,
  );
  return { zones, bands, weathers };
}
