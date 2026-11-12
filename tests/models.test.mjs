import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { MARKETS } from "../src/ocean/market.ts";
import { PAL } from "../src/ocean/art/colors.ts";

// The GLB models made by the Blender pipeline (tools/blender, public/models) must stay valid,
// painted with vertex colours, inside their triangle budget and animatable: the game loads them
// without Blender, so a bad file would only show up in a player's browser.
const BUDGET = { body: 3300, arm: 500 };

function readGlb(path) {
  const data = readFileSync(path);
  assert.equal(data.toString("ascii", 0, 4), "glTF", `${path} is a GLB`);
  assert.equal(data.readUInt32LE(4), 2, "glTF 2.0");
  assert.equal(data.readUInt32LE(8), data.length, "declared length matches");
  const jsonLength = data.readUInt32LE(12);
  return JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
}

test("every market has a vendor model with a body, a waving arm and baked colours", () => {
  for (const market of MARKETS) {
    const file = new URL(
      `../public/models/vendor-${market.id}.glb`,
      import.meta.url,
    );
    assert.ok(
      existsSync(file),
      `${market.id}: public/models/vendor-${market.id}.glb`,
    );
    const gltf = readGlb(file);
    const names = gltf.nodes.map((n) => n.name);
    assert.ok(names.includes("vendor_body"), `${market.id}: vendor_body`);
    assert.ok(names.includes("arm_wave"), `${market.id}: arm_wave pivot`);
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
      triangles.body > 500 && triangles.body <= BUDGET.body,
      `${market.id} body ${triangles.body}`,
    );
    assert.ok(
      triangles.arm > 50 && triangles.arm <= BUDGET.arm,
      `${market.id} arm ${triangles.arm}`,
    );
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
