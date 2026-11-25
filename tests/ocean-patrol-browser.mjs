import assert from "node:assert/strict";
import { launchBrowser } from "./browser.mjs";

// The patrol ships (patrol-routes.ts) in the real scene: six boats nobody owns appear with no server
// help, move along their loops by the clock, are named "Tàu tuần tra" in their own colour, hold no
// rod, and never get an arrow at the edge of the screen (a player who is online does: the control).
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
  await page.evaluate(async () => {
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
      // An online player 250 m behind the player's boat: out of view, so it gets an arrow.
      onBoats(
        [
          boat("me", "Bạn", start.x, start.z),
          boat("lan", "Lan", start.x, start.z + 250),
        ],
        Date.now(),
      );
      return {
        uid: "me",
        pose: { x: start.x, z: start.z, heading: 0, fishing: false },
        dispose() {},
        publish: async () => {},
      };
    };
    window.stop = startOcean(document.querySelector("#app"), () => {}, {
      connect,
      onScene: (scene) => (window.oceanScene = scene),
    });
  });
  await page
    .getByText("Đã vào biển chung", { exact: false })
    .waitFor({ timeout: 90000 });
  await page.waitForTimeout(2500);

  const ships = () =>
    page.evaluate(() => {
      const fleet = window.oceanScene.fleet;
      return [...fleet.entries()]
        .filter(([uid]) => uid.startsWith("npc:"))
        .map(([uid, craft]) => ({
          uid,
          x: craft.mesh.position.x,
          z: craft.mesh.position.z,
          npc: craft.npc,
          tier: craft.tier,
          label: craft.label.textContent,
          isNpc: craft.label.classList.contains("is-npc"),
          edge: craft.label.dataset.edge ?? null,
          rod: craft.rod?.root?.isEnabled?.() ?? null,
        }));
    });
  const first = await ships();
  assert.equal(first.length, 6, "six patrol ships");
  for (const ship of first) {
    assert.equal(ship.npc, true, `${ship.uid} is nobody's boat`);
    assert.equal(ship.label, "Tàu tuần tra");
    assert.equal(ship.isNpc, true);
    assert.equal(ship.edge, null, `${ship.uid} has no arrow at the edge`);
  }
  // They sail: a few seconds later each is somewhere else (6 m/s on the clock).
  await page.waitForTimeout(4000);
  const later = await ships();
  for (const [i, ship] of later.entries()) {
    const moved = Math.hypot(ship.x - first[i].x, ship.z - first[i].z);
    assert.ok(
      moved > 8,
      `${ship.uid} moved ${moved.toFixed(1)} m in about 4 s`,
    );
  }
  // The control: a player who is online, out of view, is shown by an arrow at the edge.
  const arrow = await page.evaluate(
    () => window.oceanScene.fleet.get("lan")?.label.dataset.edge ?? null,
  );
  assert.equal(arrow, "true", "an online player out of view gets an arrow");
  assert.deepEqual(problems, []);
  console.log(
    `patrol: ${first.length} ships, moved ${later.map((s, i) => Math.hypot(s.x - first[i].x, s.z - first[i].z).toFixed(0)).join("/")} m`,
  );
} finally {
  await browser.close();
}
