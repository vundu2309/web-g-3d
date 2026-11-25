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
- **No collision**: like other players' boats, a patrol ship does not block anything (the user chose the
  hard obstacle for parked boats only).

## Consequences

- Six more boats can be in view: the coarse copies keep it cheap, but the cost is NOT measured on a phone.
- The patrol model is downloaded (366 KB) by every player, when the first ship is created.
- Night, rain and the ship's lantern are not looked at yet.
