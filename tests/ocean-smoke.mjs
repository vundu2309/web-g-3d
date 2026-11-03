import { launchBrowser } from "./browser.mjs";
import assert from "node:assert/strict";

const browser = await launchBrowser();
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:5173");
    const button = page.getByRole("button");
    await page.waitForFunction(
      () => !document.querySelector("#waves").disabled,
    );
    await page.waitForTimeout(800);
    const before = await page.locator("canvas").screenshot();
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    await page.waitForTimeout(800);
    const after = await page.locator("canvas").screenshot();
    assert.ok(!before.equals(after), "Ocean must animate");
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "false");
    assert.deepEqual(errors, [], "No network, shader or JavaScript errors");
    const bounds = await page.locator("canvas").boundingBox();
    assert.equal(bounds.width, viewport.width);
    assert.equal(bounds.height, viewport.height);
    await page.close();
    console.log(
      `PASS ocean render/animation, wave controls and assets: ${viewport.width}x${viewport.height}`,
    );
  }
} finally {
  await browser.close();
}
