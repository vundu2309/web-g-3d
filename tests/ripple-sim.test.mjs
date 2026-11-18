import assert from "node:assert/strict";
import test from "node:test";
import {
  RippleSim,
  SIM_C,
  SIM_CELL,
  SIM_N,
  SIM_SIZE,
  glslSim,
  hullSpeed,
  simMask,
} from "../src/ocean/ripple-sim.ts";

/** A boat sailing east (+X) at `speed` for `seconds`, as the game steps it. */
function sail(speed, seconds, sim = new RippleSim()) {
  let x = 0;
  sim.recentre(0, 0);
  for (let f = 0; f < seconds * 60; f++) {
    x += speed / 60;
    sim.recentre(x, 0);
    sim.step(1 / 60, [{ x, z: 0, heading: Math.PI / 2, speed }]);
  }
  return { sim, x };
}

test("a boat at rest or crawling stirs nothing", () => {
  const sim = new RippleSim();
  sim.recentre(0, 0);
  for (let f = 0; f < 120; f++)
    sim.step(1 / 60, [{ x: 0, z: 0, heading: 0, speed: 0.5 }]);
  assert.ok(sim.h.every((v) => v === 0));
  assert.ok(sim.foam.every((v) => v === 0));
  assert.equal(hullSpeed(0), 0);
  assert.equal(hullSpeed(20), 1);
});

test("a moving hull raises the water ahead and leaves white water behind", () => {
  const { sim, x } = sail(9, 8);
  let max = 0;
  let min = 0;
  for (let i = 0; i < sim.h.length; i++) {
    max = Math.max(max, sim.h[i]);
    min = Math.min(min, sim.h[i]);
  }
  assert.ok(max > 0.08 && max < 0.4, `crest ${max.toFixed(3)} m`);
  assert.ok(min < -0.05, `trough ${min.toFixed(3)} m`);
  const stern = sim.sample(x - 6, 0);
  assert.ok(stern.foam > 0.2, `churned water behind the stern: ${stern.foam}`);
  assert.ok(sim.sample(x + 12, 0).foam < 1e-6, "none ahead of the boat");
});

test("a boat faster than the waves leaves a V whose angle follows its speed", () => {
  // The Mach angle: asin(SIM_C / speed). The crest of the arm is where the wave energy of the
  // boat's path has gone sideways, so it sits on the cone, not at the centre line.
  for (const speed of [8, 11]) {
    const { sim, x } = sail(speed, 12);
    const back = 24;
    let best = 0;
    let bestZ = 0;
    for (let z = 0; z <= 25; z += 0.5) {
      const h = Math.abs(sim.sample(x - back, z).height);
      if (h > best) {
        best = h;
        bestZ = z;
      }
    }
    const expected = back * Math.tan(Math.asin(SIM_C / speed));
    assert.ok(
      Math.abs(bestZ - expected) < expected * 0.4 + 2,
      `${speed} m/s: arm at ${bestZ} m, cone at ${expected.toFixed(1)} m`,
    );
  }
});

test("the water is the same on both sides of the keel, and a wake is the sum of two boats'", () => {
  const { sim, x } = sail(9, 6);
  for (const dz of [2, 5, 9])
    assert.ok(
      Math.abs(sim.sample(x - 10, dz).height - sim.sample(x - 10, -dz).height) <
        1e-4,
      "mirror image",
    );
  const a = new RippleSim();
  const b = new RippleSim();
  const both = new RippleSim();
  for (const sim of [a, b, both]) sim.recentre(0, 0);
  const boatA = { x: -20, z: 0, heading: Math.PI / 2, speed: 8 };
  const boatB = { x: 0, z: -20, heading: 0, speed: 8 };
  for (let f = 0; f < 120; f++) {
    for (const hull of [boatA, boatB]) {
      hull.x += hull.heading ? 8 / 60 : 0;
      hull.z -= hull.heading ? 0 : 8 / 60;
    }
    a.step(1 / 60, [boatA]);
    b.step(1 / 60, [boatB]);
    both.step(1 / 60, [boatA, boatB]);
  }
  for (let i = 0; i < both.h.length; i += 37)
    assert.ok(Math.abs(both.h[i] - a.h[i] - b.h[i]) < 1e-5, "waves add up");
});

test("a turning boat bends its wake: the white water lies where the boat went, not straight behind it", () => {
  const sim = new RippleSim();
  sim.recentre(0, 0);
  let heading = Math.PI / 2;
  let x = 0;
  let z = 0;
  const path = [];
  for (let f = 0; f < 60 * 8; f++) {
    heading -= 0.35 / 60;
    x += (Math.sin(heading) * 9) / 60;
    z += (-Math.cos(heading) * 9) / 60;
    path.push({ x, z, heading });
    sim.recentre(x, z);
    sim.step(1 / 60, [{ x, z, heading, speed: 9 }]);
  }
  const now = path[path.length - 1];
  const past = path[path.length - 1 - 60 * 3];
  const sternOf = (p) => ({
    x: p.x - Math.sin(p.heading) * 2.8,
    z: p.z + Math.cos(p.heading) * 2.8,
  });
  const where = sternOf(past);
  // The straight line back from the boat now, as far as the boat has sailed in those 3 s.
  const straight = {
    x: now.x - Math.sin(now.heading) * 27,
    z: now.z + Math.cos(now.heading) * 27,
  };
  assert.ok(sim.sample(where.x, where.z).foam > 0.15, "foam on the path");
  assert.ok(
    sim.sample(straight.x, straight.z).foam < 0.05,
    "none on the straight line",
  );
});

test("the water settles: waves fade, white water thins, nothing grows without bound", () => {
  const { sim } = sail(10, 6);
  for (let f = 0; f < 60 * 25; f++) sim.step(1 / 60, []);
  let max = 0;
  let foam = 0;
  for (let i = 0; i < sim.h.length; i++) {
    max = Math.max(max, Math.abs(sim.h[i]));
    foam = Math.max(foam, sim.foam[i]);
  }
  assert.ok(max < 0.01, `still ${max} m after 25 s`);
  assert.ok(foam < 0.02, `still ${foam} of foam after 25 s`);
});

test("a long frame is split and stays stable", () => {
  const sim = new RippleSim();
  sim.recentre(0, 0);
  for (let f = 0; f < 60; f++)
    sim.step(0.25, [{ x: 0, z: 0, heading: 0, speed: 10 }]);
  assert.ok(sim.h.every((v) => Number.isFinite(v) && Math.abs(v) < 2));
});

test("the window follows the camera: far from it nothing is read, and what comes in is clean", () => {
  const { sim, x } = sail(9, 4);
  assert.equal(sim.sample(x + SIM_SIZE, 0).height, 0, "outside the mask");
  assert.equal(simMask(0, 0), 1);
  assert.equal(simMask(SIM_SIZE / 2, 0), 0);
  // Jump far: everything is cleared, so no old wake reappears on the torus.
  sim.recentre(x + 5000, 3000);
  assert.ok(sim.h.every((v) => v === 0));
  // Move one cell at a time past the whole window: the old wake is gone, none wraps in.
  const other = sail(9, 3).sim;
  for (let k = 0; k < SIM_N + 4; k++) other.recentre(27 + k, 0);
  assert.ok(other.h.every((v) => Math.abs(v) < 0.4));
  assert.equal(other.sample(other.centreX - 70, 0).height, 0);
});

test("the shader reads the same grid, the same way", () => {
  const code = glslSim();
  assert.match(code, /uniform highp sampler2D simMap;/);
  assert.match(code, /vec4 simAt\(vec2 p\)/);
  assert.equal((code.match(/texture2D\(simMap,/g) ?? []).length, 4);
  assert.match(code, new RegExp(`/ ${SIM_N}\\.000000`));
  // pack: height, slope and foam per cell, and a slope that is the height's own difference.
  const { sim } = sail(9, 5);
  const out = new Float32Array(SIM_N * SIM_N * 4);
  sim.pack(out);
  const at = 40 * SIM_N + 60;
  assert.equal(out[at * 4], sim.h[at]);
  assert.equal(out[at * 4 + 3], sim.foam[at]);
  assert.ok(
    Math.abs(out[at * 4 + 1] - (sim.h[at + 1] - sim.h[at - 1]) / 2) < 1e-6,
  );
});
