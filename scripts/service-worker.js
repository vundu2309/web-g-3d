/* Build substitutes only these two constants. Never cache accounts or API traffic. */
const VERSION = "__PWA_VERSION__";
const FILES = "__PWA_ASSETS__";
const ROOT = self.registration.scope;
const PREFIX = `photyphu-shell:${ROOT}:`;
const CACHE = `${PREFIX}${VERSION}`;
const URLS = FILES.map((path) => new URL(path, ROOT).href);
const ALLOWED = new Set(URLS);
const INDEX = new URL("index.html", ROOT).href;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(
          URLS.map((url) => new Request(url, { cache: "reload" })),
        );
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      // No skipWaiting: active games keep their current version until all tabs close.
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && name !== CACHE)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const root = new URL(ROOT);
  if (request.method !== "GET" || url.origin !== root.origin) return;
  const navigation =
    request.mode === "navigate" &&
    (url.pathname === root.pathname ||
      url.pathname === new URL(INDEX).pathname);
  // An exact static allowlist avoids Firebase, auth callbacks, arbitrary URLs and other repositories.
  if (!navigation && (url.search || !ALLOWED.has(url.href))) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(navigation ? INDEX : request);
      return cached || fetch(request);
    })(),
  );
});

// Apply only after an explicit user confirmation, with no other scoped windows.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "APPLY_UPDATE" || !event.ports[0]) return;
  event.waitUntil(
    (async () => {
      const clients = (
        await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        })
      ).filter((client) => client.url.startsWith(ROOT));
      const ok = clients.length === 1 && clients[0].id === event.source?.id;
      event.ports[0].postMessage({ ok });
      if (ok) await self.skipWaiting();
    })(),
  );
});
