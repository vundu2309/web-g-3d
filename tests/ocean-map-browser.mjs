import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";
import { FAST_SEA } from "./support/fast-sea.mjs";

// The minimap opens the big map, a full-screen page of its own: a tap (through the input layer, like every
// control of the sea screen), or Enter on the focused minimap, opens it; it shows the whole sea as a square
// as big as the screen allows, with the named places beside it (under it on a tall screen), nearest first;
// Escape, the close button or the margin shut it; it does not open while a fish hangs from the rod; and the
// minimap sits at the top edge, level with the settings button. A real browser, a fake connection.
const browser = await launchBrowser();
const problems = [];
const SIZES = [
  [844, 390],
  [932, 430],
  [667, 375],
  [390, 844],
];
const summary = [];
try {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: false,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(error.message));
    await page.goto(
      `${process.env.TEST_BASE_URL}?daytime=12&weather=clear${FAST_SEA}`,
    );
    await page.getByRole("button", { name: "Ra khơi" }).waitFor();
    await page.evaluate(async () => {
      localStorage.clear();
      const { startOcean } = await import("/src/app/ocean.ts");
      const connect = async (onBoats) => {
        onBoats(
          [
            {
              uid: "me",
              name: "Bạn",
              session: "s",
              x: 0,
              z: 0,
              heading: 0,
              fishing: false,
              updatedAt: Date.now(),
              tier: 0,
              rod: 0,
            },
            {
              uid: "lan",
              name: "Lan",
              session: "s",
              x: 120,
              z: -60,
              heading: 1,
              fishing: false,
              updatedAt: Date.now(),
              tier: 0,
              rod: 0,
            },
          ],
          Date.now(),
        );
        return {
          uid: "me",
          pose: { x: 0, z: 0, heading: 0, fishing: false },
          dispose() {},
          publish: async () => {},
        };
      };
      window.stop = startOcean(document.querySelector("#app"), () => {}, {
        connect,
        onScene: (s) => (window.oceanScene = s),
      });
    });
    await page
      .getByText("Đã vào biển chung", { exact: false })
      .waitFor({ timeout: 90000 });
    await page.waitForTimeout(1200);

    const mini = page.locator(".ocean-minimap");
    const gear = page.locator('[data-ocean="settings"]');
    const dialog = page.locator("dialog.ocean-map");
    const open = () => dialog.evaluate((d) => d.open);
    const tag = `${width}x${height}`;

    // The minimap is level with the settings button at the top, and a keyboard-operable button.
    const mb = await mini.boundingBox();
    const gb = await gear.boundingBox();
    assert.ok(
      Math.abs(mb.y - gb.y) <= 2,
      `${tag}: the minimap's top (${mb.y}) is level with the settings button's (${gb.y})`,
    );
    assert.equal(await mini.getAttribute("role"), "button");
    assert.equal(await mini.getAttribute("tabindex"), "0");
    assert.match(
      (await mini.getAttribute("aria-label")) ?? "",
      /Bấm để mở bản đồ lớn/,
    );

    // 1. A tap opens the full-screen map.
    assert.equal(await open(), false);
    await tap(page, mini);
    await page.waitForFunction(
      () => document.querySelector("dialog.ocean-map")?.open === true,
      null,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => document.querySelector(".map-canvas")?.width >= 200,
    );

    // 2. The map is square, big and inside the screen; it is drawn (islands, sea, markers).
    const box = await page.locator(".map-canvas").boundingBox();
    assert.ok(
      Math.abs(box.width - box.height) <= 1,
      `${tag}: square (${box.width}x${box.height})`,
    );
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= height,
      `${tag}: inside the screen`,
    );
    const wide = width > height;
    assert.ok(
      box.height >= (wide ? height - 60 : 200),
      `${tag}: as big as the page allows (${box.height.toFixed(0)} px)`,
    );
    const colours = await page.locator(".map-canvas").evaluate((c) => {
      const data = c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4 * 97)
        seen.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      return seen.size;
    });
    assert.ok(
      colours > 12,
      `${tag}: the map has islands, sea and markers (${colours} colours)`,
    );

    // 3. The list: every named place once, numbered, nearest first, with a distance, inside the screen.
    const rows = await page.locator(".map-place").evaluateAll((items) =>
      items.map((li) => ({
        no: li.querySelector(".map-place-no").textContent,
        name: li.querySelector("strong").textContent,
        far: li.querySelector(".map-place-far").textContent,
      })),
    );
    assert.equal(
      rows.length,
      9,
      "the harbor, five markets and three shipyards",
    );
    assert.deepEqual(
      rows.map((r) => Number(r.no)).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    assert.equal(
      rows[0].name,
      "Bến cảng",
      "the player starts at the harbor: nearest first",
    );
    assert.ok(
      rows.every((r) => /^\d+ m$|^\d,\d km$/.test(r.far)),
      "each has a distance in m or km",
    );
    const panel = await page.locator(".map-panel").boundingBox();
    assert.ok(
      panel.x + panel.width <= width + 1 &&
        panel.y + panel.height <= height + 1,
      `${tag}: the list is inside the screen`,
    );
    const close = await page.locator(".map-close").boundingBox();
    assert.ok(
      close.width >= 44 && close.height >= 44,
      `${tag}: the close button is a touch target (${close.width}x${close.height})`,
    );

    // 4. Escape shuts it; Enter on the focused minimap opens it again; the close button shuts it.
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.querySelector("dialog.ocean-map")?.open === false,
    );
    await mini.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => document.querySelector("dialog.ocean-map")?.open === true,
      null,
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: "Đóng bản đồ" }).click();
    await page.waitForFunction(
      () => document.querySelector("dialog.ocean-map")?.open === false,
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.classList.contains("ocean-minimap"),
      ),
      true,
      "focus goes back to the minimap",
    );

    // 5. While a fish hangs from the rod a tap does nothing; afterwards it works again.
    await page.evaluate(() =>
      document.querySelector(".ocean-screen").classList.add("is-holding"),
    );
    await tap(page, mini);
    await page.waitForTimeout(500);
    assert.equal(await open(), false, `${tag}: no map while holding a fish`);
    await page.evaluate(() =>
      document.querySelector(".ocean-screen").classList.remove("is-holding"),
    );
    await tap(page, mini);
    await page.waitForFunction(
      () => document.querySelector("dialog.ocean-map")?.open === true,
      null,
      { timeout: 15000 },
    );
    summary.push(
      `${tag}: map ${box.width.toFixed(0)} px, ${rows.length} places`,
    );
    await context.close();
  }
  assert.deepEqual(problems, []);
  console.log(`map: ${summary.join("; ")}`);
} finally {
  await browser.close();
}
