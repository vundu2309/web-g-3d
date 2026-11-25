import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";

// The NPC seaplanes on the real scene with a fake connection: they are on the SHARED clock, so two
// separate browsers on the same shared time show every plane in the same place; a few are drawn
// near the camera, each towing a banner with the game's name; they fly; `?planes=0` leaves them
// out; and framed shots show the plane and banner from both sides (look at the screenshots: the
// letters must read correctly from either side). Needs the dev server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];
const T0 = 1_795_000_000.37;

async function open({ query = "", frozen = false } = {}) {
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
  await page.evaluate(
    async ({ T0, frozen }) => {
      const { startOcean } = await import("/src/app/ocean.ts");
      const start = { x: 0, z: 22, heading: 0 };
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
      // The shared clock the test controls: frozen at a time it sets, or running from T0.
      const p0 = performance.now();
      window.sharedAt = frozen ? T0 : undefined;
      window.stop = startOcean(document.querySelector("#app"), () => {}, {
        fightSpeed: 2,
        connect,
        onScene: (s) => {
          window.oceanScene = s;
          s.setSharedClock(
            () => window.sharedAt ?? T0 + (performance.now() - p0) / 1000,
          );
        },
      });
    },
    { T0, frozen },
  );
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  return { page, context };
}

// Puts plane `index` `ahead` metres in front of the camera, `high` metres above it, flying across
// the view (to the right when `rightward`), `shift` metres along its way before the middle.
const frame = (
  page,
  { index = 0, ahead, high, rightward = true, shift = 20 },
) =>
  page.evaluate(
    ({ index, ahead, high, rightward, shift }) => {
      const scene = window.oceanScene;
      const camera = scene.scene.activeCamera;
      const target = camera.getTarget();
      let dx = target.x - camera.position.x;
      let dz = target.z - camera.position.z;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      const side = rightward ? 1 : -1;
      // Flying across the view: the camera's right is (dz, -dx).
      const fx = dz * side;
      const fz = -dx * side;
      const heading = Math.atan2(fx, -fz);
      scene
        .skyPlanes()
        .place(
          index,
          camera.position.x + dx * ahead - fx * shift,
          camera.position.y + high,
          camera.position.z + dz * ahead - fz * shift,
          heading,
        );
    },
    { index, ahead, high, rightward, shift },
  );
// Waits until the scene has drawn two more frames, so a screenshot is not taken just after the
// canvas was cleared (the render-scale governor resizes it, and software rendering is slow).
const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const { onAfterRenderObservable } = window.oceanScene.scene;
        let frames = 0;
        const observer = onAfterRenderObservable.add(() => {
          if (++frames < 2) return;
          onAfterRenderObservable.remove(observer);
          resolve();
        });
      }),
  );
const poses = (page) =>
  page.evaluate(() => JSON.stringify(window.oceanScene.skyPlanes().all()));

try {
  // 1. Every device sees the same planes: two separate browsers on one shared time agree on all
  //    eight planes, and still agree after the shared clock moves on.
  {
    const a = await open({ frozen: true });
    const b = await open({ frozen: true });
    await a.page.waitForTimeout(800);
    await b.page.waitForTimeout(800);
    const first = await poses(a.page);
    assert.equal(
      first,
      await poses(b.page),
      "same planes at the same shared time",
    );
    const list = JSON.parse(first);
    assert.equal(list.length, 8);
    assert.ok(
      new Set(list.map((p) => Math.round(p.x))).size >= 6,
      "the planes are in different places",
    );
    for (const { page } of [a, b])
      await page.evaluate((t) => (window.sharedAt = t), T0 + 57.3);
    await a.page.waitForTimeout(800);
    await b.page.waitForTimeout(800);
    const later = await poses(a.page);
    assert.equal(
      later,
      await poses(b.page),
      "still the same after the clock moved on",
    );
    assert.notEqual(later, first, "and they have flown on");
    // A device that was away (a hidden tab) and comes back lands on the same places as one that stayed.
    for (const { page } of [a, b])
      await page.evaluate((t) => (window.sharedAt = t), T0 + 400.9);
    await a.page.waitForTimeout(800);
    await b.page.waitForTimeout(800);
    assert.equal(await poses(a.page), await poses(b.page));
    await a.context.close();
    await b.context.close();
  }
  // 2. Near the camera the planes are drawn, each with a banner, as a few hundred triangles.
  {
    const { page, context } = await open();
    for (const index of [0, 1, 2])
      await frame(page, {
        index,
        ahead: 90 + index * 25,
        high: 20 + index * 8,
        shift: 20 - index * 30,
      });
    await page.waitForTimeout(700);
    const facts = await page.evaluate(() => {
      const scene = window.oceanScene;
      const names = scene.scene.meshes.map((m) => m.name);
      return {
        visible: scene.skyPlanes().visible,
        bodies: names.filter((n) => /^plane-body-\d$/.test(n)).length,
        banners: names.filter((n) => /^banner-\d$/.test(n)).length,
        bodyTriangles:
          scene.scene.getMeshByName("plane-body").getTotalIndices() / 3,
        propTriangles:
          scene.scene.getMeshByName("plane-prop").getTotalIndices() / 3,
        bannerTriangles:
          scene.scene.getMeshByName("banner-0").getTotalIndices() / 3,
      };
    });
    console.log("planes:", JSON.stringify(facts));
    assert.equal(facts.visible, 3, "the three nearest are drawn (the limit)");
    assert.equal(facts.bodies, 3);
    assert.equal(facts.banners, 3);
    assert.ok(
      facts.bodyTriangles <= 1200,
      `body ${facts.bodyTriangles} triangles`,
    );
    assert.ok(facts.propTriangles <= 200);
    assert.ok(facts.bannerTriangles <= 80);

    // 3. They fly: a few seconds later the planes have moved, and are still near.
    const before = JSON.parse(await poses(page));
    await page.waitForTimeout(3000);
    const after = JSON.parse(await poses(page));
    for (const i of [0, 1, 2])
      assert.ok(
        Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z) > 10,
        `plane ${i} did not move`,
      );

    // 4. Framed shots: the banner seen from one side, from the other, and the plane close up.
    for (const [name, rightward, ahead, high] of [
      ["planes-from-port", true, 85, 20],
      ["planes-from-starboard", false, 85, 20],
      ["planes-mid", true, 55, 14],
      ["planes-close", true, 38, 9],
    ]) {
      await frame(page, { index: 0, ahead, high, rightward });
      await page.waitForTimeout(300);
      await settle(page);
      await page.screenshot({ path: `${output}/${name}.png` });
    }
    await context.close();
  }
  // 5. The switch: ?planes=0 has no planes and no banner meshes.
  {
    const { page, context } = await open({ query: "?planes=0" });
    const none = await page.evaluate(() => ({
      fleet: window.oceanScene.skyPlanes() === undefined,
      meshes: window.oceanScene.scene.meshes.filter((m) =>
        /^(plane|banner)-/.test(m.name),
      ).length,
    }));
    assert.deepEqual(none, { fleet: true, meshes: 0 });
    await context.close();
  }
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean planes: two browsers on one shared time show the same eight planes (and after a jump of the clock), the nearest three are drawn with banners, they fly, `?planes=0` removes them, no errors.",
  );
} finally {
  await browser.close();
}
