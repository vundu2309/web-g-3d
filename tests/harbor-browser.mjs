import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The front door and the way into the sea: a hub that loads nothing of the sea (no
// engine, no models), a sign-in screen of its own, and a loading screen that keeps the
// map and the controls away until everything is ready. Needs the dev server.
const browser = await launchBrowser();
const problems = [];
const heavy = /babylon|havok|\.wasm/i;

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  return { context, page, requests };
}

try {
  // 1. The hub fits phones in landscape and portrait, with real touch targets.
  for (const [w, h] of [
    [844, 390],
    [667, 375],
    [390, 844],
  ]) {
    const { context, page } = await open(w, h);
    const sizes = await page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          right: r.right,
          bottom: r.bottom,
          left: r.left,
          top: r.top,
        };
      };
      return {
        cta: box(document.querySelector(".hub-cta")),
        install: box(document.querySelector("[data-pwa-install]")),
        account: box(document.querySelector('[data-harbor="account"]')),
        scrollX: document.documentElement.scrollWidth - window.innerWidth,
        scrollY: document.documentElement.scrollHeight - window.innerHeight,
        cards: getComputedStyle(document.querySelector(".paper-card")).display,
      };
    });
    for (const key of ["cta", "install", "account"]) {
      assert.ok(
        sizes[key].h >= 44 && sizes[key].w >= 44,
        `${key} is a real touch target at ${w}x${h}`,
      );
      assert.ok(
        sizes[key].right <= w &&
          sizes[key].bottom <= h &&
          sizes[key].left >= 0 &&
          sizes[key].top >= 0,
        `${key} is inside the screen at ${w}x${h}`,
      );
    }
    assert.ok(
      sizes.scrollX <= 0 && sizes.scrollY <= 0,
      `nothing scrolls at ${w}x${h}`,
    );
    assert.ok(
      !/url\(/.test(
        await page.evaluate(
          () =>
            getComputedStyle(document.querySelector(".hub")).backgroundImage,
        ),
      ),
      "the hub shows no picture of the map",
    );
    assert.equal(
      sizes.cards,
      "none",
      "the old board-game paper cards are gone",
    );
    assert.equal(
      await page
        .getByRole("button", { name: /Cài/ })
        .getAttribute("aria-label"),
      "Cài lên điện thoại",
    );
    await context.close();
  }

  // 2. Nothing of the sea is fetched at the hub or on the sign-in screen, which is a
  //    screen of its own (full viewport), not a window over the hub.
  const { context, page, requests } = await open(844, 390);
  await page.waitForTimeout(800);
  assert.deepEqual(
    requests.filter((u) => heavy.test(u)),
    [],
    "no engine or model at the hub",
  );
  await page.getByRole("button", { name: "Ra khơi" }).click();
  const login = page.locator("dialog.account-screen");
  await login.waitFor();
  await page.getByRole("heading", { name: "Đăng nhập" }).waitFor();
  const frame = await login.boundingBox();
  assert.ok(
    frame.width >= 843 && frame.height >= 389,
    "the sign-in is a full screen",
  );
  assert.ok(
    !/url\(/.test(
      await login.evaluate((el) => getComputedStyle(el).backgroundImage),
    ),
    "the sign-in shows no picture of the map",
  );
  await page.waitForTimeout(800);
  assert.deepEqual(
    requests.filter((u) => heavy.test(u)),
    [],
    "still nothing heavy while signing in",
  );
  await page.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(
    requests.filter((u) => heavy.test(u)),
    [],
    "closing it started nothing either",
  );

  // 3. Setting out: a loading screen of its own until everything is ready.
  await page.evaluate(async () => {
    const { startOcean } = await import("/src/app/ocean.ts");
    const connect = (onBoats) =>
      new Promise((resolve) => {
        window.release = () => {
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
          resolve({
            uid: "me",
            pose: { x: 0, z: 0, heading: 0, fishing: false },
            dispose() {},
            publish: async () => {},
          });
        };
      });
    window.ready = false;
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      onScene: () => (window.ready = true),
    });
  });
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const loading = await page.evaluate(() => {
    const el = document.querySelector(".ocean-loading");
    const r = el.getBoundingClientRect();
    const visible = (selector) =>
      getComputedStyle(document.querySelector(selector)).visibility !==
      "hidden";
    return {
      opacity: getComputedStyle(el).opacity,
      picture: /url\(/.test(getComputedStyle(el).backgroundImage),
      // What is on top in the middle of the screen is the loading screen, not the map.
      covered: !!document
        .elementFromPoint(window.innerWidth / 2, window.innerHeight / 3)
        ?.closest(".ocean-loading"),
      covers: r.width >= window.innerWidth && r.height >= window.innerHeight,
      stick: visible(".ocean-stick"),
      fish: visible('[data-ocean="fish"]'),
      back: visible('[data-ocean="back"]'),
      bar: parseFloat(getComputedStyle(el).getPropertyValue("--progress")),
      steps: [...el.querySelectorAll("[data-step]")].map((s) => s.className),
    };
  });
  assert.equal(loading.opacity, "1");
  assert.ok(!loading.picture, "the loading screen shows no picture of the map");
  assert.ok(loading.covered, "and the map itself is fully covered by it");
  assert.ok(loading.covers, "the loading screen covers the whole screen");
  assert.equal(loading.stick, false, "no stick while loading");
  assert.equal(loading.fish, false, "no fishing button while loading");
  assert.equal(loading.back, true, "but the way back stays");
  assert.deepEqual(
    loading.steps,
    ["is-done", "is-active", ""],
    "graphics ready, connecting, then entering",
  );
  assert.ok(
    loading.bar > 0.3 && loading.bar < 1,
    `progress moves (${loading.bar})`,
  );
  await page.evaluate(() => window.release());
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () =>
      document.querySelector(".ocean-loading")?.hidden ||
      document.querySelector(".ocean-loading")?.classList.contains("is-done"),
    null,
    { timeout: 10000 },
  );
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.querySelector(".ocean-stick")).visibility,
    ),
    "visible",
    "the controls appear with the map",
  );
  await context.close();

  assert.deepEqual(problems, []);
  console.log(
    "Harbor: a hub that fits phones and fetches nothing heavy, a full-screen sign-in, and a loading screen that hides the map and controls until ready.",
  );
} finally {
  await browser.close();
}
