import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// A player who is not online keeps the boat where it was left: it is drawn with a dimmer name and
// "ngoại tuyến", it is never fishing, it is not hidden for being silent, it is not counted among the
// players online, and it is a hard obstacle. A real browser and a fake connection that hands over a
// parked boat 14 m straight ahead of the player's own boat.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: false,
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
try {
  await page.goto(`${process.env.TEST_BASE_URL}?daytime=12&weather=clear`);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(async () => {
    const { startOcean } = await import("/src/app/ocean.ts");
    const { spawn } = await import("/src/ocean/model.ts");
    // The account's own start (the game resumes there), and a parked boat 14 m dead ahead of it
    // (the bow points to -z at heading 0).
    const start = spawn("me");
    window.parkedAt = { x: start.x, z: start.z - 14 };
    const hour = 3600 * 1000;
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Bạn",
            session: "s",
            x: start.x,
            z: start.z,
            heading: 0,
            fishing: false,
            updatedAt: Date.now(),
            tier: 0,
            rod: 0,
          },
          {
            uid: "lan",
            name: "Lan",
            session: "",
            x: window.parkedAt.x,
            z: window.parkedAt.z,
            heading: Math.PI / 2,
            fishing: true,
            updatedAt: Date.now() - hour,
            tier: 1,
            rod: 0,
            offline: true,
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: start.x, z: start.z, heading: 0, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      onScene: (scene) => (window.oceanScene = scene),
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);

  // Drawn, named as offline, and not counted among the players online.
  const label = page.locator('.ocean-boat-label[data-uid="lan"]');
  await label.waitFor({ timeout: 20000 });
  assert.equal(await label.textContent(), "Lan · ngoại tuyến");
  assert.equal(
    await label.evaluate((el) => el.classList.contains("is-offline")),
    true,
  );
  assert.equal(await page.locator("[data-count]").textContent(), "1 thuyền");
  const moored = await page.evaluate(() => {
    const scene = window.oceanScene.scene;
    const node = scene.getTransformNodeByName("boat-lan");
    return { exists: !!node, fishing: !!scene.getMeshByName("boat-lan-line") };
  });
  assert.equal(moored.exists, true, "the parked boat is in the scene");
  assert.equal(moored.fishing, false, "and has no line out");

  // A hard obstacle: driving straight at it, the hull is stopped (or pushed round the end of it) and
  // never gets near the parked boat's centre. Without the obstacle the course passes through it.
  await page.keyboard.down("ArrowUp");
  const closest = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let nearest = Infinity;
        const timer = setInterval(() => {
          const state = window.oceanScene.selfState();
          nearest = Math.min(
            nearest,
            Math.hypot(
              state.x - window.parkedAt.x,
              state.z - window.parkedAt.z,
            ),
          );
        }, 50);
        setTimeout(() => {
          clearInterval(timer);
          resolve(nearest);
        }, 14000);
      }),
  );
  await page.keyboard.up("ArrowUp");
  // A boat's bow is 3.7 m from its centre and the parked boat is 3.3 m thick: touching is about 5 m.
  assert.ok(
    closest > 3.5,
    `the hull never gets to the parked boat's centre (closest ${closest.toFixed(1)} m)`,
  );
  assert.deepEqual(problems, []);
  console.log(`parked boat: closest centre ${closest.toFixed(1)} m`);
} finally {
  await browser.close();
}
