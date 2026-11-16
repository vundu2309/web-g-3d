import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readGlb } from "./support/glb.mjs";
import { CREATURE_KINDS, buildCreature } from "../src/ocean/creatures.ts";
import { lighter, darker, rgb } from "../src/ocean/creature-geometry.ts";
import {
  FISH_OWN_FILES,
  FISH_ROLES,
  allFishFiles,
  fishColours,
  fishFile,
  paintFish,
  parseFishGlb,
  recolour,
} from "../src/ocean/glb-parts.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { projectCreature } from "../src/ocean/creature-thumb.ts";

// The sea animals from Blender (public/models/fish-*.glb, tools/blender/fish.py): the plain-TS
// parser (no WebGL), the species recolour, the file table and the loader. The real files are read,
// so a bad export is caught here, with tests/support/glb.mjs as an independent second reader.
const FILES = allFishFiles(CREATURE_KINDS);
const TEMPLATES = new Map(
  FILES.map((file) => [
    file,
    parseFishGlb(
      readFileSync(new URL(`../public/models/${file}`, import.meta.url)),
    ),
  ]),
);
/** The fixed colours every file keeps (pupil, mouth, blush, eye white, glint), as bytes. */
const FIXED = [
  [0x16, 0x12, 0x12],
  [0x8c, 0x4c, 0x44],
  [0xe3, 0x82, 0x8e],
  [0xf4, 0xf1, 0xea],
  [0xf6, 0xf8, 0xfa],
];
const byteKey = (colors, vertex) =>
  [0, 1, 2].map((k) => Math.round(colors[vertex * 4 + k] * 255)).join(",");
const sentinelKeys = new Set(
  Object.values(FISH_ROLES).map((bytes) => bytes.join(",")),
);
const fixedKeys = new Set(FIXED.map((bytes) => bytes.join(",")));

test("there is one file per body plan and one per species with its own, and each species names its file", () => {
  assert.equal(FILES.length, 18, "16 plans and 2 own files");
  assert.deepEqual(Object.keys(FISH_OWN_FILES).sort(), ["ca-he", "ca-ngu"]);
  for (const file of FILES)
    assert.ok(
      existsSync(new URL(`../public/models/${file}`, import.meta.url)),
      file,
    );
  const onDisk = readdirSync(
    new URL("../public/models", import.meta.url),
  ).filter((name) => name.startsWith("fish-"));
  assert.deepEqual([...onDisk].sort(), [...FILES].sort(), "no stray fish file");
  for (const kind of CREATURE_KINDS)
    assert.equal(fishFile(kind), `fish-${kind}.glb`);
  for (const species of SPECIES) {
    const file = fishFile(species.shape, species.id);
    assert.ok(FILES.includes(file), `${species.id} -> ${file}`);
    if (FISH_OWN_FILES[species.id])
      assert.equal(file, FISH_OWN_FILES[species.id]);
    else assert.equal(file, `fish-${species.shape}.glb`);
  }
});

test("each file has the root fish with body, hook and (except crab and starfish) a tail, and a sound mesh", () => {
  for (const file of FILES) {
    const { gltf } = readGlb(`public/models/${file}`);
    const names = gltf.nodes.map((n) => n.name).sort();
    const crabLike = /crab|starfish/.test(file);
    assert.deepEqual(
      names,
      crabLike ? ["body", "fish", "hook"] : ["body", "fish", "hook", "tail"],
      file,
    );
    const root = gltf.nodes.find((n) => n.name === "fish");
    assert.equal(
      root.translation ?? root.rotation ?? root.scale,
      undefined,
      `${file}: root has no transform`,
    );
    const t = TEMPLATES.get(file);
    assert.equal(Boolean(t.tail), !crabLike, `${file} tail`);
    for (const part of [t.main, t.tail?.part].filter(Boolean)) {
      const vertices = part.positions.length / 3;
      assert.ok(vertices > 0 && part.positions.every(Number.isFinite), file);
      assert.equal(
        part.normals.length,
        part.positions.length,
        `${file} normals`,
      );
      assert.equal(part.colors.length, vertices * 4, `${file} colours`);
      assert.equal(part.roles.length, vertices, `${file} roles`);
      assert.equal(part.indices.length % 3, 0, file);
      assert.ok(
        part.indices.every(
          (i) => Number.isInteger(i) && i >= 0 && i < vertices,
        ),
        `${file} indices`,
      );
      assert.ok(
        part.colors.every((v) => v >= 0 && v <= 1),
        `${file} colours in range`,
      );
    }
  }
});

test("triangle counts are under the budget and agree with an independent reader of the file", () => {
  let total = 0;
  for (const file of FILES) {
    const t = TEMPLATES.get(file);
    const triangles =
      t.main.indices.length / 3 + (t.tail ? t.tail.part.indices.length / 3 : 0);
    assert.ok(
      triangles >= 600 && triangles <= 1400,
      `${file}: ${triangles} triangles`,
    );
    total += triangles;
    const { gltf, accessor } = readGlb(`public/models/${file}`);
    let expected = 0;
    for (const name of ["body", "tail"]) {
      const node = gltf.nodes.find((n) => n.name === name);
      if (!node) continue;
      for (const p of gltf.meshes[node.mesh].primitives)
        expected += accessor(p.indices).count / 3;
    }
    assert.equal(triangles, expected, `${file} agrees with the glb reader`);
    // A tail's vertices are drawn relative to its pivot in the file; the part is in model space.
    if (t.tail) {
      const node = gltf.nodes.find((n) => n.name === "tail");
      assert.deepEqual(
        t.tail.pivot,
        node.translation.map((v) => Math.fround(v)),
      );
      const local = accessor(
        gltf.meshes[node.mesh].primitives[0].attributes.POSITION,
      ).data;
      for (let k = 0; k < 3; k++)
        assert.ok(
          Math.abs(
            t.tail.part.positions[k] - (local[k] + node.translation[k]),
          ) < 1e-6,
          `${file} tail shift`,
        );
    }
  }
  assert.ok(total < 20000, `all 18 files together: ${total} triangles`);
});

test("every file is about a unit long and has the hook inside the model", () => {
  for (const file of FILES) {
    const t = TEMPLATES.get(file);
    assert.ok(
      t.size > 0.7 && t.size < 1.45,
      `${file} size ${t.size.toFixed(2)}`,
    );
    for (let k = 0; k < 3; k++)
      assert.ok(
        t.hook[k] >= t.min[k] - 1e-6 && t.hook[k] <= t.max[k] + 1e-6,
        `${file} hook axis ${k}: ${t.hook[k]} in ${t.min[k]}..${t.max[k]}`,
      );
  }
});

test("each file carries every role it should, and only roles and the five fixed colours", () => {
  for (const file of FILES) {
    const t = TEMPLATES.get(file);
    const counts = { fixed: 0, body: 0, fin: 0, belly: 0, mark: 0 };
    const names = Object.keys(FISH_ROLES);
    for (const part of [t.main, t.tail?.part].filter(Boolean))
      for (let v = 0; v < part.roles.length; v++) {
        const role = part.roles[v];
        const key = byteKey(part.colors, v);
        if (role === 0) {
          counts.fixed++;
          // Nothing is baked but the five fixed colours: a colour that is neither a role nor
          // one of them would stay the same on every species.
          assert.ok(fixedKeys.has(key), `${file}: unexpected colour ${key}`);
        } else {
          counts[names[role - 1]]++;
          assert.equal(
            key,
            FISH_ROLES[names[role - 1]].join(","),
            `${file}: role colour`,
          );
        }
      }
    assert.ok(counts.body > 100, `${file} body ${counts.body}`);
    assert.ok(counts.belly > 20, `${file} belly ${counts.belly}`);
    if (!file.includes("octopus"))
      assert.ok(counts.fin > 20, `${file} fin ${counts.fin}`);
    else assert.equal(counts.fin, 0, "the octopus has no fins");
    assert.ok(
      counts.fixed > 150,
      `${file} keeps its fixed colours (${counts.fixed})`,
    );
  }
});

test("the species colours replace every role colour, keep the fixed ones, and leave nothing of the sentinels", () => {
  for (const species of SPECIES) {
    const file = fishFile(species.shape, species.id);
    const t = TEMPLATES.get(file);
    const colours = fishColours(
      species.shape,
      species.body,
      species.fin,
      species.look,
    );
    const creature = paintFish(t, colours);
    const names = Object.keys(FISH_ROLES);
    const parts = [
      [t.main, creature.main],
      ...(t.tail ? [[t.tail.part, creature.tail.part]] : []),
    ];
    for (const [source, painted] of parts) {
      assert.equal(painted.colors.length, source.colors.length);
      for (let v = 0; v < source.roles.length; v++) {
        const role = source.roles[v];
        const key = byteKey(painted.colors, v);
        assert.ok(
          !sentinelKeys.has(key),
          `${species.id}: a sentinel colour is left`,
        );
        assert.equal(painted.colors[v * 4 + 3], 1, "alpha stays 1");
        if (role === 0)
          // Fixed colours (and the baked iris and details) are untouched, bit for bit.
          for (let k = 0; k < 4; k++)
            assert.equal(painted.colors[v * 4 + k], source.colors[v * 4 + k]);
        else {
          const wanted = colours[names[role - 1]];
          for (let k = 0; k < 3; k++)
            assert.equal(
              painted.colors[v * 4 + k],
              wanted[k],
              `${species.id} role ${names[role - 1]}`,
            );
        }
      }
      // The five fixed colours are still all there where they were.
      const keep = (colors) =>
        [...Array(colors.length / 4).keys()].filter((v) =>
          fixedKeys.has(byteKey(colors, v)),
        ).length;
      assert.equal(
        keep(painted.colors),
        keep(source.colors),
        `${species.id} fixed colours`,
      );
    }
    // The template itself is not touched by painting.
    assert.ok(
      t.main.colors.some((_, i) => i % 4 === 0 && t.main.colors[i] === 1),
    );
    // Shape and creature fields are the ones the scene and the thumbnails read.
    assert.deepEqual(creature.hook, t.hook);
    assert.equal(
      creature.main.positions,
      t.main.positions,
      "positions are shared, not copied",
    );
  }
});

test("two species of one body plan differ only in colour", () => {
  const t = TEMPLATES.get(fishFile("round"));
  const a = paintFish(t, fishColours("round", "#ff0000", "#00ff00"));
  const b = paintFish(t, fishColours("round", "#0000ff", "#00ff00"));
  assert.equal(a.main.positions, b.main.positions);
  assert.notDeepEqual(a.main.colors, b.main.colors);
  const bodyVertex = t.main.roles.indexOf(1);
  assert.deepEqual(
    a.main.colors.slice(bodyVertex * 4, bodyVertex * 4 + 3),
    [1, 0, 0],
  );
  assert.deepEqual(
    b.main.colors.slice(bodyVertex * 4, bodyVertex * 4 + 3),
    [0, 0, 1],
  );
});

test("belly and marking use the Look's colours, else the same helpers as the code-built animals", () => {
  const body = rgb("#7fb6c9");
  const plain = fishColours("diamond", "#7fb6c9", "#4f8aa3");
  assert.deepEqual(plain.belly, lighter(body, 0.62));
  assert.deepEqual(plain.mark, darker(body, 0.45));
  assert.deepEqual(plain.fin, rgb("#4f8aa3"));
  const given = fishColours("diamond", "#7fb6c9", "#4f8aa3", {
    belly: "#f1f4f7",
    mark: "#14304f",
  });
  assert.deepEqual(given.belly, rgb("#f1f4f7"));
  assert.deepEqual(given.mark, rgb("#14304f"));
  // A slim fish keeps its plan's pale stripe when the species names no marking.
  assert.deepEqual(
    fishColours("slim", "#7fb6c9", "#4f8aa3").mark,
    rgb("#f4fbff"),
  );
});

test("recolour does not change the file's own data", () => {
  const t = TEMPLATES.get(fishFile("slim"));
  const before = t.main.colors.slice();
  recolour(t.main, fishColours("slim", "#123456", "#654321"));
  assert.deepEqual(t.main.colors, before);
});

test("every species can be drawn as a store thumbnail from its model", () => {
  for (const species of SPECIES) {
    const t = TEMPLATES.get(fishFile(species.shape, species.id));
    const thumb = projectCreature(
      paintFish(
        t,
        fishColours(species.shape, species.body, species.fin, species.look),
      ),
    );
    assert.ok(thumb.triangles.length > 600, `${species.id}`);
    for (const v of [thumb.minX, thumb.maxX, thumb.minY, thumb.maxY])
      assert.ok(Number.isFinite(v), `${species.id} extent`);
    assert.ok(thumb.maxX > thumb.minX && thumb.maxY > thumb.minY);
    for (let i = 1; i < thumb.triangles.length; i++)
      assert.ok(thumb.triangles[i - 1].depth >= thumb.triangles[i].depth);
    // The model is not the same picture as the code-built animal: it has its own triangles.
    const old = projectCreature(
      buildCreature(species.shape, species.body, species.fin, species.look),
    );
    assert.notEqual(thumb.triangles.length, old.triangles.length);
  }
});

test("the parser refuses what is not a fish file", () => {
  assert.throws(() => parseFishGlb(new Uint8Array(40)), /not a GLB/);
  const boat = readFileSync(
    new URL("../public/models/boat.glb", import.meta.url),
  );
  assert.throws(() => parseFishGlb(boat), /`body` mesh node|`hook` node/);
  const good = readFileSync(
    new URL("../public/models/fish-slim.glb", import.meta.url),
  );
  assert.throws(
    () => parseFishGlb(good.subarray(0, good.length - 8)),
    /length/,
  );
});

// ----- The loader (no browser: fetch is replaced) -----

test("a file is fetched once, kept, and a failure is a warning and an undefined, retried only later", async () => {
  const { loadFishModel, cachedFishModel, loadFishFor } = await import(
    "../src/ocean/fish-models.ts"
  );
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const asked = [];
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const name = String(url).split("/").pop();
    if (name === "fish-missing.glb") return { ok: false, status: 404 };
    const data = readFileSync(
      new URL(`../public/models/${name}`, import.meta.url),
    );
    return {
      ok: true,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  };
  try {
    assert.equal(cachedFishModel("fish-slim.glb"), undefined, "not loaded yet");
    const [a, b] = await Promise.all([
      loadFishModel("fish-slim.glb"),
      loadFishFor("slim"),
    ]);
    assert.ok(a && a === b, "one parse shared");
    assert.equal(await loadFishModel("fish-slim.glb"), a);
    assert.equal(cachedFishModel("fish-slim.glb"), a);
    assert.equal(asked.length, 1, "downloaded once");
    let clock = 1000;
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

test("an animal is code-built until its file arrives, then becomes the model in place; a failed file leaves the code-built one", async () => {
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
  globalThis.fetch = async (url) => {
    const name = String(url).split("/").pop();
    if (name === "fish-sword.glb") throw new Error("offline");
    const data = readFileSync(
      new URL(`../public/models/${name}`, import.meta.url),
    );
    return {
      ok: true,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  };
  const scene = new Scene(new NullEngine());
  try {
    assert.equal(cachedFishModel("fish-round.glb"), undefined);
    const fish = createCreature(scene, "t", "round", "#ff0000", "#00ff00");
    const stand = fish.creature;
    assert.equal(fish.fromModel, false, "the stand-in while loading");
    assert.ok(fish.tail, "the stand-in has a tail to swing");
    assert.ok(fish.body.getTotalIndices() / 3 > 1000, "code-built is dense");
    const root = fish.root;
    const was = fish.body;
    await loadFishModel("fish-round.glb");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fish.fromModel, true, "the model after its file arrives");
    assert.equal(fish.root, root, "same root: the gear keeps its pose node");
    assert.ok(was.isDisposed(), "the stand-in's mesh is gone");
    assert.notEqual(fish.creature, stand);
    const template = cachedFishModel("fish-round.glb");
    assert.equal(
      fish.body.getTotalIndices() / 3,
      template.main.indices.length / 3,
    );
    assert.deepEqual(
      [fish.tail.position.x, fish.tail.position.y, fish.tail.position.z],
      template.tail.pivot.map((v) => Math.fround(v)).map((v) => v),
    );
    assert.equal(fish.tail.parent, root);
    assert.deepEqual(fish.creature.hook, template.hook);
    // The mesh carries the species colour on its body vertices.
    const colors = fish.body.getVerticesData("color");
    const body = template.main.roles.indexOf(1);
    assert.deepEqual([...colors.slice(body * 4, body * 4 + 3)], [1, 0, 0]);
    // A model that is already loaded is used at once.
    const quick = createCreature(scene, "q", "round", "#0000ff", "#00ff00");
    assert.equal(quick.fromModel, true);
    // A file that cannot be had leaves the code-built animal, and nothing throws.
    const sword = createCreature(scene, "s", "sword", "#999999", "#999999");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sword.fromModel, false);
    assert.equal(
      warnings.filter((w) => w.includes("fish-sword.glb")).length,
      1,
      "one warning",
    );
    // Disposing before the file arrives is safe.
    const early = createCreature(scene, "e", "puffer", "#999999", "#999999");
    early.dispose();
    await loadFishModel("fish-puffer.glb");
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

test("a fish hangs nose up as before; the octopus by the top of its head and the seahorse by its snout, hook upward", async () => {
  const { hangPose } = await import("../src/ocean/creature-hang.ts");
  for (const kind of CREATURE_KINDS) {
    for (const creature of [
      paintFish(
        TEMPLATES.get(fishFile(kind)),
        fishColours(kind, "#999999", "#777777"),
      ),
      buildCreature(kind, "#999999", "#777777"),
    ]) {
      const { roll, drop } = hangPose(creature);
      assert.ok(
        Number.isFinite(roll) && drop > 0.3 && drop < 0.8,
        `${kind} ${drop}`,
      );
      // After the roll (about Z), the hook is straight above the origin, or the quarter turn of a fish.
      const [hx, hy] = creature.hook;
      const upX = hx * Math.cos(roll) - hy * Math.sin(roll);
      const upY = hx * Math.sin(roll) + hy * Math.cos(roll);
      if (kind === "octopus" || kind === "seahorse") {
        assert.ok(
          Math.abs(upX) < 1e-6 && upY > 0.3,
          `${kind} hangs by its hook`,
        );
        assert.notEqual(roll, Math.PI / 2, `${kind} is not laid on its side`);
      } else assert.equal(roll, Math.PI / 2, `${kind} hangs nose up`);
    }
  }
  const octopus = paintFish(
    TEMPLATES.get(fishFile("octopus")),
    fishColours("octopus", "#aa5599", "#aa5599"),
  );
  // The line ends at the top of the head: the origin is as far below it as the model reaches up.
  assert.ok(
    Math.abs(
      hangPose(octopus).drop - TEMPLATES.get(fishFile("octopus")).max[1],
    ) < 1e-9,
  );
  assert.equal(hangPose(octopus), hangPose(octopus), "kept per animal");
});

// ----- The store picture -----

test("a store cell stays empty until its model has arrived, then draws it; a failed file draws the code-built animal", async () => {
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
  globalThis.fetch = async (url) => {
    const name = String(url).split("/").pop();
    if (name === "fish-crab.glb") return { ok: false, status: 500 };
    const data = readFileSync(
      new URL(`../public/models/${name}`, import.meta.url),
    );
    return {
      ok: true,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  };
  try {
    const picture = { src: "", width: 0, height: 0 };
    showFishThumb(picture, speciesById("ca-mu"), 130);
    assert.equal(picture.src, "", "empty while the file is on its way");
    assert.equal(picture.width, 130, "its shape is reserved at once");
    assert.equal(picture.height, 91);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(picture.src, /^data:image\/png/);
    const model = Number(picture.src.split("=")[1]);
    assert.ok(model > 1000 && model < 1300, `a model's triangles: ${model}`);
    // Loaded: the next cell of that plan is drawn at once, from the same cache.
    const again = { src: "", width: 0, height: 0 };
    showFishThumb(again, speciesById("ca-mu"), 130);
    assert.equal(again.src, picture.src);
    // A failed file draws the code-built animal (a different, denser picture).
    const crab = { src: "", width: 0, height: 0 };
    showFishThumb(crab, speciesById("cua-bien"), 130);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(crab.src, /^data:image\/png/);
    assert.ok(Number(crab.src.split("=")[1]) > 0, "something is drawn");
    assert.equal(fishThumb(speciesById("cua-bien"), 130), crab.src);
  } finally {
    globalThis.document = realDocument;
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});
