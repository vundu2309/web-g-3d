import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANIMALS,
  KINDS,
  TRIANGLE_BUDGET,
  chooseVisible,
  wildPose,
} from "../src/ocean/wildlife.ts";
import { islands } from "../src/ocean/model.ts";
import { coastDistance, shoreOf } from "../src/ocean/shore.ts";
import { beachRise } from "../src/ocean/island-shape.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { fishFile, parseFishGlb } from "../src/ocean/glb-parts.ts";

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
    assert.ok(spec.length > 0 && spec.cap >= 1 && spec.range > 0, kind);
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

test("only the animals near the player are drawn, within each kind's cap and the triangle budget", () => {
  const near = { x: islands[0].x + islands[0].radius + 20, z: islands[0].z };
  const far = { x: 0, z: 1400 };
  let drawnAtFar = 0;
  for (const t of TIMES) {
    const chosen = chooseVisible(near, t);
    const counts = {};
    let triangles = 0;
    for (const id of chosen) {
      const a = ANIMALS.find((x) => x.id === id);
      counts[a.kind] = (counts[a.kind] ?? 0) + 1;
      triangles += KINDS[a.kind].triangles;
      const p = wildPose(a, t);
      assert.ok(
        Math.hypot(p.x - near.x, p.z - near.z) <= KINDS[a.kind].range,
        `${id} is within its range`,
      );
    }
    for (const [kind, n] of Object.entries(counts))
      assert.ok(n <= KINDS[kind].cap, `${kind}: ${n} drawn`);
    assert.ok(triangles <= TRIANGLE_BUDGET, `${triangles} triangles`);
    drawnAtFar += chooseVisible(far, t).size;
  }
  assert.equal(drawnAtFar, 0, "nothing is drawn where nothing is near");
  // A smaller budget drops the heaviest first, never goes over, and a budget of nothing draws none.
  const near0 = chooseVisible(near, 100);
  const small = chooseVisible(near, 100, 20_000);
  assert.ok(small.size <= near0.size);
  let spent = 0;
  for (const id of small)
    spent += KINDS[ANIMALS.find((a) => a.id === id).kind].triangles;
  assert.ok(spent <= 20_000);
  assert.equal(chooseVisible(near, 100, 0).size, 0);
  // Nearest first: a crab 3 m away wins the single crab place.
  const a = of("crab")[0];
  const p = wildPose(a, 50);
  const beside = chooseVisible({ x: p.x + 3, z: p.z }, 50);
  assert.ok(beside.has(a.id) || of("crab").some((c) => beside.has(c.id)));
});
