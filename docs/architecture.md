# Architecture and context map

Phố Tỷ Phú is a TypeScript/Vite browser hub for a future property-trading board game. The ocean, Babylon and Havok code/dependencies are removed. No board, 3D renderer, monetary economy or gameplay simulation is implemented yet.

| Layer | Ownership | Dependencies |
| --- | --- | --- |
| `src/main.ts` | CSS/font imports, app root, HMR cleanup | app |
| `src/app/start.ts` | Screen state, forms, accessible UI, navigation, store ownership and subscriptions | hub contracts, UI, lazy platform adapters |
| `src/ui/art.ts`, `src/style.css` | SVG artwork/icons and shared responsive theme | no app orchestration |
| `src/hub/model.ts` | Room schema, validation, pure command transitions and start invariants | no Firebase or DOM |
| `src/hub/store.ts` | Minimal room-storage contract | model types |
| `src/platform/demo.ts` | Explicit same-browser preview, storage and notification | hub |
| `src/platform/firebase.ts` | Anonymous identity, realtime room listener, ETag conditional writes | hub, Firebase SDK |

Keep the current boundaries proportional. Do not introduce an ECS, generic event bus, dependency injection framework, speculative server or 3D engine just to prepare for future features. Lint prevents hub/platform imports into app/main; ownership still needs review.

## Room and data flow

A form validates display name (1–24 characters) and code, then invokes the selected store. Room codes use six random characters from an alphabet excluding I/O/0/1. Each room has immutable `hostId`, `createdAt`, maximum capacity 2–4, status, UID-keyed player records and a fixed four-seat UID index. The reverse index makes capacity, membership and readiness enforceable in RTDB rules without unsupported collection-count expressions. Player seat indices retain their color when another player leaves. `applyCommand` clones its input; join, readiness, start and leave rules are independently testable.

Create/join subscribes to the room. Updates redraw only the current lobby, and user content is escaped before insertion. The current room and mode are retained per tab with sessionStorage; display name is retained in localStorage. Refresh restores the subscription; closed/missing membership returns to home with an explanation. Browser back cannot silently abandon membership. Explicit leave confirms intent; host leave deletes the whole room, guest leave removes that guest.

Starting changes `status` to `started`, with explicit text that the board remains under development. There is no gameplay authorization, anti-cheat implementation or game logic beyond hub readiness.

## Two storage adapters, no implicit fallback

Online mode loads Firebase only on first connection. Anonymous Auth identifies the caller. Realtime Database watches `monopolyHub/v1/rooms/<CODE>`. Conditional REST PUT requests use the Firebase ID token and ETag compare-and-swap; HTTP 412 retries against current state up to five times. This prevents two joins both taking the last slot. Reads/writes have bounded timeouts; no offline write queue silently creates a room later. A network timeout can be an ambiguous commit outcome: no guarantee of exactly-once delivery is made.

The explicit device preview uses localStorage, storage events and Web Locks. Its lock serializes same-origin tab mutations, while notifications update all participating tabs. It is not a server and cannot connect separate devices or browser profiles. Demo rooms older than one day cannot be joined; demo data has its own namespace.

Realtime listeners and app events have a single owner. App disposal aborts listeners and unsubscribes the current room; demo disposal removes its storage listener. Closing a tab is not equivalent to leaving: there is no automatic presence/host migration or server cleanup yet. Names/ready state are persisted until an explicit leave or room closure. Do not label stored users as currently connected.

## Security and external prerequisites

`database.rules.json` denies root access, permits a signed-in caller to read one code-addressed room, and validates room shape, capacity, immutable metadata and own-membership changes. A room code is an invitation capability: authenticated users knowing a code can read its lobby. Listing all rooms is denied. No email, contact information or sensitive profile data belongs here.

Rules tests use an emulator, never the production database. The Firebase web config contains public app identifiers, not a server credential. Never commit admin credentials, service-account files or Firebase login tokens. Firebase Auth anonymous sign-in and the database must be enabled, and these project-scoped rules must be applied without replacing unrelated Movieapp data rules. See [Firebase setup](firebase.md). A frontend deployment does not deploy those settings.

Before actual gameplay, design server-authoritative turns/economy and corresponding authorization separately. Current client hub transitions are not a sufficient security model for money, dice or ownership.

## Context sources

`AGENTS.md` routes agents to [theme](design/theme.md), [workflow](workflow.md), [Firebase setup](firebase.md) and decisions. Authored docs record durable contracts; OpenWiki is a generated evidence index, maintained through its lifecycle after source is stable. Source and executed checks take precedence over old wiki claims.
