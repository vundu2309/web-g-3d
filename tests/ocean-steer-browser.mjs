import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The player's report: steering with the keyboard (or the stick) while dragging the camera
// made the boat stall, turn abruptly, slide off its heading and wander. Real keys and mouse,
// then two real fingers (the stick and a camera drag) through CDP, on the real sea with a
// fake connection. Needs the dev server (imports from /src).
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
try {
  await page.goto(process.env.TEST_BASE_URL);
  await page
    .getByRole("button", { name: /Ra khơi/ })
    .first()
    .waitFor();
  await page.evaluate(async () => {
    const { startOcean } = await import("/src/app/ocean.ts");
    window.inputs = [];
    window.frames = [];
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Bạn",
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
      onScene: (scene) => {
        window.oceanScene = scene;
        const original = scene.setInput.bind(scene);
        scene.setInput = (steer, throttle) => {
          window.inputs.push({ steer, throttle });
          original(steer, throttle);
        };
        const update = scene.update.bind(scene);
        scene.update = (...args) => {
          update(...args);
          const s = scene.selfState();
          if (s)
            window.frames.push({
              t: performance.now(),
              ...s,
              yaw: scene.orbit.yaw,
              holding: scene.orbit.holding,
            });
        };
      },
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  const wrap = (a) =>
    a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  const mark = () => page.evaluate(() => window.frames.length);
  const since = (from) => page.evaluate((i) => window.frames.slice(i), from);
  const settle = async () => {
    await page.evaluate(() => window.oceanScene.orbit.reset());
    await page.waitForFunction(
      () => {
        const s = window.oceanScene.selfState();
        return Math.hypot(s.forwardSpeed, s.sideSpeed) < 0.6;
      },
      null,
      { timeout: 30000 },
    );
  };
  const slipOf = (frames) =>
    Math.max(
      0,
      ...frames
        .filter((f) => f.forwardSpeed > 5)
        .map((f) =>
          Math.abs((Math.atan2(f.sideSpeed, f.forwardSpeed) * 180) / Math.PI),
        ),
    );

  // 1. Keyboard straight ahead while the mouse swings the camera all the way round: the
  // boat keeps its heading and its speed, whatever the camera shows.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(2500);
  let from = await mark();
  await page.mouse.move(100, 200);
  await page.mouse.down();
  let yawMin = 0;
  let yawMax = 0;
  for (let px = 0; px <= 640; px += 40) {
    await page.mouse.move(100 + px, 200);
    await page.waitForTimeout(250);
    const yaw = await page.evaluate(() => window.oceanScene.orbit.yaw);
    yawMin = Math.min(yawMin, yaw);
    yawMax = Math.max(yawMax, yaw);
  }
  await page.mouse.up();
  let frames = await since(from);
  await page.keyboard.up("ArrowUp");
  assert.ok(
    yawMax - yawMin > 2,
    `the camera swung ${(yawMax - yawMin).toFixed(1)} rad`,
  );
  const drift = Math.max(
    ...frames.map((f) => Math.abs(wrap(f.heading - frames[0].heading))),
  );
  assert.ok(
    drift < 0.12,
    `the heading does not follow the camera (${drift.toFixed(3)} rad)`,
  );
  assert.ok(
    Math.min(...frames.map((f) => f.forwardSpeed)) >
      0.8 * frames[0].forwardSpeed,
    "the boat does not stall while the camera is dragged",
  );
  assert.ok(
    Math.max(...frames.map((f) => Math.abs(f.sideSpeed))) < 1.2,
    "and does not slide",
  );
  await settle();

  // 2. Keyboard full turn (up + right) while the mouse drags: steady input, a steady turn
  // that goes where it points (it slid 20 to 27 degrees off its heading before).
  await page.evaluate(() => (window.inputs.length = 0));
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2000);
  from = await mark();
  await page.mouse.move(500, 200);
  await page.mouse.down();
  const end = Date.now() + 7000;
  for (let k = 0; Date.now() < end; k++) {
    await page.mouse.move(
      500 + 120 * Math.sin(k / 6),
      200 + 20 * Math.sin(k / 9),
    );
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  frames = await since(from);
  const used = await page.evaluate(() => [
    ...new Set(window.inputs.map((i) => JSON.stringify(i))),
  ]);
  assert.deepEqual(used.slice(-1), [JSON.stringify({ steer: 1, throttle: 1 })]);
  assert.ok(
    !used.some((u) => u.includes('"throttle":0')),
    `the throttle never drops while the mouse drags: ${used.join(" ")}`,
  );
  const slip = slipOf(frames);
  assert.ok(
    slip < 12,
    `the boat goes where it points: course within ${slip.toFixed(1)} deg of the heading`,
  );
  await page.keyboard.up("ArrowUp");
  await page.keyboard.up("ArrowRight");
  await settle();

  // 3. Two real fingers: the stick on the left and a camera drag across the sea (and across
  // the stick's own corner). Steering never changes because the camera finger moves, ends or is
  // cancelled, and the camera finger never lets the stick go.
  const ringBox = await page.locator(".ocean-stick").boundingBox();
  const ring = {
    x: ringBox.x + ringBox.width / 2,
    y: ringBox.y + ringBox.height / 2,
  };
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const stickAt = { x: ring.x + 24, y: ring.y - 40, id: 1 };
  await page.evaluate(() => (window.inputs.length = 0));
  await touch("touchStart", [stickAt]);
  await page.waitForTimeout(400);
  const held = await page.evaluate(() => window.inputs.at(-1));
  assert.ok(held.steer > 0 && held.throttle > 0, JSON.stringify(held));
  await page.evaluate(() => (window.inputs.length = 0));
  from = await mark();
  const cameraAt = (x, y) => ({ x, y, id: 2 });
  await touch("touchStart", [stickAt, cameraAt(560, 200)]);
  for (let k = 0; k < 40; k++) {
    // The camera finger sweeps over the open sea and, for a while, across the stick's corner.
    const x =
      k < 25 ? 560 + 150 * Math.sin(k / 4) : ring.x + 120 * Math.sin(k / 3);
    await touch("touchMove", [
      stickAt,
      cameraAt(x, 200 + 25 * Math.sin(k / 5)),
    ]);
    await page.waitForTimeout(60);
    assert.equal(
      await page.locator(".ocean-stick.is-active").count(),
      1,
      "the stick stays held while the camera finger moves",
    );
  }
  const steady = await page.evaluate(() => [
    ...new Set(window.inputs.map((i) => JSON.stringify(i))),
  ]);
  assert.equal(
    steady.length,
    1,
    `the steering never changed: ${steady.join(" ")}`,
  );
  frames = await since(from);
  assert.ok(
    frames.some((f) => Math.abs(f.yaw) > 0.3),
    "the camera finger did turn the camera",
  );
  // The camera finger lifts: the stick is still held and the view is released.
  await touch("touchEnd", [cameraAt(560, 200)]);
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".ocean-stick.is-active").count(), 1);
  assert.equal(
    await page.evaluate(() => window.oceanScene.orbit.holding),
    false,
    "the camera finger is up",
  );
  assert.equal(
    new Set(
      await page.evaluate(() => window.inputs.map((i) => JSON.stringify(i))),
    ).size,
    1,
    "lifting the camera finger changed nothing",
  );
  // The camera finger comes back, then the stick finger lifts first: the boat stops
  // steering at once and the camera finger keeps looking.
  await touch("touchStart", [stickAt, cameraAt(600, 220)]);
  await touch("touchMove", [stickAt, cameraAt(650, 220)]);
  await touch("touchEnd", [stickAt]);
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => window.inputs.at(-1)), {
    steer: 0,
    throttle: 0,
  });
  assert.equal(await page.locator(".ocean-stick.is-active").count(), 0);
  assert.equal(
    await page.evaluate(() => window.oceanScene.orbit.holding),
    true,
  );
  await touch("touchEnd", []);
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => window.oceanScene.orbit.holding),
    false,
  );
  assert.deepEqual(problems, []);
  console.log(
    "Ocean steer: keys and mouse drag keep heading, speed and course; two fingers keep the stick; the stick lets go only with its own finger.",
  );
} finally {
  await context.close();
  await browser.close();
}
