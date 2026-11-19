import assert from "node:assert/strict";
import test from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { addPropLevels, placeIslandProps } from "../src/ocean/island-models.ts";
import { createIsland } from "../src/ocean/island-visual.ts";
import { islandSeed } from "../src/ocean/shore.ts";
import { islands } from "../src/ocean/islands.ts";
import {
  batchDistances,
  levelAt,
  PropBatches,
} from "../src/ocean/prop-batches.ts";
import { propDistances } from "../src/ocean/prop-lod.ts";

test("a prop is put in the level its distance asks for, and none beyond its end", () => {
  const d = batchDistances(9, 100, 300, 800);
  assert.ok(d.full < d.mid && d.mid < d.far && d.far <= d.end);
  assert.equal(levelAt(50 * 50, d), 0);
  assert.equal(levelAt(200 * 200, d), 1);
  assert.equal(levelAt((d.far - 1) ** 2, d), 2);
  assert.equal(levelAt((d.end - 1) ** 2, d), 3);
  assert.equal(levelAt((d.end + 1) ** 2, d), -1);
  // The real palm: the impostor takes over where it covers about 0.01 rad, never before the mid copy ends.
  const real = propDistances(9);
  const palm = batchDistances(9, real.full, real.mid, real.end);
  assert.ok(palm.far > real.mid && palm.far <= real.end);
});

test("batched props are thin instances: fewer meshes, placed by distance and view", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const visual = createIsland(scene, {
    seed: islandSeed(1),
    radius: islands[1].radius,
  });
  visual.mesh.position.set(islands[1].x, 0, islands[1].z);
  const model = (name, height) => {
    const mesh = MeshBuilder.CreateSphere(
      name,
      { diameter: 1, segments: 12 },
      scene,
    );
    mesh.scaling.y = height;
    mesh.bakeCurrentTransformIntoVertices();
    mesh.bakeTransformIntoVertices(
      mesh
        .getWorldMatrix()
        .clone()
        .setTranslationFromFloats(0, height / 2, 0),
    );
    const count = mesh.getTotalVertices();
    mesh.setVerticesData(VertexBuffer.ColorKind, new Array(count * 4).fill(1));
    mesh.isVisible = false;
    addPropLevels(mesh);
    return mesh;
  };
  const models = {
    palms: [model("palm-1", 6), model("palm-2", 6), model("palm-3", 6)],
    rocks: [model("rock-1", 1), model("rock-2", 1), model("rock-3", 1)],
    bushes: [model("bush-1", 0.7), model("bush-2", 1), model("bush-3", 0.6)],
    hut: model("hut", 5),
  };
  const placed = placeIslandProps(visual, models, []);
  const total = placed.instances.length;
  const batches = new PropBatches();
  const taken = batches.add(placed);
  assert.ok(
    taken >= placed.palms + placed.bushes,
    `${taken} of ${total} batched`,
  );
  assert.equal(
    placed.instances.length,
    total - taken,
    "the rest stay instances",
  );
  assert.equal(placed.instances.length, placed.ends.length);

  const batchMeshes = () =>
    scene.meshes.filter((m) => /-batch-\d+-L\d$/.test(m.name));
  const drawnFrom = (eye) => {
    batches.update(eye, []);
    return batchMeshes()
      .filter((m) => m.isVisible)
      .reduce((n, m) => n + m.thinInstanceCount, 0);
  };
  const near = drawnFrom({ x: islands[1].x, y: 10, z: islands[1].z });
  assert.ok(
    near > taken * 0.4 && near <= taken,
    `${near} of ${taken} drawn at the island`,
  );
  assert.equal(
    drawnFrom({ x: islands[1].x + 6000, y: 10, z: islands[1].z }),
    0,
  );
  for (const m of batchMeshes())
    if (m.thinInstanceCount === 0)
      assert.equal(m.isVisible, false, "no draw of the plain mesh");
  // A plane that has every prop behind it draws none.
  const behind = [{ normal: { x: 0, y: 1, z: 0 }, d: -1e6 }];
  batches.update({ x: islands[1].x, y: 10, z: islands[1].z }, behind);
  assert.equal(batchMeshes().filter((m) => m.isVisible).length, 0);

  batches.dispose();
  scene.dispose();
  engine.dispose();
});
