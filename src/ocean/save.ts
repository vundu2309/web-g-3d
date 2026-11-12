import { speciesById, type Inventory } from "./fishing.ts";
import { SEA_BOUND, type Pose } from "./model.ts";
import { seaObstacles } from "./market.ts";

/**
 * What the player keeps between visits: where the boat was and how many fish they
 * caught. Stored on this device, per account. Anything read back is untrusted (old
 * versions, hand-edited storage, a changed map), so it is validated and a bad or
 * stale position falls back to the harbor instead of dropping the boat on an island.
 */
export interface SeaSave {
  x: number;
  z: number;
  heading: number;
  /** Fish caught since the start, for the record (the store may hold fewer). */
  caught: number;
  /** The fish store: what is held now and the best weight per species. */
  fish?: Inventory;
}
export interface RestoredSea {
  /** The boat's last position, or undefined when it is missing, stale or unsafe. */
  pose?: Pose;
  caught: number;
  fish: Inventory;
}

const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CAUGHT = 1_000_000;
export const saveKey = (uid: string) => `photyphu:sea:v${VERSION}:${uid}`;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function encodeSave(state: SeaSave, now: number = Date.now()): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return JSON.stringify({
    v: VERSION,
    savedAt: now,
    x: round(state.x),
    z: round(state.z),
    heading: round(state.heading),
    caught: Math.max(0, Math.min(MAX_CAUGHT, Math.floor(state.caught))),
    fish: cleanFish(state.fish),
  });
}

const MAX_HELD = 9999;
const MAX_KG = 500;
/** Keeps only known species with sane numbers; anything else in storage is dropped. */
function cleanFish(value: unknown): Inventory {
  const out: Inventory = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [id, stock] of Object.entries(value as Record<string, unknown>)) {
    if (!speciesById(id) || !stock || typeof stock !== "object") continue;
    const { n, best } = stock as Record<string, unknown>;
    const held = finite(n) ? Math.min(MAX_HELD, Math.max(0, Math.floor(n))) : 0;
    const record = finite(best) ? Math.min(MAX_KG, Math.max(0, best)) : 0;
    if (held > 0 || record > 0)
      out[id] = { n: held, best: Math.round(record * 100) / 100 };
  }
  return out;
}

export function decodeSave(
  raw: string | null,
  now: number = Date.now(),
): RestoredSea {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { caught: 0, fish: {} };
    data = parsed as Record<string, unknown>;
  } catch {
    return { caught: 0, fish: {} };
  }
  if (data.v !== VERSION) return { caught: 0, fish: {} };
  const caught =
    finite(data.caught) && data.caught >= 0
      ? Math.min(MAX_CAUGHT, Math.floor(data.caught))
      : 0;
  const fish = cleanFish(data.fish);
  const { x, z, heading, savedAt } = data;
  if (!finite(x) || !finite(z) || !finite(heading) || !finite(savedAt))
    return { caught, fish };
  // Fresh, from the past, inside the sea with some margin and not near any island.
  if (now - savedAt > MAX_AGE_MS || savedAt - now > 60_000)
    return { caught, fish };
  if (Math.abs(heading) > Math.PI) return { caught, fish };
  if (Math.abs(x) > SEA_BOUND - 6 || Math.abs(z) > SEA_BOUND - 6)
    return { caught, fish };
  // Not near an island, nor inside or beside a market pier (see market.ts).
  if (seaObstacles().some((o) => Math.hypot(x - o.x, z - o.z) < o.radius + 5))
    return { caught, fish };
  return { pose: { x, z, heading, fishing: false }, caught, fish };
}
