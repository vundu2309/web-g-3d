# 0012. Remove Firebase and Monopoly

Date: 2026-11-16. Status: decided by the user, implemented in the repository; live resources not touched.

## The decision

The user, in their words: "Gỡ toàn bộ Firebase và Monopoly, test cơ bản thôi" (remove all of Firebase and Monopoly; basic tests only). This overrides the older rules in AGENTS.md and decisions 0002 to 0007 that said to preserve the Monopoly code, the rooms hub and the Firebase authenticator.

## What was removed

- **Monopoly**: the board game and everything for it. `src/hub` (room model, store, timing diagnostics), `src/game-ui` (HUD preview), `src/board` (the Three.js 3D board), `src/app/play.ts`, `src/app/start.ts`, `src/app/diagnostics.ts`, `src/ui/art.ts`, `src/platform/api.ts` (rooms over HTTP/Socket.IO) and `demo.ts` (same-browser preview); the `?view=game` and `?view=monopoly-hub` routes; the board, hub and room CSS; `docs/game/**` (rules, plans, HUD design), `docs/diagnostics.md`, the Monopoly concept images in `docs/design/`; their tests; the `three` and `@types/three` dependencies.
- **Firebase**: `src/platform/firebase*.ts`, `firestore-client.ts`, `ocean-firebase.ts`, `profile.ts`, `account-errors.ts`, the Firebase branches of `account.ts` and `ocean.ts`, the `VITE_ONLINE_BACKEND` provider switch (`online-config.ts`), `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `scripts/test-rules.mjs`, `tests/rules.test.mjs`, `docs/firebase.md`, and the `firebase`, `firebase-tools` and `@firebase/rules-unit-testing` dependencies.
- **Server**: the rooms HTTP endpoint (`/v1/hub`), the `hub:snapshot` socket event, the PostgreSQL LISTEN/NOTIFY listener (`server/notifications.mjs`, `server/supabase-root-ca.crt`) and the `pg` dependency. The API no longer reads any database, so `DATABASE_URL` is not used and `/health` is 200 as soon as the process runs.
- **Tests and scripts**: `test:rules`, `test:postgres` (hub SQL scenarios), `test:supabase` (the Docker full-stack run, which was built around the rooms hub) and the browser tests of the hub, HUD, board, safe-area HUD, Firebase auth and the old Firestore sea.

## What remains

The fishing sea (`src/ocean`, `src/app/ocean.ts`, `harbor.ts`, markets), the harbor entry in `src/main.ts`, Supabase Email/Password accounts (confirmation, recovery) in `src/platform/account.ts`, the Socket.IO sea client and server, the economy client and its RPC migration, the PWA, Babylon.js + Havok and the Blender pipeline. The sea always uses Supabase + Socket.IO. With `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` missing the harbor shows "Dịch vụ đăng nhập chưa được cấu hình ..."; with `VITE_API_URL` missing the sea says so. Nothing falls back to another provider. `HubError` and `playerName` moved to `src/platform/errors.ts`.

## Consequences

- **Firebase accounts and data are no longer reachable from the app.** Nobody can sign in with a Firebase account, and the old Firestore rooms, profiles and `oceanBoats` are not read. Accounts live only in Supabase (new registration, as decided in 0006).
- GitHub Pages rollback to a Firebase build is no longer possible from this code; the older deployment stays as it was until the user takes it down.
- Email confirmation and recovery are still covered by `tests/account-signup-browser.mjs` (faked Auth API); the old two-browser run against real GoTrue is gone.

## Live resources the user may remove later (not touched by this change)

- **Supabase**: `supabase/migrations/20261104084815_hub_infrastructure.sql` is applied history and was left alone. It created the schema `hub_private` (`profiles`, `rooms`, `memberships`), the RPC `public.hub_command`, the NOTIFY trigger on `hub_changes` and their grants. They are unused now and can be dropped with a new migration (not the economy schema, `economy_private` and its three RPCs, which the market uses).
- **Firebase console** (project `movieapp-fa2d4`): Auth users, Firestore `(default)` documents under `monopolyHub/v1/...`, the deployed Firestore rules and index. The project also holds other data (Movieapp), so delete only what belongs to this game.
- **Render**: the `DATABASE_URL` environment variable of `web-g-3d-api` is unused.
- **Vercel**: `VITE_ONLINE_BACKEND` is ignored. `VITE_FIREBASE_*` variables, if any were set, are unused.
