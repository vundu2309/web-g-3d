import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FRAME,
  RUDDER_FALL,
  RUDDER_RISE,
  createBoatControl,
  rawRequest,
} from "../src/ocean/boat-control.ts";

const none = { left: false, right: false, up: false, down: false };
const still = { steer: 0, throttle: 0 };
const frames = (control, seconds, keys, stick = still, dt = 1 / 60) => {
  let out;
  for (let t = 0; t < seconds - 1e-9; t += dt)
    out = control.update(dt, keys, stick, true, false);
  return out;
};

test("a key winds the rudder on over RUDDER_RISE, it does not snap to full lock", () => {
  const c = createBoatControl();
  const first = c.update(1 / 60, { ...none, right: true }, still, true, false);
  assert.ok(first.steer > 0 && first.steer < 0.1, `first frame ${first.steer}`);
  const half = frames(createBoatControl(), RUDDER_RISE / 2, {
    ...none,
    right: true,
  });
  assert.ok(Math.abs(half.steer - 0.5) < 0.05, `half way ${half.steer}`);
  const full = frames(createBoatControl(), RUDDER_RISE + 0.05, {
    ...none,
    right: true,
  });
  assert.equal(full.steer, 1);
});

test("the rudder centres over RUDDER_FALL once the key is let go", () => {
  const c = createBoatControl();
  frames(c, 1, { ...none, left: true });
  assert.equal(c.rudder, -1);
  const mid = frames(c, RUDDER_FALL / 2, none);
  assert.ok(Math.abs(mid.steer + 0.5) < 0.05, `half way back ${mid.steer}`);
  frames(c, RUDDER_FALL, none);
  assert.equal(c.rudder, 0);
});

test("reversing counts as winding on: left to right passes through centre at the rise rate", () => {
  const c = createBoatControl();
  frames(c, 1, { ...none, left: true });
  const centre = frames(c, RUDDER_RISE, { ...none, right: true });
  // From -1 at 1/RUDDER_RISE per second, one rise later the rudder is back at centre.
  assert.ok(Math.abs(centre.steer) < 0.05, `after one rise ${centre.steer}`);
  const over = frames(c, RUDDER_RISE + 0.05, { ...none, right: true });
  assert.equal(over.steer, 1);
});

test("the stick wins and is passed on as it is, with no ramp", () => {
  const c = createBoatControl();
  const out = c.update(
    1 / 60,
    { ...none, left: true },
    { steer: 0.4, throttle: 0.7 },
    true,
    false,
  );
  assert.deepEqual(out, { steer: 0.4, throttle: 0.7 });
  assert.deepEqual(
    rawRequest({ ...none, up: true }, { steer: 0.2, throttle: 0 }),
    { steer: 0.2, throttle: 1 },
  );
});

test("the throttle from keys is full deflection with no smoothing here", () => {
  const c = createBoatControl();
  assert.equal(
    c.update(1 / 60, { ...none, up: true }, still, true, false).throttle,
    1,
  );
  assert.equal(
    c.update(1 / 60, { ...none, down: true }, still, true, false).throttle,
    -1,
  );
});

test("fishing or an unplayable page asks nothing and centres the rudder at once", () => {
  const c = createBoatControl();
  frames(c, 1, { ...none, right: true, up: true });
  assert.equal(c.rudder, 1);
  assert.deepEqual(
    c.update(1 / 60, { ...none, right: true, up: true }, still, true, true),
    still,
  );
  assert.equal(c.rudder, 0);
  frames(c, 1, { ...none, right: true });
  assert.deepEqual(
    c.update(1 / 60, { ...none, right: true }, still, false, false),
    still,
  );
  assert.equal(c.rudder, 0);
});

test("a long frame counts for at most MAX_FRAME, so a returning tab does not jump the rudder", () => {
  const c = createBoatControl();
  const out = c.update(5, { ...none, right: true }, still, true, false);
  assert.ok(Math.abs(out.steer - MAX_FRAME / RUDDER_RISE) < 1e-9);
  const bad = createBoatControl().update(
    Number.NaN,
    { ...none, right: true },
    still,
    true,
    false,
  );
  assert.equal(bad.steer, 0);
});

test("the ramp does not depend on the frame rate", () => {
  const at = (hz) =>
    frames(createBoatControl(), 0.2, { ...none, right: true }, still, 1 / hz)
      .steer;
  assert.ok(Math.abs(at(30) - at(144)) < 0.04, `${at(30)} vs ${at(144)}`);
});
