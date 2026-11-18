import { test } from "node:test";
import assert from "node:assert/strict";
import { readGlb } from "./support/glb.mjs";
import {
  FADE_BAND,
  FOG_CUT,
  PROP_END_ANGLE,
  copyTriangles,
  fadeAmount,
  propDistances,
} from "../src/ocean/prop-lod.ts";

// The island props are drawn whole while big, as coarser copies as they get small, and they fade out
// by dithering before they are dropped (prop-lod.ts, island-models.ts, prop-fade.ts).

test("a prop's distances follow its size, come in order, and never pass the fog", () => {
  for (const size of [0.5, 1.5, 2.5, 6, 9, 20, 200]) {
    const d = propDistances(size);
    assert.ok(
      0 < d.full && d.full < d.mid && d.mid < d.end,
      `${size} m: ${JSON.stringify(d)}`,
    );
    assert.ok(d.end <= FOG_CUT + 1e-9, `${size} m ends at ${d.end}`);
    assert.ok(d.end <= size / PROP_END_ANGLE + 1e-9);
  }
  // Bigger props are drawn farther (up to the fog), and every kind reaches much farther than the old
  // fixed ranges (palm 260 m, hut 420, rock 180, bush 160).
  assert.ok(propDistances(9).end > propDistances(2.5).end);
  assert.ok(propDistances(9).end >= 1300, "a palm is drawn to the fog");
  assert.ok(propDistances(6).end >= 1000, "a hut is drawn to the fog");
  assert.ok(
    propDistances(2.5).end > 180 * 2,
    "a rock is drawn at least twice as far as before",
  );
  assert.ok(
    propDistances(2).end > 160 * 2,
    "a bush is drawn at least twice as far as before",
  );
});

test("the fade is whole until the last part of the range, then falls in a line to nothing", () => {
  const end = 1000;
  assert.equal(fadeAmount(0, end), 1);
  assert.equal(fadeAmount(end * (1 - FADE_BAND), end), 1);
  assert.equal(fadeAmount(end, end), 0);
  assert.equal(fadeAmount(end * 2, end), 0);
  const mid = fadeAmount(end * (1 - FADE_BAND / 2), end);
  assert.ok(Math.abs(mid - 0.5) < 1e-9, `${mid}`);
  let last = 1;
  for (let d = 0; d <= end; d += 10) {
    const a = fadeAmount(d, end);
    assert.ok(a <= last + 1e-12 && a >= 0 && a <= 1, `${d}: ${a}`);
    last = a;
  }
});

test("the coarser copies are a fraction of the model, with a floor", () => {
  assert.deepEqual(copyTriangles(1000), { mid: 450, far: 180 });
  assert.deepEqual(copyTriangles(100), { mid: 45, far: 40 });
  assert.deepEqual(copyTriangles(20), { mid: 40, far: 40 });
});

test("every real prop model gets two coarser copies and a hiding level, in order", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  await import("@babylonjs/core/Meshes/instancedMesh.js");
  const { meshFrom } = await import("../src/ocean/mesh-parts.ts");
  const { addPropLevels, propDistancesOf } = await import(
    "../src/ocean/island-models.ts"
  );
  const scene = new Scene(new NullEngine());
  try {
    for (const file of ["palm-1", "rock-1", "bush-2", "hut"]) {
      const { gltf, accessor } = readGlb(`public/models/${file}.glb`);
      const positions = [];
      const indices = [];
      for (const mesh of gltf.meshes)
        for (const p of mesh.primitives) {
          const base = positions.length / 3;
          positions.push(...accessor(p.attributes.POSITION).data);
          for (const i of accessor(p.indices).data) indices.push(base + i);
        }
      const colors = new Array((positions.length / 3) * 4).fill(1);
      const source = meshFrom(file, scene, positions, indices, colors);
      const whole = indices.length / 3;
      addPropLevels(source);
      const levels = source.getLODLevels();
      assert.equal(
        levels.length,
        3,
        `${file}: two copies and the hiding level`,
      );
      // Babylon keeps the levels with the farthest first.
      const sorted = [...levels].sort(
        (a, b) => a.distanceOrScreenCoverage - b.distanceOrScreenCoverage,
      );
      assert.equal(sorted[2].mesh, null, `${file}: the last level hides it`);
      const mid = sorted[0].mesh;
      const far = sorted[1].mesh;
      const target = copyTriangles(whole);
      assert.ok(
        mid.getTotalIndices() / 3 <= target.mid,
        `${file} mid ${mid.getTotalIndices() / 3} of ${whole}`,
      );
      assert.ok(
        far.getTotalIndices() / 3 <= target.far,
        `${file} far ${far.getTotalIndices() / 3}`,
      );
      assert.ok(
        far.getTotalIndices() < mid.getTotalIndices() &&
          mid.getTotalIndices() < indices.length,
      );
      const d = propDistancesOf(source);
      assert.equal(sorted[0].distanceOrScreenCoverage, d.full);
      assert.equal(sorted[1].distanceOrScreenCoverage, d.mid);
      assert.ok(
        sorted[2].distanceOrScreenCoverage > d.end,
        "it is hidden only after the fade has finished",
      );
      assert.equal(
        source.getTotalIndices(),
        indices.length,
        `${file}: the whole model is unchanged`,
      );
    }
  } finally {
    scene.dispose();
  }
});
