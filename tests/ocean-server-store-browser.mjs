import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";

// The fish store kept on the server (decision 0016), on the real scene with a fake connection
// and an in-memory economy that follows the server's rules: entering shows the server's fish
// and records, the fish store kept on the device is moved once (and then not kept there), the
// boat resumes where the server saved it, putting a fish back removes one from the ledger, and
// an economy that cannot read the profile leaves the device store as it was. Needs the dev server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

async function open({ profileFails = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
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
    async ({ profileFails }) => {
      const { startOcean } = await import("/src/app/ocean.ts");
      const { memoryEconomy, EconomyError } = await import(
        "/src/ocean/economy-api.ts"
      );
      const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
      let clock = 0;
      const money = memoryEconomy({ now: () => clock });
      // Server side: two lobsters already in the ledger, a record, and a saved position.
      for (const kg of [2.5, 4.5]) {
        clock += 10000;
        await money.recordCatch({ species: "tom-hum", kg });
      }
      await money.savePose({ x: 40, z: 60, heading: 0.5 });
      // Device side: an old store of 3 madeka and 1 shark that the server has never seen, and
      // a different boat position (the server's wins).
      localStorage.setItem(
        saveKey("me"),
        encodeSave({
          x: -40,
          z: -60,
          heading: 1,
          caught: 9,
          fish: {
            "ca-madeka": { n: 3, best: 0.05 },
            "ca-map": { n: 1, best: 80 },
          },
        }),
      );
      const economy = profileFails
        ? {
            ...money,
            profile: async () => {
              throw new EconomyError("closed");
            },
          }
        : money;
      window.money = money;
      const start = { x: 40, z: 60, heading: 0.5 };
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
        economy,
        onScene: (s) => (window.oceanScene = s),
      });
    },
    { profileFails },
  );
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  return { page, context };
}

try {
  // 1. The server's store wins, the device's old fish moved over, once.
  {
    const { page, context } = await open();
    const total = await page.locator("[data-catch]").textContent();
    assert.equal(total, "6", "2 lobsters + 3 madeka + 1 shark in one store");
    const server = await page.evaluate(async () => {
      const state = await window.money.state();
      const profile = await window.money.profile();
      return { ledger: state.ledger.length, profile };
    });
    assert.equal(server.ledger, 6, "the old fish are in the server's ledger");
    assert.equal(server.profile.imported, true);
    assert.equal(server.profile.caught, 9, "the count rose to the device's");
    assert.equal(server.profile.records["ca-map"], 80);
    const kept = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.includes(":me"));
      return JSON.parse(localStorage.getItem(key)).fish;
    });
    assert.deepEqual(kept, {}, "no second copy of the store on the device");
    const pose = await page.evaluate(() => window.oceanScene.selfState());
    assert.ok(
      Math.hypot(pose.x - 40, pose.z - 60) < 30,
      `the boat resumes at the server's position, not ${pose.x},${pose.z}`,
    );
    // Putting one lobster back removes the lightest from the ledger.
    await tap(page, page.locator('[data-ocean="catch"]'));
    await page.locator(".fish-cell").first().waitFor();
    const before = await page.locator(".fish-cell").count();
    await page.locator(".fish-release").first().click();
    await page.waitForFunction(
      async () => (await window.money.state()).ledger.length === 5,
      null,
      { timeout: 10000 },
    );
    assert.ok(before >= 1);
    await page.screenshot({ path: `${output}/server-store.png` });
    await context.close();
  }
  // 2. A server that cannot read the profile: the device store stays as it was.
  {
    const { page, context } = await open({ profileFails: true });
    assert.equal(
      await page.locator("[data-catch]").textContent(),
      "4",
      "the device's 3 madeka + 1 shark, nothing from the server",
    );
    const ledger = await page.evaluate(
      async () => (await window.money.state()).ledger.length,
    );
    assert.equal(ledger, 2, "nothing was moved");
    await context.close();
  }
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean server store: the server's fish and records win, the device's old fish move once and are not kept twice, the boat resumes at the server's position, putting back edits the ledger, an unreadable profile keeps the device store, no errors.",
  );
} finally {
  await browser.close();
}
