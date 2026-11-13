import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import { createIsland } from "../src/ocean/island-visual.ts";
import {
  BUSH_RADIUS,
  HUT,
  ROCK_RADIUS,
  clearance,
  layoutIsland,
  lowestUnder,
  placeHut,
  placePalms,
  placeRocks,
  turn,
} from "../src/ocean/island-layout.ts";
import {
  gangwayKeepOut,
  placeIslandProps,
} from "../src/ocean/island-models.ts";
import { random } from "../src/ocean/island-shape.ts";
import { MARKETS } from "../src/ocean/market.ts";
import { islandSeed } from "../src/ocean/shore.ts";
import { islands } from "../src/ocean/model.ts";

// The island props made in Blender (tools/blender/props.py -> public/models): the game loads
// them without Blender, so a bad file would only show up in a player's browser. Then the pure
// placement maths (src/ocean/island-layout.ts) and the swap of the procedural fallback.

function readGlb(file) {
  const data = readFileSync(
    new URL(`../public/models/${file}`, import.meta.url),
  );
  assert.equal(data.toString("ascii", 0, 4), "glTF", `${file} is a GLB`);
  assert.equal(data.readUInt32LE(4), 2, "glTF 2.0");
  assert.equal(data.readUInt32LE(8), data.length, "declared length matches");
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
}

/** Triangles, bounds and primitives of the one mesh in a GLB (identity node). */
function measure(file) {
  const gltf = readGlb(file);
  assert.equal(gltf.meshes.length, 1, `${file}: one mesh`);
  const node = gltf.nodes.find((n) => n.mesh !== undefined);
  assert.ok(!node.rotation && !node.scale, `${file}: no node transform`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const primitive of gltf.meshes[0].primitives) {
    assert.ok(
      primitive.attributes.COLOR_0 !== undefined,
      `${file}: vertex colours`,
    );
    triangles += gltf.accessors[primitive.indices].count / 3;
    const pos = gltf.accessors[primitive.attributes.POSITION];
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], pos.min[i]);
      max[i] = Math.max(max[i], pos.max[i]);
    }
  }
  return { gltf, triangles, min, max };
}

const MODELS = {
  palm: { files: ["palm-1", "palm-2", "palm-3"], budget: 1100 },
  rock: { files: ["rock-1", "rock-2", "rock-3"], budget: 400 },
  bush: { files: ["bush-1", "bush-2", "bush-3"], budget: 500 },
  hut: { files: ["hut"], budget: 600 },
};

test("the ten island props are valid GLBs with vertex colours, within budget", () => {
  for (const [kind, { files, budget }] of Object.entries(MODELS))
    for (const name of files) {
      const { triangles, min, max } = measure(`${name}.glb`);
      assert.ok(
        triangles > budget / 4 && triangles <= budget,
        `${name}: ${triangles} triangles (budget ${budget})`,
      );
      if (kind === "palm") {
        assert.ok(max[1] > 5 && max[1] < 9, `${name} height ${max[1]}`);
        assert.ok(Math.abs(min[1]) < 0.05, `${name} trunk base at the origin`);
      }
      if (kind === "rock")
        assert.ok(max[1] - min[1] < 2.5, `${name} height ${max[1] - min[1]}`);
      if (kind === "bush") {
        assert.ok(max[1] > 0.5 && max[1] < 1.4, `${name} height ${max[1]}`);
        assert.ok(min[1] > -0.01 && min[1] < 0.25, `${name} base ${min[1]}`);
        const width = Math.max(max[0] - min[0], max[2] - min[2]);
        assert.ok(width > 0.9 && width < 2.1, `${name} width ${width}`);
      }
      if (kind === "hut") {
        // Above its ground level (the ladder's foot); the posts reach postDepth below it.
        assert.ok(max[1] > 3 && max[1] < 6, `hut height ${max[1]}`);
        assert.ok(Math.abs(min[1] + HUT.postDepth) < 0.02, `posts ${min[1]}`);
      }
    }
});

test("the rock footprints used for placement match the models", () => {
  ["rock-1", "rock-2", "rock-3"].forEach((name, i) => {
    const { min, max } = measure(`${name}.glb`);
    const half = Math.max(max[0] - min[0], max[2] - min[2]) / 2;
    assert.ok(
      Math.abs(half - ROCK_RADIUS[i]) / ROCK_RADIUS[i] < 0.25,
      `${name}: half width ${half} vs ${ROCK_RADIUS[i]}`,
    );
  });
});

test("the bush footprints used for placement match the models", () => {
  ["bush-1", "bush-2", "bush-3"].forEach((name, i) => {
    const { min, max } = measure(`${name}.glb`);
    const half = Math.max(max[0] - min[0], max[2] - min[2]) / 2;
    assert.ok(
      Math.abs(half - BUSH_RADIUS[i]) / BUSH_RADIUS[i] < 0.15,
      `${name}: half width ${half} vs ${BUSH_RADIUS[i]}`,
    );
  });
});

test("the hut's door is on the model's -Z side, the side yawFacing turns to the sea", () => {
  const { gltf } = measure("hut.glb");
  // The door is the dark wood colour of tools/blender/props.py (`0x4a3426`, "door (dark)").
  const door = gltf.meshes[0].primitives.find((p) =>
    gltf.materials[p.material].name.startsWith("c4a3426"),
  );
  assert.ok(door, "door primitive");
  const pos = gltf.accessors[door.attributes.POSITION];
  assert.ok(pos.max[2] < -1, `door at z ${pos.min[2]}..${pos.max[2]}`);
  const middle = (pos.min[0] + pos.max[0]) / 2;
  assert.ok(
    Math.abs(middle - HUT.ladder[0]) < 0.05,
    "the ladder is at the door",
  );
});

// The islands as the game builds them (headless), with their real keep-out areas.
const built = islands.map((island, index) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const visual = createIsland(scene, {
    seed: islandSeed(index),
    radius: island.radius,
    lighthouse: index === 0,
  });
  visual.mesh.position.set(island.x, 0, island.z);
  const keepOut = [...visual.keepOut, ...gangwayKeepOut(visual, MARKETS)];
  const input = {
    seed: visual.seed,
    radius: visual.radius,
    peak: visual.peak,
    height: visual.height,
    coast: visual.coast,
    keepOut,
  };
  const layout = layoutIsland(input);
  scene.dispose();
  engine.dispose();
  return { island, input, layout };
});

const slope = (h, x, z) =>
  Math.hypot(h(x + 0.6, z) - h(x - 0.6, z), h(x, z + 0.6) - h(x, z - 0.6)) /
  1.2;

test("every island keeps clear of its boardwalk, lighthouse, rowboat and market gangway", () => {
  for (const { input } of built) {
    // A boardwalk, a rowboat and a gangway on each island, the lighthouse on the first.
    assert.ok(input.keepOut.length >= 3, `${input.keepOut.length} keep-outs`);
  }
  const lone = {
    mesh: { position: { x: 0, z: 0 } },
    radius: 10,
    coast: () => 9,
  };
  assert.deepEqual(gangwayKeepOut(lone, [{ x: 500, z: 500 }]), []);
  assert.equal(gangwayKeepOut(lone, [{ x: 20, z: 0 }]).length, 1);
});

test("palms stand on dry, gentle ground off every structure, buried at the base", () => {
  for (const { island, input, layout } of built) {
    const { palms, hut } = layout;
    assert.ok(
      palms.length >= 8 && palms.length <= 16,
      `${palms.length} palms on radius ${island.radius}`,
    );
    for (const p of palms) {
      assert.ok(
        input.height(p.x, p.z) >= 0.7,
        `palm in the water at ${p.x},${p.z}`,
      );
      assert.ok(slope(input.height, p.x, p.z) <= 0.42, "palm on steep ground");
      for (const k of input.keepOut)
        assert.ok(clearance(k, p.x, p.z) >= 1.6, "palm on a structure");
      if (hut)
        assert.ok(
          Math.hypot(p.x - hut.x, p.z - hut.z) >= HUT.reach + 1.6,
          "palm in the hut",
        );
      assert.ok(
        p.y < lowestUnder(input.height, p.x, p.z, 0.4 * p.scale),
        "the trunk's base is below the lowest ground round it",
      );
      assert.ok(p.scale >= 0.8 && p.scale <= 1.25, `scale ${p.scale}`);
      assert.ok([0, 1, 2].includes(p.variant));
    }
    assert.ok(new Set(palms.map((p) => p.variant)).size > 1, "mixed variants");
  }
});

test("rocks sit in the ground on the beach, the slopes and the shallows, inside the boats' ring", () => {
  for (const { island, input, layout } of built) {
    const { rocks } = layout;
    assert.ok(rocks.length >= 10, `${rocks.length} rocks`);
    let beach = 0;
    let slopes = 0;
    let shallows = 0;
    for (const r of rocks) {
      const size = ROCK_RADIUS[r.variant] * r.scale;
      assert.ok(
        Math.hypot(r.x, r.z) + size <= island.radius * 1.08,
        "rock in the boats' way",
      );
      assert.ok(r.scale >= 0.6 && r.scale <= 2.2, `scale ${r.scale}`);
      assert.ok(r.y < input.height(r.x, r.z), "sunk into the ground");
      for (const k of input.keepOut)
        assert.ok(clearance(k, r.x, r.z) > 0, "rock on a structure");
      const inland = input.coast(Math.atan2(r.z, r.x)) - Math.hypot(r.x, r.z);
      if (inland < 0) shallows++;
      else if (inland < 5) beach++;
      else slopes++;
    }
    assert.ok(
      beach > 0 && slopes > 0 && shallows > 0,
      `${beach}/${slopes}/${shallows}`,
    );
  }
});

test("bushes sit in the grass and the sand's edge, clear of structures, palms, rocks and each other", () => {
  for (const { island, input, layout } of built) {
    const { bushes, palms, rocks } = layout;
    assert.ok(
      bushes.length >= 14 && bushes.length <= 26,
      `${bushes.length} bushes on radius ${island.radius}`,
    );
    assert.ok(new Set(bushes.map((b) => b.variant)).size > 1, "mixed variants");
    assert.ok(
      bushes.some((b) => b.scale < 1.15) && bushes.some((b) => b.scale > 1.3),
      "small and big bushes",
    );
    for (const b of bushes) {
      assert.ok(
        input.height(b.x, b.z) >= 0.6,
        `bush in the water ${b.x},${b.z}`,
      );
      assert.ok(slope(input.height, b.x, b.z) <= 0.5, "bush on steep ground");
      assert.ok(b.scale >= 0.8 && b.scale <= 1.6, `scale ${b.scale}`);
      assert.ok(
        Math.hypot(b.x, b.z) < island.radius,
        "bush inside the island's radius",
      );
      for (const k of input.keepOut)
        assert.ok(clearance(k, b.x, b.z) >= 1.2, "bush on a structure");
      if (layout.hut)
        assert.ok(
          Math.hypot(b.x - layout.hut.x, b.z - layout.hut.z) >= HUT.reach + 1.2,
          "bush in the hut",
        );
      for (const p of palms)
        assert.ok(Math.hypot(p.x - b.x, p.z - b.z) >= 1.5, "bush on a palm");
      for (const r of rocks)
        assert.ok(
          Math.hypot(r.x - b.x, r.z - b.z) >
            ROCK_RADIUS[r.variant] * r.scale * 0.8,
          "bush on a rock",
        );
      assert.ok(
        Math.abs(
          b.y -
            (lowestUnder(
              input.height,
              b.x,
              b.z,
              BUSH_RADIUS[b.variant] * b.scale * 0.6,
            ) -
              0.1 * b.scale),
        ) < 1e-9,
        "base sunk 0.1 x scale into the lowest ground",
      );
      assert.ok(b.y < input.height(b.x, b.z), "sunk into the ground");
    }
    for (let i = 0; i < bushes.length; i++)
      for (let j = i + 1; j < bushes.length; j++)
        assert.ok(
          Math.hypot(bushes[i].x - bushes[j].x, bushes[i].z - bushes[j].z) >=
            1 - 1e-9,
          "bushes about a metre apart at least",
        );
  }
});

test("the bushes use a stream of their own: palms and rocks come out as they do without them", () => {
  for (const { input, layout } of built) {
    const rng = random(input.seed ^ 0x2f6b);
    const hut = placeHut(input);
    const keepOut = [...input.keepOut];
    if (hut)
      keepOut.push({
        ax: hut.x,
        az: hut.z,
        bx: hut.x,
        bz: hut.z,
        r: HUT.reach,
      });
    const palms = placePalms(input, rng, keepOut);
    assert.deepEqual(layout.palms, palms);
    assert.deepEqual(layout.rocks, placeRocks(input, rng, keepOut, palms));
    assert.deepEqual(layout.hut, hut);
  }
});

test("the hut faces the sea, its posts reach the ground and its deck clears it", () => {
  for (const { input, layout } of built) {
    const { hut } = layout;
    assert.ok(hut, "every play island has its hut");
    // The model's -Z (the door) turned by yaw points away from the island's centre.
    const [fx, fz] = turn(0, -1, hut.yaw);
    const out = Math.hypot(hut.x, hut.z);
    assert.ok(
      (fx * hut.x + fz * hut.z) / out > 0.99,
      "the door looks out to sea",
    );
    const origin = hut.y + HUT.postDepth;
    for (const post of HUT.posts) {
      const [wx, wz] = turn(post[0], post[1], hut.yaw);
      const ground = input.height(hut.x + wx, hut.z + wz);
      assert.ok(hut.y < ground, "post reaches the ground");
      assert.ok(origin + HUT.deck > ground, "deck above the ground");
    }
    const [lx, lz] = turn(HUT.ladder[0], HUT.ladder[1], hut.yaw);
    const foot = input.height(hut.x + lx, hut.z + lz);
    assert.ok(origin <= foot + 1e-9, "the ladder stands on the ground");
    assert.ok(foot > 0.4, "the ladder is not in the water");
    for (const k of input.keepOut)
      assert.ok(clearance(k, hut.x, hut.z) >= HUT.reach, "hut on a structure");
  }
});

test("the layout is the same for everyone and differs between islands", () => {
  for (const { input, layout } of built)
    assert.deepEqual(layoutIsland(input), layout);
  assert.notDeepEqual(
    layoutIsland({ ...built[0].input, seed: 999 }).palms,
    built[0].layout.palms,
  );
  assert.notDeepEqual(
    layoutIsland({ ...built[0].input, seed: 999 }).bushes,
    built[0].layout.bushes,
  );
});

test("placing the models replaces the procedural props once, and goes with the island", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const visual = createIsland(scene, {
    seed: islandSeed(1),
    radius: islands[1].radius,
  });
  visual.mesh.position.set(islands[1].x, 0, islands[1].z);
  assert.ok(visual.fallback, "procedural props until the models load");
  const fallback = visual.fallback;
  // Stand-ins for the loaded models (a box with its base at the origin).
  const box = (name, height) => {
    const mesh = MeshBuilder.CreateBox(name, { size: 1, height }, scene);
    mesh.bakeTransformIntoVertices(
      mesh
        .getWorldMatrix()
        .clone()
        .setTranslationFromFloats(0, height / 2, 0),
    );
    mesh.isVisible = false;
    return mesh;
  };
  const models = {
    palms: [box("p1", 6), box("p2", 6), box("p3", 6)],
    rocks: [box("r1", 1), box("r2", 1), box("r3", 1)],
    bushes: [box("b1", 0.7), box("b2", 1), box("b3", 0.6)],
    hut: box("hut", 5),
  };
  const placed = placeIslandProps(visual, models, MARKETS);
  assert.ok(fallback.isDisposed(), "the procedural props are gone");
  assert.equal(visual.fallback, undefined);
  assert.equal(
    placed.instances.length,
    placed.palms + placed.rocks + placed.bushes + (placed.hut ? 1 : 0),
  );
  assert.ok(placed.palms >= 8 && placed.rocks > 0 && placed.hut);
  assert.ok(placed.bushes >= 14, `${placed.bushes} bushes`);
  assert.ok(placed.instances.every((i) => i.parent === visual.mesh));
  // A palm's base is where the layout put it (the box's bottom is at its origin).
  const palm = placed.instances.find((i) => i.name.startsWith("palm"));
  assert.ok(palm.position.y < visual.height(palm.position.x, palm.position.z));
  // A second call adds nothing.
  const count = scene.meshes.length;
  assert.equal(placeIslandProps(visual, models, MARKETS), placed);
  assert.equal(scene.meshes.length, count);
  // The instances are disposed with the island.
  visual.mesh.dispose();
  assert.ok(placed.instances.every((i) => i.isDisposed()));
  scene.dispose();
  engine.dispose();
});
