import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every object colour of the sea game comes from src/ocean/art/colors.ts by role. A hex of
// its own in a visual file is how the look drifted apart, so the files already moved over
// may not grow one again (the 0x6d2b79f5 constant is a random-number step, not a colour).
const MIGRATED = [
  "boat-visual.ts",
  "rod-visual.ts",
  "sea-props.ts",
  "island-visual.ts",
  "island-props.ts",
  "npc-look.ts",
  "npc-visual.ts",
];

test("migrated visual files take their colours from the shared palette", () => {
  for (const file of MIGRATED) {
    const source = readFileSync(`src/ocean/${file}`, "utf8");
    const raw = (source.match(/0x[0-9a-fA-F]{6}\b/g) ?? []).filter(
      (hex) => hex.toLowerCase() !== "0x6d2b79f5",
    );
    assert.deepEqual(
      raw,
      [],
      `${file} has colours of its own: ${raw.join(", ")}`,
    );
    assert.ok(source.includes("art/colors"), `${file} imports the palette`);
  }
});

test("the shared palette has no duplicate colours under two names", () => {
  const source = readFileSync("src/ocean/art/colors.ts", "utf8");
  const seen = new Map();
  for (const [, hex] of source.matchAll(/(0x[0-9a-fA-F]{6})/g)) {
    seen.set(hex.toLowerCase(), (seen.get(hex.toLowerCase()) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([hex]) => hex);
  assert.deepEqual(dupes, [], `colours written twice: ${dupes.join(", ")}`);
});

// Materials come from art/materials.ts: a visual file that builds a StandardMaterial itself
// is a second way of lighting objects.
const MATERIAL_FILES = [
  ...MIGRATED,
  "creature-kit.ts",
  "fishing-gear.ts",
  "ribbon.ts",
];

test("objects get their materials from the shared factory", () => {
  for (const file of MATERIAL_FILES) {
    const source = readFileSync(`src/ocean/${file}`, "utf8");
    assert.ok(
      !/new (Standard|PBR)Material\(/.test(source),
      `${file} builds a material of its own`,
    );
  }
});

// Round and boxy parts come from art/shapes.ts, so every object is rounded by the same tiers.
test("objects build their primitives through the shared shape helpers", () => {
  for (const file of [
    "boat-visual.ts",
    "sea-props.ts",
    "rod-visual.ts",
    "island-visual.ts",
    "fishing-gear.ts",
  ]) {
    const source = readFileSync(`src/ocean/${file}`, "utf8");
    assert.ok(
      !/MeshBuilder\.Create(Box|Cylinder|Sphere|Torus)\(/.test(source),
      `${file} builds a primitive on its own`,
    );
  }
});

// One light rig (art/lighting.ts) and one shading rule (art/toon.ts, added by the solid
// materials): an object that adds its own light breaks the shared look.
test("only the shared light rig creates lights", async () => {
  const { readdirSync } = await import("node:fs");
  for (const file of readdirSync("src/ocean")) {
    // _sheet.ts renders the creature contact sheet off screen, outside the sea.
    if (!file.endsWith(".ts") || file === "_sheet.ts") continue;
    const source = readFileSync(`src/ocean/${file}`, "utf8");
    assert.ok(
      !/new (Hemispheric|Directional|Point|Spot)Light\(/.test(source),
      `${file} adds a light of its own`,
    );
  }
});

// The boat is drawn once per player in the sea: it may be detailed, but stays cheap enough
// for a phone to draw a dozen of them.
test("a boat stays within a phone-sized triangle budget", async () => {
  const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
  const { Scene } = await import("@babylonjs/core/scene.js");
  const { createBoatTemplate, boatPalettes } = await import(
    "../src/ocean/boat-visual.ts"
  );
  const scene = new Scene(new NullEngine());
  const boat = createBoatTemplate(scene, boatPalettes[0], "budget-boat");
  const triangles = boat.getTotalIndices() / 3;
  assert.ok(triangles > 3000, `${triangles} triangles is too bare`);
  assert.ok(triangles < 12000, `${triangles} triangles is too many`);
  scene.dispose();
});
