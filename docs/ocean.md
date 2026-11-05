# Shared fishing sea

Approved 2026-11-05: each player is a separate fishing boat in one common online map. Enter through the hub's “Vào game”; authenticate with the existing Firebase Email/Password dialog, then sail immediately. No room creation, invitations, lobby, readiness or host. `?view=ocean` restores this direct-entry route after reload. Returning to the hub leaves the sea.

## Implementation and ownership

- `src/app/harbor.ts`: active hub, account observer, entry/exit ownership.
- `src/app/ocean.ts`: controls, fishing interaction, HUD/dialogs, animation and cleanup.
- `src/ocean/model.ts`: deterministic per-UID spawn, bounded movement, island collisions, remote payload validation.
- `src/ocean/scene.ts`: one Three.js renderer, procedural boats/islands, sea waves, follow camera, safe text labels. No extra engine or new runtime dependency.
- `src/platform/ocean.ts`: selects the same configured provider as the account layer. `ocean-firebase.ts` owns the legacy Firestore lease; `ocean-socket.ts` uses the Supabase-authenticated Render Socket.IO API. `server/ocean.mjs` owns the ephemeral shared sea for that API instance.

The original Monopoly board/HUD/artwork and room/auth services remain. `?view=game` is the original local Monopoly preview; `?view=monopoly-hub` runs its preserved room hub. New modules do not use room transitions or alter Monopoly economics/resources.

## Controls and fishing

On touch, one thumb drags the on-screen stick (`src/ocean/stick.ts`): up/down is throttle (forward/reverse) and left/right is steering, so a diagonal drag runs and turns at once; farther means stronger, a small dead zone ignores a resting thumb, and releasing or cancelling the touch stops the boat. The other thumb is free: “Thả câu” acts on press because browsers do not synthesize a click for a second finger while the first holds the stick. WASD/arrows still work as full deflection, and the stick wins while held. Space or “Thả câu” casts and stops the boat. Wait for “Kéo cá!” and respond within 2.5 seconds. Early retrieval or missing the bite catches nothing. “Kho cá” reports catches for this trip only. Return/reload resets catches; they are not persistent inventory, rewards, currency or an anti-cheat-protected economy. Other players see whether a boat is fishing.

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

See [decision 0008](decisions/0008-babylon-havok-boat-physics.md). `src/ocean/boat-physics.ts` runs the hull as a Havok rigid body and adds, as per-step impulses, buoyancy at six hull-bottom points against `src/ocean/waves.ts`, quadratic water drag that is far stronger across the keel than along it, propeller thrust, and a rudder whose authority grows with speed. Islands are static cylinder colliders using the same radii as the movement model, and a soft wall keeps the boat inside the sea the server accepts. Steering is analog, so the touch stick maps straight onto throttle and rudder.

`tests/boat-physics.test.mjs` drives real Havok headlessly (Babylon `NullEngine`, fixed 1/60 s steps) and checks floating on the local surface, bobbing, bounded roll and pitch, gradual acceleration and coasting, turning both ways with limited sideslip, island blocking without tunnelling, exact repeatability and the boundary wall. Removing buoyancy, drag or the island colliders makes the matching tests fail. It runs with `tests/support/register-resolve.mjs`, which only teaches Node to resolve Babylon's extensionless deep imports.

Not done: wiring this into the rendered game, the Babylon scene, models and water, measuring frame rate on a real phone, and excluding the Havok WASM from the precache.
