# 0021: Daily quests, the weekly board and the event board

Status: accepted (2026-11-26), built in the worktree `wt/gameplay`; the migration `20261128120000_progression.sql` is **not applied** until it reaches `main`.

## Decision

Three things are counted by the database inside `record_catch`, from the fish the server itself accepted (real species, weight in range, one per 6 s, the ledger cap). A client never sends a count or a score.

- **Daily quests.** Three a day (slot 0 any fish, slot 1 a gentle species, slot 2 something big or rare), chosen by a hash of the account and the Vietnamese day (`ensure_quests`), so they are the same all day and differ between players. A finished quest is claimed with `economy_quest_claim` and pays 15 to 50 coins; the day pays at most **120 coins** (the three dearest quests sum to 115, so the cap is a safety net). The catalogue is `quest_defs` in the migration and `QUEST_DEFS` in `src/ocean/quests.ts`; a test keeps them equal.
- **The weekly board.** `weekly_stats` keeps fish caught and the heaviest fish for each Vietnamese week (Monday start, `game_week()`); `economy_weekly_board` ranks them in the shape of `economy_leaderboard`. No prize.
- **The event board.** The hourly event (decision 0020) has its own board: a player's best single giant of the hour by price (then weight), at most three giants per player per hour. A catch is tagged with the hour (`p_event`); the server takes it only inside the event's 20 minutes plus a 20 s grace, only for the three giant species (`tom-hum`, `ca-heo`, `ca-map`, listed in the migration and in `GIANT_SPECIES`) and only from 87 % of the species' weight range up (the client rolls the top 12 %). A bad tag is ignored, never an error: the fish is still recorded. No prize.

`record_catch` is restated once to call `economy_private.on_catch`, which runs in its own sub-transaction and returns `{}` on any failure, so a counting bug can never lose a catch (it logs a warning). Later changes replace `on_catch` only. `economy_record_catch(species, kg, p_event default null)` replaces the two-argument function (dropped first; two functions of one name are ambiguous for PostgREST, PGRST203). An old client that sends only species and kg reaches the new function and works as before; a new client on a server without the migration sends `p_event` only for a giant and retries without it when the server says the function is missing.

## Trust limit

Catches are client reports (`docs/work/2026-11-19-server-authoritative-catch.md`). The checks cap what a modified client can do: at most one catch per 6 s is 14,400 a day, so the weekly board and the event board can be inflated and cannot be trusted as proof of skill. Therefore:

- quest rewards are small and capped at 120 coins a day (a catch-bot earns the same as a player who finishes the three quests);
- the boards are for fun and pay nothing;
- the event score is the fish's ordinary price (a giant of 399 kg at most), and the quota of three a player is counted by the server as well as the device.

Anything bigger tied to these numbers needs a server-authoritative catch first.

## Consequences

- New RPCs: `economy_quests`, `economy_quest_claim`, `economy_weekly_board`, `economy_event_board`; new SQLSTATE `EC410` (the quest is not finished or was already claimed; the client maps it to `quest`).
- The Sổ hub has a Nhiệm vụ page and the event page has its board; the Xếp hạng hub has "Mọi thời đại | Tuần này". A toast says when a quest moves and when it is done.
- Event rows older than 72 hours are deleted when a new event result is taken; quest rows and weekly rows are kept (a few rows a day per player).
- Not built: a dot on the Sổ tab for a claimable quest (the toast says it), and a coin prize for the boards.
