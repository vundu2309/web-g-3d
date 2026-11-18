import assert from "node:assert/strict";
import test from "node:test";
import {
  FISH_PER_SCHOOL,
  OFFSHORE,
  SCARE_RANGE,
  SCHOOLS,
  scatterTarget,
  schoolPoses,
  schoolShore,
} from "../src/ocean/fish-school-plan.ts";
import { seabedDepth } from "../src/ocean/shore.ts";
import { underwaterCapable } from "../src/ocean/clear-water.ts";

test("every island has schools of small fish, the same on every run", () => {
  assert.ok(SCHOOLS.length >= 8 * 2);
  assert.ok(SCHOOLS.every((s) => s.fish.length === FISH_PER_SCHOOL));
  assert.ok(
    SCHOOLS.some((s) => s.look === 0) && SCHOOLS.some((s) => s.look === 1),
  );
});

test("schools swim in open water off the coast, never on the sand, over minutes", () => {
  for (const school of SCHOOLS)
    for (let t = 0; t < 1200; t += 20) {
      const d = schoolShore(school, t);
      assert.ok(
        d > OFFSHORE.min - 6 && d < OFFSHORE.max + 8,
        `school off island ${school.island} at ${t}s is ${d.toFixed(1)} m from the coast`,
      );
    }
});

test("fish stay under the water and above the floor, and swim at a gentle pace", () => {
  const a = [];
  const b = [];
  const push = { x: 0, z: 0 };
  for (const school of SCHOOLS.slice(0, 12)) {
    for (let t = 0; t < 300; t += 7) {
      schoolPoses(school, t, push, a);
      schoolPoses(school, t + 1, push, b);
      const d = schoolShore(school, t);
      a.forEach((p, i) => {
        assert.ok(p.y <= -0.04 && p.y >= -2.5, `depth ${p.y}`);
        assert.ok(-p.y <= seabedDepth(d) + 1.2, "above the floor");
        const speed = Math.hypot(b[i].x - p.x, b[i].z - p.z);
        assert.ok(
          speed < 3.2,
          `a fish moved ${speed.toFixed(2)} m in a second`,
        );
      });
    }
  }
});

test("a boat scares a school away and a far boat does not", () => {
  const school = SCHOOLS[0];
  const near = scatterTarget(school, 10, [], { x: 0, z: 0 });
  assert.equal(near.x, 0);
  const boat = { x: 0, z: 0 };
  // Put the boat 5 m from the school's middle.
  const poses = schoolPoses(school, 10, { x: 0, z: 0 }, []);
  const c = {
    x: poses.reduce((s, p) => s + p.x, 0) / poses.length,
    z: poses.reduce((s, p) => s + p.z, 0) / poses.length,
  };
  boat.x = c.x + 5;
  boat.z = c.z;
  const push = scatterTarget(school, 10, [boat], { x: 0, z: 0 });
  assert.ok(Math.hypot(push.x, push.z) > SCARE_RANGE * 0.4, "pushed");
  assert.ok(push.x < 0, "away from the boat");
  boat.x = c.x + SCARE_RANGE + 30;
  assert.equal(scatterTarget(school, 10, [boat], { x: 0, z: 0 }).x, 0);
});

test("the fish are drawn on the clear-water layer", () => {
  assert.ok(underwaterCapable("school-fish-3-7"));
});
