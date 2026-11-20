import assert from "node:assert/strict";
import test from "node:test";
import { poleOf, solveArm } from "../src/ocean/arm-ik.ts";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("the rest pose is reproduced: the target at the rest wrist gives the rest elbow", () => {
  const s = [0.12, 0.4, 0.3];
  const e = [0.2, 0.3, 0.42];
  const w = [0.27, 0.32, 0.55];
  const pole = poleOf(s, e, w);
  const got = solveArm(s, dist(s, e), dist(e, w), pole, w);
  assert.ok(dist(got.elbow, e) < 1e-9 && dist(got.wrist, w) < 1e-9);
});

test("the arm keeps its bone lengths and reaches a target within range, the elbow on the same side", () => {
  const s = [0, 0, 0];
  const upper = 0.15;
  const fore = 0.17;
  const pole = [0, -1, 0];
  for (const t of [
    [0.2, 0.0, 0.1],
    [0.1, 0.05, 0.2],
    [0.25, -0.05, 0.15],
  ]) {
    const { elbow, wrist } = solveArm(s, upper, fore, pole, t);
    assert.ok(Math.abs(dist(s, elbow) - upper) < 1e-9);
    assert.ok(Math.abs(dist(elbow, wrist) - fore) < 1e-9);
    assert.ok(dist(wrist, t) < 1e-9, `reached ${dist(wrist, t)}`);
    assert.ok(elbow[1] < (t[1] + s[1]) / 2 + 1e-9, "the elbow stays below");
  }
});

test("a target out of reach is clamped to the full arm", () => {
  const { wrist } = solveArm([0, 0, 0], 0.15, 0.17, [0, -1, 0], [1, 0, 0]);
  assert.ok(Math.abs(dist([0, 0, 0], wrist) - 0.32) < 1e-3);
});
