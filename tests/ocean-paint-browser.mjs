import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { SHIPYARDS } from "../src/ocean/shipyard.ts";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";

// A boat 14 m seaward of the first shipyard: inside SHIPYARD_RANGE (24 m) and clear of the shore.
const yard = SHIPYARDS[0];
const atYard = {
  x: yard.x + Math.sin(yard.facing) * 14,
  z: yard.z - Math.cos(yard.facing) * 14,
  heading: yard.facing,
};

const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(
    `${process.env.TEST_BASE_URL}/?reflect=0&fish=0&props=0&cats=0&planes=0&scale=1`,
  );
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (start) => {
    const { startOcean } = await import("/src/app/ocean.ts");
    const { memoryEconomy } = await import("/src/ocean/economy-api.ts");
    const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
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
    const money = memoryEconomy({ coins: 1250, uid: "me" });
    window.money = money;
    window.refits = 0;
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Tôi",
            session: "s",
            ...start,
            fishing: false,
            tier: 0,
            rod: 0,
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
        refit() {
          window.refits++;
        },
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      economy: money,
      onScene: (s) => (window.oceanScene = s),
    });
  }, atYard);

  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });

  // Near the shipyard: the Tàu button appears and opens the shipyard hub.
  const yardBtn = page.locator('[data-ocean="market"]');
  await yardBtn.waitFor({ state: "visible", timeout: 30000 });
  await tap(page, yardBtn);
  await page.locator(".market-wallet").waitFor({ timeout: 30000 });
  await page.locator(".upgrade-card").first().waitFor({ timeout: 30000 });

  // Shipyard has both "Thuyền" and "Sơn tàu" tabs.
  const paintTab = page.locator('.market-tab[data-page="paint"]');
  await paintTab.waitFor({ state: "visible", timeout: 15000 });
  await paintTab.click({ timeout: 30000 });

  // Wait for all 8 paint cards and their real 3D GLB boat thumbnails to render.
  await page.locator(".paint-card").nth(7).waitFor({ state: "visible" });
  for (let i = 0; i < 40; i++) {
    const imgs = await page.locator(".paint-card .paint-icon img").count();
    if (imgs === 8) break;
    await page.waitForTimeout(150);
  }
  assert.equal(
    await page.locator(".paint-card .paint-icon img").count(),
    8,
    "all 8 paint cards render real 3D boat thumbnails",
  );

  // Check layout and 44px touch targets at 844x390.
  const layout844 = await page.evaluate(() => {
    const body = document.querySelector(".fish-store-body");
    const buttons = [...document.querySelectorAll(".paint-card button")];
    return {
      overflowX: body ? body.scrollWidth - body.clientWidth : 999,
      minBtnH: Math.min(
        ...buttons.map((b) => b.getBoundingClientRect().height),
      ),
    };
  });
  assert.ok(
    layout844.overflowX <= 1,
    `no horizontal overflow at 844x390 (got ${layout844.overflowX})`,
  );
  assert.ok(
    layout844.minBtnH >= 43.5,
    `touch buttons at least 44px tall (got ${layout844.minBtnH})`,
  );

  await page.screenshot({ path: `${output}/paint-shop-844x390.png` });

  // Compact landscape phone (667x375): still fits with no horizontal overflow.
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForTimeout(200);
  const layout667 = await page.evaluate(() => {
    const body = document.querySelector(".fish-store-body");
    return { overflowX: body ? body.scrollWidth - body.clientWidth : 999 };
  });
  assert.ok(
    layout667.overflowX <= 1,
    `no horizontal overflow at 667x375 (got ${layout667.overflowX})`,
  );
  await page.screenshot({ path: `${output}/paint-shop-667x375.png` });

  // Return to 844x390 and buy "Vàng Nắng Mai" (paint 4, 400 xu).
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  const goldCard = page.locator('[data-kind="paint"] [data-tier="4"]');
  await goldCard.locator("button.upgrade-buy").click();
  await page.getByText("Đã sơn tàu!").waitFor({ state: "visible" });
  await page
    .locator('[data-kind="paint"] [data-tier="4"].is-using')
    .waitFor({ state: "visible" });

  // Wallet updated (1250 - 400 = 850 xu), server refit triggered.
  const walletText = await page.locator(".market-wallet").textContent();
  assert.match(walletText ?? "", /850\s*xu/, `wallet is 850 xu: ${walletText}`);
  const refits = await page.evaluate(() => window.refits);
  assert.ok(refits >= 1, "buying paint triggers refit notification");

  // Poor paint (paint 7, 2.000 xu) shows insufficient coins message on tap.
  await page
    .locator('[data-kind="paint"] [data-tier="7"] button.upgrade-buy')
    .click({ force: true });
  await page
    .getByText("Chưa đủ xu", { exact: false })
    .waitFor({ state: "visible" });

  // Close shipyard and capture the painted 3D boat on the sea!
  await page.locator(".fish-store-close").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${output}/paint-sea-844x390.png` });

  assert.deepEqual(problems, [], `console/page errors: ${problems.join("; ")}`);
  await context.close();
} finally {
  await browser.close();
}
console.log("ocean-paint-browser: PASS");
