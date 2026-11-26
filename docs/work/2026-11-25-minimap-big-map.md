---
title: Minimap refined, with a full-screen big map
state: published
opened: 2026-11-25
owner: main session (web-g-3d-cf)
agents: qa-runner and sea-visual-reviewer (both read-only, run on 2026-11-26 after the change was published); built by the lead alone
decision: none
---

# Minimap refined, with a full-screen big map

> The change was built and shown to the user before this record existed. The record was written on 2026-11-26, after a `qa-runner` and a `sea-visual-reviewer` run on the finished change, so the Review section is real, but the intake and the build did not go through the agents.

## Feedback and goal

"Chỉnh lý mini map". Choices: compact and on the approved theme; tapping opens a big map with place names; keep the whole sea; north up. Then: the big map must be **full screen, not in the hub**; "vị trí đặt mini map không hợp lý, thừa quá nhiều không gian ở trên"; "npc không cần đưa vào minimap đâu". The user asked what the triangles are (they are boat arrows); no legend was requested.

## Brief

1. The minimap sits level with the settings button at the top; drop the 60 m grid, the palms and the inner hill on each island.
2. A tap (or Enter) on it opens a full-screen modal map with numbered badges for the harbor, the five markets and the three yards, and a list sorted by distance from the boat. It does not open while fishing or holding a fish, and the sea is not controllable while it is open.
3. Patrol ships and cat boats are not drawn on either map (`playersOnMap`).
4. Do not touch the economy, the fishing rules or the server.

## Plan and owners

| Step   | Agent                 | Files owned                                                                                                              | State           |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Build  | lead                  | `src/app/big-map.ts` (new), `src/app/minimap.ts`, `src/ocean/minimap-math.ts`, `src/app/ocean.ts`, `src/ocean/style.css` | published       |
| Tests  | lead                  | `tests/minimap.test.mjs`, `tests/ocean-map-browser.mjs` (new, registered in `scripts/test-browser.mjs`)                  | published       |
| QA     | `qa-runner`           | none (read-only)                                                                                                         | done 2026-11-26 |
| Review | `sea-visual-reviewer` | none (read-only)                                                                                                         | done 2026-11-26 |

## Evidence

The lead's runs, before the merge with main: 619 unit tests pass, format, tsc and lint clean; browser tests `ocean-map` (844×390, 932×430, 667×375, 390×844), `ocean-market` and `ocean-patrol` pass; a negative control (the tap target removed) fails `ocean-map` as it should.

The `qa-runner` run on 2026-11-26 (worktree `wt/minimap`, HEAD `14884e1`, after the merge with main, clean tree):

- format:check, `tsc --noEmit`, lint: pass. Unit tests: 647 run, 647 pass (the difference from 619 is the main commits merged in).
- Browser tests: `ocean-map` pass, `ocean-patrol` pass, `ocean-market` **fails** on the first run and on the rerun.
- `ocean-market` was classified as an **environment** failure: four `ERR_CONNECTION_REFUSED` console errors, which the test treats as page errors (`tests/ocean-market-browser.mjs:215`), because no local API is running on this machine. The same test fails the same way in the main checkout without this change (at `51d6739`, not at the newest `origin/main`). Whether `ocean-market` passes with a local API running was **not** run.
- `ocean-input` ("Về sảnh" step) fails on unchanged main too; neither agent re-ran it.
- Not verified: a real phone, Safari, frame rate, the full `npm test`, `pwa-browser`.

## Review

`sea-visual-reviewer` verdict: **no open findings**, with these notes:

1. The `is-holding` guard is tested only with the class set by hand; the `fishingUi.fishing` path is not driven by any test (the code checks both conditions; the reviewer did not run it).
2. The minimap keeps `tabindex=0` while it is faded out during a hold, so keyboard focus can land on an invisible control (activation is refused).
3. `docs/ocean.md` had no Performance pass note for the big map: added on 2026-11-26.
4. The stylesheet uses raw hex values for the approved cobalt, yellow and sky colours; `tests/art-palette.test.mjs` passes, and the old minimap did the same, so it counts as the existing convention.
5. Whether the `shown` boats really carry `npc` is covered by a source-text test only, not by a run.

Builder claims checked by the reviewer: 619 unit tests: different (647 on the merged HEAD); format, tsc, lint: confirmed; `ocean-map`: confirmed (ran it); `ocean-market` and `ocean-patrol` at four viewports and `ocean-input` on main: not checked by the reviewer. It saw no images, so it makes no visual claims.

## Approval and publication

- User approval: "ổn rồi" on the preview, then the merge with main and the push.
- Commits: `6ef8b85` feat(ocean): the minimap sits at the top edge and opens a full-screen big map; players only; merged into main as `4645dee`, then `14884e1`.
- Deploys checked: Vercel reported success for `4645dee` and for `14884e1`; the public lazy chunk `ocean-BSlbL59O.js` contained the big-map strings ("Đóng bản đồ"). Not seen on a phone.

## Follow-ups

- The edge arrow that points to a boat off screen ("Minh 331 m") is partly hidden by the minimap; not fixed.
- Make the invisible minimap not take keyboard focus while it is faded (note 2).
- A test that drives the real line-out path against the tap (note 1).
- The `ocean-market` and `ocean-input` browser tests need a local API or a mock to pass on a machine without one.
