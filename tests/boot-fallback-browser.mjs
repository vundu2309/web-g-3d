import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// If the game script cannot run, the page must explain itself and offer recovery
// instead of staying blank (seen on an installed phone app).
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
});
const page = await context.newPage();
try {
  await page.route(/\/(src\/main\.ts|assets\/index-[^/]*\.js)/, (route) =>
    route.abort(),
  );
  await page.goto(process.env.TEST_BASE_URL);
  const fallback = page.locator("#boot-fallback");
  await fallback.waitFor({ timeout: 15000 });
  await page.getByText("Game chưa mở được", { exact: true }).waitFor();
  assert.match(await fallback.innerText(), /Không tải được|Không có thông báo/);
  await page
    .getByRole("button", { name: "Xóa bộ nhớ đệm và tải lại", exact: true })
    .waitFor();
  const box = await page
    .getByRole("button", { name: "Tải lại", exact: true })
    .boundingBox();
  assert.ok(box.height >= 44 && box.width >= 44, "touch target");
  // A healthy start never shows it: with the script allowed the game draws first.
  await page.unroute(/\/(src\/main\.ts|assets\/index-[^/]*\.js)/);
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Vào game" }).waitFor();
  await page.waitForTimeout(9000);
  assert.equal(await page.locator("#boot-fallback").count(), 0);
  console.log(
    "Boot fallback: explains a blank start with recovery actions; never shown on a healthy start.",
  );
} finally {
  await context.close();
  await browser.close();
}
