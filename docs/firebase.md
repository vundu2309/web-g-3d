# Firebase Auth + Cloud Firestore

The web app targets project `movieapp-fa2d4`, web App ID ending `4d7072ef0a493528ea11b0`, and Firestore database **`(default)`**. Public app identifiers live only in `src/platform/firebase-client.ts`. Analytics is not initialized. The hub no longer uses Realtime Database or its old databaseURL.

## Backend configuration and deployment boundary

Firebase Auth Email/Password identifies players. The custom game forms register, log in/out, show/hide passwords and send reset emails. Own Firestore profiles contain only displayName and server-created timestamp; emails/passwords stay in Firebase Auth. Do not diagnose provider activation from an unrelated database failure.

The default Firestore database has been created. A read-only request to a nonexistent hub room document returned HTTP 404, showing the Firestore document endpoint responds; this does not establish rule deployment, edition, private access controls or complete online functionality. The CLI cannot inspect database edition or deploy settings because no administrator login is available in this cloud. Target the existing native Firestore `(default)`; the modular document/query APIs are used for the hub's required realtime listeners. No Enterprise pipeline feature is assumed.

GitHub Pages deploys only frontend assets. It does not deploy Firestore rules/indexes or enable Auth providers. Do not claim the production backend is verified solely because emulator tests pass.

## Apply rules and index

An authorized Firebase administrator must apply the reviewed configuration before real online play:

1. In [Cloud Firestore](https://console.firebase.google.com/project/movieapp-fa2d4/firestore), select `(default)`.
2. Review existing rules. Merge the `/monopolyHub/v1/profiles/{uid}` and `/monopolyHub/v1/rooms/{code}` matches and helper functions from `firestore.rules`, preserving all unrelated Movieapp permissions and data. If this database is dedicated to this hub, the standalone deny-by-default file may be used as a whole. Never use open test-mode rules to mask configuration errors.
3. Create the collection-scope composite index in `firestore.indexes.json`: collection `rooms`, `status` ascending, `createdAt` descending. Wait for it to become ready. It supports the waiting-room directory ordered newest first.
4. With a properly authorized Firebase CLI and reviewed project rules, `npx --no-install firebase deploy --only firestore:rules,firestore:indexes --project movieapp-fa2d4` deploys these files. Run it only after preserving other application's rules, not blindly using the current file over a shared backend.
5. Test on two separate devices: registration/login, create a named room, find the host/title in the directory, join, toggle ready, refresh, then close/leave. Verify wrong passwords and full/unready rooms fail. Keep live verification separate from emulator evidence.

The web API key is public and cannot grant administrator access. Never put service-account keys, Firebase login tokens or private credentials into chat, source or the client bundle. Backend administrator access must use a secure platform binding or authorized login.

## Data and permissions

| Document path | Data | Access |
| --- | --- | --- |
| `monopolyHub/v1/profiles/<UID>` | displayName, createdAt Timestamp | Signed-in password user owns get/create/update; no listing/delete |
| `monopolyHub/v1/rooms/<CODE>` | title, hostId, capacity, createdAt Timestamp, status, players, seats | Signed-in password users read lobby; host creates/closes, each guest modifies own membership/readiness |

Room title, host, capacity and creation time are immutable. Rules strictly validate shape, map sizes, seat/player correspondence and own identity. Starting needs the host, at least two players and all present ready. Lobby documents are visible to authenticated players; email/password/private profile data must never be added to them.

Directory query: `where("status", "==", "waiting")`, `orderBy("createdAt", "desc")`, `limit(50)`. Rules require waiting status and a bounded limit. This is the latest 50 waiting rooms, not an unlimited full-text search or pagination implementation.

These Security Rules are a prototype validated with emulator allow/deny tests; review them before broad release. They do not authorize future game money, dice or property trades, which require a separate server-authority design.

## Local validation

Use Node 24 and Java 21. `npm run test:rules` downloads the official Firestore emulator JAR with size/checksum verification, starts owned loopback Auth and Firestore emulators, loads `firestore.rules` and runs security tests plus `tests/auth-browser.mjs` using actual SDK calls in two isolated browser contexts. Tests abort production Firebase requests.

On managed environments with a read-only home set `FIREBASE_EMULATORS_PATH=/workspace/.firebase-emulators` and `XDG_CONFIG_HOME=/workspace/.firebase-config`. Keep proxy, CA and checksum verification enabled. `VITE_FIREBASE_EMULATORS=true` only works in Vite DEV; production builds cannot activate it. The runner injects its ephemeral ports, so no production config is edited for tests.

Security tests cover unauthenticated/private reads, oversized/extra/missing fields, immutable timestamp/title/host/capacity, role injection, malformed/empty seats, identity spoofing, directory query mismatch, capacity and readiness. Emulator tests do not enforce composite-index availability like production, so deploy the committed index separately.

## Limits

No presence detection, host migration, abandoned-room cleanup, chat, board or server-authoritative gameplay. Closing a tab does not automatically remove its membership. No backend resources are automatically created or activated from public app config.
