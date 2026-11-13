import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const {
  BREATH,
  CAT_IDS,
  CAT_MOTION,
  CAT_PARTS,
  CAT_SCALE,
  WAVE_EVERY,
  WAVE_SECONDS,
  catFile,
  catPose,
  catRoot,
  waveAmount,
} = await import("../src/ocean/cat-pose.ts");
const { MARKETS } = await import("../src/ocean/market.ts");

// The cat vendors (public/models/cat-*.glb, tools/blender/vendors.py) and the poses that animate
// their five parts. The GLBs are read as files, so a bad export is caught without a browser.
function readGlb(id) {
  const data = readFileSync(
    new URL(`../public/models/${catFile(id)}`, import.meta.url),
  );
  assert.equal(data.toString("ascii", 0, 4), "glTF", `${id} is a GLB`);
  assert.equal(data.readUInt32LE(8), data.length, `${id}: declared length`);
  return JSON.parse(data.toString("utf8", 20, 20 + data.readUInt32LE(12)));
}

/** Triangles, bounds (in the part's own frame) and attributes of a node's mesh. */
function meshInfo(gltf, node) {
  let triangles = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const attributes = new Set();
  for (const primitive of gltf.meshes[node.mesh].primitives) {
    triangles += gltf.accessors[primitive.indices].count / 3;
    const position = gltf.accessors[primitive.attributes.POSITION];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], position.min[k]);
      max[k] = Math.max(max[k], position.max[k]);
    }
    Object.keys(primitive.attributes).forEach((a) => attributes.add(a));
  }
  return { triangles, min, max, attributes };
}

const TRIANGLES = { min: 2500, max: 4000 };

test("each cat file is one vendor-<id> root with exactly the five named parts, untransformed", () => {
  for (const id of CAT_IDS) {
    const gltf = readGlb(id);
    const root = gltf.nodes.find((n) => n.name === catRoot(id));
    assert.ok(root, `${id}: root ${catRoot(id)}`);
    assert.deepEqual(gltf.scenes[0].nodes, [gltf.nodes.indexOf(root)]);
    assert.deepEqual(
      root.children.map((i) => gltf.nodes[i].name).sort(),
      [...CAT_PARTS].sort(),
      `${id}: parts`,
    );
    for (const node of gltf.nodes) {
      assert.equal(node.rotation, undefined, `${id}/${node.name} rotation`);
      assert.equal(node.scale, undefined, `${id}/${node.name} scale`);
    }
    assert.equal(root.translation, undefined, `${id}: root at the feet`);
  }
});

test("pivots: head at the neck, arms at the shoulders (the right arm at -x), tail at its base", () => {
  for (const id of CAT_IDS) {
    const gltf = readGlb(id);
    const at = (name) => gltf.nodes.find((n) => n.name === name).translation;
    const [lx, ly] = at("arm-left");
    const [rx, ry] = at("arm-right");
    assert.ok(lx > 0.05 && rx < -0.05, `${id}: arms either side`);
    assert.ok(Math.abs(lx + rx) < 1e-4 && Math.abs(ly - ry) < 1e-4);
    assert.ok(ly > 0.4 && ly < 0.7, `${id}: shoulders at ${ly}`);
    const head = at("head");
    assert.ok(head[1] > 0.5 && head[1] < 0.75, `${id}: neck at ${head[1]}`);
    assert.ok(Math.abs(head[0]) < 1e-4, `${id}: head on the middle`);
    const tail = at("tail");
    assert.ok(tail[2] < 0, `${id}: tail grows from the back (-z)`);
    assert.equal(
      gltf.nodes.find((n) => n.name === "body").translation,
      undefined,
    );
  }
});

test("triangle budgets, vertex colours, height and feet at 0", () => {
  const totals = {};
  for (const id of CAT_IDS) {
    const gltf = readGlb(id);
    let triangles = 0;
    let lowest = Infinity;
    let highest = -Infinity;
    for (const node of gltf.nodes.filter((n) => n.mesh !== undefined)) {
      const info = meshInfo(gltf, node);
      triangles += info.triangles;
      assert.ok(info.attributes.has("COLOR_0"), `${id}/${node.name}: colours`);
      assert.ok(!info.attributes.has("TEXCOORD_0"), `${id}: no textures`);
      const offset = node.translation ?? [0, 0, 0];
      lowest = Math.min(lowest, offset[1] + info.min[1]);
      highest = Math.max(highest, offset[1] + info.max[1]);
    }
    totals[id] = triangles;
    assert.ok(
      triangles >= TRIANGLES.min && triangles <= TRIANGLES.max,
      `${id}: ${triangles} triangles`,
    );
    assert.ok(Math.abs(lowest) < 0.01, `${id}: lowest point ${lowest}`);
    const height = highest - lowest;
    assert.ok(height > 1.1 && height < 1.4, `${id}: ${height} m tall`);
  }
  // Written down in docs/ocean.md ("Market vendors"): the cats add about this to the sea's count.
  assert.ok(
    Object.values(totals).reduce((a, b) => a + b, 0) < 11000,
    JSON.stringify(totals),
  );
});

test("every market vendor has its own cat", () => {
  const looks = MARKETS.map((m) => m.vendor.look);
  assert.equal(new Set(looks).size, MARKETS.length, "one cat per market");
  for (const look of looks) assert.ok(CAT_IDS.includes(look), look);
  const names = Object.fromEntries(
    MARKETS.map((m) => [m.vendor.look, m.vendor.name]),
  );
  assert.deepEqual(names, { lan: "Cô Lan", tu: "Chú Tư", sau: "Bà Sáu" });
  assert.ok(CAT_SCALE > 1 && CAT_SCALE < 2);
});

test("poses are deterministic and bounded", () => {
  for (const id of CAT_IDS) {
    for (let t = -20; t < 60; t += 0.37) {
      const a = catPose(id, t, 1.5);
      assert.deepEqual(a, catPose(id, t, 1.5), "same time, same pose");
      assert.ok(a.bodyScaleY >= 1 && a.bodyScaleY <= 1 + BREATH + 1e-9, id);
      assert.ok(a.lift >= 0 && a.lift < 0.01, `${id}: lift ${a.lift}`);
      assert.ok(Math.abs(a.head.x) <= 0.05 + 1e-9, "the head nods a little");
      assert.ok(Math.abs(a.head.z) <= 0.07 + 1e-9, "the head tilts a little");
      assert.ok(Math.abs(a.tail.z) <= CAT_MOTION[id].tailSwing + 1e-9);
      assert.ok(Math.abs(a.tail.y) <= CAT_MOTION[id].tailSwing + 1e-9);
      // The right arm hangs at -x: outward (and up) is a negative turn about z, never across the body.
      assert.ok(
        a.armRight.z <= 0 && a.armRight.z > -3,
        `${id}: ${a.armRight.z}`,
      );
      assert.ok(Math.abs(a.armLeft.z) < 0.1 && Math.abs(a.armLeft.x) < 0.1);
      for (const v of [a.armRight.x, a.head.x, a.tail.y])
        assert.ok(Number.isFinite(v));
    }
  }
});

test("the wave lasts 2.2 s of every 8 and only the right arm takes part", () => {
  assert.equal(WAVE_SECONDS, 2.2);
  assert.equal(WAVE_EVERY, 8);
  let waving = 0;
  const steps = 8000;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * WAVE_EVERY;
    if (waveAmount(t) > 0) waving++;
  }
  assert.ok(Math.abs((waving / steps) * WAVE_EVERY - 2.2) < 0.01);
  assert.equal(waveAmount(WAVE_EVERY * 5 + 4), 0, "quiet between waves");
  assert.equal(waveAmount(-WAVE_EVERY + 4), 0, "negative time wraps");
  assert.ok(waveAmount(1.1) > 0.99, "peak mid-wave");
  for (const id of CAT_IDS) {
    const up = catPose(id, 1.1);
    const down = catPose(id, 5);
    assert.ok(up.armRight.z < -2, `${id}: arm raised ${up.armRight.z}`);
    assert.ok(down.armRight.z > -0.2, `${id}: arm down ${down.armRight.z}`);
    assert.ok(Math.abs(up.armLeft.z - down.armLeft.z) < 1e-9, "left arm stays");
  }
  assert.notEqual(
    catPose("lan", 1.1, 0).armRight.z,
    catPose("lan", 1.1, 4).armRight.z,
  );
});

test("the three cats move differently (tail and head tempo), and the tail sways about its base", () => {
  const sample = (id) =>
    Array.from({ length: 40 }, (_, i) =>
      catPose(id, i * 0.5).tail.z.toFixed(4),
    ).join();
  const tails = CAT_IDS.map(sample);
  assert.equal(new Set(tails).size, CAT_IDS.length, "three tails");
  assert.equal(new Set(CAT_IDS.map((id) => CAT_MOTION[id].tailPhase)).size, 3);
  assert.equal(new Set(CAT_IDS.map((id) => CAT_MOTION[id].breathRate)).size, 3);
  for (const id of CAT_IDS) {
    const swing = tails[CAT_IDS.indexOf(id)].split(",").map(Number);
    assert.ok(
      Math.max(...swing) > 0.05 && Math.min(...swing) < -0.05,
      `${id}: sways both ways`,
    );
  }
});
