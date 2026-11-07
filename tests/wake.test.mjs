import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WAKE_MAX,
  WAKE_MIN_SPEED,
  WAKE_SPREAD,
  WakeField,
  glslWake,
} from "../src/ocean/wake.ts";

// A boat sails north (-Z) at `speed` from z = 0 and the field follows it every frame.
const sail = (speed, seconds, field = new WakeField(), id = "me") => {
  const frame = 1 / 30;
  let t = 0;
  let z = 0;
  field.track(id, 0, z, t);
  for (; t < seconds; ) {
    t += frame;
    z -= speed * frame;
    field.track(id, 0, z, t);
  }
  return { field, t, z };
};
const rings = (field) =>
  field.data.filter((_, i) => i % 4 === 3).filter((s) => s > 0).length;

test("a moving boat drops rings along its path; a slow or stopped one does not", () => {
  assert.ok(
    rings(sail(12, 3).field) >= 12,
    "a fast boat leaves a line of rings",
  );
  assert.equal(rings(sail(0, 3).field), 0, "a boat at rest leaves nothing");
  assert.equal(
    rings(sail(WAKE_MIN_SPEED - 0.5, 3).field),
    0,
    "too slow for a wake",
  );
  // The strength grows with speed.
  const strength = (speed) =>
    Math.max(...sail(speed, 2).field.data.filter((_, i) => i % 4 === 3));
  assert.ok(strength(12) > strength(4), "faster, stronger");
  assert.ok(strength(12) <= 1);
});

test("a jump (a boat that appears far away) is not speed and leaves no ring", () => {
  const field = new WakeField();
  field.track("far", 0, 0, 0);
  field.track("far", 500, 500, 1);
  assert.equal(rings(field), 0);
});

test("rings never pile past the field size, and forgetting a boat restarts its track", () => {
  const field = new WakeField();
  sail(12, 40, field);
  assert.ok(rings(field) <= WAKE_MAX);
  field.forget("me");
  assert.equal(
    field.track("me", 5, 5, 100),
    0,
    "the first sight of a boat has no speed",
  );
});

test("the wake makes a V behind the boat: strong on its edges, still ahead and under the hull", () => {
  const { field, t, z } = sail(12, 3);
  // The half angle of a wake from a boat at speed v is asin(spread / v).
  const half = Math.asin(WAKE_SPREAD / 12);
  const edge = (lateral) => {
    // Along the V's edge, behind the boat where the rings from a moment ago meet.
    const behind = lateral / Math.tan(half);
    let best = 0;
    for (let dz = -1.5; dz <= 1.5; dz += 0.1)
      for (let dx = -1; dx <= 1; dx += 0.25)
        best = Math.max(
          best,
          Math.abs(field.sample(lateral + dx, z + behind + dz, t).height),
        );
    return best;
  };
  const outside = (lateral) => {
    let best = 0;
    for (let dz = -1.5; dz <= 1.5; dz += 0.25)
      best = Math.max(
        best,
        Math.abs(
          field.sample(lateral * 2.6, z + lateral / Math.tan(half) + dz, t)
            .height,
        ),
      );
    return best;
  };
  assert.ok(
    edge(3) > 0.03,
    `a visible ridge on the V: ${edge(3).toFixed(3)} m`,
  );
  assert.ok(
    edge(3) > 3 * outside(3),
    `the V is strong on its edge (${edge(3).toFixed(3)}) and calm well outside it (${outside(3).toFixed(3)})`,
  );
  // Nothing ahead of the boat, and the water under the hull is not displaced.
  assert.ok(
    Math.abs(field.sample(0, z - 25, t).height) < 1e-9,
    "calm water ahead",
  );
  assert.ok(
    Math.abs(field.sample(0, z, t).height) < 0.06,
    "the hull floats on the surface it sees",
  );
});

test("a slow boat has a wider V than a fast one", () => {
  const spread = (speed) => Math.asin(Math.min(1, WAKE_SPREAD / speed));
  assert.ok(spread(6) > spread(12) * 1.6);
});

test("a ring fades out, and its slope matches a finite difference of its height", () => {
  const field = new WakeField();
  field.emit(0, 0, 0, 1);
  const at = (t) => {
    let best = 0;
    for (let d = 0; d < 30; d += 0.1)
      best = Math.max(best, Math.abs(field.sample(d, 0, t).height));
    return best;
  };
  assert.ok(at(1.5) > at(3.5), "weaker with time");
  assert.equal(at(5), 0, "gone after its life");
  // Slope against a central difference, away from the ring's centre.
  const e = 1e-4;
  for (const [x, z, t] of [
    [5, 1, 1.5],
    [7, -2, 2],
    [3, 3, 1.2],
    [9, 0.5, 2.4],
  ]) {
    const g = field.sample(x, z, t);
    const gx =
      (field.sample(x + e, z, t).height - field.sample(x - e, z, t).height) /
      (2 * e);
    const gz =
      (field.sample(x, z + e, t).height - field.sample(x, z - e, t).height) /
      (2 * e);
    assert.ok(
      Math.abs(g.gx - gx) < 2e-3 && Math.abs(g.gz - gz) < 2e-3,
      `slope at ${x},${z}`,
    );
  }
});

test("the shader sum is built from the same constants", () => {
  const glsl = glslWake();
  assert.match(glsl, /vec4 wakeAt\(vec2 p, float t\)/);
  assert.match(glsl, new RegExp(`const int WAKE_MAX = ${WAKE_MAX};`));
  assert.match(glsl, /uniform vec4 wake\[WAKE_MAX\]/);
});
