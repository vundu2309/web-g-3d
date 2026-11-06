import { test } from "node:test";
import assert from "node:assert/strict";
import { ROD_BASE, ROD_LENGTH, RodSim } from "../src/ocean/rod.ts";
import { Rope } from "../src/ocean/rope.ts";

const seeded = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const run = (rod, seconds, pull, shake = 0) => {
  for (let t = 0; t < seconds; t += 1 / 60) rod.step(1 / 60, pull, shake);
};

test("the rod keeps its length and bends away from a pull, then springs back", () => {
  const rod = new RodSim(seeded(1));
  const rest = rod.tip();
  const points = rod.points(12);
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += dist(points[i - 1], points[i]);
  assert.ok(Math.abs(total - ROD_LENGTH) < 1e-6, `length ${total}`);
  assert.ok(
    Math.abs(points[0].x - ROD_BASE.x) < 1e-9,
    "the hand does not move",
  );
  // A fish pulls the tip toward the water (down and out): the tip drops.
  run(rod, 1.5, { x: 0.4, y: -0.9, z: 0 });
  const bent = rod.tip();
  assert.ok(bent.y < rest.y - 0.3, `bent down ${rest.y} -> ${bent.y}`);
  assert.ok(rod.bend > 0.3);
  const bentPoints = rod.points(12);
  let bentTotal = 0;
  for (let i = 1; i < bentPoints.length; i++)
    bentTotal += dist(bentPoints[i - 1], bentPoints[i]);
  assert.ok(Math.abs(bentTotal - ROD_LENGTH) < 1e-6, "a bent rod is as long");
  // Let go: it springs back to rest.
  run(rod, 3, { x: 0, y: 0, z: 0 });
  assert.ok(dist(rod.tip(), rest) < 0.05, "back at rest");
});

test("a harder pull bends more, and it rings before it settles", () => {
  const soft = new RodSim(seeded(2));
  const hard = new RodSim(seeded(2));
  run(soft, 1.5, { x: 0, y: -0.3, z: 0 });
  run(hard, 1.5, { x: 0, y: -1, z: 0 });
  assert.ok(hard.bend > soft.bend * 1.5, `${hard.bend} vs ${soft.bend}`);
  // After the pull stops, the tip overshoots rest at least once (a lightly damped spring).
  const rest = new RodSim().tip();
  let crossed = 0;
  let last = Math.sign(hard.tip().y - rest.y);
  for (let t = 0; t < 2; t += 1 / 120) {
    hard.step(1 / 120, { x: 0, y: 0, z: 0 });
    const side = Math.sign(hard.tip().y - rest.y);
    if (side !== 0 && side !== last) crossed++;
    if (side !== 0) last = side;
  }
  assert.ok(crossed >= 1, `crossed rest ${crossed} times`);
});

test("a thrashing fish shakes the rod and the bend stays bounded", () => {
  const calm = new RodSim(seeded(3));
  const wild = new RodSim(seeded(3));
  let calmSpread = 0;
  let wildSpread = 0;
  let lastCalm = calm.tip();
  let lastWild = wild.tip();
  for (let t = 0; t < 2; t += 1 / 60) {
    calm.step(1 / 60, { x: 0.2, y: -0.5, z: 0 }, 0);
    wild.step(1 / 60, { x: 0.2, y: -0.5, z: 0 }, 1);
    calmSpread += dist(calm.tip(), lastCalm);
    wildSpread += dist(wild.tip(), lastWild);
    lastCalm = calm.tip();
    lastWild = wild.tip();
    assert.ok(wild.bend <= 1 + 1e-9);
  }
  assert.ok(wildSpread > calmSpread * 1.5, `${wildSpread} vs ${calmSpread}`);
});

test("a rope with slack sags between its ends and a taut one is straight", () => {
  const a = { x: 0, y: 3, z: 0 };
  const b = { x: 20, y: 0.5, z: 0 };
  const span = dist(a, b);
  const slack = new Rope(22);
  slack.reset(a, b);
  for (let t = 0; t < 3; t += 1 / 60) slack.step(1 / 60, a, b, span * 1.15);
  // The middle hangs below the straight line between the ends.
  const mid = slack.count >> 1;
  const straightY = (a.y + b.y) / 2;
  assert.ok(slack.positions[mid * 3 + 1] < straightY - 0.8, "sags");
  const taut = new Rope(22);
  taut.reset(a, b);
  for (let t = 0; t < 3; t += 1 / 60) taut.step(1 / 60, a, b, span);
  assert.ok(
    Math.abs(taut.positions[mid * 3 + 1] - straightY) < 0.15,
    "straight",
  );
  assert.ok(taut.drawnLength() < span * 1.03);
  // Ends stay on their pins.
  assert.equal(slack.positions[0], a.x);
  assert.equal(slack.positions[(slack.count - 1) * 3 + 1], b.y);
});

test("the rope stays above the sea and never blows up", () => {
  const a = { x: 0, y: 3, z: 0 };
  const b = { x: 8, y: -0.2, z: 0 };
  const rope = new Rope(22);
  rope.reset(a, b);
  const floor = () => 0;
  for (let t = 0; t < 6; t += 1 / 60) rope.step(1 / 60, a, b, 14, floor);
  for (let i = 1; i < rope.count - 1; i++) {
    assert.ok(Number.isFinite(rope.positions[i * 3 + 1]));
    assert.ok(rope.positions[i * 3 + 1] >= 0.04 - 1e-9, "above the water");
  }
  // A long slow frame is handled in small steps.
  rope.step(5, a, b, 14, floor);
  assert.ok(Number.isFinite(rope.drawnLength()));
});

test("sag grows with the square root of the spare line: 3 % extra sags 2.5 m, a hair of slack half a metre", async () => {
  const sagOf = (extraOf) => {
    const a = { x: 0, y: 3.5, z: 0 };
    const b = { x: 6, y: 0.3, z: -20 };
    const span = dist(a, b);
    const rope = new Rope(22);
    rope.reset(a, b);
    for (let t = 0; t < 3; t += 1 / 60)
      rope.step(1 / 60, a, b, span + extraOf(span), () => 0);
    let worst = 0;
    for (let i = 1; i < rope.count - 1; i++) {
      const t = i / (rope.count - 1);
      const sx = a.x + (b.x - a.x) * t;
      const sy = a.y + (b.y - a.y) * t;
      const sz = a.z + (b.z - a.z) * t;
      worst = Math.max(
        worst,
        Math.hypot(
          rope.positions[i * 3] - sx,
          rope.positions[i * 3 + 1] - sy,
          rope.positions[i * 3 + 2] - sz,
        ),
      );
    }
    return worst;
  };
  // A fish that pulls: no spare line, a straight line.
  assert.ok(sagOf(() => 0) < 0.05, "taut is straight");
  // Waiting: a hair of slack, a gentle sag.
  const waiting = sagOf(() => 0.04);
  assert.ok(waiting > 0.2 && waiting < 1, `waiting sag ${waiting}`);
  // The old mistake: a few per cent of spare line makes a big loop.
  assert.ok(sagOf((span) => span * 0.03) > 2, "3 % spare line sags a lot");
});

test("the line strip faces the viewer and is wider when it is farther", async () => {
  const { ribbonPositions } = await import("../src/ocean/rope.ts");
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -10 },
    { x: 0, y: 0, z: -20 },
  ];
  const near = ribbonPositions(
    points,
    { x: 0, y: 10, z: -10 },
    new Float32Array(18),
  );
  const far = ribbonPositions(
    points,
    { x: 0, y: 200, z: -10 },
    new Float32Array(18),
  );
  const width = (out, i) =>
    Math.hypot(
      out[i * 6 + 3] - out[i * 6],
      out[i * 6 + 4] - out[i * 6 + 1],
      out[i * 6 + 5] - out[i * 6 + 2],
    );
  assert.ok(width(far, 1) > width(near, 1) * 5, "wider from far away");
  assert.ok(
    width(near, 1) >= 0.035 - 1e-6 && width(far, 1) <= 0.4 + 1e-6,
    "within its limits",
  );
  // The strip is across the line (sideways to a line along Z, seen from above: along X).
  assert.ok(Math.abs(near[3] - near[0]) > 0.9 * width(near, 0));
  assert.ok(Number.isFinite(near[17]));
});
