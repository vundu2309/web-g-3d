import assert from "node:assert/strict";
import test from "node:test";
import { HITCH, PerfWindow, perfLines } from "../src/ocean/perf-meter.ts";

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
