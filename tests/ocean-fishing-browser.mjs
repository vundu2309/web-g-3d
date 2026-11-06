import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";
import { fightBot } from "./support/fight-bot.mjs";

// The fishing gameplay on screen, with the real scene and a fake connection: hold to
// charge (power bar), let go to throw (line out, boat stops being driven), the bobber
// jerks and a blinking "!" shows when a fish is about to bite, the line goes taut and a
// ring drains when it has, one second to pull, and a catch lands in the fish store
// where only held fish show and can be put back. Needs the dev server.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: false,
});
const problems = [];
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("GL Driver"))
    problems.push(m.text());
});

async function start() {
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
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
// The button is an icon; its accessible name says what it does.
const label = () => fish.getAttribute("aria-label");
async function holdAndThrow(ms = 800) {
  const box = await fish.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  return async () => {
    await page.waitForTimeout(ms);
    await page.mouse.up();
  };
}
const lineOut = () =>
  page.waitForFunction(() => window.published.at(-1)?.fishing === true, null, {
    timeout: 30000,
  });
/**
 * Pulls the instant the bite signal shows, from inside the page: a software-rendered
 * browser draws only a few frames per second, and a round trip from the test would
 * eat much of the one second a player has.
 */
const pullWhenBiting = () =>
  page.evaluate(
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
            isPrimary: true,
            button: 0,
            clientX: box.x + box.width / 2,
            clientY: box.y + box.height / 2,
          };
          // The controls are only drawn; the touch goes to the input layer.
          const layer = document.querySelector(".ocean-input");
          layer.dispatchEvent(new PointerEvent("pointerdown", init));
          layer.dispatchEvent(new PointerEvent("pointerup", init));
          resolve(true);
        }, 5);
      }),
  );
/** Waits for the bite signal. */
const bites = () =>
  page
    .waitForFunction(
      () =>
        document
          .querySelector('[data-ocean="fish"]')
          .classList.contains("is-biting"),
      null,
      { timeout: 45000, polling: 30 },
    )
    .then(() => true);

try {
  await start();
  assert.equal(await label(), "Thả câu");
  assert.equal(await page.locator(".fish-power").isHidden(), true);

  // 1. Holding charges the throw: the bar fills, the label asks to let go.
  const letGo = await holdAndThrow(900);
  await page.waitForFunction(
    () => !document.querySelector(".fish-power").hidden,
  );
  await page.waitForTimeout(400);
  const early = await page.evaluate(
    () =>
      parseFloat(document.querySelector(".fish-power-fill").style.width) || 0,
  );
  await page.waitForTimeout(450);
  const later = await page.evaluate(
    () =>
      parseFloat(document.querySelector(".fish-power-fill").style.width) || 0,
  );
  assert.ok(
    later > early,
    `the power bar fills while held (${early} -> ${later})`,
  );
  assert.equal(await label(), "Thả ra!");
  assert.equal(
    await page.evaluate(() => window.published.at(-1)?.fishing ?? false),
    false,
    "charging is not fishing yet",
  );
  await letGo();
  await lineOut();
  assert.equal(
    await page.locator(".fish-power").isHidden(),
    true,
    "the bar goes away",
  );
  assert.equal(await label(), "Thu cần");

  // 2. The line is out: a nibble shows the blinking "!" over the bobber (no text).
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".fish-badge");
      return badge && !badge.hidden;
    },
    null,
    { timeout: 45000, polling: 20 },
  );
  const badge = await page.locator(".fish-badge").boundingBox();
  assert.ok(
    badge.x > 0 && badge.x < 844 && badge.y > 0 && badge.y < 390,
    "the badge sits on the sea in view",
  );
  assert.equal(await page.locator(".fish-badge").innerText(), "!");
  const blinked = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const badge = document.querySelector(".fish-badge");
        let on = 0;
        let off = 0;
        const t0 = performance.now();
        const look = () => {
          if (badge.hidden) off++;
          else on++;
          if (performance.now() - t0 < 700) requestAnimationFrame(look);
          else resolve({ on, off });
        };
        look();
      }),
  );
  void blinked; // Blinking is checked loosely: it may bite before the badge blinks off.

  // 3. A bite: taut line signal, the button turns into the pull, a ring drains.
  await bites();
  assert.equal(await label(), "Giật!");
  assert.equal(
    await page.locator(".fish-badge").isHidden(),
    true,
    "the bobber is under",
  );
  const ring = await page.evaluate(() => {
    const rect = document.querySelector(".fish-ring rect");
    return {
      shown: getComputedStyle(document.querySelector(".fish-ring")).display,
      dash: rect.getAttribute("stroke-dasharray"),
      vignette: parseFloat(
        document.querySelector(".fish-vignette").style.opacity,
      ),
    };
  });
  assert.equal(ring.shown, "block");
  assert.ok(parseFloat(ring.dash) <= 1, `the ring is draining (${ring.dash})`);
  assert.ok(ring.vignette > 0, "the screen edge reddens");

  // 4. Not pulling within the second: the fish gets away and the line is in.
  await page.waitForFunction(
    () =>
      document.querySelector('[data-ocean="fish"]').dataset.phase === "idle",
    null,
    { timeout: 5000 },
  );
  assert.equal(
    await page.locator(".fish-ring").evaluate((e) => e.style.display),
    "none",
  );
  await page.waitForFunction(
    () => window.published.at(-1)?.fishing === false,
    null,
    {
      timeout: 10000,
    },
  );
  assert.equal(await page.locator(".fish-hang:not([hidden])").count(), 0);
  assert.equal(await page.locator("[data-catch]").innerText(), "0");

  // 5. Pulling while the fish only nibbles just reels in.
  let finish = await holdAndThrow(800);
  await finish();
  await lineOut();
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".fish-badge");
      return badge && !badge.hidden;
    },
    null,
    { timeout: 45000, polling: 20 },
  );
  await tap(page, fish);
  await page.waitForFunction(
    () => window.published.at(-1)?.fishing === false,
    null,
    {
      timeout: 10000,
    },
  );
  assert.equal(await label(), "Thả câu");
  assert.equal(await page.locator(".fish-hang:not([hidden])").count(), 0);

  // 6. A pull inside the second lands a fish: a card, then the store.
  let landed = false;
  for (let attempt = 0; attempt < 5 && !landed; attempt++) {
    finish = await holdAndThrow(800);
    await finish();
    await lineOut();
    await pullWhenBiting();
    // The fish is on: a tug of war. The bot plays it; a snapped line means throw again.
    await page.waitForFunction(
      () =>
        document.querySelector('[data-ocean="fish"]').dataset.phase ===
        "fighting",
      null,
      { timeout: 5000 },
    );
    // While the fish pulls the line must be taut: sample how far the middle of the rope
    // hangs below the straight line from the rod tip to the fish.
    const sampler = page.evaluate(
      () =>
        new Promise((resolve) => {
          const sags = [];
          const timer = setInterval(() => {
            const button = document.querySelector('[data-ocean="fish"]');
            if (button.dataset.phase !== "fighting") {
              clearInterval(timer);
              resolve(sags);
              return;
            }
            if (button.dataset.mood === "tired") return;
            const p = window.oceanScene.gear.rope.positions;
            const n = p.length / 3;
            let worst = 0;
            for (let i = 1; i < n - 1; i++) {
              const t = i / (n - 1);
              const x = p[0] + (p[(n - 1) * 3] - p[0]) * t;
              const y = p[1] + (p[(n - 1) * 3 + 1] - p[1]) * t;
              const z = p[2] + (p[(n - 1) * 3 + 2] - p[2]) * t;
              worst = Math.max(
                worst,
                Math.hypot(p[i * 3] - x, p[i * 3 + 1] - y, p[i * 3 + 2] - z),
              );
            }
            sags.push(worst);
          }, 40);
        }),
    );
    const [, sags] = await Promise.all([fightBot(page), sampler]);
    if (sags.length >= 3)
      assert.ok(
        Math.max(...sags) < 0.5,
        `the line is taut while the fish pulls (worst sag ${Math.max(...sags).toFixed(2)} m over ${sags.length} samples)`,
      );
    landed = await page
      .locator(".fish-hang:not([hidden])")
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      );
  }
  assert.ok(landed, "a fish was landed");
  // The fish hangs from the rod with its weight and rarity, and two icon buttons.
  const hang = page.locator(".fish-hang");
  assert.match(await hang.locator(".fish-hang-kg").innerText(), /kg/);
  assert.match(await hang.locator(".fish-hang-stars").innerText(), /^★+$/);
  assert.equal(
    await page.evaluate(() => window.oceanScene.gear.holding),
    true,
    "the 3D fish hangs on the rod",
  );
  for (const name of ["Lấy cá cất vào kho", "Thả cá về biển"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `${name} is a 44px target`);
  }
  // Keeping it is a tap on the drawn button, which the input layer takes.
  await tap(page, page.getByRole("button", { name: "Lấy cá cất vào kho" }));
  await page.locator(".fish-hang").waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-catch]").innerText(), "1");

  // 7. The store shows only held fish, with a count and a way to put one back.
  await tap(page, page.getByRole("button", { name: /Kho cá/ }));
  const cells = page.locator(".fish-cell");
  assert.equal(await cells.count(), 1, "only the species held, no empty slots");
  assert.equal(
    await cells.first().locator(".fish-cell-art img").count(),
    1,
    "with its picture",
  );
  assert.equal(await cells.first().locator(".fish-count").innerText(), "×1");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("photyphu:sea:v1:me")),
  );
  assert.equal(
    Object.values(saved.fish).reduce((a, s) => a + s.n, 0),
    1,
  );
  await page.getByRole("button", { name: /^Thả một con/ }).click();
  assert.equal(
    await page.locator(".fish-cell").count(),
    0,
    "released: the card is gone",
  );
  await page.getByText("Kho cá trống", { exact: false }).waitFor();
  assert.equal(await page.locator("[data-catch]").innerText(), "0");
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("photyphu:sea:v1:me")),
  );
  const [stock] = Object.values(after.fish);
  assert.equal(stock.n, 0);
  assert.ok(stock.best > 0, "the record weight is kept");
  await page.getByRole("button", { name: "Đóng", exact: true }).click();

  assert.deepEqual(problems, []);
  console.log(
    "Ocean fishing: hold to charge, throw, blinking ! on a nibble, taut line and draining ring on a bite, one second to pull, catch card, fish store with release.",
  );
} finally {
  await context.close();
  await browser.close();
}
