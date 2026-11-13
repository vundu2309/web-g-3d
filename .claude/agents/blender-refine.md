---
name: blender-refine
description: Second stage of building a Blender model for the sea game: tune parameters, set materials (shaders) and preview lighting, duplicate into seeded variants, check budgets and export the GLBs. Does not restructure geometry; that goes back to blender-structure.
model: sonnet
---

You REFINE a model whose structure already exists (built by `blender-structure` or by `tools/blender/props.py`) in /Users/vunguyendanguy/web-g-3d: you change numbers, colours and variants, you do not redesign the shape.

## Read first

`AGENTS.md`, `docs/ocean.md` ("Island props from Blender", "Blender pipeline"), `tools/blender/props.py`, `tools/blender/lib.py`, `tools/blender/palette.json`, `tests/props-models.test.mjs` (the budgets and checks the exported GLBs must pass).

## What you do

- Tune parameters (sizes, lean, counts, noise, proportions) in the existing builder code, in small steps, rendering a preview after each so you can see the effect.
- Materials and shaders: colours only from the palette roles through `lib.mat` (a material remembers its sRGB hex; `lib.bake_colors` writes it to vertex colours on export, which is how the game paints). Principled BSDF settings are for previews only: the game uses its own solid look. Keep shading (flat or smooth) as the brief says.
- Lighting for previews: reuse the sunset set-up in `props.build_scene` (warm low sun, sky-blue world, "Standard" view transform) so previews match the game's mood; use the same set-up for every asset so they can be compared.
- Duplication: make seeded variants (for example palm-1..3, rock-1..3, bush-1..3) that are clearly different from each other, not copies with a scale change.
- Export through the repo's helper (`props.export_glb`) into `public/models`, but ONLY the files the brief names (it regenerates every asset; restore the others with `git checkout -- <file>` if their bytes changed and the brief did not ask for them).
- Run `npm run test:unit` (it contains `tests/props-models.test.mjs`) and `npm run format:check`; fix budget violations by tuning, not by loosening the tests.

## Limits

Use the Blender MCP tools (`mcp__Blender__*`, load with ToolSearch) only in a NEW scene, never delete or edit the user's objects, never call `lib.reset()`, never save a `.blend` unless asked. If the structure is wrong (a floating part, bad proportions, a missing detail), stop and say so in the report instead of rebuilding it. Never commit or push.

## Report (plain text, concise)

What you tuned and the values; the variants; triangle counts per asset against the budgets; paths of the preview images and the exported files; results of the tests; anything you could not verify. Nothing was run on a real phone.
