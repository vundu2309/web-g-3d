import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_ANGULAR_DAMPING,
  KEEL_GRIP_RATE,
  YAW_WATER_DAMPING,
  blendFraction,
  crossForce,
  keelGrip,
  topTurnRate,
  yawDampingTorque,
  HULL_BOX,
} from "../src/ocean/hull-handling.ts";

test("the keel grips a moving hull and lets a stopped one pivot", () => {
  assert.equal(keelGrip(0), 0);
  assert.equal(keelGrip(3), 1);
  assert.equal(keelGrip(-8), 1, "astern grips too");
  assert.ok(keelGrip(1.5) > 0.4 && keelGrip(1.5) < 0.6);
});

test("a slide across the hull dies in about a fifth of a second at speed, and pushes back the right way", () => {
  // Euler steps of a 1.5 m/s slide at cruise, with the hull's own quadratic and linear drag.
  const quadratic = (6000 / 144) * 13;
  let across = 1.5;
  let seconds = 0;
  while (Math.abs(across) > 0.15 && seconds < 5) {
    across += (crossForce(across, 8, quadratic, 60) / HULL_BOX.mass) * (1 / 60);
    seconds += 1 / 60;
  }
  assert.ok(
    seconds < 0.6,
    `a slide of 1.5 m/s is down to 0.15 m/s in ${seconds.toFixed(2)} s`,
  );
  assert.ok(
    crossForce(1, 8, quadratic, 60) < 0,
    "a push to the right is answered to the left",
  );
  assert.ok(crossForce(-1, 8, quadratic, 60) > 0);
  // Without the grip (a stopped hull) only the old drag acts, so it does not stick.
  assert.equal(crossForce(1, 0, quadratic, 60), -(quadratic + 60));
  assert.ok(KEEL_GRIP_RATE >= 4);
});

test("the water damps turning, so the turn rate follows the rudder quickly and keeps its top value", () => {
  assert.ok(yawDampingTorque(0.5) < 0 && yawDampingTorque(-0.5) > 0);
  const total = BODY_ANGULAR_DAMPING + YAW_WATER_DAMPING;
  assert.ok(
    1 / total < 0.35,
    `turn rate settles with a time constant of ${(1 / total).toFixed(2)} s`,
  );
  const top = topTurnRate();
  assert.ok(
    top > 0.5 && top < 0.75,
    `top turn rate ${top.toFixed(2)} rad/s (was about 0.6)`,
  );
  // Whatever the turn rate was, letting go turns the boat through at most rate / total.
  assert.ok(
    (top / total) * (180 / Math.PI) < 12,
    "less than 12 degrees of turning left after letting go",
  );
});

test("the drawn pose is blended by the time left over between physics steps", () => {
  assert.equal(blendFraction(0, 1000 / 60), 0);
  assert.ok(Math.abs(blendFraction(1000 / 120, 1000 / 60) - 0.5) < 1e-9);
  assert.equal(blendFraction(50, 1000 / 60), 1, "never past the newest step");
  assert.equal(blendFraction(-3, 1000 / 60), 0);
  assert.equal(blendFraction(5, 0), 1, "no step length: show the newest");
  assert.equal(blendFraction(Number.NaN, 16), 1);
});
