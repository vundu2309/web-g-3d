import { test } from "node:test";
import assert from "node:assert/strict";
import { ORBIT, OrbitCamera } from "../src/ocean/orbit-camera.ts";

test("dragging turns the view around the boat and tips it, within limits", () => {
  const camera = new OrbitCamera();
  camera.drag(100, 0);
  assert.ok(camera.yaw > 0.5, `dragging right swings it right (${camera.yaw})`);
  camera.drag(-200, 0);
  assert.ok(camera.yaw < 0, "dragging left turns it the other way");
  // A long drag goes all the way round without growing without bound.
  for (let i = 0; i < 200; i++) camera.drag(50, 0);
  assert.ok(Math.abs(camera.yaw) <= Math.PI + 1e-9, "yaw stays within a turn");
  camera.drag(0, 10000);
  assert.equal(camera.pitch, ORBIT.pitchMax);
  camera.drag(0, -10000);
  assert.equal(camera.pitch, ORBIT.pitchMin);
});

test("the view stays while the boat sits still or a finger is down", () => {
  const camera = new OrbitCamera();
  camera.drag(120, 40);
  const before = [camera.yaw, camera.pitch];
  for (let i = 0; i < 300; i++) camera.step(1 / 60, 0);
  assert.deepEqual([camera.yaw, camera.pitch], before, "nothing moves at rest");
  camera.hold(true);
  for (let i = 0; i < 300; i++) camera.step(1 / 60, 8);
  assert.deepEqual([camera.yaw, camera.pitch], before, "held means held");
});

test("once the boat moves the view drifts slowly back to the default", () => {
  const camera = new OrbitCamera();
  camera.drag(300, 80);
  const start = Math.abs(camera.yaw);
  camera.step(1, 6);
  const afterOne = Math.abs(camera.yaw);
  assert.ok(
    afterOne < start && afterOne > start * 0.3,
    "it eases, it does not snap",
  );
  for (let i = 0; i < 60 * 12; i++) camera.step(1 / 60, 6);
  assert.equal(camera.yaw, 0);
  assert.equal(camera.pitch, 0);
  assert.equal(camera.away, false);
});
