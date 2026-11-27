---
title: Boat paint shop and multiplayer paint sync (P5)
state: user-approved
opened: 2026-11-27
owner: main session
agents: research (independent read-only code reviewer)
decision: docs/decisions/0024-boat-paint.md
---

# Boat paint shop and multiplayer paint sync (P5)

## Feedback and goal

User request (2026-11-27): finish the last phase (P5 — boat paint) of the six-phase gameplay plan ([`2026-11-26-gameplay.md`](2026-11-26-gameplay.md)), show concept images first, then build and capture real browser screenshots for approval before pushing/deploying.
The user approved the two concept images (shipyard `Sơn tàu` tab + 8 palettes with prices 150 / 400 / 800 / 2,000 xu) and confirmed using the existing Blender boat GLBs (`boat.glb`, `boat-2.glb`, `boat-3.glb`, `boat-4.glb`).

## Brief

### Acceptance criteria

| #   | Must be true                                                                                                                               | Check (test file: name)                                                               | Before | After |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------ | ----- |
| 1   | 8 player boat palettes exist (4 classic + 4 new), none collide with Vietnam flag or patrol ship, and default UID hash stays in 0..3        | `tests/boat-paint.test.mjs`: palette catalogue, default hash, and migration prices    | FAIL (`ERR_MODULE_NOT_FOUND: src/ocean/paint.ts`) | PASS (4/4) |
| 2   | Paint prices in `src/ocean/paint.ts` match seed rows in `supabase/migrations/20261129120000_boat_paint.sql`                                | `tests/boat-paint.test.mjs`: prices equal migration seed rows                         | FAIL (`ERR_MODULE_NOT_FOUND`) | PASS |
| 3   | `paintView` computes owned/affordable/poor/active states, free UID default, and non-sequential buying                                      | `tests/boat-paint.test.mjs`: paintView states                                         | FAIL (`ERR_MODULE_NOT_FOUND`) | PASS |
| 4   | `memoryEconomy` enforces `buyPaint` (deducts coins, equips, rejects owned/poor/invalid) and `setPaint` (equips owned, rejects unowned)     | `tests/boat-paint.test.mjs`: memoryEconomy paint rules                                | FAIL (`ERR_MODULE_NOT_FOUND`) | PASS |
| 5   | `server/ocean.mjs` reads `paint` from `loadoutOf` / `parkedOf` and relays it in `ocean:state`, `ocean:delta`, and `ocean:refit` (ignoring client payload) | `tests/ocean-socket.test.mjs`: boat paint synced from account and refit               | PASS (7/7 before new test) | PASS (8/8) |
| 6   | SQL migration M3 enforces prices, `EC409`/`EC402`/`EC422`/`22023`, `default_paint` hash, `parked_boats` paint, and RLS/privileges          | `tests/economy-postgres.sh` in disposable PostgreSQL 16                               | FAIL on stale loadout key checks (`paint`, `paints`) | PASS (`economy ok`) |
| 7   | Shipyard hub shows `Thuyền` and `Sơn tàu` tabs, real 3D GLB boat thumbnails per paint, buy & equip updates wallet, boat palette, and fits 844×390 & 667×375 | `tests/ocean-paint-browser.mjs`: shipyard paint shop + screenshots                    | FAIL (synchronous thumb render blocked click, `aria-disabled` click) | PASS (1/1, 114 s) |
| 8   | Existing unit, API, format, typecheck, lint and build checks pass (guard)                                                                  | `npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run test:api`, `npm run build` | guard: `tests/qa-select.test.mjs` failed until `ocean-paint` was added to `tap.mjs` row | PASS (734/734 unit + 8/8 API + build) |
| 9   | Visual quality of `Sơn tàu` UI and painted 3D boat on the sea at 844×390 and 667×375                                                       | User judges real browser screenshots in `test-results/paint-*.png` before push        | concept approved | awaiting user approval |

### What to build

1. **Palettes & paint rules** (`src/ocean/palette.ts`, `src/ocean/paint.ts`, `src/ocean/upgrades.ts`):
   - Expand `boatPalettes` to 8 player palettes (`PLAYER_PALETTES = 8`, `DEFAULT_PLAYER_PALETTES = 4`, `PATROL_PALETTE = 8`). `paletteIndex(uid)` keeps hashing to `0..3` so existing players keep their colour. Add `paintPalette(uid, paint)` and `hullCss(uid, paint)`.
   - Add `src/ocean/paint.ts` with `PAINTS` (8 entries: ids 0..7, names, prices 150×4, 400×2, 800, 2000), `isPaint`, `clampPaint`, `paintPrice`, `paintOwned`, `paintView`.
   - Extend `Loadout` with optional `paint?: number` and `paints?: readonly number[]` (omitted when absent so older servers and existing tests stay compatible).
2. **SQL migration M3** (`supabase/migrations/20261129120000_boat_paint.sql`):
   - `economy_private.paint_prices`, `economy_private.default_paint(uuid)` (`set search_path = ''`) matching JS `paletteIndex(uid)`, `paint` and `paints` columns on `economy_private.loadouts`.
   - Update `economy_private.loadout_of(uuid)` and `economy_private.parked_boats()` to include `paint` (and `paints` in `loadout_of`).
   - Add `economy_private.buy_paint(integer)`, `economy_private.set_paint(integer)` and public authenticated RPCs `public.economy_buy_paint(integer)`, `public.economy_set_paint(integer)`.
3. **Platform & API sync** (`src/ocean/economy-api.ts`, `src/platform/economy.ts`, `src/ocean/model.ts`, `server/ocean.mjs`, `src/platform/ocean-socket.ts`).
4. **3D scene, thumbnails, HUD & Shipyard UI** (`src/ocean/boat-picture.ts`, `src/app/item-thumb.ts`, `src/ocean/babylon-scene.ts`, `src/app/market-ui.ts`, `src/app/minimap.ts`, `src/app/ocean.ts`, `src/ocean/style.css`).
5. **Tests & docs**: `tests/boat-paint.test.mjs`, `tests/ocean-socket.test.mjs`, `tests/economy-postgres.sh`/`.sql`, `tests/ocean-paint-browser.mjs`, `scripts/lib/qa-select.mjs`, `scripts/qa.mjs`, `docs/decisions/0024-boat-paint.md`, `docs/ocean.md`.

### Not to touch, and limits that must hold

- Do not edit or delete any applied migration in `supabase/migrations/`.
- Do not modify Blender `.glb` files or boat handling/speed/physics.
- Do not touch live Supabase, Render, or Vercel; do not push to `main` until the user approves the real browser screenshots.
- Keep `src/platform/*` free of imports from `src/app/*`.

## Plan and owners

| Step | Agent    | Files owned                                                                 | State       |
| ---- | -------- | --------------------------------------------------------------------------- | ----------- |
| 1    | lead     | `docs/work/2026-11-27-boat-paint.md`, `docs/work/2026-11-26-gameplay.md`    | done        |
| 2    | lead     | Red tests first (`tests/boat-paint.test.mjs`)                               | done        |
| 3    | lead     | Implementation (palette, paint, SQL, economy, server, scene, UI, CSS)       | done        |
| 4    | lead     | Unit, API, Postgres SQL, browser tests + screenshots                        | done        |
| 5    | research | Independent read-only review of full diff (4 findings, all 4 fixed)         | done        |
| 6    | user     | Review real browser screenshots & approve push/deploy                       | in progress |

## Evidence

- **Red before build**: `node --import ./tests/support/register-resolve.mjs --test tests/boat-paint.test.mjs` failed with `ERR_MODULE_NOT_FOUND: Cannot find module '.../src/ocean/paint.ts'`.
- **Checks after build & review fixes**:
  - `npm run format:check`: clean (`All matched files use Prettier code style!`).
  - `npx tsc --noEmit`: clean (0 errors).
  - `npm run lint`: clean (0 errors).
  - `npm run test:unit`: 734/734 passed (733 passed + `tests/qa-select.test.mjs` failed once as guard for missing `tap.mjs` row, then 13/13 passed after adding `ocean-paint` to `tap.mjs` row).
  - `npm run test:api`: 8/8 passed (including new boat paint loadout, parked-boats, and `ocean:refit` test).
  - `tests/economy-postgres.sh` (disposable `postgres:16-alpine` container): passed (`economy ok`), rerun after `set search_path = ''` fix (`economy ok`).
  - `npm run build`: clean production bundle.
- **Browser tests**:
  - `CHROMIUM_PATH=/usr/bin/google-chrome node scripts/qa.mjs --no-rerun ocean-paint`: **PASS (1/1, 114 s)**. Verified 8 paint cards with real Blender `boat.glb` thumbnails, 44px touch targets, 0 px horizontal overflow at `844×390` and `667×375`, buying `Vàng Nắng Mai` (`400 xu` deducted, `850 xu` left, `.is-using` active, `refit` emitted), poor paint tap warning, and painted 3D boat on the sea.
- **Images** (software-rendered in Chrome, not committed):
  - `test-results/paint-shop-844x390.png`
  - `test-results/paint-shop-667x375.png`
  - `test-results/paint-sea-844x390.png`
- **Not verified**:
  - Real phone (iOS/Android touch, Safari, FPS), live Supabase migration apply, live Render/Vercel deploy.

## Review

Independent read-only review (`research` subagent) found no high-severity/blocking security or architecture issues and reported 4 concrete findings, all 4 fixed:
1. **[Medium]** `src/ocean/babylon-scene.ts`: missing `this.remotePaints.delete(id)` when a remote boat leaves `this.fleet` — **fixed**.
2. **[Medium]** `server/ocean.mjs`: concurrent `refit()` calls in the 2000–2500 ms window could overwrite newer state if an older `readFit()` resolved last — **fixed** with per-socket `refitSeq` guard.
3. **[Low]** `supabase/migrations/20261129120000_boat_paint.sql`: `economy_private.default_paint` lacked `set search_path = ''` — **fixed** and re-verified in PostgreSQL 16.
4. **[Low]** `src/app/market-ui.ts`: stale `setPaint` `EC422` showed the tiered upgrade message (`FAILURES.order`) — **fixed** with paint-specific message `"Bạn chưa mua màu sơn này."`.

## Approval and publication

- Concept approval: user approved `Sơn tàu` UI + 8 palettes on 2026-11-27 ("oke, làm đi rồi chụp tôi xem kết quả").
- Final screenshot approval: user approved real browser screenshots (`boat_paint_preview.md`) on 2026-11-27 ("oke") to commit and push/deploy.
- Commits: added in follow-up commit after push.
- Deploys checked: pending approval.

## Follow-ups

- After user approves screenshots: commit, push to `main` (or open PR per user preference), monitor CI + Vercel/Render deploys, and record commit SHAs + `published` state in a follow-up commit.
