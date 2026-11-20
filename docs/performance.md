# Performance

How the sea game keeps its frame rate, and what a change may cost. Written on 2026-11-19 from what the sea already does; it adds no new rule of its own. Where a number is a limit in code or a test it says so and names the file. Where it is a reading from a real phone it says that. A number with neither is a reference, not a promise.

The owner's rule still holds: **beauty first, performance later** ([agent workflow](agent-workflow.md)). A cost is added when the look needs it, written down here and in `docs/ocean.md` ("Performance pass"), and made switchable so the game can give it up on a slow phone. Looks are not trimmed in advance to save triangles, and community models are never decimated by hand (their triangles stay as the artist made them; only the distance copies below are generated).

## 1. The budget

The primary device is a phone held wide (844×390, 932×430). One real-phone measurement exists, so most of this is a limit set from it, not a guarantee.

### Frame rate (the thing the player feels)

| Quantity                   | Value                                                                                                                                                    | Where it comes from                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Target on a phone          | a steady 30 fps or better at the render scale the phone starts with                                                                                      | phone reading: scale 1 gave about 39 fps, scale 1.5 about 23 fps |
| Panel turns red ("! SLOW") | under 24 fps, or the slowest 5 % of gaps over 60 ms, or main-thread cost over 28 ms on average, or 3 hitches (gaps over 50 ms) in 2 s                    | `POOR` and `HITCH` in `src/ocean/perf-meter.ts`                  |
| Drawn at most              | about 100 fps (never closer than 10 ms apart)                                                                                                            | `MIN_INTERVAL` in `src/ocean/frame-pacing.ts`                    |
| Fallback rhythm            | the pacer drops from "full" to "eco" (about 30 fps, one frame per 31 ms) when the mean gap is over 24 ms, and retries after 10 s, then doubling to 120 s | `src/ocean/frame-pacing.ts`                                      |

A change that turns the panel red on a phone that was not red before is over budget, whatever its triangle count.

### Pixels and layers

| Item                                | Limit                                                                                                                                                                                    | Where                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Render scale on a touch screen      | starts at 1 (not 1.5); the governor coarsens after two slow windows of 2 s (ignoring the first 4 s) and sharpens after five fast ones                                                    | `src/ocean/render-scale.ts`, `babylon-scene.ts`                                 |
| See-through sea (clear-water layer) | on at the start; reach 70 m on a touch screen, 170 m elsewhere; off after two slow windows, back after eight fast ones, at most twice; **given up before the render scale is coarsened** | `src/ocean/clear-water.ts` (`TOUCH_REACH`, `CLEAR.reach`, `ClearWaterGovernor`) |
| Reflection mirror on a touch screen | drawn every second frame, without palms, rocks, bushes, huts or fish                                                                                                                     | `setLeanReflection`, `reflection-model.ts`                                      |
| Island props on a touch screen      | drawn to 750 m (1,400 m elsewhere)                                                                                                                                                       | `FOG_CUT_TOUCH`, `FOG_CUT` in `src/ocean/prop-lod.ts`                           |

The see-through sea is the most expensive single feature measured on a phone (about half the frame rate). New full-screen or render-target work is judged against it: it must be off-able by a governor and by a page-address switch.

### Triangles and meshes

There is no scene-wide triangle cap measured on a phone. These are the limits the code and tests enforce, from the earlier passes:

| Item                              | Limit                                                                                                                                                                                                           | Where                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| One island with its small details | 9,000 to 26,000 triangles (plus the terrain grid); a backdrop island under 6,500                                                                                                                                | `tests/map-detail.test.mjs`                               |
| The player's boat with its rod    | under about 6,000 (the boat is 3,697)                                                                                                                                                                           | `tests/boat-model.test.mjs`, `tests/art-palette.test.mjs` |
| A person                          | body 4,900 and arm 600 at most                                                                                                                                                                                  | `tests/models.test.mjs`                                   |
| Living animals drawn at once      | 200,000 triangles; nearest first, the rest drawn coarser or left out                                                                                                                                            | `TRIANGLE_BUDGET` in `src/ocean/wildlife.ts`              |
| Reference, not a limit            | about 80,000 active triangles at the harbor, 40,000 to 54,000 at an island (software-rendered browser, before the props); 417,198 in the busiest browser-test frame with the see-through layer, 383,689 without | `docs/ocean.md` (Cost paragraphs)                         |

### Memory and download

The Babylon chunk (1.73 MB, 409 KB gzip) and the Havok WASM (2.09 MB, 658 KB gzip) load only when entering the sea and stay out of the service-worker precache. Render targets are counted when added (the see-through layer is about 7 MB resolved for a 2x phone, plus its multisample buffers). Do not add a render target without writing its size.

## 2. The patterns the sea already uses

Use one of these before inventing another. Each names the code that is the model to copy.

1. **Draw by how big it looks, not by a fixed range.** Whole model, a coarser copy, a far copy, then nothing, chosen from the angle the thing covers (about 490 pixels to the radian on a phone held wide). Wildlife: `levelOf`, `LOD_TRIANGLES` = whole, 4,000, 700 (`wildlife.ts`). Props: `prop-lod.ts`, `prop-batches.ts`.
2. **Coarser copies are made at load, not downloaded.** `simplify.ts` (vertex clustering) makes them from the model's own triangles in a few tens of milliseconds on a laptop; the whole model is never changed. The farthest stand-in is about 4 % of the triangles (at least 20).
3. **Leave by dither, not by popping.** `DitheredTileFadeMaterialPlugin` on the shared satin material (about 1.4 s in, 0.8 s out) for animals; props end with a plain cut where they are 2 to 3 pixels.
4. **One mesh, many instances.** Thin instances per model and level, with our own frustum test per prop, because Babylon culls a thin-instanced mesh only as a whole (`prop-batches.ts`). Name meshes `wild-*` (or use `LEAN_PREFIX` names) to keep them out of the water's mirror.
5. **Put the cost behind a condition.** Night-only sky work, the moon's GGX and rain rings only when the moon or rain is on, rain and the beacon only while they exist. In a shader, a branch on a uniform; in the CPU, an early return (the hull-water code returns for a dry point before it touches the grid).
6. **A governor gives a cost up while the game runs.** Pure numbers in their own file with a test (`render-scale.ts`, `clear-water.ts`, `frame-pacing.ts`): warm-up first, two slow windows in a row, a slower way back, never reacting to the 30 fps cap itself. The newest, cheapest-to-lose cost goes first.
7. **A page-address switch for every large cost.** `?reflect=0`, `?fish=0`, `?props=0`, `?scale=1`, `?waves=N` (`src/ocean/probe.ts`). They are developer switches: Settings has no card of them for the player (removed 2026-11-20), and what an old card stored on a device is ignored. A feature that gives back many fps when off is the one to cut.
8. **Pure maths first.** Anything that can run without Babylon or a GPU (the ripple grid, wave height, LOD choice, governors) lives in a file with no engine import and a plain test, so its cost and behaviour are checked headlessly.
9. **Share one source for the CPU and the shader.** `waves.ts` is read by the physics and by the water shader, so there is no second copy of the surface to compute or to drift.

## 3. How a change reports its cost

Before the change is called finished:

1. **Name the new cost** in `docs/ocean.md` under "Performance pass", in the form the earlier entries use: what runs per frame (draw calls, triangles, texture or render-target size, shader work, CPU cell visits) and under what condition. Say "not measured on a phone" if it was not.
2. **Make it off-able.** A condition, a governor or a probe switch (patterns 5 to 7). A cost with no way to switch it off is not accepted.
3. **Count what a test can count.** Triangles of a model, instances placed, cells visited, draws per frame. These are exact, headless and cheap. Do not present a software-rendered frame time as a phone frame rate.
4. **Test the limit if the code has one.** A governor, a level choice or a budget needs a test that fails when it is broken (examples: `tests/ocean.test.mjs` pins that the 30 fps cap is not treated as slow; `tests/map-detail.test.mjs` holds the island triangles).
5. **Measure on a phone when you can.** Open the game with `?perf` (or the Settings card "Khung đo hiệu năng") and read fps, the 95th percentile gap, main-thread cost, hitches, render scale, whether the see-through layer is on, active triangles and meshes. Then switch parts off with the probe switches and read it again. One sample per reading is what exists so far; say how many samples a number has. Without a phone reading, the report says the cost is unmeasured.

## 4. What is not yet known

These are the gaps, not hidden decisions:

- No phone reading after the batched props, the lean mirror, the depth-trial see-through mode or the hull-to-water work. Everything under "Not measured" in `docs/ocean.md` is still open.
- No scene-wide triangle or draw-call cap from a phone; the limits above are per item.
- The 200,000 animal triangles and the island limits come from reasoning and software renders, not from a phone.
- Only the panel's own numbers are available on a phone: the browser does not give GPU time, so a GPU-bound change and a CPU-bound one look alike until a switch is tried.
- No automated check fails when the whole frame goes over budget; the tests above guard single items only.

Keep this page short. When a limit changes, change the number and its source here in the same commit.
