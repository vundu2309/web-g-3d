# Shared fishing sea

Approved 2026-11-05: each player is a separate fishing boat in one common online map. Enter through the hub's “Vào game”; authenticate with the existing Firebase Email/Password dialog, then sail immediately. No room creation, invitations, lobby, readiness or host. `?view=ocean` restores this direct-entry route after reload. Returning to the hub leaves the sea.

## Implementation and ownership

- `src/app/harbor.ts`: active hub, account observer, entry/exit ownership.
- `src/app/ocean.ts`: controls, fishing interaction, HUD/dialogs, animation and cleanup.
- `src/ocean/model.ts`: deterministic per-UID spawn, bounded movement, island collisions, remote payload validation.
- `src/ocean/babylon-scene.ts`: the Babylon.js scene: one engine, Havok physics for the player's boat, a chase camera, instanced boats for other players and safe text labels. It builds from `water.ts` (wave-displaced sea shader), `sky.ts` (gradient sky, sun, clouds), `boat-visual.ts` and `island-visual.ts` (procedural models merged into one vertex-coloured mesh each, so a boat is one draw call and other players' boats are instances), `havok.ts` (loads the WASM), `render-scale.ts` (resolution governor) and `sea-style.ts` (shared colours and sun).
- `src/platform/ocean.ts`: selects the same configured provider as the account layer. `ocean-firebase.ts` owns the legacy Firestore lease; `ocean-socket.ts` uses the Supabase-authenticated Render Socket.IO API. `server/ocean.mjs` owns the ephemeral shared sea for that API instance.

The original Monopoly board/HUD/artwork and room/auth services remain. `?view=game` is the original local Monopoly preview; `?view=monopoly-hub` runs its preserved room hub. New modules do not use room transitions or alter Monopoly economics/resources.

## Controls and fishing

On touch, one thumb drags the on-screen stick (`src/ocean/stick.ts`): up/down is throttle (forward/reverse) and left/right is steering, so a diagonal drag runs and turns at once; farther means stronger, a small dead zone ignores a resting thumb, and releasing or cancelling the touch stops the boat. The other thumb is free: “Thả câu” acts on press because browsers do not synthesize a click for a second finger while the first holds the stick. WASD/arrows still work as full deflection, and the stick wins while held. Space or “Thả câu” casts and stops the boat. Wait for “Kéo cá!” and respond within 2.5 seconds. Early retrieval or missing the bite catches nothing. “Kho cá” reports the total catch count. The last boat position and that count are saved in this browser's localStorage (key `photyphu:sea:v1:<uid>`, autosave every 5 s, on each catch, when the tab is hidden and on leaving) and resumed on return; a save older than 7 days, outside the sea, inside an island or corrupt falls back to the harbor (the count is kept). The save is per device, not per account, and is not an inventory, reward, currency or anti-cheat-protected economy.

If the connection drops during play the game reconnects by itself (same boat, same place, up to 90 s, status “Mất kết nối. Đang kết nối lại…”). Revoked sessions, a second window taking over, or a full sea are not retried and show the reason with a way back. Other players see whether a boat is fishing.

The sea is drawn even while connecting or offline; boats appear once connected. `index.html` carries a small classic script: if the game has not drawn after 8 seconds it shows the failure reason with “Tải lại” and “Xóa bộ nhớ đệm và tải lại” (unregisters this app’s service worker and shell caches) instead of a blank page.

Foreground controls fit 844×390, 932×430 and 667×375; portrait falls back to stacked actions. Controls have at least 44px targets, dialog focus, keyboard operation and reduced-motion waves. Native phone performance and OS input behavior still require device verification.

## Online contract and limits

On the Firebase configuration, all users query the same `monopolyHub/v1/oceanBoats` collection ordered by `updatedAt` descending, limited to 100 most recently updated boats. No silent offline/demo fallback or sample players. Identity is a UID-keyed document; display name contains no account email. A new tab for the same account replaces its old session, which stops controlling the boat. Leave deletes only a matching lease; abrupt loss expires visually within 30 seconds. Hidden tabs stop motion/heartbeats and can expire remotely; foreground entry resumes updates. Deletion is best effort on abrupt tab closure.

Transactions fail offline rather than queue old motion. Motion writes are at most 1 Hz, idle heartbeats at 10 seconds, remote render positions are interpolated. Firestore read/write volume grows with active boats and is unsuitable for a large continuous-action world without an authoritative realtime server. Coordinates and ownership are validated by prototype rules, but movement/fishing remain client-simulated. There is no persistent catch economy, trading, chat, matchmaking or server anti-cheat. Production backend permissions must be deployed separately; the frontend does not grant access by itself.

On the Supabase configuration, the existing account and password-recovery flow are preserved. All sea clients enter the `ocean:shared` Socket.IO channel on the existing API; user identity comes from server-validated Auth, never a payload UID. Join/move validate the token again, enforce one active session per UID, validate finite bounded pose fields, bound payload/rate and cap the sea at 100 boats. Joined sea clients alone receive push snapshots. Disconnect removes the matching boat; old replaced sockets cannot remove the new boat. Client snapshots use server timestamps. No polling or Supabase schema writes are introduced.

This Socket.IO sea is intentionally ephemeral and requires exactly **one API process/instance**: restart/redeploy clears boats and players re-enter; positions and catches are not saved. Do not scale Render to multiple instances until shared authoritative world state/broadcast is implemented. Existing PostgreSQL LISTEN/NOTIFY continues serving the preserved room hub; it is not falsely presented as synchronizing the ephemeral sea across instances. The adapter fails visibly and returns to the hub on connection failure instead of switching providers.

## Verification

`npm run check` includes the preserved Monopoly regression tests, pure movement/remote-payload tests, emulator rules deny/allow cases and `tests/ocean-browser.mjs`. The Firebase browser test registers two real SDK accounts on local `demo-photyphu`, enters directly through the hub, checks the common map and shared motion, catches a fish, inspects mobile screenshots, reloads, replaces a duplicate session, leaves, and checks offline return. It aborts production Firebase requests. Generated concepts are design references, not evidence of actual browser rendering or live multiplayer deployment.

`npm run test:api` also runs real Socket.IO-client tests for shared-sea push, ownership, denied malformed motion, duplicate replacement, leave and nonparticipant snapshot isolation. `npm run test:supabase` preserves the full local GoTrue/PostgREST/SMTP/PostgreSQL room/account suite and adds direct sea entry, two boats, cross-browser rendered motion and leave on the Supabase/Socket.IO configuration.

## Boat physics (Babylon.js + Havok)

See [decision 0008](decisions/0008-babylon-havok-boat-physics.md). `src/ocean/boat-physics.ts` runs the hull as a Havok rigid body and adds, as per-step impulses, buoyancy at six hull-bottom points against `src/ocean/waves.ts`, quadratic water drag that is far stronger across the keel than along it, propeller thrust, and a rudder whose authority grows with speed. Islands are static cylinder colliders (`islandCollisionRadius`, just past the visible beach), and a soft wall keeps the boat inside the sea the server accepts. The player's boat is Havok's; the controller reads its pose each frame (clamped to the sea bounds) and publishes `x`, `z`, `heading`, `fishing` exactly as before, so the server contract did not change. Other players' boats are not simulated: they follow published poses and rest on the wave surface under them. Steering is analog, so the touch stick maps straight onto throttle and rudder; while casting the boat gets no thrust and drag brings it to rest.

The world uses right-handed axes (`enableSeaPhysics`), so heading 0 is -Z and a positive heading swings the bow toward +X, matching the movement model and the published poses. Havok steps at a fixed 60 Hz regardless of frame rate, and a frame longer than 100 ms is clamped, so a slow phone sees slow motion rather than a jump.

**Sharpness.** The sea draws at up to 2x the CSS size. `ScaleGovernor` lowers the pixel count only after two consecutive slow windows (ignoring the first 4 s), raises it again after five fast ones, and never reacts to the 30 fps cap itself. An earlier version treated the cap as "slow" and blurred the sea permanently; `tests/ocean.test.mjs` pins that behaviour.

**Cost.** Measured in the browser test: about 44k triangles and 10 meshes per frame. The Babylon chunk is 1.73 MB (409 KB gzip) and the Havok WASM 2.09 MB (658 KB gzip). Both load only when entering the sea and are excluded from the service-worker precache (`scripts/pwa-build.mjs`): the sea is online-only. Frame rate on real phones has not been measured.

`tests/boat-physics.test.mjs` drives real Havok headlessly (Babylon `NullEngine`, fixed 1/60 s steps) and checks floating on the local surface, bobbing, bounded roll and pitch, gradual acceleration and coasting, turning both ways with limited sideslip, island blocking without tunnelling, the start heading, exact repeatability and the boundary wall. Removing buoyancy, drag or the island colliders makes the matching tests fail. It runs with `tests/support/register-resolve.mjs`, which only teaches Node to resolve Babylon's extensionless deep imports. `tests/ocean-babylon-browser.mjs` runs the real scene in a browser with a fake connection: 2x draw size on a 3x screen, frame cost, labels, floating, driving and turning with one touch, and a second thumb casting while the first holds the stick.

## Loading and connecting

Entering the sea shows a loading card with three steps (graphics, connection, entry). Graphics and the network start together, and `src/platform/wake.ts` nudges a sleeping API as soon as the home screen shows, so a free Render instance (30-60 s to wake) wakes while the engine downloads. The old flow gave up after a fixed 15 s and asked the player to go back to the hub.

`src/ocean/connect.ts` retries instead: pauses of 1.5, 2.5 then 4 s, each attempt abandoned after 25 s, a total patience of 100 s, and a "the server is waking up" note after 5 s. A connection that arrives after its attempt timed out is closed rather than leaked. Errors retrying cannot fix (signed out, opened in another window, sea full, not configured) are shown at once. If graphics take over 60 s or connecting runs out of patience, the card becomes a failure message with a **Thử lại** button (reload, which re-enters the sea directly) and the HUD's **Về hub** stays reachable above it. The same card appears if the connection drops mid-game.

Tests: `tests/ocean.test.mjs` pins the retry policy; `tests/ocean-loading-browser.mjs` runs the card in a browser with a flaky, a silent and a fatal fake server. Not measured: how long a real Render cold start takes from a phone, or the real cost of the wake-up ping.

## Finding each other

Players used to start up to 40 m apart facing random directions, so the other boat was usually behind or beside the camera and nothing said where it was: two real accounts started 27.6 m apart with one 86 degrees off the other's bow, and the data was fine ("2 thuyền") while neither could see the other.

- **One harbor.** `spawn()` (`src/ocean/model.ts`) puts everyone in a small area at `HARBOR` (8 slots plus jitter), all heading 0 toward the open sea, so any two players start within about 25 m and in front of each other. The client uses it for its own start pose and announces it about 0.5 s after entering, so others see the real spot. The Render API still assigns its own join pose until it is redeployed from this code; the client's pose wins as soon as it publishes.
- **Arrows.** `src/ocean/indicator.ts` places, for any remote boat that is outside the view, an arrow on a ring inside the screen pointing toward it with their name and distance (`.ocean-boat-label[data-edge]`). Boats in view keep a plain name label, hidden beyond 75 m.
- **Expired sessions.** The server reports why a socket was refused; `AUTH_REQUIRED` now becomes "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." (not retried) and the failure card offers **Đăng nhập lại** (sign out, back to the home screen). Before this, a revoked session was retried every 5 s for 100 s.
- **One boat per account.** A second window of the same account takes over and the first is told so; to test with two players on one device use a private window (separate storage), or two accounts on two devices.
- A server "too fast" reply to a pose update no longer ends the session.

Tests: `tests/ocean.test.mjs` (harbor and arrow maths) and `tests/ocean-multiplayer-browser.mjs` (two real clients through the real server, an arrow with distance when out of view, a revoked session, same-account takeover; only Supabase Auth is faked). Replacing the new start with the old random one, or dropping the expired-session handling, makes that test fail.
