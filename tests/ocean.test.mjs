import { test } from "node:test";
import assert from "node:assert/strict";
import {
  move,
  spawn,
  SEA_BOUND,
  islands,
  readBoat,
} from "../src/ocean/model.ts";

test("boats have stable per-account spawns, steer, stop while fishing, and stay inside the sea", () => {
  assert.deepEqual(spawn("minh"), spawn("minh"));
  for (let i = 0; i < 1000; i++)
    assert.ok(Math.abs(spawn(`account-${i}`).heading) <= Math.PI);
  assert.notDeepEqual(spawn("minh"), spawn("lan"));
  const pose = { x: 0, z: 0, heading: 0, fishing: false };
  assert.ok(move(pose, 0, 1, 0.05).z < 0);
  assert.ok(move(pose, 1, 0, 0.05).heading > 0);
  const fishing = { ...pose, fishing: true };
  assert.equal(move(fishing, 1, 1, 0.05), fishing);
  assert.equal(
    move({ ...pose, x: SEA_BOUND, heading: Math.PI / 2 }, 0, 1, 0.05).x,
    SEA_BOUND,
  );
  assert.deepEqual(
    move(pose, 0, 1, 5),
    move(pose, 0, 1, 0.05),
    "lag does not teleport boats",
  );
  const island = islands[0];
  const near = { ...pose, x: island.x, z: island.z + island.radius + 3.01 };
  assert.equal(move(near, 0, 1, 0.05).z, near.z, "hull cannot enter land");
});
test("malformed remote boats are discarded rather than passed to the renderer", () => {
  const data = {
    name: "<img src=x>",
    session: "session",
    x: 0,
    z: 1,
    heading: 0,
    fishing: false,
    updatedAt: { toMillis: () => 123 },
  };
  assert.equal(readBoat("minh", data).updatedAt, 123);
  for (const invalid of [
    { x: NaN },
    { z: Infinity },
    { x: 181 },
    { heading: 12 },
    { name: "x".repeat(25) },
    { fishing: 1 },
    { updatedAt: 0 },
  ])
    assert.equal(readBoat("minh", { ...data, ...invalid }), null);
});

test("stick maps one drag to analog steering and throttle together", async () => {
  const { stickInput, stickKnob, STICK_DEADZONE } = await import(
    "../src/ocean/stick.ts"
  );
  const radius = 44;
  assert.deepEqual(stickInput(0, 0, radius), { steer: 0, throttle: 0 });
  // Inside the dead zone nothing moves, so a resting thumb does not drift the boat.
  const tiny = radius * STICK_DEADZONE * 0.9;
  assert.deepEqual(stickInput(tiny, -tiny, radius), { steer: 0, throttle: 0 });
  // Up is forward, down is reverse, right is a right turn.
  assert.equal(stickInput(0, -radius, radius).throttle, 1);
  assert.equal(stickInput(0, radius, radius).throttle, -1);
  assert.equal(stickInput(radius, 0, radius).steer, 1);
  assert.equal(stickInput(-radius, 0, radius).steer, -1);
  // Diagonal drag runs and turns at once: the whole point of the stick.
  const diagonal = stickInput(radius * 0.6, -radius * 0.7, radius);
  assert.ok(diagonal.steer > 0 && diagonal.throttle > 0);
  // Farther is stronger, and beyond the ring saturates instead of overshooting.
  assert.ok(
    stickInput(0, -radius * 0.8, radius).throttle >
      stickInput(0, -radius * 0.4, radius).throttle,
  );
  const far = stickInput(radius * 9, -radius * 9, radius);
  assert.ok(Math.abs(far.steer) <= 1 && Math.abs(far.throttle) <= 1);
  const knob = stickKnob(radius * 9, -radius * 9, radius);
  assert.ok(Math.hypot(knob.x, knob.y) <= radius + 1e-9);
  // Garbage input is inert.
  assert.deepEqual(stickInput(NaN, 5, radius), { steer: 0, throttle: 0 });
  assert.deepEqual(stickInput(5, 5, 0), { steer: 0, throttle: 0 });
  // The analog values drive the real movement model without special cases.
  const pose = { x: 0, z: 0, heading: 0, fishing: false };
  const moved = move(pose, diagonal.steer, diagonal.throttle, 0.05);
  assert.ok(moved.z < 0 && moved.heading > 0, "forward while turning right");
});
