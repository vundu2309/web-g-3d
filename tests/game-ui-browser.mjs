import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.route(
  /https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com/,
  (route) => {
    errors.push("HUD preview contacted Firebase");
    return route.abort();
  },
);
const base = process.env.TEST_BASE_URL;
const output = base.includes(":")
  ? "test-results/game-ui"
  : "test-results/game-ui-public";
async function scenario(id) {
  await page
    .getByRole("button", { name: "Tùy chọn bản xem trước", exact: true })
    .click();
  await page.locator(`[data-scenario="${id}"]`).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
try {
  await mkdir(output, { recursive: true });
  await page.goto(`${base}/?view=game`);
  await page
    .getByRole("button", { name: "Tung xúc xắc", exact: true })
    .waitFor();
  await page.screenshot({ path: `${output}/turn-844.png` });
  await page.getByRole("button", { name: "Tung xúc xắc", exact: true }).click();
  await page.locator(".moving-state").waitFor();
  assert.equal(await page.locator(".game-actions").innerText(), "");
  await page.getByRole("button", { name: "Mua · M240", exact: true }).waitFor();
  assert.equal(await page.locator(".title-deed tbody tr").count(), 7);
  await page.getByRole("button", { name: "Mua · M240", exact: true }).click();
  await page.getByText("M1.260", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Kết thúc lượt", exact: true })
    .click();
  assert.equal(await page.locator("[data-game-action]").count(), 0);
  assert.match(
    await page.locator('.game-player[aria-current="step"]').innerText(),
    /Lan/,
  );
  await scenario(5);
  await page.getByRole("button", { name: "+20 → M140", exact: true }).click();
  await page.getByText("M140", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-game-action]").count(), 0);
  await scenario(9);
  assert.equal(await page.locator("input").count(), 0);
  await page
    .getByRole("button", { name: "Thêm 50 Bạn đưa", exact: true })
    .click();
  assert.equal(await page.locator(".offer-money").first().innerText(), "M100");
  await scenario(10);
  assert.match(
    await page.locator('.game-player[aria-current="step"]').innerText(),
    /Lan/,
  );
  assert.match(
    await page.locator(".response-label").locator("..").innerText(),
    /Minh/,
  );
  await page.getByRole("button", { name: "Từ chối", exact: true }).click();
  assert.equal(await page.locator("[data-game-action]").count(), 0);
  await scenario(14);
  assert.equal(
    await page
      .getByRole("button", { name: "Thanh toán", exact: true })
      .isDisabled(),
    true,
  );
  // Every scenario at each landscape-phone target: action size and no overlaps.
  for (const viewport of [
    { width: 667, height: 375 },
    { width: 844, height: 390 },
    { width: 932, height: 430 },
  ]) {
    await page.setViewportSize(viewport);
    for (let id = 1; id <= 24; id++) {
      await scenario(id);
      const issue = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".game-action")];
        const roster = document
          .querySelector(".game-roster")
          .getBoundingClientRect();
        const deed = document
          .querySelector(".game-task")
          ?.getBoundingClientRect();
        if (document.documentElement.scrollWidth > innerWidth)
          return "horizontal overflow";
        for (const button of all) {
          const r = button.getBoundingClientRect();
          if (r.height < 44) return "small touch target";
          if (r.right > innerWidth || r.top < 0 || r.bottom > roster.top - 2)
            return "actions outside safe area or overlap roster";
          if (button.scrollWidth > button.clientWidth)
            return "button text overflow";
          const icon = button.querySelector("svg").getBoundingClientRect();
          if (icon.width > 18 || icon.height > 18) return "large action icon";
        }
        if (
          deed &&
          (deed.top < 0 || deed.bottom > roster.top - 2 || deed.left < 0)
        )
          return "task outside safe area or overlap roster";
        return null;
      });
      assert.equal(
        issue,
        null,
        `${viewport.width}x${viewport.height}, scenario ${id}`,
      );
      if (
        viewport.width === 844 &&
        [3, 5, 8, 9, 10, 14, 18, 19, 23].includes(id)
      )
        await page.screenshot({ path: `${output}/state-${id}-844.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await scenario(9);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: `${output}/portrait.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await scenario(1);
  await context.setOffline(true);
  await page
    .getByRole("heading", { name: "Mất kết nối", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-game-action]").count(), 1);
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Tung xúc xắc", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Tung xúc xắc", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "HUD UI: 24 states, observer/response permissions, compact controls, touch-only auction/trade, phone layouts, local flows, offline/reload passed.",
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error(await page.locator("#app").innerText());
  throw error;
} finally {
  await context.close();
  await browser.close();
}
