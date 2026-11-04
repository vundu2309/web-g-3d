import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
const directory = resolve("dist"),
  prefix = "/web-g-3d/";
let revision = 1;
const worker = await readFile(resolve(directory, "sw.js"), "utf8");
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
  // A new SW must wait while the current client is open, without forcing a reload.
  await page.evaluate(() => {
    window.pwaSentinel = "still-open";
  });
  revision = 2;
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
  );
  await page.locator(".pwa-update").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => window.pwaSentinel), "still-open");
  await page.close();
  // Closing the controlled client permits the normal SW activation lifecycle.
  await new Promise((resolve) => setTimeout(resolve, 400));
  page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(async () => {
    const names = await caches.keys();
    return (
      names.some((n) => n.endsWith(":pwa-update-test-2")) &&
      names.filter((n) => n.startsWith("photyphu-shell:")).length === 1
    );
  });
  // Explicit apply can be cancelled; other scoped windows prevent activation.
  revision = 3;
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration()).update(),
  );
  await page.locator(".pwa-update").waitFor({ state: "visible" });
  const other = await context.newPage();
  await other.goto(base);
  await page.evaluate(() => {
    window.pwaSentinel = "manual-update";
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Cập nhật ngay", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.pwaSentinel), "manual-update");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cập nhật ngay", exact: true })
    .click();
  await page
    .getByText("Hãy đóng các tab hoặc cửa sổ game khác rồi bấm cập nhật lại.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await other.evaluate(() => !!navigator.serviceWorker.controller),
    true,
  );
  await other.close();
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Cập nhật ngay", exact: true }).click(),
  ]);
  await page.waitForFunction(() => !window.pwaSentinel);
  await page.locator(".pwa-update").waitFor({ state: "hidden" });
  await page.waitForFunction(async () =>
    (await caches.keys())
      .filter((n) => n.startsWith("photyphu-shell:"))
      .every((n) => n.endsWith(":pwa-update-test-3")),
  );
  await page.evaluate(() => dispatchEvent(new Event("appinstalled")));
  assert.equal(await page.locator("[data-pwa-install]").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    "PWA passed: GitHub Pages subpath scope/icons, install guide/prompt handling, static-only offline home/lazy HUD reloads, waiting update without forced reload, cleanup after closing clients.",
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
