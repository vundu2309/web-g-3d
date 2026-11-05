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
