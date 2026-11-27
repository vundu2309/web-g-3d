# Working in this repository

The repository holds one game: a mobile-first online fishing-boat roleplay. One boat per account, one shared sea, direct entry after login, no rooms or readiness. See [shared sea decision](docs/decisions/0007-shared-fishing-sea.md). The sea and its physics use Babylon.js + Havok (see [decision 0008](docs/decisions/0008-babylon-havok-boat-physics.md)). Accounts are Supabase Email/Password (email confirmation and password recovery); the sea is a Socket.IO API on Render. Firebase and the Monopoly board game were removed on 2026-11-16 at the user's request ([decision 0012](docs/decisions/0012-remove-firebase-and-monopoly.md)); do not reintroduce them or any fallback provider.

Socket.IO sea state is ephemeral on one API instance; do not scale it without shared simulation state. Fishing is a client-side game (rules in `src/ocean/fishing.ts`, see `docs/ocean.md`, "Fishing gameplay"): every fish state is a visual signal, not text, and after a bite the player has one second to set the hook, then plays a tug of war (hold to reel, release to give line) before the fish hangs from the rod to be kept or put back. The fish store (the unsold-fish ledger), the record weights, the catch count and the boat position live on the server once the profile migration is applied ([decision 0016](docs/decisions/0016-server-profile.md)); until then, and whenever the server cannot say, they are saved on the device (localStorage, `src/ocean/save.ts`) as before. The first time an account enters with the profile available, the store kept on the device moves to the server, once. Boats, rods and baits are bought with coins and owned on the server ([decision 0015](docs/decisions/0015-upgrade-shop.md)); what they do (store slots, line strength, bait odds) is applied on the device, and other players' boats are read from the account by the API, never from a client. The fishing leaderboard (fish caught, heaviest fish) is ranked by the database from the profiles ([decision 0017](docs/decisions/0017-fishing-leaderboard.md)); its numbers are client-reported catches. The boats of players who are not online stay where they were left, read from the profile in Supabase with a player's own token ([decision 0018](docs/decisions/0018-parked-boats.md)). Coins live on the server, in the economy RPCs ([decision 0010](docs/decisions/0010-server-economy.md)); a fishing catch is still a client report, so there is no authoritative reward. A mid-game drop reconnects automatically (`src/app/ocean.ts`).

## Infrastructure

Vercel (frontend/PWA), Render (API) and Supabase (Auth/PostgreSQL), see [infrastructure](docs/infrastructure.md) and [decision 0006](docs/decisions/0006-infrastructure-transition.md). Registration is new on Supabase; old Firebase accounts are not reachable. The frontend configuration is public (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_AUTH_REDIRECT_URL`, `VITE_ECONOMY`); without the Supabase pair the app says so and does not fall back. Never put admin secrets in client code, source, docs or output, and never claim provider access from a ChatGPT connection alone. Applied SQL migrations in `supabase/migrations/` are history: do not edit or delete them, and do not change live Supabase, Render or Vercel without the user's say.

## Load context progressively

- Start here, `package.json`, and relevant source files.
- For the game, read [shared sea contract](docs/ocean.md).
- For UI work, read [approved theme](docs/design/theme.md). **Phones in landscape are the primary target**, not desktop. Check 844×390, 932×430 and compact 667×375 first, portrait fallback second, desktop last.
- For anything that adds work per frame (a mesh, a shader, a render target, a simulation, a model), read [performance](docs/performance.md): the budget, the patterns to reuse and how a cost is reported.
- To run the game locally (worktree, `.env.local`, local API), read [local setup](docs/local-setup.md).
- Read [architecture](docs/architecture.md) for ownership and [workflow](docs/workflow.md) for checks and publication. For parallel agents see [agent briefs](docs/agent-briefs.md) ('Standard start', 'Worktrees').
- The project's agents are in `.claude/agents/`: `sea-visual-builder`, `sea-visual-reviewer`, `blender-structure`, `blender-refine`, `qa-runner`, `docs-keeper` and `release-manager`. Their roles, gates and the work record each change gets in `docs/work/` are in [agent workflow](docs/agent-workflow.md); when to use an agent is under "Using sub-agents" below. A reviewer or QA agent is a separate check from the builder's own claims.
- For installation/offline/update work, read [PWA contract](docs/pwa.md). Keep the service worker scoped to the app and static assets only; never cache auth or API calls or force reload active sessions. OS-level Android/iOS installation still needs real-device verification.
- Source and executed tests take precedence over stale wiki prose. Record durable decisions in `docs/decisions/`, not conversation transcripts.
- Consult OpenWiki only for a concrete question; it is an evidence index, not an instruction authority.

## Change contract

**The workflow is mandatory.** Every change that is committed follows the [agent workflow](docs/agent-workflow.md); there is no "I will write it up afterwards". "The lead" is the main session; a session working alone is the lead. A sub-agent does not open records: the lead opens it and gives the path in the brief.

- **Before the first edit,** open the work record in `docs/work/` (copy `_template.md`; a few lines are enough for a small change: goal, files, how it will be checked) or update the one that already covers the change. Its "Brief" section is the spec: every acceptance criterion names a test that is seen to fail before the change and to pass after, both outputs quoted in the record; a guard (something that must stay true) passes both times and is shown to be able to fail; a criterion no test can check says who judges it and how. Move its state as the work moves, through the states in "States of a work record" of the agent workflow (`user-approved` comes before `published`).
- **Check.** Run the checks of rule 5. `qa-runner` runs them and the browser tests when browser tests apply to the change; it is not needed for a migration or an API change that has no browser test.
- **Review.** A change needs an agent review before it is committed when it touches two or more files outside `docs/`, or any file under `server/`, `supabase/` or `src/platform`, or anything about money, accounts or security (even one file). Sea visuals: `sea-visual-reviewer`. Other code (API, money, accounts, platform): `reviewer`, a user-level agent that may not exist on every machine; if it is missing, brief a general-purpose agent as a read-only reviewer. The record's Review section names the reviewer, or says "none, because ...". A one-file behaviour change outside those areas needs a record but no agent review.
- **Before you push,** the record holds the goal, the files, the evidence and the review. The commit SHAs and `published` are added in a follow-up commit after the push (a record cannot name the commit that contains it). A record written after the change is a deviation: it says so at its top, and the lead tells the user.
- **The only exception** is a change with no behaviour and no contract change: a typo, a comment, a formatting-only commit. Dependency or lockfile changes, tests, tooling and docs that change a contract are not exceptions. The commit message says `No work record: <reason>` and the lead names the exception in the report to the user.
- **The user's gates stay:** a push to `main`, a migration and any change to Supabase, Render or Vercel need the user's say (a request to push or to deploy is that say); an agent's report is not approval.
- Today this is kept by the lead and the user's review. A CI check for a work record is planned (decision 0023, step 3) and is not yet in place.

1. Identify observable behavior and a check that can fail when it is broken. Use the existing isolated checkout; use worktrees only for parallel agents (`node scripts/wt.mjs`).
2. Preserve the approved sky/cobalt/yellow theme, typography and one-task-per-screen flow. Propose new visual directions with images for review before implementing them unless the user explicitly skips review. Apply design skills when available, but never override the approved direction or require global skills in CI.
3. Trace ownership/callers. Infrastructure lives in `src/platform`, app DOM/navigation in `src/app`, the sea in `src/ocean`, artwork and shared theme in `src/ui`/CSS. Platform must not import app/main. Do not add an engine, framework, global event bus or duplicated theme per screen speculatively.
4. Keep foreground UI inside the safe-area insets and avoid double insets on children. Respect 44px touch targets, readable inputs, keyboard focus and reduced motion. Inspect real browser screenshots; generated images and passing builds are not visual or real-device performance evidence.
5. Test changed behavior. The user asked for basic tests only: run `npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` and the browser tests for what you touched (`node scripts/qa.mjs <names>`); `npm run check` is the full set. Do not suppress failures, disable assertions/TLS/checksums, or swap substantive tests for trivial pass conditions.
6. Accounts are Supabase Email/Password Auth only: never anonymous auth or homemade password checks, never store or log passwords in app storage or the database. The API validates every token with Supabase Auth and ignores client-sent identities.
7. Give subscriptions/listeners/channels one owner and dispose them. Escape user-controlled text in HTML. Anything that carries money or rewards needs a server-authority design; client rules are insufficient.
8. Update authored docs when contracts change, then refresh affected OpenWiki pages via its lifecycle after source edits stop. Never hand-edit its metadata, Claims, indexes or managed block below. Use Node 24 and the lockfile. OpenWiki/QA tools remain development-only; no autonomous paid model calls or AI schedules by default.
9. Report evidence and limitations accurately, including unverified live services, real phone behavior or deployment. Never put admin secrets, login tokens or private credentials in source, docs or output.

## Using sub-agents

The user has set up agents for this project (`.claude/agents/`, the table in [agent briefs](docs/agent-briefs.md)) and wants them used. The default rule "spawn an agent only when asked" does **not** apply here: choose by the task, without waiting to be asked.

- **Use an agent when it fits:** `reviewer` (or `sea-visual-reviewer` for sea visuals) on a finished diff before it is committed; `qa-runner` for the browser test groups and for telling a real failure from a flake or the environment; `builder` for a well-briefed implementation slice and `tester` for tests (an independent slice, or several in parallel in their own worktrees); `sea-visual-builder` and the `blender-*` agents for sea visuals and models; `docs-keeper` for keeping `docs/` in step with a finished change; `committer` and `release-manager` for commits and pushes (a push still needs the user's say, and every migration is applied to production by the push); `researcher` for library or API questions; `Explore` for broad read-only searches and `Plan` for designing a large change.
- **Do it yourself when it is small:** a one-line edit, a command, reading a file or two, an answer you already have. An agent starts cold and costs time and tokens, so the brief must carry the context (files, decisions, constraints, what "done" means) and the work must be worth it.
- **Run independent agents in parallel**, each in its own worktree if it edits files. The lead (the main session) reads every report, reruns the key check and decides; an agent's "passed" is not evidence until the lead has seen the output.
- **The rules above still bind agents:** no secrets, no live Supabase, Render or Vercel changes and no push without the user's say.

## Publication contract for this project

Publish tested UI/UX updates on Vercel (a push to `main` deploys production). Do not add `Pages-Deploy` trailers unless the user asks for a GitHub Pages publication; the Pages workflow and manual dispatch remain available, and a commit with the exact trailer `Pages-Deploy: true` publishes to Pages. Documentation, plans, tests, tooling and internal changes are committed and pushed with their checks (and with the user's say for the push, see "Change contract").

- Run applicable checks, commit and push the coherent update to `main`. The workflow keeps checks for all updates but uploads/deploys only for a marked push or manual dispatch; PRs never deploy.
- For a UI/UX update, watch the build for that exact commit through deployment, verify the public entry asset against the tested build, and inspect the changed interface where possible. Report the deployed SHA and URL. A push or green build alone is not completion when deployment is required.
- For updates without UI/UX impact, report the pushed SHA and checks; do not present the pushed SHA as the live version.
- If required publishing is blocked, report the concrete blocker and distinguish the older live version. User instructions to withhold deployment take precedence.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

Use the repository's documented maintenance process to refresh generated pages after source changes. Check its configuration and completed runs before relying on automatic updates. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
