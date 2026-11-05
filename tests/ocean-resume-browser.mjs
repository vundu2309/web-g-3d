import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// Dropping mid-game reconnects by itself without moving the boat, a revoked session
// is not retried, and leaving then coming back resumes the last position and the
// catch count. Real scene and physics, fake connection. Needs the dev server.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
});
const problems = [];

async function start(page, { failNext = 0 } = {}) {
  await page.evaluate(
    async ({ failNext }) => {
      window.calls = 0;
      window.failNext = failNext;
      window.disposed = 0;
      window.published = window.published || [];
      const { startOcean } = await import("/src/app/ocean.ts");
      const connect = async (onBoats, onError) => {
        window.calls++;
        if (window.failNext > 0) {
          window.failNext--;
          throw new Error("server still down");
        }
        window.lose = onError;
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
          dispose() {
            window.disposed++;
          },
          publish: async (pose) => {
            window.published.push(pose);
          },
        };
      };
      window.stop = startOcean(document.querySelector("#app"), () => {}, {
        connect,
        timing: {
          delaysMs: [300],
          slowAfterMs: 200,
          attemptMs: 5000,
          deadlineMs: 60000,
        },
        onScene: (s) => (window.oceanScene = s),
      });
    },
    { failNext },
  );
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
}
async function fresh() {
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(process.env.TEST_BASE_URL);
  await page.getByRole("button", { name: "Vào game" }).waitFor();
  return page;
}
async function driveUntil(page, predicate) {
  const stick = await page.locator(".ocean-stick").boundingBox();
  const cx = stick.x + stick.width / 2;
  const cy = stick.y + stick.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: cx + 10, y: cy - 40, id: 1 }]);
  await page.waitForFunction(predicate, null, { timeout: 90000 });
  await touch("touchEnd", [{ x: cx + 10, y: cy - 40, id: 1 }]);
}
const where = (page) =>
  page.evaluate(() => {
    const s = window.oceanScene.selfState();
    return { x: s.x, z: s.z };
  });
const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

try {
  // 1. A drop in the middle of the game: it reconnects by itself, the boat stays put,
  //    and updates resume.
  const page = await fresh();
  await page.evaluate(() => localStorage.clear());
  await start(page);
  await driveUntil(page, () => window.oceanScene.selfState().z < 8);
  const before = await where(page);
  const publishedBefore = await page.evaluate(() => window.published.length);
  await page.evaluate(async () => {
    const { HubError } = await import("/src/hub/model.ts");
    window.failNext = 2;
    window.lose(new HubError("Mất kết nối biển chung."));
  });
  await page
    .getByText("Đang kết nối lại", { exact: false })
    .first()
    .waitFor({ timeout: 30000 });
  await page
    .getByText("Đã kết nối lại biển chung", { exact: false })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await page.evaluate(() => window.calls),
    4,
    "first entry + two failures + success",
  );
  assert.equal(
    await page.evaluate(() => window.disposed),
    1,
    "the dropped connection was closed",
  );
  await page.waitForFunction(
    (n) => window.published.length > n,
    publishedBefore,
    { timeout: 30000 },
  );
  const after = await where(page);
  assert.ok(
    apart(before, after) < 40,
    `the boat carried on from where it was (${apart(before, after).toFixed(1)} m), not from the harbor`,
  );
  assert.ok(before.z < 10, "and it really had left the harbor");
  assert.equal(await page.locator("[data-count]").innerText(), "1 thuyền");

  // 2a. The access token running out mid-game ("Hãy đăng nhập lại.") is not the end
  //     of the session: reconnecting sends a fresh token, so the game carries on.
  const expiredBefore = await page.evaluate(() => window.calls);
  await page.evaluate(async () => {
    const { HubError } = await import("/src/hub/model.ts");
    window.lose(new HubError("Hãy đăng nhập lại."));
  });
  await page.waitForFunction((n) => window.calls > n, expiredBefore, {
    timeout: 30000,
  });
  await page
    .getByText("Đã kết nối lại biển chung", { exact: false })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await page
      .getByRole("button", { name: "Đăng nhập lại", exact: true })
      .count(),
    0,
    "no sign-in card for an expired token",
  );

  // 2b. A refused sign-in (revoked session) is not retried: sign in again instead.
  const callsBefore = await page.evaluate(() => window.calls);
  await page.evaluate(async () => {
    const { HubError } = await import("/src/hub/model.ts");
    window.lose(new HubError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."));
  });
  await page
    .getByText("Mất kết nối biển chung", { exact: true })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Đăng nhập lại", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.calls),
    callsBefore,
    "no retry for a fatal error",
  );
  await page.close();

  // 3. Leave and come back: same place, same catches. A catch is saved at once.
  const visit = await fresh();
  await visit.evaluate(() => localStorage.clear());
  await start(visit);
  await driveUntil(visit, () => window.oceanScene.selfState().z < 6);
  await visit.getByRole("button", { name: "Thả câu", exact: true }).click();
  await visit
    .getByText("Cá cắn câu", { exact: false })
    .waitFor({ timeout: 30000 });
  await visit.getByRole("button", { name: "Kéo cá!", exact: true }).click();
  await visit.getByText("Đã kéo được cá", { exact: false }).waitFor();
  assert.equal(await visit.locator("[data-catch]").innerText(), "1");
  await visit
    .waitForFunction(() => window.oceanScene.selfState().z < 4, null, {
      timeout: 60000,
    })
    .catch(() => {});
  const parked = await where(visit);
  await visit.evaluate(() => window.stop());
  const saved = await visit.evaluate(() =>
    JSON.parse(localStorage.getItem("photyphu:sea:v1:me")),
  );
  assert.equal(saved.caught, 1, "the catch was saved");
  assert.ok(
    Math.abs(saved.x - parked.x) < 6 && Math.abs(saved.z - parked.z) < 6,
    "and so was the position",
  );
  await start(visit);
  const resumed = await where(visit);
  assert.ok(
    apart(resumed, saved) < 4,
    `back where it was: ${apart(resumed, saved).toFixed(1)} m from the saved spot`,
  );
  assert.ok(resumed.z < 15, "not at the harbor");
  assert.equal(
    await visit.locator("[data-catch]").innerText(),
    "1",
    "the catch count came back",
  );
  await visit.evaluate(() => window.stop());

  // 4. Damaged or doubtful saves fall back to the harbor but keep the fish count.
  for (const doubtful of [
    "not json",
    JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      x: -68,
      z: -65,
      heading: 0,
      caught: 4,
    }),
  ]) {
    await visit.evaluate(
      (value) => localStorage.setItem("photyphu:sea:v1:me", value),
      doubtful,
    );
    await start(visit);
    const spot = await where(visit);
    assert.ok(
      Math.abs(spot.x) < 14 && spot.z > 18,
      `harbor start, got ${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}`,
    );
    await visit.evaluate(() => window.stop());
  }
  await visit.close();
  assert.deepEqual(problems, []);
  console.log(
    "Ocean resume: auto-reconnect keeps the boat in place, a revoked session is not retried, position and catches resume, doubtful saves fall back to the harbor.",
  );
} finally {
  await context.close();
  await browser.close();
}
