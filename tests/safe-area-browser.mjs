import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser(),
  context = await browser.newContext();
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.TEST_BASE_URL;
await context.route(
  /https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com/,
  (route) => route.abort(),
);
async function select(id) {
  await page
    .getByRole("button", { name: "Tùy chọn bản xem trước", exact: true })
    .click();
  await page.locator(`[data-scenario="${id}"]`).click();
}
try {
  await mkdir("test-results/safe-area", { recursive: true });
  await page.goto(`${base}/?view=game`);
  const cases = [
    { width: 844, height: 390, top: 0, right: 59, bottom: 21, left: 59 },
    { width: 844, height: 390, top: 12, right: 59, bottom: 24, left: 0 },
    { width: 667, height: 375, top: 0, right: 0, bottom: 21, left: 44 },
  ];
  for (const c of cases) {
    await page.setViewportSize(c);
    await page.evaluate((c) => {
      for (const side of ["top", "right", "bottom", "left"])
        document.documentElement.style.setProperty(
          `--safe-${side}`,
          `${c[side]}px`,
        );
    }, c);
    for (let id = 1; id <= 24; id++) {
      await select(id);
      const result = await page.evaluate((c) => {
        const safe = document
          .querySelector(".game-safe")
          .getBoundingClientRect();
        const expected = {
          left: c.left,
          top: c.top,
          right: innerWidth - c.right,
          bottom: innerHeight - c.bottom,
        };
        if (
          Object.keys(expected).some((k) => Math.abs(safe[k] - expected[k]) > 1)
        )
          return "safe coordinate system mismatch";
        const within = (r) =>
          r.left >= safe.left - 1 &&
          r.right <= safe.right + 1 &&
          r.top >= safe.top - 1 &&
          r.bottom <= safe.bottom + 1;
        for (const selector of [
          ".game-roster",
          ".board-camera",
          ".game-settings",
          ".game-preview-label",
          ".game-actions",
          ".game-task",
        ]) {
          const el = document.querySelector(selector);
          if (el && !within(el.getBoundingClientRect()))
            return selector + " outside device safe area";
        }
        const roster = document
          .querySelector(".game-roster")
          .getBoundingClientRect();
        const action = document
          .querySelector(".game-actions")
          .getBoundingClientRect();
        const task = document
          .querySelector(".game-task")
          ?.getBoundingClientRect();
        if (action.bottom > roster.top - 3) return "actions overlap roster";
        if (task && task.bottom > roster.top - 3) return "task overlaps roster";
        if (document.documentElement.scrollWidth > innerWidth)
          return "horizontal overflow";
        return null;
      }, c);
      assert.equal(
        result,
        null,
        `${c.width}x${c.height} insets ${JSON.stringify(c)}, state${id}`,
      );
      // Every action remains >=44px and can be scrolled into the safe action tray.
      for (const button of await page.locator(".game-action").all()) {
        await button.evaluate((el) =>
          el.scrollIntoView({ block: "nearest", inline: "nearest" }),
        );
        assert.equal(
          await button.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              tray = el.closest(".game-actions").getBoundingClientRect();
            return (
              r.height >= 44 &&
              r.top >= tray.top - 1 &&
              r.bottom <= tray.bottom + 1
            );
          }),
          true,
          `reachable action state${id}`,
        );
      }
      if (c.width === 844 && c.left === 59 && [3, 5, 9].includes(id))
        await page.screenshot({
          path: `test-results/safe-area/state-${id}-notch.png`,
        });
    }
  }
  // Rotation to a portrait-style top cutout and home indicator; modal also stays safe.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    for (const [k, v] of Object.entries({
      top: 59,
      right: 0,
      bottom: 34,
      left: 0,
    }))
      document.documentElement.style.setProperty(`--safe-${k}`, `${v}px`);
  });
  await page
    .getByRole("button", { name: "Tùy chọn bản xem trước", exact: true })
    .click();
  assert.equal(
    await page.getByRole("dialog").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.top >= 59 &&
        r.bottom <= innerHeight - 34 &&
        r.left >= 0 &&
        r.right <= innerWidth
      );
    }),
    true,
  );
  await page.locator('[data-scenario="9"]').click();
  await page.screenshot({ path: "test-results/safe-area/portrait.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Safe-area:24 HUD states across left/right cutouts and home-indicator insets, touch-target scrolling and portrait modal passed (CSS inset simulation, not physical-device evidence).",
  );
} catch (error) {
  await page.screenshot({ path: "test-results/safe-area/failure.png" });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
