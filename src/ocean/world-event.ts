import { hash32 } from "./atmosphere.ts";
import { SPECIES, zoneAt } from "./fishing.ts";
import { slotOf, slotStart, HOUR_MS } from "./game-clock.ts";
import { compassWord, isOpenWater } from "./hot-spots.ts";
import { timeLeftText } from "./game-clock.ts";
import { coastDistance } from "./shore.ts";
import { HARBOR } from "./model.ts";

/**
 * The hourly event (decision 0020): every hour of the shared server clock a ring of light appears
 * on the sea for 20 minutes, at a place every player is told. A lure that lands in the ring fishes
 * for GIANTS: a species met in deep water, rolled from the top of its weight range (an existing
 * species and weight range, so the server accepts the catch as it is). Each player may land
 * `GIANT_QUOTA` giants in one event. It is a pure function of the clock, like the hot spots.
 *
 * The quota is kept on the device (`quotaKey`); the server counts the same limit when the event
 * board is built (phase P4). A modified client can ignore the device's count, which is why the
 * reward is the fish's ordinary price and the board has no coin prize (decisions 0010 and 0017).
 */
export const EVENT_SLOT_MS = HOUR_MS;
export const EVENT_WINDOW_MS = 20 * 60_000;
/** The ring's radius (m): a lure within it is in the event. */
export const EVENT_RADIUS = 45;
export const GIANT_QUOTA = 3;
const SALT = 0xe7e47;
/** Where the ring may be: at least this far (m) from every coast, and between these distances from the harbour. */
const COAST_FAR = 60;
const HARBOR_RANGE = [250, 900] as const;
const TRIES = 16;

/**
 * Eight vetted places for when no hashed one passes (the function never returns nothing): open
 * water well off the islands, 300 to 900 m from the harbour. A test checks every one.
 */
export const FALLBACK_SPOTS: readonly { x: number; z: number }[] = [
  { x: 150, z: 330 },
  { x: -300, z: 240 },
  { x: -250, z: -200 },
  { x: 120, z: -380 },
  { x: 560, z: 150 },
  { x: -520, z: 520 },
  { x: 300, z: -700 },
  { x: -400, z: -750 },
];

export interface WorldEvent {
  slot: number;
  /** The ring is on now (the first 20 minutes of the hour). */
  active: boolean;
  startsAtMs: number;
  endsAtMs: number;
  x: number;
  z: number;
}

const unit = (h: number) => h / 4294967296;

function placeOf(slot: number): { x: number; z: number } {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const base = slot * 6151 + attempt * 37 + SALT;
    const angle = unit(hash32(base)) * Math.PI * 2;
    const distance =
      HARBOR_RANGE[0] +
      unit(hash32(base + 1)) * (HARBOR_RANGE[1] - HARBOR_RANGE[0]);
    const x = HARBOR.x + Math.cos(angle) * distance;
    const z = HARBOR.z + Math.sin(angle) * distance;
    if (!isOpenWater(x, z)) continue;
    const zone = zoneAt(x, z);
    if (zone === "shore" || coastDistance(x, z) < COAST_FAR) continue;
    return { x: Math.round(x), z: Math.round(z) };
  }
  return FALLBACK_SPOTS[hash32(slot + SALT) % FALLBACK_SPOTS.length]!;
}

const cache = new Map<number, { x: number; z: number }>();

/** The event of the hour `worldMs` is in (the same for everyone). */
export function eventAt(worldMs: number): WorldEvent {
  const slot = slotOf(worldMs, EVENT_SLOT_MS);
  let place = cache.get(slot);
  if (!place) {
    if (cache.size > 32) cache.clear();
    place = placeOf(slot);
    cache.set(slot, place);
  }
  const startsAtMs = slotStart(slot, EVENT_SLOT_MS);
  return {
    slot,
    active: worldMs - startsAtMs < EVENT_WINDOW_MS,
    startsAtMs,
    endsAtMs: startsAtMs + EVENT_WINDOW_MS,
    x: place.x,
    z: place.z,
  };
}

/** A lure landing at (x, z) is in the ring. */
export const inRing = (ev: WorldEvent, x: number, z: number) =>
  Math.hypot(x - ev.x, z - ev.z) <= EVENT_RADIUS;

/**
 * Multipliers for the species chance inside the ring: 1 for the species a giant may be (rarity 2
 * or 3 and met in deep water: the lobster, the dolphin, the shark), 0 for all others, so a lure in
 * the ring only ever lands a giant. The ring lies in open or deep water, where all three live.
 */
export function giantWeights(): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const species of SPECIES)
    weights[species.id] = species.rarity >= 2 && species.zones.deep > 0 ? 1 : 0;
  return weights;
}

/** The key under which a device keeps how many giants it has landed in an event's slot. */
export const quotaKey = (slot: number) => `seaplanes.event.${slot}`;

/** How many giants may still be landed in this slot, given what the device recorded (a bad value counts as none recorded). */
export function giantsLeft(recorded: string | null | undefined): number {
  const n = Number(recorded);
  const used = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return Math.max(0, GIANT_QUOTA - used);
}

/** The Sự kiện page's words about the event now, for a player at `from`. */
export function eventText(
  ev: WorldEvent,
  worldMs: number,
  from: { x: number; z: number },
): { title: string; where: string } {
  const dx = ev.x - from.x;
  const dz = ev.z - from.z;
  const where = `Vòng sáng cách bạn ${Math.round(Math.hypot(dx, dz))} m, về phía ${compassWord(dx, dz)}.`;
  if (ev.active)
    return {
      title: `Cá khổng lồ đang xuất hiện · ${timeLeftText(ev.endsAtMs - worldMs)}`,
      where,
    };
  return {
    title: `Sự kiện tiếp theo ${timeLeftText(ev.startsAtMs + EVENT_SLOT_MS - worldMs)}`,
    where: "Vòng sáng sẽ hiện ở một chỗ mới trên biển.",
  };
}
