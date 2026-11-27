---
title: The off-screen player arrow stays clear of the minimap
state: published
opened: 2026-11-27
owner: session "Kéo main mới và làm tiếp task cải thiện workflow"
agents: sea-visual-builder, sea-visual-reviewer, qa-runner
decision: docs/decisions/0023-agentic-engineering-workflow.md
---

# The off-screen player arrow stays clear of the minimap

## Feedback and goal

The user chose this on 2026-11-27 ("Mũi tên bị minimap che") as the first trial change of step 4 of decision 0023. It is a follow-up of [the minimap record](2026-11-25-minimap-big-map.md): "The edge arrow that points to
a boat off screen ("Minh 331 m") is partly hidden by the minimap". By the numbers in the code: the arrow
sits on a ring up to x 0.86 and from y 0.23 of the view (`src/ocean/indicator.ts`), centred and
bottom-anchored; at 844×390 the minimap covers about x 692 to 828, y 12 to 148, so a label towards the top
right overlaps it and the minimap is drawn above.

## Brief

### Acceptance criteria

| #   | Must be true                                                                                                                                 | Check                                                                                             | Before                    | After    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- | -------- |
| 1   | The edge label of an off-screen online player towards the top right does not intersect the minimap, at 844×390, 932×430, 667×375 and 390×844 | a browser test on the real scene comparing the two DOM rectangles (a new test or an existing one) | covered (4 views)         | clear    |
| 2   | For every direction, the placed label does not intersect the minimap's rectangle and stays inside the view                                   | `tests/ocean.test.mjs`, a sweep over directions with the label size and the four sizes            | fail: 2015 of 17280 cover | pass     |
| 3   | Guard: the arrow still points at the boat (`turn`, distance unchanged) and a label that did not touch the minimap stays where it was         | `tests/ocean.test.mjs`; shown to fail with a deliberate break                                     | pass                      | pass     |
| 4   | Guard: the existing off-screen arrow test passes unchanged                                                                                   | `tests/ocean.test.mjs`, "an off-screen player gets an arrow pointing toward them"                 | pass                      | pass     |
| 5   | The new place looks right                                                                                                                    | the user, from before/after images at the four sizes                                              | images                    | approved |

### What to build

1. Pure maths in `src/ocean/indicator.ts`: given the label's box and the rectangle to keep clear, a place
   that does not overlap it, moved as little as possible and still inside the view.
2. `src/ocean/babylon-scene.ts`: use it for edge labels only, with the minimap's rectangle as measured on the
   page (no copied sizes), and without a layout read for every label on every frame.

### Not to touch, and limits that must hold

The minimap's place and size, `server/`, `supabase/`, the labels of boats that are on screen, stacking of
names. No new per-frame cost worth listing (`docs/performance.md`). No existing assertion removed or loosened.

### Owners

`sea-visual-builder`: `src/ocean/indicator.ts`, `src/ocean/babylon-scene.ts`, `src/ocean/style.css` if
needed, `tests/`, `scripts/` only to register a new test. The lead: this record.

### How the user will judge it

Before/after images; no push until the user approves them.

## Plan and owners

| Step   | Agent                 | Files owned | State |
| ------ | --------------------- | ----------- | ----- |
| Build  | `sea-visual-builder`  | see Owners  | done  |
| Review | `sea-visual-reviewer` | none        | done  |
| QA     | `qa-runner`           | none        | done  |

## Evidence

`sea-visual-builder`: 1,347 s, about 209,000 tokens (stopped early at the user's complaint about time).
Software rendering only.

- Criterion 1, `tests/ocean-arrow-browser.mjs`, before: "covered by the minimap" at 844×390, 932×430,
  667×375 and 390×844 with a 47 px top inset; plain 390×844 was never covered (there it is a guard). After:
  0 failures. One bearing only (52 degrees right); other directions rest on the unit sweep.
- Criterion 2, unit sweep, before: "2015 of 17280 placements cover the minimap". After: pass.
- Criterion 3, deliberate breaks, restored: "x moved ... 0.501 !== 0.5"; "turn at ... + 0 - 0.7504915783575616".
- Not the strict "moved as little as possible" of the brief: the label slides along a line from the map's
  outer corner, because the nearest free place jumps 58 to 141 px as the boat turns. It travels up to 48 to
  61 px further than the nearest place at the sizes checked (70 to 91 px with a side inset or a wide label).
  The brief also did not name `src/app/ocean.ts` (4 lines of wiring). A label overflowing the view is now
  pulled inside even when clear of the map.
- `qa-runner` (95 s, about 22,000 tokens): format, `tsc`, lint, unit 733 of 733, `ocean-arrow` and
  `ocean-map` pass on the first run.
- Not passing, not verified with this change: `ocean-multiplayer` (line 98, `7 !== 1`) and `ocean-babylon`.
  Both fail on unchanged code too. `ocean-babylon` fails at varying places: the lead's three runs of unchanged
  client code stopped at lines 137, 363 and 156 (labels `['Bạn']`), and one run with this change at 363 and
  156, the same set. Not run: the rest of the `ocean` group, a real phone, frame rate.
- Images (not committed): before and after at the four sizes and 390×844 with the inset.

Rebased on `d023650` (hub restyle and boat paint, published by another session) before the push; the lead
reran format, `tsc`, lint, unit 740 of 740, `ocean-arrow`, `ocean-map` and the build: pass.

## Review

`sea-visual-reviewer` (137 s, about 83,000 tokens), 2026-11-27: **changes needed (small)**, no fault in the
maths, no per-frame layout read. Done: `docs/ocean.md`, this record, the name of a unit test that claimed
more than it checks. Accepted, not changed: the slide instead of the nearest place (above); the limits below.
These last edits were not reviewed again.

## Approval and publication

- User approval: to make this change, then to push to `main` ("Đưa lên main", 2026-11-27) after the before/after images were sent.

- Commit: `bac0d19` on `main`. GitHub Actions runs 45969116403 (Work record) and 45969116396 (Pages) passed.
- Vercel `dpl_J8WdtAUUMUsgw9xtFcNJkvL7dyTC` ready, alias `web-g-3d.vercel.app`; the live entry's ocean chunk
  contains `keepLabelsClearOf`. The changed screen was not looked at on the live site (it needs a sign-in).

## Follow-ups

- The short status message on entering the sea can overlap the moved label by a few pixels while it shows.

- If left and right safe-area insets swap with the same total (a phone with one cut-out turned half round),
  nothing changes size, so the map is not measured again until the next resize (from reading, not run).
- The cached label size ignores digit widths and a late web font (covered by the 6 px gap). Labels also
  avoid the minimap while it is faded.
- `scripts/qa.mjs --port` is broken (reported by the builder, not checked).

- Other controls (the stick, the action buttons) may also cover an edge label; not checked.
