import { speciesById } from "./fishing.ts";

/**
 * The fishing leaderboard, as the server returns it (`economy_leaderboard`, decision 0017): two
 * boards, the fish caught in all and the heaviest single fish. This file is only the shape and the
 * reading of the answer; the ranking itself is the database's.
 */
export type BoardKind = "caught" | "heaviest";

/** The server returns at most this many rows per board. */
export const BOARD_SIZE = 20;
export const NAME_MAX = 24;

export interface BoardRow {
  /** 1 for the first; equal values share a rank. */
  rank: number;
  name: string;
  /** Fish caught, or kg for the heaviest board. */
  value: number;
  /** The species of the heaviest fish (that board only). */
  species?: string;
  /** This row is the player asking. */
  you: boolean;
}
export interface Board {
  /** How many players have a place on this board. */
  players: number;
  top: BoardRow[];
  /** The player's own place, also when it is below the top. Absent when they have no place yet. */
  me?: { rank: number; value: number; species?: string };
}
export interface Leaderboard {
  caught: Board;
  heaviest: Board;
}

export const emptyLeaderboard = (): Leaderboard => ({
  caught: { players: 0, top: [] },
  heaviest: { players: 0, top: [] },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(max, value)
    : undefined;

function readRow(raw: unknown, kind: BoardKind): BoardRow | undefined {
  if (!isRecord(raw)) return undefined;
  const rank = count(raw.rank, 1_000_000);
  const value = count(raw.value, 1_000_000);
  if (!rank || value === undefined || typeof raw.name !== "string")
    return undefined;
  const name = raw.name.trim().slice(0, NAME_MAX);
  if (!name) return undefined;
  const species =
    kind === "heaviest" &&
    typeof raw.species === "string" &&
    speciesById(raw.species)
      ? raw.species
      : undefined;
  return {
    rank: Math.floor(rank),
    name,
    value,
    ...(species ? { species } : {}),
    you: raw.you === true,
  };
}

function readBoard(raw: unknown, kind: BoardKind): Board {
  if (!isRecord(raw)) return { players: 0, top: [] };
  const top = (Array.isArray(raw.top) ? raw.top : [])
    .slice(0, BOARD_SIZE)
    .map((row) => readRow(row, kind))
    .filter((row): row is BoardRow => row !== undefined);
  const board: Board = {
    players: Math.floor(count(raw.players, 1_000_000) ?? top.length),
    top,
  };
  if (isRecord(raw.me)) {
    const rank = count(raw.me.rank, 1_000_000);
    const value = count(raw.me.value, 1_000_000);
    if (rank && value !== undefined) {
      const species =
        kind === "heaviest" &&
        typeof raw.me.species === "string" &&
        speciesById(raw.me.species)
          ? raw.me.species
          : undefined;
      board.me = {
        rank: Math.floor(rank),
        value,
        ...(species ? { species } : {}),
      };
    }
  }
  return board;
}

/** Reads the server's answer defensively: a malformed row is dropped, never thrown on. */
export function readLeaderboard(raw: unknown): Leaderboard {
  const source = isRecord(raw) ? raw : {};
  return {
    caught: readBoard(source.caught, "caught"),
    heaviest: readBoard(source.heaviest, "heaviest"),
  };
}

/** "123 con" or "12,5 kg". */
export function boardValue(kind: BoardKind, value: number): string {
  return kind === "caught"
    ? `${Math.floor(value).toLocaleString("vi-VN")} con`
    : `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg`;
}

/**
 * The player's own line under the list: where they stand, or what is missing to stand anywhere.
 * `rows` is the board; a player already in the top 20 needs no extra line (their row is marked).
 */
export function ownPlace(board: Board): "top" | "below" | "none" {
  if (!board.me) return "none";
  return board.top.some((row) => row.you) ? "top" : "below";
}

/** This Vietnamese week's two boards (decision 0021): the same shape, with the week and when it ends. */
export interface WeeklyLeaderboard extends Leaderboard {
  /** The Monday the week began, "YYYY-MM-DD". */
  week: string;
  /** When the week ends (ms, the shared clock's scale). */
  endsAt: number;
}
export function readWeeklyBoard(raw: unknown): WeeklyLeaderboard {
  const source = isRecord(raw) ? raw : {};
  return {
    ...readLeaderboard(raw),
    week: typeof source.week === "string" ? source.week.slice(0, 10) : "",
    endsAt: count(source.endsAt, 8.64e15) ?? 0,
  };
}
