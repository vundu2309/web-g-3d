import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";

// Counts WebGL contexts created per canvas, so a redraw that recreated the renderer would fail.
const countContexts = () => {
  window.__webglContexts = 0;
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = original.call(this, type, ...rest);
    if (context && /^webgl/.test(type) && !this.__counted) {
      this.__counted = true;
      window.__webglContexts += 1;
    }
    return context;
  };
};
const disableWebgl = () => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (/^webgl/.test(type)) return null;
    return original.call(this, type, ...rest);
  };
};

const base = process.env.TEST_BASE_URL;
const output = base.includes(":")
  ? "test-results/board"
  : "test-results/board-public";
const browser = await launchBrowser();
const errors = [];
const trackErrors = (page) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
};
const status = (page) =>
  page.getAttribute("[data-board-host]", "data-board-status");
const shot = async (page) =>
  createHash("sha256")
    .update(await page.locator("[data-board-host]").screenshot())
    .digest("hex");
// Wait for the actual framing, rather than assuming software WebGL finishes
// the eased camera within a fixed wall-clock delay. Keep the exact image check.
const restoredShot = async (page, expected) => {
  const deadline = Date.now() + 15000;
  let actual;
  do {
    actual = await shot(page);
    if (actual === expected) return actual;
    await page.waitForTimeout(150);
  } while (Date.now() < deadline);
  return actual;
};
const scenario = async (page, id) => {
  await page
    .getByRole("button", { name: "Tùy chọn bản xem trước", exact: true })
    .click();
  await page.locator(`[data-scenario="${id}"]`).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
};
const waitFor3d = (page) =>
  page.waitForFunction(
    () =>
      document.querySelector("[data-board-host]")?.dataset.boardStatus === "3d",
  );
const settle = (page, ms = 900) => page.waitForTimeout(ms);

try {
  await mkdir(output, { recursive: true });

  // 1. One real WebGL canvas, one context, and an explicit status for tests.
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
    });
    await context.addInitScript(countContexts);
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(`${base}/?view=game&state=1`);
    await waitFor3d(page);
    assert.equal(
      await page.locator("canvas.board-canvas").count(),
      1,
      "exactly one canvas",
    );
    const size = await page
      .locator(".board-canvas")
      .evaluate((c) => ({ w: c.width, h: c.height, cw: c.clientWidth }));
    assert.ok(
      size.w > 0 && size.h > 0 && size.cw > 0,
      `canvas has pixels ${JSON.stringify(size)}`,
    );
    assert.equal(
      await page.evaluate(() => window.__webglContexts),
      1,
      "one WebGL context",
    );
    await settle(page, 300);
    await page.screenshot({ path: `${output}/overview-844.png` });

    // 2. Redraw lifecycle: HUD innerHTML changes many times; the same canvas and context stay.
    await page
      .locator(".board-canvas")
      .evaluate((c) => (c.dataset.marker = "kept"));
    for (const id of [2, 3, 4, 5, 7, 8, 9, 10, 11, 14, 19, 23, 24, 1]) {
      await scenario(page, id);
      await settle(page, 120);
    }
    assert.equal(
      await page.locator(".board-canvas").getAttribute("data-marker"),
      "kept",
      "canvas node survives redraws",
    );
    assert.equal(
      await page.evaluate(() => window.__webglContexts),
      1,
      "no context recreation across redraws",
    );
    assert.equal(await status(page), "3d");
    assert.equal(
      await page
        .locator(".board-canvas")
        .evaluate((c) => c.parentElement.hasAttribute("data-board-host")),
      true,
      "canvas is in the current host",
    );
    await context.close();
  }

  // 3. Focus / Overview gestures, keyboard equivalents and token-follow focus. Camera buttons are not game actions.
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
    });
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(`${base}/?view=game&state=1`);
    await waitFor3d(page);
    await settle(page, 300);
    const overview = await shot(page);
    assert.equal(
      await page
        .locator("[data-board-camera][aria-pressed=true]")
        .getAttribute("data-board-camera"),
      "overview",
    );
    assert.equal(
      await page.locator("[data-board-camera][data-game-action]").count(),
      0,
      "camera toggles are not game actions",
    );
    await page
      .getByRole("button", { name: "Theo dõi lượt", exact: true })
      .click();
    await settle(page, 1600);
    assert.equal(
      await page.getAttribute("[data-board-host]", "data-board-mode"),
      "focus",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Theo dõi lượt", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const focus = await shot(page);
    assert.notDeepEqual(focus, overview, "focus changes the picture");
    await page.screenshot({ path: `${output}/focus-844.png` });

    await page
      .getByRole("button", { name: "Toàn cảnh bàn", exact: true })
      .click();
    await settle(page, 1600);
    assert.deepEqual(
      await restoredShot(page, overview),
      overview,
      "returning to overview restores the same framing",
    );

    // Pointer drag orbits in overview (touch-compatible OrbitControls).
    const box = await page.locator("[data-board-host]").boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, {
      steps: 8,
    });
    await page.mouse.up();
    await settle(page, 200);
    const dragged = await shot(page);
    assert.notDeepEqual(dragged, overview, "drag orbits the board");

    // Right-button drag pans the target independently of orbit rotation.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(box.x + box.width * 0.36, box.y + box.height * 0.5, {
      steps: 6,
    });
    await page.mouse.up({ button: "right" });
    await settle(page, 200);
    const panned = await shot(page);
    assert.notDeepEqual(panned, dragged, "right drag pans overview");
    // Keyboard equivalents: arrows rotate, +/- dolly.
    await page.locator("[data-board-host]").focus();
    await page.keyboard.press("ArrowLeft");
    await settle(page, 200);
    const keyed = await shot(page);
    assert.notDeepEqual(keyed, panned, "arrow key rotates");
    await page.keyboard.press("-");
    await settle(page, 200);
    assert.notDeepEqual(await shot(page), keyed, "minus key zooms out");

    // Focus follows the active player: observer state 4 (Lan active) differs from state 1 (Minh active).
    await page
      .getByRole("button", { name: "Theo dõi lượt", exact: true })
      .click();
    await settle(page, 1600);
    const minhFocus = await shot(page);
    await scenario(page, 4);
    await settle(page, 1600);
    assert.notDeepEqual(
      await shot(page),
      minhFocus,
      "focus moves to the active token",
    );
    await context.close();
  }

  // 4. Resize: ResizeObserver resizes the drawing buffer to the new viewport.
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
    });
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(`${base}/?view=game&state=1`);
    await waitFor3d(page);
    const before = await page
      .locator(".board-canvas")
      .evaluate((c) => [c.width, c.height]);
    await page.setViewportSize({ width: 932, height: 430 });
    await page.waitForFunction(([width, height]) => {
      const canvas = document.querySelector(".board-canvas");
      return canvas.width !== width || canvas.height !== height;
    }, before);

    const after = await page
      .locator(".board-canvas")
      .evaluate((c) => [c.width, c.height]);
    assert.notDeepEqual(after, before, "drawing buffer follows resize");
    await page.setViewportSize({ width: 667, height: 375 });
    await settle(page, 400);
    assert.equal(await status(page), "3d");
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, 400);
    assert.equal(await status(page), "3d", "portrait keeps the 3D board");
    await page.screenshot({ path: `${output}/portrait-390.png` });
    await context.close();
  }

  // 5. Context loss shows a readable flat board; restore returns to 3D without a new renderer.
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
    });
    await context.addInitScript(countContexts);
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(`${base}/?view=game&state=1`);
    await waitFor3d(page);
    await page.evaluate(() => {
      const ext = document
        .querySelector(".board-canvas")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context");
      window.__loseExt = ext;
      ext.loseContext();
    });
    await page.waitForFunction(
      () =>
        document.querySelector("[data-board-host]")?.dataset.boardStatus ===
        "lost",
    );
    await page.locator(".board-flat-canvas").waitFor({ state: "visible" });
    await page.screenshot({ path: `${output}/lost-844.png` });
    await page.evaluate(() => window.__loseExt.restoreContext());
    await waitFor3d(page);
    assert.equal(
      await page.evaluate(() => window.__webglContexts),
      1,
      "restore reuses the renderer",
    );
    await context.close();
  }

  // 6. WebGL unavailable: flat fallback with the same board and tokens, never a blank panel.
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
    });
    await context.addInitScript(disableWebgl);
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(`${base}/?view=game&state=1`);
    await page.waitForFunction(
      () =>
        document.querySelector("[data-board-host]")?.dataset.boardStatus ===
        "fallback",
    );
    const flat = await page
      .locator(".board-flat-canvas")
      .evaluate((c) => [c.width, c.height]);
    assert.deepEqual(flat, [1024, 1024], "flat board drawn");
    assert.match(await page.locator(".board-flat-note").innerText(), /3D/);
    assert.equal(
      await page.locator(".board-canvas").evaluate((c) => c.hidden),
      true,
    );
    await page
      .getByRole("button", { name: "Tung xúc xắc", exact: true })
      .waitFor();
    await page.screenshot({ path: `${output}/fallback-844.png` });
    await context.close();
  }

  // 7. Reduced motion still switches camera modes without animation errors.
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    trackErrors(page);
    await page.goto(`${base}/?view=game&state=2`);
    await waitFor3d(page);
    await page
      .getByRole("button", { name: "Theo dõi lượt", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Toàn cảnh bàn", exact: true })
      .click();
    await settle(page, 300);
    assert.equal(
      await page.getAttribute("[data-board-host]", "data-board-mode"),
      "overview",
    );
    await context.close();
  }

  assert.deepEqual(errors, [], "no page errors");
  console.log(
    "Board 3D: one WebGL context, redraw lifecycle, focus/overview gestures, keyboard, resize, context loss and fallback passed.",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
