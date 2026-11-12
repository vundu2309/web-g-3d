import { CATCH_COOLDOWN_SECONDS, LEDGER_CAP, priceOf } from "./economy.ts";
import { speciesById } from "./fishing.ts";

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
