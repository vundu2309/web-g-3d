import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

const {
  BAIT_FILES,
  BAIT_LENGTH,
  baitFile,
  baitTierIndex,
  drawsModel,
  endLook,
} = await import("../src/ocean/bait-view.ts");
const { parseFishGlb } = await import("../src/ocean/glb-parts.ts");

// The bait on the end of the line (src/ocean/bait-view.ts): the orange fish lure is the default
// bait, kept as the game has always drawn it; the baits bought at the market replace it with their
// own models, the same half metre.
test("the four baits have their files, and an invalid tier is the default bait", () => {
  assert.deepEqual(
    [...BAIT_FILES],
    ["bait-giun.glb", "bait-tom.glb", "bait-ca-con.glb", "bait-muc.glb"],
  );
  for (const bad of [-1, 4, 1.5, NaN, "1", null, undefined, {}])
    assert.equal(baitTierIndex(bad), 0, String(bad));
  assert.equal(baitFile(99), "bait-giun.glb");
  assert.equal(baitFile(2), "bait-ca-con.glb");
  for (const file of BAIT_FILES)
    assert.doesNotThrow(
      () =>
        parseFishGlb(
          readFileSync(new URL(`../public/models/${file}`, import.meta.url)),
        ),
      file,
    );
});

test("the default bait is the orange lure; every other bait draws its own model", () => {
  assert.equal(drawsModel(0), false);
  assert.equal(drawsModel(99), false, "an invalid tier is the default");
  for (const tier of [1, 2, 3]) assert.equal(drawsModel(tier), true);
  assert.equal(
    BAIT_LENGTH,
    0.5,
    "the length of the lure, so a bait is as easy to find",
  );
});

test("the end of the line shows the lure until the chosen model has loaded, then only the model, and nothing when it is not shown", () => {
  const none = [false, false, false, false];
  const some = [false, true, false, false];
  // default bait: always the lure
  assert.deepEqual(endLook(0, none, true), { lure: true, model: undefined });
  assert.deepEqual(
    endLook(0, some, true),
    { lure: true, model: undefined },
    "a loaded model of another tier does not matter",
  );
  // a bought bait: the lure stands in until its model is there
  assert.deepEqual(endLook(1, none, true), { lure: true, model: undefined });
  assert.deepEqual(endLook(1, some, true), { lure: false, model: 1 });
  assert.deepEqual(
    endLook(2, some, true),
    { lure: true, model: undefined },
    "tier 2 is not loaded",
  );
  // hidden: neither
  for (const tier of [0, 1, 2, 3])
    assert.deepEqual(endLook(tier, some, false), {
      lure: false,
      model: undefined,
    });
  // an invalid tier is the default bait
  assert.deepEqual(endLook("x", some, true), { lure: true, model: undefined });
});

// ---------------------------------------------------------------------------------------------
// The gear (real meshes, headless; the model files are read from disk instead of fetched)
// ---------------------------------------------------------------------------------------------
test("a bought bait is built from its model at half a metre and hangs on the end of the line with the lure and the hook", async (t) => {
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const file = String(url).split("/").pop();
    const bytes = readFileSync(
      new URL(`../public/models/${file}`, import.meta.url),
    );
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  };
  // The gear paints its ripple textures on a canvas: a stand-in that draws nothing is enough here.
  const canvas = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return new Proxy(
        {},
        {
          get: (_, name) =>
            name === "createRadialGradient" || name === "createLinearGradient"
              ? () => ({ addColorStop() {} })
              : () => {},
          set: () => true,
        },
      );
    }
  };
  t.after(() => {
    globalThis.fetch = real;
    if (canvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = canvas;
  });
  const { FishingGear } = await import("../src/ocean/fishing-gear.ts");
  const scene = new Scene(new NullEngine());
  const gear = new FishingGear(scene);
  const end = scene.getTransformNodeByName("gear-end");
  assert.ok(end, "the end of the line is a node");
  assert.equal(scene.getMeshByName("gear-lure").parent, end);
  assert.equal(scene.getMeshByName("gear-hook").parent, end);
  gear.setBait(0);
  assert.equal(asked.length, 0, "the default bait needs no file");
  assert.equal(scene.getMeshByName("gear-bait-0"), null);
  gear.setBait(2);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(
    asked.map((u) => u.split("/").pop()),
    ["bait-ca-con.glb"],
  );
  const bait = scene.getMeshByName("gear-bait-2");
  assert.ok(bait, "the chosen bait is built once its model has loaded");
  assert.equal(bait.parent, end);
  const size = parseFishGlb(
    readFileSync(new URL("../public/models/bait-ca-con.glb", import.meta.url)),
  ).size;
  assert.ok(
    Math.abs(bait.scaling.x * size - BAIT_LENGTH) < 1e-9,
    "half a metre long",
  );
  assert.equal(bait.isPickable, false);
  gear.setBait(2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(asked.length, 1, "a bait is loaded once");
  gear.setBait(99);
  assert.equal(
    scene.getMeshByName("gear-bait-99"),
    null,
    "an invalid tier is the default bait",
  );
  gear.dispose();
  assert.equal(
    scene.getMeshByName("gear-bait-2"),
    null,
    "disposed with the gear",
  );
  scene.dispose();
});
