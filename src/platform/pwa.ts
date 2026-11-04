/** Browser-owned SW lifecycle, scoped to this app. No UI, reload or API caching. */
export function registerShell(
  onWaiting: (waiting: boolean) => void,
): () => void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return () => {};
  const abort = new AbortController();
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let lastUpdate = 0;
  const checkWaiting = () => {
    if (!disposed) onWaiting(!!registration?.waiting);
  };
  const base = new URL(import.meta.env.BASE_URL, location.href);
  void navigator.serviceWorker
    .register(new URL("sw.js", base), {
      scope: base.pathname,
      updateViaCache: "none",
    })
    .then((reg) => {
      if (disposed) return;
      registration = reg;
      checkWaiting();
      reg.addEventListener(
        "updatefound",
        () => {
          reg.installing?.addEventListener("statechange", checkWaiting, {
            signal: abort.signal,
          });
        },
        { signal: abort.signal },
      );
    })
    .catch(() => {
      /* The app and install guide still work without an offline cache. */
    });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState === "visible" &&
        registration &&
        Date.now() - lastUpdate > 60_000
      ) {
        lastUpdate = Date.now();
        void registration.update().catch(() => {});
      }
    },
    { signal: abort.signal },
  );
  return () => {
    disposed = true;
    abort.abort();
  };
}
