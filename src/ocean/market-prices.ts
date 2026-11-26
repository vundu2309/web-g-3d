/**
 * What a market pays on a day, as plain numbers (decision 0022): each market has a percent from 85
 * to 125 of the ordinary price, different every day (Vietnamese day, game-clock.ts). The database
 * works the same percent out (`economy_private.market_pct` in
 * supabase/migrations/20261127120000_market_prices.sql) with the SAME integer mix, so the client
 * and the server always agree and nothing has to run at midnight; the in-memory economy uses this
 * file, and tests pin a table of golden values in both places.
 *
 * The market a player names is a claim of the client (the server does not know where the boat is),
 * so the band is narrow: a modified client gains at most 25 %.
 */
export const MARKET_IDS = [
  "hai-dang",
  "doi-xanh",
  "bai-co",
  "giua-khoi",
  "cuoi-troi",
] as const;
export type MarketId = (typeof MARKET_IDS)[number];

/** 2020-01-01 as days since 1970-01-01 (what `date '2020-01-01'` is in the database). */
export const EPOCH_DAY = 18262;
export const PCT_MIN = 85;
export const PCT_MAX = 125;

const MOD = 2147483647;
const mod = (n: number) => ((n % MOD) + MOD) % MOD;

/** The percent a market pays on the Vietnamese day `dayKey` (`vnDayKey`). No market: 100. An unknown market throws. */
export function marketPct(
  market: string | null | undefined,
  dayKey: number,
): number {
  if (market === null || market === undefined) return 100;
  const position = (MARKET_IDS as readonly string[]).indexOf(market);
  if (position < 0) throw new Error(`unknown market ${market}`);
  // Every product stays below 2^53 (day numbers are a few thousand), so this is exact.
  let x = mod((dayKey - EPOCH_DAY) * 73856093 + position * 19349663);
  for (let i = 0; i < 3; i++) x = (x * 48271) % MOD;
  return PCT_MIN + (x % (PCT_MAX - PCT_MIN + 1));
}

/** The percent of every market on a day. */
export function marketPcts(dayKey: number): Record<MarketId, number> {
  return Object.fromEntries(
    MARKET_IDS.map((id) => [id, marketPct(id, dayKey)]),
  ) as Record<MarketId, number>;
}

/** What a fish of ordinary price `price` pays at `pct` percent: whole coins, rounded half up. */
export const priceAt = (price: number, pct: number) =>
  Math.floor((price * pct + 50) / 100);

/** "+12 %", "-8 %" or "như thường" for the chip on the market page. */
export function pctText(pct: number): string {
  const d = pct - 100;
  return d === 0 ? "như thường" : `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
}
