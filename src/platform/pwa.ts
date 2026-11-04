/** Scoped SW lifecycle. Reload only after the local player confirms an update. */
export function registerShell(
  onWaiting: (waiting: boolean, apply: () => Promise<void>) => void,
): () => void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return () => {};
  const abort = new AbortController();
  let disposed = false;
  let registration: ServiceWorkerRegistration | undefined;
  let lastUpdate = 0;
  const checkWaiting = () => {
    if (!disposed) onWaiting(!!registration?.waiting, applyUpdate);
  };
  let requested = false;
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      checkWaiting();
      if (requested && !disposed) location.reload();
    },
    { signal: abort.signal },
  );
  async function applyUpdate() {
    const worker = registration?.waiting;
    if (!worker) {
      checkWaiting();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel();
      const cleanup = () => {
        clearTimeout(timer);
        channel.port1.close();
        abort.signal.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        cleanup();
        reject(new Error("Update cancelled"));
      };
      const timer = window.setTimeout(() => {
        requested = false;
        cleanup();
        reject(new Error("Chưa nhận được phản hồi. Hãy thử lại."));
      }, 8000);
      channel.port1.onmessage = (event: MessageEvent<{ ok: boolean }>) => {
        cleanup();
        if (event.data.ok) resolve();
        else {
          requested = false;
          reject(
            new Error(
              "Hãy đóng các tab hoặc cửa sổ game khác rồi bấm cập nhật lại.",
            ),
          );
        }
      };
      abort.signal.addEventListener("abort", cancel, { once: true });
      requested = true;
      worker.postMessage({ type: "APPLY_UPDATE" }, [channel.port2]);
    });
  }
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
