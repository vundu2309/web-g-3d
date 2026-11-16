import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLEAR,
  ClearWaterGovernor,
  QUALITY,
  UNDER_FRAGMENT,
  UNDER_SAMPLES,
  UNDER_SCALE,
  UNDER_VERTEX,
  deepness,
  glslUnderLayer,
  lightPath,
  refractedDown,
  shownAt,
  shownSight,
  sight,
  transmit,
  underSize,
  underwaterCapable,
  underwaterReach,
  viewPath,
  waterlineFade,
} from "../src/ocean/clear-water.ts";
import { WATER_ABSORPTION } from "../src/ocean/sea-style.ts";
import { MAX_WAVE_HEIGHT } from "../src/ocean/waves.ts";
import { ScaleGovernor } from "../src/ocean/render-scale.ts";

const read = (file) =>
  readFileSync(new URL(`../src/ocean/${file}`, import.meta.url), "utf8");

// Clear water (clear-water.ts): the rules are pure and pinned here; the shaders are read as text
// (no GPU), and the scene part is checked with a headless engine at the bottom.

test("light that goes through the water loses red first, then green, and the more the deeper", () => {
  for (const path of [0.5, 1, 2, 4, 8]) {
    const [r, g, b] = transmit(path, WATER_ABSORPTION);
    assert.ok(r < g && g < b, `${path} m: red goes first, then green`);
    assert.ok(r > 0 && b <= 1);
  }
  assert.deepEqual(transmit(0, WATER_ABSORPTION), [1, 1, 1]);
  let last = 1;
  for (let path = 0.25; path <= 10; path += 0.25) {
    const [r] = transmit(path, WATER_ABSORPTION);
    assert.ok(r < last, "more water, less red");
    last = r;
  }
  // At two metres down a white hull has lost nearly all its red and keeps most of its blue.
  const [r, g, b] = transmit(lightPath(2, 0.6), WATER_ABSORPTION);
  assert.ok(r < 0.05, `red ${r}`);
  assert.ok(g > 0.35 && b > 0.5, `green ${g}, blue ${b}`);
});

test("a thing under the water is seen less the deeper it is, and about 2 to 4 m is the limit", () => {
  assert.equal(sight(0), 1);
  let last = 1;
  for (let d = 0.1; d <= 6; d += 0.1) {
    const s = shownAt(d, 0.7, 40);
    assert.ok(s < last, "deeper is dimmer");
    last = s;
  }
  // A keel a metre down is clearly there; at four metres of vertical depth it is nearly gone.
  assert.ok(shownAt(0.8, 0.7, 40) > 0.5, `keel ${shownAt(0.8, 0.7, 40)}`);
  assert.ok(shownAt(4, 0.7, 40) < 0.2, `deep ${shownAt(4, 0.7, 40)}`);
  // Nothing at all is left far below.
  assert.ok(shownAt(12, 0.7, 40) < 0.01);
});

test("seen at a slant the path is longer, so a thing is fainter than straight below", () => {
  assert.ok(viewPath(1, 0.3) > viewPath(1, 1));
  assert.ok(shownAt(1, 0.3, 40) < shownAt(1, 1, 40));
  // The refracted ray bends toward the vertical: never flatter than the view ray, never past the limit.
  for (const up of [0.05, 0.3, 0.7, 1]) {
    assert.ok(refractedDown(up) >= up - 1e-9);
    assert.ok(viewPath(1, up) <= 1 / CLEAR.minDown + 1e-9);
  }
  assert.equal(refractedDown(1), 1);
});

test("the shallows are clearer than the deep, and nothing jumps where they meet", () => {
  assert.equal(deepness(0), 0);
  assert.equal(deepness(3), 0);
  assert.equal(deepness(13), 1);
  assert.equal(deepness(46), 1);
  for (const depth of [0.5, 1.5, 3]) {
    assert.ok(
      shownAt(depth, 0.7, 2) > shownAt(depth, 0.7, 40),
      `${depth} m: clearer in the shallows`,
    );
  }
  // Moving the water depth from the shelf to the open sea changes what is shown smoothly.
  for (const seen of [0.1, 0.4, 0.8]) {
    let last = shownSight(seen, 0);
    for (let water = 0; water <= 20; water += 0.05) {
      const now = shownSight(seen, water);
      assert.ok(
        Math.abs(now - last) < 0.02,
        `${seen} at ${water} m: ${last} -> ${now}`,
      );
      assert.ok(now <= last + 1e-12, "clearest in the shallows");
      last = now;
    }
  }
  // Nothing at all stays nothing, whatever the water: the open sea is unchanged where there is no object.
  assert.equal(shownSight(0, 0), 0);
  assert.equal(shownSight(0, 40), 0);
});

test("a faint sight is not raised into an outline: the shown sight is continuous in the sight, at every depth of water", () => {
  for (const water of [0, 2, 6, 13, 40]) {
    let last = shownSight(0, water);
    assert.equal(last, 0);
    for (let seen = 0.0005; seen <= 1; seen += 0.0005) {
      const now = shownSight(seen, water);
      assert.ok(
        Math.abs(now - last) < 0.01,
        `${water} m of water, sight ${seen.toFixed(4)}: ${last} -> ${now}`,
      );
      assert.ok(now >= last - 1e-12, "never less for more");
      last = now;
    }
    assert.ok(Math.abs(last - 1) < 1e-9, "full sight stays full");
  }
  // A rim at the old cut-off (0.004) stays a rim: it is not brought to 0.06.
  assert.ok(shownSight(0.004, 0) < 0.0045);
  assert.ok(shownSight(0.05, 0) < 0.06);
  // A clear thing is still brought forward over the shallows.
  assert.ok(shownSight(0.5, 0) > 0.6);
  // And the shader does the same: no cut-off branch, a blend.
  const layer = glslUnderLayer();
  assert.ok(!/sight > 0\.0\d+ \?/.test(layer));
  assert.match(
    layer,
    /mix\(sight, boosted, smoothstep\(0\.1000, 0\.4000, sight\)\)/,
  );
});

test("a lit thing fades in below the waterline, so a hull has no saw-tooth edge where it meets the waves", () => {
  assert.equal(waterlineFade(0), 0);
  assert.equal(waterlineFade(CLEAR.waterline), 1);
  assert.equal(waterlineFade(2), 1);
  let last = 0;
  for (let d = 0.01; d <= 0.4; d += 0.01) {
    const now = waterlineFade(d);
    assert.ok(now >= last && now - last < 0.12);
    last = now;
  }
  assert.match(
    UNDER_FRAGMENT,
    /seen \*= mix\(smoothstep\(0\.0, 0\.3000, depth\), 1\.0, unlit\);/,
  );
});

test("the layer is three quarters of the canvas in each direction and never empty", () => {
  assert.equal(UNDER_SCALE, 0.75);
  assert.deepEqual(underSize(1688, 780), { width: 1266, height: 585 });
  assert.deepEqual(underSize(1, 1), { width: 2, height: 2 });
});

test("the layer is multisampled and read softly, so a hull's silhouette is not a staircase", () => {
  assert.ok(UNDER_SAMPLES >= 4);
  assert.match(read("clear-water-pass.ts"), /texture\.samples = UNDER_SAMPLES/);
  assert.ok(
    CLEAR.blur >= 0.4 && CLEAR.blur <= 2,
    "soft, but a fish and a pile stay readable",
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
    "gear-under-line",
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

test("the layer's shader keeps only what is under the real waves and tints it by the sea's absorption", () => {
  // The shared wave function: the one the sea mesh and the boats use.
  assert.match(UNDER_FRAGMENT, /float waveHeight\(vec2 p, float t\)/);
  assert.match(UNDER_FRAGMENT, /waveHeight\(vWorld\.xz, time\) - vWorld\.y/);
  assert.match(UNDER_FRAGMENT, /if \(depth < 0\.0\) discard;/);
  // Above the highest wave a fragment is thrown away before any wave is summed.
  const top = CLEAR.top.toFixed(4);
  assert.ok(CLEAR.top > MAX_WAVE_HEIGHT);
  assert.ok(
    UNDER_FRAGMENT.indexOf(`vWorld.y > ${top}`) <
      UNDER_FRAGMENT.indexOf("waveHeight(vWorld.xz, time)"),
  );
  // The sea's own absorption, red first.
  const absorb = WATER_ABSORPTION.map((v) => v.toFixed(4)).join(", ");
  assert.ok(UNDER_FRAGMENT.includes(`vec3(${absorb})`));
  assert.match(
    UNDER_FRAGMENT,
    /gl_FragColor = vec4\(albedo \* lit \* left \* seen, seen\)/,
  );
  // Instanced and single meshes both work.
  assert.match(UNDER_VERTEX, /#ifdef INSTANCES/);
  assert.match(UNDER_VERTEX, /mat4\(world0, world1, world2, world3\)/);
});

test("the water shows the layer through itself, over its own body, under the mirror and the foam", () => {
  assert.match(
    glslUnderLayer(),
    /vec4 underLayerAt\(vec3 plane, vec2 slope, float deepness\)/,
  );
  const water = read("water.ts");
  assert.match(water, /glslUnderLayer\(\)/);
  assert.match(water, /uniform sampler2D underMap;/);
  assert.match(water, /uniform float underOn;/);
  const body = water.indexOf("vec3 body = floorColor");
  const layer = water.indexOf("underLayerAt(vWorld");
  const mirrored = water.indexOf("vec3 color = body * (1.0 - fresnel)");
  const foam = water.indexOf("color = mix(color, foamColor, foam);");
  assert.ok(body > 0 && layer > body, "the layer is mixed into the body");
  assert.ok(mirrored > layer, "the Fresnel mirror is applied over it");
  assert.ok(foam > mirrored, "and the foam over that");
  // Off: the old opaque look, one uniform test, no texture read.
  assert.match(water, /if \(underOn > 0\.5\)/);
  // The sea's vertex shader and mesh are untouched by the layer.
  const vertex = water.slice(
    water.indexOf('ShadersStore["seaVertexShader"]'),
    water.indexOf('ShadersStore["seaFragmentShader"]'),
  );
  assert.ok(vertex.length > 200 && !/underLayer|underMap|underOn/.test(vertex));
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

test("the headless scene: the layer is a texture the water reads, the meshes under the sea are drawn through it and the fish is drawn by the layer", async () => {
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
  gear.setClearWater(layer);
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
  // With the layer the fish wears the ordinary satin skin (the water hides it by depth, the layer draws it).
  assert.notEqual(body.material.name, "underwater-skin");
  const sea = scene.getMaterialByName("sea");
  assert.equal(sea._floats.underOn, 1, "the water reads the layer");
  assert.equal(sea._textures.underMap, layer.texture);
  assert.ok(layer.isDrawnBy(body), "the layer draws the fish");
  assert.ok(layer.isDrawnBy(scene.getMeshByName("gear-under-line")));
  assert.ok(scene.getMeshByName("gear-under-line").isVisible);
  // Switched off, the old look comes back by itself: the underwater skin, and the layer is not rendered.
  layer.setEnabled(false);
  gear.setClearWater(undefined);
  for (let t = 12; t < 13; t += 1 / 30)
    gear.update({ view, tip, preview: undefined, time: t });
  assert.equal(
    scene.getMeshByName("hooked-fish-body").material.name,
    "underwater-skin",
  );
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
