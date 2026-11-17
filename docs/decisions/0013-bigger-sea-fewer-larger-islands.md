# 0013. A bigger sea with fewer, larger islands

Date: 2026-11-17. Status: decided by the user, implemented in the repository; not yet measured on a phone.

## The decision

The user found the sea too small (360 x 360 m, three islands 26 to 39 m in radius, about 30 seconds from edge to edge) and chose the "very large" option: a sea of 3 x 3 km with **fewer but much larger and more detailed islands**, and no far backdrop islands ("remove the islands that do not exist"). The layout was proposed and reviewed as a Blender scene before any game code changed.

## What changed

- **The sea**: `SEA_BOUND` 180 -> 1500 (`model.ts`); the server accepts poses inside the same bound (`server/ocean.mjs` imports it, it was a literal 180). The harbor stays at (0, 22).
- **Islands** (`src/ocean/islands.ts`, the only place with their data): eight, radius 91 to 257 m, 360 to 1,100 m from the harbor, each at least 170 m from the next. They keep the seeds `islandSeed(index)`; the old three are gone, so a boat position saved near an old island is rejected by `decodeSave` if it now lies inside one and starts at the harbor otherwise. `lighthouseIslands` lists three islands with a lighthouse (landmarks to steer by).
- **Shape** (`island-shape.ts`): the coast has six harmonics and stays between 0.88 and 0.99 of the radius; four to six broad hills and soft ridged crests make the relief, the peak is 0.20 to 0.25 of the radius (capped at 62 m), the land is never steeper than 0.63 (about 32 degrees) and the dry sand is the same 11 m wide on every island (the grass ramps in over 22 m at most; the hills over 0.8 of the radius).
- **Collision ring**: it was `1.08 x radius`; on a 257 m island that would be a 50 m invisible wall off the beach. It is now the farthest headland of the real coast plus 4 m (`Island.ring`, `islandCollisionRadius`). Market piers go on a headland that reaches almost that far (a flat spot of the coast), so the gangway still lands 8.5 m up the sand.
- **Detail** (`island-layout.ts`, `layoutBigIsland` for radius from 60 m): one to three villages of three to five stilt huts, palms along the beach and then in dense stands inland in patches of forest (`forestAt`), boulder outcrops on steep ground and singles on the beach, bushes in and at the edge of the forest; counts grow with the area but stop at 550 palms, 220 rocks and 450 bushes per island. Smaller islands keep the old layout. The terrain grid has cells of about 3.5 m whatever the size, and the small grass, flowers and bushes grow up to 3x.
- **Markets**: five, on islands 0, 1, 2, 4 and 6 (`Market.island`); three cats serve them, so a cat may stand at two. **Buoys**: a gate by the harbor and one either side of each pier. **Fishing zones**: the harbor's surroundings stay open sea (the deep sea starts 128 m beyond the harbor as well as beyond every beach). **Fog**: 0.0016 -> 0.0011 so an island 1 km away is still seen (about 70 % fog).
- **Removed**: `BACKDROP`, the five far islands and `BEYOND_SEA`.

## Not done (in the Blender proposal, not in the game)

Lagoons, coral reefs off the beaches and the four open-sea shoals need the sea's shader to know a floor that is not a function of the distance to a coast; village piers need a pier mesh. Tracked as follow-up work, not promised.

## Measured and not measured

Headless: about 300,000 terrain and detail triangles for all eight islands and 6,131 model instances (2,862 palms of roughly 1,000 triangles each, 857 rocks, 2,349 bushes, 63 huts), built in about 0.7 s on a desktop. **Not measured: the frame rate and start-up time on a phone.** If a phone is too slow, cut the forest first (`forestCap`, `bushCap`, `rockCap` in `island-layout.ts`) and consider thin instances in `island-models.ts` (one object per model and island instead of one per prop). The first deployment also moves players' boats: an old client talking to the new server (or the reverse) is accepted only inside the old 180 m on an old server.
