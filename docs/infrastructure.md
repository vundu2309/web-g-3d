# Vercel, Render and Supabase

The user selected Vercel (frontend/PWA), Render (API) and Supabase (Auth/PostgreSQL) ([decision 0006](decisions/0006-infrastructure-transition.md)). Firebase and the Monopoly rooms were removed on 2026-11-16 ([decision 0012](decisions/0012-remove-firebase-and-monopoly.md)); old Firebase accounts are not reachable from the app, and players register on Supabase.

## What runs where

- **Vercel**: the Vite build and the PWA. Git auto-deployment is enabled: a push to `main` deploys production, other branches and PRs get previews (add preview origins to Render `ALLOWED_ORIGINS` if previews must reach the API). Moving origins does not move login state or installed PWAs.
- **Supabase**: Email/Password Auth, and PostgreSQL for the economy (`economy_private` behind three authenticated RPCs, see [decision 0010](decisions/0010-server-economy.md)).
- **Render** `web-g-3d-api`: `npm run start:api` on Node 24, binding `0.0.0.0:$PORT`, build with `npm ci`, auto-deploys every commit on `main`. It serves `/health` and Socket.IO over WebSocket. It checks every token against Supabase Auth (`/auth/v1/user`); it reads no database and has no `DATABASE_URL`. `/health` answers 200 as soon as the process runs. SIGTERM closes sockets and HTTP.

Free Render instances sleep; no latency guarantees are claimed. `.github/workflows/keep-api-awake.yml` pings `/health` every 5 minutes (repository variable `API_HEALTH_URL` overrides the URL); GitHub delays scheduled runs and disables them after 60 days without repository activity, so it is best effort, and a paid instance is the reliable fix. The client also nudges the API while the harbor shows (`src/platform/wake.ts`).

## Configuration

See `.env.example`. The frontend (Vercel) gets only public values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_AUTH_REDIRECT_URL` and, for the market, `VITE_ECONOMY=on`. Without the first two the harbor says the account service is not configured; without `VITE_API_URL` the sea says the connection is not configured; nothing falls back. Render gets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `ALLOWED_ORIGINS` (exact origins; CORS is not authorization). Never put an admin or service key in a `VITE_*` variable, source or docs. The Auth Site URL and redirect allowlist for `https://web-g-3d.vercel.app` are saved in Supabase; preview builds can set `VITE_AUTH_REDIRECT_URL` to keep email callbacks at an approved origin.

## Shared sea

`ocean:*` handlers use the authenticated Socket.IO connection and keep one ephemeral boat per account in **one API instance**. There is no SQL migration, table grant or client polling for it. Do not scale this sea across API instances until shared simulation/broadcast exists. A restart clears sea state; players return to the harbor and re-enter. See [contract and verification](ocean.md). Socket handshake errors distinguish expired/invalid Auth (`AUTH_REQUIRED`) from a temporary service state (`SERVICE_UNAVAILABLE`); the browser retries transient rejection with bounded backoff and refreshes credentials after a token refresh.

## Sign-up and email confirmation

Whether a new account must confirm its email is a Supabase Auth project setting (Authentication > Providers > Email > "Confirm email"), not application code. The client handles both: with confirmation off, `signUp` returns a session and the dialog closes straight into the game; with it on, the dialog shows a "Kiểm tra email của bạn" step (address shown as text, **Gửi lại email**, and a sign-in button that only succeeds once the link was used). `tests/account-signup-browser.mjs` covers both settings with a faked Auth API. The built-in Supabase mailer is rate limited to a few emails per hour, which also blocks sign-ups while confirmation is on. Turning confirmation off removes proof that an email address belongs to the person registering with it, and password recovery then sends to an unverified address.

## Verification

`npm run test:api` checks `/health`, the origin refusal, the Socket.IO Auth gate (invalid token, wrong origin, unavailable service) and the shared-sea protocol with real Socket.IO clients. `tests/economy-postgres.sh` runs the economy SQL scenarios in a disposable PostgreSQL (needs a superuser connection to a throwaway server, never production). Browser tests answer Supabase with fakes. The deployed API health and Auth rejection are separate evidence; delivery of confirmation emails to real mailboxes is a provider integration check nobody has run from here.

The Supabase advisors report only informational findings for the private schemas: private tables deliberately have RLS with no policies, because all table grants are revoked and the authenticated RPCs enforce authorization. Do not add permissive policies to silence these.
