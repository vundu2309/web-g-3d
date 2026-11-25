import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// A patrol ship is a hard obstacle: the player's boat lies at rest on its loop and the ship comes
// to it by the clock. A ship that went through would leave the boat where it was and pass within a
// metre of its centre; a hard one shoves the boat along ahead of it and never reaches its centre.
// (A real browser; the ship's place is the real clock's, so the test waits for it.)
const ARRIVE_S = 70;
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: false,
});
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
try {
  await page.goto(`${process.env.TEST_BASE_URL}?daytime=12&weather=clear`);
  await page.getByRole("button", { name: "Ra khơi" }).waitFor();
  // The boat is put where patrol ship 0 will be in ARRIVE_S seconds, pointing along the loop.
  const spot = await page.evaluate(async (arrive) => {
    localStorage.clear();
    const { patrolBoats } = await import("/src/ocean/patrol-routes.ts");
    const { encodeSave, saveKey } = await import("/src/ocean/save.ts");
    const at = Date.now() + arrive * 1000;
    const a = patrolBoats(at)[0];
    const b = patrolBoats(at + 1000)[0];
    const heading = Math.atan2(b.x - a.x, -(b.z - a.z));
    localStorage.setItem(
      saveKey("me"),
      encodeSave({ x: a.x, z: a.z, heading, caught: 0 }),
    );
    window.arrival = at;
    const { startOcean } = await import("/src/app/ocean.ts");
    const connect = async (onBoats) => {
      onBoats(
        [
          {
            uid: "me",
            name: "Bạn",
            session: "s",
            x: 0,
            z: 0,
            heading: 0,
            fishing: false,
            updatedAt: Date.now(),
            tier: 0,
            rod: 0,
          },
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: 0, z: 0, heading: 0, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      onScene: (scene) => (window.oceanScene = scene),
    });
    return { x: a.x, z: a.z };
  }, ARRIVE_S);
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  const started = await page.evaluate(() => window.oceanScene.selfState());
  assert.ok(
    Math.hypot(started.x - spot.x, started.z - spot.z) < 3,
    "the boat starts where the ship will come",
  );

  // Watch until the ship has come and gone (a few seconds past its arrival at the boat).
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let nearest = Infinity;
        let colliders = 0;
        const timer = setInterval(() => {
          const scene = window.oceanScene;
          const me = scene.selfState();
          const ship = scene.fleet.get("npc:patrol-0");
          if (ship)
            nearest = Math.min(
              nearest,
              Math.hypot(
                ship.mesh.position.x - me.x,
                ship.mesh.position.z - me.z,
              ),
            );
          colliders = Math.max(
            colliders,
            scene.scene.meshes.filter((m) => m.name === "ship-npc:patrol-0")
              .length,
          );
          if (Date.now() > window.arrival + 9000) {
            clearInterval(timer);
            resolve({ nearest, colliders, end: me });
          }
        }, 50);
      }),
  );
  const moved = Math.hypot(result.end.x - started.x, result.end.z - started.z);
  assert.equal(
    result.colliders,
    1,
    "the ship's body is in the physics near the boat",
  );
  // A hull of 3.6 m beam and a 7.4 m boat: touching is about 5 m between centres, never less than 3.
  assert.ok(
    result.nearest > 3,
    `the ship never reached the boat's centre (closest ${result.nearest.toFixed(1)} m)`,
  );
  assert.ok(
    moved > 4,
    `the boat was shoved along by the ship (${moved.toFixed(1)} m from where it lay)`,
  );
  assert.deepEqual(problems, []);
  console.log(
    `patrol collision: closest ${result.nearest.toFixed(1)} m, the boat shoved ${moved.toFixed(1)} m`,
  );
} finally {
  await browser.close();
}
