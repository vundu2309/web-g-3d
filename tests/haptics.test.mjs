import { test } from "node:test";
import assert from "node:assert/strict";
import { createHaptics } from "../src/app/haptics.ts";

const fight = (mood, tension) => ({
  mood,
  tension,
  distance: 10,
  stamina: 0.6,
  reeling: false,
  progress: 0.3,
  elapsed: 5,
});
const drive = (haptics, mood, tension, fromMs, toMs) => {
  for (let t = fromMs; t < toMs; t += 16) haptics.tick(t, fight(mood, tension));
};

test("a surge buzzes without a break, longer pulses as the line tightens", () => {
  const calls = [];
  const haptics = createHaptics((p) => calls.push(p));
  drive(haptics, "surge", 0.1, 0, 1000);
  const slack = calls.slice();
  assert.ok(slack.length >= 8, `pulses ${slack.length}`);
  assert.ok(slack.every((p) => Array.isArray(p) && p[0] >= 70 && p[1] <= 30));
  calls.length = 0;
  const tight = createHaptics((p) => calls.push(p));
  drive(tight, "surge", 0.95, 0, 1000);
  assert.ok(calls[0][0] > slack[0][0], "a tight line buzzes harder");
});

test("the buzz stops when the surge ends and a tired fish is quiet", () => {
  const calls = [];
  const haptics = createHaptics((p) => calls.push(p));
  drive(haptics, "surge", 0.5, 0, 500);
  calls.length = 0;
  drive(haptics, "tired", 0.05, 500, 1500);
  assert.deepEqual(calls, [0], "one stop, then nothing");
});

test("a taut line near the snap ticks as a warning, a slack one does not", () => {
  const calls = [];
  const haptics = createHaptics((p) => calls.push(p));
  drive(haptics, "strong", 0.3, 0, 1000);
  assert.equal(calls.length, 0);
  drive(haptics, "strong", 0.9, 1000, 2000);
  assert.ok(calls.length >= 3 && calls.every((p) => p === 22), `${calls}`);
});

test("stopping or having no fight ends the buzz", () => {
  const calls = [];
  const haptics = createHaptics((p) => calls.push(p));
  drive(haptics, "surge", 0.5, 0, 300);
  calls.length = 0;
  haptics.tick(400, undefined);
  assert.deepEqual(calls, [0]);
  haptics.tick(450, undefined);
  assert.deepEqual(calls, [0], "no repeated stops");
});
