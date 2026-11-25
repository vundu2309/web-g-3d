import assert from "node:assert/strict";
import test from "node:test";
import { FLIGHT } from "../src/ocean/plane-flight.ts";
import {
  CENTRE,
  LEAVE,
  PLANES,
  PlaneSim,
  STEP,
  cycleOf,
  homes,
  makePlans,
} from "../src/ocean/plane-plan.ts";
import { HARBOR } from "../src/ocean/model.ts";
import { SHORE_ISLANDS } from "../src/ocean/shore.ts";

const plans = makePlans();
const poseOf = (sim, shared) => {
  sim.advance(shared);
  return sim.pose(shared, {});
};
const dist = (p) => Math.hypot(p.x - CENTRE.x, p.z - CENTRE.z);
// A shared clock that looks like the server's: seconds since 1970.
const NOW = 1_795_000_000;

test("there are the planes the sea needs, and the plans are the same every time", () => {
  assert.equal(plans.length, PLANES);
  assert.deepEqual(makePlans(), plans);
  assert.equal(new Set(plans.map((p) => p.period)).size, PLANES);
  for (const p of plans) assert.ok(p.period > LEAVE * 2);
});

test("EVERY DEVICE SEES THE SAME PLANE: two devices that joined at different moments agree at any shared time", () => {
  for (const plan of plans) {
    const early = new PlaneSim(plan); // there from the start, stepping along
    const late = new PlaneSim(plan); // joins just now, replays the flight
    for (let t = NOW; t < NOW + 90; t += 1 / 30) poseOf(early, t);
    for (const t of [NOW + 90, NOW + 90.017, NOW + 90.5]) {
      const a = poseOf(early, t);
      const b = poseOf(late, t);
      assert.deepEqual(a, b, `plane ${plan.index} at +${t - NOW}`);
    }
  }
});

test("devices on different frame rates agree: fine steps, coarse steps and one jump give the same place", () => {
  const plan = plans[3];
  const fine = new PlaneSim(plan);
  const coarse = new PlaneSim(plan);
  const jump = new PlaneSim(plan);
  for (let t = NOW; t <= NOW + 200; t += 1 / 60) poseOf(fine, t);
  for (let t = NOW; t <= NOW + 200; t += 0.25) poseOf(coarse, t);
  const at = NOW + 200;
  assert.deepEqual(poseOf(fine, at), poseOf(coarse, at));
  assert.deepEqual(
    poseOf(fine, at),
    poseOf(jump, at),
    "a tab that was hidden catches up to the same place",
  );
});

test("a clock that is corrected backward puts the plane back where that time says", () => {
  const plan = plans[1];
  const sim = new PlaneSim(plan);
  const there = poseOf(new PlaneSim(plan), NOW + 40);
  poseOf(sim, NOW + 100);
  assert.deepEqual(poseOf(sim, NOW + 40), there);
});

test("between two steps the place is interpolated, so the plane moves smoothly at any frame rate", () => {
  const sim = new PlaneSim(plans[2]);
  let last = poseOf(sim, NOW + 120);
  let biggest = 0;
  for (let t = NOW + 120; t < NOW + 125; t += 1 / 120) {
    const p = poseOf(sim, t);
    biggest = Math.max(biggest, Math.hypot(p.x - last.x, p.z - last.z));
    last = p;
  }
  // 120 fps and at most 27 m/s: never more than a frame's travel (plus a little).
  assert.ok(biggest <= (27 / 120) * 1.2, `a jump of ${biggest} m`);
});

test("a flight begins and ends out of sight: at the change of flights the plane is far past the edge of the sea", () => {
  for (const plan of plans) {
    for (let k = 1; k <= 6; k++) {
      const boundary = cycleOf(plan, NOW).start + k * plan.period;
      const before = poseOf(new PlaneSim(plan), boundary - 0.2);
      const after = poseOf(new PlaneSim(plan), boundary + 0.2);
      // No boat is farther than SEA_BOUND (1500) from the middle, and none sees farther than a few hundred metres.
      assert.ok(
        dist(before) > 2000,
        `plane ${plan.index} flight ${k} ends ${dist(before).toFixed(0)} m out`,
      );
      assert.ok(
        dist(after) > 2200,
        `plane ${plan.index} flight ${k} begins ${dist(after).toFixed(0)} m out`,
      );
    }
  }
});

test("mid-flight each plane stays over its home, and turns at random: many headings, both sides", () => {
  for (const plan of plans) {
    const sim = new PlaneSim(plan);
    const { start } = cycleOf(plan, NOW);
    const headings = new Set();
    let rights = 0;
    let lefts = 0;
    // Skip the way in from the ring (a far home takes about 170 s) and stop when it starts to leave.
    for (let t = start + 260; t < start + plan.period - LEAVE; t += 0.5) {
      const p = poseOf(sim, t);
      const away = Math.hypot(p.x - plan.home.x, p.z - plan.home.z);
      assert.ok(
        away < FLIGHT.roam * 1.7,
        `plane ${plan.index} strayed ${away.toFixed(0)} m from its home at ${t - start} s`,
      );
      headings.add(Math.round(p.heading * 3));
      if (sim.cur.rate > 0.05) rights++;
      if (sim.cur.rate < -0.05) lefts++;
    }
    assert.ok(
      headings.size >= 6,
      `plane ${plan.index}: ${headings.size} headings`,
    );
    assert.ok(
      rights > 20 && lefts > 20,
      `plane ${plan.index}: rights ${rights}, lefts ${lefts}`,
    );
  }
});

test("planes are given homes where players are: the harbour has the most, the rest are islands", () => {
  const places = homes();
  assert.deepEqual(places[0], { x: HARBOR.x, z: HARBOR.z });
  for (const place of places.slice(1))
    assert.ok(
      SHORE_ISLANDS.some((i) => i.x === place.x && i.z === place.z),
      "a home is an island",
    );
  const count = (home) =>
    plans.filter((p) => p.home.x === home.x && p.home.z === home.z).length;
  assert.equal(count(places[0]), 3, "three planes over the harbour");
  assert.ok(
    places.every((p) => count(p) >= 1),
    "every home has a plane",
  );
  // The islands nearest the harbour come first and get the extra planes.
  const d = (p) => Math.hypot(p.x - HARBOR.x, p.z - HARBOR.z);
  for (let i = 2; i < places.length; i++)
    assert.ok(d(places[i]) >= d(places[i - 1]) - 1e-9);
  assert.ok(count(places[1]) >= 2 && count(places[2]) >= 2);
});

test("a player at the harbour or at a near island has a plane in sight almost all of the time", () => {
  // Counted over two hours of the shared clock, every 5 s: a plane within the range a phone draws (450 m).
  const sims = plans.map((plan) => new PlaneSim(plan));
  const spots = [HARBOR, ...homes().slice(1, 3)];
  const near = spots.map(() => 0);
  const close = spots.map(() => 0);
  let samples = 0;
  for (let t = NOW; t < NOW + 7200; t += 5) {
    const here = sims.map((sim) => ({ ...poseOf(sim, t) }));
    spots.forEach((spot, i) => {
      const nearest = Math.min(
        ...here.map((p) => Math.hypot(p.x - spot.x, p.z - spot.z)),
      );
      if (nearest < 450) near[i]++;
      if (nearest < 200) close[i]++;
    });
    samples++;
  }
  spots.forEach((_, i) => {
    assert.ok(near[i] / samples > 0.9, `${i}: in 450 m ${near[i] / samples}`);
    assert.ok(close[i] / samples > 0.3, `${i}: in 200 m ${close[i] / samples}`);
  });
});

test("different planes fly different ways, and the same plane flies a different flight next time", () => {
  const where = (plan, shared) => poseOf(new PlaneSim(plan), shared);
  const a = where(plans[0], NOW);
  const b = where(plans[1], NOW);
  assert.notDeepEqual(a, b);
  const plan = plans[0];
  const { start } = cycleOf(plan, NOW);
  const first = where(plan, start + 300);
  const next = where(plan, start + plan.period + 300);
  assert.notDeepEqual(first, next);
});

test("the banner's path is there for the plane being looked at", () => {
  const sim = new PlaneSim(plans[4]);
  const { start } = cycleOf(plans[4], NOW);
  poseOf(sim, start + 300);
  const p = sim.pose(start + 300, {});
  sim.trail.follow(p.x, p.altitude, p.z);
  const behind = sim.trail.behind(30, { x: 0, y: 0, z: 0 });
  // 30 m back along the path is about 30 m away (the path may curve), and is the sea's height, not a stray point.
  const d = Math.hypot(behind.x - p.x, behind.y - p.altitude, behind.z - p.z);
  assert.ok(d > 20 && d <= 30 + 1e-6, `${d} m`);
  assert.ok(STEP <= FLIGHT.maxStep);
});

test("the banner's rope never folds forward: the path starts behind the plane at every moment between two steps", () => {
  const plan = plans[5];
  const sim = new PlaneSim(plan);
  const { start } = cycleOf(plan, NOW);
  const spot = { x: 0, y: 0, z: 0 };
  for (let t = start + 300; t < start + 330; t += 0.05) {
    sim.advance(t);
    const p = sim.pose(t, {});
    sim.trail.follow(p.x, p.altitude, p.z);
    // The plane flies toward (sin h, -cos h): a point on the path just behind it lies against that.
    const ahead = { x: Math.sin(p.heading), z: -Math.cos(p.heading) };
    for (const d of [0.5, 3, 10]) {
      sim.trail.behind(d, spot);
      const along = (spot.x - p.x) * ahead.x + (spot.z - p.z) * ahead.z;
      assert.ok(
        along < 0,
        `${d} m back is ${along.toFixed(2)} m ahead at ${(t - start).toFixed(2)} s`,
      );
    }
  }
});
