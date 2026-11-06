import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// Loading card and connection failures of the real sea, with fake connections and
// short patience. Needs the dev server (imports from /src).
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const problems = [];

async function open(connectSource, timing) {
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("GL Driver"))
      problems.push(message.text());
  });
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(
    async ({ source, timing }) => {
      window.calls = 0;
      window.left = false;
      const { startOcean } = await import("/src/app/ocean.ts");
      const { HubError } = await import("/src/hub/model.ts");
      const good = (onBoats) => {
        onBoats([], Date.now());
        return {
          uid: "me",
          pose: { x: 0, z: 0, heading: 0, fishing: false },
          dispose() {},
          publish: async () => {},
        };
      };
      const connect = async (onBoats) => {
        window.calls++;
        if (source === "flaky") {
          await new Promise((r) => setTimeout(r, 80));
          if (window.calls < 3) throw new Error("server still asleep");
          return good(onBoats);
        }
        if (source === "never") return new Promise(() => {});
        if (source === "fatal") throw new HubError("Hãy đăng nhập để ra khơi.");
        return good(onBoats);
      };
      window.stop = startOcean(
        document.querySelector("#app"),
        () => {
          window.left = true;
        },
        { connect, timing, onScene: (s) => (window.oceanScene = s) },
      );
    },
    { source: connectSource, timing },
  );
  return page;
}
const visible = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && !el.hidden && getComputedStyle(el).display !== "none";
  }, selector);

try {
  // 1. A server that needs a few tries: a loading card with steps, a wake-up note and
  //    the attempt number, then the card goes away and the boat is in the sea.
  const flaky = await open("flaky", {
    slowAfterMs: 150,
    delaysMs: [150],
    attemptMs: 5000,
    deadlineMs: 60000,
  });
  await flaky.locator(".ocean-loading").waitFor({ state: "visible" });
  assert.equal(
    await flaky.locator("[data-loading-title]").innerText(),
    "Đang ra khơi…",
  );
  assert.deepEqual(
    await flaky.locator(".ocean-loading-steps li").allInnerTexts(),
    ["Tải đồ họa biển", "Kết nối map chung", "Vào biển"],
  );
  await flaky.waitForFunction(
    () =>
      document
        .querySelector("[data-loading-note]")
        .textContent.includes("thức dậy"),
    null,
    { timeout: 30000 },
  );
  await flaky.waitForFunction(
    () =>
      document
        .querySelector("[data-loading-note]")
        .textContent.includes("lần thử"),
    null,
    { timeout: 30000 },
  );
  await flaky
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  await flaky.waitForFunction(
    () => document.querySelector(".ocean-loading").hidden,
    null,
    { timeout: 10000 },
  );
  assert.equal(
    await flaky.evaluate(() => window.calls),
    3,
    "it tried three times",
  );
  assert.ok(
    await flaky.evaluate(() => !!window.oceanScene.selfState()),
    "the boat is in the sea",
  );
  assert.equal(
    await flaky.locator(".ocean-loading-steps li.is-done").count(),
    3,
    "every step ended ticked",
  );
  await flaky.close();

  // 2. A server that never answers: patience runs out, the card turns into a clear
  //    failure with Retry, and the HUD's back button is still reachable above it.
  const never = await open("never", {
    slowAfterMs: 100,
    delaysMs: [100],
    attemptMs: 500,
    deadlineMs: 1600,
  });
  await never
    .getByText("Chưa vào được biển chung", { exact: true })
    .waitFor({ timeout: 30000 });
  const retry = never.getByRole("button", { name: "Thử lại", exact: true });
  await retry.waitFor();
  const box = await retry.boundingBox();
  assert.ok(
    box.width >= 44 && box.height >= 44,
    "retry is a proper touch target",
  );
  assert.ok(
    (await never.evaluate(() => window.calls)) >= 2,
    "it retried before giving up",
  );
  const covered = await never.evaluate(() => {
    const back = document
      .querySelector('[data-ocean="back"]')
      .getBoundingClientRect();
    const hit = document.elementFromPoint(
      back.x + back.width / 2,
      back.y + back.height / 2,
    );
    return !hit?.closest('[data-ocean="back"]');
  });
  assert.equal(
    covered,
    false,
    "the back button is not covered by the loading card",
  );
  await never.locator('[data-ocean="back"]').click();
  assert.equal(
    await never.evaluate(() => window.left),
    true,
    "back leaves the sea",
  );
  // Retry reloads the page (the real route re-enters the sea directly).
  await Promise.all([never.waitForEvent("load"), retry.click()]);
  await never.close();

  // 3. An error retrying cannot fix is shown at once, with no pointless retries.
  const fatal = await open("fatal", {
    slowAfterMs: 100,
    delaysMs: [100],
    attemptMs: 500,
    deadlineMs: 60000,
  });
  await fatal
    .getByText("Hãy đăng nhập để ra khơi.", { exact: false })
    .first()
    .waitFor({ timeout: 30000 });
  assert.equal(
    await fatal.evaluate(() => window.calls),
    1,
    "no retries for a fatal error",
  );
  assert.equal(await visible(fatal, ".ocean-loading-actions"), true);
  await fatal.close();
  assert.deepEqual(problems, []);
  console.log(
    "Ocean loading: step card, wake-up note and attempt count, auto-retry then entry, failure card with Retry and a reachable Back, fatal errors shown at once.",
  );
} finally {
  await context.close();
  await browser.close();
}
