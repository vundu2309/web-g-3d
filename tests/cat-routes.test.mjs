import assert from "node:assert/strict";
import test from "node:test";
import { SEA_BOUND } from "../src/ocean/model.ts";
import {
  BOATS,
  REST,
  ROUTE_LENGTH,
  ROW_SPEED,
  boatPose,
  cycleOf,
  makePlans,
  makeRoutes,
  solids,
  travelTime,
} from "../src/ocean/cat-routes.ts";

test("there are enough clear routes between islands, each of a rowable length and inside the sea", () => {
  const routes = makeRoutes();
  assert.ok(routes.length >= 6, `routes ${routes.length}`);
  for (const r of routes) {
    assert.ok(r.length >= ROUTE_LENGTH.min && r.length <= ROUTE_LENGTH.max);
    for (const p of [r.a, r.b])
      assert.ok(Math.abs(p.x) < SEA_BOUND && Math.abs(p.z) < SEA_BOUND);
    assert.notEqual(r.islands[0], r.islands[1]);
  }
});

test("the plans are the same every time (every device agrees), one per boat", () => {
  const a = makePlans();
  const b = makePlans();
  assert.equal(a.length, BOATS);
  assert.deepEqual(a, b);
  for (const t of [0, 123.4, 99999])
    assert.deepEqual(boatPose(a[2], t), boatPose(b[2], t));
});

test("a boat never touches an island, a pier or the harbour, at any time of its cycle", () => {
  const solid = solids();
  for (const plan of makePlans()) {
    const cycle = cycleOf(plan.route);
    for (let t = 0; t < cycle; t += 2.5) {
      const p = boatPose(plan, t);
      for (const s of solid) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        assert.ok(
          d > s.radius + 8,
          `route ${plan.route.islands} at ${t.toFixed(0)} s is ${d.toFixed(0)} m from a solid of radius ${s.radius}`,
        );
      }
    }
  }
});

test("a boat rows to the far port, rests, rows back and rests; it is periodic and heads where it goes", () => {
  const plan = makePlans()[0];
  const { a, b } = plan.route;
  const travel = travelTime(plan.route);
  const cycle = cycleOf(plan.route);
  const start = -plan.phase;
  const at = (s) => boatPose(plan, start + s);
  const p0 = at(0);
  assert.ok(Math.hypot(p0.x - a.x, p0.z - a.z) < 1e-6 && p0.effort === 0);
  const mid = at(travel / 2);
  assert.ok(mid.speed > ROW_SPEED && mid.effort === 1);
  const arrived = at(travel + 1);
  assert.ok(
    Math.hypot(arrived.x - b.x, arrived.z - b.z) < 1e-6 && arrived.speed === 0,
  );
  assert.equal(at(travel + REST - 1).speed, 0);
  const back = at(travel + REST + travel / 2);
  assert.ok(back.speed > 0);
  // Heading: along a-to-b on the way there (the game's heading: 0 is -Z, a quarter turn +X).
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  assert.ok(Math.abs(Math.sin(mid.heading) * Math.hypot(dx, dz) - dx) < 1e-6);
  assert.ok(Math.abs(-Math.cos(mid.heading) * Math.hypot(dx, dz) - dz) < 1e-6);
  const again = at(cycle + 37);
  const first = at(37);
  assert.ok(
    Math.abs(again.x - first.x) < 1e-6 && Math.abs(again.z - first.z) < 1e-6,
  );
  // The speed never jumps: the eased distance moves less than the top speed each second.
  for (let s = 0; s < travel - 1; s += 1) {
    const q = at(s);
    const r = at(s + 1);
    assert.ok(Math.hypot(r.x - q.x, r.z - q.z) < ROW_SPEED * 1.6);
  }
});
