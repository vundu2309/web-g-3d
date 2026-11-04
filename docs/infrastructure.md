# Vercel, Render and Supabase transition

The migration is staged. Existing Firebase accounts and data remain unchanged. The user selected new registration on Supabase rather than copying old accounts. The frontend selects Supabase only when `VITE_ONLINE_BACKEND=supabase`; existing Pages builds keep Firebase. Email confirmation and the password recovery dialog are implemented. The isolated full-stack test covers actual GoTrue email confirmation/recovery, login, password update and session persistence. Configure the public production redirect URL in Supabase before cutover; preview builds can use VITE_AUTH_REDIRECT_URL to keep email callbacks at that approved origin.

## Rooms and Socket.IO

Render runs `npm run start:api` on Node 24, binding `0.0.0.0:$PORT`. Build with `npm ci`. HTTP mutations validate the Supabase user and forward that user's access token to the transactional RPC. User IDs sent by clients are ignored. Private tables have RLS enabled and no client table grants. The narrowly granted RPC checks `auth.uid()`, host/member access, capacity and readiness itself, so direct RPC calls cannot bypass authorization. Create/join update the profile and room atomically. Room locks serialize concurrent join/start/leave.

Socket.IO uses WebSocket transport. Each subscription authenticates and obtains an authorized snapshot immediately on connect. Mutations commit to PostgreSQL; statement triggers emit `NOTIFY hub_changes` at commit. Every API instance has a dedicated `LISTEN` connection and sends a data-free `hub:changed` invalidation to its own sockets. Clients then request fresh authorized snapshots over Socket.IO. No periodic client polling is used. Socket reads revalidate the user, have bounded payload/rate limits, and never broadcast room contents to nonmembers. Directory entries remain bounded to 50 waiting rooms.

PostgreSQL stores room versions and current state. Socket and database reconnection both invalidate snapshots, recovering missed events without relying on process memory. No cross-instance Socket.IO rooms are used, so each instance listening to the same PostgreSQL channel provides fanout. This is a hub transport, not authoritative gameplay synchronization. Large fanout will need narrower notifications/subscriptions and measured capacity work before scaling.

## Required configuration

See `.env.example`. Frontend receives only publishable values. Render additionally requires secret `DATABASE_URL` for the dedicated notification connection. Use Supabase's direct connection if networking supports it, or its **session pooler on port 5432**; transaction pooling cannot preserve LISTEN. Certificate validation is enforced; URL SSL flags are removed before passing the explicit verified TLS configuration to pg. Use a dedicated login role without table privileges for the notification connection where possible. Do not paste the URL into chat, commits, build artifacts or logs. Configure it directly in Render Environment.

`/health` responds 503 until LISTEN is active, and again while that connection is down. SIGTERM stops sockets, HTTP and the database connection. Free Render instances can sleep; no latency guarantees are claimed.

Vercel Git auto-deployment is disabled in `vercel.json` to keep the project's publication gate. Release a tested deployment explicitly. Keep Pages until replacement Auth, room flow, callbacks and PWA behavior have been verified. Moving origins does not move existing login state or installed PWAs.

## Verification

`npm run test:api` checks HTTP Auth/UID spoofing/origins/error redaction, two real Socket.IO clients, denied access, reconnect snapshots and notification listener lifecycle. SQL regression scenarios in `tests/hub-postgres.sql` run only in a disposable database with Auth fixtures, never against production. Existing Firebase emulator tests remain required for the preserved fallback. The two-browser full-stack regression runs actual GoTrue, PostgREST and PostgreSQL in disposable Docker containers, a local SMTP sink and the real Node/Socket.IO server. It covers signup/email confirmation, create/join/readiness, reconnect/reload, start/host-close, recovery email/callback, mismatched passwords, password change, old-password rejection and login persistence. No external emails or production fixture writes are used. The deployed API health/Auth rejection checks are separate evidence; delivery to external mailboxes remains a provider integration check.

The provisioned schema's advisors report only informational findings: private tables deliberately have RLS with no policies, because all table grants are revoked and the authenticated RPC enforces authorization; indexes have not yet served real traffic. Do not add permissive policies to silence these. See [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).


The notification connection explicitly trusts the public Supabase Root 2021 CA in `server/supabase-root-ca.crt` (downloaded over verified HTTPS from Supabase's certificate distribution bucket). Certificate and hostname validation stay enabled. The root expires in April2031; update it from the provider before expiry or a provider CA rotation. A missing trust root causes a closed/not-ready connection rather than bypassing TLS verification.


## Frontend release

Vercel receives VITE_ONLINE_BACKEND=supabase, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_URL and VITE_AUTH_REDIRECT_URL. All are public; never put DATABASE_URL in Vercel or a VITE_ variable. User confirmed Auth Site URL and redirect allowlist for https://web-g-3d.vercel.app. New accounts are required; old Firebase accounts/rooms remain intact. Room restore uses a provider-specific sessionStorage key so old Firebase room identifiers are not sent to the new backend. Demo mode remains explicit and local.

`npm run test:supabase` requires the local Docker daemon and is also run in CI. Its images and ephemeral test users/databases/mail are owned by the runner and removed on exit. The default `npm run check` continues to cover the legacy Firebase build and UI. Preview origins must be added exactly to Render ALLOWED_ORIGINS; CORS is not authorization.


Socket handshake errors distinguish expired/invalid Auth from temporary service readiness. The browser retries transient middleware rejection with bounded backoff, refreshes credentials after token refresh and forces a fresh snapshot on reconnect so a stale connection error cannot remain after recovery. These are connection retries, not polling room state.
