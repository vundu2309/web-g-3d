---
title: The PWA test's cache waits check something
state: user-approved
opened: 2026-11-26
owner: session "Kéo main mới và làm tiếp task cải thiện workflow"
agents: reviewer
decision: docs/decisions/0023-agentic-engineering-workflow.md
---

# The PWA test's cache waits check something

## Feedback and goal

The user chose this change as the trial of the spec template (step 2 of decision 0023): "Sửa test PWA".
`page.waitForFunction` takes an `async` predicate's promise as true at once (seen with playwright-core
1.64.1), so the waits of `tests/pwa-browser.mjs` on the cache names check nothing.

## Brief

### Acceptance criteria

| #   | Must be true                                                         | Check (test file: name)                                                        | Before              | After                  |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- | ---------------------- |
| 1   | No browser test gives `waitForFunction` an inline `async` predicate  | `tests/browser-waits.test.mjs`: "no async predicate in waitForFunction"        | fail                | pass                   |
| 2   | A service worker that keeps old shell caches makes the PWA test fail | `tests/pwa-browser.mjs` run on a build whose worker does not delete old caches | test passes (wrong) | test fails, as it must |
| 3   | Guard: the PWA test passes on the unbroken build                     | `tests/pwa-browser.mjs` after a build with no account settings                 | pass                | pass                   |

### What to build

1. In `tests/pwa-browser.mjs`, replace each such wait by a poll of `page.evaluate` with a time limit that fails
   with a message saying what was awaited.
2. `tests/browser-waits.test.mjs`, in `test:unit`.
3. (Added after the build, for the finding of the baseline) say in `docs/workflow.md` and in the PWA note of
   `scripts/lib/qa-select.mjs` that the test needs a build with no account settings.

### Not to touch, and limits that must hold

No change to `src/` or to the service worker (it is broken only for the negative control, then restored). No
assertion removed or loosened.

### Owners

The lead: the files of "What to build", `package.json`, this record.

### How the user will judge it

The two outputs of each criterion below, and a diff of tests, one test list, one printed note and docs; no
game code.

## Plan and owners

| Step | Agent | Files owned | State  |
| ---- | ----- | ----------- | ------ |
| 1    | lead  | those above | review |

## Evidence

Brief changed before the build, after the baseline run (criterion 3 now names how to build):

- Baseline, before any edit: after `npm run build` on this Mac (which reads `.env.local`), the test fails at
  line 202: offline `?view=ocean` opens the sign-in dialog, so the "Ra khơi" button is not reachable. The
  same with the fake settings of the other browser tests. With every `VITE_` account setting empty it passes.
  The test assumes a build without accounts; the app behaves as designed.

The build with no account settings, used below:
`VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_API_URL= VITE_AUTH_REDIRECT_URL= VITE_ECONOMY= npm run build`.
"Broken worker" is `scripts/service-worker.js` with `await caches.delete(name);` in `activate` replaced by
`void name;`, restored afterwards with `git checkout`.

Criterion 1, before:

```
actual: [ 'tests/pwa-browser.mjs:219', 'tests/pwa-browser.mjs:237', 'tests/pwa-browser.mjs:244' ]  (fail 1)
```

Criterion 1, after:

```
✔ no async predicate in waitForFunction   (pass 1)
```

Criterion 2, before (broken worker, old test):

```
PWA passed: GitHub Pages subpath scope/icons, ... with stale cache cleanup.
```

Criterion 2, after (broken worker, new test):

```
AssertionError: only the shell of update 2 is left: after 30000 ms the caches are
photyphu-shell:.../web-g-3d/:7bd360e44c2eec1a, photyphu-shell:.../web-g-3d/:pwa-update-test-2
    at async tests/pwa-browser.mjs:242:3
```

Criterion 3 is a guard: it passes before and after, and it was seen to fail with the broken worker
(criterion 2). Before (unbroken worker, old test, this build, the baseline):

```
PWA passed: GitHub Pages subpath scope/icons, install guide/prompt handling, static-only offline home/lazy sea reloads, self-activating updates that reload only from the idle home screen, never during a game view, with stale cache cleanup.
```

After (unbroken worker, new test):

```
PWA passed: GitHub Pages subpath scope/icons, ... with stale cache cleanup.
```

After the review fixes (the poll's message and the guard test changed): the broken worker still fails the
test at the first poll, the unbroken build passes; format, lint, `tsc` clean and 703 unit tests pass.

## Review

The `reviewer` agent (read-only, 2026-11-26): changes needed. All three criteria are checkable. Fixed: the
template had no place for a guard like criterion 3; this record's owners and diff description; the guard
test's wording and a check that files are scanned; the poll's message when the caches cannot be read; stale
doc lines. Limits kept: criterion 2 is a manual break, not a standing test, and only the first of the three
polls was shown to fail; the guard test misses a predicate passed by name. The fixes were not reviewed again.

## Approval and publication

- User approval: to build ("Sửa test PWA"); to commit and push ("Commit và push", 2026-11-27). Checks rerun
  before the commit: format, `tsc`, lint clean, 703 unit tests pass.

## Follow-ups

Found by the reviewer by reading, older than this change, not run: "never reloaded during a game view" in
`tests/pwa-browser.mjs` waits only for the new cache to be opened, which happens before the new worker takes
over, so a reload during a game could still pass; wait for `controllerchange` and add a control. The last
cache poll may also return just before the home page reloads (a possible flake).

`npm run check` builds with the developer's `.env.local`, so on a machine with one the PWA test fails at the
offline `?view=ocean` step. Not changed here: either the test or the script should set the empty settings.
