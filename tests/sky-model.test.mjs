import test from "node:test";
import assert from "node:assert/strict";
import { glslSkyModel } from "../src/ocean/sky-model.ts";
import { readFileSync } from "node:fs";

test("sky and water share one radiance model and tone map", () => {
  const code = glslSkyModel();
  for (const fn of ["skyRadiance", "toScreen", "aces", "toLinear", "sunColor"])
    assert.match(code, new RegExp(`\\b${fn}\\(`));
  for (const file of ["sky.ts", "water.ts"]) {
    const src = readFileSync(
      new URL(`../src/ocean/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(src, /glslSkyModel\(\)/, `${file} uses the shared model`);
    assert.match(src, /toScreen\(/, `${file} tone maps its output`);
  }
});

test("water shader uses physically based terms and no GLSL reserved words", () => {
  const src = readFileSync(
    new URL("../src/ocean/water.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /distributionGGX/);
  assert.match(src, /exp\(-absorb/);
  assert.doesNotMatch(src, /vec3 half\b|float half\b/);
});

import { packBoats, BOAT_MAX } from "../src/ocean/water.ts";
test("boat shadows pack boats for the shader and cap at BOAT_MAX", () => {
  const packed = packBoats([{ x: 1, z: 2, heading: 0.5 }]);
  assert.equal(packed.length, BOAT_MAX * 4);
  assert.deepEqual(packed.slice(0, 4), [1, 2, 0.5, 2], "a boat is 1 + how wet");
  assert.equal(packed[7], 0, "empty slots are inactive");
  const lifted = packBoats([
    { x: 0, z: 0, heading: 0, wet: 0 },
    { x: 0, z: 0, heading: 0, wet: 0.25 },
    { x: 0, z: 0, heading: 0, wet: 7 },
  ]);
  assert.deepEqual([lifted[3], lifted[7], lifted[11]], [1, 1.25, 2]);
  assert.ok(
    lifted[3] > 0.5,
    "a lifted boat is still a boat (it still has a shadow)",
  );
  const many = Array.from({ length: BOAT_MAX + 5 }, (_, i) => ({
    x: i,
    z: 0,
    heading: 0,
  }));
  assert.equal(packBoats(many).length, BOAT_MAX * 4);
});
