# MCP servers and connectors for this project

What the project's work uses, where each one is configured, and how to set it up on a new machine. **Never put an API key, token or password in this repository** (not in `.mcp.json`, not in docs): a server that needs one reads it from an environment variable or lives in the user's own configuration.

## In the repository

| Server       | Where                                                                                                                    | What it is for                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openwiki`   | `.mcp.json` (for Claude Code) and `.codex/config.toml` (for Codex; written and managed by OpenWiki, do not edit by hand) | Search and read the generated repository wiki in `openwiki/` (`npx --no-install openwiki mcp --host claude` uses the version in `devDependencies`, so `npm ci` is enough). |
| `playwright` | `.mcp.json`                                                                                                              | Drive a real browser (`npx @playwright/mcp@latest`, not pinned). The game's own browser tests do not use it: they use `playwright-core` directly (`tests/browser.mjs`).    |

Claude Code asks the user to approve the servers of a project's `.mcp.json` the first time it sees them. The names `openwiki` and `playwright` may also exist in the user's own configuration; the project's entry wins inside this repository.

## Not in the repository (the user installs them)

| Server                                                                | Where it lives                                                                                                                                                                                          | Set-up                                                                                                                                                                                                                                                                                            | What it is for                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blender**                                                           | The Claude Desktop extension `Blender` (folder `~/Library/Application Support/Claude/Claude Extensions/ant.dir.gh.blender.blender-mcp`, launched as `uv run blender-mcp`) plus an add-on inside Blender | Install the extension in Claude Desktop. In Blender 5.x: Edit > Preferences > Get Extensions, add the repository `https://lab.blender.org/`, install and enable **MCP**, then start its server (default port 9876; the tools report "Cannot connect to Blender at localhost:9876" until it runs). | The `blender-structure` and `blender-refine` agents (`.claude/agents/`) build the island props with `tools/blender/props.py` in a running Blender.                                                                                            |
| Vercel, Render, Supabase, Postman, Google Drive, Figma                | Connectors of the user's claude.ai account                                                                                                                                                              | Connect them in the account's connector settings and enable them for the session                                                                                                                                                                                                                  | Vercel: deployments and the production environment variable `VITE_ECONOMY`. Render: the API service's deploys. Supabase: the economy migration and advisors (project `juaugfwafdaifewcjirn`). The others are not part of the game's workflow. |
| `backlog`, `framelink-figma`, `Figma` (local app), `google-analytics` | The user's own `~/.claude.json`                                                                                                                                                                         | Each needs its own credential (a Backlog API key, a Figma token) that the user keeps outside the repository                                                                                                                                                                                       | Not used by this project's workflow.                                                                                                                                                                                                          |

The Blender MCP was left out of `.mcp.json` on purpose: its supported launcher is the Desktop extension, and a project entry would have to guess a different command (installing the server from `https://projects.blender.org/lab/blender_mcp.git`), which has not been tried here.

## Running Blender scripts through the MCP: how it works and what goes wrong

**How it works.** Two parts. The Desktop extension `Blender` (above) is the MCP server the AI talks to; the **MCP** add-on inside Blender 5.x opens a socket (port 9876) and runs what it is sent. The tools are `mcp__Blender__*` (load them with the client's tool search first). `execute_blender_code` runs Python with `bpy` inside the user's open Blender. Nothing else in the repository starts Blender, so the AI cannot use these tools unless Blender is open with the add-on's server started. A different AI client (for example Codex) needs the same Desktop extension or its own launcher of `blender-mcp`; it is not in `.mcp.json`, and no `.codex` agent exists for Blender.

**The pattern to follow.** Keep the model as code in `tools/blender/*.py` and run it from the repository, so it can be rebuilt and reviewed:

```python
import sys, importlib
sys.path.insert(0, "/path/to/repo/tools/blender")
import lib, baits
importlib.reload(lib); importlib.reload(baits)   # pick up edits made to the files
result = baits.export_all("/path/to/repo/public/models")
```

Work in a NEW scene (`bpy.data.scenes.new`), never call `lib.reset()` (it wipes the open file) and never save the user's `.blend` (see the agent briefs).

**What goes wrong** (each cost a failed run in the upgrade-shop work, 2026-11-20):

- `result` must be a **dict**. Returning a list fails with "The `result` variable must be a dict" (after the code has run, so a failed return does not mean a failed export: check the files).
- Export and render run on the **window's current scene**. Set `bpy.context.window.scene = scene` first, or the exporter fails with "Object cannot be selected because it is not in View Layer" and a render draws the wrong scene. Put it back afterwards if the user was looking at another scene.
- **Object names are unique in the whole file**, and the glTF exporter writes them as node names. A `body` or `hook` that already exists in another scene turns yours into `body.001` and the game's parser (`parseFishGlb` looks nodes up by name) finds nothing. Step other objects of that name aside during the export and put them back (`baits.export_bait` does).
- **`lib.bake_colors(obj)` before export.** The game reads colours from `COLOR_0`; without it the GLB has only material colours and `readAccessor` throws "no accessor undefined". Remove an old `Col` attribute first when you bake twice.
- Model colours come from the palette (`lib.PAL`, `palette.json`), never a hex of their own; `npm run assets:palette` refreshes the file from `src/ocean/art/colors.ts`.
- The camera of a render is orthographic: `ortho_scale` is the **longer side** of the picture, so a tall narrow image shows less width than the number suggests.
- Not a Blender fault, but the same kind of trap when a model's box feeds the physics: Havok's mass properties are per unit of mass (the inertia of a box is `(h² + d²) / 12`, not that times the mass). `tests/boat-tier.test.mjs` pins it.
- If a tool says "Cannot connect to Blender at localhost:9876", stop and tell the user; do not work around it.

See also `docs/agent-briefs.md` (the agents and the render harness) and `docs/decisions/0011-sea-visual-overhaul.md`.
