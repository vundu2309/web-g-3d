import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLEAR,
  ClearWaterGovernor,
  DEPTH_RANGE,
  QUALITY,
  UNDER_DEPTH_FRAGMENT,
  UNDER_SCALE,
  UNDER_VERTEX,
  glslSeeThrough,
  underSize,
  underwaterCapable,
  underwaterReach,
} from "../src/ocean/clear-water.ts";
import { PROBES } from "../src/ocean/probe.ts";
import { MAX_WAVE_HEIGHT } from "../src/ocean/waves.ts";
import { ScaleGovernor } from "../src/ocean/render-scale.ts";

const read = (file) =>
  readFileSync(new URL(`../src/ocean/${file}`, import.meta.url), "utf8");

// Clear water (clear-water.ts), read from depth: the rules are pure and pinned here; the shaders are
// read as text (no GPU), and the scene part is checked with a headless engine at the bottom.

test("the layer is three quarters of the canvas in each direction and never empty", () => {
  assert.equal(UNDER_SCALE, 0.75);
  assert.deepEqual(underSize(1688, 780), { width: 1266, height: 585 });
  assert.deepEqual(underSize(1, 1), { width: 2, height: 2 });
});

test("the depth layer holds a distance in two bytes: one sample, nearest reading, no mip maps", () => {
  const pass = read("clear-water-pass.ts");
  assert.match(pass, /texture\.samples = 1;/);
  assert.match(pass, /Texture\.NEAREST_SAMPLINGMODE/);
  assert.ok(
    DEPTH_RANGE > CLEAR.reach,
    "the packed range reaches past the layer's reach",
  );
});

test("only what can be under the water is drawn on the layer", () => {
  for (const name of [
    "boat-model-1",
    "uid-1-hull",
    "boat-0",
    "market-hai-dang",
    "model-rock-2",
    "rock-3-4",
    "buoy",
    "buoy-5",
    "hooked-fish-body",
    "hooked-fish-tail-mesh",
  ])
    assert.ok(underwaterCapable(name), name);
  for (const name of [
    "sea",
    "sky",
    "island",
    "swash-1",
    "wake-foam",
    "model-palm-1",
    "palm-3",
    "gull-2",
    "market-sign-hai-dang",
    "boat-model-lamp-glow",
    "uid-1-lamp",
    "gear-ring-v",
    "gear-marker",
    // The sea paints its own floor, and the gear keeps its own skin for the line.
    "seabed-3",
    "gear-under-line",
  ])
    assert.ok(!underwaterCapable(name), name);
});

test("a big mesh of which only the piles are under the water is drawn only when close", () => {
  assert.equal(underwaterReach("boat-model-1"), CLEAR.reach);
  assert.equal(underwaterReach("model-rock-1"), CLEAR.reach);
  assert.equal(underwaterReach("market-hai-dang"), CLEAR.marketReach);
  assert.ok(CLEAR.marketReach < CLEAR.reach);
  // Close enough that the stall is nearly always in range when its piles can be seen.
  assert.ok(CLEAR.marketReach >= 60);
  // The predicate asks for it, with the mesh's own name.
  assert.match(read("clear-water-pass.ts"), /underwaterReach\(mesh\.name\)/);
});

test("the layer's shader keeps only what is under the real waves and writes its distance", () => {
  assert.match(UNDER_DEPTH_FRAGMENT, /float waveHeight\(vec2 p, float t\)/);
  assert.match(
    UNDER_DEPTH_FRAGMENT,
    /seaHeight\(vWorld\.xz, time\) - vWorld\.y < 0\.0\) discard;/,
  );
  const top = CLEAR.top.toFixed(4);
  assert.ok(CLEAR.top > MAX_WAVE_HEIGHT);
  assert.ok(
    UNDER_DEPTH_FRAGMENT.indexOf(`vWorld.y > ${top}`) <
      UNDER_DEPTH_FRAGMENT.indexOf("seaHeight(vWorld.xz, time)"),
  );
  assert.match(
    UNDER_DEPTH_FRAGMENT,
    /gl_FragColor = vec4\(high \/ 255\.0, d - high, 0\.0, 1\.0\)/,
  );
  assert.ok(!/sunDirection|absorb|tint/.test(UNDER_DEPTH_FRAGMENT));
  assert.match(UNDER_VERTEX, /#ifdef INSTANCES/);
  assert.match(UNDER_VERTEX, /mat4\(world0, world1, world2, world3\)/);
});

test("the sea is thinner over what lies under it, and the colour layer is gone", () => {
  assert.match(glslSeeThrough(), /float seeThroughAlpha\(float dist\)/);
  assert.match(glslSeeThrough(), /exp\(-0\.2000 \* thick\)/);
  assert.match(glslSeeThrough(), /smoothstep\(0\.0, 0\.3000, thick\)/);
  const water = read("water.ts");
  assert.match(water, /\$\{glslSeeThrough\(\)\}/);
  assert.ok(
    !/underLayerAt|glslUnderLayer/.test(water),
    "the old colour layer is not read",
  );
  assert.match(water, /uniform sampler2D underMap;/);
  assert.match(water, /uniform float underOn;/);
  const mirrored = water.indexOf("vec3 color = body * (1.0 - fresnel)");
  const alpha = water.indexOf("float seeAlpha");
  assert.ok(mirrored > 0 && alpha > mirrored);
  assert.match(water, /underOn > 0\.5 && dist < /);
  const vertex = water.slice(
    water.indexOf('ShadersStore["seaVertexShader"]'),
    water.indexOf('ShadersStore["seaFragmentShader"]'),
  );
  assert.ok(vertex.length > 200 && !/underMap|underOn/.test(vertex));
});

test("there is one see-through mode and no setting for it: the old switches are gone", () => {
  const names = PROBES.map((item) => item.name);
  assert.ok(!names.includes("clearwater") && !names.includes("seemode"));
  for (const file of ["babylon-scene.ts", "clear-water-pass.ts", "water.ts"])
    assert.ok(!/seemode|clearwater|SeeMode/.test(read(file)), file);
});

test("the sea does not leave the opaque shader's wave function: waves.ts is the one source", () => {
  const water = read("water.ts");
  assert.match(water, /\$\{glslWaveHeight\(\)\}/);
  const pass = read("clear-water-pass.ts");
  assert.ok(!/waveHeight\s*=|function waveHeight/.test(pass));
});

test("the layer is switched off after two slow windows and comes back after eight fast ones, twice at most", () => {
  const run = (governor, seconds, dt) => {
    const changes = [];
    for (let t = 0; t < seconds; t += dt) {
      const change = governor.sample(dt);
      if (change !== undefined) changes.push([+t.toFixed(1), change]);
    }
    return changes;
  };
  // A phone that holds 30 frames a second: nothing happens.
  const calm = new ClearWaterGovernor();
  assert.deepEqual(run(calm, 120, 1 / 30), []);
  assert.equal(calm.enabled, true);
  // The warm-up is ignored: slow frames at the start change nothing.
  const start = new ClearWaterGovernor();
  assert.deepEqual(run(start, QUALITY.warmup - 0.1, 0.2), []);
  // A phone that does 12 frames a second: off after the warm-up and two windows.
  const slow = new ClearWaterGovernor();
  const off = run(slow, 20, 1 / 12);
  assert.equal(off.length, 1);
  assert.equal(off[0][1], false);
  assert.ok(
    off[0][0] >= QUALITY.warmup + QUALITY.slowToOff * QUALITY.window - 0.5,
  );
  assert.ok(
    off[0][0] <=
      QUALITY.warmup + (QUALITY.slowToOff + 1) * QUALITY.window + 0.5,
  );
  assert.equal(slow.enabled, false);
  // One slow window between fast ones does not switch it off (a hiccup costs nothing).
  const hiccup = new ClearWaterGovernor();
  run(hiccup, QUALITY.warmup + 0.01, 1 / 30);
  assert.deepEqual(run(hiccup, QUALITY.window, 1 / 12), []);
  assert.deepEqual(run(hiccup, 10, 1 / 30), []);
  assert.equal(hiccup.enabled, true);
  // A hidden tab (a gap over a second) tells nothing.
  const hidden = new ClearWaterGovernor();
  assert.deepEqual(run(hidden, 30, 5), []);
  // Fast again: it returns after eight windows; slow again: off, and after the second return it stays off.
  const flaky = new ClearWaterGovernor();
  const states = [];
  let phase = "slow";
  for (let t = 0; t < 400; t += 1 / 30) {
    const dt = phase === "slow" ? 1 / 12 : 1 / 30;
    const change = flaky.sample(dt);
    if (change !== undefined) {
      states.push(change);
      phase = change ? "slow" : "fast";
    }
  }
  assert.deepEqual(states, [false, true, false, true, false]);
  assert.equal(flaky.enabled, false);
  assert.equal(flaky.mayReturn, false);
  // A device that cannot draw it never does.
  const none = new ClearWaterGovernor(false);
  assert.equal(none.enabled, false);
  assert.deepEqual(run(none, 60, 1 / 30), []);
  none.set(true);
  assert.equal(none.enabled, false);
});

test("forcing the state starts a new window, and a pinned state never changes by itself", () => {
  // A window half measured under the old state must not count toward the new one.
  const governor = new ClearWaterGovernor();
  const feed = (seconds, dt) => {
    const out = [];
    for (let t = 0; t < seconds - 1e-9; t += dt) out.push(governor.sample(dt));
    return out;
  };
  feed(QUALITY.warmup + 0.01, 1 / 30);
  feed(QUALITY.window, 1 / 10); // one slow window
  feed(QUALITY.window - 0.2, 1 / 10); // and most of another
  governor.set(true);
  // Two seconds and a bit more of slow frames after the reset make ONE window: not enough to switch it off.
  assert.ok(feed(QUALITY.window + 0.3, 1 / 10).every((c) => c === undefined));
  assert.equal(governor.enabled, true);
  // Pinned: slow forever, still on; and off stays off however fast.
  const pinned = new ClearWaterGovernor();
  pinned.lock(true);
  for (let t = 0; t < 200; t += 1 / 8)
    assert.equal(pinned.sample(1 / 8), undefined);
  assert.equal(pinned.enabled, true);
  assert.equal(pinned.locked, true);
  pinned.lock(false);
  for (let t = 0; t < 200; t += 1 / 60)
    assert.equal(pinned.sample(1 / 60), undefined);
  assert.equal(pinned.enabled, false);
  pinned.unlock();
  assert.equal(pinned.locked, false);
});

test("the render scale waits while the layer is still on, and coarsens only when it is off or cannot help", () => {
  const dt = 1 / 12;
  const ran = (hold) => {
    const governor = new ScaleGovernor({ sharpest: 0.5 });
    let changed = 0;
    for (let t = 0; t < 40; t += dt)
      if (governor.sample(dt, hold) !== undefined) changed++;
    return changed;
  };
  assert.equal(ran(true), 0, "held: never coarsens");
  assert.ok(ran(false) > 0, "not held: coarsens as before");
  assert.ok(
    ran(undefined) > 0,
    "the old call without the argument is unchanged",
  );
});

test("the scene wires the layer: created with the reflection, switched by the governor, the render scale held meanwhile", () => {
  const scene = read("babylon-scene.ts");
  assert.match(scene, /createClearWater\(this\.scene, this\.water\)/);
  assert.match(scene, /ClearWaterGovernor/);
  assert.match(scene, /this\.governor\.sample\(dt, /);
  assert.match(scene, /clearWater: /, "stats report the layer");
});

test("the headless scene: the layer is a texture the water reads, and the meshes under the sea are recorded in it", async () => {
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
  const { FreeCamera } = await import("@babylonjs/core/Cameras/freeCamera.js");
  const { createWater } = await import("../src/ocean/water.ts");
  const { createClearWater } = await import("../src/ocean/clear-water-pass.ts");
  const { FishingGear } = await import("../src/ocean/fishing-gear.ts");
  const { createBoatTemplate } = await import("../src/ocean/boat-visual.ts");
  const { boatPalettes } = await import("../src/ocean/palette.ts");
  const { waveHeight } = await import("../src/ocean/waves.ts");
  const scene = new Scene(new NullEngine());
  scene.useRightHandedSystem = true;
  scene.activeCamera = new FreeCamera("cam", new Vector3(0, 8, 12), scene);
  const water = createWater(scene);
  const layer = createClearWater(scene, water);
  assert.ok(layer, "the layer exists");
  assert.equal(layer.enabled, true);
  assert.ok(scene.customRenderTargets.includes(layer.texture));
  // A boat and the fishing gear exist after the layer: they are picked up when they appear.
  const boat = createBoatTemplate(scene, boatPalettes[0], "boat-0");
  assert.ok(boat);
  const gear = new FishingGear(scene);
  const view = {
    phase: "fighting",
    power: 0,
    flight: 1,
    nibbleAges: [],
    hurry: 0,
    landing: { x: 0, z: -20 },
    species: "tom-hum",
    size: 0.4,
    fight: {
      mood: "surge",
      tension: 0.4,
      distance: 14,
      stamina: 0.5,
      reeling: false,
      progress: 0.7,
      elapsed: 3,
    },
  };
  const tip = { x: 0, y: 3.6, z: 0 };
  for (let t = 10; t < 12; t += 1 / 30)
    gear.update({ view, tip, preview: undefined, time: t });
  const fish = scene.getTransformNodeByName("hooked-fish");
  assert.ok(
    fish.position.y < waveHeight(fish.position.x, fish.position.z, 11.97),
  );
  const body = scene.getMeshByName("hooked-fish-body");
  // The fish keeps the gear's underwater skin; the layer only records its distance for the sea.
  assert.equal(body.material.name, "underwater-skin");
  const sea = scene.getMaterialByName("sea");
  assert.equal(sea._floats.underOn, 1, "the water reads the layer");
  assert.equal(sea._textures.underMap, layer.texture);
  assert.ok(layer.isDrawnBy(body), "the layer holds the fish's distance");
  assert.ok(
    !layer.isDrawnBy(scene.getMeshByName("gear-under-line")),
    "the line keeps its own skin",
  );
  assert.ok(scene.getMeshByName("gear-under-line").isVisible);
  // Switched off (slow frames), the layer is not rendered and the sea is opaque again.
  layer.setEnabled(false);
  assert.ok(!scene.customRenderTargets.includes(layer.texture));
  assert.equal(
    sea._floats.underOn,
    0,
    "the water reads nothing: the opaque sea",
  );
  assert.notEqual(sea._textures.underMap, layer.texture);
  layer.setEnabled(true);
  assert.equal(sea._floats.underOn, 1);
  assert.ok(scene.customRenderTargets.includes(layer.texture));
  gear.dispose();
  layer.dispose();
  scene.dispose();
});
