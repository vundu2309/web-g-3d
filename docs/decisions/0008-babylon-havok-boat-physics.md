# 0008 — Babylon.js + Havok for boat physics

Date: 2026-11-05. Status: user-directed; physics core built and tested, not yet wired into the live game.

The user chose Babylon.js with Havok for the boat mechanics (buoyancy, inertia and water drag, collision with islands) and to move the shared sea off Three.js. Babylon and Havok were removed in `bec59b6`, and Three.js arrived later for the Monopoly board preview, so this is a deliberate reversal of that retirement, not an oversight.

Consequences recorded here so they are not rediscovered:

- Two engines coexist. The sea route will load Babylon and the Monopoly board preview (`?view=game`) keeps Three.js. Both are lazy chunks, so neither downloads for the other's route.
- Havok ships a 2.09 MB WASM binary (`@babylonjs/havok/lib/esm/HavokPhysics.wasm`). The game is online-only, so the sea chunk and the WASM must stay out of the service-worker precache; otherwise every release re-downloads them on install.
- Physics is client-side. The server only relays poses and has no authority, so results are exact for the player's own boat. Boat-to-boat collisions need a server arbiter and are intentionally not implemented.
- Packages are pinned exactly (`@babylonjs/core` 9.33.3, `@babylonjs/havok` 1.3.14). The retired code used 8.56.2.
- `src/ocean/waves.ts` is the single sea surface for both physics and the water shader, so hull and visible water cannot disagree.
- Havok steps at a fixed 60 Hz sub-step (`enableSeaPhysics`), independent of frame rate, which also makes the tests repeatable.
