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

  // Floating mode: with a touch zone, a touch away from the ring moves the ring under
  // the thumb, steering is measured from there, and it goes home on release.
  await page.evaluate(async () => {
    const { bindStick } = await import("/src/ocean/stick.ts");
    window.enabled = true;
    window.stick = { steer: 0, throttle: 0 };
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="zone" style="position:fixed;left:0;bottom:0;width:48%;height:66%;touch-action:none"></div>',
    );
    // The ring sits above the zone, as in the game.
    document.querySelector(".ocean-stick").style.zIndex = "2";
    window.releaseFloating = bindStick(
      document.querySelector(".ocean-stick"),
      document.querySelector(".ocean-stick-knob"),
      {
        zone: document.querySelector("#zone"),
        enabled: () => window.enabled,
        onChange: (input) => {
          window.stick = input;
        },
        signal: new AbortController().signal,
      },
    );
  });
  const ringHome = await page.locator(".ocean-stick").boundingBox();
  const grab = { x: 330, y: 200 };
  await touch("touchStart", [{ x: grab.x, y: grab.y, id: 5 }]);
  const moved = await page.locator(".ocean-stick").boundingBox();
  assert.ok(
    Math.abs(moved.x + moved.width / 2 - grab.x) < 2 &&
      Math.abs(moved.y + moved.height / 2 - grab.y) < 2,
    `ring centred on the thumb: ${JSON.stringify(moved)}`,
  );
  assert.deepEqual(
    await read(),
    { steer: 0, throttle: 0 },
    "no input at the grab point",
  );
  await touch("touchMove", [{ x: grab.x + 40, y: grab.y - 40, id: 5 }]);
  value = await read();
  assert.ok(value.steer > 0 && value.throttle > 0, JSON.stringify(value));
  await touch("touchEnd", [{ x: grab.x + 40, y: grab.y - 40, id: 5 }]);
  assert.deepEqual(await read(), { steer: 0, throttle: 0 });
  const back = await page.locator(".ocean-stick").boundingBox();
  assert.ok(
    Math.abs(back.x - ringHome.x) < 1 && Math.abs(back.y - ringHome.y) < 1,
    "ring returns home on release",
  );
  // A touch on the ring itself still uses the home position.
  await touch("touchStart", [
    { x: ringHome.x + 68 + 30, y: ringHome.y + 68, id: 6 },
  ]);
  const onRing = await page.locator(".ocean-stick").boundingBox();
  assert.ok(
    Math.abs(onRing.x - ringHome.x) < 1,
    "ring does not jump when grabbed",
  );
  assert.ok((await read()).steer > 0);
  await touch("touchEnd", [
    { x: ringHome.x + 68 + 30, y: ringHome.y + 68, id: 6 },
  ]);
  // The fishing side of the screen is outside the zone and never steers.
  await touch("touchStart", [{ x: fish.x, y: fish.y, id: 7 }]);
  assert.deepEqual(await read(), { steer: 0, throttle: 0 });
  await touch("touchEnd", [{ x: fish.x, y: fish.y, id: 7 }]);
  assert.deepEqual(errors, []);
  console.log(
    "Ocean stick: two real thumbs (turn+run with stick, tap fish), extra finger ignored, release/cancel/disabled, floating ring under the thumb passed.",
  );
} finally {
  await context.close();
  await browser.close();
}
