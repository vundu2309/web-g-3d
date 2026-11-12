import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";

// The fish markets on the real scene with a fake connection and an in-memory economy that
// follows the server's rules: far from a pier there is no Bán button; near one the button
// shows and opens the market hub, where fish are sold for the economy's prices and the
// wallet grows; with no economy configured nothing shows at all. Needs the dev server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

async function open(
  start,
  { economy = true, size = { width: 844, height: 390 } } = {},
) {
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
  await page.evaluate(
    async ({ start, economy }) => {
      const { startOcean } = await import("/src/app/ocean.ts");
      const { memoryEconomy } = await import("/src/ocean/economy-api.ts");
      const { SPECIES } = await import("/src/ocean/fishing.ts");
      const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
      // The boat starts where it was saved (the sea resumes from the device's save).
      localStorage.setItem(
        saveKey("me"),
        encodeSave({
          x: start.x,
          z: start.z,
          heading: start.heading,
          caught: 0,
          fish: {},
        }),
      );
      let clock = 0;
      const money = memoryEconomy({ now: () => clock });
      // Five caught fish waiting in the ledger (a catch every 10 seconds of fake time).
      for (const [id, kg] of [
        ["ca-ngu", 12.5],
        ["ca-ngu", 20],
        ["ca-thu", 3],
        ["ca-com", 0.1],
        ["ca-kiem", 40],
      ]) {
        clock += 10000;
        await money.recordCatch({ species: id, kg });
      }
      window.money = money;
      window.species = SPECIES.length;
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
        economy: economy ? money : undefined,
        onScene: (s) => (window.oceanScene = s),
      });
    },
    { start, economy },
  );
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  return { page, context };
}
const market = (page) => page.locator('[data-ocean="market"]');
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

try {
  // 1. At the harbor, far from every pier: no Bán button.
  {
    const { page, context } = await open({ x: 0, z: 22, heading: 0 });
    await page.waitForTimeout(1500);
    assert.equal(
      await market(page).isHidden(),
      true,
      "no button far from a pier",
    );
    await context.close();
  }
  // 2. No economy configured (legacy backend, preview): the button never shows, even at a pier.
  {
    const { page, context } = await open(
      { x: -45, z: -18, heading: 0 },
      { economy: false },
    );
    await page.waitForTimeout(1500);
    assert.equal(await market(page).isHidden(), true, "no economy, no market");
    await context.close();
  }
  // 3. Next to the Hải Đăng pier: the button shows, named for the pier, and opens the hub.
  const { page, context } = await open({ x: -45, z: -18, heading: 0 });
  await market(page).waitFor({ state: "visible", timeout: 20000 });
  assert.match(await market(page).getAttribute("aria-label"), /Chợ Hải Đăng/);
  assert.ok(await inView(page, market(page)), "the button is on screen");
  await page.screenshot({ path: `${output}/market-button.png` });
  await tap(page, market(page));
  await page.locator(".market-wallet").waitFor();
  await page.locator(".fish-cell").first().waitFor();
  const wallet = () => page.locator(".market-wallet strong").innerText();
  assert.match(await wallet(), /^0 xu$/);
  assert.equal(
    await page.locator(".fish-cell").count(),
    4,
    "four species in the ledger",
  );
  // The title is the market's name, and the hub is full screen with an X.
  assert.match(
    await page.locator(".fish-store-head h2").innerText(),
    /Chợ Hải Đăng/,
  );
  assert.ok(
    await inView(page, page.locator(".fish-store-close")),
    "the X is on screen",
  );
  await page.screenshot({ path: `${output}/market-hub.png` });
  // Sell the tuna: the database prices them; the wallet shows exactly that.
  const tunaPrice = await page.evaluate(async () => {
    const state = await window.money.state();
    return state.ledger
      .filter((r) => r.species === "ca-ngu")
      .reduce((s, r) => s + r.price, 0);
  });
  const tuna = page.locator(".fish-cell", { hasText: "Cá ngừ" });
  assert.ok(
    await inView(page, tuna.locator(".market-sell")),
    "the sell button is on screen",
  );
  await tuna.locator(".market-sell").click();
  await page.locator(".market-flash").waitFor();
  assert.equal((await wallet()).replace(/\D/g, ""), String(tunaPrice));
  assert.equal(
    await page.locator(".fish-cell").count(),
    3,
    "the tuna are gone",
  );
  // Sell everything that is left.
  const rest = await page.evaluate(async () => {
    const state = await window.money.state();
    return state.ledger.reduce((s, r) => s + r.price, 0) + state.coins;
  });
  await page.locator(".market-sell-all").click();
  await page.locator(".fish-empty").waitFor();
  assert.equal((await wallet()).replace(/\D/g, ""), String(rest));
  assert.match(await page.locator(".fish-empty").innerText(), /Chưa có cá/);
  assert.equal(
    await page.locator(".market-sell-all").count(),
    0,
    "nothing left to sell",
  );
  await page.screenshot({ path: `${output}/market-empty.png` });
  // Closing returns to the sea; sailing away hides the button again.
  await page.locator(".fish-store-close").click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await context.close();
  // 4. A small phone: the button and the hub still fit.
  const small = await open(
    { x: -45, z: -18, heading: 0 },
    { size: { width: 667, height: 375 } },
  );
  await market(small.page).waitFor({ state: "visible", timeout: 20000 });
  assert.ok(
    await inView(small.page, market(small.page)),
    "the button fits 667x375",
  );
  await tap(small.page, market(small.page));
  await small.page.locator(".fish-cell").first().waitFor();
  assert.ok(await inView(small.page, small.page.locator(".fish-store-close")));
  await small.page.screenshot({ path: `${output}/market-hub-667.png` });
  await small.context.close();
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean market: no button far away or without an economy, the button and hub near a pier, selling pays the server's prices, small phone fits, no errors.",
  );
} finally {
  await browser.close();
}
