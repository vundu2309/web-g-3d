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
    if (viewport.width === 1440) {
      // Inspect a water-only foreground band below the boat and above the HUD.
      // The broad range tolerates GPUs/timing while catching absent whitecaps
      // or an accidentally white-coated sea. It is not a realism metric.
      const coverage = await page.evaluate(async (png) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          20,
          Math.floor(image.height * 0.68),
          image.width - 40,
          Math.floor(image.height * 0.17),
        ).data;
        let white = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 185 && pixels[i + 1] > 190 && pixels[i + 2] > 185)
            white++;
        }
        return white / (pixels.length / 4);
      }, after.toString("base64"));
      assert.ok(
        coverage > 0.001 && coverage < 0.2,
        `Visible, sparse crest foam expected; foreground coverage=${coverage}`,
      );
      console.log(
        `PASS visible whitecaps: ${(coverage * 100).toFixed(2)}% foreground coverage`,
      );
    }
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
