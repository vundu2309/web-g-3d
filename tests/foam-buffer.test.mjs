import assert from "node:assert/strict";
import test from "node:test";

const {
  FOAM_LIFE,
  FOAM_MAX,
  FOAM_SIZE,
  FOAM_STEP,
  FOAM_TEXEL,
  FOAM_WINDOW,
  PUFF,
  armKeep,
  armRadius,
  armStrength,
  bowStrength,
  foamPuffs,
  foamSpeed,
  foamWindow,
  hash01,
  washRadius,
  washStrength,
} = await import("../src/ocean/foam-buffer.ts");
const { WakeTrail } = await import("../src/ocean/wake-trail.ts");

// The white water behind a boat is a buffer of round puffs (foam-buffer.ts) that the sea's shader
// turns into bubbles; these tests pin the puffs themselves.

/** A boat sailing straight at `speed` m/s along heading `heading` from (x, z), seen for `seconds`. */
function sail({ x = 0, z = 0, heading = 0, speed = 10, seconds = 6 } = {}) {
  const trail = new WakeTrail(FOAM_LIFE, FOAM_STEP);
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  for (let t = 0; t <= seconds + 1e-9; t += 0.05)
    trail.push(x + fx * speed * t, z + fz * speed * t, t);
  return { trail, now: seconds };
}
const puffsOf = (trails, now, cx = 0, cz = 0, reach = 400) => {
  const out = new Float32Array(FOAM_MAX * PUFF);
  const n = foamPuffs(trails, now, cx, cz, reach, out);
  return Array.from({ length: n }, (_, i) => ({
    x: out[i * PUFF],
    z: out[i * PUFF + 1],
    radius: out[i * PUFF + 2],
    strength: out[i * PUFF + 3],
    seed: out[i * PUFF + 4],
  }));
};

test("the texture's window is a whole number of texels and follows the camera in texel steps", () => {
  assert.equal(FOAM_TEXEL * FOAM_SIZE, FOAM_WINDOW);
  for (const [x, z] of [
    [0, 0],
    [123.456, -987.654],
    [-0.1, 0.1],
  ]) {
    const w = foamWindow(x, z);
    assert.ok(
      Math.abs(w.cx / FOAM_TEXEL - Math.round(w.cx / FOAM_TEXEL)) < 1e-9,
    );
    assert.ok(
      Math.abs(w.cz / FOAM_TEXEL - Math.round(w.cz / FOAM_TEXEL)) < 1e-9,
    );
    assert.ok(Math.abs(w.cx - x) <= FOAM_TEXEL / 2 + 1e-9);
    assert.equal(w.size, FOAM_WINDOW);
  }
  // A camera that moves less than a texel does not move the window (no shimmer).
  assert.equal(
    foamWindow(10.0, 5.0).cx,
    foamWindow(10.0 + FOAM_TEXEL * 0.2, 5.0).cx,
  );
});

test("a boat that lies still or crawls leaves no foam, a fast one leaves the most", () => {
  assert.equal(foamSpeed(0), 0);
  assert.equal(foamSpeed(1.4), 0);
  assert.ok(foamSpeed(5) > 0 && foamSpeed(5) < foamSpeed(8));
  assert.equal(foamSpeed(20), 1);
  const still = sail({ speed: 0 });
  assert.equal(puffsOf([still.trail], still.now).length, 0);
  const slow = puffsOf([sail({ speed: 3 }).trail], 6);
  const fast = puffsOf([sail({ speed: 10 }).trail], 6);
  const total = (list) =>
    list.reduce((sum, p) => sum + p.strength * p.radius * p.radius, 0);
  assert.ok(
    total(fast) > total(slow) * 1.5,
    `${total(fast)} vs ${total(slow)}`,
  );
});

test("the wash is strong and narrow at the stern, wider and fainter as it ages, and gone after its life", () => {
  assert.ok(washRadius(0) < washRadius(4) && washRadius(4) < washRadius(10));
  assert.ok(washRadius(0) > 0.5 && washRadius(FOAM_LIFE) < 8, "no huge discs");
  for (let a = 0; a < FOAM_LIFE; a += 0.5)
    assert.ok(
      washStrength(a + 0.5, 1) <= washStrength(a, 1) + 1e-9,
      `fades at ${a}`,
    );
  assert.ok(washStrength(0, 1) > 0.8);
  assert.equal(washStrength(FOAM_LIFE, 1), 0);
  assert.equal(washStrength(1, 0), 0, "no speed, no wash");
  // The arms fade sooner than the wash, and the bow burst only lives a moment.
  assert.ok(armStrength(6, 1) < washStrength(6, 1));
  assert.ok(armRadius(2) < washRadius(2));
  assert.ok(bowStrength(0, 1) > 0.5);
  assert.equal(bowStrength(2, 1), 0);
  assert.ok(
    bowStrength(0, 1) > bowStrength(0, 0.5),
    "a faster boat throws more at the bow",
  );
});

test("a hard turn drops the arms, as they would only cross themselves", () => {
  assert.equal(armKeep(0), 1);
  assert.equal(armKeep(0.3), 1);
  assert.ok(armKeep(0.8) > 0 && armKeep(0.8) < 1);
  assert.equal(armKeep(2), 0);
  assert.equal(armKeep(-2), 0);
});

test("a straight wake lies behind the boat, widens with its age and ends in nothing", () => {
  // Heading 0 is -Z: the boat sails to -Z, so its wake lies at larger z.
  const run = sail({ speed: 10, seconds: 8 });
  const puffs = puffsOf([run.trail], run.now);
  assert.ok(puffs.length > 20);
  const bowZ = -10 * 8;
  const behind = puffs.filter((p) => p.z > bowZ + 4);
  assert.ok(behind.length > puffs.length * 0.7, "the foam is mostly astern");
  for (const p of puffs) {
    assert.ok(p.strength >= 0.01 && p.strength <= 1);
    assert.ok(p.radius > 0.3 && p.radius < 10);
    assert.ok(p.seed >= 0 && p.seed < 1);
    assert.ok(Number.isFinite(p.x + p.z));
  }
  // Farther astern is wider (it is older) and fainter.
  const near = puffs.filter((p) => p.z > bowZ + 5 && p.z < bowZ + 30);
  const far = puffs.filter((p) => p.z > bowZ + 70);
  const mean = (list, key) =>
    list.reduce((s, p) => s + p[key], 0) / list.length;
  assert.ok(near.length && far.length);
  assert.ok(mean(far, "radius") > mean(near, "radius"), "wider with age");
  assert.ok(mean(far, "strength") < mean(near, "strength"), "fainter with age");
  // The wash is spread across the width, not a line: a spread of x at one distance.
  const slice = puffs.filter((p) => Math.abs(p.z - (bowZ + 40)) < 6);
  const xs = slice.map((p) => p.x);
  assert.ok(
    Math.max(...xs) - Math.min(...xs) > 1.5,
    "foam is wider than a line",
  );
  // Nothing is left after the boat is gone for FOAM_LIFE seconds.
  assert.equal(puffsOf([run.trail], run.now + FOAM_LIFE + 1).length, 0);
});

test("the arms leave the stem and spread out to both sides at the Kelvin slope", () => {
  const run = sail({ speed: 10, seconds: 6 });
  // Arm puffs are the ones ahead of the wash and well off the keel: compare old with fresh.
  const puffs = puffsOf([run.trail], run.now);
  const left = puffs.filter((p) => p.x < -3);
  const right = puffs.filter((p) => p.x > 3);
  assert.ok(left.length > 3 && right.length > 3, "an arm each side");
  assert.ok(Math.abs(left.length - right.length) <= 2, "the sides are even");
  // The farther astern, the farther out: the V opens up.
  const out = (list, zmin, zmax) => {
    const sel = list.filter((p) => p.z > zmin && p.z < zmax);
    return sel.length ? Math.max(...sel.map((p) => Math.abs(p.x))) : 0;
  };
  // The boat ends at z = -60 (it sails to -Z): the older foam lies farther astern, at larger z.
  assert.ok(out(right, -60, -40) < out(right, -30, -5), "the V widens");
});

test("a turning boat leaves a curved wash, with no arms in the hardest part of the turn", () => {
  const trail = new WakeTrail(FOAM_LIFE, FOAM_STEP);
  const turn = 1.4; // rad/s: a hard turn (past where the arms would only cross themselves)
  let x = 0;
  let z = 0;
  let heading = 0;
  for (let t = 0; t <= 6; t += 0.05) {
    heading += turn * 0.05;
    x += Math.sin(heading) * 10 * 0.05;
    z -= Math.cos(heading) * 10 * 0.05;
    trail.push(x, z, t);
  }
  const puffs = puffsOf([trail], 6);
  assert.ok(puffs.length > 10);
  // Straight and turning boats cover different ground: the turning wake is not a line along -Z.
  const xs = puffs.map((p) => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 20, "the wash bends away");
  // And fewer puffs are arm puffs: count those that sit well ahead of the stern of their sample.
  const straight = puffsOf([sail({ speed: 10, seconds: 6 }).trail], 6);
  assert.ok(puffs.length < straight.length, "no arms while turning hard");
});

test("two wakes that cross add up: the puffs of both are kept", () => {
  const a = sail({ x: -50, z: 0, heading: Math.PI / 2, speed: 8, seconds: 6 });
  const b = sail({ x: 0, z: 50, heading: 0, speed: 8, seconds: 6 });
  const both = puffsOf([a.trail, b.trail], 6);
  assert.equal(
    both.length,
    puffsOf([a.trail], 6).length + puffsOf([b.trail], 6).length,
  );
});

test("only the puffs inside the window are kept, and no more than the buffer holds", () => {
  const run = sail({ speed: 10, seconds: 8 });
  const everything = puffsOf([run.trail], 8, 0, 0, 1000);
  const small = puffsOf([run.trail], 8, 0, 0, 30);
  assert.ok(small.length < everything.length);
  assert.ok(
    small.every(
      (p) => Math.abs(p.x) <= 30 + p.radius && Math.abs(p.z) <= 30 + p.radius,
    ),
  );
  // A busy sea fills the buffer to the brim and no further.
  const crowd = Array.from(
    { length: 80 },
    (_, i) => sail({ x: i * 3, speed: 9, seconds: 11 }).trail,
  );
  const out = new Float32Array(FOAM_MAX * PUFF);
  assert.equal(foamPuffs(crowd, 11, 0, 0, 1000, out), FOAM_MAX);
});

test("the scatter is a pure function: the same puffs every frame", () => {
  const run = sail({ speed: 10, seconds: 6 });
  assert.deepEqual(puffsOf([run.trail], 6), puffsOf([run.trail], 6));
  assert.equal(hash01(3.25), hash01(3.25));
  assert.notEqual(hash01(1), hash01(2));
  for (let i = 0; i < 200; i++) {
    const h = hash01(i * 0.37);
    assert.ok(h >= 0 && h < 1);
  }
});
