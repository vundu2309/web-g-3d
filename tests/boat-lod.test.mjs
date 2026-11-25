import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { readGlb } from "./support/glb.mjs";
import { BOAT_TIERS, boatTier } from "../src/ocean/boat-tier.ts";
import {
  BOAT_DRAWS,
  BOAT_FULL_ANGLE,
  BOAT_LEVEL_BAND,
  BOAT_LOD_TRIANGLES,
  BOAT_MID_ANGLE,
  LAMP_FAR_TRIANGLES,
  boatDraws,
  boatLevelOf,
  boatLevels,
  boatTrianglesAt,
} from "../src/ocean/boat-lod.ts";
import { BOAT_PARTS } from "../src/ocean/boat-paint.ts";
import { RodVisual } from "../src/ocean/rod-visual.ts";
import { rodTriangles } from "../src/ocean/rod-plan.ts";
import { simplifyPart } from "../src/ocean/simplify.ts";

const read = (name) =>
  readFile(new URL(`../src/ocean/${name}`, import.meta.url), "utf8");

// The limit of each boat, pinned: the measured triangles of the export (boat-tier.ts) with 2 %
// to spare for a deliberate refinement. The old limit, "the player's boat with its rod under about
// 6,000", is exceeded on purpose by the two biggest boats (the user wants each tier to look like a
// better boat); a bigger model needs a new measurement and a recorded reason, not a higher number.
const MODEL_LIMIT = [3800, 5560, 5880, 8160];
// What the rod adds (the blank and its guides, and the reel).
const ROD_LIMIT = 950;

/** The whole boat of a tier as one Part (the six parts of the file, their pivots added). */
function partOf(tier) {
  const { gltf, accessor } = readGlb(`public/models/${BOAT_TIERS[tier].file}`);
  const part = { positions: [], normals: undefined, colors: [], indices: [] };
  for (const name of BOAT_PARTS) {
    const node = gltf.nodes.find((n) => n.name === name);
    const t = node.translation ?? [0, 0, 0];
    for (const p of gltf.meshes[node.mesh].primitives) {
      const pos = accessor(p.attributes.POSITION);
      const col = accessor(p.attributes.COLOR_0);
      const idx = accessor(p.indices);
      const base = part.positions.length / 3;
      for (let i = 0; i < pos.count; i++) {
        part.positions.push(
          pos.data[i * 3] + t[0],
          pos.data[i * 3 + 1] + t[1],
          pos.data[i * 3 + 2] + t[2],
        );
        part.colors.push(
          col.data[i * col.comps],
          col.data[i * col.comps + 1],
          col.data[i * col.comps + 2],
          1,
        );
      }
      for (const index of idx.data) part.indices.push(base + index);
    }
  }
  return part;
}

test("each boat has its own triangle limit, pinned, and the rod costs about 850", () => {
  const scene = new Scene(new NullEngine());
  const node = new TransformNode("boat", scene);
  new RodVisual(scene, node);
  const rod = scene.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0);
  scene.dispose();
  assert.ok(rod > 700 && rod <= ROD_LIMIT, `rod ${rod} triangles`);
  assert.ok(rod >= rodTriangles(), "the blank is part of it");
  const lines = [];
  for (const spec of BOAT_TIERS) {
    const whole = partOf(spec.tier).indices.length / 3;
    assert.equal(
      whole,
      spec.triangles,
      `tier ${spec.tier}: the table is the file`,
    );
    assert.ok(whole <= MODEL_LIMIT[spec.tier], `${whole} over its limit`);
    assert.ok(
      whole > MODEL_LIMIT[spec.tier] * 0.97,
      "limit is tight (a lost part is noticed)",
    );
    lines.push(`tier ${spec.tier}: ${whole} + rod ${rod} = ${whole + rod}`);
  }
  console.log(lines.join("\n"));
});

test("the level of a boat follows how big it looks, never skips a level and keeps itself at the edge", () => {
  for (const spec of BOAT_TIERS) {
    const near = (a) => spec.hullLength / a;
    // exactly at the thresholds
    assert.equal(boatLevelOf(spec.tier, near(BOAT_FULL_ANGLE) - 0.01), 0);
    assert.equal(boatLevelOf(spec.tier, near(BOAT_FULL_ANGLE) + 0.01), 1);
    assert.equal(boatLevelOf(spec.tier, near(BOAT_MID_ANGLE) - 0.01), 1);
    assert.equal(boatLevelOf(spec.tier, near(BOAT_MID_ANGLE) + 0.01), 2);
    assert.equal(boatLevelOf(spec.tier, 0), 0, "alongside: whole");
    assert.equal(
      boatLevelOf(spec.tier, 5000),
      2,
      "at the horizon: far, but drawn",
    );
    let last = 0;
    for (let d = 1; d < 3000; d *= 1.05) {
      const level = boatLevelOf(spec.tier, d);
      assert.ok(
        level >= last && level - last <= 1,
        `tier ${spec.tier} at ${d}`,
      );
      last = level;
    }
  }
  // A bigger boat keeps its whole model out to a greater distance.
  assert.ok(
    boatLevelOf(3, 200) === 0 && boatLevelOf(0, 200) === 1,
    "10.8 m at 200 m is whole, 7.4 m is not",
  );
  // The band: a boat at the edge does not flicker between two levels.
  const edge = boatTier(0).hullLength / BOAT_FULL_ANGLE;
  assert.equal(boatLevelOf(0, edge * 1.05), 1);
  assert.equal(
    boatLevelOf(0, edge * 1.05, 0),
    0,
    "a whole boat stays whole just past the edge",
  );
  assert.equal(
    boatLevelOf(0, (edge / (1 - BOAT_LEVEL_BAND)) * 1.02, 0),
    1,
    "but not far past it",
  );
  assert.equal(
    boatLevelOf(0, edge * 0.95, 1),
    1,
    "a middle boat stays middle just inside it",
  );
  assert.equal(boatLevelOf(0, edge * 0.8, 1), 0, "but not far inside");
  assert.equal(boatLevelOf(0, edge * 0.95, 0), 0);
  const mid = boatTier(0).hullLength / BOAT_MID_ANGLE;
  assert.equal(boatLevelOf(0, mid * 1.05, 1), 1, "stays middle");
  assert.equal(boatLevelOf(0, mid * 0.95, 2), 2, "stays far");
  assert.equal(boatLevelOf(0, mid * 1.5, 1), 2);
});

test("the coarse copies are made from the model's own triangles and cost a fraction of them", () => {
  const lines = [];
  for (const spec of BOAT_TIERS) {
    const whole = partOf(spec.tier);
    const before = whole.indices.slice();
    const [a, b, c] = boatLevels(whole);
    const triangles = [a, b, c].map((p) => p.indices.length / 3);
    assert.equal(a, whole, "level 0 is the model itself");
    assert.deepEqual(whole.indices, before, "the model is not changed");
    assert.equal(triangles[0], spec.triangles);
    assert.ok(triangles[1] <= BOAT_LOD_TRIANGLES[1], `middle ${triangles[1]}`);
    assert.ok(triangles[2] <= BOAT_LOD_TRIANGLES[2], `far ${triangles[2]}`);
    assert.ok(
      triangles[1] > triangles[2] && triangles[2] > 30,
      "three distinct, none empty",
    );
    // a far boat costs a fraction of its model: under 9 % even for the lightest (tier 0: 300 of 3,721), 4 % for the biggest
    assert.ok(
      triangles[2] / triangles[0] < 0.09,
      `far ${triangles[2] / triangles[0]}`,
    );
    assert.ok(triangles[1] / triangles[0] < 0.41);
    assert.ok(
      boatTrianglesAt(spec.tier, 1) <= 1500 &&
        boatTrianglesAt(spec.tier, 2) <= 300,
    );
    assert.equal(boatTrianglesAt(spec.tier, 0), spec.triangles);
    lines.push(
      `tier ${spec.tier}: whole ${triangles[0]}, middle ${triangles[1]}, far ${triangles[2]} (+ lantern 144 / ${LAMP_FAR_TRIANGLES})`,
    );
    // the colours stay inside the model's own range (averaged, never invented)
    for (const v of c.colors) assert.ok(v >= 0 && v <= 1 + 1e-9);
  }
  console.log(lines.join("\n"));
  assert.equal(
    simplifyPart(partOf(0), 100000).indices.length / 3,
    3721,
    "a model under the target is returned as it is",
  );
});

test("draw calls: a boat is a hull and a lantern, plus the rod unless it is far", () => {
  assert.deepEqual(BOAT_DRAWS, { hull: 1, lamp: 1, rod: 2 });
  assert.equal(boatDraws(0), 4);
  assert.equal(boatDraws(1), 4);
  assert.equal(boatDraws(2), 2, "no rod far away");
});

test("the scene draws the other players' boats by level, loads a tier only when a boat of it exists, and has a switch", async () => {
  const scene = await read("babylon-scene.ts");
  assert.ok(
    scene.includes("boatLevelOf(") && scene.includes("this.pickLevel(craft)"),
  );
  assert.ok(
    /private readonly boatModels = new Map/.test(scene) &&
      scene.includes("ensureBoatModels(this.modelKey(craft))") &&
      scene.includes("ensureBoatModels(this.tier)"),
    "one template per tier, made on first need",
  );
  assert.ok(
    !/ensureBoatModels\([123]\)/.test(scene),
    "no tier but the first is loaded at start",
  );
  assert.ok(
    scene.includes('"tiers") === "0"'),
    "?tiers=0 draws every boat as the first",
  );
  const model = await read("boat-model.ts");
  assert.ok(
    model.includes("levels = false"),
    "the player's boat has no coarse copies",
  );
  assert.ok(model.includes("createInstance"), "boats are instances");
});
