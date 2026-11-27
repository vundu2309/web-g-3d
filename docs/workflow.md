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

For one-off browser runs use `node scripts/qa.mjs <names>` (see [agent briefs](agent-briefs.md)); it serves the checkout with fake Supabase settings and reruns a failing test alone. A failing run's whole output is printed. `node scripts/qa.mjs --changed` runs only the tests that fit the files changed since `origin/main` (`--base <ref>` for another base, `--list` to only name them): the table in `scripts/lib/qa-select.mjs` maps a source file to its tests, and a source, server, test-support or build file with no row runs the `ocean` group, and a shared file can name the group and the tests outside it. The PWA test is only named, never picked: run `node scripts/qa.mjs pwa`. Add a row when a test starts to cover a file. The `ocean` group does not hold every browser test (not `ocean-map` or `ocean-patrol`, for example); `npm run test:browser` runs more of them. A browser test that opens the sea needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the server's environment (the sea refuses to start without them); `scripts/qa.mjs` and `scripts/test-browser.mjs` set fakes.

**Faster browser tests.** Booting the sea under software WebGL takes 10 to 15 s, and most browser tests boot it once or more. A test that checks several screen sizes should boot it once and resize the page (`page.setViewportSize`) instead of booting it for each size (`ocean-map` did, four times). A test that does not look at the water's reflection, the fish, the island props, the big boats, the cats, the seaplanes, the shipyards or the render resolution can add `FAST_SEA` from `tests/support/fast-sea.mjs` to its page address (the probe switches of `src/ocean/probe.ts`). Measured on `ocean-map` on 2026-11-26 with the machine busy: 75 and 92 s became 48 and 52 s with `FAST_SEA` and 33 and 34 s with one boot as well; the test still fails when the tap that opens the map is disabled and when an assertion is wrong only at the last size. `ocean-map`, `ocean-presence`, `ocean-book`, `ocean-rank` and `ocean-server-store` use it (the last four on 2026-11-26, one run each, 28→24, 69→59, 71→46 and 28→20 s); do not add it to a test whose assertions touch any of those features. In a test, do not give `page.waitForFunction` an `async` predicate: the promise counts as true and the wait checks nothing (seen with playwright-core 1.64.1). Poll `page.evaluate` instead.

**CI scope:** the GitHub workflow runs `npm run lint`, `npm run format:check`, `npm run typecheck` and `npm run test:unit` (plus `npm run build` when publishing Pages). A second workflow, `work-record.yml`, runs the work record check (see "Enforced checks"). Browser and API tests are not run in CI; the scripts remain available to run locally (the browser tests need Chrome and are slow under software WebGL). `tests/harbor-browser.mjs` was already failing on `main` before the removal (its loading-step assertion); `ocean-babylon` and `ocean-fishing` have timing checks that are flaky under software WebGL.

Browser tests use `CHROMIUM_PATH`, system `/usr/bin/chromium`, or the Playwright-managed browser. Install the managed browser with `npx --no-install playwright-core install --with-deps chromium` if needed. The runner starts servers on free ports and owns their cleanup. Failure output and screenshots belong under ignored `test-results/`; tests must not leave a user-owned server running or write to live services.

## Enforced checks

These hold without anybody remembering them (decision 0023, step 3).

- **Work record, in CI.** `node scripts/check-work-record.mjs <base> [head]` looks at the commits of `base..head` (merge commits skipped). If one changes a file under `src/`, `server/`, `supabase/`, `tests/` or `scripts/`, the range must add or change a file in `docs/work/` (not `_template.md` or `README.md`), or that commit's message must hold a line `No work record: <reason>`. Run it before a push with `node scripts/check-work-record.mjs origin/main`. `.github/workflows/work-record.yml` runs it on pushes to `main` (the pushed range) and on pull requests (against the base the pull request is merged into). Limits: it runs after the push and stops neither Vercel nor a Pages publication; it sees that a record was touched, not that it is true or about this change; one record covers the whole range; conflict edits in merge commits and files outside those folders are not looked at. A red run is not turned green by a later push: the record is added then and that push is checked on its own.
- **Format hook.** `.claude/settings.json` runs `scripts/hooks/format-edited.mjs` after Claude Code's Edit and Write: files in the scope of `npm run format` are formatted, in the worktree that holds them. Files changed by shell commands are not.
- **Force push refused.** Two layers in the same file. Deny rules refuse the plain forms that begin with `git push` (`--force`, `--force-with-lease`, `-f`, a `+refspec`). A hook before each Bash command, `scripts/hooks/refuse-force-push.mjs`, reads the command word by word and also refuses grouped flags (`-uf`, `-qf`), `--mirror`, shortened long options, `git -C`/`-c` forms, and a push later in a compound command or inside `$(...)`, while a commit message that only mentions a force push passes. Neither is a security boundary: a push inside a string that another program runs (`bash -c`, `eval`), an alias, a variable, a script file or unusual shell syntax is not seen, deleting a remote branch (`--delete`, `:branch`) is not refused, and the hook does nothing if Node or the script is missing or the command is too odd to read. Only branch protection on GitHub refuses it for everyone; it is the owner's setting and was not changed.

A session reads these files from the checkout it was started in. A branch or worktree that does not hold them yet has neither the hook nor the rules until it takes `main`.

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

`npm run build` generates a versioned static-shell worker. `tests/pwa-browser.mjs` makes its own production build into `test-results/pwa/dist` with every account setting empty (with accounts, offline `?view=ocean` opens the sign-in dialog), so it needs no `npm run build` and ignores a `.env.local`. The browser suite additionally runs `tests/pwa-browser.mjs` on a dedicated local server under the Pages subpath, testing offline reload, install handler/guide, API cache exclusion and waiting-worker updates. See [PWA](pwa.md). Native OS install is not covered by synthetic browser events.

## Safe-area and PWA updates

The PWA update regression covers cancelling confirmation, rejecting apply with another scoped window, and a single confirmed reload after that window closes. Waiting updates never reload automatically. Safe-area insets are CSS tokens; simulated cutouts do not replace a real Android/iOS check.

## Shared-sea verification

The default route is the fishing harbor. `npm run check` covers pure movement/remote-payload tests, real Socket.IO sea tests and the browser scenes; inspect `test-results/ocean-*.png` as actual rendering evidence. Release the tested backend sea handlers to the Render API with one instance before promoting a frontend that needs them. OpenWiki lifecycle tools must be available to refresh generated pages; do not fabricate a successful refresh or hand-edit managed metadata when unavailable.
