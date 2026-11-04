# Development, mobile review and release

Use Node 24 (`.node-version`), npm 11 and the existing checkout. `npm ci` installs the lockfile. `npm run dev` starts Vite; `npm run build` typechecks and builds; `npm run preview` serves production output. On cloud machines with a read-only home use `npm ci --cache /workspace/.npm-cache`. Do not make a worktree unless the user asks.

## Checks

| Command | What it verifies |
| --- | --- |
| `npm run lint` | TypeScript rules and hub/platform import boundaries |
| `npm run format:check` | Authored executable formatting |
| `npm run test:unit` | Room transitions plus diagnostic timing, safe errors and bounded history |
| `npm run build` | Strict TypeScript and production asset generation |
| `npm run test:browser` | Owned dev/preview servers; create/join/errors, two preview clients, reload, ready/start/close, mobile layout, Auth error |
| `npm run test:rules` | Firestore rules plus real Auth/Firestore emulator browser accounts, profiles and directory; needs Java 21 |
| `npm run check` | Lint, format, unit, build, browser and rules tests |

Browser tests use `CHROMIUM_PATH`, system `/usr/bin/chromium`, or the Playwright-managed browser. Install the managed browser with `npx --no-install playwright-core install --with-deps chromium` if needed. The runner starts servers on free ports and owns their cleanup. Failure output and screenshots belong under ignored `test-results/`; tests must not leave a user-owned server running or use live Firebase writes. The auth browser scenario starts on a dedicated DEV-only emulator configuration and aborts any production Firebase request.

## Mobile-first visual acceptance

[Approved theme and image references](design/theme.md) are the visual contract. Inspect actual home, create, join and lobby screenshots first at **844×390 and 932×430**, with 667×375 as compact coverage. Check 390×844 portrait fallback and then 1440×900 desktop. Confirm no horizontal overflow, 44px touch controls, 16px form text, safe area padding, focus, escaped long names and readable disabled explanations. Core lobby actions/status should fit horizontal phones; forms must still scroll when the OS keyboard is open. Test on a real phone before making performance or keyboard claims: browser emulation does not reproduce all Safari/Android behavior.

Do not equate a generated image, build or screenshot with complete usability approval. Record simplifications from the concept honestly; never add unrelated visual styles without review.

## Release to GitHub Pages

Deploy only for changes affecting UI/UX: visuals, navigation, interaction, accessibility or player-visible behavior. Documentation/plans, tests, tooling and internal changes without UI/UX impact are committed/pushed and checked, without redeploying Pages. Judge behavior rather than file paths.

For a UI/UX update, include the exact commit trailer `Pages-Deploy: true`. The Pages workflow checks PRs/main/manual dispatch; a push publishes only when its pushed commit range contains that trailer. Manual dispatch is an explicit publication request. PRs never publish. Do not mark documentation-only commits. Backend rules/indexes and Auth settings are not deployed by Pages.

When publication is required, monitor the exact SHA through deployment, compare the public entry asset with tested `dist/index.html`, and inspect the changed UI where possible. Send the deployed SHA and `https://vundu2309.github.io/web-g-3d/?v=<short-commit>`. For other updates report the pushed SHA/checks and intentional absence of deployment, without claiming that SHA is live. Do not ask again for permission within the authorized UI/UX scope.

## Context maintenance

Update authored docs when contracts change. Finish source edits before refreshing affected OpenWiki pages via its installed lifecycle; never hand-edit managed metadata, Claims or indexes. No model-token spending or autonomous wiki CI is enabled. `AGENTS.md` is the single agent entrypoint; do not duplicate divergent instructions across agent-specific files.

## Investigating room latency

Use the opt-in [timing panel](diagnostics.md) on the affected phone before attributing slow create/join operations to billing or region. No production timing is inferred from emulator tests.

## HUD preview checks

The browser runner also exercises `tests/game-ui-browser.mjs` and `tests/board-browser.mjs` against dev and production builds. The board suite checks a single WebGL context across redraws, Focus/Overview gestures, resize, context loss and the flat fallback; unit geometry lives in `tests/board-layout.test.mjs`. It checks the 24 scenario layouts at landscape phone sizes, no observer actions, fixed-step bids, touch-only trade controls, active-turn/respondent markers and local offline/reload behavior. The route is a local UI preview with no production Firebase requests; it is not a real multiplayer game test. See [HUD implementation](game/ui-implementation.md).

## PWA checks

`npm run build` generates a versioned static-shell worker. The browser suite additionally runs `tests/pwa-browser.mjs` on a dedicated local server under the Pages subpath, testing offline reload, install handler/guide, API cache exclusion and waiting-worker updates. See [PWA](pwa.md). Native OS install is not covered by synthetic browser events.

## Safe-area regression

`tests/safe-area-browser.mjs` runs on dev and production in the browser runner: all24 HUD scenarios with asymmetric left/right and bottom inset profiles, touch-target reachability and portrait dialog bounds. It overrides shared CSS inset tokens to simulate cutouts; real Android/iOS browser and installed-app verification remains necessary.

PWA update regression also covers cancelling confirmation, rejecting apply with another scoped window, and a single confirmed reload after that window closes. Waiting updates never reload automatically.
