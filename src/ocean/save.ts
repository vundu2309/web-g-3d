import {
  SEA_BOUND,
  islandCollisionRadius,
  islands,
  type Pose,
} from "./model.ts";

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
  caught: number;
}
export interface RestoredSea {
  /** The boat's last position, or undefined when it is missing, stale or unsafe. */
  pose?: Pose;
  caught: number;
}

const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CAUGHT = 1_000_000;
export const saveKey = (uid: string) => `photyphu:sea:v${VERSION}:${uid}`;

export function encodeSave(state: SeaSave, now: number = Date.now()): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return JSON.stringify({
    v: VERSION,
    savedAt: now,
    x: round(state.x),
    z: round(state.z),
    heading: round(state.heading),
    caught: Math.max(0, Math.min(MAX_CAUGHT, Math.floor(state.caught))),
  });
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function decodeSave(
  raw: string | null,
  now: number = Date.now(),
): RestoredSea {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { caught: 0 };
    data = parsed as Record<string, unknown>;
  } catch {
    return { caught: 0 };
  }
  if (data.v !== VERSION) return { caught: 0 };
  const caught =
    finite(data.caught) && data.caught >= 0
      ? Math.min(MAX_CAUGHT, Math.floor(data.caught))
      : 0;
  const { x, z, heading, savedAt } = data;
  if (!finite(x) || !finite(z) || !finite(heading) || !finite(savedAt))
    return { caught };
  // Fresh, from the past, inside the sea with some margin and not near any island.
  if (now - savedAt > MAX_AGE_MS || savedAt - now > 60_000) return { caught };
  if (Math.abs(heading) > Math.PI) return { caught };
  if (Math.abs(x) > SEA_BOUND - 6 || Math.abs(z) > SEA_BOUND - 6)
    return { caught };
  if (
    islands.some(
      (i) => Math.hypot(x - i.x, z - i.z) < islandCollisionRadius(i) + 5,
    )
  )
    return { caught };
  return { pose: { x, z, heading, fishing: false }, caught };
}
