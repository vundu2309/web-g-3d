# 0016. The fish store, records and boat position live on the server

Date: 2026-11-20. Status: **built, not applied.** The user asked for it ("làm tất cả, cá cũ chuyển")
after fish that had been caught could not be sold. The migration `supabase/migrations/20261120120000_profile.sql`
has NOT been applied to the live Supabase project: that needs the user's say (AGENTS.md).

## Context

The unsold fish already lived on the server (the ledger of [decision 0010](0010-server-economy.md)),
but the fish store the player sees ("Kho cá"), the record weights, the catch count and the boat
position lived in localStorage. Two stores for the same fish: a fish kept while the economy was off,
or whose report to the server failed, sat in the device store but was not in the ledger, so the
market could not sell it. An online game that loses the player's fish when the browser data is
cleared, or on a second phone, is also wrong.

## Decision

- **One fish store: the ledger.** The Kho cá is built from the ledger rows (count per species) and the
  profile's record weights (`src/ocean/server-store.ts`). Putting a fish back deletes the lightest row
  of that species (`economy_release`); selling consumes rows as before.
- **A profile table** `economy_private.profiles`: catch count, record weight per species, boat
  position and when it was saved, and when the device store was imported. `economy_record_catch` (the
  same checks as before) now also counts the catch and sets a record. RPCs: `economy_profile`,
  `economy_release`, `economy_save_pose` (inside the sea, one write per 10 s), `economy_import_local`.
- **The old store moves once.** The first time an account enters with the profile available, the
  device's store goes to the server (`economy_import_local`). The device only knows how many of each
  species it held and the best weight, not each fish, so every moved fish gets the species' **lightest**
  weight (the least it can be worth) and the best weights become records. At most 100 fish move, never
  past the ledger's 200; above that every species is cut by the same ratio. The catch count rises to the
  device's. A second call changes nothing. After it the device keeps no copy of the fish.
- **A rejected catch leaves the store.** If the server refuses a kept fish for good (ledger full,
  invalid), the fish is taken out of the store and the player is told. "Too fast" (under 6 s after the
  last catch) is retried after the wait; a network failure is retried when the market opens.
- **Fallback.** Without an economy, or when the profile cannot be read (migration not applied, no
  network), the game works as before with the store on the device. So the client can be deployed
  before the migration is applied.

## Limits (said plainly)

- The import trusts the device's count: a patched client can claim up to 100 fish of the most valuable
  species once per account, at their lightest weight (the shark's lightest weight pays 265 coins, so up
  to about 26,500 coins) and set any record within a species' range. The caps bound it; a catch is still
  a client report (decision 0010), and making it impossible needs the server to run the fishing rules
  (`docs/work/2026-11-19-server-authoritative-catch.md`).
- A fish moved from the device is worth its species' lightest weight, which is less than what a heavy
  fish was worth. That is the safe side of not knowing the real weight.
- Fish kept on a device while the profile was unreadable and after the account was already imported are
  not imported a second time.
- The boat position is saved at most every 30 s by the client and 10 s by the server, and on leaving; a
  crash can lose a minute of movement.
