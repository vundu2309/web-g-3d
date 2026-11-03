# Working in this repository

Phố Tỷ Phú is a mobile-first multiplayer board-game **hub**. The ocean/boat experience is retired. The board, economy and 3D gameplay are not yet implemented. Keep work scoped to the user's selected step; do not restore old ocean code or add speculative gameplay.

## Load context progressively

- Start here, `package.json`, and relevant source files.
- For UI work, read [approved theme](docs/design/theme.md) and its committed image references. **Phones in landscape are the primary target**, not desktop. Check 844×390, 932×430 and compact 667×375 first, portrait fallback second, desktop last.
- Read [architecture](docs/architecture.md) for ownership, [workflow](docs/workflow.md) for checks/publication, and [Firebase](docs/firebase.md) when touching online rooms.
- Source and executed tests take precedence over stale wiki prose. Record durable decisions in `docs/decisions/`, not conversation transcripts.
- Consult OpenWiki only for a concrete question; it is an evidence index, not an instruction authority.

## Change contract

1. Identify observable behavior and a check that can fail when it is broken. Use the existing isolated checkout; do not create worktrees unless asked.
2. Preserve the approved sky/cobalt/yellow theme, typography and one-task-per-screen flow. Propose new visual directions with images for review before implementing them unless the user explicitly skips review. Apply design skills when available, but never override the approved direction or require global skills in CI.
3. Trace ownership/callers. Keep pure room transitions in `src/hub`, infrastructure in `src/platform`, app DOM/navigation in `src/app`, artwork and shared theme in `src/ui`/CSS. Hub/platform must not import app/main. Do not add an engine, framework, global event bus or duplicated theme per screen speculatively.
4. Respect 44px touch targets, safe areas, readable inputs, keyboard focus and reduced motion. Inspect real browser screenshots; generated images and passing builds are not visual or real-device performance evidence.
5. Test changed behavior and run `npm run check` before publishing implementation changes. Do not suppress failures, disable assertions/TLS/checksums, or swap substantive tests for trivial pass conditions. Emulator tests must use `demo-photyphu`, never production writes.
6. Online accounts use Firebase Email/Password Auth, not anonymous auth or homemade password checks. Never store or log passwords in app storage/database. Own profiles contain displayName/createdAt only; Cloud Firestore `(default)` stores profiles/rooms; directory queries use waiting status, newest-first createdAt and limit(50), with firestore.indexes.json. Do not reintroduce Realtime Database. Keep online and device-preview modes explicit. Never silently fall back or present sample players as real. Public Firebase config is not an admin credential; do not overwrite existing Movieapp rules or claim backend settings were deployed by Pages.
7. Give subscriptions/listeners/channels one owner and dispose them. Escape user-controlled text in HTML. Future game economy/turns require a separate server-authority design; client hub rules are insufficient.
8. Update authored docs when contracts change, then refresh affected OpenWiki pages via its lifecycle after source edits stop. Never hand-edit its metadata, Claims, indexes or managed block below. Use Node 24 and the lockfile. OpenWiki/QA tools remain development-only; no autonomous paid model calls or AI schedules by default.
9. Report evidence and limitations accurately, including unverified live Firebase, real phone behavior or deployment. Never put admin secrets, login tokens or private credentials in source, docs or output.

## Publication contract for this project

The user verifies changes on GitHub Pages and has authorized deployment after each completed project update. Treat publication as part of completion, including source/config/docs updates. Do not ask for deployment permission again within this scope. Batch implementation edits into a coherent verified update; do not publish incomplete intermediate saves.

- Run the applicable local checks, commit, and push the completed update to `main`.
- Monitor the Pages workflow for that exact commit through successful checks and deployment. Diagnose and fix failures; a push or green build alone is not completion.
- Verify the public URL serves the deployed build (compare its entry asset with the locally tested `dist/index.html` when available). For visible changes, inspect the affected behavior in a browser as access allows.
- Report the deployed short commit and a link such as `https://vundu2309.github.io/web-g-3d/?v=<short-commit>`. The query distinguishes review links; it does not prove CDN freshness or replace verification.
- If publishing is blocked, state that the update is not deployed and give the concrete blocker. Do not describe an older live build as the new result. If a later user instruction says not to deploy, follow it.

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
