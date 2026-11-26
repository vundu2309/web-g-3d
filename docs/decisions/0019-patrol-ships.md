# 0019. Patrol ships sail round the islands

Date: 2026-11-25. Status: built; shown to the user in a local preview before any deployment.

## Context

The sea felt empty when few players were on. The user asked for NPC patrol ships that move round the
islands, and for a new boat modelled in Blender for them (not a recoloured player boat).

## Decision

- **No server state.** A ship's place is a function of the server's clock (`src/ocean/patrol-routes.ts`):
  six ships, one loop round each of islands 0, 2, 3, 4, 6 and 7, at 6 m/s (a lap of 3 to 6 minutes).
  Every client computes the same ships from the clock it already follows; nothing is sent, nothing
  is saved, a Render restart changes nothing.
- **Loops that cannot hit anything.** Each loop stays 40 m from every island, pier and shipyard and
  70 m or more from its own island's ring; the nearest of a few radii that clears everything is taken for each
  direction and the radii are smoothed so the ship turns gently. `tests/patrol-routes.test.mjs` checks every
  route against every obstacle.
- **A boat of its own, built in Blender**: `tools/blender/patrol_boat.py` -> `public/models/boat-patrol.glb`
  (5,907 triangles, 366 KB): a 10.4 m coast-guard cutter of the player boats' family, with a long
  wheelhouse and domed roof, a light bar (a blue and a red lens), two searchlights, a steel mast with a
  radar bar and the flag of Vietnam, a water cannon on the foredeck, rails, fenders, a rescue tender
  on the stern deck and a life ring. Same six parts and same two colour roles as the player boats, so the game paints it
  with its own palette (white hull, navy trim: `PATROL_PALETTE`, a fifth palette that players never get;
  `paletteIndex` gives every `npc:` id that palette). One new palette colour, `paint.beacon`.
- **Drawn as another player's boat** (`npc: true`): instances, levels of detail, wake, shadow, depth layer
  and mirror all as for the others, with no rod, no line, a navy name "Tàu tuần tra" and no arrow at the
  edge of the screen (parked boats lose their arrows too). It takes the hull numbers of tier 3 (10.8 m
  against its 10.4 m: waterline, foam collar, wake, shadow) through `PATROL_HULL_TIER`, and its model through
  the model key `PATROL_MODEL` (4), which no player's tier can be (`boatTierIndex` still refuses it).
- **Lights** (user's request, 2026-11-25): from dusk to dawn (`beaconLevel`, dimmer in rain), the halos for a ship within
  1,100 m (they thin out over the last 300 m and are made larger with the distance, 2026-11-26: they were cut
  at 380 m, and a ship went dark as the player sailed away) and the searchlight wedge within 380 m (it thins out
  over the last 120 m): the light bar's blue and red lenses flash one after the other, twice each per 0.9 s round (the loader finds the
  lenses by their own colours, `paint.beacon` and `paint.beaconRed`), each with a halo; the mast lantern has a warm halo;
  the searchlights lay a wedge of light on the sea 70 m ahead that swings slowly (`patrol-light-plan.ts`,
  `patrol-lights.ts`). By day the lenses are a steady glass. With reduced motion they stay a steady glow and the
  wedge stays ahead. A lens flashes at most 2.2 times a second (under the 3 a second of the photosensitivity guidance).
  Additive and cheap: per ship two lens instances, three halos and one wedge, none drawn by day.
- **Collision** (user's decision, 2026-11-25): a patrol ship is a moving hard obstacle. Each ship within 150 m of the player's
  boat has a kinematic Havok box of its hull (3.6 x 10.4 m, `PATROL_BOX`) that is carried on at 6 m/s every PHYSICS STEP and
  re-placed from the clock each frame (`BoatPhysics.setShips`): it pushes the boat and nothing pushes it back, so
  the ship keeps its course on every client. (A kinematic body told only once a frame runs on at the speed of that one jump:
  measured, 1 m per step.) The ship does not steer round the boat: it shoves it ahead, as a ram would.

## Consequences

- Six more boats can be in view: the coarse copies keep it cheap, but the cost is NOT measured on a phone.
- The patrol model is downloaded (366 KB) by every player, when the first ship is created.
- Night, rain and the ship's lantern are not looked at yet.
