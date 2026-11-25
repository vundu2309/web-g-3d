import assert from "node:assert/strict";
import test from "node:test";
import {
  FLIGHT,
  headingTo,
  leave,
  spawnFlight,
  stepFlight,
  wrap,
} from "../src/ocean/plane-flight.ts";

const centre = { x: 0, z: 0 };
const fly = (flight, seconds, dt = 0.1, each = () => {}) => {
  for (let t = 0; t < seconds; t += dt) {
    stepFlight(flight, dt, centre);
    each(flight, t);
  }
};
const dist = (f) => Math.hypot(f.x - centre.x, f.z - centre.z);

test("the same seed flies the same flight; another seed flies another", () => {
  const a = spawnFlight(7, centre);
  const b = spawnFlight(7, centre);
  const c = spawnFlight(8, centre);
  fly(a, 300);
  fly(b, 300);
  fly(c, 300);
  assert.deepEqual(a, b);
  assert.notEqual(a.x, c.x);
});

test("a flight begins on the ring far out at sea, heading in, at a cruise speed and a height inside the limits", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const f = spawnFlight(seed, centre);
    assert.ok(Math.abs(dist(f) - FLIGHT.ring) < 1e-6);
    assert.ok(f.speed >= FLIGHT.speed.min && f.speed <= FLIGHT.speed.max);
    assert.ok(
      f.altitude >= FLIGHT.altitude.min && f.altitude <= FLIGHT.altitude.max,
    );
    // Its heading points inward: within about 0.3 rad of the way to the middle.
    assert.ok(
      Math.abs(wrap(f.heading - headingTo(f, centre))) <= 0.31,
      `seed ${seed} heads ${f.heading}`,
    );
  }
});

test("the direction changes at random: many different headings, turns to both sides", () => {
  const f = spawnFlight(3, centre);
  fly(f, 200); // in over the ring first
  const headings = [];
  let rights = 0;
  let lefts = 0;
  fly(f, 600, 0.1, (flight, t) => {
    if (Math.round(t / 0.1) % 100 === 0) headings.push(flight.heading);
    if (flight.rate > 0.05) rights++;
    if (flight.rate < -0.05) lefts++;
  });
  const spread = new Set(headings.map((h) => Math.round(h * 4)));
  assert.ok(spread.size >= 8, `only ${spread.size} different headings`);
  assert.ok(rights > 100 && lefts > 100, `rights ${rights}, lefts ${lefts}`);
});

test("it never turns faster than the limit, never snaps, and leans into the turn", () => {
  const f = spawnFlight(11, centre);
  let before = f.heading;
  fly(f, 600, 0.1, (flight) => {
    assert.ok(Math.abs(flight.rate) <= FLIGHT.maxRate + 1e-9);
    assert.ok(
      Math.abs(wrap(flight.heading - before)) <= FLIGHT.maxRate * 0.1 + 1e-9,
    );
    assert.ok(Math.abs(flight.bank) <= FLIGHT.bankMax + 1e-9);
    if (Math.abs(flight.rate) > 0.2)
      assert.ok(
        Math.sign(flight.bank) === Math.sign(flight.rate) ||
          Math.abs(flight.bank) < 0.05,
        `bank ${flight.bank} against rate ${flight.rate}`,
      );
    before = flight.heading;
  });
});

test("it moves at its speed along its heading (0 flies to -Z, a positive turn is to the right)", () => {
  const f = spawnFlight(5, centre);
  f.x = 0;
  f.z = 0;
  f.heading = 0;
  f.targetHeading = 0;
  f.legLeft = 1e9;
  f.homing = false;
  stepFlight(f, 0.1, centre);
  assert.ok(f.z < 0 && Math.abs(f.x) < 1e-6);
  assert.ok(Math.abs(Math.hypot(f.x, f.z) - f.speed * 0.1) < 1e-6);
  f.heading = Math.PI / 2;
  f.targetHeading = Math.PI / 2;
  f.rate = 0;
  const before = { x: f.x, z: f.z };
  stepFlight(f, 0.1, centre);
  assert.ok(f.x > before.x, "heading pi/2 flies toward +X");
  assert.equal(headingTo({ x: 0, z: 0 }, { x: 0, z: -10 }), 0);
  assert.ok(
    Math.abs(headingTo({ x: 0, z: 0 }, { x: 10, z: 0 }) - Math.PI / 2) < 1e-9,
  );
});

test("the height stays inside the limits and changes smoothly", () => {
  const f = spawnFlight(2, centre);
  let before = f.altitude;
  let low = Infinity;
  let high = -Infinity;
  fly(f, 600, 0.1, (flight) => {
    assert.ok(Math.abs(flight.altitude - before) <= FLIGHT.climb * 0.1 + 1e-9);
    before = flight.altitude;
    low = Math.min(low, flight.altitude);
    high = Math.max(high, flight.altitude);
  });
  assert.ok(
    low >= FLIGHT.altitude.min - 1e-6 && high <= FLIGHT.altitude.max + 1e-6,
  );
  assert.ok(
    high - low > 15,
    "it climbs and sinks, it does not hold one height",
  );
});

test("it flies in from the ring and then stays over the sea: never far past the roam radius, over many seeds", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const f = spawnFlight(seed, centre);
    fly(f, 120); // the way in
    let farthest = 0;
    fly(f, 450, 0.1, (flight) => (farthest = Math.max(farthest, dist(flight))));
    assert.ok(
      farthest < FLIGHT.roam * 1.7,
      `seed ${seed} went ${farthest.toFixed(0)} m from the middle`,
    );
  }
});

test("a leaving plane flies out over the edge of the sea, to the ring and beyond, from anywhere inside", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const f = spawnFlight(seed, centre);
    fly(f, 100 + seed * 17); // somewhere over the sea, mid-leg
    leave(f);
    fly(f, 200);
    assert.ok(
      dist(f) > FLIGHT.ring - 300,
      `seed ${seed} was only ${dist(f).toFixed(0)} m out after 200 s`,
    );
  }
});

test("a long step is cut short, so a stall does not throw the plane across the sea", () => {
  const f = spawnFlight(9, centre);
  const { x, z } = f;
  stepFlight(f, 600, centre);
  assert.ok(Math.hypot(f.x - x, f.z - z) <= f.speed * FLIGHT.maxStep + 1e-6);
  stepFlight(f, -5, centre);
  assert.ok(Number.isFinite(f.x));
});
