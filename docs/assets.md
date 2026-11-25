# Blender assets: where they live and how they are kept honest

The game serves 37 GLB files from `public/models/`. They are committed, so a normal build and CI never need Blender. No `.blend` file is in the repository: **the source of a model is its script in `tools/blender/`** (or, for the sea animals, a download), and the GLB is its build.

## The catalogue

`tools/blender/assets.json` lists every GLB: its `group` (bait, boat, patrol, shipyard, island-prop, vendor, person, fish), the `source` script and `how` to run it, the `nodes` the game looks up by name, and a `maxTriangles` ceiling (the count measured when the entry was written, +2 %). `tests/assets-manifest.test.mjs` (in `npm run test:unit`) fails when:

- a GLB in `public/models/` has no entry, or an entry has no file;
- a source script does not exist;
- a node the game looks up is missing (for example `body` and `hook` of a bait, read by `parseFishGlb`);
- a mesh has no `COLOR_0` (run `lib.bake_colors` before export);
- a file is over its triangle ceiling.

The per-group tests (`boat-models`, `bait-models`, `models`, `fish-models`, ...) still pin the exact numbers and layout of their group; the catalogue is the one list that covers all of them.

## Rebuilding from the scripts

```
npm run assets:rebuild -- --out /some/folder [bait boat island-prop vendor person | file.glb ...]
node scripts/check-asset-rebuild.mjs /some/folder
```

`tools/blender/rebuild.py` reads the catalogue and runs, in a **separate** Blender (factory settings, saves nothing, never the one you are working in), the scene builder and exporter of every script: `baits.py`, `props.py`, `vendors.py`, `upgrade_boats.py` and, person by person, `build.py`. The GLBs and a `rebuild-report.json` go to `--out`; use `public/models` as `--out` only after the comparison is clean. Blender opens a window for about half a minute and quits (the exporters need a window). `BLENDER=/path/to/Blender` replaces the default macOS location. The `check-asset-rebuild.mjs` script compares each rebuilt file with the committed one and the catalogue (triangles, nodes, vertex colours) and exits 1 on a difference.

Measured 2026-11-20 (Blender 5.x): the 27 built models (all but the 10 downloaded animals) rebuild with the same triangles, nodes and vertex colours as the committed files. The bytes were not compared.

## Names and folders

- File names are lower-case with hyphens and use the id the game looks the model up by: `bait-<id>`, `boat` and `boat-<tier 2-4>`, `boat-patrol`, `shipyard`, `palm|rock|bush-<n>` and `hut`, `cat-<id>` (market vendors), `people-<n>`, `fish-<species id>`. `tests/assets-manifest.test.mjs` holds the pattern of each group; a new kind of model adds a group and a pattern there.
- `public/models/` and `tools/blender/` stay flat. Every script in `tools/blender` must be the `source` of a model or be listed under `scripts` in `assets.json` with its role (helper, tool, pending); the test fails on an unexplained one. Split into sub-folders only when a group needs several scripts of its own, and move the scripts and the `source` paths in one commit.
- Scratch output (renders, error logs, session notes) does not belong in the repository root: use the scratch folder of the session, or `test-results/` (ignored).

## Rules

1. Change a model in its script, rebuild, commit the script and the GLB together. Do not edit in Blender and export without moving the change back into the script.
2. A new GLB: add its entry to `assets.json` in the same commit (group, source, nodes, ceiling). Raising a ceiling is a decision to state in the commit, not a way to make the test pass.
3. Colours come from the palette (`palette.json`, refreshed by `npm run assets:palette`), never a hex of the script's own.
4. Models that are downloads (`"source": "community"`) keep their author and licence in `docs/ocean.md` "Sea animal models".
5. Running scripts in the open Blender through the MCP: see [mcp](mcp.md).

## Not yet in the catalogue

The four fishing rods (`tools/blender/rods.py`, scene `Rods`) have no GLB yet. Add them to `assets.json` when they are exported.
