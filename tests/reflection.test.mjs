import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REFLECT_TAPS,
  REFLECT_WOBBLE_MAX,
  cappedWobble,
  glslReflection,
  reflectionBlur,
  reflectionSize,
  reflectsInWater,
} from "../src/ocean/reflection-model.ts";

const read = (file) =>
  readFileSync(new URL(`../src/ocean/${file}`, import.meta.url), "utf8");

// The planar reflection needs a GPU to draw; these tests pin what does not: which meshes are
// mirrored, how far the waves may move the picture, how it is blurred and how the shader and
// the scene are wired.

test("the mirror holds the sky, islands, props, markets and boats but never the water or the white water", () => {
  for (const name of [
    "sky",
    "terrain",
    "props",
    "props-fallback",
    "model-palm-1",
    "palm-2",
    "hut",
    "market-0",
    "boat-3",
    "boat-uid-7",
    "hull",
    "gull",
    "gear-line",
    "gear-lure",
    "wake",
  ])
    assert.ok(reflectsInWater(name), `${name} is mirrored`);
  for (const name of [
    "sea",
    "swash-0",
    "swash-2",
    "wake-foam",
    "gear-ring-0",
    "gear-ring-4",
    "gear-marker",
    "gear-shadow",
  ])
    assert.ok(!reflectsInWater(name), `${name} is not mirrored`);
});

test("the mirror is half the canvas and never empty", () => {
  assert.deepEqual(reflectionSize(1000, 600), { width: 500, height: 300 });
  assert.deepEqual(reflectionSize(1, 1), { width: 2, height: 2 });
});

test("the waves move the reflected picture by a capped amount and blur it", () => {
  assert.equal(cappedWobble(-1), 0);
  assert.equal(cappedWobble(0.01), 0.01);
  assert.equal(cappedWobble(5), REFLECT_WOBBLE_MAX);
  assert.ok(REFLECT_WOBBLE_MAX > 0 && REFLECT_WOBBLE_MAX < 0.1);
  // Calm near water is sharp; rougher (farther) water and bigger wobble blur more.
  assert.ok(reflectionBlur(0.04, 0) < 0.004, "near calm water is sharp");
  assert.ok(reflectionBlur(0.04, 0) < reflectionBlur(0.3, 0));
  assert.ok(reflectionBlur(0.3, 0) < reflectionBlur(0.6, 0));
  assert.ok(reflectionBlur(0.3, 0) < reflectionBlur(0.3, 0.03));
  assert.ok(
    reflectionBlur(0.3, 9) === reflectionBlur(0.3, REFLECT_WOBBLE_MAX),
    "wobble is capped before it blurs",
  );
});

test("the water shader looks the picture up at its own screen position, capped, blurred, and falls back to the sky", () => {
  const water = read("water.ts");
  assert.match(water, /uniform sampler2D reflectionMap;/);
  assert.match(water, /uniform mat4 viewProjection;/);
  assert.match(water, /samplers: \["rippleMap", "coastMap", "reflectionMap"\]/);
  assert.match(water, /\$\{glslReflection\(\)\}/);
  const code = glslReflection();
  assert.match(code, /texture2D\(reflectionMap,/);
  assert.match(code, /viewProjection \* vec4\(p, 1\.0\)/);
  assert.match(code, /min\(1\.0, 0\.04500 \/ max\(wobbleLength/);
  assert.equal(
    (code.match(/for \(int i = 0; i < 9; i\+\+\)/g) ?? []).length,
    1,
  );
  assert.equal(REFLECT_TAPS, 9);
  // The analytic sky is still computed and is what shows where the picture has nothing.
  assert.match(water, /vec3 mirror = skyRadiance\(reflected, false\);/);
  assert.match(water, /mirror = mix\(mirror, scene\.rgb, scene\.a\);/);
  // The glitter stays, and the foam is mixed on top of the mirror (never reflected).
  const mirrorAt = water.indexOf("mirror = mix(mirror, scene.rgb");
  assert.ok(mirrorAt > 0);
  assert.ok(water.indexOf("distributionGGX(nh") > mirrorAt);
  assert.ok(water.indexOf("color = mix(color, foamColor, foam)") > mirrorAt);
  // Without a texture the shader reads a transparent 1 x 1 picture: the old look.
  assert.match(water, /noReflection/);
  assert.match(water, /setReflection\(texture\)/);
});

test("the mirror is a half-size texture of the scene about y = 0, wired by one helper", () => {
  const mirror = read("reflection.ts");
  assert.match(mirror, /new Plane\(0, -1, 0, 0\)/);
  assert.match(mirror, /renderListPredicate = \(mesh\) => reflectsInWater/);
  assert.match(mirror, /new Color4\(0, 0, 0, 0\)/);
  assert.match(mirror, /customRenderTargets\.push\(mirror\)/);
  assert.match(mirror, /reflectionSize\(/);
  assert.match(mirror, /catch \(error\)/, "a missing texture is not fatal");
  assert.match(mirror, /sky\.showSun\(false\)/);
  const sky = read("sky.ts");
  assert.match(sky, /uniform float sunDisc;/);
  assert.match(sky, /skyRadiance\(d, sunDisc > 0\.5\)/);
  // The game builds it after the sky, and the predicate covers whatever is built later.
  const scene = read("babylon-scene.ts");
  assert.ok(
    scene.indexOf("createSeaReflection(this.scene") >
      scene.indexOf("this.sky = createSky"),
  );
});
