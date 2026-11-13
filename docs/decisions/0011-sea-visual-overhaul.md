# 0011: The sea's visual overhaul (water, islands, people, camera)

Status: accepted (user-directed, 2026-11-13); steps 1 to 4 below are on `main`, reflections and bushes were in progress when this was written.

## Context

The user found the sea flat and repetitive (a grid of ripples, one flat colour, no surf), the islands too pointy to look real, the market people ugly, and the camera too low and close. They asked for the water first, then the rest, with these standing rules: **make it beautiful first, phone performance is refactored later**, the sunset stays fixed, and every visual change is shown as before/after images (software-rendered, never a real phone) and approved before it is pushed. The images are the evidence; nothing here has been run on a real phone and no frame rate has been measured.

## Decisions

1. **Waves and ripples** (`waves.ts`, `ripples.ts`): twelve waves (2.2 to 61 m) spread around `WIND_DIRECTION`; fine ripples from a 128 x 128 slope texture built at start-up and read in two layers, modulated by calm and rough patches and faint wind streaks. The CPU height the boats float on is the same table the shader uses.
2. **Islands, style A**: low green islands with a gentle ridge (peak about 0.21 x radius, was 0.38 to 0.56), a medium sand beach and a coast with bays and headlands inside the 1.08 x radius collision circle (`island-shape.ts`, `island-visual.ts`).
3. **Shore field and surf** (`shore.ts`, `swash.ts`, `water.ts`): the water measures the shore from the real coast curve (a per-island table packed into a texture, built from the same `islandShape` as the land). Surf runs parallel to the coast, breaks 4.5 to 12 m out, a swash sheet runs up and back with wet sand. The old flat foam ring is gone. The water mesh and its vertex shader are not displaced near the shore, so boats and the CPU wave height are unchanged.
4. **Colour**: turquoise, clear and varied: Beer-Lambert absorption, a refracted sandy floor with caustics, deep blue to teal to turquoise toward the beaches, wide blue and teal patches in open water (`sea-style.ts`).
5. **Reach of the water** (`water-extent.ts`): the disc is dense to 480 m and reaches 3,000 m, where the fog has hidden it, so a high camera never sees the edge.
6. **Camera** (`chase-camera.ts`): 17.5 m behind and 9.6 m high looking 34 m ahead (was 14.5, 6.8, 30); it keeps clear of islands and piers and looks into turns.
7. **People**: cartoon figures built in code (`npc-look.ts`, `npc-visual.ts`), five looks, wave and walk poses; the three market vendors use them. The Blender GLB people stay in the repository, unused.
8. **Blender props** (`tools/blender/props.py`): coconut palms, rocks, a stilt hut and bushes built from the palette into `public/models/*.glb`, placed as instances (`island-models.ts`, `island-layout.ts`), with the procedural props kept as the fallback. The script never calls `lib.reset()`, so it runs inside a running Blender through the Blender MCP.
9. **Reflections, full level** (in progress): a half-resolution planar reflection of the islands, props, markets, boats and sky mirrored in the water, replacing the analytic-sky-only mirror, with the old mirror as the fallback.

## Consequences and limits

- Cost went up on purpose: about 170,000 triangles (the test cap is 200,000), a heavier water shader (shore lookups for eight islands, Worley foam and caustic cells, two ripple reads) and, with reflections, a second scene pass. The first thing to do in the performance pass: measure on a real phone, move the boats' shadow out of the water shader into a small texture, reduce the shore lookups to the islands near the camera, and lower the reflection resolution.
- Real-phone behaviour, frame rate, texture formats on mobile GPUs and long sessions are unverified.
- Known look issues: a faint arc where unbroken swell sits 15 to 25 m off the beach, foam holes still slightly regular close up, backdrop islands have surf but no swash.
- The NPC, camera and waves were checked in a Babylon test scene and in the real-scene browser tests under software WebGL.

## Next

Reflections and bushes (this change), then the performance pass, then living-sea ideas already listed as debt (NPC boats, NPC quests once fishing is server-authoritative, schools of fish).
