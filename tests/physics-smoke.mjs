// Start npm run dev before running this functional browser/physics check.
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:5173");
  await page.getByRole("button").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("button").disabled);
  await page.getByRole("button").click();
  const result = await page.evaluate(async () => {
    const { Engine } = await import(
      "/node_modules/@babylonjs/core/Engines/engine.js"
    );
    const { createPhysics } = await import("/src/platform/physics.ts");
    const { createPlayground } = await import("/src/game/playground.ts");
    const canvas = document.createElement("canvas");
    const engine = new Engine(canvas, true);
    const playground = createPlayground(engine, canvas, await createPhysics());
    const scene = playground.scene;
    const boxes = scene.meshes.filter((m) => m.name === "dynamic-box");
    const initial = boxes.map((m) => m.position.y);
    const physics = scene.getPhysicsEngine();
    for (let i = 0; i < 600; i++) physics._step(1 / 60);
    const final = boxes.map((m) => m.position.y);
    if (!final.every((y, i) => y >= 0.45 && y < initial[i] - 2))
      throw Error("Gravity/ground collision failed: " + JSON.stringify(final));
    for (let i = 0; i < 50; i++) playground.drop();
    if (scene.meshes.filter((m) => m.name === "dynamic-box").length !== 32)
      throw Error("Body limit failed");
    playground.dispose();
    if (!scene.isDisposed) throw Error("Scene disposal failed");
    engine.dispose();
    return {
      initialBodies: boxes.length,
      settledHeights: final,
      boundedBodies: 32,
      disposed: true,
    };
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
