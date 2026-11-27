# 0023. Move the workflow toward agentic engineering

Date: 2026-11-26. Status: accepted by the user for step 1; step 2 approved on 2026-11-26 and on `main` since 2026-11-27; step 3 approved on 2026-11-27 (record [2026-11-27](../work/2026-11-27-work-record-check.md)), steps 4 and 5 planned, not started. Progress is
kept in [the work record](../work/2026-11-26-agentic-workflow.md).

## Context

Most changes so far were built, checked and published by the main session alone. The seven agents in
`.claude/agents/` and the gates in [agent workflow](../agent-workflow.md) were written down, but a run of
2026-11-26 showed the gap: three of the seven agents were not in the roles table, `AGENTS.md` named none of
them, recent features (minimap, patrol ships, parked boats) had no work record, and the browser tests that
should be the success signal were slow (about 75 to 92 s for one test) and failed for reasons unrelated to
the change (`ocean-market` read the developer's `.env.local`; `ocean-input` still fails, see below).

Current practice described by practitioners (secondary sources, not measured here): the human work moves
to the front (a spec) and the back (review); tests are the success signal; a reviewer with a fresh context
checks the builder's work; more agents are not always better. See the search results quoted in the work
record's source list.

## Decision

Take five steps, in this order, and keep each one small and measured:

1. **A success signal that is true and fast.** The browser tests pass or fail because of the change, and
   run in a time an agent can afford.
2. **Spec before work.** A short spec (goal, acceptance criteria that a test can check, what not to touch,
   who owns which files) is written first; the acceptance criteria become tests that fail before the build.
3. **Enforcement.** What must hold for every session is done by a mechanism, not by prose: hooks for format
   and lint, permissions for push and migrations, and CI checks. Prose in `AGENTS.md` is advice; a session
   can ignore it (the missing work records are the proof). This step comes straight after step 2, not last.
4. **Right agent, independent check.** A change that spans files or touches money, security or Supabase goes
   builder, then `sea-visual-reviewer`, then `qa-runner`. A one-file change is done directly. The work
   record says which agents took part.
5. **Measure.** Per change: which agents, how many rounds of fixing, which test caught what.

The user's gates stay as they are: a push to `main`, a migration and any change to Supabase, Render or
Vercel need the user's say. An agent's report is not approval.

## Consequences

- Other sessions get the new rules by reading `AGENTS.md` and `docs/` when they start, and the new tests and
  scripts when they merge `main`. A running session or an old worktree does not get them. Only steps that are
  enforced by a mechanism (step 3) hold for every session.
- More agents cost more and add moving parts; they are used for parallel work, a clean context or an
  independent check, not by default, except where the Change contract in `AGENTS.md` requires a review (two or more files outside `docs/`, `server/`, `supabase/`, `src/platform`, or money, accounts and security).
- Nothing here has been measured on a real phone; the game's phone behaviour is still checked by the user.

## Known open items at the time of writing

- `ocean-input` fails at the "Về sảnh" step: the second tap on the settings button opens the fish store
  ("Kho cá") instead of Settings. It fails the same way on `main` before the minimap change. Whether the test
  is stale or the screen has a real fault is not known.
- `scripts/qa.mjs` keeps only the last 1,500 characters of a test's log.
- There is no command that runs only the browser tests that fit the changed files.
- No `.claude/settings.json` is committed, so no hook or permission is shared yet. (Addressed by step 3.)
