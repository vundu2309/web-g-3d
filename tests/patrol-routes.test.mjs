import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PATROL_CLEARANCE,
  PATROL_ISLANDS,
  PATROL_NAME,
  PATROL_SPEED,
  PATROL_TIER,
  patrolBoats,
  patrolPose,
  patrolRoutes,
} from "../src/ocean/patrol-routes.ts";
import { seaObstacles } from "../src/ocean/market.ts";
import { SHIPYARDS } from "../src/ocean/shipyard.ts";
import { SEA_BOUND } from "../src/ocean/model.ts";
import {
  NPC_PREFIX,
  PATROL_PALETTE,
  PLAYER_PALETTES,
  boatPalettes,
  paletteIndex,
} from "../src/ocean/palette.ts";

// The patrol ships (patrol-routes.ts): boats nobody steers, each on a loop round one island, placed
// by the shared clock alone. What matters: they never touch an island, a pier or a yard, they move at
// their speed along their heading, and the same time gives the same place for everyone.
const routes = patrolRoutes();
const obstacles = [
  ...seaObstacles(),
  ...SHIPYARDS.map((yard) => ({ x: yard.x, z: yard.z, radius: 12 })),
];

test("one ship for each island listed, with its own id, never a player's palette", () => {
  assert.equal(routes.length, PATROL_ISLANDS.length);
  assert.deepEqual(
    routes.map((r) => r.island),
    [...PATROL_ISLANDS],
  );
  assert.equal(new Set(routes.map((r) => r.uid)).size, routes.length);
  for (const route of routes) {
    assert.ok(route.uid.startsWith(NPC_PREFIX), route.uid);
    assert.equal(paletteIndex(route.uid), PATROL_PALETTE);
  }
  // Players never get the patrol palette, whatever their account id.
  for (let i = 0; i < 500; i++) {
    const index = paletteIndex(`user-${i}-${(i * 7919).toString(36)}`);
    assert.ok(index >= 0 && index < PLAYER_PALETTES, `player palette ${index}`);
  }
  assert.equal(boatPalettes.length, PLAYER_PALETTES + 1);
});

test("a route keeps its clearance from every island, pier and yard, and from its own island's ring", () => {
  for (const route of routes) {
    const own = seaObstacles()[route.island];
    for (let s = 0; s < route.length; s += 5) {
      const at = patrolPose(
        route,
        (s - route.phase * route.length) / (route.speed * route.direction),
      );
      for (const [i, o] of obstacles.entries()) {
        const gap = Math.hypot(at.x - o.x, at.z - o.z) - o.radius;
        if (i === route.island)
          assert.ok(
            gap >= 69,
            `${route.uid}: ${gap.toFixed(1)} m from its own island`,
          );
        else
          assert.ok(
            gap >= PATROL_CLEARANCE - 1,
            `${route.uid}: ${gap.toFixed(1)} m from obstacle ${i} at ${at.x.toFixed(0)},${at.z.toFixed(0)}`,
          );
      }
      assert.ok(Math.abs(at.x) < SEA_BOUND && Math.abs(at.z) < SEA_BOUND);
    }
    assert.ok(own, "the island exists");
  }
});

test("the loop is closed and a lap takes length / speed seconds; the ship moves at its speed", () => {
  for (const route of routes) {
    const lap = route.length / route.speed;
    const a = patrolPose(route, 1234);
    const b = patrolPose(route, 1234 + lap);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01, `${route.uid} closes`);
    assert.ok(
      lap > 90 && lap < 600,
      `${route.uid} laps in ${lap.toFixed(0)} s`,
    );
    for (let t = 0; t < lap; t += 7) {
      const p = patrolPose(route, t);
      const q = patrolPose(route, t + 1);
      const speed = Math.hypot(q.x - p.x, q.z - p.z);
      // Chords of the polyline are a hair shorter than the arc.
      assert.ok(
        speed > route.speed * 0.9 && speed <= route.speed * 1.001,
        `${route.uid} at ${t}: ${speed.toFixed(2)} m/s`,
      );
    }
  }
  assert.equal(PATROL_SPEED, 6);
});

test("the heading is where the ship is going (0 toward -z, like every boat), and turns gently", () => {
  for (const route of routes) {
    let last;
    for (let t = 0; t < route.length / route.speed; t += 3) {
      const p = patrolPose(route, t);
      const q = patrolPose(route, t + 0.5);
      const going = Math.atan2(q.x - p.x, -(q.z - p.z));
      const off = Math.atan2(
        Math.sin(going - p.heading),
        Math.cos(going - p.heading),
      );
      assert.ok(
        Math.abs(off) < 0.15,
        `${route.uid} at ${t}: ${off.toFixed(2)} rad off`,
      );
      if (last !== undefined) {
        const turn = Math.atan2(
          Math.sin(p.heading - last),
          Math.cos(p.heading - last),
        );
        assert.ok(
          Math.abs(turn) < 0.5,
          `${route.uid} turns ${turn.toFixed(2)} rad in 3 s`,
        );
      }
      last = p.heading;
    }
  }
});

test("the same time gives the same ships for everyone, they move, and no two come within 30 m", () => {
  const ms = Date.UTC(2026, 10, 20, 12, 0, 0);
  const a = patrolBoats(ms);
  assert.deepEqual(a, patrolBoats(ms));
  assert.equal(a.length, routes.length);
  for (const boat of a) {
    assert.ok(boat.uid.startsWith(NPC_PREFIX));
    assert.equal(boat.name, PATROL_NAME);
    assert.ok(boat.name.length <= 24);
    assert.equal(boat.npc, true);
    assert.equal(boat.fishing, false);
    assert.equal(boat.tier, PATROL_TIER);
    assert.equal(boat.rod, 0);
    assert.equal(boat.updatedAt, ms);
    assert.ok(
      Number.isFinite(boat.x) &&
        Number.isFinite(boat.z) &&
        Math.abs(boat.heading) <= Math.PI,
    );
  }
  const later = patrolBoats(ms + 10_000);
  for (const [i, boat] of later.entries())
    assert.ok(
      Math.hypot(boat.x - a[i].x, boat.z - a[i].z) > PATROL_SPEED * 9,
      `${boat.uid} moved`,
    );
  let nearest = Infinity;
  for (let t = 0; t < 3 * 3600; t += 20) {
    const ships = patrolBoats(ms + t * 1000);
    for (let i = 0; i < ships.length; i++)
      for (let j = i + 1; j < ships.length; j++)
        nearest = Math.min(
          nearest,
          Math.hypot(ships[i].x - ships[j].x, ships[i].z - ships[j].z),
        );
  }
  assert.ok(
    nearest > 30,
    `ships come within ${nearest.toFixed(0)} m of each other`,
  );
});
