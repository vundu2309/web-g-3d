import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
import { FAST_SEA } from "./support/fast-sea.mjs";

// The arrow to a player who is off screen is never covered by the minimap. A real browser, the real
// sea scene placing the label, a fake connection with one online player 300 m away, 52 degrees right
// of the bow: the arrow then belongs in the top right corner of the ring, where the minimap is.
// The sizes are the phones' (the last case is a portrait phone with a notch, which pushes the
// minimap down into the ring's corner).
const SIZES = [
  { width: 844, height: 390, safeTop: 0 },
  { width: 932, height: 430, safeTop: 0 },
  { width: 667, height: 375, safeTop: 0 },
  { width: 390, height: 844, safeTop: 0 },
  { width: 390, height: 844, safeTop: 47 },
];
const BEARING = (52 * Math.PI) / 180;
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];
const failures = [];
const summary = [];
const started = Date.now();
try {
  const context = await browser.newContext({
    viewport: { width: SIZES[0].width, height: SIZES[0].height },
    hasTouch: false,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(
    `${process.env.TEST_BASE_URL}?daytime=12&weather=clear${FAST_SEA}`,
  );
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(async (bearing) => {
    localStorage.clear();
    const { startOcean } = await import("/src/app/ocean.ts");
    const { spawn } = await import("/src/ocean/model.ts");
    const start = spawn("me");
    const boat = (uid, name, x, z) => ({
      uid,
      name,
      session: "s",
      x,
      z,
      heading: 0,
      fishing: false,
      updatedAt: Date.now(),
      tier: 0,
      rod: 0,
    });
    const connect = async (onBoats) => {
      // The bow points to -z at heading 0; right is +x. Sent again and again, as the server does.
      const send = () =>
        onBoats(
          [
            boat("me", "Bạn", start.x, start.z),
            boat(
              "minh",
              "Minh",
              start.x + Math.sin(bearing) * 300,
              start.z - Math.cos(bearing) * 300,
            ),
          ],
          Date.now(),
        );
      send();
      const timer = setInterval(send, 200);
      return {
        uid: "me",
        pose: { x: start.x, z: start.z, heading: 0, fishing: false },
        dispose: () => clearInterval(timer),
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
    });
  }, BEARING);
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  await page
    .locator('.ocean-boat-label[data-uid="minh"][data-edge]')
    .waitFor({ timeout: 60000 });

  for (const { width, height, safeTop } of SIZES) {
    const tag = `${width}x${height}${safeTop ? ` notch ${safeTop}` : ""}`;
    await page.evaluate((top) => {
      if (top)
        document.documentElement.style.setProperty("--safe-top", `${top}px`);
      else document.documentElement.style.removeProperty("--safe-top");
    }, safeTop);
    await page.setViewportSize({ width, height });
    // Wait until the camera has settled at this size: the label stays put over half a second.
    await page.evaluate(() => (window.arrowSeen = undefined));
    await page.waitForFunction(
      () => {
        const r = document
          .querySelector('.ocean-boat-label[data-uid="minh"]')
          .getBoundingClientRect();
        const now = performance.now();
        const seen = window.arrowSeen;
        if (!seen || Math.hypot(r.x - seen.x, r.y - seen.y) > 1) {
          window.arrowSeen = { x: r.x, y: r.y, at: now };
          return false;
        }
        return now - seen.at > 700;
      },
      null,
      { timeout: 60000, polling: 100 },
    );
    const got = await page.evaluate(() => {
      const rect = (el) => {
        const { left, top, right, bottom, width, height } =
          el.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const label = document.querySelector(
        '.ocean-boat-label[data-uid="minh"]',
      );
      return {
        label: rect(label),
        map: rect(document.querySelector(".ocean-minimap")),
        edge: label.dataset.edge === "true",
        hidden: label.hidden,
        distance: label.dataset.distance,
        turn: parseFloat(label.style.getPropertyValue("--turn")),
      };
    });
    await page.screenshot({
      path: `${output}/arrow-${width}x${height}${safeTop ? "-notch" : ""}.png`,
    });
    const { label, map } = got;
    const show = (r) =>
      `x ${r.left.toFixed(0)}..${r.right.toFixed(0)} y ${r.top.toFixed(0)}..${r.bottom.toFixed(0)}`;
    const line = `${tag}: label ${show(label)}, minimap ${show(map)}, ${got.distance}, turn ${got.turn.toFixed(2)}`;
    summary.push(line);
    // The case is the one meant: an arrow, to the top right, and a minimap that is really there.
    assert.ok(got.edge && !got.hidden, `${tag}: an edge arrow is shown`);
    assert.ok(
      Math.abs(got.turn - BEARING) < 0.15,
      `${tag}: it points at the boat (turn ${got.turn})`,
    );
    // Measured from the camera, which sits behind the boat.
    assert.match(got.distance, /^3[0-3]\d m$|^29\d m$/, `${tag}: the distance`);
    assert.ok(map.width >= 100 && label.width >= 60, `${tag}: both are drawn`);
    assert.ok(
      label.left + label.width / 2 > width / 2 && label.top < height / 2,
      `${tag}: the arrow is in the top right quarter`,
    );
    if (
      label.left < map.right &&
      label.right > map.left &&
      label.top < map.bottom &&
      label.bottom > map.top
    )
      failures.push(`covered by the minimap: ${line}`);
    if (
      label.left < 0 ||
      label.top < 0 ||
      label.right > width ||
      label.bottom > height
    )
      failures.push(`outside the view: ${line}`);
  }
  console.log(summary.join("\n"));
  assert.deepEqual(failures, []);
  assert.deepEqual(problems, []);
  console.log(
    `Ocean arrow: clear of the minimap at ${SIZES.length} sizes (${Math.round((Date.now() - started) / 1000)} s).`,
  );
} finally {
  await browser.close();
}
