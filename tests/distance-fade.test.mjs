import assert from "node:assert/strict";
import test from "node:test";
import {
  FADE_BAND,
  FADE_IN,
  FADE_OUT,
  approach,
  distanceAmount,
  fadeAmount,
} from "../src/ocean/distance-fade.ts";

const RANGE = 600;

test("a plane is whole inside the band, gone at the range, and thins smoothly between", () => {
  assert.equal(distanceAmount(0, RANGE), 1);
  assert.equal(distanceAmount(RANGE - FADE_BAND, RANGE), 1);
  assert.equal(distanceAmount(RANGE, RANGE), 0);
  assert.equal(distanceAmount(RANGE + 500, RANGE), 0);
  let before = 1;
  let biggestStep = 0;
  for (let d = RANGE - FADE_BAND; d <= RANGE; d += 1) {
    const a = distanceAmount(d, RANGE);
    assert.ok(a <= before + 1e-12, "never grows with distance");
    biggestStep = Math.max(biggestStep, before - a);
    before = a;
  }
  // No step of more than a few percent per metre: there is no edge to pop at.
  assert.ok(biggestStep < 0.02, `a step of ${biggestStep}`);
});

test("a plane flying out at 27 m/s takes seconds to thin out, not a frame", () => {
  const seconds = FADE_BAND / 27;
  assert.ok(seconds > 5, `${seconds} s from whole to gone`);
});

test("the time fade rises in FADE_IN seconds and falls in FADE_OUT, and never overshoots", () => {
  let v = 0;
  for (let t = 0; t < FADE_IN - 0.01; t += 0.01)
    v = approach(v, 1, 0.01, FADE_IN);
  assert.ok(v < 1 && v > 0.95);
  v = approach(v, 1, 0.5, FADE_IN);
  assert.equal(v, 1);
  for (let t = 0; t < FADE_OUT - 0.01; t += 0.01)
    v = approach(v, 0, 0.01, FADE_OUT);
  assert.ok(v > 0 && v < 0.05);
  assert.equal(approach(v, 0, 5, FADE_OUT), 0);
});

test("the amount drawn is the smaller of the time fade and the distance taper", () => {
  assert.equal(fadeAmount(1, 100, RANGE), 1);
  assert.equal(
    fadeAmount(0.3, 100, RANGE),
    0.3,
    "just chosen: still fading in",
  );
  assert.equal(fadeAmount(1, RANGE, RANGE), 0, "at the range: gone");
  const edge = fadeAmount(1, RANGE - FADE_BAND / 2, RANGE);
  assert.ok(edge > 0.3 && edge < 0.7, `half way in the band: ${edge}`);
  assert.equal(fadeAmount(0.1, RANGE - FADE_BAND / 2, RANGE), 0.1);
});
