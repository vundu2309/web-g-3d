# Working in this repository

The repository holds one game: a mobile-first online fishing-boat roleplay. One boat per account, one shared sea, direct entry after login, no rooms or readiness. See [shared sea decision](docs/decisions/0007-shared-fishing-sea.md). The sea and its physics use Babylon.js + Havok (see [decision 0008](docs/decisions/0008-babylon-havok-boat-physics.md)). Accounts are Supabase Email/Password (email confirmation and password recovery); the sea is a Socket.IO API on Render. Firebase and the Monopoly board game were removed on 2026-11-16 at the user's request ([decision 0012](docs/decisions/0012-remove-firebase-and-monopoly.md)); do not reintroduce them or any fallback provider.

Socket.IO sea state is ephemeral on one API instance; do not scale it without shared simulation state. Fishing is a client-side game (rules in `src/ocean/fishing.ts`, see `docs/ocean.md`, "Fishing gameplay"): every fish state is a visual signal, not text, and after a bite the player has one second to set the hook, then plays a tug of war (hold to reel, release to give line) before the fish hangs from the rod to be kept or put back. The fish store (the unsold-fish ledger), the record weights, the catch count and the boat position live on the server once the profile migration is applied ([decision 0016](docs/decisions/0016-server-profile.md)); until then, and whenever the server cannot say, they are saved on the device (localStorage, `src/ocean/save.ts`) as before. The first time an account enters with the profile available, the store kept on the device moves to the server, once. Coins live on the server, in the economy RPCs ([decision 0010](docs/decisions/0010-server-economy.md)); a fishing catch is still a client report, so there is no authoritative reward. A mid-game drop reconnects automatically (`src/app/ocean.ts`).

## Infrastructure

Vercel (frontend/PWA), Render (API) and Supabase (Auth/PostgreSQL), see [infrastructure](docs/infrastructure.md) and [decision 0006](docs/decisions/0006-infrastructure-transition.md). Registration is new on Supabase; old Firebase accounts are not reachable. The frontend configuration is public (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_AUTH_REDIRECT_URL`, `VITE_ECONOMY`); without the Supabase pair the app says so and does not fall back. Never put admin secrets in client code, source, docs or output, and never claim provider access from a ChatGPT connection alone. Applied SQL migrations in `supabase/migrations/` are history: do not edit or delete them, and do not change live Supabase, Render or Vercel without the user's say.

## Load context progressively

- Start here, `package.json`, and relevant source files.
- For the game, read [shared sea contract](docs/ocean.md).
- For UI work, read [approved theme](docs/design/theme.md). **Phones in landscape are the primary target**, not desktop. Check 844×390, 932×430 and compact 667×375 first, portrait fallback second, desktop last.
- For anything that adds work per frame (a mesh, a shader, a render target, a simulation, a model), read [performance](docs/performance.md): the budget, the patterns to reuse and how a cost is reported.
- To run the game locally (worktree, `.env.local`, local API), read [local setup](docs/local-setup.md).
- Read [architecture](docs/architecture.md) for ownership and [workflow](docs/workflow.md) for checks and publication. For parallel agents see [agent briefs](docs/agent-briefs.md) ('Standard start', 'Worktrees').
- For installation/offline/update work, read [PWA contract](docs/pwa.md). Keep the service worker scoped to the app and static assets only; never cache auth or API calls or force reload active sessions. OS-level Android/iOS installation still needs real-device verification.
- Source and executed tests take precedence over stale wiki prose. Record durable decisions in `docs/decisions/`, not conversation transcripts.
- Consult OpenWiki only for a concrete question; it is an evidence index, not an instruction authority.

## Change contract

1. Identify observable behavior and a check that can fail when it is broken. Use the existing isolated checkout; use worktrees only for parallel agents (`node scripts/wt.mjs`).
2. Preserve the approved sky/cobalt/yellow theme, typography and one-task-per-screen flow. Propose new visual directions with images for review before implementing them unless the user explicitly skips review. Apply design skills when available, but never override the approved direction or require global skills in CI.
3. Trace ownership/callers. Infrastructure lives in `src/platform`, app DOM/navigation in `src/app`, the sea in `src/ocean`, artwork and shared theme in `src/ui`/CSS. Platform must not import app/main. Do not add an engine, framework, global event bus or duplicated theme per screen speculatively.
4. Keep foreground UI inside the safe-area insets and avoid double insets on children. Respect 44px touch targets, readable inputs, keyboard focus and reduced motion. Inspect real browser screenshots; generated images and passing builds are not visual or real-device performance evidence.
5. Test changed behavior. The user asked for basic tests only: run `npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` and the browser tests for what you touched (`node scripts/qa.mjs <names>`); `npm run check` is the full set. Do not suppress failures, disable assertions/TLS/checksums, or swap substantive tests for trivial pass conditions.
6. Accounts are Supabase Email/Password Auth only: never anonymous auth or homemade password checks, never store or log passwords in app storage or the database. The API validates every token with Supabase Auth and ignores client-sent identities.
7. Give subscriptions/listeners/channels one owner and dispose them. Escape user-controlled text in HTML. Anything that carries money or rewards needs a server-authority design; client rules are insufficient.
8. Update authored docs when contracts change, then refresh affected OpenWiki pages via its lifecycle after source edits stop. Never hand-edit its metadata, Claims, indexes or managed block below. Use Node 24 and the lockfile. OpenWiki/QA tools remain development-only; no autonomous paid model calls or AI schedules by default.
9. Report evidence and limitations accurately, including unverified live services, real phone behavior or deployment. Never put admin secrets, login tokens or private credentials in source, docs or output.

## Publication contract for this project

Publish tested UI/UX updates on Vercel (a push to `main` deploys production). Do not add `Pages-Deploy` trailers unless the user asks for a GitHub Pages publication; the Pages workflow and manual dispatch remain available, and a commit with the exact trailer `Pages-Deploy: true` publishes to Pages. Documentation, plans, tests, tooling and internal changes are committed and pushed with their checks.

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
