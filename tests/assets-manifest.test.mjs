import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readGlb } from "./support/glb.mjs";

// tools/blender/assets.json lists every GLB the game serves: the script (or download) it comes
// from, the node names the game looks up and a triangle ceiling. A file added, removed or rebuilt
// without the catalogue (or the other way round) fails here, not in a player's browser.
const root = new URL("../", import.meta.url);
const { assets } = JSON.parse(
  readFileSync(new URL("tools/blender/assets.json", root), "utf8"),
);
const files = readdirSync(new URL("public/models/", root))
  .filter((file) => file.endsWith(".glb"))
  .sort();
const GROUPS = new Set([
  "bait",
  "boat",
  "shipyard",
  "patrol",
  "island-prop",
  "vendor",
  "person",
  "fish",
]);

// File names, by group: lower-case, hyphens, the id the game looks the model up by.
const NAMES = {
  bait: /^bait-[a-z]+(-[a-z]+)*\.glb$/,
  boat: /^boat(-[2-9])?\.glb$/,
  shipyard: /^shipyard\.glb$/,
  patrol: /^boat-patrol\.glb$/,
  "island-prop": /^(palm|rock|bush)-[1-9]\.glb$|^hut\.glb$/,
  vendor: /^cat-[a-z]+\.glb$/,
  person: /^people-[1-9]\.glb$/,
  fish: /^fish-[a-z]+(-[a-z]+)*\.glb$/,
};

test("the catalogue and public/models list the same files", () => {
  assert.deepEqual(Object.keys(assets).sort(), files);
});

test("every entry names its group and a source that exists", () => {
  for (const [file, entry] of Object.entries(assets)) {
    assert.ok(GROUPS.has(entry.group), `${file}: group ${entry.group}`);
    assert.ok(entry.how, `${file}: how it is made`);
    if (entry.source === "community") {
      assert.equal(
        entry.group,
        "fish",
        `${file}: only the animals are downloads`,
      );
      continue;
    }
    assert.ok(
      existsSync(new URL(entry.source, root)),
      `${file}: ${entry.source} exists`,
    );
  }
});

test("every file is named after its group", () => {
  for (const [file, entry] of Object.entries(assets))
    assert.match(file, NAMES[entry.group], `${file} (${entry.group})`);
});

test("every script in tools/blender is a source in the catalogue or is explained", () => {
  const { scripts } = JSON.parse(
    readFileSync(new URL("tools/blender/assets.json", root), "utf8"),
  );
  const sources = new Set(
    Object.values(assets).map((entry) =>
      entry.source.replace("tools/blender/", ""),
    ),
  );
  const present = readdirSync(new URL("tools/blender/", root))
    .filter((file) => file.endsWith(".py"))
    .sort();
  for (const file of present)
    assert.ok(
      sources.has(file) || scripts[file],
      `${file}: not a source of any model and not in "scripts"`,
    );
  for (const file of Object.keys(scripts))
    assert.ok(present.includes(file), `"scripts" lists ${file}, which is gone`);
});

test("every model is valid, painted with vertex colours, has its nodes and fits its ceiling", () => {
  for (const [file, entry] of Object.entries(assets)) {
    const { gltf } = readGlb(`public/models/${file}`);
    const names = gltf.nodes.map((node) => node.name);
    for (const node of entry.nodes)
      assert.ok(names.includes(node), `${file}: node "${node}"`);
    let triangles = 0;
    for (const node of gltf.nodes) {
      if (node.mesh === undefined) continue;
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        assert.ok(
          primitive.attributes.COLOR_0 !== undefined,
          `${file}/${node.name}: COLOR_0 (run lib.bake_colors before export)`,
        );
        triangles += gltf.accessors[primitive.indices].count / 3;
      }
    }
    assert.ok(
      triangles <= entry.maxTriangles,
      `${file}: ${triangles} triangles, ceiling ${entry.maxTriangles}`,
    );
  }
});
