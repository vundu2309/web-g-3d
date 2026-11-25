import assert from "node:assert/strict";
import test from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const {
  GUIDE_INNER,
  GUIDE_OUTER,
  ROD_PLANS,
  ROD_SIDES,
  ROD_TIER_COUNT,
  joined,
  radiusAt,
  rodPlan,
  rodTierIndex,
  rodTriangles,
} = await import("../src/ocean/rod-plan.ts");
const { ROD_BASE, ROD_LEAN, ROD_LENGTH, RodSim } = await import(
  "../src/ocean/rod.ts"
);
const { RodVisual } = await import("../src/ocean/rod-visual.ts");
const { boatPalettes } = await import("../src/ocean/palette.ts");
const { LINE_WIDTH } = await import("../src/ocean/ribbon.ts");
const { PAL } = await import("../src/ocean/art/colors.ts");

// The four rods (src/ocean/rod-plan.ts): bamboo, fibreglass, carbon fibre and gold, slim, tapered,
// with hard colour bands, line guides, a round bright tip and a reel under the handle; the rarer
// the finer. Read as numbers, so the look is pinned without a GPU.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

test("there are four rods in tier order, and an invalid tier is the free bamboo one", () => {
  assert.equal(ROD_TIER_COUNT, 4);
  assert.deepEqual(
    ROD_PLANS.map((p) => p.id),
    ["bamboo", "fibreglass", "carbon", "gold"],
  );
  ROD_PLANS.forEach((p, i) => assert.equal(p.tier, i));
  for (const bad of [-1, 4, 1.5, NaN, "2", null, undefined, {}])
    assert.equal(rodTierIndex(bad), 0, String(bad));
  assert.equal(rodPlan(99), ROD_PLANS[0]);
  for (const good of [0, 1, 2, 3]) assert.equal(rodTierIndex(good), good);
});

for (const plan of ROD_PLANS) {
  const { rings } = plan;
  const cap = rings[0].s;
  test(`${plan.id}: rings run from the butt to the tip, never backwards, and the blank never gets thicker toward the tip`, () => {
    for (let i = 1; i < rings.length; i++)
      assert.ok(
        rings[i].s >= rings[i - 1].s,
        `ring ${i} is behind ring ${i - 1}`,
      );
    assert.equal(cap, 0);
    assert.ok(
      rings.at(-1).s > 1 && rings.at(-1).s < 1.1,
      "the tip's ball reaches a little past where the line starts",
    );
    assert.equal(rings.at(-1).radius, 0);
    // the blank itself (from the handle's end to where the tip starts) tapers; a node or a collar
    // (and the gold rod's pearl) may swell it a little over a few centimetres, never more
    const blank = rings.filter((r) => r.s > 0.3 && r.s <= 0.93);
    for (let i = 1; i < blank.length; i++)
      assert.ok(
        blank[i].radius <= blank[i - 1].radius + 0.015,
        `${plan.id}: ring at ${blank[i].s} swells too much`,
      );
    assert.ok(blank.at(-1).radius < blank[0].radius * 0.7, "it tapers");
  });

  test(`${plan.id}: slim (the user asked for a thinner rod) but readable, and the tip ball is the biggest thing on the blank`, () => {
    const handle = Math.max(
      ...rings.filter((r) => r.s < 0.3).map((r) => r.radius),
    );
    assert.ok(handle >= 0.08 && handle <= 0.1, `handle ${handle}`);
    assert.ok(radiusAt(plan, 0.4) <= 0.065, "the blank is slim");
    assert.ok(radiusAt(plan, 0.9) >= 0.02, "and not a thread");
    const ball = Math.max(
      ...rings.filter((r) => r.colour === "tip").map((r) => r.radius),
    );
    assert.ok(ball >= 0.08, "the bite cue stays big");
    assert.ok(ball > radiusAt(plan, 0.93) * 2, "a ball, not a taper");
    for (const r of rings.filter((x) => x.colour === "tip"))
      assert.ok(r.s >= 0.93, "the tip starts where the blank ends");
  });

  test(`${plan.id}: no surface where only the colour changes, and the guides sit on the blank`, () => {
    for (let i = 0; i + 1 < rings.length; i++)
      if (
        rings[i].colour !== rings[i + 1].colour &&
        rings[i].radius === rings[i + 1].radius &&
        rings[i].s === rings[i + 1].s
      )
        assert.equal(joined(plan, i), false);
    assert.ok(plan.guides.length >= 3);
    for (const s of plan.guides)
      assert.ok(s > 0.25 && s < 0.93, `guide at ${s}`);
    for (let i = 1; i < plan.guides.length; i++)
      assert.ok(plan.guides[i] > plan.guides[i - 1]);
  });

  test(`${plan.id}: it rests with a slight curve, and the reel hangs under the handle`, () => {
    assert.ok(plan.restBend >= 0.3 && plan.restBend <= 0.5, `${plan.restBend}`);
    assert.ok(
      plan.reel.length >= 5,
      "a reel has a body, a plate, a crank and a stem",
    );
    const kinds = new Set(plan.reel.map((p) => p.kind));
    for (const kind of ["disc", "arm", "ball", "stem"])
      assert.ok(kinds.has(kind), kind);
    for (const part of plan.reel) {
      const [down, back, along] = part.at;
      assert.ok(down > 0.05, "on the lower side of the rod");
      assert.ok(
        along > 0.15 && along < 1.1,
        `${part.kind} at ${along} m from the butt`,
      );
      assert.ok(Math.abs(back) < 0.3);
    }
  });
}

test("the first, free rod keeps the boat's trim colour; the others have colours of their own", () => {
  const names = (plan) => new Set(plan.rings.map((r) => r.colour));
  assert.ok(
    names(ROD_PLANS[0]).has("wrap"),
    "the bamboo rod's thread wrap is the boat's colour",
  );
  for (const plan of ROD_PLANS.slice(1))
    assert.ok(!names(plan).has("wrap"), `${plan.id} has no boat colour`);
  assert.ok(PAL.rod.tip, "the tip colour is a role of the shared palette");
  for (const plan of ROD_PLANS) assert.ok(names(plan).has("tip"), plan.id);
});

test("the rarer the rod the more there is to look at: ornaments only on the best two, a richer reel on the gold one", () => {
  assert.equal(ROD_PLANS[0].stud, undefined);
  assert.equal(ROD_PLANS[1].stud, undefined);
  assert.ok(ROD_PLANS[2].stud && ROD_PLANS[3].stud);
  assert.ok(
    ROD_PLANS[3].reel.length > ROD_PLANS[0].reel.length * 2,
    "the gold reel has its pearls",
  );
  assert.ok(
    ROD_PLANS[3].rings.length > ROD_PLANS[0].rings.length,
    "and its blank more bands",
  );
  assert.ok(GUIDE_OUTER > GUIDE_INNER * 1.4, "an eyelet with a hole");
});

// ---------------------------------------------------------------------------------------------
// The drawn rod (real meshes, headless): what it costs
// ---------------------------------------------------------------------------------------------
function build(tier) {
  const scene = new Scene(new NullEngine());
  const node = new TransformNode("boat", scene);
  const rod = new RodVisual(
    scene,
    node,
    boatPalettes[0],
    seeded(1),
    ROD_BASE,
    tier,
  );
  const meshes = scene.meshes.filter((m) => m.name.startsWith("rod-"));
  const triangles = (name) =>
    meshes
      .filter((m) => m.name === name)
      .reduce((n, m) => n + m.getTotalIndices() / 3, 0);
  return {
    scene,
    rod,
    meshes,
    blank: triangles("rod-blank"),
    reel: triangles("rod-fixed"),
  };
}

test("a rod is two meshes (the blank that bends and the reel that does not), and its triangles are pinned per tier", () => {
  const pinned = [];
  for (let tier = 0; tier < 4; tier++) {
    const { scene, meshes, blank, reel } = build(tier);
    assert.equal(meshes.length, 2, `tier ${tier}: two draw calls`);
    assert.equal(
      blank,
      rodTriangles(tier),
      `tier ${tier}: the blank is what the plan says`,
    );
    pinned.push({ tier, blank, reel, total: blank + reel });
    scene.dispose();
  }
  console.log(
    pinned
      .map(
        (p) => `tier ${p.tier}: blank ${p.blank} + reel ${p.reel} = ${p.total}`,
      )
      .join("\n"),
  );
  // The whole rod stays small: a boat with its rod is about 6,000 triangles (boat-tier.ts), and
  // the rod is drawn only on boats near enough to see it (boat-lod.ts).
  for (const p of pinned)
    assert.ok(p.total < 1500, `tier ${p.tier}: ${p.total}`);
  for (let i = 1; i < 4; i++)
    assert.ok(
      pinned[i].total >= pinned[i - 1].total,
      "the rarer the rod the more it has",
    );
  assert.ok(pinned[0].total > 200, "even the first rod is a real rod");
  assert.equal(ROD_SIDES, 8);
});

test("every tier's blank follows the spring, is as long as ever and keeps its place when it is drawn again", () => {
  for (let tier = 0; tier < 4; tier++) {
    const { scene, rod } = build(tier);
    const rest = { ...rod.tip() };
    rod.step(1 / 60, { x: 0.4, y: -0.9, z: 0 }, 0);
    for (let i = 0; i < 90; i++) rod.step(1 / 60, { x: 0.4, y: -0.9, z: 0 }, 0);
    assert.ok(rod.tip().y < rest.y - 0.3, `tier ${tier}: bends under a pull`);
    for (let i = 0; i < 240; i++) rod.step(1 / 60, { x: 0, y: 0, z: 0 }, 0);
    assert.ok(
      dist(rod.tip(), rest) < 0.05,
      `tier ${tier}: springs back to its rest`,
    );
    scene.dispose();
  }
});

test("a rod made with an invalid tier is the bamboo rod", () => {
  const a = build(99);
  assert.equal(a.rod.tier, 0);
  a.scene.dispose();
});

// ---------------------------------------------------------------------------------------------
// The slight curve
// ---------------------------------------------------------------------------------------------
test("a rest curve bends the tip about 0.3 m toward the reel's side and leaves the length and the hand alone", () => {
  const straight = new RodSim(seeded(1));
  for (const plan of ROD_PLANS) {
    const bent = new RodSim(seeded(1), ROD_BASE, plan.restBend);
    const a = straight.points(12);
    const b = bent.points(12);
    let length = 0;
    for (let i = 1; i < b.length; i++) length += dist(b[i - 1], b[i]);
    assert.ok(
      Math.abs(length - ROD_LENGTH) < 1e-6,
      `${plan.id}: a curved rod is as long`,
    );
    assert.equal(b[0].x, ROD_BASE.x, "the hand does not move");
    const shift = dist(a.at(-1), b.at(-1));
    assert.ok(
      shift > 0.24 && shift < 0.36,
      `${plan.id}: the tip moves ${shift.toFixed(3)} m`,
    );
    // toward the side the line pulls: down the lean's perpendicular, in the boat's plane
    const down = { x: Math.cos(ROD_LEAN), y: -Math.sin(ROD_LEAN) };
    const dx = b.at(-1).x - a.at(-1).x;
    const dy = b.at(-1).y - a.at(-1).y;
    assert.ok(
      dx * down.x + dy * down.y > 0.95 * shift,
      "it bends toward the reel",
    );
    assert.ok(Math.abs(b.at(-1).z - a.at(-1).z) < 1e-9, "and not sideways");
    // the butt stays straight: the curve grows toward the tip
    assert.ok(
      dist(a[3], b[3]) < 0.1 * shift,
      "the first part of the rod is nearly straight",
    );
  }
});

test("a rest curve is not part of the spring: the bend and the reach are measured from it", () => {
  const rod = new RodSim(seeded(1), ROD_BASE, 0.38);
  assert.equal(rod.bend, 0, "at rest it counts as not bent");
  const plain = new RodSim(seeded(1));
  for (let i = 0; i < 90; i++) {
    rod.step(1 / 60, { x: 0.4, y: -0.9, z: 0 });
    plain.step(1 / 60, { x: 0.4, y: -0.9, z: 0 });
  }
  assert.ok(
    Math.abs(rod.bend - plain.bend) < 1e-9,
    "a pull bends it as much as a straight one",
  );
  assert.equal(
    new RodSim(seeded(1)).rest,
    0,
    "the default is a straight rod, as before",
  );
});

test("the fishing line is a thin strip, about one and a half to two pixels wide on a phone at any distance the game shows it, never so thin it breaks up", () => {
  // The game's cameras look with a vertical field of 0.9 (chase) or 0.75 (fishing) radians; a phone
  // in landscape is about 390 px high.
  const widths = [];
  for (const fov of [0.9, 0.75])
    for (const distance of [8, 12, 20, 30, 40, 50]) {
      const width = Math.min(
        LINE_WIDTH.max,
        Math.max(LINE_WIDTH.min, distance * LINE_WIDTH.perMetre),
      );
      const pixel = (2 * distance * Math.tan(fov / 2)) / 390;
      const pixels = width / pixel;
      widths.push(pixels);
      assert.ok(
        pixels >= 1.1 && pixels <= 2.2,
        `${pixels.toFixed(2)} px at ${distance} m (fov ${fov})`,
      );
    }
  // It was 1.8 to 2.3 px (and up to 3 at the ends) before the user asked for a thinner line.
  assert.ok(
    Math.max(...widths) < 1.8,
    `the thickest is ${Math.max(...widths).toFixed(2)} px`,
  );
  assert.ok(
    LINE_WIDTH.halo >= 1.4,
    "a halo wider than the line, so it shows on bright water and foam",
  );
});
