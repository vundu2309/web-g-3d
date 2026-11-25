import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// A reload resumes the boat from the position saved LAST: the device's copy (written when the
// page closes) or the server's (every 5 s, from a request a reload can cut off).
// Real scene, fake connection, in-memory economy. Needs the dev server.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const problems = [];

async function visit({ deviceAgeS, serverAgeS }) {
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  const spots = await page.evaluate(
    async ({ deviceAgeS, serverAgeS }) => {
      const { safePose, encodeSave, saveKey } = await import(
        "/src/ocean/save.ts"
      );
      const { memoryEconomy } = await import("/src/ocean/economy-api.ts");
      const { startOcean } = await import("/src/app/ocean.ts");
      const safe = [];
      for (let x = -300; x <= 300; x += 50)
        for (let z = -300; z <= 300; z += 50)
          if (safePose(x, z, 0)) safe.push({ x, z });
      const device = safe[0];
      const server = safe.find(
        (p) => Math.hypot(p.x - device.x, p.z - device.z) > 100,
      );
      localStorage.clear();
      localStorage.setItem(
        saveKey("me"),
        encodeSave(
          { x: device.x, z: device.z, heading: 0, caught: 0 },
          Date.now() - deviceAgeS * 1000,
        ),
      );
      let t = Date.now() - serverAgeS * 1000;
      const money = memoryEconomy({ now: () => t });
      await money.importLocal({}, 0);
      await money.savePose({ x: server.x, z: server.z, heading: 0 });
      t = Date.now();
      const connect = async (onBoats) => {
        onBoats(
          [
            {
              uid: "me",
              name: "Tôi",
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
          publish: async () => {},
        };
      };
      window.stop = startOcean(document.querySelector("#app"), () => {}, {
        connect,
        economy: money,
        onScene: (s) => (window.oceanScene = s),
      });
      return { device, server };
    },
    { deviceAgeS, serverAgeS },
  );
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  const at = await page.evaluate(() => {
    const s = window.oceanScene.selfState();
    return { x: s.x, z: s.z };
  });
  await page.close();
  return { spots, at };
}
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 15;

try {
  // The device saved 2 s ago, the server 25 s ago (a reload right after sailing): the device wins.
  const reload = await visit({ deviceAgeS: 2, serverAgeS: 25 });
  assert.ok(
    near(reload.at, reload.spots.device),
    `the reload resumes the newer device position, not the server's (${JSON.stringify(reload.at)})`,
  );
  // The other way round (sailed on another device since): the server's position wins.
  const other = await visit({ deviceAgeS: 3600, serverAgeS: 20 });
  assert.ok(
    near(other.at, other.spots.server),
    `a newer server position wins over an old device copy (${JSON.stringify(other.at)})`,
  );
  assert.deepEqual(problems, []);
  console.log(
    "Ocean resume pose: the position saved last (device or server) is where the boat starts, no errors.",
  );
} finally {
  await context.close();
  await browser.close();
}
