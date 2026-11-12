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
