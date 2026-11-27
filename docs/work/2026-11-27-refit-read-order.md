---
title: A slow, older loadout answer no longer replaces a newer one
state: user-approved
opened: 2026-11-27
owner: session "Kéo main mới và làm tiếp task cải thiện workflow"
agents: builder, reviewer, qa-runner
decision: docs/decisions/0023-agentic-engineering-workflow.md
---

# A slow, older loadout answer no longer replaces a newer one

## Feedback and goal

The user chose this on 2026-11-27 ("Sửa lỗi dữ liệu cũ đè mới") as the second trial change of step 4 of
decision 0023. Found by reading `server/ocean.mjs`, not reproduced when this was written: `refit()` applies
whatever `readFit` returns. Two reads can run at once, because the gap between refits (`minRefitMs`, 2000 ms)
is shorter than the longest read (`fitWaitMs`, 2500 ms). If the first answers after the second, everyone
else sees the older boat and rod.

## Brief

### Acceptance criteria

| #   | Must be true                                                                                                         | Check                                                                              | Before            | After |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- | ----- |
| 1   | When a refit read answers after a later-started read was applied, the boat keeps the newer tiers and nothing is sent | `tests/ocean-socket.test.mjs`, a new test with two reads answered in reverse order | fail (older sent) | pass  |
| 2   | When the later read fails or times out, the earlier read's answer is still applied                                   | `tests/ocean-socket.test.mjs`; guard, shown to fail with a deliberate break        | pass              | pass  |
| 3   | Guard: the existing socket and sea tests pass unchanged                                                              | `npm run test:api` and `npm run test:unit`                                         | pass              | pass  |

### What to build

1. In `server/ocean.mjs`, an answer is applied only if no answer of a later-started read of the same
   connection has been applied. Keep it local to `refit`.

### Not to touch, and limits that must hold

The protocol and event shapes, the rate limit, `supabase/`, `src/`. Tiers still come only from the server's
own read, never from the client. No existing assertion removed or loosened.

### Owners

`builder`: `server/ocean.mjs`, `tests/ocean-socket.test.mjs`. The lead: this record and the contract line in
`docs/ocean.md` (added after the review).

### How the user will judge it

The outputs below; no visible change in the normal case.

## Plan and owners

| Step   | Agent       | Files owned | State |
| ------ | ----------- | ----------- | ----- |
| Build  | `builder`   | see Owners  | done  |
| Review | `reviewer`  | none        | done  |
| QA     | `qa-runner` | none        | done  |

## Evidence

The brief first named `npm run test:unit` for criterion 3; the socket tests run only under `npm run test:api`,
which the builder found. Corrected after the build.

`builder`, 138 s, about 121,000 tokens. Criterion 1 on the unchanged server (seen by the builder, and again by
the lead by putting `HEAD`'s `server/ocean.mjs` back for one run):

```
the older answer sends nothing
actual:   [ { uid: 'bao', tier: 3, rod: 2 }, { uid: 'bao', tier: 1, rod: 1 } ]
expected: [ { uid: 'bao', tier: 3, rod: 2 } ]
```

After: the lead's run of `npm run test:api`, 9 of 9 pass. Criterion 2, break made by the builder
(`read < refitStarted` in place of `read < refitApplied`): "after a failed later read", actual `[]`. The break
stops at the failed read, so the timed-out part was not seen red by itself. The builder's runs: format, `tsc`,
lint (`src` only), unit 730 of 730.

## Merged onto the new `main` (2026-11-27)

Before the push, `1376983` (boat paint, another session) had fixed criterion 1 with a `refitSeq` guard: only
the latest started read applies. On `d023650` this record's first test passes and its second fails ("after a
failed later read", actual `[]`). The user approved replacing that guard with this record's rule ("Ghép và
đưa lên"). The paint fields and their test are kept. The evidence above and the table's "Before" are from the build on
`60556b3`. On the merged tree: format, `tsc`, lint, `test:unit` 740 of 740 and `test:api` 10 of 10 pass (the
lead's run). One earlier `test:api` run on the old base failed 1 of 9; under 24 parallel runs the old test
"separate authenticated boats" failed twice at line 88 (not changed here; whether it was that run's failure is
not known).

## Review

`reviewer` agent (145 s, about 62,000 tokens), 2026-11-27: **approve with notes**, no code change. It reran the
four checks, `test:api` and the breaks in a copy, found no answer that should apply being dropped and nothing
new taken from the client, and saw the timed-out part of criterion 2 fail on its own (with the failed-read
block removed from the test). Notes, all about docs: the contract line in `docs/ocean.md` (added by the lead,
not reviewed again), this record's empty parts, and the progress record naming a record that is on the other
branch.

`qa-runner` (about 827 s, about 63,000 tokens), run while the other change's browser tests loaded the
machine: format, `tsc`, lint, unit 730 of 730 and `test:api` 9 of 9 pass. `ocean-multiplayer`, the browser
test picked for this change, **fails** (`7 !== 1`, line 98), and fails the same way on unchanged `60556b3`:
an old fault, probably the selector counting patrol ship labels (not confirmed). With the selectors patched in
a scratch copy, unchanged code passed once (232 s); with this server change one run got past the boats and the
arrow and timed out at line 137 (revoked session), once, at load about 22: **not confirmed, not passed**.

A second `reviewer` run on the merged code: **approve with notes** (record only, added here). It checked the
paint cases and the interleavings, the `docs/ocean.md` line, that the test from `1376983` is unchanged and
passes, and reran `test:api`, unit and `tsc`; no socket test covers removing a paint on refit.

## Approval and publication

- User approval: to make this change, then to push to `main` ("Đưa lên main"), then to merge onto the new `main` ("Ghép và đưa lên", 2026-11-27).

## Follow-ups

- `ocean-multiplayer` fails on `main`; its fixed port also stops two runs at once.
- `npm run test:api`, the only command that runs the socket tests, is not run by CI.
