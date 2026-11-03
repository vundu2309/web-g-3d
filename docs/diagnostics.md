# Measuring slow create/join operations

Open the Pages URL with `?diagnostics=1`, sign in normally, then create or join a room. Tap **Chẩn đoán thời gian** and **Sao chép kết quả** to share the timing report. Close the panel to continue. Without the query flag there is no panel, trace recording or additional token preflight.

Each operation starts after form validation or selecting a listed room. It ends after the first room snapshot and two animation-frame callbacks, or on failure. Login form time, initial page load and browsing the directory are outside this scope. The panel keeps the last five operations in memory only; reload clears them. There is no automatic upload or persistence. Reports contain stage names, durations, mode, callback counts and restricted error codes, never player names, emails, passwords, tokens, UIDs or room identifiers.

## Reading the result

- SDK: dynamic import/initialization wait; a reused store is marked cached. Assets may already be warm after login or directory browsing.
- Session: waiting for restored/current Firebase identity. Store initialization and transaction entry can each produce a sample.
- Token: diagnostics explicitly checks `getIdToken()` before the transaction. This may warm or refresh the token and slightly change diagnostic timing. It is not a measurement of all internal Auth traffic.
- Room/player reads: independent transaction reads run in parallel. Player reads may be skipped after a successful profile synchronization.
- Transaction: total Firestore SDK transaction duration, including reads, commit and SDK retries.
- Commit / retry wait: time between returning the transaction callback and resolution or the next callback. This includes SDK scheduling, network, acknowledgment and retry backoff, not isolated server execution time. Callback count does not expose every transport retry.
- First snapshot: first room subscription callback, marked cached when Firestore reports cache data. It does not prove a fresh server round trip.
- Frame: two animation-frame callbacks after DOM rendering; a paint opportunity, not proof of GPU completion. Background tabs can delay it.

Spans overlap; do not add table rows to derive total time. Pending means a stage is still running; unfinished means the operation ended before that stage completed. Compare the first operation with repeated operations on the same phone/network. Report failures as well as successes. A slow span narrows the investigation but does not alone prove the Firestore region, billing plan or network is responsible.

## Ownership and checks

`src/hub/diagnostics.ts` holds bounded, payload-free timing reports. `src/app/diagnostics.ts` owns the opt-in dialog and its listeners. `src/app/start.ts` owns operation traces, subscriptions and animation-frame cleanup. `src/platform/firebase.ts` adds spans around existing reads/transactions without changing database rules or writes.

`tests/diagnostics.test.mjs` covers overlapping spans, safe errors, retries, immutable completion and bounded history. The Auth/Firestore emulator browser scenario injects commit transport delay and verifies the displayed timing includes it, while the normal guest has no diagnostic launcher. These checks do not measure production phone latency.
