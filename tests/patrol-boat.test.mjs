import { test } from "node:test";
import assert from "node:assert/strict";
import { readGlb } from "./support/glb.mjs";
import {
  BOAT_TIERS,
  PATROL_BOX,
  PATROL_FILE,
  PATROL_HULL_TIER,
  PATROL_MODEL,
  boatTierIndex,
} from "../src/ocean/boat-tier.ts";
import { BOAT_PARTS, BOAT_ROLES, paintBoat } from "../src/ocean/boat-paint.ts";
import { PATROL_PALETTE, boatPalettes } from "../src/ocean/palette.ts";

// The patrol ship's model (tools/blender/patrol_boat.py -> public/models/boat-patrol.glb) is a boat of
// the game's family: the same six parts under `boat`, painted with vertex colours, the two colour roles
// kept exact so the patrol palette can repaint it, and within the triangle guide of the biggest boats.
const { gltf, accessor } = readGlb(`public/models/${PATROL_FILE}`);
const node = (name) => gltf.nodes.find((n) => n.name === name);

test("the patrol model has the six parts under `boat`, each one mesh with baked colours", () => {
  const root = node("boat");
  assert.ok(root, "root node boat");
  assert.deepEqual(
    [...BOAT_PARTS].sort(),
    gltf.nodes
      .map((n) => n.name)
      .filter((n) => n !== "boat")
      .sort(),
    "exactly the parts the game paints",
  );
  for (const name of BOAT_PARTS) {
    const part = node(name);
    assert.ok(part?.mesh !== undefined, `${name} is a mesh`);
    for (const p of gltf.meshes[part.mesh].primitives)
      assert.ok(p.attributes.COLOR_0 !== undefined, `${name}: COLOR_0`);
  }
});

test("it fits the family: a hull between the flagship's and the trawler's length, and no more than the biggest boats' triangles", () => {
  let triangles = 0;
  for (const name of BOAT_PARTS)
    for (const p of gltf.meshes[node(name).mesh].primitives)
      triangles += gltf.accessors[p.indices].count / 3;
  const biggest = Math.max(...BOAT_TIERS.map((t) => t.triangles));
  assert.ok(triangles > 4000, `${triangles} triangles is a real boat`);
  assert.ok(
    triangles <= biggest,
    `${triangles} triangles, the flagship has ${biggest}`,
  );
  // The hull's length (the game's axes: the bow is at -z) matches the numbers it borrows.
  const pos = gltf.meshes[node("hull").mesh].primitives.flatMap((p) => {
    const a = accessor(p.attributes.POSITION);
    const t = node("hull").translation ?? [0, 0, 0];
    return Array.from({ length: a.count }, (_, i) => a.data[i * 3 + 2] + t[2]);
  });
  const length = Math.max(...pos) - Math.min(...pos);
  const borrowed = BOAT_TIERS[PATROL_HULL_TIER].hullLength;
  assert.ok(
    Math.abs(length - 10.4) < 0.25 && Math.abs(length - borrowed) < 1,
    `hull ${length.toFixed(2)} m long, built 10.4 m, borrowing the ${borrowed} m numbers of tier ${PATROL_HULL_TIER}`,
  );
});

test("the collision box is the hull's: its length, and a beam inside the model's (the fenders hang outside the box)", () => {
  const xs = [];
  const zs = [];
  const hull = node("hull");
  const t = hull.translation ?? [0, 0, 0];
  for (const p of gltf.meshes[hull.mesh].primitives) {
    const a = accessor(p.attributes.POSITION);
    for (let i = 0; i < a.count; i++) {
      xs.push(a.data[i * 3] + t[0]);
      zs.push(a.data[i * 3 + 2] + t[2]);
    }
  }
  const beam = Math.max(...xs) - Math.min(...xs);
  const length = Math.max(...zs) - Math.min(...zs);
  assert.ok(
    Math.abs(length - PATROL_BOX.length) < 0.3,
    `box ${PATROL_BOX.length} m long, hull ${length.toFixed(2)} m`,
  );
  assert.ok(
    PATROL_BOX.width < beam && PATROL_BOX.width > beam - 0.6,
    `box ${PATROL_BOX.width} m wide, model ${beam.toFixed(2)} m with its fenders`,
  );
});

test("the role colours are exact: palette 0 changes nothing, the patrol palette repaints hull and trim, the flag keeps its colours", () => {
  const colours = (name) =>
    gltf.meshes[node(name).mesh].primitives.flatMap((p) =>
      Array.from(accessor(p.attributes.COLOR_0).data),
    );
  const all = BOAT_PARTS.flatMap(colours);
  assert.deepEqual(
    Array.from(paintBoat(all, boatPalettes[0])),
    Array.from(Float32Array.from(all)),
    "palette 0 is the colours of the file",
  );
  const palette = boatPalettes[PATROL_PALETTE];
  const painted = paintBoat(all, palette);
  let changed = 0;
  for (let i = 0; i < all.length; i += 4)
    if ([0, 1, 2].some((k) => Math.abs(painted[i + k] - all[i + k]) > 1e-6))
      changed++;
  // The hull's paint and the trim bands are many vertices; nothing else is repainted.
  assert.ok(changed > 500, `${changed} vertices take the patrol colours`);
  const flag = colours("flag");
  assert.deepEqual(
    Array.from(paintBoat(flag, palette)),
    Array.from(Float32Array.from(flag)),
    "the flag keeps the flag's colours",
  );
  assert.notEqual(palette.hull, BOAT_ROLES.hull);
  assert.notEqual(palette.trim, BOAT_ROLES.trim);
});

test("the patrol model is not a shop tier: nothing a player owns or the network sends can reach it", () => {
  assert.equal(PATROL_MODEL, 4);
  assert.equal(
    boatTierIndex(PATROL_MODEL),
    0,
    "a tier 4 from outside is the first boat",
  );
  assert.equal(BOAT_TIERS.length, 4);
});
