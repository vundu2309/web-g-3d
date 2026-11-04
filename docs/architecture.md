# Architecture and context map

Phố Tỷ Phú is a TypeScript/Vite browser hub for a future property-trading board game. The ocean, Babylon and Havok code/dependencies are removed. No board, 3D renderer, monetary economy or gameplay simulation is implemented yet.

| Layer | Ownership | Dependencies |
| --- | --- | --- |
| `src/main.ts` | CSS/font imports, app root, HMR cleanup | app |
| `src/app/start.ts` | Screen state, forms, accessible UI, navigation, store ownership and subscriptions | hub contracts, UI, lazy platform adapters |
| `src/ui/art.ts`, `src/style.css` | SVG artwork/icons and shared responsive theme | no app orchestration |
| `src/hub/model.ts` | Room schema, validation, pure command transitions and start invariants | no Firebase or DOM |
| `src/hub/store.ts` | Minimal room-storage contract | model types |
| `src/app/account.ts` | Accessible native account dialog and cancellation | account service |
| `src/platform/account.ts`, `firebase-client.ts` | Firebase app and email/password Auth | Firebase SDK, hub validation |
| `src/platform/profile.ts`, `firestore-client.ts` | Lazy Firestore initialization, own profile transactions | account, Firestore SDK |
| `src/platform/demo.ts` | Explicit same-browser preview, storage and notification | hub |
| `src/platform/firebase.ts` | Authenticated player, bounded room directory, Firestore snapshots and transactions | hub, Firebase SDK |

Keep the current boundaries proportional. Do not introduce an ECS, generic event bus, dependency injection framework, speculative server or 3D engine just to prepare for future features. Lint prevents hub/platform imports into app/main; ownership still needs review.

## Room and data flow

Online create/join first requires a real email/password account. Firebase Auth handles passwords and sessions; own display name/creation time synchronize under `/monopolyHub/v1/profiles/<UID>`. No email/password is stored in this profile. Registration sets Auth displayName; login/logout/reset use Firebase SDK, never local password comparisons. The account observer restores the home identity and clears a room store if the signed-in UID changes. Form names are readonly online; the adapter uses the authenticated profile name regardless of supplied form text. Forms validate names/title (1–24 characters) and code. Room codes use six random characters from an alphabet excluding I/O/0/1. Each room has immutable `hostId`, `createdAt`, immutable title, maximum capacity 2–4, status, UID-keyed player records and a fixed four-seat UID index. The reverse index gives explicit four-seat ownership checks alongside bounded map sizes in Firestore rules. Player seat indices retain their color when another player leaves. `applyCommand` clones its input; join, readiness, start and leave rules are independently testable.

Create/join subscribes to the room. Updates redraw only the current lobby, and user content is escaped before insertion. The current room and mode are retained per tab with sessionStorage; display name is retained in localStorage. Refresh restores the subscription; closed/missing membership returns to home with an explanation. Browser back cannot silently abandon membership. Explicit leave confirms intent; host leave deletes the whole room, guest leave removes that guest.

Starting changes `status` to `started`, with explicit text that the board remains under development. There is no gameplay authorization, anti-cheat implementation or game logic beyond hub readiness.

## Two storage adapters, no implicit fallback

Online mode lazily loads Firebase Auth for identity restoration. Password-provider Auth identifies callers; anonymous accounts cannot use online room/profile rules. Firestore `(default)` stores documents under `monopolyHub/v1/profiles/<UID>` and `monopolyHub/v1/rooms/<CODE>`. `onSnapshot` watches a room or the bounded waiting-room query. `runTransaction` reads the current room and atomically applies the pure command, retrying contention up to five attempts. This prevents two clients both taking the final seat. Storage uses server Timestamps; the adapter converts createdAt to milliseconds for the pure model/UI and preserves the original Timestamp on updates. Transactions fail offline rather than queuing future room actions. Profile creation/update shares the same transaction and commit as the first room create/join, using server timestamps. Profile and room reads are issued in parallel before any writes; rules use getAfter to validate the committed profile identity. Creating the room-store requires only the authenticated identity, not profile synchronization. The directory and room-resume listeners can start immediately; own-profile synchronization is deferred until create/join and combined with that room transaction, not committed in advance. A successful committed profile name is reused per store; failures do not populate that cache. A disposed store rejects new room operations.

The directory uses `where(status == waiting)`, `orderBy(createdAt, desc)`, `limit(50)` and a committed composite index. Server-side ordering chooses the newest 50; UI ordering of this bounded result is only presentation.

The explicit device preview uses localStorage, storage events and Web Locks. Its lock serializes same-origin tab mutations, while notifications update all participating tabs. It is not a server and cannot connect separate devices or browser profiles. Demo rooms older than one day cannot be joined; demo data has its own namespace.

Realtime listeners and app events have a single owner. App disposal aborts listeners and unsubscribes the current room; demo disposal removes its storage listener. Closing a tab is not equivalent to leaving: there is no automatic presence/host migration or server cleanup yet. Names/ready state are persisted until an explicit leave or room closure. Do not label stored users as currently connected.

## Security and external prerequisites

`firestore.rules` denies root access, permits a signed-in caller to read one code-addressed room, and validates room shape, capacity, immutable metadata and own-membership changes. Password-authenticated users knowing a code can read its lobby. A bounded indexed query (`where("status", "==", "waiting"), orderBy("createdAt", "desc"), limit(50)`) exposes waiting rooms with host display names and occupancy; unbounded listing and anonymous reads are denied. Room data is public among these signed-in players, not a private-room guarantee. No email, contact information or sensitive profile data belongs here.

Rules tests use an emulator, never the production database. The Firebase web config contains public app identifiers, not a server credential. Never commit admin credentials, service-account files or Firebase login tokens. Firebase Auth Email/Password and the database must be enabled, and these project-scoped rules must be applied without replacing unrelated Movieapp data rules. See [Firebase setup](firebase.md). A frontend deployment does not deploy those settings.

Before actual gameplay, design server-authoritative turns/economy and corresponding authorization separately. Current client hub transitions are not a sufficient security model for money, dice or ownership.

## Context sources

`AGENTS.md` routes agents to [theme](design/theme.md), [workflow](workflow.md), [Firebase setup](firebase.md) and decisions. Authored docs record durable contracts; OpenWiki is a generated evidence index, maintained through its lifecycle after source is stable. Source and executed checks take precedence over old wiki claims.


## Auth and backend verification

The emulator-only mode requires both Vite DEV and `VITE_FIREBASE_EMULATORS=true`; production builds cannot enable it. The test runner starts Auth and Firestore emulators plus a dedicated Vite server on owned loopback ports. `tests/auth-browser.mjs` uses two distinct browser contexts and actual Firebase SDK registration/login/logout/session restore, persisted player profiles, named room discovery and joins. It aborts production Firebase requests. `tests/rules.test.mjs` separately validates unauthorized access, profile isolation, immutable room title and bounded directory queries. No passing emulator result proves production rules were deployed.

Auth restoration loads its own module; the larger Firestore SDK is deferred until a room/profile connection is requested. Do not pull Firestore back into the home-page Auth import just to reuse initialization.

The production rules preserve the pre-existing outside-hub Test-mode allowance until 2026-12-03, scoped to top-level collections other than monopolyHub. Never copy its old unrestricted wildcard over the hub rules; Firestore combines matching allows with OR. The game profile/room namespace remains authenticated and strictly validated.

## Optional operation timing

The [diagnostics panel](diagnostics.md) is enabled only by `?diagnostics=1`. Pure bounded traces live in `src/hub/diagnostics.ts`; the app owns the dialog, operation lifetime and animation frames. The Firebase adapter records read/transaction spans and a diagnostic-only token readiness preflight. Reports stay in memory without player/room identifiers. Cached snapshots, overlapping reads and SDK retry waits are distinguished; emulator timing is not production latency evidence.

## Gameplay HUD preview

[HUD implementation](game/ui-implementation.md) is a lazy-loaded UI route at `?view=game`, separate from the online room service. `src/game-ui` owns presentation scenarios/rendering, `src/app/play.ts` owns local preview lifecycle and scripted interactions. It makes no Firebase calls. All 24 approved states can be reviewed in settings; board is a CSS placeholder, not the 3D gameplay engine. Preview permission guards supplement display logic but do not replace future backend authorization.

Room membership rejection now waits for an authoritative server snapshot if the cached first room is missing or has a pre-join roster. Room subscriptions request metadata changes so a server-confirmed absence is still handled when document data matches the cache. Valid cached membership may render immediately. This does not change rules or eliminate latency; it prevents a stale cached directory result from evicting a successful join.

## Installable static shell

The [PWA layer](pwa.md) registers a production-only, scope-local worker for static build assets and home/HUD offline navigation. It excludes account/Firebase requests, keeps updates waiting until current clients close, and does not force reload an active session. Manifest and icon resources use project-relative URLs. Install guides belong to src/app/pwa.ts and are available independently of Auth.
