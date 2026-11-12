# Firebase Auth + Cloud Firestore

The web app targets project `movieapp-fa2d4`, web App ID ending `4d7072ef0a493528ea11b0`, and Firestore database **`(default)`**. Public app identifiers live only in `src/platform/firebase-client.ts`. Analytics is not initialized. The hub no longer uses Realtime Database or its old databaseURL.

## Backend configuration and deployment boundary

Firebase Auth Email/Password identifies players. The custom game forms register, log in/out, show/hide passwords and send reset emails. Own Firestore profiles contain only displayName and server-created timestamp; emails/passwords stay in Firebase Auth. Do not diagnose provider activation from an unrelated database failure.

The default Firestore database has been created. A read-only request to a nonexistent hub room document returned HTTP 404, showing the Firestore document endpoint responds; this does not establish rule deployment, edition, private access controls or complete online functionality. Authorized CLI inspection confirmed the existing native Firestore `(default)` is STANDARD edition in nam5, with realtime updates enabled. Target this database; the modular document/query APIs are used for the hub's required realtime listeners. No Enterprise pipeline feature is assumed.

GitHub Pages deploys only frontend assets. It does not deploy Firestore rules/indexes or enable Auth providers. Do not claim the production backend is verified solely because emulator tests pass.

## Apply rules and index

Deploy rules/indexes with an authorized Firebase administrator identity before real online play:

1. In [Cloud Firestore](https://console.firebase.google.com/project/movieapp-fa2d4/firestore), select `(default)`.
2. Review existing rules. Merge the `/monopolyHub/v1/oceanBoats/{uid}`, `/monopolyHub/v1/profiles/{uid}` and `/monopolyHub/v1/rooms/{code}` matches and helper functions from `firestore.rules`, preserving all unrelated Movieapp permissions and data. The current file preserves the original outside-hub Test-mode allowance until 2026-12-03, while explicitly excluding monopolyHub from that wildcard. This keeps unrelated Movieapp behavior unchanged and prevents the legacy allow from bypassing hub protection. Never use open test-mode rules to mask configuration errors.
3. Create the collection-scope composite index in `firestore.indexes.json`: collection `rooms`, `status` ascending, `createdAt` descending. Wait for it to become ready. It supports the waiting-room directory ordered newest first.
4. With a properly authorized Firebase CLI and reviewed project rules, `npx --no-install firebase deploy --only firestore:rules,firestore:indexes --project movieapp-fa2d4` deploys these files. Run it only after preserving other application's rules, not blindly using the current file over a shared backend.
5. Test on two separate devices: registration/login, create a named room, find the host/title in the directory, join, toggle ready, refresh, then close/leave. Verify wrong passwords and full/unready rooms fail. Keep live verification separate from emulator evidence.

The web API key is public and cannot grant administrator access. Never put service-account keys, Firebase login tokens or private credentials into chat, source or the client bundle. Backend administrator access must use a secure platform binding or authorized login.

## Data and permissions

| Document path                   | Data                                                                 | Access                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `monopolyHub/v1/profiles/<UID>` | displayName, createdAt Timestamp                                     | Signed-in password user owns get/create/update; no listing/delete                                      |
| `monopolyHub/v1/rooms/<CODE>`   | title, hostId, capacity, createdAt Timestamp, status, players, seats | Signed-in password users read lobby; host creates/closes, each guest modifies own membership/readiness |

Room title, host, capacity and creation time are immutable. Rules strictly validate shape, map sizes, seat/player correspondence and own identity. Starting needs the host, at least two players and all present ready. Lobby documents are visible to authenticated players; email/password/private profile data must never be added to them.

Directory query: `where("status", "==", "waiting")`, `orderBy("createdAt", "desc")`, `limit(50)`. Rules require waiting status and a bounded limit. This is the latest 50 waiting rooms, not an unlimited full-text search or pagination implementation.

These Security Rules are a prototype validated with emulator allow/deny tests; review them before broad release. They do not authorize future game money, dice or property trades, which require a separate server-authority design.

## Local validation

Use Node 24 and Java 21. `npm run test:rules` downloads the official Firestore emulator JAR with size/checksum verification, starts owned loopback Auth and Firestore emulators, loads `firestore.rules` and runs security tests plus `tests/auth-browser.mjs` using actual SDK calls in two isolated browser contexts. Tests abort production Firebase requests.

On managed environments with a read-only home set `FIREBASE_EMULATORS_PATH=/workspace/.firebase-emulators` and `XDG_CONFIG_HOME=/workspace/.firebase-config`. Keep proxy, CA and checksum verification enabled. `VITE_FIREBASE_EMULATORS=true` only works in Vite DEV; production builds cannot activate it. The runner injects its ephemeral ports, so no production config is edited for tests.

Security tests cover unauthenticated/private reads, oversized/extra/missing fields, immutable timestamp/title/host/capacity, role injection, malformed/empty seats, identity spoofing, directory query mismatch, capacity and readiness. Emulator tests do not enforce composite-index availability like production, so deploy the committed index separately.

## Limits

No presence detection, host migration, abandoned-room cleanup, chat, board or server-authoritative gameplay. Closing a tab does not automatically remove its membership. No backend resources are automatically created or activated from public app config.

## Create/join latency contract

Do not commit an own-profile transaction and then start a second room transaction. The first create/join reads profile and room concurrently, writes both in one Firestore commit, and caches the successful profile name for later operations in that store. Rules use getAfter for profile identity so an account without a profile can create/join atomically. Directory/resume listeners do not synchronize the profile at all. The browser regression checks zero document batch reads before directory display and exactly one initial create commit containing both profile and room writes. These are network-dependency checks, not measured production latency guarantees.

## Shared fishing sea

`monopolyHub/v1/oceanBoats/{UID}` contains only `name`, `session`, `x`, `z`, `heading`, `fishing`, `updatedAt`. Signed-in password users read it; only the document's UID can create/update/delete with a strict schema, coordinate limits and server timestamp. No emails, passwords, inventory or rewards are stored. The active query is `orderBy("updatedAt", "desc"), limit(100)`; the default single-field index suffices. One channel, no room membership. The user-selected existing STANDARD `(default)` database is reused; no database is provisioned.

The adapter uses transactions so offline motion is not enqueued. A per-entry random session displaces an older tab of the same account. Cleanup deletes only its own matching session, and remote leases older than 30 seconds disappear. Writes are throttled to at most once per second while moving, with a ten-second idle heartbeat while visible. This is a small shared-sea prototype, not a high-frequency authoritative game server. See [limits and tests](ocean.md).

The task environment has no authenticated Firebase CLI identity; database inspection returns “Failed to authenticate”. New rules are tested on `demo-photyphu`, not claimed deployed. An administrator must merge/deploy the reviewed rules to the existing production project, then verify two devices before online public release. No migration to Supabase/Render is performed by this change.
