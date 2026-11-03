# Development, mobile review and release

Use Node 24 (`.node-version`), npm 11 and the existing checkout. `npm ci` installs the lockfile. `npm run dev` starts Vite; `npm run build` typechecks and builds; `npm run preview` serves production output. On cloud machines with a read-only home use `npm ci --cache /workspace/.npm-cache`. Do not make a worktree unless the user asks.

## Checks

| Command | What it verifies |
| --- | --- |
| `npm run lint` | TypeScript rules and hub/platform import boundaries |
| `npm run format:check` | Authored executable formatting |
| `npm run test:unit` | Room validation, capacity, immutable snapshots, readiness/start permissions, leave/seat reuse |
| `npm run build` | Strict TypeScript and production asset generation |
| `npm run test:browser` | Owned dev/preview servers; create/join/errors, two preview clients, reload, ready/start/close, mobile layout, Auth error |
| `npm run test:rules` | Real RTDB emulator allow/deny tests, including malicious direct writes; needs Java 21 |
| `npm run check` | Lint, format, unit, build, browser and rules tests |

Browser tests use `CHROMIUM_PATH`, system `/usr/bin/chromium`, or the Playwright-managed browser. Install the managed browser with `npx --no-install playwright-core install --with-deps chromium` if needed. The runner starts servers on free ports and owns their cleanup. Failure output and screenshots belong under ignored `test-results/`; tests must not leave a user-owned server running or use live Firebase writes.

## Mobile-first visual acceptance

[Approved theme and image references](design/theme.md) are the visual contract. Inspect actual home, create, join and lobby screenshots first at **844×390 and 932×430**, with 667×375 as compact coverage. Check 390×844 portrait fallback and then 1440×900 desktop. Confirm no horizontal overflow, 44px touch controls, 16px form text, safe area padding, focus, escaped long names and readable disabled explanations. Core lobby actions/status should fit horizontal phones; forms must still scroll when the OS keyboard is open. Test on a real phone before making performance or keyboard claims: browser emulation does not reproduce all Safari/Android behavior.

Do not equate a generated image, build or screenshot with complete usability approval. Record simplifications from the concept honestly; never add unrelated visual styles without review.

## Release to GitHub Pages

The user reviews completed changes on Pages and authorizes deployment after project updates. Run applicable checks, commit the coherent update and push `main`; do not ask again for permission. `.github/workflows/pages.yml` runs checks on PRs/main/manual dispatch and publishes `dist` only after success. No deployment of Firebase rules/settings is included.

Monitor the exact commit's Actions run through deployment, not merely a green build or successful push. Compare the public entry asset with tested `dist/index.html` and inspect the public mobile interface where possible. Send `https://vundu2309.github.io/web-g-3d/?v=<short-commit>` with the deployed short SHA. The query is a review identifier, not proof of CDN freshness. If blocked, report the exact blocker and distinguish the older live version.

## Context maintenance

Update authored docs when contracts change. Finish source edits before refreshing affected OpenWiki pages via its installed lifecycle; never hand-edit managed metadata, Claims or indexes. No model-token spending or autonomous wiki CI is enabled. `AGENTS.md` is the single agent entrypoint; do not duplicate divergent instructions across agent-specific files.
