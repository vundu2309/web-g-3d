import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
const directory = resolve("dist"),
  prefix = "/web-g-3d/";
let revision = 1;
const worker = await readFile(resolve(directory, "sw.js"), "utf8");
// Build invariants for the sea engine. Babylon + Havok are large and online-only:
// only the lazy ocean chunk may import the engine (a stray static import once dragged
// 1.7 MB into the home page), and neither the engine chunk nor the WASM may be part
// of the offline shell the service worker precaches.
{
  const assets = await readdir(resolve(directory, "assets"));
  const engine = assets.filter((name) => /^babylon-.*\.js$/.test(name));
  assert.equal(
    engine.length,
    1,
    `one engine chunk, found ${engine.join(", ")}`,
  );
  const precached = JSON.parse(worker.match(/const FILES = (\[.*?\]);/)[1]);
  assert.ok(
    !precached.some(
      (file) => file.includes("babylon-") || file.endsWith(".wasm"),
    ),
    "the engine and the Havok WASM stay out of the offline cache",
  );
  assert.ok(precached.length > 20, "the rest of the shell is still precached");
  for (const name of assets.filter(
    (n) => n.endsWith(".js") && !engine.includes(n),
  )) {
    const code = await readFile(resolve(directory, "assets", name), "utf8");
    const staticImport = new RegExp(
      `(?:from|^import)\\s*"\\./${engine[0]}"`,
      "m",
    ).test(code);
    assert.ok(
      !staticImport || name.startsWith("ocean-"),
      `${name} must not statically import the sea engine`,
    );
  }
}
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (!path.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    if (path === `${prefix}api/check`) {
      response.setHeader("content-type", "application/json");
      response.end('{"online":true}');
      return;
    }
    const local = resolve(
      directory,
      decodeURIComponent(path.slice(prefix.length)) || "index.html",
    );
    if (!local.startsWith(`${directory}/`)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader(
      "content-type",
      types[extname(local)] || "application/octet-stream",
    );
    response.setHeader("cache-control", "no-store");
    if (local.endsWith("/sw.js")) {
      response.end(
        revision === 1
          ? worker
          : worker.replace(
              /const VERSION = "[^"]+";/,
              `const VERSION = "pwa-update-test-${revision}";`,
            ),
      );
      return;
    }
    response.end(await readFile(local));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
});
let page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await mkdir("test-results/pwa", { recursive: true });
  await page.goto(base);
  await page.locator("[data-pwa-install]").waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifestURL = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifest = await (
    await context.request.get(new URL(manifestURL, base).href)
  ).json();
  assert.equal(
    new URL(manifest.start_url, new URL(manifestURL, base)).pathname,
    prefix,
  );
  assert.equal(
    new URL(manifest.scope, new URL(manifestURL, base)).pathname,
    prefix,
  );
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  for (const icon of manifest.icons) {
    const data = await (
      await context.request.get(new URL(icon.src, base).href)
    ).body();
    const expected = Number(icon.sizes.split("x")[0]);
    assert.equal(data.readUInt32BE(16), expected);
    assert.equal(data.readUInt32BE(20), expected);
  }
  // A synthetic browser event checks our gesture handling, not an OS-level install.
  await page.evaluate(() => {
    window.installPromptCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      window.installPromptCalls++;
    };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    dispatchEvent(event);
  });
  await page.locator("[data-pwa-install]").click();
  assert.equal(await page.evaluate(() => window.installPromptCalls), 1);
  assert.equal(await page.locator("[data-pwa-install]").isVisible(), true);
  await page.locator("[data-pwa-install]").click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Cài Phố Tỷ Phú" })
    .waitFor();
  await page.screenshot({ path: "test-results/pwa/install-guide.png" });
  await page.getByRole("button", { name: "Đã hiểu", exact: true }).click();
  await page.evaluate(() => fetch("./api/check"));
  const entries = await page.evaluate(async () => {
    const result = [];
    for (const key of await caches.keys())
      for (const request of await (await caches.open(key)).keys())
        result.push(request.url);
    return result;
  });
  assert.ok(entries.some((url) => url.endsWith("index.html")));
  assert.ok(
    entries.some((url) => /assets\/play-.*\.js$/.test(url)),
    "lazy HUD code is precached before visiting it",
  );
  assert.ok(
    entries.every(
      (url) =>
        url.startsWith(base) &&
        !url.includes("api/check") &&
        !url.includes("googleapis"),
    ),
  );
  // Offline cold navigations, including a lazy route never opened before going offline.
  await context.setOffline(true);
  await page.goto(`${base}?view=game&state=5`);
  await page.getByRole("button", { name: "+10 → M130", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "+10 → M130", exact: true }).waitFor();
  await page.goto(base);
  await page.locator("[data-pwa-install]").waitFor();
  await context.setOffline(false);
  // A new worker takes over by itself. From the idle home screen the page reloads
  // without a prompt; the old shell cache is removed once the new one is active.
  await page.evaluate(() => {
    window.pwaSentinel = "idle-home";
  });
  revision = 2;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForFunction(() => !window.pwaSentinel);
  await page.waitForFunction(async () => {
    const names = (await caches.keys()).filter((n) =>
      n.startsWith("photyphu-shell:"),
    );
    return names.length === 1 && names[0].endsWith(":pwa-update-test-2");
  });
  assert.equal(await page.locator(".pwa-update").isVisible(), false);
  // An active game view is never reloaded underneath the player.
  await page.goto(`${base}?view=game&state=5`);
  await page.getByRole("button", { name: "+10 → M130", exact: true }).waitFor();
  await page.evaluate(() => {
    window.pwaSentinel = "in-game";
  });
  revision = 3;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForFunction(async () =>
    (await caches.keys()).some((n) => n.endsWith(":pwa-update-test-3")),
  );
  assert.equal(await page.evaluate(() => window.pwaSentinel), "in-game");
  // The next navigation already runs the newest shell; stale caches are cleaned.
  await page.goto(base);
  await page.locator("[data-pwa-install]").waitFor();
  await page.waitForFunction(async () =>
    (await caches.keys())
      .filter((n) => n.startsWith("photyphu-shell:"))
      .every((n) => n.endsWith(":pwa-update-test-3")),
  );
  await page.evaluate(() => dispatchEvent(new Event("appinstalled")));
  assert.equal(await page.locator("[data-pwa-install]").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    "PWA passed: GitHub Pages subpath scope/icons, install guide/prompt handling, static-only offline home/lazy HUD reloads, self-activating updates that reload only from the idle home screen, never during a game view, with stale cache cleanup.",
  );
} catch (error) {
  if (!page.isClosed())
    await page.screenshot({ path: "test-results/pwa/failure.png" });
  throw error;
} finally {
  await context.close();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
