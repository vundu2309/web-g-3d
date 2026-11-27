# Agent workflow

How a change is planned, built by agents, checked, approved by the user and published in this repository. It writes down what the sea overhaul of November 2026 did by hand ([decision 0011](decisions/0011-sea-visual-overhaul.md), [agent-briefs.md](agent-briefs.md)). It needs no tool beyond git and the agents in `.claude/agents/`; a change is tracked by a Markdown record in `docs/work/`.

**This workflow is mandatory.** The rules, the threshold for an agent review and the one exception are under "Change contract" in [AGENTS.md](../AGENTS.md); this page says how the stages work. The work record is opened before the first edit; stage 8 below adds the commit SHAs after the push.

## Roles

| Role                    | Who                                                 | May                                                                                                                                                         | May not                                                                            |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Lead**                | The main session                                    | Write briefs, start agents, review reports, run checks, view images, commit, push (only after the user approves), update docs and memory                    | Skip a gate, claim phone behaviour that was never run                              |
| **Builder**             | `sea-visual-builder` (inherits the session's model) | Change game code in the files the brief gives it, run checks and browser tests, take images                                                                 | Commit, push, touch files owned by another agent, touch Supabase, Vercel or Render |
| **Modeller, structure** | `blender-structure` (Opus)                          | Build a model's structure in a new Blender scene as a re-runnable script                                                                                    | Edit the user's Blender objects, `lib.reset()`, commit, push                       |
| **Modeller, refine**    | `blender-refine` (Sonnet)                           | Tune parameters, palette materials, preview lighting, variants, export the named GLBs                                                                       | Restructure geometry (send it back), commit, push                                  |
| **Reviewer**            | `sea-visual-reviewer` (inherits; read-only)         | Read the diff and the images, rerun the checks, list findings                                                                                               | Edit, commit, push                                                                 |
| **QA**                  | `qa-runner` (inherits; read-only)                   | Run the checks and the browser tests for a change, tell a real failure from a timing flake and from an environment problem, report both outcomes of a rerun | Edit, commit, push                                                                 |
| **Docs**                | `docs-keeper` (inherits; edits `docs/` only)        | Keep the authored docs, the decision record and the work record in step with a finished change; check each claim against the code                           | Touch code, tests, `package.json` or the generated `openwiki/`; commit, push       |
| **Release**             | `release-manager` (inherits)                        | For one change the user approved: stage only its files, run the checks, commit with the trailers, push to `main`, watch the build                           | Commit work nobody approved, `git add -A`, force-push, skip a check                |
| **User**                | The project owner                                   | Give feedback, approve the images, approve every push                                                                                                       |                                                                                    |

## Stages and gates

1. **Intake.** The user's feedback is written as a brief (see the template in [agent-briefs.md](agent-briefs.md)) and a record is opened in `docs/work/` from `_template.md`. Its "Brief" section is the spec. _Gate: the brief names what must not be touched and who owns which files, and each acceptance criterion names a check that can fail, is marked a guard, or says who judges it and how (see the template)._
2. **Concept** (only for a new look: a model, a colour direction, a shape). Images first; the user approves before any game code. _Gate: user approval of the concept._
3. **Build.** Where a criterion has a test, the test is written first and seen to fail. One agent per independent set of files. Agents that run at the same time get their own dev-server port and temporary page name, and never edit a file another agent owns. For a new Blender prop: structure, then refine, then builder.
4. **Verify.** `npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`; the browser tests that fit the change (`ocean-babylon`, `ocean-market`, `ocean-fishing`; `pwa` after a build with no account settings, see [workflow](workflow.md)); before/after images with `tools/render-harness`, plus a four-frame sequence for anything that moves. `qa-runner` can run this list and classify each failure (real, flaky, environment); the lead still reruns what the change depends on. _Gate: every check passes, or the failure is explained and a rerun result is reported._
5. **Review.** The reviewer agent and the lead each rerun the checks and look at the images; builders' numbers are claims until the lead has seen them. _Gate: no open finding, or each is listed for the user._
6. **Approval.** The images go to the user with what is unverified. For a change with no images (an API, a migration, tooling, docs) the user is shown a short summary of the diff, the evidence and what is unverified. _Gate: the user says "approved" for that change._ Silence is not approval.
7. **Publish.** The lead commits (one coherent commit per change, with the project's trailers) and pushes to `main`, then checks the Vercel and Render builds and the GitHub Actions run. `release-manager` may do the commit and push for one approved change, from a brief that states the approval. A push goes live on production.
8. **Record.** The record was opened at stage 1; now add the commit SHAs and set `published` in a follow-up commit. Every change goes through this workflow, including one the lead built alone (the record says which agents, if any, took part). Update its status, commits and images folder, the decision record for lasting decisions (`docs-keeper` can do the docs), the project memory, and, when source has changed enough, refresh OpenWiki through its lifecycle (never by hand).

## States of a work record

`proposed` (brief written) > `approved` (concept or plan approved) > `building` > `verifying` > `in review` > `user-approved` > `published`. Side states: `blocked` (say why and on whom) and `dropped` (say why). The state is in the front matter of the record and changes when a gate is passed, not before.

## Rules that hold in every stage

- **Evidence over claims.** Images and test output come from the lead's own runs or are marked as the agent's claim. Pictures are software-rendered; nothing here has been checked on a real phone, and no frame rate has been measured.
- **Beauty first, performance later** (the owner's rule): log new cost under "Performance pass" in `docs/ocean.md`; do not trim looks to save triangles. The budget, the patterns and the reporting form are in [performance.md](performance.md).
- **Parity.** The boats float on the surface the player sees: `waves.ts` is shared by CPU and shader.
- **Secrets stay out.** No key, token or password in the repository, in a brief, in an image or in a report. If one appears in tool output, say so at once.
- **One failure, one rerun.** If a browser test fails, rerun it once alone and report both outcomes; `ocean-fishing` is timing-sensitive under software WebGL. A failure that disappears is still reported.
- **Clean up.** Stop servers, delete temporary pages from the repository root, keep images out of git.
- **A change that reverses an earlier decision says so** in its commit message and in the docs it touches.

## Where things are

| What                 | Where                              |
| -------------------- | ---------------------------------- |
| Project instructions | `AGENTS.md`                        |
| Agents               | `.claude/agents/`                  |
| Briefs, recipes      | [agent-briefs.md](agent-briefs.md) |
| Work records         | `docs/work/`                       |
| Decisions            | `docs/decisions/`                  |
| Screenshot harness   | `tools/render-harness/`            |
| MCP servers          | [mcp.md](mcp.md)                   |
| Checks and release   | [workflow.md](workflow.md)         |
