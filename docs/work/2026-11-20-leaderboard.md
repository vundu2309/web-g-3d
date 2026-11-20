# 2026-11-20 Fishing leaderboard

Request: "tôi cần bạn làm 1 bảng xếp hạng câu cá". Branch `wt/leaderboard` (from `origin/main` at `96e91d9`).
Decision: [0017](../decisions/0017-fishing-leaderboard.md).

## Built

- `supabase/migrations/20261121120000_leaderboard.sql`: read-only `economy_leaderboard()` over the profiles.
- `src/ocean/leaderboard.ts`, `economy-api.ts` (`leaderboard()`, in-memory too), `platform/economy.ts`.
- `src/app/rank-ui.ts`, a "Xếp hạng" tab in `hub-shell.ts`, wiring in `ocean.ts`, styles in `style.css`.
- Tests: `tests/leaderboard.test.mjs`, SQL scenarios in `tests/economy-postgres.sql`, browser `ocean-rank`.

## Not done

- The migration is **not applied** and the branch is **not pushed**: a push to `main` applies the migration (Supabase
  GitHub integration) and deploys the frontend. That needs the user's say.
- No real phone, no real Supabase, no large-table timing.
