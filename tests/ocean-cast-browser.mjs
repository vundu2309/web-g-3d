import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";
import { fightBot } from "./support/fight-bot.mjs";

// "Không ném được cần": the player cannot throw. This runs the throw the way a phone does: pointer events
// of type touch on the input layer, a quick tap and a hold, in the situations a player meets:
//   1. a quick tap from the harbor throws (a short throw);
//   2. right after a fish was landed and still hangs from the rod, a press KEEPS the fish and starts the
//      next throw (it used to keep the fish and swallow the press, so the button seemed dead);
//   3. facing an island, where the lure would land on the sand: the bar and the arc say so while the
//      button is held (red), and letting go shows a red bar and shakes the button, not nothing;
//   4. after the store was opened and closed, and with the first throw of a visit.
// Needs the dev server. Frames are slow under software WebGL, so every check waits on state, not time.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const problems = [];
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("GL Driver"))
    problems.push(m.text());
});

/** Enters the sea with a fake connection; `save` is the boat's saved place, if any. */
async function start(save) {
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate((saved) => {
    localStorage.clear();
    if (saved) localStorage.setItem("photyphu:sea:v1:me", saved);
  }, save ?? null);
  await page.evaluate(async () => {
    window.published = [];
    const { startOcean } = await import("/src/app/ocean.ts");
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Tôi",
            session: "s",
            x: 0,
            z: 22,
            heading: 0,
            fishing: false,
            updatedAt: Date.now(),
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: 0, z: 22, heading: 0, fishing: false },
        dispose() {},
        publish: async (pose) => {
          window.published.push(pose);
        },
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      fightSpeed: 2,
      connect,
      onScene: (s) => (window.oceanScene = s),
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
}

const fish = page.locator('[data-ocean="fish"]');
const label = () => fish.getAttribute("aria-label");
const phase = () => fish.evaluate((e) => e.dataset.phase);
/** A touch on the drawn fishing button, through the input layer. */
const touch = (type) =>
  page.evaluate((type) => {
    const box = document
      .querySelector('[data-ocean="fish"]')
      .getBoundingClientRect();
    document.querySelector(".ocean-input").dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 21,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      }),
    );
  }, type);
const waitPhase = (want, timeout = 30000) =>
  page.waitForFunction(
    (want) =>
      document.querySelector('[data-ocean="fish"]').dataset.phase === want,
    want,
    { timeout, polling: 20 },
  );
// The line is out when the button says so ("Thu cần"); the published pose lags by up to a second.
const lineOut = (out = true, timeout = 30000) =>
  page.waitForFunction(
    (want) =>
      (document.querySelector('[data-ocean="fish"]').dataset.phase !== "idle" &&
        document.querySelector('[data-ocean="fish"]').dataset.phase !==
          "charging") === want,
    out,
    { timeout, polling: 20 },
  );
const catches = () => page.locator("[data-catch]").innerText();

try {
  await start();

  // 1. The first throw of the visit, a quick tap: down and up at once.
  assert.equal(await label(), "Thả câu");
  assert.ok(
    await page.evaluate(() => window.oceanScene.gear !== undefined),
    "the fishing gear is built before the first throw (no hitch while the button is held)",
  );
  await touch("pointerdown");
  await touch("pointerup");
  await lineOut();
  assert.equal(await label(), "Thu cần", "a quick tap throws");
  // Pressing again reels the line in (before a bite it only reels in).
  await touch("pointerdown");
  await touch("pointerup");
  await lineOut(false);
  assert.equal(await label(), "Thả câu");

  // 2. A landed fish hangs from the rod: pressing the button keeps it and charges the next throw.
  let landed = false;
  for (let attempt = 0; attempt < 6 && !landed; attempt++) {
    await touch("pointerdown");
    await touch("pointerup");
    await lineOut();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const button = document.querySelector('[data-ocean="fish"]');
          const timer = setInterval(() => {
            if (!button.classList.contains("is-biting")) return;
            clearInterval(timer);
            const box = button.getBoundingClientRect();
            const init = {
              bubbles: true,
              pointerId: 9,
              pointerType: "touch",
              isPrimary: true,
              button: 0,
              clientX: box.x + box.width / 2,
              clientY: box.y + box.height / 2,
            };
            const layer = document.querySelector(".ocean-input");
            layer.dispatchEvent(new PointerEvent("pointerdown", init));
            layer.dispatchEvent(new PointerEvent("pointerup", init));
            resolve(true);
          }, 5);
        }),
    );
    await waitPhase("fighting", 8000).catch(() => {});
    if ((await phase()) === "fighting") await fightBot(page);
    landed = await page
      .locator(".fish-hang:not([hidden])")
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    // A snapped line or a fish that got away: throw again.
    if (!landed && (await phase()) !== "idle") {
      await touch("pointerdown");
      await touch("pointerup");
      await lineOut(false);
    }
  }
  assert.ok(landed, "a fish was landed");
  assert.equal(await catches(), "0", "the fish hangs, it is not kept yet");
  await touch("pointerdown");
  await page.locator(".fish-hang").waitFor({ state: "hidden" });
  assert.equal(await catches(), "1", "the press kept the fish");
  await waitPhase("charging", 20000);
  assert.equal(
    await label(),
    "Thả ra!",
    "and the same press started the next throw",
  );
  await touch("pointerup");
  await lineOut();
  assert.equal(await label(), "Thu cần", "letting go throws it");
  await touch("pointerdown");
  await touch("pointerup");
  await lineOut(false);

  // 3. After the store was opened and closed the throw still works.
  // (The drawn button takes a tap on the input layer, like a finger.)
  const box = await page.locator('[data-ocean="catch"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator("dialog[open]").waitFor();
  await page.locator(".fish-store-close").click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await touch("pointerdown");
  await touch("pointerup");
  await lineOut();
  await touch("pointerdown");
  await touch("pointerup");
  await lineOut(false);

  // 4. Facing an island close by (a saved place), the throw would land on the sand: the bar turns
  // red while held, and letting go answers with a red bar that stays a moment (and a shaking
  // button), never with nothing.
  const save = JSON.stringify({
    v: 1,
    savedAt: Date.now(),
    x: -29,
    z: -65,
    heading: -Math.PI / 2,
    caught: 0,
    fish: {},
  });
  await start(save);
  const blockedSeen = await page.evaluate(() => {
    const power = document.querySelector(".fish-power");
    window.__seen = { blocked: false, fizzle: false, shake: false };
    new MutationObserver(() => {
      if (power.classList.contains("is-blocked")) window.__seen.blocked = true;
      if (power.classList.contains("is-fizzle")) window.__seen.fizzle = true;
    }).observe(power, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(() => {
      if (
        document
          .querySelector('[data-ocean="fish"]')
          .classList.contains("is-shake")
      )
        window.__seen.shake = true;
    }).observe(document.querySelector('[data-ocean="fish"]'), {
      attributes: true,
      attributeFilter: ["class"],
    });
    return window.__seen;
  });
  void blockedSeen;
  const where = await page.evaluate(() => window.oceanScene.selfState());
  assert.ok(
    Math.hypot(where.x + 68, where.z + 65) < 40,
    `the boat is by island 0 (${where.x}, ${where.z})`,
  );
  await touch("pointerdown");
  await page.waitForFunction(() => window.__seen.blocked, null, {
    timeout: 30000,
    polling: 20,
  });
  await touch("pointerup");
  await page.waitForFunction(() => window.__seen.fizzle, null, {
    timeout: 10000,
    polling: 20,
  });
  const seen = await page.evaluate(() => window.__seen);
  assert.ok(seen.blocked, "the bar is red while a throw cannot land");
  assert.ok(seen.fizzle, "the red bar stays after letting go");
  assert.ok(seen.shake, "the button shakes");
  assert.equal(
    await page.evaluate(() => window.published.at(-1)?.fishing ?? false),
    false,
    "nothing was thrown",
  );
  await waitPhase("idle", 10000);
  assert.equal(await label(), "Thả câu", "the button is ready again");
  await page.waitForFunction(
    () => document.querySelector(".fish-power").hidden,
    null,
    { timeout: 10000 },
  );

  assert.deepEqual(problems, []);
  console.log(
    "Ocean cast: a quick tap throws, a press after a landed fish keeps it and charges the next throw, the store does not stop it, and a throw toward an island answers in red.",
  );
} finally {
  await context.close();
  await browser.close();
}
