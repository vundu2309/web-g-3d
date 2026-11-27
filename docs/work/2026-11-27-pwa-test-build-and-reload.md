---
title: The PWA test sees a reload during a game, and runs on any machine
state: user-approved
opened: 2026-11-27
owner: session "Kéo main mới và làm tiếp task cải thiện workflow"
agents: reviewer
decision: docs/decisions/0023-agentic-engineering-workflow.md
---

# The PWA test sees a reload during a game, and runs on any machine

## Feedback and goal

"chưa cần đưa lên main, làm tiếp đi" (2026-11-27). Taken up: the two open items of
[the earlier PWA test record](2026-11-26-pwa-test-waits.md), both about the success signal (step 1 of
decision 0023). The lead chose them; the user did not name them.

## Brief

### Acceptance criteria

| #   | Must be true                                                             | Check                                                                    | Before                      | After                  |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------- | ---------------------- |
| 1   | An app that reloads during a game view makes the PWA test fail           | `tests/pwa-browser.mjs` with the `?view` condition removed from `idle()` | test passes (wrong)         | test fails, as it must |
| 2   | The PWA test passes on a machine whose `.env.local` has account settings | `tests/pwa-browser.mjs` with such a file (fake values)                   | fail (timeout at "Ra khơi") | pass                   |
| 3   | Guard: it passes on the unbroken app with no `.env.local`                | `tests/pwa-browser.mjs`                                                  | pass                        | pass                   |

### What to build

1. In `tests/pwa-browser.mjs`, after update 3 wait until the new worker has taken over the page, give a reload
   time to start, and assert there was none.
2. The test builds the app itself, with every account setting empty, into `test-results/pwa/dist`.
3. The docs and the note of `scripts/lib/qa-select.mjs` that said to build first.

### Not to touch, and limits that must hold

No change to `src/` or the service worker (broken only for criterion 1, then restored). No assertion removed or
loosened. `dist/` is not written by the test.

### Owners

The lead: the files above and this record.

### How the user will judge it

The outputs below; no game code.

## Plan and owners

| Step | Agent | Files owned     | State     |
| ---- | ----- | --------------- | --------- |
| 1    | lead  | the files above | in review |

## Evidence

All runs on this Mac with system Chrome. Before: the old test after `npm run build` with the account settings
empty (criteria 1 and 3), or after a build that reads the `.env.local` (criterion 2). Broken app: the `?view`
condition of `idle()` in `src/app/pwa.ts` replaced by `true`, restored with `git checkout`.

```
C1 before:  PWA passed: ... never during a game view, with stale cache cleanup.
C1 after:   AssertionError: a game view was reloaded by an update   (actual: undefined, expected: 'in-game')
C2 before:  TimeoutError at tests/pwa-browser.mjs:226
C2 after:   PWA passed: ...
```

Criterion 3 after: passed three times in a row, and once with the browser runner's environment variables set.
The test no longer writes or reads `dist/`. Criterion 3, a guard, was seen to fail with the broken app of
criterion 1. Format, `tsc` and lint clean; 730 unit tests pass.

Limit of criterion 1: the test sees a reload that has replaced the page within about 2 s of the new worker
taking over (a second assertion follows the cache check). The reviewer showed that a reload delayed by 2.5 s
passes.

## Review

`reviewer` agent, 2026-11-27: **changes needed**; it confirmed criteria 1 (3 of 3 failures) and 2 in a copy.
Fixed: this record's broken table and missing checks; the advised command (`node scripts/qa.mjs pwa`, since
the bare command needs `CHROMIUM_PATH` on this Mac) and an inaccurate comment; a stale line in
`qa-runner.md`; the sentinel is asserted a second time. Not changed, stated above: the 2 s window. These last
fixes were not reviewed again.

## Approval and publication

- User approval: to continue the work; then to push to `main` ("Đưa lên main", 2026-11-27).

## Follow-ups
