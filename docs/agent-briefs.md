# Working with sub-agents on the sea visuals

How the sea overhaul of November 2026 (decision [0011](decisions/0011-sea-visual-overhaul.md)) was divided among sub-agents, kept here so a later session can repeat it. The agent files are in `.claude/agents/`; the screenshot tool is `tools/render-harness/`.

## The agents

| Agent                | Model                        | Use it for                                                                                                                                                                           |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sea-visual-builder` | inherits the session's model | A visual change in game code: water shader, islands, prop placement, camera, NPC figures. Renders before/after images with the harness and runs every check.                         |
| `blender-structure`  | Opus                         | The first stage of a Blender model: the main structure, complex or procedural details, hard Geometry Nodes functions, as a re-runnable script in a new scene of the running Blender. |
| `blender-refine`     | Sonnet                       | The second stage: tune parameters, set palette materials and preview lighting, make seeded variants, check budgets, export the GLBs. It does not redesign the shape.                 |

Typical flow for a new prop: `blender-structure` builds it, `blender-refine` tunes and exports it, then `sea-visual-builder` places it in the islands (as `island-layout.ts` and `island-models.ts` do for palms, rocks, bushes and the hut). The lead (the main session) reviews every report: reruns the checks, looks at the images, commits and, after the user approves the images, pushes.

Blender needs the Blender Lab MCP add-on running (set-up and the other MCP servers: [mcp.md](mcp.md)). Without it the Blender agents cannot work; `sea-visual-builder` does not need it.

## A brief for `sea-visual-builder`

The agent file holds the standing rules, so a brief only needs:

1. **The user's feedback in their words and the numbers that explain it** (read the code first: "the beach is too steep" became a measured slope and a profile formula).
2. **What to build**, numbered, with the targets in numbers and the limits that must hold (for example "the coast stays inside the 1.08 x radius collision circle").
3. **What not to touch**, and which other agent is working at the same time on which files.
4. **Where the images go** and which views to take (default chase camera, low fishing camera, close beach, wide, a four-frame sequence for anything that moves).
5. **Report format**.

Tips that cost time before: tell each parallel agent its own dev-server port and temporary page name; do not let anyone edit files while a browser test runs; remind agents that `ocean-fishing-browser` is timing-sensitive under software WebGL and passes on a rerun; never let a sub-agent commit or push.

## Recipes (what each task was)

- **Waves and ripples.** Twelve waves around `WIND_DIRECTION` (`waves.ts`), ripples from a 128 x 128 slope texture read in two layers with calm/rough patches (`ripples.ts`, `water.ts`). Parity with the CPU height kept; boat roll and pitch tested.
- **Islands (style A).** `islandShape` in `island-shape.ts`: peak about 0.21 x radius from two or three Gaussian hills on a ridge, a coast of 0.85 to 0.99 x radius with bays, sand blending into grass; tests in `tests/map-detail.test.mjs`.
- **Shore, surf, swash, turquoise water.** A per-island coast table packed into a texture (`shore.ts`), a swash sheet (`swash.ts`), surf and colour in `water.ts`, minimap, fishing zones and piers following the real coast. The water mesh and its vertex shader are not displaced.
- **Props from Blender.** `tools/blender/props.py` builds palms, rocks, bushes and a stilt hut into `public/models`; `island-models.ts` loads them as instances, `island-layout.ts` places them (pure, seeded), the procedural props stay as the fallback.
- **Reflections.** `reflection.ts` and `reflection-model.ts`: a half-resolution mirror texture about y = 0 with a render-list predicate over the whole scene, nine-tap blur, wave wobble, analytic-sky fallback.
- **Reach of the water.** `water-extent.ts`: the disc reaches 3,000 m so a high camera never sees its edge.
- **Gentle beach.** A wider, shallower beach with surf that breaks far out and a swash that runs a long way up (see decision 0011 for the numbers once it is merged).

## Checks every change must pass

`npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, plus the browser tests for what changed (`tests/ocean-babylon-browser.mjs`, `ocean-market-browser.mjs`, `ocean-fishing-browser.mjs`; `tests/pwa-browser.mjs` after `npm run build`). All of it runs under software WebGL on the developer's Mac; nothing has been verified on a real phone.
