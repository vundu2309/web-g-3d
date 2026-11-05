import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// Real two-finger touches through CDP: one thumb on the stick, one on the fishing
// button, at the same time. Needs the dev server (imports the module from /src).
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.env.TEST_BASE_URL);
  await page.evaluate(async () => {
    const { bindStick } = await import("/src/ocean/stick.ts");
    document.body.innerHTML = `<style>
      body{margin:0}
      .ocean-stick{position:fixed;left:20px;bottom:20px;width:136px;height:136px;border-radius:50%;background:#ccc;touch-action:none}
      .ocean-stick-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:gold}
      #fish{position:fixed;right:20px;bottom:20px;width:140px;height:64px}
    </style>
    <div class="ocean-stick"><span class="ocean-stick-knob"></span></div>
    <button id="fish">Thả câu</button>`;
    window.fishClicks = 0;
    window.stick = { steer: 0, throttle: 0 };
    window.enabled = true;
    // Mirrors the game: the press acts, because a second finger yields no click.
    document.querySelector("#fish").addEventListener("pointerdown", () => {
      window.fishClicks++;
    });
    window.release = bindStick(
      document.querySelector(".ocean-stick"),
      document.querySelector(".ocean-stick-knob"),
      {
        enabled: () => window.enabled,
        onChange: (input) => {
          window.stick = input;
        },
        signal: new AbortController().signal,
      },
    );
  });
  const centre = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const stick = await centre(".ocean-stick");
  const fish = await centre("#fish");
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const read = () => page.evaluate(() => window.stick);

  // Thumb 1 drags up-right on the stick: runs and turns at once.
  await touch("touchStart", [{ x: stick.x + 30, y: stick.y - 40, id: 1 }]);
  let value = await read();
  assert.ok(value.steer > 0 && value.throttle > 0, JSON.stringify(value));
  assert.notEqual(
    await page.evaluate(
      () => document.querySelector(".ocean-stick-knob").style.transform,
    ),
    "",
    "knob follows the finger",
  );

  // Thumb 2 presses the fishing button while thumb 1 is still down.
  await touch("touchStart", [
    { x: stick.x + 30, y: stick.y - 40, id: 1 },
    { x: fish.x, y: fish.y, id: 2 },
  ]);
  assert.equal(await page.evaluate(() => window.fishClicks), 1);
  // Thumb 2 lifts; touchEnd lists the points that end.
  await touch("touchEnd", [{ x: fish.x, y: fish.y, id: 2 }]);
  value = await read();
  assert.ok(
    value.steer > 0 && value.throttle > 0,
    "stick still held after the button tap",
  );

  // Moving the first thumb to the lower left reverses and turns left.
  await touch("touchMove", [{ x: stick.x - 30, y: stick.y + 40, id: 1 }]);
  value = await read();
  assert.ok(value.steer < 0 && value.throttle < 0, JSON.stringify(value));

  // A second finger on the stick is ignored while the first holds it.
  await touch("touchStart", [
    { x: stick.x - 30, y: stick.y + 40, id: 1 },
    { x: stick.x + 40, y: stick.y, id: 3 },
  ]);
  assert.deepEqual(
    await read(),
    value,
    "extra finger does not hijack the stick",
  );
  await touch("touchEnd", [{ x: stick.x + 40, y: stick.y, id: 3 }]);

  // Letting go stops the boat and recentres the knob.
  await touch("touchEnd", [{ x: stick.x - 30, y: stick.y + 40, id: 1 }]);
  assert.deepEqual(await read(), { steer: 0, throttle: 0 });
  assert.equal(
    await page.evaluate(
      () => document.querySelector(".ocean-stick-knob").style.transform,
    ),
    "",
  );

  // A cancelled touch (system gesture) must also release, never leave the boat running.
  await touch("touchStart", [{ x: stick.x, y: stick.y - 50, id: 1 }]);
  assert.ok((await read()).throttle > 0);
  await touch("touchCancel", []);
  assert.deepEqual(await read(), { steer: 0, throttle: 0 });

  // While disabled (dialog open, disconnected) the stick ignores touches.
  await page.evaluate(() => {
    window.enabled = false;
  });
  await touch("touchStart", [{ x: stick.x, y: stick.y - 50, id: 1 }]);
  assert.deepEqual(await read(), { steer: 0, throttle: 0 });
  await touch("touchEnd", [{ x: stick.x, y: stick.y - 50, id: 1 }]);
  assert.deepEqual(errors, []);
  console.log(
    "Ocean stick: two real thumbs (turn+run with stick, tap fish), extra finger ignored, release/cancel/disabled passed.",
  );
} finally {
  await context.close();
  await browser.close();
}
