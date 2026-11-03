# Development and agent verification

Use Node 24 (`.node-version`) and npm 11. Install dependencies with `npm ci`. OpenWiki and QA tools are development dependencies; the browser application imports neither.

## Commands

| Command | Evidence |
| --- | --- |
| `npm run dev` | Starts interactive Vite development server |
| `npm run lint` | TypeScript lint and selected import boundaries |
| `npm run format:check` | Formatting of authored executable source/config |
| `npm run test:unit` | CPU displaced-wave inversion and zero-strength invariants |
| `npm run build` | Strict type check and production bundle |
| `npm run test:browser` | Starts owned ephemeral dev/preview servers and runs ocean + physics on dev, ocean on production; requires a current build |
| `npm test` | Unit tests, build, then self-contained browser checks |
| `npm run check` | Lint, formatting and all of the above tests |

Browser tests use `CHROMIUM_PATH` if given, system Chromium if installed, otherwise the Playwright-managed browser. Install the last option with `npx --no-install playwright-core install --with-deps chromium`. No API key is needed. Server startup/cleanup belongs to `scripts/test-browser.mjs`; it uses free ports, propagates child failures, and closes its own servers. Lower-level `test:ocean`/`test:smoke` commands still support manual servers through `TEST_BASE_URL`.

## Definition of done

Establish the intended behavior before editing. Run focused checks while iterating; run `npm run check` once the implementation is stable. Documentation-only edits need link/content review rather than an unrelated graphics suite. Report exact failures and any checks not run.

For shader, model, camera or UI changes, compare actual game frames and motion before/after at the same camera/viewport. Inspect both 1440×900 and 390×844, rough and calm water, console errors, horizon seams and near-surface detail. Review foam for contact plausibility. Save useful images/clips outside the checkout or under an ignored artifact directory; do not commit generated screenshots by default. Do not claim realism or mobile FPS based only on a screenshot or software-WebGL smoke test.

The ocean smoke checks loading, controls, changing canvas pixels, errors and dimensions. Physics smoke advances the separate Havok playground for 600 steps and checks ground collision, bounded bodies and scene disposal. These checks complement visual review; neither proves complete gameplay correctness.

## CI and release

The Pages workflow runs `npm run check` on pull requests and pushes to `main`, installing Chromium first. PRs verify without deploying. Successful main/manual runs upload `dist` and deploy Pages. This is automatic deployment from main; pushing an approved change publishes it. Run checks before that push and monitor the resulting workflow.

GitHub branch protection is a separate repository setting. A workflow file does not guarantee that merges require its status; do not claim that protection has been enabled without checking settings. This project does not automatically spend model tokens or regenerate wiki in CI. The generated standalone OpenWiki schedule is intentionally Git-ignored pending separate provider configuration.

## Keep context current

Update authored architecture/decision docs when a contract changes. Use the installed OpenWiki lifecycle for affected generated pages and Claims. For unrelated questions, retrieve only the necessary section. Store durable facts, evidence and decisions, not conversation transcripts, secrets or speculative plans.
