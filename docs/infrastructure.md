# Vercel, Render and Supabase transition

The migration is staged. Existing Firebase accounts and data remain unchanged. The user selected new registration on Supabase rather than copying old accounts. The frontend selects Supabase only when `VITE_ONLINE_BACKEND=supabase`; existing Pages builds keep Firebase. Supabase email confirmation and password recovery callback still require deployment configuration and end-to-end verification before cutover.

## Rooms and Socket.IO

Render runs `npm run start:api` on Node 24, binding `0.0.0.0:$PORT`. Build with `npm ci`. HTTP mutations validate the Supabase user and forward that user's access token to the transactional RPC. User IDs sent by clients are ignored. Private tables have RLS enabled and no client table grants. The narrowly granted RPC checks `auth.uid()`, host/member access, capacity and readiness itself, so direct RPC calls cannot bypass authorization. Create/join update the profile and room atomically. Room locks serialize concurrent join/start/leave.

Socket.IO uses WebSocket transport. Each subscription authenticates and obtains an authorized snapshot immediately on connect. Mutations commit to PostgreSQL; statement triggers emit `NOTIFY hub_changes` at commit. Every API instance has a dedicated `LISTEN` connection and sends a data-free `hub:changed` invalidation to its own sockets. Clients then request fresh authorized snapshots over Socket.IO. No periodic client polling is used. Socket reads revalidate the user, have bounded payload/rate limits, and never broadcast room contents to nonmembers. Directory entries remain bounded to 50 waiting rooms.

PostgreSQL stores room versions and current state. Socket and database reconnection both invalidate snapshots, recovering missed events without relying on process memory. No cross-instance Socket.IO rooms are used, so each instance listening to the same PostgreSQL channel provides fanout. This is a hub transport, not authoritative gameplay synchronization. Large fanout will need narrower notifications/subscriptions and measured capacity work before scaling.

## Required configuration

See `.env.example`. Frontend receives only publishable values. Render additionally requires secret `DATABASE_URL` for the dedicated notification connection. Use Supabase's direct connection if networking supports it, or its **session pooler on port 5432**; transaction pooling cannot preserve LISTEN. Certificate validation is enforced; URL SSL flags are removed before passing the explicit verified TLS configuration to pg. Use a dedicated login role without table privileges for the notification connection where possible. Do not paste the URL into chat, commits, build artifacts or logs. Configure it directly in Render Environment.

`/health` responds 503 until LISTEN is active, and again while that connection is down. SIGTERM stops sockets, HTTP and the database connection. Free Render instances can sleep; no latency guarantees are claimed.

Vercel Git auto-deployment is disabled in `vercel.json` to keep the project's publication gate. Release a tested deployment explicitly. Keep Pages until replacement Auth, room flow, callbacks and PWA behavior have been verified. Moving origins does not move existing login state or installed PWAs.

## Verification

`npm run test:api` checks HTTP Auth/UID spoofing/origins/error redaction, two real Socket.IO clients, denied access, reconnect snapshots and notification listener lifecycle. SQL regression scenarios in `tests/hub-postgres.sql` run only in a disposable database with Auth fixtures, never against production. Existing Firebase emulator tests remain required for the preserved fallback. A full migration is not complete until actual Render + Supabase flows are verified with separate browser contexts.

The provisioned schema's advisors report only informational findings: private tables deliberately have RLS with no policies, because all table grants are revoked and the authenticated RPC enforces authorization; indexes have not yet served real traffic. Do not add permissive policies to silence these. See [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
