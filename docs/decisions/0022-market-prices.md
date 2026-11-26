# 0022: Market prices that change by market and by day

Status: accepted (2026-11-26), built in the worktree `wt/gameplay`; the migration is **not applied** until the user says to push.

## Decision

Each of the five fish markets pays 85 % to 125 % of the ordinary price, a different percent every Vietnamese day (UTC+7, `Asia/Ho_Chi_Minh`). The percent is a pure function of (market, day): `economy_private.market_pct` in `supabase/migrations/20261127120000_market_prices.sql` and `src/ocean/market-prices.ts` use the same integer mix (all products stay below 2^53), so no table of prices per day is kept and nothing runs at midnight. A table of golden values is checked in both places (`tests/market-prices.test.mjs`, `tests/economy-postgres.sql`).

- `economy_state(p_market)` prices each ledger row at that market's percent and adds `market: {day, pct, all}`; `economy_sell(p_fish, p_market, p_day)` pays the same price. The price shown is the price paid. `p_day` may be today or yesterday, so the price a player saw just before midnight is honoured.
- Prices are whole coins, rounded half up (`(price * pct + 50) / 100`). `price(species, kg)` is unchanged.
- `economy_private.game_day()` and `game_week()` give the Vietnamese calendar (the week starts on Monday); the weekly board of phase P4 uses `game_week()`.
- The old `economy_state()` and `economy_sell(jsonb)` are dropped and replaced by versions with optional arguments (two functions of one name would make a call ambiguous for PostgREST, PGRST203). An old client that sends only the fish list reaches the new function and gets percent 100, the old prices. A new client on a server without this migration falls back to the old call (`src/platform/economy.ts`).

## Trust limit

The market is named by the client: the server does not know where the boat is. A modified client can always claim the best market of the day. The band is narrow on purpose, so that is worth at most +25 % on a sale, and the fish themselves are client reports already (decision 0010, `docs/work/2026-11-19-server-authoritative-catch.md`). `market.all` shows every market's percent, so players can plan where to sell.

## Consequences

- The market page shows "Giá hôm nay: +12 %" and the other four markets' percents (no green: green means "owned" in the shops).
- The yard (boats) has no market price.
- The in-memory economy (`memoryEconomy`) prices the same way, from the same file.
- Applying the migration is a drop and create of two public functions; nothing is lost.
