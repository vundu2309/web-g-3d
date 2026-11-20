---
title: Fish store, records and boat position on the server
state: built, awaiting the user to apply the migration and approve the deploy
opened: 2026-11-20
owner: main session
decision: docs/decisions/0016-server-profile.md
---

# Fish store, records and boat position on the server

## Feedback and goal

Caught fish could not be sold: the market sells only the server's ledger, and the Kho cá lived on the
device. The user asked for the server to hold everything ("làm tất cả") and for the old fish to move.

## What was built

- Migration `supabase/migrations/20261120120000_profile.sql` (new file, nothing applied): profiles table,
  `economy_profile`, `economy_release`, `economy_save_pose`, `economy_import_local`, and
  `economy_record_catch` now counts catches and sets records.
- Client: `EconomyApi` gained `profile`, `release`, `savePose`, `importLocal` (memory and Supabase),
  `src/ocean/server-store.ts`, `safePose` in `save.ts`, the flow in `src/app/ocean.ts`, retry and
  rejection of kept fish in `market-ui.ts`, the put-back hook in `fishing-ui.ts`.

## Evidence

`tests/economy-postgres.sh` against a disposable PostgreSQL 17 (all RPCs, anonymous refusal, caps,
the import once and by ratio); unit tests; browser test `ocean-server-store`. Not run against the live
Supabase project and not seen on a phone.

## Follow-ups

- The user applies the migration (the SQL editor or the Supabase CLI) before the feature turns on.
- Overlaps with the upgrade shop (`2026-11-19-upgrade-shop.md`), which also edits `economy-api.ts`,
  `platform/economy.ts`, `ocean.ts` and `tests/economy-postgres.*`: merge by hand.
- Server-authoritative catch (`2026-11-19-server-authoritative-catch.md`) is still the real fix for fabricated catches.
