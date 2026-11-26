import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";

// Near the edge of the sea the sky must still be a dome round the camera. The dome has
// `infiniteDistance` (Babylon puts it on the camera itself): when its own position was also set to
// the camera's, the dome sat twice as far from the middle as the camera, and from about 1,200 m out
// (its radius) the camera was outside it and the sky showed a white shape. This opens the sea at the
// middle, at the east edge and at a corner and checks where the dome is and that the camera is well
// inside it; the screenshots show the sky. Needs the dev server.
const browser = await launchBrowser();
const output = process.env.TEST_ARTIFACT_DIR || "test-results";
await mkdir(output, { recursive: true });
const problems = [];

async function open(name, { x, z, heading }) {
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
  await page.evaluate(
    async ({ x, z, heading }) => {
      const { startOcean } = await import("/src/app/ocean.ts");
      const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
      // The boat starts where it was saved.
      localStorage.setItem(
        saveKey("me"),
        encodeSave({ x, z, heading, caught: 0, fish: {} }),
      );
      const start = { x, z, heading };
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
    },
    { x, z, heading },
  );
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000);
  const facts = await page.evaluate(() => {
    const scene = window.oceanScene.scene;
    const camera = scene.activeCamera;
    const sky = scene.getMeshByName("sky");
    sky.computeWorldMatrix(true);
    const centre = sky.getAbsolutePosition();
    return {
      camera: [camera.position.x, camera.position.y, camera.position.z],
      centre: [centre.x, centre.y, centre.z],
      radius: sky.getBoundingInfo().boundingSphere.radius,
    };
  });
  // The screenshot: retried until it holds the sea (software rendering can catch an empty canvas).
  for (let attempt = 0; attempt < 10; attempt++) {
    const png = await page.screenshot({ path: `${output}/edge-${name}.png` });
    if (png.length > 120_000) break;
    await page.waitForTimeout(600);
  }
  await context.close();
  return facts;
}

try {
  for (const [name, pose] of [
    ["middle", { x: 0, z: 22, heading: 0 }],
    ["east", { x: 1480, z: -300, heading: 0 }],
    ["corner", { x: 1470, z: 1470, heading: Math.PI / 4 }],
  ]) {
    const { camera, centre, radius } = await open(name, pose);
    const off = Math.hypot(
      centre[0] - camera[0],
      centre[1] - camera[1],
      centre[2] - camera[2],
    );
    console.log(
      `${name}: camera ${camera.map(Math.round)}, dome ${centre.map(Math.round)}, off by ${off.toFixed(1)} m, radius ${Math.round(radius)}`,
    );
    assert.ok(
      off < 1,
      `${name}: the dome is ${off.toFixed(0)} m off the camera`,
    );
  }
  assert.deepEqual(problems, [], `no page errors: ${problems.join("; ")}`);
  console.log(
    "Ocean edge: the sky dome is on the camera at the middle, at the east edge and at a corner, no errors.",
  );
} finally {
  await browser.close();
}
