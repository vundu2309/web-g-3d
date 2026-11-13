# 0010. Server-side economy (coins)

Date: 2026-11-12. Status: accepted by the user (2026-11-12); applied to the live database and switched on in production on 2026-11-13.

## Context

Until now the fish store and the catch count were saved on the device only (localStorage) and the
docs said the game had no economy. The user asked for a currency system and chose to keep money
**on the server** (not only on the device), earned by selling fish and spent in a shop (upgrades),
with places to sell on the islands (see docs/ocean.md "Markets").

## Decision

- Coins ("xu") live in the Supabase PostgreSQL database, one wallet per account. Tables are
  private (`economy_private`, RLS on, no grants); the app reaches them only through three
  authenticated RPCs: `economy_state`, `economy_record_catch`, `economy_sell`
  (supabase/migrations/20261113032223_economy.sql). They check `auth.uid()` themselves.
- The database is the authority on money: it prices every sale itself from its own price table
  (`economy_private.fish_prices`), which `src/ocean/economy.ts` mirrors and
  `tests/economy.test.mjs` keeps equal. A client cannot name a price, set a balance or sell a
  fish the ledger does not hold.
- A **ledger** holds the fish the player has caught and not yet sold. A catch is accepted only for
  a real species within its weight range, at most one every 6 seconds, and while fewer than 200
  fish wait. Selling consumes ledger rows (by species and weight) atomically.
- The economy needs the Supabase backend (`VITE_ONLINE_BACKEND=supabase`). The legacy Firebase
  fallback and the local preview have no money; they do not show the market.

## Limits (said plainly)

Fishing is simulated on the device, so a catch is a client report. The checks bound what a cheater
can earn (one fish per 6 seconds, species weights, 200 unsold fish) but a patched client can still
invent catches within those bounds. Making that impossible needs the server to run the fishing
rules (choose the fish, the bite times and the fight) with the client only playing them back; the
pure rules in `src/ocean/fishing.ts` and `fight.ts` could run on the server for that. That is a
separate piece of work, not part of this decision. Prices are tuned so that a minute of honest
fishing and a minute of cheating within the limits pay about the same order.

## Consequences

- The migration was applied to the live Supabase project on 2026-11-13 with the Supabase tools (recorded as version `20261113032223`, so the file in `supabase/migrations/` carries that version and the GitHub integration does not apply it twice), and `VITE_ECONOMY=on` was set on Vercel production. Checked afterwards: 20 price rows, RLS on all three tables, no table privileges for `anon` or `authenticated`, the three RPCs executable by `authenticated` only.
- Applying the migration to the live project changes production: it is done only after the user
  confirms, never from a test run. `tests/economy-postgres.sh` runs the SQL scenarios in a
  disposable PostgreSQL with Auth fixtures (it needs a superuser connection to a throwaway
  server, never production).
- The market, the sell hub and the shop are built on these RPCs in later changes.
