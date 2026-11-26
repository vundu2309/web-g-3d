import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";
import { tap } from "./support/tap.mjs";

// The hourly event on the real scene with a fake connection: while the event is on and the ring is
// within sight the scene has its two meshes (the ring on the water and its beam), they are
// switched off when the window ends, `?event=0` leaves them out, and the Sự kiện page of the Sổ
// tells the time, how far the ring is and how many giants are left. The shared clock is set by hand.
// Needs the dev server.
const browser = await launchBrowser();
const problems = [];
const HOUR = 3_600_000;

async function open(query = "") {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(`${process.env.TEST_BASE_URL}/${query}`);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    const { startOcean } = await import("/src/app/ocean.ts");
    const { eventAt } = await import("/src/ocean/world-event.ts");
    const start = { x: 0, z: 22, heading: 0 };
    // An hour whose ring is within 600 m of the harbour, so it is in sight.
    let slot = Math.floor(Date.now() / 3_600_000) + 1;
    for (; ; slot++) {
      const ev = eventAt(slot * 3_600_000);
      if (Math.hypot(ev.x - start.x, ev.z - start.z) < 600) break;
    }
    window.eventHour = slot * 3_600_000;
    window.clockMs = window.eventHour + 5 * 60_000; // five minutes into the event
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Tôi",
            session: "s",
            ...start,
            fishing: false,
            updatedAt: Date.now(),
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { ...start, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      fightSpeed: 2,
      connect,
      // The one clock of the sea, the bites and the pages, set by the test.
      clock: () => window.clockMs,
      onScene: (s) => {
        window.oceanScene = s;
      },
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  return { page, context };
}
const ringOn = (page) =>
  page.evaluate(() => {
    const scene = window.oceanScene.scene;
    const ring = scene.getMeshByName("gear-ring-event");
    const beam = scene.getMeshByName("gear-ring-event-beam");
    return {
      ring: ring ? ring.isEnabled() : null,
      beam: beam ? beam.isEnabled() : null,
    };
  });

try {
  {
    const { page, context } = await open();
    await page.waitForFunction(
      () => window.oceanScene.scene.getMeshByName("gear-ring-event"),
      null,
      { timeout: 30000 },
    );
    assert.deepEqual(
      await ringOn(page),
      { ring: true, beam: true },
      "on while the event is on",
    );
    // The ring is where the clock says: the same place the pure function gives.
    const placed = await page.evaluate(async () => {
      const { eventAt } = await import("/src/ocean/world-event.ts");
      const ev = eventAt(window.clockMs);
      const ring = window.oceanScene.scene.getMeshByName("gear-ring-event");
      return {
        dx: ring.position.x - ev.x,
        dz: ring.position.z - ev.z,
        active: ev.active,
      };
    });
    assert.equal(placed.active, true);
    assert.ok(
      Math.abs(placed.dx) < 1e-6 && Math.abs(placed.dz) < 1e-6,
      "at the event's place",
    );
    // After the 20 minutes the ring goes out.
    await page.evaluate(
      () => (window.clockMs = window.eventHour + 25 * 60_000),
    );
    await page.waitForFunction(
      () =>
        window.oceanScene.scene.getMeshByName("gear-ring-event").isEnabled() ===
        false,
      null,
      { timeout: 30000 },
    );
    assert.deepEqual(
      await ringOn(page),
      { ring: false, beam: false },
      "off after the window",
    );
    // The Sự kiện page.
    await tap(page, page.locator('[data-ocean="catch"]'));
    const tab = page.locator('.hub-tab[data-hub="book"]');
    await tab.waitFor();
    await tap(page, tab);
    await tap(page, page.locator('.rank-tab[data-page="event"]'));
    await page.locator(".book-event").waitFor();
    assert.match(
      await page.locator(".book-event h3").innerText(),
      /^Sự kiện tiếp theo còn \d+ (phút|giờ)/,
    );
    await page.evaluate(() => (window.clockMs = window.eventHour + 5 * 60_000));
    // The page refreshes every 20 s; reopen it to read the event while it is on.
    await tap(page, page.locator('.hub-tab[data-hub="stock"]'));
    await tap(page, page.locator('.hub-tab[data-hub="book"]'));
    await page.locator(".book-event").waitFor();
    assert.match(
      await page.locator(".book-event h3").innerText(),
      /^Cá khổng lồ đang xuất hiện · còn 15 phút$/,
    );
    assert.match(
      await page.locator(".book-event-words p").first().innerText(),
      /^Vòng sáng cách bạn \d+ m, về phía /,
    );
    assert.match(
      await page.locator(".book-event-words").innerText(),
      /Bạn còn 3\/3 lượt/,
    );
    await context.close();
  }
  {
    const { page, context } = await open("?event=0");
    await page.waitForTimeout(3000);
    assert.deepEqual(
      await ringOn(page),
      { ring: null, beam: null },
      "?event=0 builds nothing",
    );
    await context.close();
  }
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean event: the ring and its beam show while the event is on, at its place, go out after 20 minutes, ?event=0 leaves them out, the Sự kiện page tells the time, the way and the giants left, no errors.",
  );
} finally {
  await browser.close();
}
