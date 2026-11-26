import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";

// The Sổ hub on the real scene with a fake connection: a tab of the hub rail (reached from the fish
// store), ten species cards (the ones the player has met in colour with their best weight, the
// others as silhouettes with where to find them), the sea now, three hot spots, the progress chip,
// and the tab fits the small phone. Needs the dev server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

async function open(size) {
  const context = await browser.newContext({ viewport: size });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const { startOcean } = await import("/src/app/ocean.ts");
    const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
    const start = { x: 0, z: 22, heading: 0 };
    // Two species met: one still held, one sold (only its record is left).
    localStorage.setItem(
      saveKey("me"),
      encodeSave({
        ...start,
        caught: 3,
        fish: {
          "tom-hum": { n: 2, best: 3.4 },
          "ca-map": { n: 0, best: 61.5 },
        },
      }),
    );
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Tôi",
            session: "s",
            ...start,
            fishing: false,
            updatedAt: Date.now(),
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { ...start, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      fightSpeed: 2,
      connect,
      onScene: (s) => (window.oceanScene = s),
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  return { page, context };
}
const inView = async (page, locator) => {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  return (
    box &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= width + 1 &&
    box.y + box.height <= height + 1
  );
};
// The page is mostly flat cards, so a screenshot here is small whatever it holds: no empty-canvas size check.
const shoot = (page, path) => page.screenshot({ path });

try {
  for (const [name, size] of [
    ["844", { width: 844, height: 390 }],
    ["667", { width: 667, height: 375 }],
  ]) {
    const { page, context } = await open(size);
    await tap(page, page.locator('[data-ocean="catch"]'));
    const tab = page.locator('.hub-tab[data-hub="book"]');
    await tab.waitFor();
    await tap(page, tab);
    await page.locator(".book-cell").first().waitFor();
    assert.equal(await page.locator(".book-cell").count(), 10, "ten species");
    assert.equal(
      await page.locator(".book-cell.is-unknown").count(),
      8,
      "eight not met yet",
    );
    assert.match(
      await page.locator(".book-progress").innerText(),
      /^2\/10 loài$/,
    );
    const found = page.locator(".book-cell:not(.is-unknown)");
    assert.match(
      await found.allInnerTexts().then((t) => t.join("|")),
      /Tôm hùm[\s\S]*3,4 kg/,
    );
    assert.match(
      await page
        .locator(".book-cell")
        .allInnerTexts()
        .then((t) => t.join("|")),
      /Cá mập[\s\S]*61,5 kg/,
      "a sold species is still found",
    );
    // An unknown card hides the name and says where to find it.
    const unknown = page.locator(".book-cell.is-unknown").first();
    assert.match(await unknown.innerText(), /\?\?\?/);
    assert.ok((await unknown.locator(".book-where").innerText()).length > 3);
    assert.match(
      await page.locator(".book-sea strong").innerText(),
      /^Biển bây giờ: (Ban đêm|Chạng vạng|Ban ngày) · /,
    );
    assert.equal(
      await page.locator(".book-spot").count(),
      3,
      "three hot spots",
    );
    assert.match(
      await page.locator(".book-spot").first().innerText(),
      /còn \d+ phút/,
    );
    assert.ok(
      await inView(page, page.locator(".fish-store-close")),
      "the X fits",
    );
    assert.ok(await inView(page, tab), "the Sổ tab fits the rail");
    // Fish pictures come from the species' own models (they arrive a moment after the cards).
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".book-cell img")].every((i) =>
          i.src.startsWith("data:"),
        ),
      null,
      { timeout: 60000 },
    );
    await shoot(page, `${output}/book-${name}.png`);
    await tap(page, page.locator('.hub-tab[data-hub="stock"]'));
    await page.locator(".is-stock .fish-store-head h2").waitFor();
    await context.close();
  }
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean book: the Sổ tab lists ten species with the met ones in colour, the sea now and three hot spots, fits 844x390 and 667x375, no errors.",
  );
} finally {
  await browser.close();
}
