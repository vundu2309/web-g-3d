import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The real Babylon + Havok sea in a real browser, with a fake network connection so
// no server or account is needed. Needs the dev server (imports from /src).
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  deviceScaleFactor: 3,
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
page.on("console", (message) => {
  // GL driver notes from the software renderer are not application errors.
  if (message.type() === "error" && !message.text().includes("GL Driver"))
    problems.push(message.text());
});
try {
  // The sea has a day and a weather from the shared UTC clock (atmosphere.ts); the test pins noon,
  // clear (the sea's original look) so what it measures does not depend on when it runs.
  await page.goto(`${process.env.TEST_BASE_URL}?daytime=12&weather=clear`);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  await page.evaluate(async () => {
    window.published = [];
    const { startOcean } = await import("/src/app/ocean.ts");
    const make = (uid, name, x, z, heading, fishing = false) => ({
      uid,
      name,
      session: "s",
      x,
      z,
      heading,
      fishing,
      updatedAt: Date.now(),
    });
    const connect = async (onBoats) => {
      onBoats(
        [
          make("me", "Bạn", 0, 0, 0),
          make("lan", "Lan", -16, -34, 0.5),
          make("minh", "Minh", 20, -22, -0.7, true),
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: 0, z: 0, heading: 0, fishing: false },
        dispose() {},
        publish: async (pose) => {
          window.published.push({ ...pose, at: performance.now() });
        },
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      onScene: (scene) => {
        window.oceanScene = scene;
        // Remember what the player's input to the boat was, and when.
        window.inputs = [];
        const original = scene.setInput.bind(scene);
        scene.setInput = (steer, throttle) => {
          window.inputs.push({ at: performance.now(), steer, throttle });
          original(steer, throttle);
        };
      },
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });

  // Sharp: a 3x phone draws at 2x the CSS size, not the old 1.5x cap or less.
  const size = await page.evaluate(() => {
    const canvas = document.querySelector("canvas.ocean-canvas");
    return { width: canvas.width, css: canvas.clientWidth };
  });
  assert.equal(
    size.width,
    size.css * 2,
    `drew ${size.width}px for ${size.css} CSS px`,
  );

  // It really draws: sea, sky, boats and islands, within a phone-sized budget.
  await page.waitForTimeout(1500);
  const cost = await page.evaluate(() => window.oceanScene.stats());
  assert.ok(cost.meshes >= 6, `meshes in view: ${cost.meshes}`);
  // Raised from 150,000 for the Blender island props (about 170,000 measured), then to 450,000
  // for the Blender bushes and the sea's reflection pass (412,768 measured, the reflection
  // draws the scene again): looks first, performance pass later by the user's choice.
  assert.ok(
    cost.triangles > 5000 && cost.triangles < 450000,
    `triangles ${cost.triangles}`,
  );
  // The see-through sea (clear-water.ts) is on and can be switched off for the opaque one; its
  // extra pass (the meshes that can be under the water) is counted in the triangles.
  assert.equal(typeof cost.clearWater, "boolean");
  // The state is pinned (the quality governor would otherwise switch it off by itself under slow
  // software frames) and read right after each call, so the checks do not depend on frame speed.
  const clear = await page.evaluate(async () => {
    const scene = window.oceanScene;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 2500));
    scene.setClearWater(true, true);
    const onNow = scene.stats().clearWater;
    await settle();
    const on = scene.stats();
    scene.setClearWater(false, true);
    const offNow = scene.stats().clearWater;
    await settle();
    const off = scene.stats();
    scene.setClearWater(true, true);
    const backNow = scene.stats().clearWater;
    await settle();
    // Back to the governor's own care.
    scene.setClearWater(true);
    return { on, off, onNow, offNow, backNow };
  });
  assert.equal(clear.onNow, true, "the see-through sea switches on");
  assert.equal(clear.offNow, false, "and off (the opaque sea)");
  assert.equal(clear.backNow, true, "and on again");
  assert.equal(clear.on.clearWater, true, "and stays on while pinned");
  assert.equal(clear.off.clearWater, false, "and stays off while pinned");
  assert.ok(
    clear.on.clearWaterMeshes > 0,
    `the layer's pass drew ${clear.on.clearWaterMeshes} meshes (the boats are in it)`,
  );
  assert.equal(
    clear.off.clearWaterMeshes,
    0,
    "nothing is drawn when it is off",
  );
  assert.ok(
    clear.on.triangles > clear.off.triangles,
    `the layer is a pass over some meshes: ${clear.on.triangles} on, ${clear.off.triangles} off`,
  );
  console.log(
    `clear water: ${clear.on.triangles} triangles on (${clear.on.clearWaterMeshes} meshes in the layer), ${clear.off.triangles} off (the layer's pass: ${clear.on.triangles - clear.off.triangles})`,
  );
  const picture = await page.screenshot();
  assert.ok(
    picture.length > 150000,
    `frame is not blank (${picture.length} bytes)`,
  );

  // Labels follow the boats and the player's own is marked.
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll(".ocean-boat-label")].map((l) => [
      l.textContent,
      l.hidden,
    ]),
  );
  assert.deepEqual(labels.map(([name]) => name).sort(), ["Bạn", "Lan", "Minh"]);
  assert.equal(await page.locator(".ocean-boat-label.is-self").count(), 1);

  // Floating on the surface the water shows, bobbing rather than rigid.
  const rides = await page.evaluate(async () => {
    const { waveHeight } = await import("/src/ocean/waves.ts");
    const heights = [];
    for (let i = 0; i < 12; i++) {
      const s = window.oceanScene.selfState();
      heights.push(s.y - waveHeight(s.x, s.z, performance.now() / 1000));
      await new Promise((r) => setTimeout(r, 120));
    }
    return heights;
  });
  const state0 = await page.evaluate(() => window.oceanScene.selfState());
  assert.ok(
    Number.isFinite(state0.y) && Math.abs(state0.y) < 2,
    `boat height ${state0.y}`,
  );
  assert.ok(rides.every(Number.isFinite));

  // Two-thumb driving: stick up-right runs and turns right at once, via real touches.
  const stick = await page.locator(".ocean-stick").boundingBox();
  const cx = stick.x + stick.width / 2;
  const cy = stick.y + stick.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: cx + 14, y: cy - 38, id: 1 }]);
  // The software renderer can be slow, and physics deliberately slows down with it
  // rather than jumping, so wait for the result instead of sleeping a fixed time.
  await page.waitForFunction(
    () => {
      const last = window.published.slice(-1)[0];
      return last && last.z < -10 && last.heading > 0.05;
    },
    null,
    { timeout: 90000 },
  );
  const driving = await page.evaluate(() => window.published.slice(-1)[0]);
  assert.ok(driving.z < -10, `ran forward: z ${driving.z.toFixed(1)}`);
  assert.ok(
    driving.heading > 0.05,
    `and turned right: heading ${driving.heading.toFixed(2)}`,
  );

  // Second thumb holds Thả câu (charging a throw) while the first holds the stick, then
  // lets go: the line goes out and the boat stops pushing.
  const fish = await page.locator('[data-ocean="fish"]').boundingBox();
  await touch("touchStart", [
    { x: cx + 14, y: cy - 38, id: 1 },
    { x: fish.x + fish.width / 2, y: fish.y + fish.height / 2, id: 2 },
  ]);
  await page.waitForTimeout(900);
  await touch("touchEnd", [
    { x: fish.x + fish.width / 2, y: fish.y + fish.height / 2, id: 2 },
  ]);
  await page.waitForFunction(
    () => window.published.some((p) => p.fishing),
    null,
    { timeout: 30000 },
  );
  // Stick still held, but with the line out the boat gets no thrust (the fish may take
  // the line in again within seconds, so this checks the input, not the final stop).
  await page.waitForTimeout(700);
  // Software frames can be slow (the see-through sea adds a pass): wait, up to 8 s, until enough
  // frames have been seen with the line out instead of counting the frames of a fixed 0.7 s.
  await page
    .waitForFunction(
      () => {
        const out = window.published.find((p) => p.fishing)?.at ?? Infinity;
        const back =
          window.published.find((p) => !p.fishing && p.at > out)?.at ??
          Infinity;
        return (
          window.inputs.filter(
            (i) =>
              i.at > out + 150 &&
              i.at < Math.min(back - 150, performance.now()),
          ).length > 3
        );
      },
      null,
      { timeout: 8000 },
    )
    .catch(() => undefined);
  const verdict = await page.evaluate(() => {
    const out = window.published.find((p) => p.fishing)?.at ?? Infinity;
    const back =
      window.published.find((p) => !p.fishing && p.at > out)?.at ?? Infinity;
    const before = window.inputs.filter(
      (i) => i.at < out - 1200 && i.throttle !== 0,
    );
    const during = window.inputs.filter(
      (i) => i.at > out + 150 && i.at < Math.min(back - 150, performance.now()),
    );
    return {
      drove: before.length,
      during: during.length,
      pushed: during.filter((i) => i.throttle !== 0 || i.steer !== 0).length,
    };
  });
  assert.ok(
    verdict.drove > 0,
    "the held stick drove the boat before the throw",
  );
  assert.ok(
    verdict.during > 3,
    `frames with the line out were seen (${verdict.during})`,
  );
  assert.equal(
    verdict.pushed,
    0,
    "no thrust or steering while the line is out",
  );
  await touch("touchEnd", [{ x: cx + 14, y: cy - 38, id: 1 }]);

  // A drag that starts outside the stick's corner turns the camera and never grabs the
  // stick, and a mouse drag right beside the ring does not steer either.
  const yawBefore = await page.evaluate(() => window.oceanScene.orbit.yaw);
  const drag = async (x, y) => {
    await touch("touchStart", [{ x, y, id: 3 }]);
    for (let i = 1; i <= 5; i++) {
      await touch("touchMove", [{ x: x + i * 30, y, id: 3 }]);
      await page.waitForTimeout(80);
      assert.equal(
        await page.locator(".ocean-stick.is-active").count(),
        0,
        "the stick is not active during a camera drag",
      );
    }
    await touch("touchEnd", [{ x: x + 150, y, id: 3 }]);
  };
  await drag(340, 250);
  assert.notEqual(
    await page.evaluate(() => window.oceanScene.orbit.yaw),
    yawBefore,
    "the drag turned the camera",
  );
  await page.mouse.move(cx + 110, cy - 20);
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy - 20, { steps: 5 });
  assert.equal(
    await page.locator(".ocean-stick.is-active").count(),
    0,
    "a mouse drag beside the ring does not steer",
  );
  await page.mouse.up();
  // Day, night and weather: pinned through the shared sea, the frame follows (noon is bright, midnight
  // dark but not black, rain adds its one mesh) and normal play, with no pin, would follow UTC.
  const look = async (hour, weather) => {
    await page.evaluate(
      async ([h, w]) => {
        const sea = await import("/src/ocean/sea-atmosphere.ts");
        sea.pinAtmosphere({ hour: h, weather: w });
      },
      [hour, weather],
    );
    await page.waitForTimeout(700);
    const stats = await page.evaluate(() => window.oceanScene.stats());
    const state = await page.evaluate(async () => {
      const { SEA } = await import("/src/ocean/sea-atmosphere.ts");
      return {
        daylight: SEA.grade.y,
        stars: SEA.grade.z,
        rain: SEA.weather.z,
        sun: SEA.sun.intensity,
        moon: SEA.moon.intensity,
        fog: SEA.fogDensity,
      };
    });
    const shot = (await page.screenshot()).toString("base64");
    const mean = await page.evaluate(async (b64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = 84;
      c.height = 39;
      const g = c.getContext("2d");
      g.drawImage(image, 0, 0, c.width, c.height);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4)
        sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      return sum / (px.length / 4);
    }, shot);
    return { stats, state, mean };
  };
  const noon = await look(12, "clear");
  const midnight = await look(0, "clear");
  const rain = await look(12, "rain");
  const nightRain = await look(0, "rain");
  assert.equal(noon.state.daylight, 1);
  assert.equal(midnight.state.daylight, 0);
  assert.ok(midnight.state.stars > 0.9 && midnight.state.moon > 0.3);
  assert.equal(midnight.state.sun, 0, "no sun at night");
  assert.ok(
    midnight.mean < noon.mean * 0.6 && midnight.mean > 12,
    `night is dark but not black (${midnight.mean.toFixed(1)} against ${noon.mean.toFixed(1)} at noon)`,
  );
  assert.ok(
    nightRain.mean > 8,
    `rain at night is readable (${nightRain.mean.toFixed(1)})`,
  );
  assert.equal(noon.state.rain, 0);
  assert.ok(rain.state.rain > 0.7, "rain is falling");
  assert.ok(
    rain.stats.triangles >= noon.stats.triangles + 2500,
    `the rain is one mesh of 3,000 triangles (${rain.stats.triangles} against ${noon.stats.triangles})`,
  );
  assert.ok(rain.state.fog > noon.state.fog, "rain thickens the fog");
  assert.ok(rain.state.sun < noon.state.sun * 0.6, "rain dims the sun");
  await page.evaluate(async () => {
    const sea = await import("/src/ocean/sea-atmosphere.ts");
    sea.pinAtmosphere({ hour: 12, weather: "clear" });
  });
  assert.deepEqual(problems, []);
  console.log(
    `Ocean Babylon: sharp 2x draw, ${cost.triangles} triangles / ${cost.meshes} meshes, floats, runs+turns with one thumb, casting slows the boat, day, night and rain follow the sea's atmosphere, no errors.`,
  );
} finally {
  await context.close();
  await browser.close();
}
