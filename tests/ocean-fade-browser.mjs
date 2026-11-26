import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// Nothing may vanish in one frame as the player sails away. This opens the sea with a fake connection
// and, with the camera moved by hand in steps (no waiting: the scene's own frame cannot get in
// between), checks two things that used to be switched off at a range:
//  1. a rowing-cat boat thins out steadily to nothing as the camera goes away from it, and is
//     switched off only when it is gone;
//  2. at night a patrol ship's lights are seen from far (halos out to 1,100 m, made larger so they
//     stay a few pixels), thin out over the last 300 m and are not cut in one step; the searchlight's
//     wedge thins out toward 380 m.
// Needs the dev server.
const browser = await launchBrowser();
const problems = [];

async function open() {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("GL Driver"))
      problems.push(m.text());
  });
  await page.goto(`${process.env.TEST_BASE_URL}/`);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
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
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      fightSpeed: 2,
      connect,
      onScene: (s) => (window.oceanScene = s),
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  await page.waitForTimeout(3000);
  return { page, context };
}

try {
  const { page, context } = await open();

  // 1. A cat boat fades out as the camera goes away from it.
  const cats = await page.evaluate(() => {
    const s = window.oceanScene;
    const fleet = s.cats;
    if (!fleet) return { missing: true };
    const { range, band } = fleet.options;
    const shared = s.sharedClock();
    const pose = fleet.all()[0];
    const at = (d) => ({ x: pose.x + d, z: pose.z });
    let time = 1000;
    const step = (camera) => {
      time += 0.1;
      fleet.update(s.sharedClock(), time, camera, () => 0);
    };
    // Close to the boat first, long enough to be whole.
    for (let i = 0; i < 40; i++) step(at(20));
    const series = [];
    for (let d = 20; d <= range + 60; d += 4) {
      step(at(d));
      const root = s.scene.getTransformNodeByName("cat-boat-0");
      series.push({
        d,
        amount: fleet.amountOf(0),
        enabled: root ? root.isEnabled() : false,
      });
    }
    return { range, band, series, shared };
  });
  assert.ok(!cats.missing, "the rowing cats are in the scene");
  const amounts = cats.series.map((p) => p.amount);
  console.log(
    `cats: range ${cats.range} m, band ${cats.band} m; whole at ${cats.series[0].d} m (${amounts[0]}), ${amounts.at(-1)} at ${cats.series.at(-1).d} m`,
  );
  assert.equal(amounts[0], 1, "whole when close");
  assert.equal(amounts.at(-1), 0, "gone past the range");
  assert.ok(
    amounts.some((a) => a > 0.2 && a < 0.8),
    "it passes through half-faded states",
  );
  for (let i = 1; i < amounts.length; i++) {
    assert.ok(
      amounts[i] <= amounts[i - 1] + 1e-9,
      "it only thins as the camera goes away",
    );
    assert.ok(
      amounts[i - 1] - amounts[i] < 0.25,
      `a jump from ${amounts[i - 1]} to ${amounts[i]} in one step`,
    );
  }
  for (const p of cats.series)
    if (p.amount > 0)
      assert.ok(
        p.enabled,
        `the boat is drawn at ${p.d} m with amount ${p.amount}`,
      );
  assert.equal(cats.series.at(-1).enabled, false, "switched off once gone");

  // 2. At night a patrol ship's lights reach far and thin out without a cut.
  const lights = await page.evaluate(async () => {
    const s = window.oceanScene;
    const sea = await import("/src/ocean/sea-atmosphere.ts");
    sea.pinAtmosphere({ hour: 0, weather: "clear" });
    // Let the frame follow the pin (the lights read the shared atmosphere).
    await new Promise((r) => setTimeout(r, 1500));
    const craft = [...s.fleet.values()].find((c) => c.npc);
    if (!craft?.lights) return { missing: true };
    // A real Vector3 (Vector3.Distance reads its private fields), moved by hand.
    const eye = s.scene.activeCamera.position.clone();
    const centre = craft.mesh.getAbsolutePosition();
    const own = (suffix) =>
      s.scene.meshes.find((m) => m.name === `${craft.mesh.name}-${suffix}`);
    const mine = own("halo-blue");
    const rows = [];
    for (const d of [
      100, 300, 380, 500, 700, 800, 900, 1000, 1050, 1090, 1100, 1200,
    ]) {
      // Hold the flash still so only the distance changes: the lens flash is a function of time.
      eye.set(centre.x + d, 10, centre.z);
      craft.lights.update(5.0, eye, true);
      rows.push({
        d,
        visible: mine.isVisible,
        level: mine.isVisible ? mine.material._floats.level : 0,
        scale: mine.scaling.x,
      });
    }
    const wedge = own("search");
    const wedges = [];
    for (const d of [100, 260, 320, 380, 450]) {
      eye.set(centre.x + d, 10, centre.z);
      craft.lights.update(5.0, eye, true);
      wedges.push({
        d,
        visible: wedge?.isVisible ?? null,
        level: wedge?.isVisible ? wedge.material._floats.level : 0,
      });
    }
    return { rows, wedges };
  });
  assert.ok(!lights.missing, "a patrol ship with lights is in the sea");
  console.log(
    "halo:",
    lights.rows
      .map(
        (r) =>
          `${r.d}m:${r.visible ? r.level.toFixed(2) : "off"}x${r.scale.toFixed(1)}`,
      )
      .join(" "),
  );
  console.log(
    "wedge:",
    lights.wedges
      .map((w) => `${w.d}m:${w.visible ? w.level.toFixed(2) : "off"}`)
      .join(" "),
  );
  const row = (d) => lights.rows.find((r) => r.d === d);
  assert.ok(
    row(500).visible && row(800).visible && row(1000).visible,
    "the halos are seen from far (they were cut at 380 m)",
  );
  assert.ok(row(300).level > 0, "a lit ship at 300 m");
  assert.equal(row(1100).visible, false, "gone at the end of the range");
  assert.equal(row(1200).visible, false);
  for (let i = 1; i < lights.rows.length; i++) {
    const a = lights.rows[i - 1];
    const b = lights.rows[i];
    if (a.d >= 800)
      assert.ok(
        b.level <= a.level + 1e-9,
        `the halo thins out (${a.d} m to ${b.d} m)`,
      );
  }
  // Level between 1000 and 1090 m falls steadily; there is no step from whole to nothing.
  assert.ok(row(1050).level < row(900).level && row(1050).level > 0);
  // The farther, the larger it is made, so it stays a few pixels.
  assert.ok(
    row(1000).scale > row(300).scale * 2 && row(1000).scale > row(500).scale,
  );
  const wedge = (d) => lights.wedges.find((w) => w.d === d);
  assert.ok(
    wedge(100).visible && wedge(260).visible,
    "the searchlight is whole within its band",
  );
  assert.ok(
    wedge(320).visible && wedge(320).level < wedge(260).level,
    "and thins out over the last stretch",
  );
  assert.equal(wedge(380).visible, false);
  assert.equal(wedge(450).visible, false);

  await context.close();
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean fade: a cat boat thins out steadily as the camera goes away; a patrol ship's lights reach 1,100 m, grow to stay a few pixels, thin out over the last 300 m, and the searchlight thins out toward 380 m; no errors.",
  );
} finally {
  await browser.close();
}
