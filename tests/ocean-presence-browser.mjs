import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";
import { FAST_SEA } from "./support/fast-sea.mjs";

// The others hide a boat that has been silent for 30 s (PRESENCE_MS), so a player who has a hub
// open (the market, the store, Settings) must keep announcing the boat: it is still in the sea.
// A real browser, a fake connection that records every pose the client publishes.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
try {
  await page.goto(
    `${process.env.TEST_BASE_URL}?daytime=12&weather=clear${FAST_SEA}`,
  );
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(async () => {
    window.published = [];
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
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: 0, z: 0, heading: 0, fishing: false },
        dispose() {},
        publish: async (pose) => {
          window.published.push({ ...pose, at: performance.now() });
        },
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  await page.waitForFunction(() => window.published.length > 0, null, {
    timeout: 30000,
  });
  // Open Settings (a hub) and stay there longer than the interval between two heartbeats.
  await tap(page, page.locator('[data-ocean="settings"]'));
  await page.waitForFunction(
    () => document.querySelector("dialog.ocean-dialog")?.open === true,
    null,
    { timeout: 10000 },
  );
  const before = await page.evaluate(() => window.published.length);
  await page.waitForTimeout(13000);
  const after = await page.evaluate(() => window.published.length);
  assert.ok(
    after > before,
    `a hub is open for 13 s and the boat was announced ${after - before} times (it must be at least once, or the others hide it after 30 s)`,
  );
  assert.deepEqual(problems, []);
  console.log(
    `presence: ${after - before} heartbeat(s) while Settings was open`,
  );
} finally {
  await browser.close();
}
