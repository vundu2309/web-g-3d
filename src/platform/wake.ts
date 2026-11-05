/**
 * Best-effort nudge for a sleeping API (free hosting sleeps when idle). It runs while
 * the page loads the engine, so the server's wake-up overlaps with the download
 * instead of adding to it. The response is ignored: it is opaque on purpose, so no
 * CORS setup is needed and nothing about the reply is trusted or read.
 */
let lastWake = 0;
export function wakeApi() {
  const base = import.meta.env.VITE_API_URL;
  if (!base || Date.now() - lastWake < 60_000) return;
  lastWake = Date.now();
  void fetch(`${base}/health`, { mode: "no-cors", cache: "no-store" }).catch(
    () => {},
  );
}
