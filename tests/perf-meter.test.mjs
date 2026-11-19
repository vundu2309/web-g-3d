import assert from "node:assert/strict";
import test from "node:test";
import {
  HITCH,
  POOR,
  PerfWindow,
  isPoor,
  meshGroup,
  perfLines,
  topGroups,
} from "../src/ocean/perf-meter.ts";

test("a steady 30 fps shows as 30 fps with an even gap and no hitches", () => {
  const w = new PerfWindow(2000);
  for (let t = 0; t <= 3000; t += 100 / 3) {
    w.tick(t);
    w.frame(t, 100 / 3, 5);
  }
  const s = w.summary(3000);
  assert.ok(Math.abs(s.fps - 30) < 1, `fps ${s.fps}`);
  assert.ok(
    Math.abs(s.gapAvg - 33.3) < 0.5 && s.gapMax < 34 && s.hitches === 0,
  );
  assert.equal(Math.round(s.costAvg), 5);
});

test("the display rate counts frames that were not drawn", () => {
  const w = new PerfWindow(2000);
  for (let t = 0; t <= 2000; t += 1000 / 120) {
    w.tick(t);
    if (Math.round(t / (1000 / 120)) % 2 === 0) w.frame(t, 1000 / 60, 4);
  }
  const s = w.summary(2000);
  assert.ok(Math.abs(s.displayFps - 120) < 3, `display ${s.displayFps}`);
  assert.ok(Math.abs(s.fps - 60) < 3, `drawn ${s.fps}`);
});

test("a long frame is a hitch and the worst gap and the 95th percentile see it", () => {
  const w = new PerfWindow(5000);
  let t = 0;
  for (let i = 0; i < 100; i++) {
    const gap = i === 50 ? HITCH * 3 : 16.7;
    t += gap;
    w.frame(t, gap, 6);
  }
  const s = w.summary(t);
  assert.equal(s.hitches, 1);
  assert.ok(s.gapMax > HITCH * 2.9 && s.gapP95 < 20);
});

test("old frames fall out of the window and an empty window is zeros", () => {
  const w = new PerfWindow(1000);
  w.frame(0, 16, 3);
  w.frame(16, 16, 3);
  assert.equal(w.summary(10000).fps, 0);
  assert.equal(new PerfWindow().summary(0).gapMax, 0);
});

test("the panel lines carry every number and leave out the heap when the browser has none", () => {
  const s = new PerfWindow().summary(0);
  const base = {
    mode: "full",
    renderScale: 1,
    clearWater: true,
    clearWaterMeshes: 3,
    meshes: 40,
    triangles: 123456,
    boats: 2,
  };
  const lines = perfLines(s, base);
  assert.ok(lines.some((l) => l.includes("pace full")));
  assert.ok(lines.some((l) => l.includes("clear water on (3)")));
  assert.ok(lines.some((l) => l.includes("123k")));
  assert.ok(!lines.some((l) => l.startsWith("heap")));
  assert.ok(
    perfLines(s, { ...base, heapMb: 210.4 }).some((l) => l === "heap 210 MB"),
  );
});

test("the panel is poor below 24 fps, with a slow tail, a heavy frame or many hitches, and not for a steady 30 fps", () => {
  const run = (gapOf, cost = 5, n = 90) => {
    const w = new PerfWindow(5000);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const gap = gapOf(i);
      t += gap;
      w.frame(t, gap, cost);
    }
    return isPoor(w.summary(t), w.frames);
  };
  assert.equal(
    run(() => 33.3),
    false,
    "a steady 30 is the eco rhythm, not poor",
  );
  assert.equal(
    run(() => 16.7),
    false,
  );
  assert.equal(
    run(() => 50),
    true,
    "20 fps is poor",
  );
  assert.equal(
    run((i) => (i % 10 === 0 ? 120 : 20)),
    true,
    "a slow tail",
  );
  assert.equal(
    run(() => 33.3, POOR.cost + 5),
    true,
    "a heavy frame",
  );
  assert.equal(
    run((i) => (i % 30 === 0 ? 90 : 16.7), 5, 100),
    true,
    "three hitches",
  );
  assert.equal(
    run(() => 50, 5, 5),
    false,
    "too few frames to judge",
  );
});

test("the triangle breakdown groups meshes by name and lists the biggest first", () => {
  assert.equal(meshGroup("palm-12-crown"), "palm");
  assert.equal(meshGroup("boat-model-3-hull"), "boat");
  assert.equal(meshGroup("school-fish-4-7"), "school");
  assert.equal(meshGroup("island7"), "island");
  assert.equal(meshGroup("12"), "mesh");
  const top = topGroups(
    [
      ["island-1", 300000],
      ["island-2", 100000],
      ["boat-a-hull", 50000],
      ["school-fish-1-1", 80],
      ["school-fish-1-2", 80],
      ["sea", 33600],
    ],
    3,
  );
  assert.deepEqual(top, [
    ["island", 400000],
    ["boat", 50000],
    ["sea", 33600],
  ]);
  const lines = perfLines(new PerfWindow().summary(0), {
    mode: "eco",
    renderScale: 1,
    clearWater: false,
    clearWaterMeshes: 0,
    meshes: 1,
    triangles: 1,
    boats: 1,
    top,
  });
  assert.ok(lines.some((l) => l === "tris: island 400k boat 50k sea 34k"));
});

test("the panel says which parts are switched off, or that all are on", () => {
  const s = new PerfWindow().summary(0);
  const base = {
    mode: "eco",
    renderScale: 1.5,
    clearWater: true,
    clearWaterMeshes: 1,
    meshes: 10,
    triangles: 1000,
    boats: 1,
  };
  assert.ok(perfLines(s, { ...base, switches: [] }).includes("parts: all on"));
  assert.ok(
    perfLines(s, { ...base, switches: ["reflect", "scale=1"] }).includes(
      "OFF: reflect scale=1",
    ),
  );
  // Without the information (an old caller) neither line is added.
  assert.ok(!perfLines(s, base).some((l) => /^(OFF|parts)/.test(l)));
});
