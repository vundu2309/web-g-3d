import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOW_MIN,
  LIGHTS_MIN_LEVEL,
  NAV_LIGHTS,
  STROBE,
  glowSize,
  strobeOn,
} from "../src/ocean/plane-lights.ts";
import { PAL } from "../src/ocean/art/colors.ts";

const light = (name) => NAV_LIGHTS.find((l) => l.name === name);

test("the wing-tip lights are red on the left and green on the right, level and mirrored", () => {
  const port = light("port");
  const starboard = light("starboard");
  // The plane's right is +X: green there, red on the other side.
  assert.ok(port.local[0] < 0 && starboard.local[0] > 0);
  assert.equal(port.color, PAL.paint.red);
  assert.equal(starboard.color, PAL.paint.green);
  assert.equal(port.local[0], -starboard.local[0]);
  assert.equal(port.local[1], starboard.local[1]);
  assert.equal(port.local[2], starboard.local[2]);
  // At the tips of the 11.2 m wing (5.6 m out), and not flashing.
  assert.equal(Math.abs(port.local[0]), 5.6);
  assert.ok(!port.flashes && !starboard.flashes);
});

test("a steady white light at the tail and a white strobe on the fin", () => {
  const tail = light("tail");
  const strobe = light("strobe");
  assert.equal(tail.color, PAL.paint.white);
  assert.equal(strobe.color, PAL.paint.white);
  // The tail is toward +Z (the nose is -Z); the strobe is above the rest.
  assert.ok(tail.local[2] > 3 && strobe.local[2] > 3);
  assert.ok(strobe.local[1] > tail.local[1]);
  assert.ok(strobe.flashes && !tail.flashes);
  assert.equal(NAV_LIGHTS.length, 4);
});

test("the strobe flashes briefly and regularly, and the same at the same time", () => {
  let on = 0;
  const steps = 14000;
  for (let i = 0; i < steps; i++) if (strobeOn(i / 100)) on++;
  assert.ok(Math.abs(on / steps - STROBE.on / STROBE.period) < 0.01);
  assert.ok(
    strobeOn(0) && !strobeOn(STROBE.on + 0.05) && strobeOn(STROBE.period),
  );
  assert.equal(strobeOn(12.3), strobeOn(12.3));
  assert.ok(strobeOn(-STROBE.period), "a negative time works too");
});

test("a glow stays as big on the screen as the light is far: never tiny, growing with distance", () => {
  assert.equal(glowSize(5), GLOW_MIN);
  assert.ok(glowSize(300) > glowSize(100));
  // About the same angle on the screen (radius in radians) at any distance past the minimum.
  for (const d of [200, 400, 600])
    assert.ok(Math.abs(glowSize(d) / d - 0.014) < 1e-9);
  assert.ok(LIGHTS_MIN_LEVEL > 0 && LIGHTS_MIN_LEVEL < 0.1);
});
