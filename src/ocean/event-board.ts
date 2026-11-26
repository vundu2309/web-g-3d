import { speciesById } from "./fishing.ts";
import { NAME_MAX } from "./leaderboard.ts";

/**
 * The board of one hourly event, as `economy_event_board` returns it (decision 0021): the best
 * single catch of each player by price, then weight. Shape and defensive reading only; the ranking
 * is the database's.
 */
export interface EventRow {
  rank: number;
  name: string;
  species: string;
  kg: number;
  score: number;
  you: boolean;
}
export interface EventBoard {
  slot: number;
  /** The event's 20 minutes are running. */
  active: boolean;
  startsAt: number;
  endsAt: number;
  players: number;
  top: EventRow[];
  me?: { rank: number; species: string; kg: number; score: number };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, max = 1e15): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(max, value)
    : undefined;

export function readEventBoard(raw: unknown): EventBoard {
  const source = isRecord(raw) ? raw : {};
  const top: EventRow[] = [];
  for (const item of (Array.isArray(source.top) ? source.top : []).slice(
    0,
    20,
  )) {
    if (!isRecord(item)) continue;
    const rank = num(item.rank, 1_000_000);
    const kg = num(item.kg, 1000);
    const score = num(item.score, 1_000_000);
    if (
      !rank ||
      kg === undefined ||
      score === undefined ||
      typeof item.name !== "string" ||
      typeof item.species !== "string" ||
      !speciesById(item.species)
    )
      continue;
    const name = item.name.trim().slice(0, NAME_MAX);
    if (!name) continue;
    top.push({
      rank: Math.floor(rank),
      name,
      species: item.species,
      kg,
      score: Math.floor(score),
      you: item.you === true,
    });
  }
  const board: EventBoard = {
    slot: Math.floor(num(source.slot) ?? 0),
    active: source.active === true,
    startsAt: num(source.startsAt) ?? 0,
    endsAt: num(source.endsAt) ?? 0,
    players: Math.floor(num(source.players, 1_000_000) ?? top.length),
    top,
  };
  if (isRecord(source.me)) {
    const rank = num(source.me.rank, 1_000_000);
    const kg = num(source.me.kg, 1000);
    const score = num(source.me.score, 1_000_000);
    if (
      rank &&
      kg !== undefined &&
      score !== undefined &&
      typeof source.me.species === "string" &&
      speciesById(source.me.species)
    )
      board.me = {
        rank: Math.floor(rank),
        species: source.me.species,
        kg,
        score: Math.floor(score),
      };
  }
  return board;
}

/** The species the hourly event's giants are (the database takes an event card only from these). */
export const GIANT_SPECIES: readonly string[] = ["tom-hum", "ca-heo", "ca-map"];
/**
 * The database counts a catch for the event from this fraction of the species' weight range up:
 * the client rolls the top 12 % (`GIANT_FROM`, 0.88), the server is a little more lenient (0.87).
 */
export const GIANT_RATIO = 0.87;
/** The lightest weight (kg) that counts as an event giant of `species`; Infinity for another species. */
export function giantFloor(species: string): number {
  const found = GIANT_SPECIES.includes(species)
    ? speciesById(species)
    : undefined;
  return found
    ? found.kg[0] + GIANT_RATIO * (found.kg[1] - found.kg[0])
    : Infinity;
}
