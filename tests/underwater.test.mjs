import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALPHA,
  BELLY,
  DEPTH_SQUEEZE,
  UNDERWATER_FRAGMENT,
  UNDERWATER_VERTEX,
  bufferDepth,
  clarity,
  disturbance,
  fishAlpha,
  moodDepth,
  shoal,
  surfaceEntry,
  swimDepth,
  swimPose,
} from "../src/ocean/underwater.ts";
import {
  reflectsInWater,
  reflectsMaterial,
} from "../src/ocean/reflection-model.ts";
import { waveHeight } from "../src/ocean/waves.ts";

const read = (file) =>
  readFileSync(new URL(`../src/ocean/${file}`, import.meta.url), "utf8");
const range = (mood) => {
  let low = Infinity;
  let high = -Infinity;
  for (let t = 0; t < 60; t += 0.05) {
    const d = moodDepth(mood, t);
    low = Math.min(low, d);
    high = Math.max(high, d);
  }
  return { low, high };
};

// A hooked fish fights under the water (underwater.ts): the rules are pure and pinned here; the
// shaders are read as text (no GPU), and the scene part is checked with a headless engine below.

test("each mood swims at its own depth, inside 0.3 to 1.0 m", () => {
  const surge = range("surge");
  const strong = range("strong");
  const tired = range("tired");
  for (const r of [surge, strong, tired]) {
    assert.ok(r.low >= 0.3 - 1e-9, `${r.low} is not above 0.3 m`);
    assert.ok(r.high <= 1.0 + 1e-9, `${r.high} is not below 1 m`);
  }
  // Shallow and thrashing when it surges, deepest and steadiest when strong, near the top when tired.
  assert.ok(strong.low > surge.high, "strong swims below the surge");
  assert.ok(strong.low > tired.high, "strong swims below the tired fish");
  assert.ok(strong.high - strong.low < surge.high - surge.low + 0.2);
});

test("the middle of the body is deep enough for the back to be under the water, and never below the floor", () => {
  for (const mood of ["surge", "strong", "tired"])
    for (const length of [0.3, 1, 2.2]) {
      const d = swimDepth({ mood, time: 3, length, water: 40 });
      assert.ok(d >= BELLY * length, `${mood} ${length}: ${d}`);
    }
  // Over a shallow floor it keeps inside the water, and a hair of water still leaves it a depth.
  assert.ok(
    swimDepth({ mood: "strong", time: 0, length: 1, water: 0.5 }) <= 0.3,
  );
  assert.ok(swimDepth({ mood: "strong", time: 0, length: 1, water: 0 }) > 0);
});

test("the deeper it is the less of it you see, down to a faint dark shape at a metre", () => {
  assert.equal(clarity(0), 1);
  let last = 1;
  for (let d = 0.1; d <= 2; d += 0.1) {
    assert.ok(clarity(d) < last);
    last = clarity(d);
  }
  assert.ok(clarity(0.3) > 0.6, "a surging fish is clear");
  assert.ok(clarity(1) < 0.4, "at a metre little of it is left");
  assert.ok(fishAlpha(0.3) > fishAlpha(1));
  assert.ok(fishAlpha(1) < 0.55 && fishAlpha(1) >= ALPHA.deep * 0.9);
  // A fish put back falls out of sight.
  assert.ok(fishAlpha(3) < 0.02);
});

test("the water the fish fades into is turquoise in the shallows and deep blue offshore", () => {
  assert.equal(shoal(0), 1);
  assert.equal(shoal(3), 1);
  assert.equal(shoal(13), 0);
  assert.equal(shoal(46), 0);
  assert.ok(shoal(8) > 0 && shoal(8) < 1);
});

test("the fish sways, rolls and, when tired, shows its belly now and then", () => {
  let belly = 0;
  let sway = 0;
  for (let t = 0; t < 30; t += 0.05) {
    const tired = swimPose("tired", t, 1.2);
    belly = Math.max(belly, tired.roll);
    sway = Math.max(sway, Math.abs(swimPose("surge", t, 9).wiggle));
    assert.ok(Math.abs(swimPose("strong", t, 4).roll) < 0.25);
  }
  assert.ok(belly > Math.PI / 2, "rolls past its side");
  assert.ok(sway > 0.25, "a surge throws the body about");
});

test("ripples show where a fish is close under the surface, not when it is deep", () => {
  assert.ok(disturbance("surge", 0.4) > 0.8);
  assert.ok(disturbance("tired", 0.4) > 0.3);
  assert.ok(disturbance("strong", 0.9) < 0.15);
  assert.equal(disturbance("surge", 5), 0);
});

test("the line dives through the sea at the point where the straight line meets the waves", () => {
  const tip = { x: 0, y: 3.5, z: 0 };
  const mouth = { x: 14, y: -0.8, z: 6 };
  for (const time of [0, 3.3, 9]) {
    const level = (x, z) => waveHeight(x, z, time);
    const hit = surfaceEntry(tip, mouth, level);
    // On the line, on the sea, between the two ends.
    assert.ok(Math.abs(hit.y - level(hit.x, hit.z)) < 1e-6);
    const t = hit.x / mouth.x;
    assert.ok(t > 0.5 && t < 1);
    assert.ok(Math.abs(hit.y - (tip.y + (mouth.y - tip.y) * t)) < 0.01);
    assert.ok(Math.abs(hit.z - mouth.z * t) < 1e-9);
  }
  // A mouth above the water ends the line at the mouth.
  const up = { x: 5, y: 2, z: 0 };
  assert.deepEqual(
    surfaceEntry(tip, up, () => 0),
    up,
  );
});

test("the depth the buffer is given sits at the water and keeps the order of the parts", () => {
  assert.equal(bufferDepth(0.5, 0.5), 0.5);
  assert.ok(bufferDepth(0.5, 0.6) > bufferDepth(0.5, 0.55));
  assert.ok(Math.abs(bufferDepth(0.5, 0.7) - 0.5) < 0.2 * DEPTH_SQUEEZE + 1e-9);
});

test("the shaders draw nothing above the real waves and tint what is below", () => {
  // The fragment shader uses the shared wave function (the CPU one the boats float on) ...
  assert.match(UNDERWATER_FRAGMENT, /float waveHeight\(vec2 p, float t\)/);
  assert.match(
    UNDERWATER_FRAGMENT,
    /waveHeight\(vWorld\.xz, time\) - vWorld\.y/,
  );
  // ... throws away what is above it (unless leaping out), fades with depth and ends transparent.
  assert.match(
    UNDERWATER_FRAGMENT,
    /if \(cut > 0\.5 && depth < 0\.0\) discard;/,
  );
  assert.match(UNDERWATER_FRAGMENT, /exp\(-1\.2000 \* d\)/);
  assert.match(UNDERWATER_FRAGMENT, /gl_FragColor = vec4\(color, alpha\)/);
  // The vertex shader moves only the depth, not where the fish is on the screen.
  assert.match(UNDERWATER_VERTEX, /gl_Position = vec4\(clip\.xy,/);
});

test("the sea's mirror leaves out whatever wears the underwater skin", () => {
  assert.ok(!reflectsMaterial("underwater-skin"));
  assert.ok(reflectsMaterial("solid-satin"));
  assert.ok(reflectsMaterial(undefined));
  // The gear's meshes under the water are named so that the name rules and the skin agree.
  assert.ok(!reflectsInWater("gear-ring-v"));
  const reflection = read("reflection.ts");
  assert.match(
    reflection,
    /reflectsInWater\(mesh\.name, mesh\.material\?\.name\)/,
  );
  assert.ok(!reflectsInWater("hooked-fish-body", "underwater-skin"));
  assert.ok(reflectsInWater("hooked-fish-body", "solid-satin"));
});

test("the water mesh is not changed by the fish: the sea stays one opaque shader", () => {
  const water = read("water.ts");
  assert.ok(!/underwater/i.test(water), "water.ts knows nothing of the fish");
});

test("the hooked fish swims below the waterline, nose away from the boat, and is gone from the sea when landed", async () => {
  // The gear draws its ring textures on a canvas: a headless one that swallows every call is enough.
  const noop = new Proxy(function () {}, {
    get: (_, key) => (key === "canvas" ? fake : noop),
    set: () => true,
    apply: () => noop,
  });
  const fake = { width: 1, height: 1, getContext: () => noop };
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      Object.assign(this, { width, height });
    }
    getContext() {
      return noop;
    }
  };
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const { FishingGear } = await import("../src/ocean/fishing-gear.ts");
  const { FreeCamera } = await import("@babylonjs/core/Cameras/freeCamera.js");
  const scene = new Scene(new NullEngine());
  scene.useRightHandedSystem = true;
  scene.activeCamera = new FreeCamera("cam", new Vector3(0, 8, 12), scene);
  const gear = new FishingGear(scene);
  const tip = { x: 0, y: 3.6, z: 0 };
  const sea = (x, z, t) => waveHeight(x, z, t);
  for (const mood of ["surge", "strong", "tired"]) {
    const view = {
      phase: "fighting",
      power: 0,
      flight: 1,
      nibbleAges: [],
      hurry: 0,
      landing: { x: 0, z: -20 },
      species: "ca-thu",
      size: 0.4,
      fight: {
        mood,
        tension: 0.4,
        distance: 14,
        stamina: 0.5,
        reeling: false,
        progress: 0.7,
        elapsed: 3,
      },
    };
    for (let t = 10; t < 13; t += 1 / 30)
      gear.update({ view, tip, preview: undefined, time: t });
    const fish = scene.getTransformNodeByName("hooked-fish");
    assert.ok(fish, "the fish exists");
    const at = fish.position;
    const under = sea(at.x, at.z, 12.97) - at.y;
    assert.ok(
      under > 0.15,
      `${mood}: the fish is ${under.toFixed(2)} m under the water`,
    );
    assert.ok(under < 1.4, `${mood}: not too deep (${under.toFixed(2)} m)`);
    const body = scene.getMeshByName("hooked-fish-body");
    assert.equal(
      body.material.name,
      "underwater-skin",
      "it wears the underwater skin",
    );
    // Nose (+X turned by the yaw) points away from the boat (the boat is at the origin, the fish at -z).
    const yaw = fish.rotation.y;
    const nose = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    assert.ok(
      nose.x * at.x + nose.z * at.z > 0,
      `${mood}: nose toward the boat`,
    );
    // The line dives: a strip below the surface exists and the rod's line stops at the sea.
    assert.ok(scene.getMeshByName("gear-under-line").isVisible);
    assert.ok(
      !scene.getMeshByName("gear-shadow"),
      "no shadow disc on the water",
    );
  }
  // Landed: it is no longer drawn through the water but hangs from the rod in the shared satin skin.
  gear.hold({ id: "ca-thu", scale: 1 });
  for (let t = 13; t < 15; t += 1 / 30) gear.updateHeld(tip, t);
  const body = scene.getMeshByName("hooked-fish-body");
  assert.notEqual(body.material.name, "underwater-skin");
  assert.ok(!scene.getMeshByName("gear-under-line").isVisible);
  gear.dispose();
  scene.dispose();
});
