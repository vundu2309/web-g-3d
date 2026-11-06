import { test } from "node:test";
import assert from "node:assert/strict";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CREATURE_KINDS, buildCreature } from "../src/ocean/creatures.ts";
import { bounds, triangleCount } from "../src/ocean/creature-geometry.ts";

const make = (kind) => buildCreature(kind, "#e0654f", "#ffd35a");
const parts = (c) => [c.main, ...(c.tail ? [c.tail.part] : [])];

test("every sea animal builds valid, finite geometry within a phone-sized triangle budget", () => {
  assert.ok(CREATURE_KINDS.length >= 16);
  for (const kind of CREATURE_KINDS) {
    const creature = make(kind);
    let total = 0;
    for (const part of parts(creature)) {
      assert.ok(
        part.positions.length > 0 && part.positions.length % 3 === 0,
        kind,
      );
      assert.ok(
        part.positions.every(Number.isFinite),
        `${kind} positions are finite`,
      );
      assert.equal(
        part.colors.length,
        (part.positions.length / 3) * 4,
        `${kind} colours`,
      );
      assert.ok(
        part.colors.every((v) => v >= 0 && v <= 1),
        `${kind} colours in range`,
      );
      assert.equal(part.indices.length % 3, 0, kind);
      const vertices = part.positions.length / 3;
      assert.ok(
        part.indices.every(
          (i) => Number.isInteger(i) && i >= 0 && i < vertices,
        ),
        `${kind} indices`,
      );
      total += triangleCount(part);
    }
    assert.ok(total > 100, `${kind} has some shape (${total})`);
    assert.ok(total < 6000, `${kind} stays light (${total} triangles)`);
  }
});

test("animals are about one unit long, face +X, and carry the hook at the head", () => {
  for (const kind of CREATURE_KINDS) {
    const creature = make(kind);
    const all = parts(creature).map(bounds);
    const min = [0, 1, 2].map((k) => Math.min(...all.map((b) => b.min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...all.map((b) => b.max[k])));
    const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    assert.ok(
      extent > 0.7 && extent < 1.45,
      `${kind} extent ${extent.toFixed(2)}`,
    );
    const [hx, hy, hz] = creature.hook;
    assert.ok(hx >= min[0] - 0.05 && hx <= max[0] + 0.05, `${kind} hook x`);
    assert.ok(hy >= min[1] - 0.05 && hy <= max[1] + 0.05, `${kind} hook y`);
    assert.ok(hz >= min[2] - 0.05 && hz <= max[2] + 0.05, `${kind} hook z`);
    if (creature.tail) {
      // The tail hangs off the back end and the hook is at the front.
      assert.ok(
        creature.tail.pivot[0] < hx - 0.3,
        `${kind} tail behind the head`,
      );
      assert.ok(
        bounds(creature.tail.part).min[0] <= creature.tail.pivot[0] + 1e-6,
      );
    }
  }
});

test("closed bodies face outward, so lighting and the colour of their skin are right", () => {
  // Outward means the normal Babylon computes points away from the middle of the body.
  // Fins and thin parts are flat and count either way, so the bar is a clear majority; a
  // body wound inside out would score well under half.
  const bodies = CREATURE_KINDS;
  for (const kind of bodies) {
    const { main } = make(kind);
    const normals = [];
    VertexData.ComputeNormals(main.positions, main.indices, normals);
    const b = bounds(main);
    const centre = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2);
    let out = 0;
    let counted = 0;
    for (let i = 0; i < main.positions.length; i += 3) {
      const d = [0, 1, 2].map((k) => main.positions[i + k] - centre[k]);
      const length = Math.hypot(...d);
      if (length < 0.05) continue;
      const dot =
        (d[0] * normals[i] + d[1] * normals[i + 1] + d[2] * normals[i + 2]) /
        length;
      counted++;
      if (dot > 0) out++;
    }
    assert.ok(
      out / counted > 0.5,
      `${kind}: ${Math.round((100 * out) / counted)}% of vertices face outward`,
    );
  }
});

test("the two species colours really paint the animal, and a different species looks different", () => {
  const a = buildCreature("round", "#ff0000", "#00ff00");
  const b = buildCreature("round", "#0000ff", "#00ff00");
  assert.equal(a.main.positions.length, b.main.positions.length, "same shape");
  assert.notDeepEqual(a.main.colors, b.main.colors, "different body colour");
  const redDominant = a.main.colors.filter(
    (_, i) => i % 4 === 0 && a.main.colors[i] > 0.9,
  ).length;
  assert.ok(redDominant > 20, "the body takes the body colour");
  assert.notEqual(
    JSON.stringify(make("slim").main.positions),
    JSON.stringify(make("chunky").main.positions),
    "different body plans",
  );
});
