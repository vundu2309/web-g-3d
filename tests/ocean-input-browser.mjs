import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The sea's controls are only drawn; one transparent layer takes the touches. This is
// the player's complaint: holding a control must never open the browser's own long-press
// menu or cut the action short. Real touches through CDP, the real sea with a fake
// connection (no account). Needs the dev server (imports from /src).
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
    window.left = false;
    window.inputs = [];
    window.events = [];
    for (const type of ["pointerdown", "pointercancel", "contextmenu"])
      addEventListener(
        type,
        (event) =>
          window.events.push(
            `${type}:${event.target.className || event.target.tagName}`,
          ),
        true,
      );
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
    window.stop = startOcean(
      document.querySelector("#app"),
      () => {
        window.left = true;
      },
      {
        connect,
        onScene: (scene) => {
          const original = scene.setInput.bind(scene);
          scene.setInput = (steer, throttle) => {
            window.inputs.push({ steer, throttle });
            original(steer, throttle);
          };
        },
      },
    );
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });

  const centre = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const charging = () =>
    page.evaluate(() => {
      const power = document.querySelector(".fish-power");
      return !!power && !power.hidden;
    });
  // The bar is redrawn on the next frame, which is slow on a software renderer: wait for it.
  const settle = async (wanted, message) => {
    try {
      await page.waitForFunction(
        (want) => {
          const power = document.querySelector(".fish-power");
          return (!!power && !power.hidden) === want;
        },
        wanted,
        { timeout: 3000 },
      );
    } catch {
      /* the assertion below reports it */
    }
    assert.equal(await charging(), wanted, message);
  };
  const fish = await centre('[data-ocean="fish"]');

  // The controls are only drawn: nothing a finger can land on, hold or select.
  const drawn = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      const box = element.getBoundingClientRect();
      return {
        pointerEvents: getComputedStyle(element).pointerEvents,
        under: document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        )?.className,
      };
    };
    return {
      fish: read('[data-ocean="fish"]'),
      settings: read('[data-ocean="settings"]'),
      ring: read(".ocean-stick"),
    };
  });
  for (const [name, info] of Object.entries(drawn)) {
    assert.equal(info.pointerEvents, "none", `${name} only drawn`);
    assert.equal(
      info.under,
      "ocean-input",
      `${name}: the input layer is under the finger`,
    );
  }

  // 1. A long hold on the fishing button keeps charging; the browser menu is blocked.
  await page.evaluate(() => (window.events.length = 0));
  await touch("touchStart", [{ x: fish.x, y: fish.y, id: 1 }]);
  await page.waitForTimeout(600);
  await settle(true, "holding charges the throw");
  const blocked = await page.evaluate(({ x, y }) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });
    document.elementFromPoint(x, y).dispatchEvent(event);
    return event.defaultPrevented;
  }, fish);
  assert.equal(blocked, true, "the long-press menu is blocked on the control");
  await page.waitForTimeout(900);
  await settle(true, "still held after 1.5 s");
  assert.ok(
    !(await page.evaluate(() => window.events)).some((e) =>
      e.startsWith("pointercancel"),
    ),
    "no cancelled touch",
  );
  await touch("touchEnd", [{ x: fish.x, y: fish.y, id: 1 }]);
  await settle(false, "letting go ends the charge");
  // The throw left the line out; a tap reels it in so the next hold charges again.
  const reelIn = async () => {
    await touch("touchStart", [{ x: fish.x, y: fish.y, id: 9 }]);
    await touch("touchEnd", [{ x: fish.x, y: fish.y, id: 9 }]);
    await page.waitForTimeout(200);
  };
  await reelIn();

  // 2. A touch the system cancels counts as a lift: nothing is left held down.
  await page.evaluate(() => (window.inputs.length = 0));
  await touch("touchStart", [{ x: fish.x, y: fish.y, id: 2 }]);
  await page.waitForTimeout(300);
  await settle(true, undefined);
  await touch("touchCancel", []);
  await page.waitForTimeout(200);
  await settle(false, "cancel releases the fishing button");
  await reelIn();

  // 3. Two thumbs at once: the stick on the left, the fishing button on the right.
  const ring = await centre(".ocean-stick");
  await touch("touchStart", [{ x: ring.x + 30, y: ring.y - 40, id: 3 }]);
  await touch("touchStart", [
    { x: ring.x + 30, y: ring.y - 40, id: 3 },
    { x: fish.x, y: fish.y, id: 4 },
  ]);
  await page.waitForTimeout(300);
  await settle(true, "fishing while steering");
  const steering = await page.evaluate(() => window.inputs.at(-1));
  assert.ok(
    steering.steer > 0 && steering.throttle > 0,
    JSON.stringify(steering),
  );
  await touch("touchEnd", [{ x: fish.x, y: fish.y, id: 4 }]);
  await settle(false, undefined);
  await touch("touchEnd", [{ x: ring.x + 30, y: ring.y - 40, id: 3 }]);
  assert.deepEqual(await page.evaluate(() => window.inputs.at(-1)), {
    steer: 0,
    throttle: 0,
  });
  await reelIn();

  // 4. A tap on a drawn button works like a click, and reaches 44 px even if drawn smaller.
  const gear = await centre('[data-ocean="settings"]');
  await touch("touchStart", [{ x: gear.x, y: gear.y, id: 5 }]);
  await touch("touchEnd", [{ x: gear.x, y: gear.y, id: 5 }]);
  await page.locator("dialog.ocean-dialog[open]").waitFor();
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  // The way back is in Settings too.
  await touch("touchStart", [{ x: gear.x, y: gear.y, id: 6 }]);
  await touch("touchEnd", [{ x: gear.x, y: gear.y, id: 6 }]);
  await page.getByRole("button", { name: "Về sảnh" }).click();
  assert.equal(
    await page.evaluate(() => window.left),
    true,
    "back leaves the sea",
  );

  assert.deepEqual(problems, []);
  console.log(
    "Ocean input: controls only drawn, long hold keeps charging and the menu is blocked, cancel releases, two thumbs at once, taps work.",
  );
} finally {
  await context.close();
  await browser.close();
}
