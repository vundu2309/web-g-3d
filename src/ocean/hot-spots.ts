import { hash32 } from "./atmosphere.ts";
import { SPECIES, zoneAt, type Zone } from "./fishing.ts";
import { slotOf, slotStart } from "./game-clock.ts";
import { MARKETS, MARKET_BODY_RADIUS } from "./market.ts";
import { HARBOR, SEA_BOUND, islandCollisionRadius, islands } from "./model.ts";

/**
 * The hot spots: every 15 minutes of the shared server clock, three places on the sea where one
 * kind of fish is easier to meet ("quanh Hải Đăng: cá mập"). They are a pure function of the clock
 * (`hotSpotsAt`), so every player is told the same places and nothing is sent; they change slot by
 * slot, and a lure that lands inside one multiplies the chance of that species and shortens the wait.
 * One spot is for a common fish (rarity 1), one for a fine fish (2) and one for a rare one (3).
 *
 * A spot sits where its species lives: the zone the species is likeliest in (`bestZone`) decides
 * how far from an island it is (a shore fish a few metres off the beach, a deep-sea fish well out),
 * and a place is used only if it is open water, clear of every island, market and the harbour, and
 * `zoneAt` says it IS that zone (otherwise the boost would do nothing there).
 */
export const HOT_SLOT_MS = 15 * 60_000;
/** A lure that lands this close (m) to a spot's centre is in it. */
export const HOT_RADIUS = 55;
/** The multiplier for the species' chance in a spot, and for the wait. */
export const HOT_BOOST = 3.5;
export const HOT_WAIT = 0.9;
/** Rarities of the three spots of a slot. */
const RARITIES = [1, 2, 3] as const;
/** How far from an island's collision circle (m) a spot is looked for, by the zone. */
const OFFSET: Readonly<Record<Zone, readonly [number, number]>> = {
  shore: [4, 18],
  open: [40, 110],
  deep: [150, 260],
};
/** Tries to place one spot, and the least distance (m) between two spots of a slot. */
const TRIES = 12;
const APART = 120;
/** Clear of the harbour (m), of an island's collision circle (m) and of a market's pier (m). */
const HARBOR_CLEAR = 60;
const ISLAND_CLEAR = 3;
const MARKET_CLEAR = 25;
const SALT = 0x57a7e;

export interface HotSpot {
  slot: number;
  /** 0..2: which of the slot's three. */
  index: number;
  species: string;
  zone: Zone;
  x: number;
  z: number;
  radius: number;
  /** The island it is off. */
  island: number;
  /** "quanh Hải Đăng" or "đảo phía tây". */
  label: string;
  /** When the slot ends (ms of the shared clock). */
  endsAtMs: number;
}

/** The zone a species is likeliest in (the first of shore, open, deep on a tie). */
export function bestZone(id: string): Zone {
  const zones = SPECIES.find((s) => s.id === id)?.zones;
  let best: Zone = "open";
  let weight = -1;
  for (const zone of ["shore", "open", "deep"] as const) {
    const w = zones?.[zone] ?? 0;
    if (w > weight) {
      weight = w;
      best = zone;
    }
  }
  return best;
}

const unit = (h: number) => h / 4294967296;

/** Open water the line may be cast to (the rule of `castTarget`), clear of the harbour and of the solids. */
export function isOpenWater(x: number, z: number): boolean {
  if (Math.abs(x) >= SEA_BOUND - 4 || Math.abs(z) >= SEA_BOUND - 4)
    return false;
  if (Math.hypot(x - HARBOR.x, z - HARBOR.z) < HARBOR_CLEAR) return false;
  return (
    islands.every(
      (i) =>
        Math.hypot(x - i.x, z - i.z) > islandCollisionRadius(i) + ISLAND_CLEAR,
    ) &&
    MARKETS.every(
      (m) => Math.hypot(x - m.x, z - m.z) > MARKET_BODY_RADIUS + MARKET_CLEAR,
    )
  );
}

const COMPASS = [
  "bắc",
  "đông bắc",
  "đông",
  "đông nam",
  "nam",
  "tây nam",
  "tây",
  "tây bắc",
] as const;

/** The compass word for a direction (dx east, dz south; north is -Z, as on the map): "bắc", "đông nam"... */
export function compassWord(dx: number, dz: number): string {
  const bearing = Math.atan2(dx, -dz);
  const eighth =
    Math.round(
      (((bearing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) /
        (Math.PI / 4),
    ) % 8;
  return COMPASS[eighth]!;
}

/** How a player reads the place: a market's name, or the island's direction from the harbour. */
export function labelOfIsland(index: number): string {
  const market = MARKETS.find((m) => m.island === index);
  if (market) return `quanh ${market.name.replace(/^Chợ /, "")}`;
  const island = islands[index]!;
  return `đảo phía ${compassWord(island.x - HARBOR.x, island.z - HARBOR.z)}`;
}

function placeSpot(
  slot: number,
  index: number,
  taken: HotSpot[],
): HotSpot | undefined {
  const rarity = RARITIES[index]!;
  const candidates = SPECIES.filter((s) => s.rarity === rarity);
  const species =
    candidates[hash32(slot * 977 + index * 131 + SALT) % candidates.length]!;
  const zone = bestZone(species.id);
  const [near, far] = OFFSET[zone];
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const base = slot * 7919 + index * 104_729 + attempt * 31 + SALT;
    const k = hash32(base) % islands.length;
    const island = islands[k]!;
    const angle = unit(hash32(base + 1)) * Math.PI * 2;
    const distance =
      islandCollisionRadius(island) +
      near +
      unit(hash32(base + 2)) * (far - near);
    const x = island.x + Math.cos(angle) * distance;
    const z = island.z + Math.sin(angle) * distance;
    if (!isOpenWater(x, z) || zoneAt(x, z) !== zone) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < APART)) continue;
    return {
      slot,
      index,
      species: species.id,
      zone,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      radius: HOT_RADIUS,
      island: k,
      label: labelOfIsland(k),
      endsAtMs: slotStart(slot + 1, HOT_SLOT_MS),
    };
  }
  return undefined;
}

const cache = new Map<number, readonly HotSpot[]>();

/** The hot spots of one slot (the same for everyone; a spot that found no place is left out). */
export function hotSpotsOfSlot(slot: number): readonly HotSpot[] {
  const known = cache.get(slot);
  if (known) return known;
  const spots: HotSpot[] = [];
  for (let i = 0; i < RARITIES.length; i++) {
    const spot = placeSpot(slot, i, spots);
    if (spot) spots.push(spot);
  }
  if (cache.size > 64) cache.clear();
  cache.set(slot, spots);
  return spots;
}

/** The hot spots now. */
export const hotSpotsAt = (worldMs: number) =>
  hotSpotsOfSlot(slotOf(worldMs, HOT_SLOT_MS));

/** The spot a lure landing at (x, z) is in, if any (the nearest centre if two overlap). */
export function hotSpotAt(
  worldMs: number,
  x: number,
  z: number,
): HotSpot | undefined {
  let found: HotSpot | undefined;
  let nearest = Infinity;
  for (const spot of hotSpotsAt(worldMs)) {
    const d = Math.hypot(x - spot.x, z - spot.z);
    if (d <= spot.radius && d < nearest) {
      found = spot;
      nearest = d;
    }
  }
  return found;
}
