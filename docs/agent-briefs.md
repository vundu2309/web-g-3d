# Working with sub-agents on the sea visuals

How the sea overhaul of November 2026 (decision [0011](decisions/0011-sea-visual-overhaul.md)) was divided among sub-agents, kept here so a later session can repeat it. The agent files are in `.claude/agents/`; the screenshot tool is `tools/render-harness/`; the stages, gates and roles are in [agent-workflow.md](agent-workflow.md), and each change has a record in [work/](work/README.md).

## The agents

| Agent                 | Model                        | Use it for                                                                                                                                                                                                                                                                                             |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sea-visual-builder`  | inherits the session's model | A visual change in game code: water shader, islands, prop placement, camera, NPC figures. Renders before/after images with the harness and runs every check.                                                                                                                                           |
| `blender-structure`   | Opus                         | The first stage of a Blender model: the main structure, complex or procedural details, hard Geometry Nodes functions, as a re-runnable script in a new scene of the running Blender.                                                                                                                   |
| `blender-refine`      | Sonnet                       | The second stage: tune parameters, set palette materials and preview lighting, make seeded variants, check budgets, export the GLBs. It does not redesign the shape.                                                                                                                                   |
| `sea-visual-reviewer` | inherits, read-only          | Reviews a finished change: the diff against the brief and the rules, reruns the checks, opens the before/after images, lists findings. It never edits, commits or pushes.                                                                                                                              |
| `release-manager`     | inherits                     | Publishing one approved change: stages only its files (splits shared files hunk by hunk), reruns the checks, commits with the trailers, pushes to main over SSH with the repository owner's key, reports the SHA and the build evidence it can see. Never commits unapproved work, never force-pushes. |
| `qa-runner`           | inherits, read-only          | Verifying a change: format, types, lint, unit tests and the browser tests through `scripts/qa.mjs`, with a rerun of a failing test alone; classifies each failure as real, flaky or environment and reports both outcomes. It never edits.                                                             |
| `docs-keeper`         | inherits                     | Keeping `docs/ocean.md`, the decision record 0011, `docs/work/` and the agent docs in step with a finished change, by exact-string edits, checking each claim against the code. Never touches code, tests or the generated OpenWiki.                                                                   |

Typical flow for a new prop: `blender-structure` builds it, `blender-refine` tunes and exports it, then `sea-visual-builder` places it in the islands (as `island-layout.ts` and `island-models.ts` do for palms, rocks, bushes and the hut). The lead (the main session) reviews every report: reruns the checks, looks at the images, commits and, after the user approves the images, pushes.

Blender needs the Blender Lab MCP add-on running (set-up and the other MCP servers: [mcp.md](mcp.md)). Without it the Blender agents cannot work; `sea-visual-builder` does not need it.

## Standard start for every brief

Paste this (or point to it) so a brief only has to say what is different. It is what cost time before.

- **Environment.** Node 24. `timeout` does not exist on this Mac: run long commands in the background and wait on them without sleeping in the foreground. System Chrome: `CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. Bind servers to `127.0.0.1` (`npx vite --host 127.0.0.1 --port <yours> --strictPort`), each agent on its own port (the one-command scripts pick a free one).
- **One command instead of by hand** (`scripts/`):
  - `node scripts/qa.mjs ocean-fishing ocean-cast` (or `ocean` for the group) runs browser tests with the right environment, a time limit, and reruns a failing test once alone; report BOTH outcomes (the timing checks of `ocean-fishing` and `ocean-babylon` are flaky under software WebGL). `node scripts/qa.mjs --changed` picks the tests from the changed files (see [workflow](workflow.md)).
  - `node scripts/shots.mjs before` and `node scripts/shots.mjs after` take the standard images (chase, fishing camera, beach, horizon; add specs `mode,island,angle,seconds`) into the temp folder, or `--out dir`.
  - Both take `--cwd <worktree>` to work in a worktree.
- **Running the real game locally** (signed in, in the shared sea, from a worktree): follow [local setup](local-setup.md): copy `.env.local`, serve with `VITE_FS_ALLOW`, run a local API (Render refuses local origins), never touch Render.
- **Parallel agents.** Give each its own worktree (below) so no one edits the same files or breaks another's browser test. If they must share the checkout, list the files each one owns and the files it must not touch, and say that the working copies of `docs/ocean.md`, `docs/decisions/0011-sea-visual-overhaul.md` and `package.json` may hold other agents' uncommitted lines: change only your own lines with exact-string edits, never rewrite those files.
- **Temporary files.** Temporary harness pages go in the repository root only while needed, with a name of your own, and are deleted afterwards; images go to the scratchpad, never into git.
- **Never** commit, push, touch Supabase, Vercel or Render, or put a key in a file. The lead (or `release-manager`, after the user approves) publishes.
- **Report.** Files changed; the real output of the checks (`npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, the browser tests named); image paths you looked at; what is only seen in software-rendered images (no phone, no frame rate) and what is not verified.

## Worktrees for parallel work

`scripts/wt.mjs` makes one checkout per task (the user allowed worktrees for parallel agents on 2026-11-16):

```bash
node scripts/wt.mjs new clear-water      # ../web-g-3d-wt/clear-water on branch wt/clear-water, from main
node scripts/wt.mjs preview clear-water  # Vite for THAT code on its own port; prints the URL
node scripts/wt.mjs list                 # worktrees, branches, previews
node scripts/wt.mjs sync clear-water     # rebase the branch onto main
node scripts/wt.mjs stop clear-water
node scripts/wt.mjs remove clear-water   # refuses while it has uncommitted changes
```

Edits in the worktree show in its preview at once (Vite serves that folder; checked), while `main` stays as it was, so the user can look at the result before it is merged. `node_modules` is a symlink to the main checkout's, so no second install; each worktree has its own Vite cache (`VITE_CACHE_DIR`). The agent commits on its branch (the builder still never pushes); after the user approves, `release-manager` merges or cherry-picks the branch to main and pushes. Do not run `npm ci` or change dependencies inside a worktree (they share `node_modules`); a change to `package.json` dependencies is done in the main checkout.

## A builder's brief is the spec

The "Brief" section of the work record (from [`_template.md`](work/_template.md): acceptance criteria, what to
build, what not to touch, owners, how the user judges it) is the brief of a builder. Paste it, add the paths and
the "Standard start" below, and add nothing that contradicts it; when the brief changes, change the record first. The user's words ("Feedback and goal") go with it, and an agent's own list below (images, report form) still applies.
The builder is told to see each criterion's check fail before the change and pass after, and to report both
outputs.

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

`npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, plus the browser tests for what changed (`tests/ocean-babylon-browser.mjs`, `ocean-market-browser.mjs`, `ocean-fishing-browser.mjs`; `tests/pwa-browser.mjs`, which makes its own build, see [workflow](workflow.md)). All of it runs under software WebGL on the developer's Mac; nothing has been verified on a real phone.
