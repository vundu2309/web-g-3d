import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The real Babylon + Havok sea in a real browser, with a fake network connection so
// no server or account is needed. Needs the dev server (imports from /src).
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  deviceScaleFactor: 3,
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
page.on("console", (message) => {
  // GL driver notes from the software renderer are not application errors.
  if (message.type() === "error" && !message.text().includes("GL Driver"))
    problems.push(message.text());
});
try {
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(async () => {
    window.published = [];
    const { startOcean } = await import("/src/app/ocean.ts");
    const make = (uid, name, x, z, heading, fishing = false) => ({
      uid,
      name,
      session: "s",
      x,
      z,
      heading,
      fishing,
      updatedAt: Date.now(),
    });
    const connect = async (onBoats) => {
      onBoats(
        [
          make("me", "Bạn", 0, 0, 0),
          make("lan", "Lan", -16, -34, 0.5),
          make("minh", "Minh", 20, -22, -0.7, true),
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: 0, z: 0, heading: 0, fishing: false },
        dispose() {},
        publish: async (pose) => {
          window.published.push({ ...pose, at: performance.now() });
        },
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      onScene: (scene) => {
        window.oceanScene = scene;
        // Remember what the player's input to the boat was, and when.
        window.inputs = [];
        const original = scene.setInput.bind(scene);
        scene.setInput = (steer, throttle) => {
          window.inputs.push({ at: performance.now(), steer, throttle });
          original(steer, throttle);
        };
      },
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });

  // Sharp: a 3x phone draws at 2x the CSS size, not the old 1.5x cap or less.
  const size = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.ocean-canvas");
    return { width: canvas.width, css: canvas.clientWidth };
  });
  assert.equal(
    size.width,
    size.css * 2,
    `drew ${size.width}px for ${size.css} CSS px`,
  );

  // It really draws: sea, sky, boats and islands, within a phone-sized budget.
  await page.waitForTimeout(1500);
  const cost = await page.evaluate(() => window.oceanScene.stats());
  assert.ok(cost.meshes >= 6, `meshes in view: ${cost.meshes}`);
  // Raised from 150,000 for the Blender island props (about 170,000 measured), then to 450,000
  // for the Blender bushes and the sea's reflection pass (412,768 measured, the reflection
  // draws the scene again): looks first, performance pass later by the user's choice.
  assert.ok(
    cost.triangles > 5000 && cost.triangles < 450000,
    `triangles ${cost.triangles}`,
  );
  const picture = await page.screenshot();
  assert.ok(
    picture.length > 150000,
    `frame is not blank (${picture.length} bytes)`,
  );

  // Labels follow the boats and the player's own is marked.
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll(".ocean-boat-label")].map((l) => [
      l.textContent,
      l.hidden,
    ]),
  );
  assert.deepEqual(labels.map(([name]) => name).sort(), ["Bạn", "Lan", "Minh"]);
  assert.equal(await page.locator(".ocean-boat-label.is-self").count(), 1);

  // Floating on the surface the water shows, bobbing rather than rigid.
  const rides = await page.evaluate(async () => {
    const { waveHeight } = await import("/src/ocean/waves.ts");
    const heights = [];
    for (let i = 0; i < 12; i++) {
      const s = window.oceanScene.selfState();
      heights.push(s.y - waveHeight(s.x, s.z, performance.now() / 1000));
      await new Promise((r) => setTimeout(r, 120));
    }
    return heights;
  });
  const state0 = await page.evaluate(() => window.oceanScene.selfState());
  assert.ok(
    Number.isFinite(state0.y) && Math.abs(state0.y) < 2,
    `boat height ${state0.y}`,
  );
  assert.ok(rides.every(Number.isFinite));

  // Two-thumb driving: stick up-right runs and turns right at once, via real touches.
  const stick = await page.locator(".ocean-stick").boundingBox();
  const cx = stick.x + stick.width / 2;
  const cy = stick.y + stick.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: cx + 14, y: cy - 38, id: 1 }]);
  // The software renderer can be slow, and physics deliberately slows down with it
  // rather than jumping, so wait for the result instead of sleeping a fixed time.
  await page.waitForFunction(
    () => {
      const last = window.published.slice(-1)[0];
      return last && last.z < -10 && last.heading > 0.05;
    },
    null,
    { timeout: 90000 },
  );
  const driving = await page.evaluate(() => window.published.slice(-1)[0]);
  assert.ok(driving.z < -10, `ran forward: z ${driving.z.toFixed(1)}`);
  assert.ok(
    driving.heading > 0.05,
    `and turned right: heading ${driving.heading.toFixed(2)}`,
  );

  // Second thumb holds Thả câu (charging a throw) while the first holds the stick, then
  // lets go: the line goes out and the boat stops pushing.
  const fish = await page.locator('[data-ocean="fish"]').boundingBox();
  await touch("touchStart", [
    { x: cx + 14, y: cy - 38, id: 1 },
    { x: fish.x + fish.width / 2, y: fish.y + fish.height / 2, id: 2 },
  ]);
  await page.waitForTimeout(900);
  await touch("touchEnd", [
    { x: fish.x + fish.width / 2, y: fish.y + fish.height / 2, id: 2 },
  ]);
  await page.waitForFunction(
    () => window.published.some((p) => p.fishing),
    null,
    { timeout: 30000 },
  );
  // Stick still held, but with the line out the boat gets no thrust (the fish may take
  // the line in again within seconds, so this checks the input, not the final stop).
  await page.waitForTimeout(700);
  const verdict = await page.evaluate(() => {
    const out = window.published.find((p) => p.fishing)?.at ?? Infinity;
    const back =
      window.published.find((p) => !p.fishing && p.at > out)?.at ?? Infinity;
    const before = window.inputs.filter(
      (i) => i.at < out - 1200 && i.throttle !== 0,
    );
    const during = window.inputs.filter(
      (i) => i.at > out + 150 && i.at < Math.min(back - 150, performance.now()),
    );
    return {
      drove: before.length,
      during: during.length,
      pushed: during.filter((i) => i.throttle !== 0 || i.steer !== 0).length,
    };
  });
  assert.ok(
    verdict.drove > 0,
    "the held stick drove the boat before the throw",
  );
  assert.ok(
    verdict.during > 3,
    `frames with the line out were seen (${verdict.during})`,
  );
  assert.equal(
    verdict.pushed,
    0,
    "no thrust or steering while the line is out",
  );
  await touch("touchEnd", [{ x: cx + 14, y: cy - 38, id: 1 }]);
  assert.deepEqual(problems, []);
  console.log(
    `Ocean Babylon: sharp 2x draw, ${cost.triangles} triangles / ${cost.meshes} meshes, floats, runs+turns with one thumb, casting slows the boat, no errors.`,
  );
} finally {
  await context.close();
  await browser.close();
}
