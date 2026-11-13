import assert from "node:assert/strict";
import test from "node:test";

const {
  CHASE,
  clearFraction,
  easeClear,
  heightFor,
  pushOut,
  reachFor,
  turnLead,
} = await import("../src/ocean/chase-camera.ts");
const { seaObstacles } = await import("../src/ocean/market.ts");
const { SEA_BOUND } = await import("../src/ocean/model.ts");

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test("the default view is higher and farther than before, and the fishing view is closer", () => {
  assert.ok(CHASE.back > 14.5 && CHASE.height > 6.8 && CHASE.lookAhead >= 30);
  assert.ok(
    CHASE.fishingBack < CHASE.back && CHASE.fishingHeight < CHASE.height,
  );
});

test("with nothing in the way the camera keeps its whole reach", () => {
  assert.equal(clearFraction({ x: 0, z: 0 }, { x: 0, z: 17.5 }, []), 1);
  const aside = [{ x: 40, z: 8, radius: 5 }];
  assert.equal(clearFraction({ x: 0, z: 0 }, { x: 0, z: 17.5 }, aside), 1);
  const behindBoat = [{ x: 0, z: -10, radius: 4 }];
  assert.equal(clearFraction({ x: 0, z: 0 }, { x: 0, z: 17.5 }, behindBoat), 1);
});

test("an obstacle between the boat and the camera shortens the reach to just short of it", () => {
  const island = { x: 0, z: 12, radius: 3 };
  const fraction = clearFraction({ x: 0, z: 0 }, { x: 0, z: 17.5 }, [island]);
  const expected = (12 - (3 + CHASE.margin)) / 17.5;
  assert.ok(Math.abs(fraction - expected) < 1e-9, `${fraction} vs ${expected}`);
  const camera = { x: 0, z: 17.5 * fraction };
  assert.ok(dist(camera, island) >= island.radius + CHASE.margin - 1e-9);
});

test("a boat already close to a shore is left to pushOut instead of getting a zero reach", () => {
  const island = { x: 0, z: 2, radius: 1.5 };
  assert.equal(clearFraction({ x: 0, z: 0 }, { x: 0, z: 17.5 }, [island]), 1);
});

test("the reach never drops below the minimum or past what was wanted", () => {
  assert.equal(reachFor(17.5, 1), 17.5);
  assert.equal(reachFor(17.5, 0), CHASE.minReach);
  assert.equal(
    reachFor(2, 0),
    2,
    "an already short reach is not stretched to the minimum",
  );
  assert.ok(reachFor(17.5, 0.5) > CHASE.minReach);
});

test("a camera that had to come in is lower, and one at full reach is unchanged", () => {
  assert.equal(heightFor(9.6, 17.5, 17.5), 9.6);
  assert.equal(heightFor(9.6, CHASE.minReach, 17.5) < 9.6, true);
  assert.ok(heightFor(9.6, 0, 17.5) >= CHASE.minHeight - 1e-9);
  const mid = heightFor(9.6, 9, 17.5);
  assert.ok(mid > heightFor(9.6, 5, 17.5) && mid < 9.6);
});

test("the camera comes in much faster than it goes back out", () => {
  const down = easeClear(1, 0.2, 0.1);
  const up = easeClear(0.2, 1, 0.1);
  assert.ok(1 - down > up - 0.2, "closing is quicker than opening");
  assert.equal(easeClear(0.5, 0.5, 1), 0.5);
  assert.equal(easeClear(0.3, 1, 0), 0.3);
});

test("pushOut moves a point out to the edge of an obstacle and leaves others alone", () => {
  const island = { x: 10, z: 10, radius: 4 };
  const outside = { x: 30, z: 10 };
  assert.deepEqual(pushOut(outside, [island]), outside);
  const inside = pushOut({ x: 11, z: 10 }, [island]);
  assert.ok(Math.abs(dist(inside, island) - (4 + CHASE.margin)) < 1e-9);
  assert.ok(inside.x > 11, "pushed away from the centre, along the same line");
  assert.equal(
    pushOut({ x: 10, z: 10 }, [island]).x > 10,
    true,
    "even from the centre",
  );
});

test("the view leans into a turn, within limits, and straightens when the boat does", () => {
  let lead = 0;
  for (let i = 0; i < 60; i++) lead = turnLead(lead, 1.2, 1 / 30);
  assert.ok(
    lead > 0.2 && lead <= CHASE.leadMax,
    `right turn leads right: ${lead}`,
  );
  let left = 0;
  for (let i = 0; i < 60; i++) left = turnLead(left, -1.2, 1 / 30);
  assert.ok(Math.abs(left + lead) < 1e-9, "left is the mirror of right");
  let wild = 0;
  for (let i = 0; i < 600; i++) wild = turnLead(wild, 40, 1 / 30);
  assert.ok(wild <= CHASE.leadMax + 1e-9, "a spinning boat is capped");
  for (let i = 0; i < 300; i++) lead = turnLead(lead, 0, 1 / 30);
  assert.ok(Math.abs(lead) < 1e-3, "back to straight ahead");
  assert.equal(turnLead(0.2, 2, 0), 0.2);
});

test("on the real sea the camera never ends up inside an island or a pier, nor behind one", () => {
  const obstacles = seaObstacles();
  let seed = 12345;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  let shortened = 0;
  for (let i = 0; i < 4000; i++) {
    const boat = {
      x: (random() * 2 - 1) * SEA_BOUND,
      z: (random() * 2 - 1) * SEA_BOUND,
    };
    // Keep to boats the way the game does: outside every obstacle's shore.
    if (obstacles.some((o) => dist(boat, o) < o.radius + CHASE.margin))
      continue;
    const heading = random() * Math.PI * 2;
    const want = {
      x: boat.x - Math.sin(heading) * CHASE.back,
      z: boat.z + Math.cos(heading) * CHASE.back,
    };
    const fraction = clearFraction(boat, want, obstacles);
    if (fraction < 1) shortened++;
    const reach = reachFor(CHASE.back, fraction);
    const k = reach / CHASE.back;
    // Whatever the reach, the final position (after pushOut, as the scene does) is outside.
    const end = pushOut(
      { x: boat.x + (want.x - boat.x) * k, z: boat.z + (want.z - boat.z) * k },
      obstacles,
    );
    for (const o of obstacles)
      assert.ok(dist(end, o) >= o.radius + CHASE.margin - 1e-6, `end ${i}`);
    for (let step = 0; step <= 20; step++) {
      const p = {
        x: boat.x + (want.x - boat.x) * k * (step / 20),
        z: boat.z + (want.z - boat.z) * k * (step / 20),
      };
      // The minimum reach may sit inside the margin, never inside the obstacle itself.
      for (const o of obstacles)
        assert.ok(
          dist(p, o) >=
            Math.min(o.radius + CHASE.margin, dist(boat, o)) - 1e-6 ||
            k * CHASE.back <= CHASE.minReach + 1e-9,
          `sample ${i} step ${step}`,
        );
    }
  }
  assert.ok(shortened > 0, "some of the 4000 views did meet an obstacle");
});
