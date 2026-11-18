import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANIMALS,
  FULL_ANGLE,
  KINDS,
  LIGHT_MODEL,
  LOD_TRIANGLES,
  MIN_ANGLE,
  TRIANGLE_BUDGET,
  approach,
  chooseVisible,
  hasLevels,
  levelOf,
  trianglesAt,
  wildPose,
} from "../src/ocean/wildlife.ts";
import { simplifyPart } from "../src/ocean/simplify.ts";
import { creatureOf, fishFile, parseFishGlb } from "../src/ocean/glb-parts.ts";
import { islands } from "../src/ocean/model.ts";
import { coastDistance, shoreOf } from "../src/ocean/shore.ts";
import { beachRise } from "../src/ocean/island-shape.ts";
import { SPECIES } from "../src/ocean/fishing.ts";

// The living animals of the sea (wildlife.ts): where they are is a pure function of the time, so
// every player sees the same ones; only those near the player are drawn, within a budget.
const TIMES = Array.from({ length: 120 }, (_, i) => i * 7.3);
const of = (kind) => ANIMALS.filter((a) => a.kind === kind);

test("every kind names a species that has a model, and its triangle count is that model's", () => {
  for (const [kind, spec] of Object.entries(KINDS)) {
    assert.ok(
      SPECIES.some((s) => s.id === spec.species),
      `${kind} names a real species`,
    );
    const template = parseFishGlb(
      readFileSync(
        new URL(`../public/models/${fishFile(spec.species)}`, import.meta.url),
      ),
    );
    assert.equal(
      template.main.indices.length / 3,
      spec.triangles,
      `${kind}: the budget counts what the file really holds`,
    );
    assert.ok(spec.length > 0 && spec.cap >= 1, kind);
  }
});

test("every island has animals, ids are unique, and a pose is a pure function of the time", () => {
  assert.equal(new Set(ANIMALS.map((a) => a.id)).size, ANIMALS.length);
  for (let i = 0; i < islands.length; i++)
    assert.ok(
      ANIMALS.some((a) => a.island === i && a.kind === "turtle"),
      `island ${i} has a turtle`,
    );
  for (const a of ANIMALS)
    for (const t of TIMES) {
      const p = wildPose(a, t);
      for (const v of [
        p.x,
        p.z,
        p.y,
        p.heading,
        p.pitch,
        p.roll,
        p.sx,
        p.sy,
        p.sz,
      ])
        assert.ok(Number.isFinite(v), `${a.id} at ${t}`);
      assert.deepEqual(p, wildPose(a, t), "same time, same pose");
    }
});

test("water animals stay in the water and away from the beach, land animals on the sand", () => {
  for (const [kind, near] of [
    ["dolphin", 35],
    ["turtle", 8],
    ["jellyfish", 18],
  ])
    for (const a of of(kind))
      for (const t of TIMES) {
        const p = wildPose(a, t);
        assert.ok(
          coastDistance(p.x, p.z) > near,
          `${a.id} at ${t}: ${coastDistance(p.x, p.z).toFixed(1)} m off the coast`,
        );
      }
  for (const a of of("crab"))
    for (const t of TIMES) {
      const p = wildPose(a, t);
      const d = -shoreOf(a.island, p.x, p.z).distance;
      assert.ok(
        d > 2.5 && d < 11,
        `${a.id} is on dry sand (${d.toFixed(1)} m in)`,
      );
      assert.equal(p.level, "ground");
      assert.ok(
        Math.abs(p.y - (beachRise(d) + 0.17 * KINDS.crab.length)) < 0.2,
        `${a.id} walks on the sand, not in it or above it`,
      );
    }
  for (const a of of("starfish")) {
    const p = wildPose(a, 0);
    const d = -shoreOf(a.island, p.x, p.z).distance;
    assert.ok(
      d > 0 && d < 2,
      `${a.id} lies on the wet sand (${d.toFixed(2)} m)`,
    );
  }
});

test("a dolphin leaps clear of the water now and then, nose up then down, and swims at the surface otherwise", () => {
  const dolphin = of("dolphin")[0];
  let highest = 0;
  let up = false;
  let down = false;
  let lowest = 0;
  for (let t = 0; t < 120; t += 0.05) {
    const p = wildPose(dolphin, t);
    if (p.y > 1.5) {
      highest = Math.max(highest, p.y);
      if (p.pitch > 0.3) up = true;
      if (p.pitch < -0.3) down = true;
    } else lowest = Math.min(lowest, p.y);
  }
  assert.ok(highest > 2 && highest < 2.6, `a leap peaks at ${highest} m`);
  assert.ok(up && down, "nose up on the way out, down on the way in");
  assert.ok(lowest > -0.3, "never deep under between leaps");
  // A pod keeps together: its members are never more than a few metres apart.
  const pod = of("dolphin").filter((a) => a.island === dolphin.island);
  assert.equal(pod.length, 3);
  for (const t of TIMES)
    for (const a of pod)
      assert.ok(
        Math.hypot(
          wildPose(a, t).x - wildPose(pod[0], t).x,
          wildPose(a, t).z - wildPose(pod[0], t).z,
        ) < 25,
        "the pod holds together",
      );
});

test("nothing moves faster than an animal could: no jumps in position between frames", () => {
  for (const a of ANIMALS)
    for (const t of TIMES) {
      const p = wildPose(a, t);
      const q = wildPose(a, t + 0.1);
      assert.ok(
        Math.hypot(q.x - p.x, q.z - p.z) < 0.6,
        `${a.id} at ${t}: ${Math.hypot(q.x - p.x, q.z - p.z).toFixed(2)} m in a tenth of a second`,
      );
    }
});

test("how much of an animal is drawn follows how big it looks: whole, a coarser copy, or nothing", () => {
  for (const kind of Object.keys(KINDS)) {
    const spec = KINDS[kind];
    let last = 0;
    let gone = false;
    for (let d = 0.5; d < 2000; d *= 1.07) {
      const level = levelOf(kind, d);
      if (level < 0) {
        assert.ok(spec.length / d < MIN_ANGLE + 1e-9, `${kind} at ${d}`);
        gone = true;
        continue;
      }
      assert.ok(!gone, "nothing comes back after it has gone");
      assert.ok(
        level >= last,
        `${kind} at ${d.toFixed(0)} m: ${level} after ${last}`,
      );
      last = level;
    }
    assert.equal(levelOf(kind, 1e6), -1, `${kind} is not drawn from very far`);
    if (hasLevels(kind)) {
      assert.equal(
        levelOf(kind, spec.length / FULL_ANGLE - 0.1),
        0,
        `${kind} is whole while big`,
      );
      assert.equal(trianglesAt(kind, 0), spec.triangles);
      assert.ok(trianglesAt(kind, 1) <= LOD_TRIANGLES[1]);
      assert.ok(trianglesAt(kind, 2) <= LOD_TRIANGLES[2]);
    } else {
      assert.ok(spec.triangles <= LIGHT_MODEL);
      for (const d of [1, 50, 200])
        assert.ok(levelOf(kind, d) <= 0, "a light model has one level");
    }
  }
  // A crab is whole only when it is close, a mid copy a little farther, a far copy beyond that.
  assert.equal(levelOf("crab", 10), 0);
  assert.equal(levelOf("crab", 25), 1);
  assert.equal(levelOf("crab", 60), 2);
  assert.equal(levelOf("crab", 150), -1);
  assert.equal(
    levelOf("dolphin", 300),
    0,
    "a dolphin is cheap, so it is drawn whole from far",
  );
});

test("the fade moves toward its target at a steady rate and never overshoots", () => {
  assert.equal(approach(0, 1, 0.5, 0.7), 0.35);
  assert.equal(approach(0.9, 1, 1, 0.7), 1);
  assert.equal(approach(1, 0, 0.4, 1.25), 0.5);
  assert.equal(approach(0.2, 0, 1, 1.25), 0);
  assert.equal(approach(0.5, 0.5, 1, 1), 0.5);
  assert.equal(approach(0.3, 1, -1, 1), 0.3, "time never runs backward");
});

test("only the animals that look big enough are drawn, whole ones within the cap, all within the triangle budget", () => {
  const near = {
    x: islands[0].x + islands[0].radius + 20,
    y: 10,
    z: islands[0].z,
  };
  const far = { x: 0, y: 10, z: 1400 };
  let drawnAtFar = 0;
  for (const t of TIMES) {
    const chosen = chooseVisible(near, t);
    const whole = {};
    let triangles = 0;
    for (const [id, level] of chosen) {
      const a = ANIMALS.find((x) => x.id === id);
      triangles += trianglesAt(a.kind, level);
      if (level === 0 && hasLevels(a.kind))
        whole[a.kind] = (whole[a.kind] ?? 0) + 1;
      const p = wildPose(a, t);
      const distance = Math.hypot(
        p.x - near.x,
        p.z - near.z,
        near.y - (p.level === "sea" ? 0 : p.y),
      );
      assert.equal(level, levelOf(a.kind, distance), `${id}: level ${level}`);
    }
    for (const [kind, n] of Object.entries(whole))
      assert.ok(n <= KINDS[kind].cap, `${kind}: ${n} whole`);
    assert.ok(triangles <= TRIANGLE_BUDGET, `${triangles} triangles`);
    drawnAtFar += chooseVisible(far, t).size;
  }
  assert.equal(drawnAtFar, 0, "nothing is drawn where nothing is near");
  // A small budget makes animals coarser before it leaves them out, and is never exceeded.
  const small = chooseVisible(near, 100, 20_000);
  let spent = 0;
  for (const [id, level] of small)
    spent += trianglesAt(ANIMALS.find((a) => a.id === id).kind, level);
  assert.ok(spent <= 20_000);
  assert.equal(chooseVisible(near, 100, 0).size, 0);
  // Nearest first: standing beside a crab, that crab is the one drawn whole.
  const crab = ANIMALS.find((a) => a.kind === "crab");
  const p = wildPose(crab, 50);
  const beside = chooseVisible({ x: p.x, y: 3, z: p.z + 3 }, 50);
  assert.equal(beside.get(crab.id), 0);
});

test("a coarser copy has no more triangles than asked, keeps the shape and the colours, and leaves the original alone", () => {
  for (const id of ["cua-bien", "sua", "rua-bien"]) {
    const template = parseFishGlb(
      readFileSync(
        new URL(`../public/models/${fishFile(id)}`, import.meta.url),
      ),
    );
    const whole = creatureOf(template).main;
    const before = whole.indices.length;
    const originalFirst = whole.positions[0];
    for (const target of [4000, 700]) {
      const part = simplifyPart(whole, target);
      assert.ok(
        part.indices.length / 3 <= target,
        `${id}: ${part.indices.length / 3} triangles for ${target}`,
      );
      assert.ok(
        part.indices.length / 3 > target * 0.3,
        `${id}: not far under the target (${part.indices.length / 3})`,
      );
      const vertices = part.positions.length / 3;
      assert.ok(
        part.indices.every(
          (i) => Number.isInteger(i) && i >= 0 && i < vertices,
        ),
      );
      assert.equal(part.colors.length, vertices * 4);
      assert.equal(part.normals.length, part.positions.length);
      assert.ok(part.colors.every((v) => v >= 0 && v <= 1 + 1e-9));
      for (let i = 0; i < vertices; i++)
        assert.ok(
          Math.abs(
            Math.hypot(
              part.normals[i * 3],
              part.normals[i * 3 + 1],
              part.normals[i * 3 + 2],
            ) - 1,
          ) < 1e-6,
        );
      // The outline stays about the same size.
      for (let k = 0; k < 3; k++) {
        const side = (p) => {
          let lo = Infinity,
            hi = -Infinity;
          for (let i = k; i < p.length; i += 3) {
            lo = Math.min(lo, p[i]);
            hi = Math.max(hi, p[i]);
          }
          return hi - lo;
        };
        const ratio = side(part.positions) / side(whole.positions);
        assert.ok(
          ratio > 0.8 && ratio < 1.05,
          `${id} axis ${k}: ${ratio.toFixed(2)} of the original`,
        );
      }
    }
    assert.equal(whole.indices.length, before, "the original is not changed");
    assert.equal(whole.positions[0], originalFirst);
  }
  const small = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    colors: new Array(12).fill(1),
  };
  assert.equal(
    simplifyPart(small, 10),
    small,
    "a mesh already under the target is returned as it is",
  );
});

test("the scene's animals fade in as they come into view, are posed, and switch to a coarser copy as they get small", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { Wildlife } = await import("../src/ocean/wildlife-scene.ts");
  const { loadFishModel } = await import("../src/ocean/fish-models.ts");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const data = readFileSync(
      new URL(
        `../public/models/${String(url).split("/").pop()}`,
        import.meta.url,
      ),
    );
    return {
      ok: true,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  };
  const scene = new Scene(new NullEngine());
  try {
    for (const kind of Object.values(KINDS))
      await loadFishModel(fishFile(kind.species));
    const wild = new Wildlife(scene);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const crab = ANIMALS.find((a) => a.kind === "crab");
    const p = wildPose(crab, 10);
    const enabled = (id) =>
      scene.meshes.filter(
        (m) =>
          m.getClassName() === "InstancedMesh" &&
          m.name.startsWith(`wild-${id}-`) &&
          m.isEnabled(),
      );
    const names = scene.meshes
      .filter((m) => m.name.startsWith("wild-"))
      .map((m) => m.name);
    assert.ok(
      names.includes("wild-crab-0") &&
        names.includes("wild-crab-1") &&
        names.includes("wild-crab-2"),
      "three copies of a heavy model",
    );
    assert.ok(
      names.includes("wild-dolphin-0") && !names.includes("wild-dolphin-1"),
      "one of a light one",
    );
    const coarse = scene.getMeshByName("wild-crab-2");
    assert.ok(coarse.getTotalIndices() / 3 <= LOD_TRIANGLES[2]);
    assert.equal(
      scene.getMeshByName("wild-crab-0").getTotalIndices() / 3,
      KINDS.crab.triangles,
      "the whole model keeps every triangle",
    );
    // Standing beside it: shown at once (the first update), as the whole model.
    wild.update(10, { x: p.x, y: 3, z: p.z + 4 });
    assert.deepEqual(
      enabled(crab.id).map((m) => m.name),
      [`wild-${crab.id}-0`],
    );
    // Walking away until it is small: the far copy.
    wild.update(10.1, { x: p.x, y: 3, z: p.z + 60 });
    assert.deepEqual(
      enabled(crab.id).map((m) => m.name),
      [`wild-${crab.id}-2`],
    );
    // Out of sight: it fades out first (still there), then is switched off.
    wild.update(10.2, { x: 0, y: 3, z: 1400 });
    assert.equal(enabled(crab.id).length, 1, "still fading out");
    for (let t = 10.3; t < 12; t += 0.1)
      wild.update(t, { x: 0, y: 3, z: 1400 });
    assert.equal(enabled(crab.id).length, 0, "gone once the fade is done");
    // Back in view: it fades in rather than appearing whole.
    wild.update(12.1, { x: p.x, y: 3, z: p.z + 4 });
    const instance = enabled(crab.id)[0];
    assert.ok(instance, "it is back");
    wild.dispose();
  } finally {
    scene.dispose();
    globalThis.fetch = realFetch;
  }
});
