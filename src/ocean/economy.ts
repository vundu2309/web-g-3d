import { SPECIES, type Species } from "./fishing.ts";

/**
 * The money of the sea, as plain maths with no rendering and no network: what a fish is
 * worth. The prices are written once here and once as seed rows of the database (see
 * supabase/pending/..._economy.sql); tests/economy.test.mjs reads that file and fails if
 * the two ever disagree, because the DATABASE is the authority: it prices every sale
 * itself, whatever a client says.
 *
 * Coins ("xu") are earned by selling fish and spent in the shop. The wallet, the ledger of
 * caught fish and every sale live on the server (one wallet per account).
 */
export const RARITY_BASE = { 1: 6, 2: 20, 3: 60 } as const;

/** Coins for a fish at the low end of its weight range; heavier species and rarer ones pay more. */
export function basePrice(species: Pick<Species, "rarity" | "kg">): number {
  return Math.round(
    RARITY_BASE[species.rarity] * Math.max(1, Math.cbrt(species.kg[1])),
  );
}

/** Where a weight sits in its species' range, 0 (lightest) to 1 (heaviest). */
export function weightFraction(
  species: Pick<Species, "kg">,
  kg: number,
): number {
  const [low, high] = species.kg;
  return high > low ? Math.min(1, Math.max(0, (kg - low) / (high - low))) : 0;
}

/** Coins a fish sells for: the base price, from 0.6 times (lightest) to 1.5 times (heaviest). */
export function priceOf(
  species: Pick<Species, "rarity" | "kg">,
  kg: number,
): number {
  return Math.round(
    basePrice(species) * (0.6 + 0.9 * weightFraction(species, kg)),
  );
}

/** A fish already caught is accepted into the ledger at most once in this many seconds. */
export const CATCH_COOLDOWN_SECONDS = 6;
/** Caught fish waiting to be sold, at most. */
export const LEDGER_CAP = 200;

/** One row of the price table, as the database stores it. */
export interface PriceRow {
  species: string;
  base: number;
  minKg: number;
  maxKg: number;
}

export function priceTable(): PriceRow[] {
  return SPECIES.map((species) => ({
    species: species.id,
    base: basePrice(species),
    minKg: species.kg[0],
    maxKg: species.kg[1],
  }));
}
