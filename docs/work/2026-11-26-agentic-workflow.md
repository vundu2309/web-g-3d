---
title: Move the workflow toward agentic engineering
state: building
opened: 2026-11-26
owner: main session (web-g-3d-cf)
agents: qa-runner and sea-visual-reviewer (one trial run each, 2026-11-26, on the minimap change); general-purpose (Haiku) for the OpenWiki refresh
decision: docs/decisions/0023-agentic-engineering-workflow.md
---

# Move the workflow toward agentic engineering

> This record was opened after step 1 had started; the first changes were made before it existed.

## Feedback and goal

The user asked how modern projects work, how to apply agentic engineering to this source, and whether other
sessions would follow the new workflow once it is done. Answer given: only what is enforced by a mechanism
holds for every session; prose is advice. The goal is the five steps of
[decision 0023](../decisions/0023-agentic-engineering-workflow.md).

## Brief

Five steps, in order (steps 2 and 3 are as in the decision): 1 a true and fast success signal, 2 a spec before
work, 3 enforcement by mechanism, 4 the right agent with an independent check, 5 measure. Not to touch: game
code, Supabase, Render, Vercel. Pushes to `main` of docs and tests follow `AGENTS.md`; nothing changes for
the player.

## Plan and owners

| Step | Agent                              | Files owned                                                                                                | State                                                               |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0    | lead                               | `docs/agent-workflow.md`, `AGENTS.md`, `docs/work/` (3 records), the Performance note in `docs/ocean.md`   | done, pushed (`09807dc`)                                            |
| 0b   | lead                               | `AGENTS.md` (the workflow is mandatory), `docs/agent-workflow.md`, `docs/decisions/0023-*.md`, this record | in progress (this record was updated before `AGENTS.md` was edited) |
| 1    | lead (trial: `qa-runner`)          | `tests/support/fast-sea.mjs`, `tests/ocean-map-browser.mjs`, `scripts/lib/dev.mjs`, `docs/workflow.md`     | in progress: `ocean-map` and `ocean-market` done; the rest below    |
| 2    | lead                               | a spec template next to `docs/work/_template.md`                                                           | not started                                                         |
| 3    | lead                               | `.claude/settings.json` (hooks, permissions), a CI check for a work record                                 | on `main`, two checks open, see "Step 3"                            |
| 4    | `sea-visual-builder`, reviewer, QA | the work records of the changes that use them                                                              | not started (one trial of reviewer and QA only)                     |
| 5    | lead                               | a table in this record                                                                                     | not started                                                         |

## Evidence

Step 0 and 1, measured on 2026-11-26 with the machine busy (load about 15 on 10 cores):

- `ocean-map`: 75 and 92 s before; 48 and 52 s with `FAST_SEA`; 33 and 34 s with `FAST_SEA` and one boot
  of the sea (the page is resized for each of the four sizes). It still fails when the tap that opens the
  map is disabled (`TimeoutError`) and when an assertion is wrong only at the last size.
- A direct timing of the same test: 77.5 s, of which about 52 s were four boots of the sea (10 to 15 s
  each); with the switches off one boot took about 5.5 s and the test 39.2 s.
- `ocean-market` failed with four `ERR_CONNECTION_REFUSED` console errors because the QA environment did
  not set `VITE_API_URL` and Vite read the developer's `.env.local` (`http://127.0.0.1:10001`, no API
  running). `TEST_ENV` now sets it empty; the test passes in a worktree (78 s, one run). Not run on a machine
  without a `.env.local`, which is the likely state of CI.
- `qa-runner` on the minimap change: format, `tsc`, lint clean; 647 unit tests pass; `ocean-map` and
  `ocean-patrol` pass; `ocean-market` failed and was classified as an environment failure (a later run
  found the cause above). `sea-visual-reviewer`: no open finding, five notes (see the minimap record).
- Not verified: real phone; the other browser tests with `FAST_SEA`; whether the tests can run in parallel.

## Review

Second session: the `reviewer` agent reviewed the selector twice and the `FAST_SEA` change once
(2026-11-26), "changes needed" both times, on missing table rows, a cut-off piped output, argument handling
and stale lines here; fixed, the last fixes not reviewed again. Left as is: the runner takes a test's output
at `exit`, not `close`, so the end of a failing run could in theory be missing (not observed).

The first session's only independent check was the `sea-visual-reviewer` and `qa-runner` trial on the minimap
change.

## Approval and publication

- User approval: "Có" to starting with step 1 (the mock API became a fix of the environment, see above).
  Steps 2 to 5 are planned and not yet approved one by one.
- Commits on `main`: `09807dc` docs (roles, `AGENTS.md`, work records); `e498144` and `004a752` `ocean-map`
  faster; `578ecaf` the QA environment sets no API address.
- Deploys checked: Vercel reported success for `09807dc`, `e498144` and `004a752`. Nothing here is visible
  to a player.

## Second correction (2026-11-26, after the user's questions)

The user pointed out that the lead had gone against the project's own rule: records were opened after the
work and after the pushes. The user asked for the convention to say that following the workflow is
**mandatory**. This record was updated before `AGENTS.md` was edited. Another session had added a
"Using sub-agents" section to `AGENTS.md` (the default "spawn an agent only when asked" does not apply here);
an earlier line of this work ("start one when the user asks or names it") contradicted it and is replaced.
Prose alone is not enforcement: the CI check for a work record is still step 3 of the decision, not done.

The `reviewer` agent reviewed the wording and said **changes needed** (nine findings). The fixes: the SHAs are
added after the push; the full state list is referenced; the review threshold is stated (two or more files
outside `docs/`, or `server/`, `supabase/`, `src/platform`, or money, accounts and security); `qa-runner` only
when browser tests apply; `sea-visual-reviewer` for sea visuals and `reviewer` (user-level, may be missing) for
the rest; the exception is listed and its exclusions named; "the lead" is defined; the Publication contract
points to the user's say; stage 6 says what to show when there are no images; decision 0023 matches. The fixed
text was **not** reviewed again by an agent.

## Step 1 continued (2026-11-26, a second session)

A second session took up the remaining tasks of step 1 (tasks 1 to 4 below) on the local branch
`chore/agentic-workflow-step1`, from `494eeb0`. This entry was written before the first edit of that
branch. Steps 2 to 5 stay unapproved and are not part of it.

Results (committed as `f4fee4e`; the branch was moved to `f66e9b3`, which holds the P4 gameplay work, and
rows for `ocean-quests` were added to the table):

- Task 1: a real fault, not a stale test. A touch on the gear opened Settings and the browser's own click then
  chose the "Kho cá" tab. Fixed at the user's request and published as `f66e9b3`, record
  `2026-11-26-gear-ghost-tap.md`.
- Task 2: `scripts/qa.mjs` prints a failing run whole; seen with the assertion and line on real failures.
- Task 3: `node scripts/qa.mjs --changed [--base ref] [--list]`, table in `scripts/lib/qa-select.mjs`;
  `src/app/big-map.ts` alone picks `ocean-map`. Unit tests in `tests/qa-select.test.mjs` (9 pass). The
  `reviewer` agent said changes needed (table rows missing tests, output cut at 64 KB through a pipe, running
  from a subfolder, argument errors); fixed (later reviews: see "Review").
- Task 4, `FAST_SEA` on four tests (the one-boot pattern not applied to them). One run each, machine load
  about 5 to 9:

  | Test                 | Before | After | Negative control (feature broken in `src/`, then restored)         |
  | -------------------- | ------ | ----- | ------------------------------------------------------------------ |
  | `ocean-presence`     | 28 s   | 24 s  | no announce while a hub is open: failed, "announced 0 times"       |
  | `ocean-book`         | 69 s   | 59 s  | progress chip not added: failed (timeout at the chip's check)      |
  | `ocean-rank`         | 71 s   | 46 s  | own-row mark removed: failed (timeout waiting for the own row)     |
  | `ocean-server-store` | 28 s   | 20 s  | release not sent to the server: **passed**, so the check was fixed |

  The wait in `ocean-server-store` used an `async` predicate in `waitForFunction`, which resolves at once
  (confirmed with a predicate that returns `false`). It now polls and asserts; with the release broken it
  fails (6, expected 5) and it passes restored (21 s). `tests/pwa-browser.mjs` has three waits of the same
  shape (lines 219, 237, 244): not changed, see follow-ups.

- Done-when 1 not checked: the `ocean` group run was stopped at the user's question about its length, after
  `ocean-babylon` fail, `ocean-fishing` fail, `ocean-cast` flaky (killed at 600 s, then passed),
  `ocean-market` pass; machine load about 6 to 11. The two failures are not classified.

## Step 2 (started 2026-11-26)

The user approved it: "Làm bước 2". Written before the first edit, on the branch
`chore/agentic-workflow-step2` from `6b727ad`. Step 1's done-when 1 is still unchecked. Files: `docs/work/_template.md`,
`docs/agent-briefs.md`, `docs/agent-workflow.md`, `AGENTS.md`, this record.

The trial change, chosen by the user ("Sửa test PWA"), is `2026-11-26-pwa-test-waits.md`: two criteria seen to
fail before and to succeed after, one guard. The `reviewer` agent says all three are checkable, with limits
written there; it also found that the template had no place for a guard, which was added. Done-when "on
`main`": met on 2026-11-27, commit `735d3a7`, pushed on the user's say ("Commit và push"); CI passed.

## Step 3 (started 2026-11-27)

The user approved it: "Làm bước 3". Brief, evidence and review in
[2026-11-27-work-record-check.md](2026-11-27-work-record-check.md). Two choices differ from the tasks below:
the check is a workflow of its own, so that a failing step or a cancelled run cannot skip it; and a force
push is refused by a hook as well as by permission rules. The workflow runs only on `main` and on pull
requests, so the red and green CI runs need a draft pull request, not just a branch.

On `main` since 2026-11-27 (`1ee2322`); the first "Work record" run was green. A red run and then a green
one were seen on draft pull request 39 (closed, not merged). Not yet seen: a new session loading the hooks.

## Steps in detail (added 2026-11-26)

Each step lists the tasks, what makes it done (something a person or a test can check) and what is not yet
known. A step is not `done` until every "Done when" line is true and the record says how it was checked.
Order: 1, 2, 3, 4, 5. Step 3 follows step 2 directly. Before a step starts, this record is updated; a step
that changes more than one file outside `docs/` is reviewed by an agent (see "Change contract").

### Step 1: a success signal that is true and fast

Tasks (the first two are the open follow-ups of this record):

1. Find out why `ocean-input` fails at "Về sảnh" (the second tap on the settings button opens "Kho cá"):
   open the sea in a real browser at 844x390, tap the settings button twice and look at what is under the
   tap. Decide: a stale test (fix the test) or a real fault (a defect for the user, with a screenshot).
2. `scripts/qa.mjs` prints the whole failure of a test, not the last 1,500 characters of its log.
3. A command that runs only the browser tests that fit the changed files: a small table from a source path
   to test names, kept in `scripts/`, with a fallback to a named group when no row matches.
4. `FAST_SEA` and the one-boot pattern for the tests that do not look at what the switches turn off, one
   test at a time (each is checked against its own assertions first).

Done when:

- `node scripts/qa.mjs ocean` on a machine with a `.env.local` that points at a dead API ends with no failure
  caused by the environment: every failure left is a defect, written in this record as a follow-up.
- A failing test shows its assertion message and line in the qa output without a manual rerun.
- The changed-files command, given a diff that touches only `src/app/big-map.ts`, names `ocean-map` and not
  the whole group.
- For every test given the fast switches: its time before and after is in this record, and a negative
  control (a deliberate break of the feature it checks) still fails it.

Not known yet: whether the browser tests can run in parallel (they share fake accounts and ports; not
tried), and what CI would need to run them (it runs none today).

### Step 2: a spec before the work

Tasks:

1. A short spec section in `docs/work/_template.md`, or a `_spec-template.md` next to it: goal in the user's
   words, acceptance criteria written so that a named test can check each one, what must not be touched,
   which agent or person owns which files, and how the user will judge it.
2. Say in `docs/agent-briefs.md` that a brief for a builder is the spec's "Brief" section plus the paths.
3. Try it on one real, small change chosen with the user.

Done when:

- The template is on `main` and `AGENTS.md` points to it.
- One real change has a spec in its record in which every acceptance criterion names a test, and the record
  shows that test failing before the build and passing after (the two outputs are quoted).
- An agent review of that record (the `reviewer`) says each criterion is checkable, or lists those that are not.

Not known yet: how long a spec may be before sessions stop writing it. The aim is a page, not more.

### Step 3: enforcement by mechanism

Tasks:

1. A check script, for example `scripts/check-work-record.mjs`, that looks at the commits of a push range:
   if a commit changes a file under `src/`, `server/`, `supabase/`, `tests/` or `scripts/`, the same range
   must also change a file under `docs/work/` (not `_template.md` or `README.md`), or the commit message
   must contain `No work record: <reason>`. Merge commits are skipped. It runs without network access.
2. Run it in CI on every push to `main` and on pull requests, next to the existing lint, format, typecheck
   and unit steps (today only `.github/workflows/pages.yml` runs them).
3. A shared `.claude/settings.json` (committed) with hooks: format the changed file after an edit, and a
   permission rule that refuses a force push. The exact event names and the format of the file are to be
   read from the current Claude Code documentation before writing it; they are not taken from memory here.
4. A test of the check script (`tests/`), with a deliberately violating range as the negative control.

Done when:

- On a throwaway branch, a commit that changes `src/` with no record makes the check fail, the same commit
  with a record or with `No work record: <reason>` makes it pass (both outputs are quoted in this record).
- The CI run of a pushed commit shows the check as a step, red for the violating branch and green for the
  fixed one.
- A new Claude Code session in a clean clone of `main` has the hooks loaded (checked by editing a
  mis-formatted file and seeing it formatted), and the record says what that session saw.

Not known yet, and to be checked rather than assumed: whether a session that is already running picks up a
new `.claude/settings.json` (the documentation read on 2026-11-26 says settings are read when a session
starts, so it probably does not); whether Claude Code asks the user to trust project hooks before running
them; and whether editing the CI workflow needs anything from the user beyond the push gate (it does not
touch Supabase, Render or Vercel). The user's say is needed for the push, as always.

Risks: a check that fires on every small commit makes sessions write empty records. The exception message and
the threshold keep that small; the first weeks of use will show if the threshold is wrong.

### Step 4: the right agent and an independent check

Tasks:

1. Choose two real changes with the user: one that touches several files outside `docs/`, one in
   `server/` or `supabase/`.
2. For each: the lead writes the brief from the spec, `sea-visual-builder` (or another builder) makes the
   change in its own worktree, then the reviewer and `qa-runner` check it. The lead reads each report and
   reruns the key check.
3. The record names every agent that took part, what each found, and what the lead changed after.

Done when:

- Two changes on `main` whose records name the builder, the reviewer and `qa-runner`, with their findings.
- The record compares them with the changes the lead built alone (rounds of fixing, defects found before
  and after the push), and says whether to keep the pattern. A sample of two is stated as small.

Not known yet: whether the cost in time and tokens is worth it for changes this size. The record must give the
time each took, from the board or from the agents' own reports.

### Step 5: measure

Tasks:

1. A table in this record, or a file in `docs/work/`, with one row per change: date, record, agents, rounds
   of fixing, which check or person found each defect, and whether a defect reached `main`.
2. The agent board (`.claude/scratch-agent-board`, local, not committed) is a reading aid, not the source of
   truth: the figures come from the work records and the git history.

Done when: at least five changes are in the table, and a short note says what the numbers suggest and what
they cannot show (a sample this size cannot show a trend).

## Follow-ups

State on 2026-11-26 after the second session: items 1 to 4 below are done on
`main` (item 1 `f66e9b3`, items 2 to 4 `f4fee4e`, pushed at the user's "Commit và push"; the CI run of
`f4fee4e` passed lint, format, typecheck and unit tests). Done-when 1 is still unchecked.

Added 2026-11-26: `tests/pwa-browser.mjs` has three `waitForFunction` calls with `async` predicates that
check nothing; fix them and run a negative control (needs a build). Done in
`2026-11-26-pwa-test-waits.md`, the trial of step 2.

In the user's order:

1. `ocean-input` ("Về sảnh" step): find out whether the test is stale or the settings button is covered (the
   second tap opens "Kho cá"). A real fault would reach players.
2. `scripts/qa.mjs` should print the whole failure, not the last 1,500 characters.
3. A command that runs only the browser tests that fit the changed files.
4. Apply `FAST_SEA` and the one-boot pattern to other tests, one by one, after checking that each does not
   look at what the switches turn off.
5. Steps 2 to 5 of the decision, with step 3 straight after step 2.
