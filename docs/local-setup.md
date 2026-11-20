# Running the game locally (for people and agents)

How to get the real game, signed in and in the shared sea, running from a checkout or a worktree on this Mac, so that you (or the user) can look at a change. This is what cost time before; every step below was tried.

Not covered here: browser tests (`node scripts/qa.mjs`, see [agent briefs](agent-briefs.md) and [workflow](workflow.md)) and the screenshot harness (last section). The user dropped the browser-test step on request; do not run Playwright tests unless asked.

## What you need

- Node 24 and the main checkout's `node_modules` (a worktree symlinks it, never `npm ci` inside one).
- The main checkout's `.env.local` (git ignores it, **a worktree does not have it**). It holds the public frontend values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_AUTH_REDIRECT_URL`. Without the first two the game says the account service is not configured. Copy it into your checkout; never commit it, never print its values, never put an admin key in it.
- A free port (4 digits, each agent its own) and `127.0.0.1`, not `localhost`.

## 1. The frontend

In a worktree made with `node scripts/wt.mjs new <name>`:

```bash
cp ../../web-g-3d/.env.local .env.local          # from the worktree folder; adjust the path
node scripts/wt.mjs preview <name>               # Vite for THAT code, prints the URL
```

`wt.mjs preview` already sets `VITE_FS_ALLOW` and a cache folder. Without `wt.mjs`:

```bash
VITE_FS_ALLOW="$(cd /path/to/main/checkout && pwd)" npx vite --host 127.0.0.1 --port 5320 --strictPort
```

If the Vite log says `The request id ".../node_modules/@fontsource/... is outside of Vite serving allow list"`, the fonts are blocked because `node_modules` is a symlink: set `VITE_FS_ALLOW` to the main checkout path (the page still loads without fonts, but looks wrong).

Edits to the worktree show at once in its page (Vite serves that folder).

## 2. The API (the shared sea)

The sea is a Socket.IO API. `.env.local` may point `VITE_API_URL` at `http://127.0.0.1:10001` (a local API) or at `https://web-g-3d-api.onrender.com`.

**Do not point a local page at Render.** Render allows only the production origin (`ALLOWED_ORIGINS=https://web-g-3d.vercel.app`, see `server/app.mjs` and `server/socket.mjs`), so a websocket from `http://127.0.0.1:<port>` is refused (HTTP 400). Changing Render's settings needs the user's say; do not.

Run a local API instead, with the same public Supabase values and your page's origin allowed:

```bash
set -a; . ./.env.local; set +a
SUPABASE_URL="$VITE_SUPABASE_URL" SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
ALLOWED_ORIGINS="http://127.0.0.1:5320,http://localhost:5320" PORT=10001 node server/index.mjs
```

Then make sure `VITE_API_URL=http://127.0.0.1:10001` in the `.env.local` of your checkout, and restart Vite (Vite reads the file at start). The API only knows the origins you list: list your own port. Check it:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: http://127.0.0.1:5320' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'http://127.0.0.1:10001/socket.io/?EIO=4&transport=websocket'    # 101 means the origin is allowed
```

(A plain GET of `/socket.io/?EIO=4&transport=polling` answers `Transport unknown`: the server is websocket-only, so that is not a test of anything.) The local sea is its own: only you are in it. Account sign-in still goes to the real Supabase project with the user's account, so ask the user to sign in; never type, store or log a password.

## 3. Things that go wrong

| What you see                                        | Cause and fix                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "account service is not configured"                 | `.env.local` missing in the worktree: copy it, restart Vite.                                                                                      |
| Page loads, fonts or look wrong                     | Vite allow list: set `VITE_FS_ALLOW` (above).                                                                                                     |
| Sign-in works, "websocket API failed" / no sea      | API not running, wrong `VITE_API_URL`, or your origin is not in `ALLOWED_ORIGINS` (400 above).                                                    |
| Same worktree stays on old behaviour                | Vite was started before you changed `.env.local`: restart it. PWA cache: hard reload.                                                             |
| The sea looks opaque, nothing shows under the water | The clear-water layer is off: the quality governor switched it off for slow frames (there is no page-address or Settings switch for it any more). |
| Port busy                                           | `lsof -nP -iTCP:<port> -sTCP:LISTEN`; use another port; stop only servers you started.                                                            |

Stop what you started when you are done (`node scripts/wt.mjs stop <name>`, or kill your own `vite` and `node server/index.mjs`). Leave other agents' servers alone (ports 5301 to 5308 are often theirs).

## Frame numbers

Add `?perf` to the page address (or press F3) for the performance panel: fps, gaps, frame cost, pacing mode, render scale, whether the clear-water layer is on. Read it before saying anything about speed; software WebGL numbers say nothing about a phone.

## 4. Looking at the sea without signing in: the screenshot harness

`node scripts/shots.mjs <label> [--out dir] [--cwd <worktree>] [--refl 0] mode,island,angle,seconds` starts its own Vite and a headless browser and draws the sea scene from `tools/render-harness/preview.html`: no login, no API, no other boats, software WebGL (slow, and no frame rate to read). It builds its own scene, so anything added to the real scene (`BabylonScene`) is not in it until `preview.html` is taught about it; the fish schools and the clear-water layer were, for example, missing from it at first and every picture was empty. Page options (via `EXTRA="&..."`): `fish=0`, `fishcam=<metres>` (look at the nearest fish), `daytime=<hour>`, `weather=clear|overcast|rain|fog`. See `tools/render-harness/README.md`.

The harness is not the game: say in your report which one you looked at, and that nothing was seen on a phone.
