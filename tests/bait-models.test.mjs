import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readGlb } from "./support/glb.mjs";
import { parseFishGlb } from "../src/ocean/glb-parts.ts";
import { PAL } from "../src/ocean/art/colors.ts";

// The four baits of the market (public/models/bait-<id>.glb, made by tools/blender/baits.py): the
// same layout as the fish files, so the plain-TS parser, the card pictures (creature-thumb.ts) and
// the 3D scene read them without a new reader. The real files are read.
const BAITS = {
  giun: 560,
  tom: 600,
  "ca-con": 558,
  muc: 590,
};

const file = (id) => `public/models/bait-${id}.glb`;
const template = (id) =>
  parseFishGlb(readFileSync(new URL(`../${file(id)}`, import.meta.url)));

/** Every colour of the palette, as an `r,g,b` byte string. */
function paletteColours() {
  const out = new Set();
  const walk = (value) => {
    if (typeof value === "number")
      out.add(`${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`);
    else if (value && typeof value === "object")
      for (const inner of Object.values(value)) walk(inner);
  };
  walk(PAL);
  return out;
}

test("each bait is a root with a `body` mesh and a `hook`, one file per bait", () => {
  for (const id of Object.keys(BAITS)) {
    const { gltf } = readGlb(file(id));
    assert.deepEqual(
      gltf.nodes.map((n) => n.name).sort(),
      ["bait", "body", "hook"],
      id,
    );
    assert.equal(gltf.meshes.length, 1, `${id}: one mesh`);
  }
});

test("the triangle counts are the approved models', and small enough to be drawn many times in a card row", () => {
  for (const [id, triangles] of Object.entries(BAITS)) {
    const t = template(id);
    assert.equal(t.main.indices.length / 3, triangles, id);
    assert.ok(triangles < 700, `${id}: ${triangles}`);
    assert.equal(t.tail, undefined, `${id}: no separate tail`);
  }
});

test("each bait is centred, its longest side is 1 and its nose points to +X where the hook is", () => {
  for (const id of Object.keys(BAITS)) {
    const t = template(id);
    assert.ok(Math.abs(t.size - 1) < 1e-3, `${id}: size ${t.size}`);
    assert.ok(
      Math.abs(t.min[0] + t.max[0]) < 1e-3 &&
        Math.abs(t.min[1] + t.max[1]) < 0.02 &&
        Math.abs(t.min[2] + t.max[2]) < 0.02,
      `${id}: centred`,
    );
    assert.ok(Math.abs(t.hook[0] - t.max[0]) < 1e-3, `${id}: hook at the nose`);
    assert.ok(Math.abs(t.hook[1]) < 1e-3 && Math.abs(t.hook[2]) < 1e-3);
  }
});

test("every vertex colour is a palette colour, and the model has several (not one flat colour)", () => {
  const allowed = paletteColours();
  for (const id of Object.keys(BAITS)) {
    const { colors } = template(id).main;
    const seen = new Set();
    for (let i = 0; i < colors.length; i += 4)
      seen.add([0, 1, 2].map((k) => Math.round(colors[i + k] * 255)).join(","));
    for (const colour of seen)
      assert.ok(allowed.has(colour), `${id}: ${colour} is not in the palette`);
    assert.ok(seen.size >= 4, `${id}: ${seen.size} colours`);
  }
});

test("normals are unit length and no triangle is degenerate", () => {
  for (const id of Object.keys(BAITS)) {
    const { positions, normals, indices } = template(id).main;
    for (let i = 0; i < normals.length; i += 3)
      assert.ok(
        Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) <
          0.02,
        `${id}: normal ${i / 3}`,
      );
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => indices[i + k] * 3);
      const e1 = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]);
      const e2 = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
      const area = Math.hypot(
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      );
      assert.ok(area > 1e-9, `${id}: triangle ${i / 3} has no area`);
    }
  }
});
