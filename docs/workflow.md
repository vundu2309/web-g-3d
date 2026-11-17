# Development, mobile review and release

Use Node 24 (`.node-version`), npm 11 and the existing checkout. `npm ci` installs the lockfile. `npm run dev` starts Vite; `npm run build` typechecks and builds; `npm run preview` serves production output. On cloud machines with a read-only home use `npm ci --cache /workspace/.npm-cache`. Make a worktree only for parallel agent work, with `node scripts/wt.mjs` (see [agent briefs](agent-briefs.md)); the user authorised this on 2026-11-16.

## Checks

The user asked for basic tests only (2026-11-16): the fast checks always, the browser tests for what a change touches.

| Command                | What it verifies                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | TypeScript rules and the platform-does-not-import-app boundary                                             |
| `npm run format:check` | Authored executable formatting                                                                             |
| `npm run test:unit`    | Sea rules, physics, models, economy client, update check, the account-configuration error                  |
| `npm run build`        | Strict TypeScript and production asset generation                                                          |
| `npm run test:browser` | Owned dev/preview servers: the harbor, the sea scenes, fishing, markets, resume, sign-up, multiplayer, PWA |
| `npm run test:api`     | `/health`, the Socket.IO Auth gate and the shared-sea protocol                                             |
| `npm run check`        | Lint, format, unit, build, browser and API tests                                                           |

For one-off browser runs use `node scripts/qa.mjs <names>` (see [agent briefs](agent-briefs.md)); it serves the checkout with fake Supabase settings and reruns a failing test alone. A browser test that opens the sea needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the server's environment (the sea refuses to start without them); `scripts/qa.mjs` and `scripts/test-browser.mjs` set fakes.

**CI scope:** the GitHub workflow runs `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm run test:unit` (plus `npm run build` when publishing Pages). Browser and API tests are not run in CI; the scripts remain available to run locally (the browser tests need Chrome and are slow under software WebGL). `tests/harbor-browser.mjs` was already failing on `main` before the removal (its loading-step assertion); `ocean-babylon` and `ocean-fishing` have timing checks that are flaky under software WebGL.

Browser tests use `CHROMIUM_PATH`, system `/usr/bin/chromium`, or the Playwright-managed browser. Install the managed browser with `npx --no-install playwright-core install --with-deps chromium` if needed. The runner starts servers on free ports and owns their cleanup. Failure output and screenshots belong under ignored `test-results/`; tests must not leave a user-owned server running or write to live services.

## Mobile-first visual acceptance

[Approved theme and image references](design/theme.md) are the visual contract. Inspect actual harbor, sign-in, loading and sea screenshots first at **844×390 and 932×430**, with 667×375 as compact coverage. Check 390×844 portrait fallback and then 1440×900 desktop. Confirm no horizontal overflow, 44px touch controls, 16px form text, safe area padding, focus, escaped long names and readable disabled explanations. Core actions should fit horizontal phones; forms must still scroll when the OS keyboard is open. Test on a real phone before making performance or keyboard claims: browser emulation does not reproduce all Safari/Android behavior.

Do not equate a generated image, build or screenshot with complete usability approval. Record simplifications from the concept honestly; never add unrelated visual styles without review.

## Release to GitHub Pages

Deploy only for changes affecting UI/UX: visuals, navigation, interaction, accessibility or player-visible behavior. Documentation/plans, tests, tooling and internal changes without UI/UX impact are committed/pushed and checked, without redeploying Pages. Judge behavior rather than file paths.

For a UI/UX update, include the exact commit trailer `Pages-Deploy: true`. The Pages workflow checks PRs/main/manual dispatch; a push publishes only when its pushed commit range contains that trailer. Manual dispatch is an explicit publication request. PRs never publish. Do not mark documentation-only commits. Backend rules/indexes and Auth settings are not deployed by Pages.

When publication is required, monitor the exact SHA through deployment, compare the public entry asset with tested `dist/index.html`, and inspect the changed UI where possible. Send the deployed SHA and `https://vundu2309.github.io/web-g-3d/?v=<short-commit>`. For other updates report the pushed SHA/checks and intentional absence of deployment, without claiming that SHA is live. Do not ask again for permission within the authorized UI/UX scope.

## Context maintenance

Update authored docs when contracts change. Finish source edits before refreshing affected OpenWiki pages via its installed lifecycle; never hand-edit managed metadata, Claims or indexes. No model-token spending or autonomous wiki CI is enabled. `AGENTS.md` is the single agent entrypoint; do not duplicate divergent instructions across agent-specific files.

## PWA checks

`npm run build` generates a versioned static-shell worker. The browser suite additionally runs `tests/pwa-browser.mjs` on a dedicated local server under the Pages subpath, testing offline reload, install handler/guide, API cache exclusion and waiting-worker updates. See [PWA](pwa.md). Native OS install is not covered by synthetic browser events.

## Safe-area and PWA updates

The PWA update regression covers cancelling confirmation, rejecting apply with another scoped window, and a single confirmed reload after that window closes. Waiting updates never reload automatically. Safe-area insets are CSS tokens; simulated cutouts do not replace a real Android/iOS check.

## Shared-sea verification

The default route is the fishing harbor. `npm run check` covers pure movement/remote-payload tests, real Socket.IO sea tests and the browser scenes; inspect `test-results/ocean-*.png` as actual rendering evidence. Release the tested backend sea handlers to the Render API with one instance before promoting a frontend that needs them. OpenWiki lifecycle tools must be available to refresh generated pages; do not fabricate a successful refresh or hand-edit managed metadata when unavailable.
