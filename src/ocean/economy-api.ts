import { CATCH_COOLDOWN_SECONDS, LEDGER_CAP, priceOf } from "./economy.ts";
import { speciesById, type Inventory } from "./fishing.ts";
import { SEA_BOUND } from "./model.ts";

/** The most fish the one-time import moves (the server says the same), and the count it accepts. */
export const IMPORT_MAX_FISH = 100;
export const POSE_SAVE_SECONDS = 10;

/**
 * The player's money, as the app sees it: a wallet and a ledger of caught fish kept on the
 * SERVER (see docs/decisions/0010-server-economy.md). `supabaseEconomy` calls the database
 * RPCs; `memoryEconomy` follows the same rules in memory, for tests and for developing the
 * market screens before the migration is applied to a real project.
 */
export interface LedgerFish {
  id: number;
  species: string;
  kg: number;
  /** Coins this fish sells for, priced by the database. */
  price: number;
}
export interface EconomyState {
  coins: number;
  ledger: LedgerFish[];
}
/**
 * What the server keeps about the player besides money: fish caught, the heaviest fish of each
 * species, and where the boat last was. `imported` says the fish store kept on the device has
 * already been moved to the server (that happens once per account).
 */
export interface Profile {
  caught: number;
  /** Heaviest fish per species in kg. */
  records: Record<string, number>;
  imported: boolean;
  /** The last saved boat position and how many seconds ago it was saved. */
  pose?: { x: number; z: number; heading: number; age: number };
}
export interface ImportResult {
  imported: number;
  already: boolean;
}
export interface SoldFish {
  species: string;
  kg: number;
}
export interface SellResult {
  sold: number;
  earned: number;
  coins: number;
}

/** Why a call failed, in terms the screen can word. */
export type EconomyFailure =
  | "closed" // the economy is not set up on this server yet
  | "signin" // not signed in
  | "fast" // a catch reported too soon after the last one
  | "full" // too many unsold fish
  | "invalid" // not a fish the ledger holds / out of range
  | "network";

export class EconomyError extends Error {
  readonly failure: EconomyFailure;
  constructor(failure: EconomyFailure, message: string = failure) {
    super(message);
    this.name = "EconomyError";
    this.failure = failure;
  }
}

export interface EconomyApi {
  state(): Promise<EconomyState>;
  /** A fish the player landed and kept. */
  recordCatch(fish: SoldFish): Promise<void>;
  /** Sells the listed fish, or everything when `fish` is null. */
  sell(fish: readonly SoldFish[] | null): Promise<SellResult>;
  /** The profile (counts, records, boat position). */
  profile(): Promise<Profile>;
  /** Puts the lightest fish of a species back in the sea (it pays nothing). */
  release(species: string): Promise<void>;
  /** Saves where the boat is; the server keeps at most one save every 10 seconds. */
  savePose(pose: { x: number; z: number; heading: number }): Promise<void>;
  /** Moves the fish store kept on the device to the server, once per account. */
  importLocal(fish: Inventory, caught: number): Promise<ImportResult>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The same rules as the database, in memory (tests and development). */
export function memoryEconomy(
  options: { now?: () => number; coins?: number } = {},
): EconomyApi {
  const now = options.now ?? (() => Date.now());
  let coins = options.coins ?? 0;
  let lastCatch: number | undefined;
  let nextId = 1;
  let ledger: { id: number; species: string; kg: number }[] = [];
  let caught = 0;
  let records: Record<string, number> = {};
  let imported = false;
  let pose: { x: number; z: number; heading: number; at: number } | undefined;
  const priced = (row: {
    id: number;
    species: string;
    kg: number;
  }): LedgerFish => ({
    ...row,
    price: priceOf(speciesById(row.species)!, row.kg),
  });
  return {
    async state() {
      return { coins, ledger: ledger.map(priced) };
    },
    async recordCatch(fish) {
      const species = speciesById(fish.species);
      const kg = round2(fish.kg);
      if (!species || kg < species.kg[0] || kg > species.kg[1])
        throw new EconomyError("invalid");
      if (
        lastCatch !== undefined &&
        now() - lastCatch < CATCH_COOLDOWN_SECONDS * 1000
      )
        throw new EconomyError("fast");
      if (ledger.length >= LEDGER_CAP) throw new EconomyError("full");
      ledger.push({ id: nextId++, species: fish.species, kg });
      lastCatch = now();
      caught = Math.min(1_000_000, caught + 1);
      records = {
        ...records,
        [fish.species]: Math.max(records[fish.species] ?? 0, kg),
      };
    },
    async profile() {
      return {
        caught,
        records: { ...records },
        imported,
        pose: pose && {
          x: pose.x,
          z: pose.z,
          heading: pose.heading,
          age: Math.round((now() - pose.at) / 1000),
        },
      };
    },
    async release(species) {
      const lightest = ledger
        .filter((row) => row.species === species)
        .sort((a, b) => a.kg - b.kg || a.id - b.id)[0];
      if (!lightest) throw new EconomyError("invalid");
      ledger = ledger.filter((row) => row !== lightest);
    },
    async savePose(next) {
      const ok = [next.x, next.z, next.heading].every(Number.isFinite);
      if (
        !ok ||
        Math.abs(next.x) > SEA_BOUND ||
        Math.abs(next.z) > SEA_BOUND ||
        Math.abs(next.heading) > 3.2
      )
        throw new EconomyError("invalid");
      if (pose && now() - pose.at < POSE_SAVE_SECONDS * 1000) return;
      pose = { x: next.x, z: next.z, heading: next.heading, at: now() };
    },
    async importLocal(fish, count) {
      if (imported) return { imported: 0, already: true };
      let moved = 0;
      const claimed = (stock: { n?: unknown }) =>
        Math.max(0, Math.min(100, Math.floor(Number(stock.n) || 0)));
      const valid = Object.entries(fish)
        .filter(([id, stock]) => speciesById(id) && stock)
        .sort(([a], [b]) => (a < b ? -1 : 1));
      const total = valid.reduce((sum, [, stock]) => sum + claimed(stock), 0);
      const room = Math.max(
        0,
        Math.min(IMPORT_MAX_FISH, LEDGER_CAP - ledger.length),
      );
      // More claimed than fits: every species is cut by the same ratio.
      const factor = total > room ? room / total : 1;
      for (const [id, stock] of valid) {
        const species = speciesById(id)!;
        const n = Math.floor(claimed(stock) * factor);
        for (let i = 0; i < n; i++)
          ledger.push({ id: nextId++, species: id, kg: species.kg[0] });
        moved += n;
        const best = Number(stock.best);
        if (Number.isFinite(best) && best >= species.kg[0])
          records[id] = Math.max(
            records[id] ?? 0,
            round2(Math.min(best, species.kg[1])),
          );
      }
      caught = Math.max(
        caught,
        Math.min(1_000_000, Math.max(0, Math.floor(count) || 0)),
      );
      imported = true;
      return { imported: moved, already: false };
    },
    async sell(fish) {
      const picked: number[] = [];
      if (fish === null) picked.push(...ledger.map((row) => row.id));
      else {
        if (fish.length > LEDGER_CAP) throw new EconomyError("invalid");
        for (const item of fish) {
          const row = ledger.find(
            (r) =>
              r.species === item.species &&
              r.kg === round2(item.kg) &&
              !picked.includes(r.id),
          );
          if (!row) throw new EconomyError("invalid");
          picked.push(row.id);
        }
      }
      const rows = ledger.filter((row) => picked.includes(row.id));
      const earned = rows.reduce((sum, row) => sum + priced(row).price, 0);
      ledger = ledger.filter((row) => !picked.includes(row.id));
      coins += earned;
      return { sold: rows.length, earned, coins };
    },
  };
}
