import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readGlb } from "./support/glb.mjs";
import {
  allFishFiles,
  creatureOf,
  fishFile,
  parseFishGlb,
} from "../src/ocean/glb-parts.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { projectCreature } from "../src/ocean/creature-thumb.ts";

// The sea animals (public/models/fish-<species id>.glb, made from community models by
// tools/blender/sea_import.py): the plain-TS parser (no WebGL), the file table and the loader. The
// real files are read, so a bad export is caught here, with tests/support/glb.mjs as an independent
// second reader.
const IDS = SPECIES.map((species) => species.id);
const FILES = allFishFiles(IDS);
const TEMPLATES = new Map(
  FILES.map((file) => [
    file,
    parseFishGlb(
      readFileSync(new URL(`../public/models/${file}`, import.meta.url)),
    ),
  ]),
);

/**
 * The triangles of each model as it was downloaded (counted in Blender after its modifiers).
 * The export must not change them: the user asked that no model be reduced.
 */
const SOURCE_TRIANGLES = {
  "ca-madeka": 6032,
  "cua-bien": 78048,
  "sao-bien": 10732,
  sua: 58756,
  "ca-he": 11136,
  "ca-ngua": 36136,
  "rua-bien": 17512,
  "tom-hum": 10214,
  "ca-heo": 600,
  "ca-map": 7096,
};

/** The four role colours of the old body-plan models, which a real colour must never equal. */
const OLD_SENTINELS = new Set(["255,0,1", "0,255,1", "1,0,255", "255,255,1"]);

test("there is one file per species, named after its id, and none of the old body-plan files is left", () => {
  assert.deepEqual(
    IDS.slice().sort(),
    Object.keys(SOURCE_TRIANGLES).sort(),
    "the expected triangle table covers every species",
  );
  for (const species of SPECIES) {
    assert.equal(fishFile(species.id), `fish-${species.id}.glb`);
    assert.ok(
      existsSync(
        new URL(`../public/models/${fishFile(species.id)}`, import.meta.url),
      ),
      `${species.id} has its file`,
    );
  }
  const onDisk = readdirSync(new URL("../public/models/", import.meta.url))
    .filter((name) => name.startsWith("fish-"))
    .sort();
  assert.deepEqual(
    onDisk,
    FILES.slice().sort(),
    "no file belongs to no species",
  );
});

test("each file has the root fish with body and hook, and a sound mesh", () => {
  for (const file of FILES) {
    const { gltf } = readGlb(`public/models/${file}`);
    assert.deepEqual(
      gltf.nodes.map((n) => n.name).sort(),
      ["body", "fish", "hook"],
      file,
    );
    const root = gltf.nodes.find((n) => n.name === "fish");
    assert.equal(
      root.translation ?? root.rotation ?? root.scale,
      undefined,
      `${file}: root has no transform`,
    );
    const t = TEMPLATES.get(file);
    assert.equal(t.tail, undefined, `${file} is a single mesh`);
    const part = t.main;
    const vertices = part.positions.length / 3;
    assert.ok(vertices > 0 && part.positions.every(Number.isFinite), file);
    assert.equal(part.normals.length, part.positions.length, `${file} normals`);
    assert.ok(
      part.normals.every((v) => Number.isFinite(v)),
      `${file} normals are numbers`,
    );
    assert.equal(part.colors.length, vertices * 4, `${file} colours`);
    assert.equal(part.indices.length % 3, 0, file);
    assert.ok(
      part.indices.every((i) => Number.isInteger(i) && i >= 0 && i < vertices),
      `${file} indices`,
    );
    assert.ok(
      part.colors.every((v) => v >= 0 && v <= 1),
      `${file} colours in range`,
    );
  }
});

test("every model keeps the triangle count of the model it came from, and agrees with an independent reader", () => {
  for (const species of SPECIES) {
    const file = fishFile(species.id);
    const t = TEMPLATES.get(file);
    const triangles = t.main.indices.length / 3;
    assert.equal(
      triangles,
      SOURCE_TRIANGLES[species.id],
      `${species.id}: ${triangles} triangles`,
    );
    const { gltf, accessor } = readGlb(`public/models/${file}`);
    const node = gltf.nodes.find((n) => n.name === "body");
    let expected = 0;
    for (const p of gltf.meshes[node.mesh].primitives)
      expected += accessor(p.indices).count / 3;
    assert.equal(triangles, expected, `${file} agrees with the glb reader`);
  }
});

test("every file is one unit on its longest side, centred, nose toward +X, with the hook on the model", () => {
  for (const file of FILES) {
    const t = TEMPLATES.get(file);
    assert.ok(Math.abs(t.size - 1) < 1e-4, `${file} size ${t.size}`);
    for (let k = 0; k < 3; k++) {
      assert.ok(
        Math.abs(t.min[k] + t.max[k]) < 1e-3,
        `${file} is centred on axis ${k}`,
      );
      assert.ok(
        t.hook[k] >= t.min[k] - 1e-6 && t.hook[k] <= t.max[k] + 1e-6,
        `${file} hook axis ${k}: ${t.hook[k]} in ${t.min[k]}..${t.max[k]}`,
      );
    }
    assert.ok(t.hook[0] > 0, `${file}: the hook is on the +X side`);
  }
  // A jellyfish hangs tall, a seahorse stands: their longest side is up, the rest lie along X.
  for (const [id, axis] of [
    ["sua", 1],
    ["ca-ngua", 1],
  ]) {
    const t = TEMPLATES.get(fishFile(id));
    const sides = [0, 1, 2].map((k) => t.max[k] - t.min[k]);
    assert.equal(sides.indexOf(Math.max(...sides)), axis, `${id} is tall`);
  }
  // Every other animal is longest along its nose axis.
  for (const id of IDS.filter((id) => id !== "sua" && id !== "ca-ngua")) {
    const t = TEMPLATES.get(fishFile(id));
    const sides = [0, 1, 2].map((k) => t.max[k] - t.min[k]);
    assert.ok(
      sides[0] >= sides[1] - 1e-6 || sides[2] >= sides[1] - 1e-6,
      `${id} is not taller than it is long and wide`,
    );
  }
});

test("colours are final: none is a role sentinel of the old models, and each model has more than one colour", () => {
  for (const file of FILES) {
    const colors = TEMPLATES.get(file).main.colors;
    const seen = new Set();
    for (let v = 0; v < colors.length / 4; v++) {
      const key = [0, 1, 2]
        .map((k) => Math.round(colors[v * 4 + k] * 255))
        .join(",");
      assert.ok(!OLD_SENTINELS.has(key), `${file} has the sentinel ${key}`);
      if (seen.size < 40) seen.add(key);
    }
    assert.ok(seen.size > 1, `${file}: ${seen.size} different colours`);
  }
});

test("every species can be drawn as a store thumbnail from its model", () => {
  for (const species of SPECIES) {
    const creature = creatureOf(TEMPLATES.get(fishFile(species.id)));
    const thumb = projectCreature(creature);
    assert.equal(
      thumb.triangles.length,
      SOURCE_TRIANGLES[species.id],
      `${species.id} draws every triangle`,
    );
    assert.ok(thumb.maxX > thumb.minX && thumb.maxY > thumb.minY, species.id);
  }
});

test("the parser refuses what is not an animal file", () => {
  assert.throws(() => parseFishGlb(new Uint8Array(40)), /not a GLB/);
  const boat = readFileSync(
    new URL("../public/models/boat.glb", import.meta.url),
  );
  assert.throws(() => parseFishGlb(boat), /`body` mesh node|`hook` node/);
  const good = readFileSync(
    new URL("../public/models/fish-ca-map.glb", import.meta.url),
  );
  assert.throws(
    () => parseFishGlb(good.subarray(0, good.length - 8)),
    /length/,
  );
});

// ----- The loader (no browser: fetch is replaced) -----

const fetchFrom =
  (failing = []) =>
  async (url) => {
    const name = String(url).split("/").pop();
    if (failing.includes(name)) return { ok: false, status: 404 };
    const data = readFileSync(
      new URL(`../public/models/${name}`, import.meta.url),
    );
    return {
      ok: true,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  };

test("a file is fetched once, kept, and a failure is a warning and an undefined, retried only later", async () => {
  const { loadFishModel, cachedFishModel, loadFishFor } = await import(
    "../src/ocean/fish-models.ts"
  );
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const asked = [];
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  const fetcher = fetchFrom(["fish-missing.glb"]);
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return fetcher(url);
  };
  try {
    assert.equal(
      cachedFishModel("fish-ca-heo.glb"),
      undefined,
      "not loaded yet",
    );
    const [a, b] = await Promise.all([
      loadFishModel("fish-ca-heo.glb"),
      loadFishFor("ca-heo"),
    ]);
    assert.ok(a && a === b, "one parse shared");
    assert.equal(await loadFishModel("fish-ca-heo.glb"), a);
    assert.equal(cachedFishModel("fish-ca-heo.glb"), a);
    assert.equal(asked.length, 1, "downloaded once");
    const clock = 1000;
    assert.equal(
      await loadFishModel("fish-missing.glb", () => clock),
      undefined,
    );
    assert.equal(
      await loadFishModel("fish-missing.glb", () => clock + 5000),
      undefined,
    );
    assert.equal(asked.length, 2, "not asked again within the pause");
    assert.equal(warnings.length, 1, "one warning");
    assert.match(warnings[0], /fish-missing\.glb/);
    await loadFishModel("fish-missing.glb", () => clock + 60_000);
    assert.equal(asked.length, 3, "asked again after the pause");
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});

// ----- The scene's animal (Babylon with no GPU) -----

test("an animal is a plain stand-in until its file arrives, then becomes the model in place; a failed file leaves the stand-in", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { createCreature } = await import("../src/ocean/creature-kit.ts");
  const { loadFishModel, cachedFishModel } = await import(
    "../src/ocean/fish-models.ts"
  );
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  const fetcher = fetchFrom();
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("fish-ca-map.glb")) throw new Error("offline");
    return fetcher(url);
  };
  const scene = new Scene(new NullEngine());
  try {
    assert.equal(cachedFishModel("fish-ca-he.glb"), undefined);
    const fish = createCreature(scene, "t", "ca-he");
    const stand = fish.creature;
    assert.equal(fish.fromModel, false, "the stand-in while loading");
    assert.equal(fish.tail, undefined, "the stand-in has no tail");
    assert.ok(fish.body.getTotalIndices() / 3 < 300, "the stand-in is small");
    const root = fish.root;
    const was = fish.body;
    await loadFishModel("fish-ca-he.glb");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fish.fromModel, true, "the model after its file arrives");
    assert.equal(fish.root, root, "same root: the gear keeps its pose node");
    assert.ok(was.isDisposed(), "the stand-in's mesh is gone");
    assert.notEqual(fish.creature, stand);
    const template = cachedFishModel("fish-ca-he.glb");
    assert.equal(
      fish.body.getTotalIndices() / 3,
      template.main.indices.length / 3,
    );
    assert.equal(fish.tail, undefined, "the models have no tail to swing");
    assert.deepEqual(fish.creature.hook, template.hook);
    // The mesh carries the model's own colours, not a species colour.
    const colors = fish.body.getVerticesData("color");
    assert.deepEqual(
      [...colors.slice(0, 3)].map((v) => Math.fround(v)),
      template.main.colors.slice(0, 3).map((v) => Math.fround(v)),
    );
    // A model that is already loaded is used at once.
    const quick = createCreature(scene, "q", "ca-he");
    assert.equal(quick.fromModel, true);
    // A file that cannot be had leaves the stand-in, and nothing throws.
    const shark = createCreature(scene, "s", "ca-map");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(shark.fromModel, false);
    assert.equal(
      warnings.filter((w) => w.includes("fish-ca-map.glb")).length,
      1,
      "one warning",
    );
    // Disposing before the file arrives is safe.
    const early = createCreature(scene, "e", "sao-bien");
    early.dispose();
    await loadFishModel("fish-sao-bien.glb");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(early.fromModel, false, "a disposed animal is not rebuilt");
    fish.dispose();
    assert.ok(fish.body.isDisposed());
  } finally {
    scene.dispose();
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});

// ----- How a landed animal hangs -----

test("every animal gets a finite hang pose with the line ending near its hook", async () => {
  const { hangPose } = await import("../src/ocean/creature-hang.ts");
  const { placeholderCreature } = await import(
    "../src/ocean/creature-geometry.ts"
  );
  for (const creature of [
    placeholderCreature(),
    ...IDS.map((id) => creatureOf(TEMPLATES.get(fishFile(id)))),
  ]) {
    const { roll, drop } = hangPose(creature);
    assert.ok(
      Number.isFinite(roll) &&
        Number.isFinite(drop) &&
        drop > 0.2 &&
        drop < 0.8,
      `${drop}`,
    );
    assert.equal(hangPose(creature), hangPose(creature), "kept per animal");
  }
});

// ----- The store picture -----

test("a store cell stays empty until its model has arrived, then draws it; a failed file leaves it empty", async () => {
  const { showFishThumb, fishThumb } = await import("../src/app/fish-thumb.ts");
  const { speciesById } = await import("../src/ocean/fishing.ts");
  const drawn = [];
  const realDocument = globalThis.document;
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  console.warn = () => {};
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {
          drawn.push(this.fillStyle);
        },
        stroke() {},
      }),
      toDataURL() {
        return `data:image/png;triangles=${drawn.length}`;
      },
    }),
  };
  globalThis.fetch = fetchFrom(["fish-tom-hum.glb"]);
  try {
    const picture = { src: "", width: 0, height: 0 };
    showFishThumb(picture, speciesById("rua-bien"), 130);
    assert.equal(picture.src, "", "empty while the file is on its way");
    assert.equal(picture.width, 130, "its shape is reserved at once");
    assert.equal(picture.height, 91);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(picture.src, /^data:image\/png/);
    assert.equal(
      Number(picture.src.split("=")[1]),
      SOURCE_TRIANGLES["rua-bien"],
      "every triangle of the model is drawn",
    );
    // Loaded: the next cell of that species is drawn at once, from the same cache.
    const again = { src: "", width: 0, height: 0 };
    showFishThumb(again, speciesById("rua-bien"), 130);
    assert.equal(again.src, picture.src);
    // A failed file: nothing to draw, and no stand-in picture of another animal.
    const lobster = { src: "", width: 0, height: 0 };
    showFishThumb(lobster, speciesById("tom-hum"), 130);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(lobster.src, "");
    assert.equal(fishThumb(speciesById("tom-hum"), 130), "");
  } finally {
    globalThis.document = realDocument;
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});
