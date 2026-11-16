# Architecture and context map

The repository holds one game: a shared online fishing sea (see [ocean contract](ocean.md)). Firebase and the Monopoly board game were removed on 2026-11-16 ([decision 0012](decisions/0012-remove-firebase-and-monopoly.md)).

`src/main.ts` loads fonts and CSS, starts the PWA controller and `src/app/harbor.ts`. The harbor shows the title and "Ra khơi"; after a Supabase sign-in (`src/app/account.ts`, `src/app/password-recovery.ts`) it starts `src/app/ocean.ts`, which owns controls, fishing UI, markets and cleanup. There are no rooms.

| Layer                                               | Ownership                                                                                                                                                | Dependencies                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `src/main.ts`                                       | CSS/font imports, app root, HMR cleanup                                                                                                                  | app                           |
| `src/app/*`                                         | Harbor, account dialog, recovery dialog, sea screens (HUD, fishing, markets, minimap), PWA and update UI; DOM, navigation, lifetimes                     | ocean, platform, ui           |
| `src/ocean/*`                                       | The sea: Babylon.js + Havok scene, water, sky, boats, islands, fishing and fight rules, economy rules and client types, save format                      | Babylon, no DOM orchestration |
| `src/platform/account.ts`, `supabase-client.ts`     | Supabase Email/Password accounts (sign-up with confirmation, login, recovery); the one Supabase client, which refuses to start without its configuration | Supabase SDK, `errors.ts`     |
| `src/platform/ocean.ts`, `ocean-socket.ts`          | Socket.IO client of the shared sea (token from the Supabase session, reconnect, renewed tokens)                                                          | socket.io-client, account     |
| `src/platform/economy.ts`                           | Coins and market through the three economy RPCs (`VITE_ECONOMY=on`)                                                                                      | Supabase client               |
| `src/platform/errors.ts`                            | `HubError` (a message written for the player) and `playerName`                                                                                           | none                          |
| `src/platform/pwa.ts`, `update-check.ts`, `wake.ts` | Service worker registration and update checks, API wake-up ping                                                                                          | none from app                 |
| `src/ui/hub-canvas.ts`, `src/style.css`             | The harbor picture (canvas, no image file) and the shared theme                                                                                          | no app orchestration          |
| `server/*`                                          | Render API: `/health`, Socket.IO Auth gate (`socket.mjs`), the ephemeral shared sea (`ocean.mjs`)                                                        | Supabase Auth over HTTPS      |

Keep the boundaries proportional. Do not introduce an ECS, generic event bus, dependency injection framework or another engine speculatively. Lint prevents platform imports into app/main; ownership still needs review.

## One provider, no fallback

Accounts are Supabase Email/Password; the sea is the Render Socket.IO API. Missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` makes the harbor show "Dịch vụ đăng nhập chưa được cấu hình ..." (`supabase()` throws a `HubError`, pinned by `tests/supabase-client.test.mjs`); missing `VITE_API_URL` makes the sea say the connection is not configured. Nothing switches to another provider or to sample players. A mid-game drop reconnects automatically (`src/app/ocean.ts`).

Whether a new account must confirm its email is a Supabase Auth project setting; the dialog handles both (see [infrastructure](infrastructure.md)). `src/app/password-recovery.ts` owns the recovery dialog; the SDK `PASSWORD_RECOVERY` event arrives through the owned Auth subscription (`observePlayer`).

## Server

`server/app.mjs` creates one HTTP server with `/health` (200 while `ready()`), a 403 for an unknown `Origin` and 404 for everything else; `server/socket.mjs` attaches Socket.IO (WebSocket only) with a middleware that accepts a connection only when Supabase Auth accepts the token and the origin is allowed; `server/ocean.mjs` adds the `ocean:*` events. The API reads no database. It is one instance with in-memory sea state: do not scale it without shared simulation state.

## Data

Per device (localStorage, `src/ocean/save.ts`): boat position, the fish store and the catch count. On the server: Supabase Auth users, and the economy schema `economy_private` (wallets, ledger, prices) behind three authenticated RPCs ([decision 0010](decisions/0010-server-economy.md)). The `hub_private` schema from the removed rooms hub may still exist in the live database (see decision 0012).

## Installable static shell

The [PWA layer](pwa.md) registers a production-only, scope-local worker for static build assets and the offline home. It excludes account and API requests and does not force reload an active session. Install guides belong to `src/app/pwa.ts` and are available independently of Auth.

## Context sources

`AGENTS.md` routes agents to the [theme](design/theme.md), the [workflow](workflow.md) and the decisions. Authored docs record durable contracts; OpenWiki is a generated evidence index, refreshed through its lifecycle after source is stable. Source and executed checks take precedence over old wiki claims.
