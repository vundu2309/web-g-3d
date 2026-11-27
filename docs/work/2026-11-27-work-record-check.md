---
title: A mechanism asks for the work record and refuses a force push
state: published
opened: 2026-11-27
owner: session "Kéo main mới và làm tiếp task cải thiện workflow"
agents: claude-code-guide (documentation), reviewer
decision: docs/decisions/0023-agentic-engineering-workflow.md
---

# A mechanism asks for the work record and refuses a force push

## Feedback and goal

"Làm bước 3" (2026-11-27). Step 3 of decision 0023, spelled out in
[the workflow record](2026-11-26-agentic-workflow.md#step-3-enforcement-by-mechanism): what must hold for
every session is done by a mechanism, not by prose.

## Brief

### Acceptance criteria

| #   | Must be true                                                                                                                                                                       | Check (test file: name)                                              | Before          | After           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------- | --------------- |
| 1   | A range that changes `src/`, `server/`, `supabase/`, `tests/` or `scripts/` with no work record and no `No work record: <reason>` fails the check, naming the commit and the files | `tests/work-record-check.test.mjs`                                   | fail (14 of 15) | pass            |
| 2   | The same range passes with a record in it, or with the exception on each such commit; docs-only ranges and merge commits pass                                                      | `tests/work-record-check.test.mjs`                                   | fail            | pass            |
| 3   | The GitHub workflow runs the check on pushes to `main` and on pull requests                                                                                                        | `tests/work-record-check.test.mjs`: the workflow step                | fail            | pass            |
| 4   | The committed `.claude/settings.json` formats an edited file of the formatted scope and refuses a force push                                                                       | `tests/claude-settings.test.mjs`                                     | fail (7 of 7)   | pass            |
| 5   | A new Claude Code session in a clean checkout has the hooks loaded                                                                                                                 | a session edits a mis-formatted file; the record says what it saw    | not run         | **not checked** |
| 6   | The CI run shows the check red for a violating branch and green for the fixed one                                                                                                  | GitHub Actions on a draft pull request; needs the user's say to push | not run         | **not run**     |

### What to build

1. `scripts/check-work-record.mjs <base> [head]`: exit 0 passes, 1 a record is missing, 2 the range cannot be
   read. No network. A record is `docs/work/*.md` other than `_template.md` and `README.md`, added or changed
   (a deletion does not count).
2. `.github/workflows/work-record.yml` (first a step of `pages.yml`; moved after the review).
3. `.claude/settings.json`: the format hook and the force-push refusal (deny rules and, after the review, a
   hook), in the format of the current documentation.
4. The tests, in `test:unit`; `AGENTS.md`, `docs/workflow.md` and decision 0023 say what is now enforced.

### Not to touch, and limits that must hold

No game code, no Supabase, Render or Vercel, no personal settings (`settings.local.json`, user settings). No
existing step of the CI workflow removed or loosened. The settings only add restrictions and a formatter.

### Owners

The lead: all files above.

### How the user will judge it

The outputs below, and a CI run. What the check cannot do is listed with it.

## Plan and owners

| Step | Agent | Files owned     | State     |
| ---- | ----- | --------------- | --------- |
| 1    | lead  | the files above | in review |

## Evidence

Before the build, history since 2026-11-20 (64 non-merge commits): 37 change one of the five folders and no
record in the same commit. The check looks at a whole push range, so fewer pushes would have failed. The last
four real pushes (`494eeb0..de003b1`) pass it.

- Criteria 1 to 4, before: the scripts, settings and workflow did not exist (14 of 15 and 7 of 7 tests
  failed; the one that passed took a missing script's exit 1 for a refusal and was tightened). The tests added
  for the review failed before the fix too (3 workflow tests, 3 settings tests). After both review rounds: 27 pass.
- Controls, each a deliberate break in a copy, each making one test fail: swapped range arguments; an empty
  pull request range; no same-repository check in the format hook; formatting from the session's checkout;
  grouped short flags not read; heredoc bodies not skipped.
- Done-when of the step, in a scratch clone with the first version of the check script (unchanged since):
  a commit adding `src/throwaway.ts` with no record exits 1 and names it; with a record, or with
  `No work record: throwaway demonstration`, exit 0.
- Criterion 5: a headless `claude -p` session in the scratch clone could not start ("this login reached its
  time limit"), so nothing was loaded or tried there.

## Review

`reviewer` agent, 2026-11-27, on the first version: **changes needed**. Fixed:

1. The step was skipped when an earlier step failed, and a queued run could be cancelled: now its own
   workflow with no condition or concurrency group.
2. Force pushes got through the rules (`-qf`, `-vf`, `-uf` after the remote, `--mirror`): a hook reads the
   command.
3. The `git -C *` rules refused ordinary commits whose message mentioned a push: removed; the hook covers
   `-C`.
4. Tests that stayed green when broken (swapped arguments, no repository check, wrong directory): the
   workflow's shell lines and a worktree are now run; see the controls above.
5. A pull request is checked from its merge commit, not from `pull_request.base.sha`.
6. Docs and this record brought in step.

Second round, same agent: **changes needed**, small. Fixed: an unquoted `$(...)` or backtick cut the command
so a later flag was not read; a commit message built with a heredoc inside `"$(...)"` could be refused; a
redirection stuck to a flag, arithmetic read as a heredoc, shortened long options, wrapper options with a
value and `<<\EOF`; this record's broken table; `AGENTS.md` says "the usual forms". Their 23 cases were added to
the tests and were all wrong before the fix (20 passed the hook, 3 refused wrongly). Named as limits, not
fixed: deleting a remote branch, strings run by another program, unusual syntax. 1,506 random and very large
inputs: none took over a second; the two nested thousands deep exit 1, so the call goes on to the deny rules.

Third round, same agent: **approve**, no open finding in the hook or the docs (32 more force pushes refused,
27 ordinary commands passed, fed as text; the history figures and the controls reproduced). Its two wording
points in the records are fixed.

## Approval and publication

- User approval: to build ("Làm bước 3"); to push to `main` ("Push bước 3 lên đi", 2026-11-27). Checks before
  the commit: format, `tsc`, lint clean, 730 unit tests pass.
- Published: `1ee2322` on `main`. GitHub Actions: "Work record" run 45931071148 passed ("1 commit(s)
  checked"); the Pages run 45931071069 passed lint, format, typecheck and unit tests.

## Follow-ups

Open: criterion 5 (a new session loading the hooks) and the red half of criterion 6 (a CI run of a violating
range, which needs a draft pull request). The step's done-when is not complete until both are seen.
