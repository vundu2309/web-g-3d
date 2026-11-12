import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { MARKETS } from "../src/ocean/market.ts";
import { PAL } from "../src/ocean/art/colors.ts";

// The GLB models made by the Blender pipeline (tools/blender, public/models) must stay valid,
// painted with vertex colours, inside their triangle budget and animatable: the game loads them
// without Blender, so a bad file would only show up in a player's browser.
const BUDGET = { body: 4500, arm: 600 };

function readGlb(path) {
  const data = readFileSync(path);
  assert.equal(data.toString("ascii", 0, 4), "glTF", `${path} is a GLB`);
  assert.equal(data.readUInt32LE(4), 2, "glTF 2.0");
  assert.equal(data.readUInt32LE(8), data.length, "declared length matches");
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
}

const PEOPLE = readdirSync(new URL("../public/models/", import.meta.url))
  .filter((file) => /^people-\d\.glb$/.test(file))
  .sort();

test("all five people are built and every market's vendor is one of them", () => {
  assert.deepEqual(
    PEOPLE,
    [1, 2, 3, 4, 5].map((n) => `people-${n}.glb`),
  );
  for (const market of MARKETS)
    assert.ok(
      existsSync(
        new URL(`../public/models/${market.vendor.model}`, import.meta.url),
      ),
      `${market.id}: public/models/${market.vendor.model}`,
    );
});

test("every person has a body, a waving arm and baked colours, within budget", () => {
  for (const file of PEOPLE) {
    const gltf = readGlb(new URL(`../public/models/${file}`, import.meta.url));
    const names = gltf.nodes.map((n) => n.name);
    assert.ok(names.includes("vendor_body"), `${file}: vendor_body`);
    const pivot = gltf.nodes.find((n) => n.name === "arm_wave");
    assert.ok(pivot, `${file}: arm_wave pivot`);
    assert.equal(
      pivot.children?.length,
      1,
      `${file}: the arm hangs from the pivot`,
    );
    let triangles = { body: 0, arm: 0 };
    for (const node of gltf.nodes) {
      if (node.mesh === undefined) continue;
      const mesh = gltf.meshes[node.mesh];
      for (const primitive of mesh.primitives) {
        assert.ok(
          primitive.attributes.COLOR_0 !== undefined,
          `${node.name}: vertex colours`,
        );
        const count = gltf.accessors[primitive.indices].count / 3;
        if (node.name === "vendor_body") triangles.body += count;
        else triangles.arm += count;
      }
    }
    assert.ok(
      triangles.body > 2000 && triangles.body <= BUDGET.body,
      `${file} body ${triangles.body}`,
    );
    assert.ok(
      triangles.arm > 200 && triangles.arm <= BUDGET.arm,
      `${file} arm ${triangles.arm}`,
    );
    // about 1.6-1.85 m tall (the position accessor's bounds, scaled by the node)
    const body = gltf.nodes.find((n) => n.name === "vendor_body");
    const pos =
      gltf.accessors[gltf.meshes[body.mesh].primitives[0].attributes.POSITION];
    const height = (pos.max[1] - pos.min[1]) * (body.scale?.[1] ?? 1);
    assert.ok(height > 1.5 && height < 1.9, `${file} height ${height}`);
  }
});

test("the Blender palette is the game's palette", () => {
  const written = JSON.parse(
    readFileSync(
      new URL("../tools/blender/palette.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    written,
    JSON.parse(JSON.stringify(PAL)),
    "run `npm run assets:palette`",
  );
});
