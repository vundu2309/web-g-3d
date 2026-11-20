import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import HavokPhysics from "@babylonjs/havok";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { readGlb } from "./support/glb.mjs";
import {
  BOAT_TIERS,
  BOAT_TIER_COUNT,
  HULL_HEIGHT,
  HULL_MASS,
  boatTier,
  boatTierIndex,
  bowAnchor,
  cameraScale,
  glslBoatShape,
  hullSamples,
} from "../src/ocean/boat-tier.ts";
import {
  HULL,
  SPEED_SCALE,
  createBoatPhysics,
  enableSeaPhysics,
} from "../src/ocean/boat-physics.ts";
import {
  HULL_BOX,
  RUDDER,
  YAW_INERTIA,
  handlingFor,
  topTurnRate,
} from "../src/ocean/hull-handling.ts";
import {
  HULL_REACH,
  HULL_REACH_MAX,
  HULL_WATER,
  RING_FADE,
  EDGE_PER_METRE,
  collarWidth,
  hullEdge,
  hullHalfWidth,
  hullReach,
} from "../src/ocean/hull-water.ts";
import { BOW_TIP, dropletAt } from "../src/ocean/bow-wave.ts";
import {
  HULL_LENGTH,
  HULL_STERN,
  HULL_WIDTH,
} from "../src/ocean/ripple-sim.ts";
import { ROD_BASE, RodSim } from "../src/ocean/rod.ts";
import { BOAT_FILE, BOAT_PARTS, rgb } from "../src/ocean/boat-paint.ts";
import { PAL } from "../src/ocean/art/colors.ts";
import { packBoats, BOAT_MAX } from "../src/ocean/water.ts";
import { TIER_COUNT } from "../src/ocean/upgrades.ts";

const read = (name) =>
  readFile(new URL(`../src/ocean/${name}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------------------------
// The exported models, read as data (the game's axes: x -> -x, z -> -z, bow at -Z)
// ---------------------------------------------------------------------------------------------
const files = new Map();
function model(tier) {
  const { file } = BOAT_TIERS[tier];
  if (!files.has(file)) {
    const { gltf, accessor } = readGlb(`public/models/${file}`);
    const byName = (n) => gltf.nodes.find((node) => node.name === n);
    const world = (name) => {
      const node = byName(name);
      const t = node.translation ?? [0, 0, 0];
      const out = [];
      for (const p of gltf.meshes[node.mesh].primitives) {
        const pos = accessor(p.attributes.POSITION);
        const col = accessor(p.attributes.COLOR_0);
        for (let i = 0; i < pos.count; i++)
          out.push({
            x: -(pos.data[i * 3] + t[0]),
            y: pos.data[i * 3 + 1] + t[1],
            z: -(pos.data[i * 3 + 2] + t[2]),
            c: [0, 1, 2].map((k) => col.data[i * col.comps + k]),
          });
      }
      return out;
    };
    const triangles = BOAT_PARTS.reduce(
      (sum, name) =>
        sum +
        gltf.meshes[byName(name).mesh].primitives.reduce(
          (n, p) => n + gltf.accessors[p.indices].count / 3,
          0,
        ),
      0,
    );
    files.set(file, { world, triangles });
  }
  return files.get(file);
}
const range = (vs, axis) => [
  Math.min(...vs.map((v) => v[axis])),
  Math.max(...vs.map((v) => v[axis])),
];
const near = (a, b, e) => Math.abs(a - b) <= e;
const nearColour = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.003);
/** The centre of the rod holder's collar: the rubber vertices of the deck at the stern, starboard. */
function holderCentre(tier) {
  const rubber = rgb(PAL.fit.rubber);
  const found = model(tier)
    .world("deck")
    .filter((v) => nearColour(v.c, rubber) && v.x > 0.8 && v.z > 1.8);
  assert.equal(found.length, 50, `tier ${tier}: one rod holder`);
  return {
    x: (range(found, "x")[0] + range(found, "x")[1]) / 2,
    y: (range(found, "y")[0] + range(found, "y")[1]) / 2,
    z: (range(found, "z")[0] + range(found, "z")[1]) / 2,
  };
}

// ---------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------
test("tier 0 is today's boat to the last digit", () => {
  const t = boatTier(0);
  assert.equal(BOAT_TIERS.length, BOAT_TIER_COUNT);
  assert.equal(BOAT_TIER_COUNT, TIER_COUNT, "one boat per tier of the shop");
  assert.equal(t.file, BOAT_FILE);
  assert.deepEqual(t.box, { width: 2.8, height: 1.4, length: 7.4 });
  assert.deepEqual(HULL, { width: 2.8, height: 1.4, length: 7.4, mass: 900 });
  assert.deepEqual(HULL_BOX, { mass: 900, width: 2.8, length: 7.4 });
  assert.equal(HULL_MASS, 900);
  assert.equal(HULL_HEIGHT, 1.4);
  assert.deepEqual(t.waterline, {
    halfLength: 3.9,
    beam: 1.45,
    stern: 1.0,
    tip: 0.2,
  });
  assert.equal(HULL_WATER.halfLength, 3.9);
  assert.equal(HULL_WATER.beam, 1.45);
  assert.equal(t.bowTip, 3.7);
  assert.equal(BOW_TIP, 3.7);
  assert.deepEqual(t.wake, { length: 3.2, width: 1.2, stern: 2.8, reach: 9 });
  assert.equal(HULL_LENGTH, 3.2);
  assert.equal(HULL_WIDTH, 1.2);
  assert.equal(HULL_STERN, 2.8);
  assert.deepEqual(t.rod, ROD_BASE);
  assert.deepEqual(ROD_BASE, { x: 1.25, y: 1.35, z: 2.52 });
  assert.deepEqual(t.shadow, {
    hull: { length: 3.9, width: 1.5, top: 1.71 },
    house: { shift: 1.0, length: 0.95, width: 0.85, from: 0.8, to: 2.21 },
    mast: { shift: 0.7, from: 2.2, to: 3.82 },
  });
  // The buoyancy points: 1.1 m out, 3 m fore and aft; the bow's lift 3.2 m ahead.
  assert.deepEqual(hullSamples(0), [
    { x: -1.1, z: 3 },
    { x: -1.1, z: 0 },
    { x: -1.1, z: -3 },
    { x: 1.1, z: 3 },
    { x: 1.1, z: 0 },
    { x: 1.1, z: -3 },
  ]);
  assert.equal(bowAnchor(0), 3.2);
  // The handling numbers are the tuned ones, unscaled.
  assert.deepEqual(handlingFor(HULL_BOX), {
    yawInertia: YAW_INERTIA,
    rudder: RUDDER,
    bank: 1,
  });
  assert.equal(HULL_REACH, 12);
  assert.equal(hullReach(3.9), 12);
  // The first boat's shader shape is the one the water has always had.
  const glsl = glslBoatShape();
  assert.ok(glsl.includes("s.hullLength = 3.9000;"));
  assert.ok(glsl.includes("s.houseShift = 1.0000;"));
  assert.ok(glsl.includes("s.mastTo = 3.8200;"));
});

test("the rows are the four boats of the shop, bigger each time", () => {
  assert.deepEqual(
    BOAT_TIERS.map((t) => t.file),
    ["boat.glb", "boat-2.glb", "boat-3.glb", "boat-4.glb"],
  );
  assert.deepEqual(
    BOAT_TIERS.map((t) => t.hullLength),
    [7.4, 8.4, 9.6, 10.8],
  );
  for (let i = 1; i < BOAT_TIERS.length; i++) {
    const a = BOAT_TIERS[i - 1];
    const b = BOAT_TIERS[i];
    for (const key of ["length", "width"])
      assert.ok(b.box[key] > a.box[key], `box ${key} grows`);
    assert.ok(b.waterline.halfLength > a.waterline.halfLength);
    assert.ok(b.waterline.beam > a.waterline.beam);
    assert.ok(b.bowTip > a.bowTip);
    assert.ok(b.wake.length > a.wake.length && b.wake.reach > a.wake.reach);
    assert.ok(
      b.rod.z > a.rod.z && b.rod.x > a.rod.x,
      "the holder moves aft and out",
    );
    assert.equal(
      b.box.height,
      a.box.height,
      "the height sets the waterline: it stays",
    );
  }
  assert.deepEqual(
    BOAT_TIERS.map((t) => t.box.width),
    [2.8, 3.32, 3.6, 7.3],
    "the flagship's box covers its outrigger booms (the user's choice, 2026-11-20)",
  );
  assert.deepEqual(
    BOAT_TIERS.map((t) => t.hull.width),
    [2.8, 3.32, 3.6, 3.88],
    "the hull itself is what the feel is worked from",
  );
});

test("an invalid tier is tier 0", () => {
  for (const bad of [
    -1,
    4,
    1.5,
    NaN,
    Infinity,
    "2",
    "0",
    null,
    undefined,
    {},
    [1],
  ]) {
    assert.equal(boatTierIndex(bad), 0, String(bad));
    assert.equal(boatTier(bad), BOAT_TIERS[0]);
    assert.deepEqual(hullSamples(bad), hullSamples(0));
    assert.equal(bowAnchor(bad), 3.2);
  }
  for (const good of [0, 1, 2, 3]) assert.equal(boatTierIndex(good), good);
  // An invalid tier is the first boat (w = 1 + 0 + a whole hull's 1); a lifted hull is 1.
  assert.equal(packBoats([{ x: 0, z: 0, heading: 0, tier: 9 }])[3], 2);
  assert.equal(packBoats([{ x: 0, z: 0, heading: 0, tier: 9, wet: 0 }])[3], 1);
});

// ---------------------------------------------------------------------------------------------
// The table against the exported models: a re-export that changes a size fails here
// ---------------------------------------------------------------------------------------------
for (const spec of BOAT_TIERS) {
  const { tier } = spec;
  test(`tier ${tier} (${spec.file}): the hull, the box, the rod holder and the shadow match the model`, () => {
    const { world, triangles } = model(tier);
    assert.equal(triangles, spec.triangles, "triangles of the six parts");
    const hull = world("hull");
    const [x0, x1] = range(hull, "x");
    const [z0, z1] = range(hull, "z");
    assert.ok(
      near(x1, spec.halfBeam, 0.01) && near(-x0, spec.halfBeam, 0.01),
      `half beam ${x1}`,
    );
    // Design length + the stem's overhang (the rake and the bumper): 0.15 m on every tier.
    assert.ok(near(z1 - z0, spec.hullLength + 0.15, 0.03), `hull ${z1 - z0}`);
    assert.equal(spec.box.length, spec.hullLength);
    // The hull's body is 14/15 of the beam at the gunwale on every tier (tier 0: 2.8 of 3.0 m);
    // the collision box is that too, except the flagship's, which covers its outrigger booms.
    assert.ok(
      near(spec.hull.width, (2 * spec.halfBeam * 14) / 15, 0.01),
      `hull ${spec.hull.width} of ${2 * spec.halfBeam}`,
    );
    assert.equal(spec.hull.length, spec.hullLength);
    assert.ok(near(spec.waterline.halfLength, spec.hullLength / 2 + 0.2, 0.01));
    assert.ok(near(spec.waterline.beam, spec.halfBeam - 0.05, 0.01));
    assert.ok(near(spec.bowTip, spec.hullLength / 2, 0.01));
    // The rod holder: its collar sits where the first boat's does plus the model's own offset.
    const centre = holderCentre(tier);
    const first = holderCentre(0);
    for (const axis of ["x", "y", "z"])
      assert.ok(
        near(spec.rod[axis], ROD_BASE[axis] + centre[axis] - first[axis], 0.01),
        `rod ${axis}: ${spec.rod[axis]} against ${ROD_BASE[axis] + centre[axis] - first[axis]}`,
      );
    // The lantern: the mast's top, and where it stands along the boat.
    const lantern = world("lantern");
    const [, top] = range(lantern, "y");
    const [l0, l1] = range(lantern, "z");
    assert.ok(near(top, spec.shadow.mast.to, 0.06), `mast top ${top}`);
    assert.ok(
      near(-(l0 + l1) / 2, spec.shadow.mast.shift, 0.1),
      "the mast stands where the shadow says",
    );
    // The hull's top and the wheelhouse inside the canopy.
    assert.ok(
      near(range(hull, "y")[1], spec.shadow.hull.top, 0.15),
      "gunwale height",
    );
    const [cx0, cx1] = range(
      world("canopy").filter(
        (v) => v.y < spec.shadow.house.to && v.y > 1.0 && Math.abs(v.x) < 2.5,
      ),
      "x",
    );
    assert.ok(
      cx1 - cx0 > spec.shadow.house.width,
      "the house is as wide as its shadow",
    );
  });
}

test("nothing wider than the hull touches the water: the flagship's outriggers are booms 4.7 m above it", () => {
  // The whole model is 3.0 / 3.56 / 3.86 / 7.3 m wide, but the 7.3 of tier 3 (the flagship) is two
  // outrigger booms raised in a V with a float hanging from each tip (tools/blender/upgrade_boats.py),
  // above 4.7 m. Everything under 3 m of height is inside the hull's own beam, so the water, the buoyancy
  // and the feel follow the hull; only the box that collides covers the booms (the user's choice).
  for (const spec of BOAT_TIERS) {
    const all = BOAT_PARTS.flatMap((name) => model(spec.tier).world(name));
    const low = all.filter((v) => v.y < 3);
    assert.ok(
      Math.max(...low.map((v) => Math.abs(v.x))) <= spec.halfBeam + 0.35,
      `tier ${spec.tier}: below 3 m nothing is wider than the hull`,
    );
    const wide = all.filter((v) => Math.abs(v.x) > spec.halfBeam + 0.35);
    if (spec.tier < 3) assert.equal(wide.length, 0);
    else {
      assert.ok(wide.length > 100, "the booms");
      assert.ok(
        Math.min(...wide.map((v) => v.y)) > 4.5,
        `booms start at ${Math.min(...wide.map((v) => v.y))}`,
      );
      assert.ok(Math.max(...wide.map((v) => Math.abs(v.x))) > 3.6);
    }
    // the flagship's box covers the whole model, booms included, and is no wider than it must be;
    // the others' box is the hull's body, a little inside the planking
    const reach = Math.max(...all.map((v) => Math.abs(v.x)));
    if (spec.tier === 3)
      assert.ok(
        near(spec.box.width, 2 * reach, 0.1),
        `the model reaches ${2 * reach} m, the box is ${spec.box.width}`,
      );
    else assert.equal(spec.box.width, spec.hull.width);
  }
});

test("the first boat's rod holder is where ROD_BASE says; the others have their own base, and the rod starts there", () => {
  assert.ok(near(holderCentre(0).z, ROD_BASE.z, 0.01));
  for (const spec of BOAT_TIERS) {
    const sim = new RodSim(() => 0.5, spec.rod);
    assert.deepEqual(
      sim.points(5)[0],
      spec.rod,
      `tier ${spec.tier}: the butt is at the holder`,
    );
    const rest = sim.tip();
    const first = new RodSim(() => 0.5).tip();
    assert.ok(
      near(rest.x - first.x, spec.rod.x - ROD_BASE.x, 1e-9),
      "the same rod, moved",
    );
    assert.ok(near(rest.z - first.z, spec.rod.z - ROD_BASE.z, 1e-9));
  }
  assert.deepEqual(new RodSim().base, ROD_BASE);
});

// ---------------------------------------------------------------------------------------------
// Handling is the same for every tier (pure part)
// ---------------------------------------------------------------------------------------------
test("the rudder and the lean follow the box, so every tier turns at the same rate", () => {
  const rate = topTurnRate();
  for (const spec of BOAT_TIERS) {
    const box = {
      mass: HULL_MASS,
      width: spec.hull.width,
      length: spec.hull.length,
    };
    assert.ok(
      near(topTurnRate(1, box), rate, rate * 1e-12),
      `tier ${spec.tier}`,
    );
    const h = handlingFor(box);
    assert.ok(h.rudder >= RUDDER && h.yawInertia >= YAW_INERTIA);
    assert.ok(near(h.bank, (spec.hull.width / 2.8) ** 2, 1e-12));
  }
  // and the mass, the drive and the drag are not in the table at all
  assert.ok(!("mass" in boatTier(1)) && !("thrust" in boatTier(1)));
});

test("the buoyancy points keep their place in the box, so the waterline and the stiffness per size stay", () => {
  for (const spec of BOAT_TIERS) {
    const samples = hullSamples(spec.tier);
    assert.equal(samples.length, 6);
    assert.ok(
      near(
        Math.max(...samples.map((p) => p.x)) / spec.hull.width,
        1.1 / 2.8,
        1e-9,
      ),
    );
    assert.ok(
      near(
        Math.max(...samples.map((p) => p.z)) / spec.hull.length,
        3 / 7.4,
        1e-9,
      ),
    );
    assert.ok(near(bowAnchor(spec.tier) / spec.hull.length, 3.2 / 7.4, 1e-9));
    // always inside the box
    for (const p of samples)
      assert.ok(
        Math.abs(p.x) < spec.box.width / 2 &&
          Math.abs(p.z) < spec.box.length / 2,
      );
  }
});

// ---------------------------------------------------------------------------------------------
// The water round the hull
// ---------------------------------------------------------------------------------------------
test("every tier's waterline, collar and rings fit inside the shader's reach, and EDGE_PER_METRE is shared", () => {
  assert.ok(near(EDGE_PER_METRE, 1.2 / 1.45, 1e-12));
  for (const spec of BOAT_TIERS) {
    const line = spec.waterline;
    assert.equal(hullHalfWidth(line.halfLength, line), 0);
    assert.ok(hullHalfWidth(0, line) <= line.beam + 1e-9);
    assert.ok(
      hullHalfWidth(-0.5 * line.halfLength, line) >
        hullHalfWidth(0.9 * line.halfLength, line),
    );
    assert.ok(
      Math.abs(hullEdge(0, line.beam * 0.9, line)) < 1e-9,
      "inside the outline",
    );
    assert.ok(
      near(hullEdge(line.halfLength + 2, 0, line), 2 * EDGE_PER_METRE, 1e-9),
    );
    assert.equal(
      collarWidth(line.halfLength + 0.2, 1, line.halfLength),
      0,
      "no collar past the stem",
    );
    assert.ok(collarWidth(0, 1, line.halfLength) > 0.5);
    // the farthest the rings reach from the middle of the hull (the ring fade is in edge units)
    const farthest = line.halfLength + RING_FADE.to / EDGE_PER_METRE;
    assert.ok(
      farthest < HULL_REACH_MAX - 0.5,
      `tier ${spec.tier} reaches ${farthest.toFixed(1)} of ${HULL_REACH_MAX}`,
    );
    assert.ok(near(hullReach(line.halfLength), line.halfLength + 8.1, 1e-9));
  }
  const water = packBoats(
    [0, 1, 2, 3].map((tier) => ({ x: 1, z: 2, heading: 0.5, tier })),
  );
  assert.equal(water.length, BOAT_MAX * 4);
  // w is 1 + 2 x the tier + how wet the hull is (a whole hull is 1): one number holds both, and the
  // shader takes them apart as `tier = floor((w - 1) / 2)`, `wet = (w - 1) - 2 x tier`.
  assert.deepEqual(
    [3, 7, 11, 15].map((i) => water[i]),
    [2, 4, 6, 8],
    "a wet boat of each tier",
  );
  assert.equal(water[BOAT_MAX * 4 - 1], 0, "an empty slot is 0");
  for (const tier of [0, 1, 2, 3])
    for (const wet of [0, 0.25, 0.5, 1]) {
      const w = packBoats([{ x: 0, z: 0, heading: 0, tier, wet }])[3];
      const code = w - 1;
      const back = Math.floor(code * 0.5);
      assert.equal(back, tier, `tier ${tier} wet ${wet}`);
      assert.ok(near(code - 2 * back, wet, 1e-9), `tier ${tier} wet ${wet}`);
    }
});

test("the shader gets the shape of each boat from one generated chain, with no literal hull left", async () => {
  const water = await read("water.ts");
  assert.ok(water.includes("${glslBoatShape()}"));
  assert.ok(
    water.includes(
      "BoatShape s = boatShape(1.0 + floor((boat.w - 1.0) * 0.5));",
    ),
    "the shadow loop takes the tier out of w",
  );
  assert.ok(
    water.includes("BoatShape s = boatShape(1.0 + tierCode);"),
    "the hull's water takes the tier out of w",
  );
  assert.ok(
    water.includes(
      "hullEdge(u, v, s.lineLength, s.lineBeam, s.lineStern, s.lineTip)",
    ),
  );
  assert.ok(water.includes("collarWidth(u, lap, s.lineLength)"));
  assert.ok(
    !water.includes("3.9, 1.5, 0.0"),
    "the hull's shadow is not a literal any more",
  );
  const glsl = glslBoatShape();
  for (const spec of BOAT_TIERS) {
    assert.ok(
      glsl.includes(`s.hullLength = ${spec.shadow.hull.length.toFixed(4)};`),
      `tier ${spec.tier}`,
    );
    assert.ok(glsl.includes(`s.mastTo = ${spec.shadow.mast.to.toFixed(4)};`));
    assert.ok(glsl.includes(`s.lineBeam = ${spec.waterline.beam.toFixed(4)};`));
  }
  assert.ok(
    glsl.includes("if (code > 3.5)") &&
      glsl.includes("if (code > 2.5)") &&
      glsl.includes("if (code > 1.5)"),
  );
  // The bow wave leaves from each boat's own stem.
  const a = dropletAt(3, 1, 9, boatTier(0));
  const b = dropletAt(3, 1, 9, boatTier(3));
  assert.ok(
    b.u > a.u + 1.5,
    `the spray of the big boat starts farther ahead: ${a.u} ${b.u}`,
  );
  assert.ok(
    near(dropletAt(3, 1, 9).u, a.u, 0),
    "the default is the first boat",
  );
});

// ---------------------------------------------------------------------------------------------
// The body: the same boat to drive, only bigger (real Havok, headless)
// ---------------------------------------------------------------------------------------------
const DT = 1 / 60;
let havok;
before(async () => {
  const wasmBinary = await readFile(
    new URL(
      "../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm",
      import.meta.url,
    ),
  );
  havok = await HavokPhysics({ wasmBinary });
});

function world(tier) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  enableSeaPhysics(scene, new HavokPlugin(false, havok));
  let clock = 0;
  const boat = createBoatPhysics(scene, {
    islands: [],
    time: () => clock,
    tier,
  });
  return {
    boat,
    run(seconds, control, observe = () => {}) {
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i++) {
        Object.assign(boat.input, { steer: 0, throttle: 0 }, control(clock));
        scene._advancePhysicsEngineStep(1000 * DT + 0.001);
        clock += DT;
        observe(boat.state(), clock);
      }
    },
    dispose() {
      boat.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Top speed, time to 95 % of it, the steady turn rate and the ride height of a tier. */
function drive(tier, prepare = () => {}) {
  const w = world(tier);
  prepare(w);
  const speeds = [];
  const rates = [];
  let before;
  w.run(
    24,
    (t) => ({ throttle: 1, steer: t > 14 ? 1 : 0 }),
    (s, t) => {
      speeds.push([t, s.forwardSpeed]);
      if (before !== undefined && t > 18) {
        let d = s.heading - before;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        rates.push(d / DT);
      }
      before = s.heading;
    },
  );
  w.dispose();
  const top = mean(speeds.filter(([t]) => t > 11 && t < 14).map(([, v]) => v));
  const t95 = speeds.find(([, v]) => v >= 0.95 * top)[0];
  return { top, t95, turn: mean(rates) };
}

test("every tier reaches the same top speed, in the same time, and turns at the same rate", () => {
  const first = drive(0);
  assert.ok(
    first.top > 10.5 * SPEED_SCALE && first.top < 14 * SPEED_SCALE,
    `${first.top}`,
  );
  assert.ok(first.turn > 0.45 && first.turn < 0.65, `${first.turn}`);
  const lines = [
    `tier 0: top ${first.top.toFixed(3)} m/s, 95 % in ${first.t95.toFixed(2)} s, turn ${first.turn.toFixed(3)} rad/s`,
  ];
  for (const tier of [1, 2, 3]) {
    const got = drive(tier);
    lines.push(
      `tier ${tier}: top ${got.top.toFixed(3)} m/s, 95 % in ${got.t95.toFixed(2)} s, turn ${got.turn.toFixed(3)} rad/s`,
    );
    assert.ok(
      near(got.top, first.top, first.top * 0.01),
      `top speed ${got.top} against ${first.top}`,
    );
    assert.ok(
      near(got.t95, first.t95, 0.15),
      `time to speed ${got.t95} against ${first.t95}`,
    );
    assert.ok(
      near(got.turn, first.turn, first.turn * 0.03),
      `turn rate ${got.turn} against ${first.turn}`,
    );
  }
  console.log(lines.join("\n"));
});

test("every tier floats at the same waterline and does not roll or pitch more than the first boat", () => {
  const heights = [];
  const swings = [];
  for (const tier of [0, 1, 2, 3]) {
    const w = world(tier);
    const ys = [];
    let roll = 0;
    let pitch = 0;
    w.run(
      25,
      () => ({}),
      (s, t) => {
        if (t > 8) {
          ys.push(s.y);
          roll = Math.max(roll, Math.abs(s.roll));
          pitch = Math.max(pitch, Math.abs(s.pitch));
        }
      },
    );
    w.dispose();
    heights.push(mean(ys));
    swings.push({ roll, pitch });
  }
  for (let i = 1; i < 4; i++) {
    assert.ok(near(heights[i], heights[0], 0.02), `ride height ${heights}`);
    assert.ok(
      swings[i].roll < swings[0].roll * 1.1 + 0.02,
      `roll ${swings.map((s) => s.roll)}`,
    );
    assert.ok(
      swings[i].pitch < swings[0].pitch * 1.1 + 0.02,
      `pitch ${swings.map((s) => s.pitch)}`,
    );
  }
});

test("changing the tier of a live body keeps its place and its speed, and the same boat comes out either way", () => {
  const w = world(0);
  w.run(10, () => ({ throttle: 1, steer: 0.3 }));
  const before = w.boat.state();
  assert.equal(w.boat.tier, 0);
  w.boat.setTier(3);
  assert.equal(w.boat.tier, 3);
  const after = w.boat.state();
  for (const key of ["x", "y", "z", "heading", "forwardSpeed", "sideSpeed"])
    assert.ok(near(after[key], before[key], 1e-6), `${key} jumps`);
  // the box really is the big one: the same push turns it as the bigger boat would
  w.run(12, () => ({ throttle: 1 }));
  const speed = w.boat.state().forwardSpeed;
  w.boat.setTier(99); // an invalid tier is the first boat
  assert.equal(w.boat.tier, 0);
  w.boat.setTier(0);
  w.run(2, () => ({ throttle: 1 }));
  w.dispose();
  const alone = drive(3);
  assert.ok(
    near(speed, alone.top, alone.top * 0.02),
    `${speed} against ${alone.top}`,
  );
});

test("a wide box does not change the feel: the flagship turns and leans as the hull alone would, and a refit away from it gives the inertia back", () => {
  const top = drive(3);
  const first = drive(0);
  assert.ok(
    near(top.turn, first.turn, first.turn * 0.03),
    `${top.turn} against ${first.turn}`,
  );
  // 3 -> 1 on a live body: the override of the inertia is lifted, tier 1 behaves as a tier 1 built so
  const refit = drive(3, (w) => w.boat.setTier(1));
  const built = drive(1);
  assert.ok(near(refit.turn, built.turn, built.turn * 0.01), "turn");
  assert.ok(near(refit.top, built.top, built.top * 0.01), "speed");
  // and 0 -> 3 on a live body gives the flagship's
  const grown = drive(0, (w) => w.boat.setTier(3));
  assert.ok(near(grown.turn, top.turn, top.turn * 0.01), "grown turn");
});

test("a bigger hull stirs more cells of the water grid per step: counted, and grown by the square of its length", () => {
  // ripple-sim.ts push: the cells from floor(x - reach) to floor(x + reach) each way, SIM_CELL = 1.
  const cells = (reach) => {
    let most = 0;
    for (let offset = 0; offset < 1; offset += 0.05) {
      const n = Math.floor(offset + reach) - Math.floor(offset - reach) + 1;
      most = Math.max(most, n * n);
    }
    return most;
  };
  const counts = BOAT_TIERS.map((t) => cells(t.wake.reach));
  console.log(`cells visited per hull per grid step: ${counts.join(" / ")}`);
  assert.equal(counts[0], 361, "the first boat visits 19 x 19 cells");
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1]);
  assert.ok(
    counts[3] < 2.3 * counts[0],
    `the biggest boat costs ${(counts[3] / counts[0]).toFixed(2)} times the first`,
  );
});

test("the chase camera is framed as it was for the first boat and a little farther for each bigger one", () => {
  assert.equal(cameraScale(0), 1);
  assert.equal(cameraScale(99), 1);
  const scales = BOAT_TIERS.map((t) => cameraScale(t.tier));
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] > scales[i - 1]);
  assert.ok(scales[3] > 1.2 && scales[3] < 1.3, `${scales}`);
});
