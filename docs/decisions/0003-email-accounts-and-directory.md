# 0003 — Firebase email accounts and discoverable waiting rooms

Status: accepted for implementation.

Use Firebase Authentication Email/Password directly from the browser, retaining custom game-themed forms and GitHub Pages. No additional application server, Cloud Functions or Blaze requirement is introduced for this hub. Password verification/session management belongs to Firebase Auth, never to a local password table or client comparison.

Account UI and account infrastructure have separate owners. Only the infrastructure imports Firebase APIs; the native modal owns its listeners, close/abort behavior and busy state. Account changes invalidate stale room subscriptions/stores. Public own-profile records contain displayName and createdAt only, not email or passwords.

Creating a room adds an immutable title. Joining starts at a separate waiting-room directory, with a direct room-code route retained. A bounded indexed waiting-status query permits signed-in password users to see room titles, host display names, occupancy and lobby data. Private rooms, account profile editing, email verification gates and actual board gameplay are outside this update.

Firebase production provider/database/rules configuration is separate from the deployed frontend. Use isolated Auth+Database emulators to verify full SDK flows without creating cloud test users. Production must not activate emulator mode even when a build environment contains its test variables. Never relax root rules to compensate for missing backend activation or deployment access.

The user subsequently selected Cloud Firestore for future features. Use the existing `(default)` native database, server timestamps, SDK transactions/snapshots, strict document rules and an indexed newest-first waiting-room query. Realtime Database/ETag are retired by this decision. No migration is attempted on unrelated Movieapp data.

On first authorized deployment, the existing project had a global Test-mode allowance expiring 2026-12-03. Preserve that exact outside-hub allowance with an explicit monopolyHub exclusion so it cannot bypass the new game rules. Tests verify unauthenticated hub reads remain denied while an unrelated legacy path keeps its original access.
