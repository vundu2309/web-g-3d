---
title: Coastal Frosted Glass style for Harbor Hub and in-game Hub Shell
state: user-approved
opened: 2026-11-27
owner: lead
agents: research (read-only reviewer)
decision: none
---

# Coastal Frosted Glass style for Harbor Hub and in-game Hub Shell

## Feedback and goal

User asked to improve the game's hub style, reviewed 4 concept images (Coastal Frosted Glass, Nautical Postcard, Golden Hour Harbor, Cozy Tactile Arcade), and approved **Style 1 (Coastal Frosted Glass)** for both the front-door Harbor Hub (`harbor.ts`, `hub-canvas.ts`) and the in-game menu Hub Shell (`.hub-shell`: Kho cá, Chợ, Xưởng, Xếp hạng, Sổ, Thủy thủ, Cài đặt).

Current issues addressed:
- Harbor canvas (`hub-canvas.ts`) used a dark sunset purple/pink palette (`#4b3a8f` → `#e0597a`) that clashed with the bright daytime sea and frosted-glass HUD inside the game.
- Harbor cards/buttons used heavy comic borders (`3px solid #153b80`, `5–7px` hard offset shadows) and raw emojis (`⚓`, `🐟`).
- In-game `.hub-shell` used an opaque dark rail and hard `3px` bordered panel rather than the frosted-glass language of the sea HUD.

## Brief

### Acceptance criteria

| #   | Must be true                                                                                                                                      | Check (test file: name)                                                                                         | Before                                                          | After                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- |
| 1   | `hub-canvas.ts` exports a bright Coastal Frosted Glass daylight palette (`HUB_PALETTE`) matching `CHROME_COLORS.harbor` (`#82c4ff`).              | `tests/hub-canvas.test.mjs`: `Coastal Frosted Glass palette matches chrome harbor color and uses bright sky/sea` | FAIL (`AssertionError: hub-canvas exports HUB_PALETTE`)         | PASS (705/705 unit tests)    |
| 2   | `harbor.ts` renders SVG icons instead of raw `⚓` / `🐟` emojis for the anchor CTA and fish stock count.                                          | `tests/hub-canvas.test.mjs`: `harbor markup uses SVG icons instead of raw anchor or fish emojis`                | FAIL (`AssertionError: no raw anchor emoji in harbor.ts`)       | PASS (705/705 unit tests)    |
| 3   | Guard: Harbor layout fits 844×390, 667×375 and 390×844 with ≥44px touch targets, no scrollbars, no heavy assets fetched, full-screen sign-in intact. | `tests/harbor-browser.mjs`                                                                                      | Pre-existing failure at line 213 (loading steps, `workflow.md`) | All hub/sign-in checks pass; same pre-existing line 213 failure on first run & rerun |
| 4   | Guard: In-game Hub Shell (`Kho cá`, `Sổ`, `Thủy thủ`, `Cài đặt`) opens, switches tabs and renders cleanly at 844×390 and 667×375.                 | `node scripts/qa.mjs ocean-book`                                                                                | Guard                                                           | PASS (122 s, 0 page errors)  |
| 5   | Visual polish: Harbor Hub and in-game Hub Shell look cohesive in Coastal Frosted Glass with readable contrast at 844×390, 667×375 and 390×844.    | Software-rendered browser screenshots inspected by lead and submitted to user                                   | Concept approved                                                | Screenshots ready for user approval |
| 6   | `countdownText` formats compact `MM:SS` / `H:MM:SS` timers; Harbor uses icon-only live sea status + `MM:SS` event countdown, omits fish/species counts, moves logout to `.hub-tools`, and adds portrait rotate hint + in-game `.hub-rail` badges. | `tests/game-clock.test.mjs` (`countdownText`), `tests/hub-canvas.test.mjs` (`harbor markup...`) | FAIL (`countdownText` missing; `harbor omits meaningless fish stock count`) | PASS (706/706 unit tests) |

### What to build

1. Update `src/ui/hub-canvas.ts`: export `HUB_PALETTE` with bright morning sky (`#82c4ff` → `#c8e8ff` → `#fff5d6`), soft radiant sun bloom, seamless cumulus horizon cloud banks + drifting upper clouds, sunlit perspective shimmering sea (`#76ddf4`, `#3cbbe8`, `#238fd2`, `#166cb2`) with golden sun-path reflection and 4-point star sparkles, stylized soft-3D 3/4 fishing boat (shaded curved blue hull, beveled cream gunwale, 2-tone cabin with cobalt-framed reflective windows, beveled coral roof, fluttering yellow pennant), and matching portrait bands.
2. Update `src/app/chrome-color.ts`, `index.html` (`meta[name="theme-color"]`), and `public/manifest.webmanifest` (`theme_color`, `background_color`) to `#82c4ff`.
3. Update `src/app/harbor.ts` to replace raw `⚓` and `🐟` emojis with crisp inline SVG icons matching the existing icon stroke style.
4. Update `src/ocean/style.css`:
   - Harbor Hub (`.hub`, `.hub-logo`, `.hub-round`, `.hub-card`, `.hub-avatar`, `.hub-stock`, `.hub-cta`, `.hub-error`, `--flat-sea`): Coastal Frosted Glass cards/buttons (`backdrop-filter: blur(...)` with `@supports` fallback), soft elevation shadows, crisp yellow `#ffd35a` focal CTA, safe-area insets preserved in portrait.
   - In-game Hub Shell (`.ocean-dialog.is-stock[open]`, `.hub-rail`, `.hub-tab`, `.hub-page`): frosted translucent backdrop, frosted cobalt glass rail with yellow active tab, frosted high-readability ice-white page panel with `@supports` fallback.

### Not to touch, and limits that must hold

- Do not touch 3D sea rendering (`src/ocean/babylon-scene.ts`, shaders, physics), server (`server/*`), migrations (`supabase/*`), or `src/platform/*`.
- Preserve `ART_W`, `ART_H`, `artLayout`, `waveY`, `mountHubArt`, `hubArtUrl` contracts and all `data-harbor`, `data-pwa-install`, `aria-label`, focus-visible and reduced-motion rules.
- Keep touch targets ≥44px and zero horizontal/vertical overflow at 844×390, 667×375 and 390×844.

### Owners

- Lead: `docs/work/2026-11-27-hub-frosted-glass.md`, `src/ui/hub-canvas.ts`, `src/app/harbor.ts`, `src/app/chrome-color.ts`, `index.html`, `public/manifest.webmanifest`, `src/ocean/style.css`, `tests/hub-canvas.test.mjs`
- Read-only reviewer (`research` subagent): diff review before commit

### How the user will judge it

Software-rendered browser screenshots of the live Harbor Hub (844×390, 667×375, 390×844) and in-game Hub Shell (844×390, 667×375) shown to the user for visual approval before any commit/push.

## Plan and owners

| Step | Agent | Files owned | State |
| ---- | ----- | ----------- | ----- |
| 1. Work record & failing tests | Lead | `docs/work/2026-11-27-hub-frosted-glass.md`, `tests/hub-canvas.test.mjs` | done |
| 2. Style 1 implementation | Lead | `src/ui/hub-canvas.ts`, `src/app/harbor.ts`, `src/app/chrome-color.ts`, `index.html`, `public/manifest.webmanifest`, `src/ocean/style.css` | done |
| 3. Checks, browser tests & screenshots | Lead | none (read/run) | done |
| 4. Independent review & fixes | Read-only reviewer + Lead | `public/manifest.webmanifest`, `src/ocean/style.css` | done |

## Evidence

- **Checks (lead's own run)**:
  - Before change (`tests/hub-canvas.test.mjs`): 3 pass, 2 fail (`HUB_PALETTE` missing, raw anchor emoji present).
  - After change: `npm run format:check` PASS, `npx tsc --noEmit` PASS, `npm run lint` PASS, `npm run test:unit` PASS (705/705 tests, 0 failures).
- **Browser tests (`node scripts/qa.mjs harbor ocean-book`)**:
  - `ocean-book`: PASS (122 s, 0 page errors, verified 844×390 and 667×375).
  - `harbor`: FAIL on both first run and rerun at line 213 (`actual: ['is-active', 'is-active', ''], expected: ['is-done', 'is-active', '']`) — known pre-existing failure on `main` documented in `docs/workflow.md`; all hub layout, touch-target, sign-in, and no-heavy-fetch assertions before line 213 passed.
- **Images (software-rendered, not committed)**:
  - Harbor Hub: `harbor-844x390.png`, `harbor-667x375.png`, `harbor-390x844.png`
  - In-game Hub Shell: `book-844.png`, `book-667.png`
- **Not verified**: real phone touch/backdrop-filter performance, Safari iOS status bar tinting, frame rate.

## Review

**Round 1** (read-only `research` subagent, no blockers):
1. **Minor** — `public/manifest.webmanifest` still had `#4b3a8f` for `theme_color` and `background_color`. **Fixed** (`#82c4ff`).
2. **Note** — `.hub-tab.is-close:hover` slightly dimmed alpha from `0.14` to `0.12`. **Fixed** (`0.18` / `0.22`).
3. **Note** — Portrait `@media (orientation: portrait)` on `.hub-cta` overrode `--safe-bottom`. **Fixed** (`max(20px, var(--safe-bottom))`).

**Round 2** (read-only `research` subagent, after soft-3D canvas rebuild & content refinement):
1. **Blocker** — `harbor.ts` `enter()` did not call `stopArt?.()` before `startOcean`, leaving the 30fps harbor canvas loop running off-screen during 3D play. **Fixed** (`stopArt?.(); stopArt = undefined;` called in `enter()` and `render()`).
2. **Minor** — `hubNav.badge("crew")` counted offline/stale boats (`boats.length`). **Fixed** (`visibleBoats().filter((boat) => !boat.offline).length`).
3. **Minor** — `.hub-sea` used `role="status"` with unconditional 1Hz `innerHTML` rewrites. **Fixed** (removed `role="status"`, skipped when `document.hidden`, only mutates DOM when `label` changes).
4. **Note** — Landscape `.hub-card` `max-width` did not subtract `--safe-left`/`--safe-right`. **Fixed**.

## Approval and publication

- User approval: concept Style 1 approved 2026-11-27; implementation screenshots and refined content approved by user on 2026-11-27 ("oke rồi").
- Commits: pending commit SHA
- Deploys checked: not pushed yet (awaiting user say to push to `main`)

## Follow-ups

- None.
