# 0017. The fishing leaderboard

Date: 2026-11-20. Status: **built, not applied.** The user asked for "một bảng xếp hạng câu cá". The migration
`supabase/migrations/20261121120000_leaderboard.sql` has NOT been applied to the live Supabase project.
Remember that Supabase's GitHub integration applies a migration as soon as it reaches `main`: pushing
this branch is applying it.

## Decision

- **Two boards, read from the profiles** of [decision 0016](0016-server-profile.md): **Câu nhiều nhất**
  (fish caught in all, `profiles.caught`) and **Cá nặng nhất** (the heaviest single fish, the best weight
  in `profiles.records`, with its species). No table, no column and no existing function changes: the
  migration only adds `economy_private.leaderboard()` and its public wrapper `economy_leaderboard()`
  (authenticated only, anon revoked, security definer, `search_path = ''`).
- **The database ranks.** Top 20 per board, `rank()` so equal values share a rank, players with nothing
  yet (0 caught, no record) are not ranked. The answer also carries `players` (how many are ranked) and
  the caller's own place (`me`), so a player below the 20 still sees where they stand.
- **Names** are the account's display name (`auth.users.raw_user_meta_data.display_name`), the one a boat
  already shows to the others in the sea, cut to 24 characters, "Người đi biển" when blank. The client
  puts it in as text, never HTML.
- **Where it is.** A tab "Xếp hạng" on the hub rail (`src/app/hub-shell.ts`, page in `src/app/rank-ui.ts`),
  visible only with a server economy. `src/ocean/leaderboard.ts` reads the answer defensively (a bad row
  is dropped, never thrown on); `memoryEconomy` answers with the player alone, for tests.

## Limits

- **Not authoritative.** A catch is still a client report ([decision 0010](0010-server-economy.md)): the
  server checks the species, the weight range and one catch per 6 s, no more. A modified client can put a
  heaviest fish of any species up to its maximum weight, and about 14,400 catches a day, on the board.
  This is a game board, not a prize list. If rewards ever depend on rank, the catch needs an authoritative
  design first.
- **Cost.** Each opening ranks every profile (one pass, no index on the record weight). Fine for a few
  thousand players; with more, keep the best weight in a column maintained by `economy_record_catch` and
  index both values. Not measured on a large table.
- **Old species.** Record weights of species the game no longer has (the early `ca-ngu`, `ca-thu`, ...)
  still count on the heaviest board; the client shows the weight without a species name.
- **Moved fish.** Fish moved by the one-time import ([decision 0016](0016-server-profile.md)) raise the
  catch count and the records to what the device claimed, so the same trust limit applies.
- Seen in software-rendered screenshots at 844×390 and 667×375; not on a real phone, and not against the
  real Supabase.
