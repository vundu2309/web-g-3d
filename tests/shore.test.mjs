import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { islandShape } from "../src/ocean/island-shape.ts";
import { islands, islandCollisionRadius } from "../src/ocean/model.ts";
import { BACKDROP } from "../src/ocean/sea-layout.ts";
import {
  COAST_SAMPLES,
  SHORE_ISLANDS,
  SURF_PERIOD,
  UPRUSH,
  coastAt,
  coastDistance,
  coastPixels,
  coastRows,
  decodeCoast,
  encodeCoast,
  glslShore,
  islandSeed,
  seabedDepth,
  shoreField,
  shoreShape,
  shoreTable,
  shoreUniform,
  surfPhase,
  swashFront,
} from "../src/ocean/shore.ts";

// The shore field is what the water's surf, depth and colour, the swash on the beaches, the
// minimap and the fishing zones all measure from. These tests pin it to the land itself.

test("every island the sea meets is in the shore field, the play area's first", () => {
  assert.equal(SHORE_ISLANDS.length, islands.length + BACKDROP.length);
  islands.forEach((island, i) => {
    assert.equal(SHORE_ISLANDS[i].x, island.x);
    assert.equal(SHORE_ISLANDS[i].z, island.z);
    assert.equal(SHORE_ISLANDS[i].radius, island.radius);
    assert.equal(SHORE_ISLANDS[i].seed, islandSeed(i));
  });
  // The game's islands are built with these seeds (babylon-scene.ts imports islandSeed).
  const scene = readFileSync(
    new URL("../src/ocean/babylon-scene.ts", import.meta.url),
    "utf8",
  );
  assert.match(scene, /seed: islandSeed\(index\)/);
});

test("the coast table matches the waterline of the terrain all round every island", () => {
  for (let index = 0; index < SHORE_ISLANDS.length; index++) {
    const { seed, radius } = SHORE_ISLANDS[index];
    const shape = islandShape(seed, radius);
    const table = shoreTable(index);
    assert.equal(table.length, COAST_SAMPLES);
    for (let k = 0; k < 360; k++) {
      const a = (k / 360) * Math.PI * 2 + 0.001;
      // March out from the centre to where the land meets the water.
      let waterline = 0;
      for (let r = radius * 0.6; r < radius * 1.2; r += 0.02)
        if (shape.height(Math.cos(a) * r, Math.sin(a) * r) > 0) waterline = r;
      const fromTable = coastAt(table, a).fraction * radius;
      assert.ok(
        Math.abs(fromTable - waterline) < 0.08,
        `island ${index} at ${a.toFixed(3)}: table ${fromTable} vs waterline ${waterline}`,
      );
    }
  }
});

test("the shore distance is the true distance to the coast, negative on land", () => {
  // Brute force against the coast as a fine polyline, at points from the sand out to 60 m.
  for (let index = 0; index < islands.length; index++) {
    const island = islands[index];
    const shape = shoreShape(index);
    const coast = [];
    for (let k = 0; k < 4000; k++) {
      const a = (k / 4000) * Math.PI * 2;
      const c = shape.coast(a);
      coast.push([island.x + Math.cos(a) * c, island.z + Math.sin(a) * c]);
    }
    for (let k = 0; k < 120; k++) {
      const a = k * 0.7;
      const r = shape.coast(a) + ((k * 37) % 70) - 8;
      const x = island.x + Math.cos(a) * r;
      const z = island.z + Math.sin(a) * r;
      let best = Infinity;
      for (const [cx, cz] of coast)
        best = Math.min(best, Math.hypot(x - cx, z - cz));
      const signed = r < shape.coast(a) ? -best : best;
      const field = shoreField(x, z, index, index + 1);
      // Within centimetres near the beach (where the surf is), within 2 % further out.
      assert.ok(
        Math.abs(field.distance - signed) <
          Math.max(0.1, Math.abs(signed) * 0.02),
        `island ${index}: field ${field.distance} vs ${signed}`,
      );
      // The normal points out to sea.
      const out = (x - island.x) * field.nx + (z - island.z) * field.nz;
      assert.ok(out > 0, "normal faces the sea");
      assert.ok(Math.abs(Math.hypot(field.nx, field.nz) - 1) < 1e-9);
    }
  }
  // Inside the ring boats collide with, the boats stay off the sand.
  islands.forEach((island) => {
    const ring = islandCollisionRadius(island);
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const d = coastDistance(
        island.x + Math.cos(a) * ring,
        island.z + Math.sin(a) * ring,
      );
      assert.ok(d > 1.5, `the ring is off the sand: ${d}`);
    }
  });
});

test("the coast texture stores the table exactly enough for the shader", () => {
  const pixels = coastPixels();
  assert.equal(pixels.length, COAST_SAMPLES * coastRows() * 4);
  assert.ok(coastRows() >= SHORE_ISLANDS.length);
  assert.equal(coastRows() & (coastRows() - 1), 0, "a power of two");
  for (let row = 0; row < SHORE_ISLANDS.length; row++) {
    const table = shoreTable(row);
    for (let k = 0; k < COAST_SAMPLES; k += 7) {
      const at = (row * COAST_SAMPLES + k) * 4;
      const decoded = decodeCoast(pixels[at], pixels[at + 1]);
      assert.ok(Math.abs(decoded - table[k]) < 1e-5);
    }
  }
  assert.equal(encodeCoast(2), 65535, "clamped, never wraps");
  const uniform = shoreUniform();
  assert.equal(uniform.length, SHORE_ISLANDS.length * 4);
  assert.equal(uniform[3], 0.5 / coastRows());
  // The GLSL decodes with the same numbers and measures the same way.
  const glsl = glslShore(true);
  assert.match(glsl, new RegExp(`shoreIslands\\[${SHORE_ISLANDS.length}\\]`));
  assert.match(glsl, /vec3 shoreField\(vec2 p\)/);
  assert.match(glsl, /sqrt\(1\.0 \+ slant \* slant\)/);
  assert.doesNotMatch(glslShore(false), /coastMap/);
});

test("the sea floor shelves off gently from the beach exactly as the island's terrain does", () => {
  assert.equal(seabedDepth(0), 0);
  assert.equal(seabedDepth(-3), 0, "no depth on land");
  for (let d = 0; d < 300; d += 1)
    assert.ok(seabedDepth(d + 1) >= seabedDepth(d), "deeper further out");
  // The island's own shelf is the floor out to 20 m (the open sea's slope takes over from 22), deeper by 0.07 of the distance at the sand.
  for (let index = 0; index < islands.length; index++) {
    const shape = shoreShape(index);
    for (const d of [0.5, 1, 2, 3, 4, 7, 10, 15, 20]) {
      const r = shape.coast(1) + d;
      const floor = -shape.height(Math.cos(1) * r, Math.sin(1) * r);
      assert.ok(
        Math.abs(seabedDepth(d) - floor) < 0.06,
        `island ${index} ${d} m out: ${floor} vs ${seabedDepth(d)}`,
      );
    }
  }
  assert.ok(
    Math.abs(seabedDepth(1) - 0.07) < 0.01,
    "0.07 m per metre at the sand",
  );
  assert.ok(seabedDepth(10) > 0.6 && seabedDepth(10) < 0.9);
  assert.ok(seabedDepth(25) > 1.8 && seabedDepth(25) < 2.3);
  // Turquoise shelf near the islands (a few metres deep out to 30 m), open sea far away.
  assert.ok(seabedDepth(30) < 5);
  assert.ok(seabedDepth(60) > 12 && seabedDepth(60) < 20);
  assert.ok(seabedDepth(200) > 40);
});

test("breakers move toward the beach and bunch up as the water gets shallow", () => {
  // A crest is a whole number of the phase. Where is the crest of cycle 3 at time t?
  const crestAt = (t, cycle = 3) => {
    // (t + 4 √d) / P = cycle  =>  d = ((cycle P - t) / 4)^2
    const d = ((cycle * SURF_PERIOD - t) / 4) ** 2;
    assert.ok(Math.abs(surfPhase(d, t) - cycle) < 1e-9);
    return d;
  };
  assert.ok(crestAt(2) > crestAt(3), "the crest moves in over time");
  // At one moment, the gaps between crests shrink toward the beach.
  const t = 1;
  const lines = [1, 2, 3, 4].map((c) => crestAt(t, c));
  for (let i = 1; i < lines.length - 1; i++)
    assert.ok(lines[i + 1] - lines[i] > lines[i] - lines[i - 1]);
  // The swash rushes up quickly and slides back slowly, ending just below the waterline.
  const reach = 2.5;
  assert.ok(Math.abs(swashFront(UPRUSH, reach) - reach) < 1e-9, "peak");
  assert.ok(swashFront(0, reach) < 0 && swashFront(1, reach) < 0);
  assert.ok(
    Math.abs(swashFront(0, reach) - swashFront(1, reach)) < 1e-6,
    "loops",
  );
  for (let f = 0; f < UPRUSH; f += 0.01)
    assert.ok(swashFront(f + 0.01, reach) >= swashFront(f, reach));
  for (let f = UPRUSH; f < 0.99; f += 0.01)
    assert.ok(swashFront(f + 0.01, reach) <= swashFront(f, reach) + 1e-12);
  assert.ok(UPRUSH < 0.4, "the rush up is quicker than the slide back");
});

test("the swash sheet drapes each beach from the shallows to eleven metres up the sand", async () => {
  const { swashSheet, SWASH_ANGLES, SWASH_ROWS, SWASH_LIFT } = await import(
    "../src/ocean/swash.ts"
  );
  const { drawnBed } = await import("../src/ocean/island-shape.ts");
  for (let index = 0; index < islands.length; index++) {
    const island = islands[index];
    const shape = shoreShape(index);
    const sheet = swashSheet(index);
    const count = SWASH_ANGLES * SWASH_ROWS.length;
    assert.equal(sheet.positions.length, count * 3);
    assert.equal(sheet.shore.length, count);
    assert.equal(
      sheet.indices.length / 3,
      SWASH_ANGLES * (SWASH_ROWS.length - 1) * 2,
    );
    for (let v = 0; v < count; v++) {
      const [x, y, z] = sheet.positions.slice(v * 3, v * 3 + 3);
      // The sheet is draped on the terrain as it is drawn: every vertex floats the same
      // hand's breadth above the ground under it, however far up the gentle beach it is.
      const ground = drawnBed(shape.height(x - island.x, z - island.z));
      assert.ok(y >= ground - 1e-9, "never under the sand");
      assert.ok(y - Math.max(ground, -0.45) <= SWASH_LIFT + 1e-9, "lies on it");
      const row = SWASH_ROWS[v % SWASH_ROWS.length];
      assert.ok(
        Math.abs(sheet.shore[v] - row) < 0.15 + 0.03 * Math.abs(row),
        `row ${row}: ${sheet.shore[v]}`,
      );
    }
    // From the shallows to far up the beach (the swash climbs 3 to 9 m), rows about a metre
    // or two apart so the sheet follows the slope.
    assert.ok(SWASH_ROWS[0] > 0 && SWASH_ROWS.at(-1) <= -10);
    for (let r = 1; r < SWASH_ROWS.length; r++)
      assert.ok(SWASH_ROWS[r - 1] - SWASH_ROWS[r] <= 1.7, "rows close enough");
    assert.ok(
      sheet.positions.length / 3 < 4000 * 1.3 &&
        sheet.indices.length / 3 < 8000,
      "a modest sheet",
    );
  }
});

test("the sea draws its surf from the real coast; the old flat foam ring is gone", () => {
  const read = (file) =>
    readFileSync(new URL(`../src/ocean/${file}`, import.meta.url), "utf8");
  const water = read("water.ts");
  assert.match(water, /vec3 field = shoreField\(q\);/);
  assert.match(water, /seabedDepth\(d\)/);
  assert.doesNotMatch(
    water,
    /islands\[i\]\.z/,
    "no shore measured from a circle",
  );
  // The surf is in the fragment shader only: the vertex shader moves the sea by the waves
  // and the wake alone, so the boats float on exactly what is drawn.
  const vertex = water.slice(
    water.indexOf('ShadersStore["seaVertexShader"]'),
    water.indexOf('ShadersStore["seaFragmentShader"]'),
  );
  assert.match(vertex, /p\.y = waveHeight\(p\.xz, time\) \+ wakeHere\.x;/);
  assert.doesNotMatch(vertex, /shore|surf/i);
  const island = read("island-visual.ts");
  assert.doesNotMatch(island, /createFoam|DynamicTexture|foam/);
  for (const file of ["babylon-scene.ts", "sea-props.ts"])
    assert.doesNotMatch(read(file), /\.foam\b/, file);
});
