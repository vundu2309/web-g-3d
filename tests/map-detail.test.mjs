import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  COAST_MAX,
  COAST_MIN,
  createIsland,
  islandShape,
} from "../src/ocean/island-visual.ts";
import { Geo } from "../src/ocean/geo.ts";
import {
  BACKDROP,
  BUOYS,
  GULLS,
  clearOfIslands,
  gullPose,
} from "../src/ocean/sea-layout.ts";
import {
  SEA_BOUND,
  islandCollisionRadius,
  islands,
} from "../src/ocean/model.ts";

// Headless (no canvas): the islands are built by the same code the game runs, so the
// detail and the triangle budget can be checked without a GPU.
const build = (options) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const island = createIsland(scene, options);
  const result = {
    triangles: island.triangles,
    props: island.props,
    meshes: scene.meshes.length,
  };
  scene.dispose();
  engine.dispose();
  return result;
};
const optionsFor = (index) => ({
  seed: 11 + index * 7,
  radius: islands[index].radius,
  lighthouse: index === 0,
});

test("each island carries its small details inside a phone-sized triangle budget", () => {
  for (let i = 0; i < islands.length; i++) {
    const { triangles, props } = build(optionsFor(i));
    // Detail on top of the terrain, palms and rocks, and still modest for a phone.
    assert.ok(
      triangles > 9000,
      `island ${i}: ${triangles} triangles is too bare`,
    );
    assert.ok(
      triangles < 26000,
      `island ${i}: ${triangles} triangles is too many`,
    );
    assert.ok(props.grass > 150, `grass ${props.grass}`);
    assert.ok(props.flowers > 20, `flowers ${props.flowers}`);
    assert.ok(props.bushes > 10, `bushes ${props.bushes}`);
    assert.ok(props.trees >= 3, `trees ${props.trees}`);
    assert.ok(props.shells > 10, `shells ${props.shells}`);
    assert.ok(props.boulders > 6, `boulders ${props.boulders}`);
    assert.ok(props.boardwalk, `island ${i} has a boardwalk`);
  }
  // One mesh per island, however much is on it.
  assert.equal(build(optionsFor(0)).meshes >= 1, true);
});

test("an island is the same for everyone: same seed, same triangles and props", () => {
  const a = build(optionsFor(1));
  const b = build(optionsFor(1));
  assert.equal(a.triangles, b.triangles);
  assert.deepEqual(a.props, b.props);
  const other = build({ ...optionsFor(1), seed: 999 });
  assert.notEqual(other.triangles, a.triangles);
});

test("a backdrop island is cheap and has no clutter", () => {
  const far = build({ seed: 101, radius: 48, distant: true });
  assert.ok(far.triangles < 6500, `${far.triangles}`);
  assert.equal(far.props.grass, 0);
  assert.equal(far.props.boardwalk, false);
});

test("the geometry buffer builds valid shapes", () => {
  const geo = new Geo();
  geo.box(0, 0, 0, 1, 1, 1, [1, 0, 0], 0.5);
  geo.cone(0, 0, 0, 1, 1, 6, [0, 1, 0], 0, 0.4);
  geo.blade(0, 0, 0, 1, 0.1, 0.3, 0.2, [0, 0, 1]);
  assert.equal(geo.triangles, 12 + 6 * 2 + 4 + 1);
  assert.equal(geo.colors.length / 4, geo.positions.length / 3);
  assert.ok(geo.positions.every(Number.isFinite));
  assert.ok(geo.indices.every((i) => i >= 0 && i < geo.positions.length / 3));
});

test("buoys are clear of every island and of the harbor, gulls stay up, backdrop islands are out of reach", () => {
  for (const buoy of BUOYS)
    assert.ok(clearOfIslands(buoy.x, buoy.z), `buoy at ${buoy.x},${buoy.z}`);
  for (const gull of GULLS)
    for (let t = 0; t < 120; t += 0.5) {
      const pose = gullPose(gull, t);
      assert.ok(
        Number.isFinite(pose.x + pose.y + pose.z + pose.heading + pose.bank),
      );
      assert.ok(pose.y > 5 && pose.y < 30, `altitude ${pose.y}`);
    }
  // The flight is a smooth circle: it does not jump.
  for (const gull of GULLS) {
    const a = gullPose(gull, 10);
    const b = gullPose(gull, 10.05);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1, "no teleporting");
  }
  for (const far of BACKDROP)
    assert.ok(
      Math.max(Math.abs(far.x), Math.abs(far.z)) - far.radius > SEA_BOUND + 40,
      `backdrop at ${far.x},${far.z} is beyond the sea wall`,
    );
});

// The islands are low and green with a gentle ridge (the user found the old cones fake):
// these numbers pin that shape for every island in the sea.
test("islands are low with gentle slopes, and their coast stays inside the boats' ring", () => {
  const profiles = [];
  islands.forEach((island, i) => {
    const { seed, radius } = optionsFor(i);
    const shape = islandShape(seed, radius);
    let top = -Infinity;
    let steepest = 0;
    const profile = [];
    for (let x = -radius * 1.1; x <= radius * 1.1; x += 0.5)
      for (let z = -radius * 1.1; z <= radius * 1.1; z += 0.5) {
        const y = shape.height(x, z);
        top = Math.max(top, y);
        if (y > 0.2)
          steepest = Math.max(
            steepest,
            Math.hypot(
              shape.height(x + 0.5, z) - shape.height(x - 0.5, z),
              shape.height(x, z + 0.5) - shape.height(x, z - 0.5),
            ),
          );
      }
    for (let k = 0; k < 8; k++)
      profile.push(
        shape.height(Math.cos(k) * radius * 0.4, Math.sin(k) * radius * 0.4),
      );
    profiles.push(profile);
    // Low: a fifth of the radius, never the old 0.38 to 0.56 cone.
    assert.ok(top <= radius * 0.26, `island ${i} top ${top}`);
    assert.ok(
      top >= radius * 0.14,
      `island ${i} is not a flat pancake: ${top}`,
    );
    assert.ok(Math.abs(top - shape.peak) < 0.2, `peak ${shape.peak} vs ${top}`);
    // Gentle: no land steeper than about 32 degrees.
    assert.ok(steepest < 0.65, `island ${i} slope ${steepest}`);
    // The waterline: bays and headlands, all inside the ring boats collide with.
    let near = Infinity;
    let far = 0;
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2;
      let coast = 0;
      for (let r = 0; r < radius * 1.3; r += 0.05)
        if (shape.height(Math.cos(a) * r, Math.sin(a) * r) > 0) coast = r;
      assert.ok(
        Math.abs(coast - shape.coast(a)) < 0.1,
        `island ${i} coast at ${a}: ${coast} vs ${shape.coast(a)}`,
      );
      near = Math.min(near, coast);
      far = Math.max(far, coast);
    }
    assert.ok(near >= radius * (COAST_MIN - 0.01), `island ${i} near ${near}`);
    assert.ok(far <= radius * COAST_MAX, `island ${i} far ${far}`);
    assert.ok(far < islandCollisionRadius(island) - radius * 0.08);
    assert.ok(far - near > radius * 0.05, `island ${i} coast is not a circle`);
    // Same seed, same island.
    const again = islandShape(seed, radius);
    for (let k = 0; k < 20; k++)
      assert.equal(
        again.height(k * 1.7 - 15, k * 1.3 - 12),
        shape.height(k * 1.7 - 15, k * 1.3 - 12),
      );
  });
  // Each island has its own ridge.
  for (let a = 0; a < profiles.length; a++)
    for (let b = a + 1; b < profiles.length; b++)
      assert.ok(
        profiles[a].some(
          (y, k) =>
            Math.abs(
              y / optionsFor(a).radius - profiles[b][k] / optionsFor(b).radius,
            ) > 0.02,
        ),
        `islands ${a} and ${b} differ`,
      );
});

test("the lighthouse, hut, boardwalk and rowboat all find their place on the low islands", () => {
  for (let i = 0; i < islands.length; i++) {
    const { props } = build(optionsFor(i));
    assert.ok(props.boardwalk, `island ${i} boardwalk`);
    assert.ok(props.hut, `island ${i} hut`);
    assert.ok(props.boat, `island ${i} rowboat`);
    assert.ok(props.driftwood > 0, `island ${i} driftwood`);
  }
});
