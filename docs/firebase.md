# Firebase online hub

The existing public web configuration targets `movieapp-fa2d4`. No Analytics or unrelated Movieapp data is read or written by the hub. All room data is namespaced under `/monopolyHub/v1/rooms`.

## Current deployment boundary

GitHub Pages serves the frontend only. Firebase backend activation/rules deployment requires project administrator access, which is not supplied by a public web app config or by GitHub push access. A read-only check during implementation returned: `The Firebase database 'movieapp-fa2d4-default-rtdb' has been deactivated.` Do not call cross-device online play verified until the backend is re-enabled and a real two-device check succeeds.

## Enable online play

1. In [Realtime Database](https://console.firebase.google.com/project/movieapp-fa2d4/database), reactivate the existing database or create it if necessary. If its URL changes, update the public config in `src/platform/firebase.ts`.
2. In [Authentication providers](https://console.firebase.google.com/project/movieapp-fa2d4/authentication/providers), enable **Anonymous** sign-in. The SDK signs in lazily when creating/joining, not at page load. Add `vundu2309.github.io` to Authentication's authorized domains if required for enabled providers; keep only host names in the Console domain list.
3. Review existing database rules first. Merge the `monopolyHub` subtree from `database.rules.json` into the project's existing rules, preserving protections for Movieapp and other users. Never replace unrelated rules with this standalone deny-by-default file blindly. If this database is dedicated to the hub, the standalone file can be deployed using `npx --no-install firebase deploy --only database --project movieapp-fa2d4` from an authorized Firebase CLI session. Do not deploy with a test-mode/open `.write` rule.
4. Open the deployed Pages URL on two separate devices/profiles. Create a room, join by code, toggle guest ready, verify host's start state, refresh each device, then leave/close. Verify a full room and unready start are rejected. Do not use sample users to claim a live test.

The web API key and app IDs are public identifiers. They are not enough to activate services, change rules or perform administrator operations. Keep any administrator identity in the platform's secure credential configuration, never in chat/source.

## Local automated validation

Use Node 24 and Java 21. `npm ci` installs pinned tools. `npm run test:rules` verifies the official emulator JAR checksum/size, starts a Database emulator with project `demo-photyphu`, runs allow/deny cases, then stops it. No cloud write or login is needed.

On managed environments with a read-only home, set `FIREBASE_EMULATORS_PATH=/workspace/.firebase-emulators` and `XDG_CONFIG_HOME=/workspace/.firebase-config`; those are caches/config outside the repository. The saved cloud setup uses these supported overrides without changing `$HOME` or disabling downloads/checksums.

The runner starts its own Java process and loopback REST tests because the CLI/Node WebSocket SDK proxy handling ignores localhost exclusions in managed environments. Remote downloads still use inherited proxy and CA settings; no TLS/checksum bypass is used.

The emulator is a test service, not a replacement production deployment. UI browser tests exercise two same-browser preview clients and a controlled Auth error. Emulator security tests exercise actual allow/deny decisions. Report these separately from live Firebase validation.

## Known hub limits

No automatic presence detection, host migration, abandoned-room cleanup, matchmaking, chat, board or server-authoritative game engine. A user who closes a tab can reconnect to its last room; an unready abandoned guest can block start until the group creates another room. Do not add client-side permission bypasses to mask those limits.
