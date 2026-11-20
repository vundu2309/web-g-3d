import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  SHIPYARDS,
  SHIPYARD_RANGE,
  SLIPWAY_WATERLINE,
  YARD_FULL_ANGLE,
  YARD_MID_ANGLE,
  inSea,
  shipyardAt,
  yardLevelOf,
} = await import("../src/ocean/shipyard.ts");
const { MARKETS } = await import("../src/ocean/market.ts");
const { islands, islandCollisionRadius } = await import(
  "../src/ocean/model.ts"
);
const { shoreShape } = await import("../src/ocean/shore.ts");
const { parseMeshesGlb } = await import("../src/ocean/glb-parts.ts");
const { yardLevels, yardTurn } = await import(
  "../src/ocean/shipyard-visual.ts"
);
const { YARD_LOD_TRIANGLES } = await import("../src/ocean/shipyard.ts");
const { PAL } = await import("../src/ocean/art/colors.ts");

// The three shipyards (src/ocean/shipyard.ts, shipyard-visual.ts): where they stand, how far apart
// they are, what the model is and how much of it is drawn.
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test("there are three yards on three different islands, in the sea, with ids and names of their own", () => {
  assert.equal(SHIPYARDS.length, 3);
  assert.deepEqual(
    SHIPYARDS.map((y) => y.island),
    [0, 4, 7],
  );
  assert.equal(new Set(SHIPYARDS.map((y) => y.id)).size, 3);
  assert.equal(new Set(SHIPYARDS.map((y) => y.name)).size, 3);
  for (const yard of SHIPYARDS) {
    assert.ok(inSea(yard), `${yard.id} is inside the sea's bounds`);
    assert.match(yard.name, /^Xưởng tàu /);
  }
});

test("the yards are far apart, and far from every market", () => {
  for (let i = 0; i < SHIPYARDS.length; i++)
    for (let j = i + 1; j < SHIPYARDS.length; j++)
      assert.ok(
        dist(SHIPYARDS[i], SHIPYARDS[j]) > 500,
        `${SHIPYARDS[i].id} to ${SHIPYARDS[j].id}`,
      );
  for (const yard of SHIPYARDS)
    for (const market of MARKETS)
      assert.ok(
        dist(yard, market) > 3 * SHIPYARD_RANGE,
        `${yard.id} is too near ${market.id}: ${dist(yard, market).toFixed(0)} m`,
      );
});

test("each yard stands on its island's shore with the slipway's end at the waterline, facing out to sea", () => {
  for (const yard of SHIPYARDS) {
    const island = islands[yard.island];
    const away = Math.hypot(yard.x - island.x, yard.z - island.z);
    const angle = Math.atan2(yard.z - island.z, yard.x - island.x);
    const coast = shoreShape(yard.island).coast(angle);
    assert.ok(
      Math.abs(away + SLIPWAY_WATERLINE - coast) < 1e-6,
      `${yard.id}: the waterline is at the coast`,
    );
    // inside the ring boats are stopped by, so the yard is never under a boat
    assert.ok(
      away < islandCollisionRadius(island),
      `${yard.id} is inside the ring`,
    );
    // and the ring leaves a boat within reach of the yard
    assert.ok(
      islandCollisionRadius(island) - away < SHIPYARD_RANGE - 5,
      `${yard.id}: a boat at the ring (${(islandCollisionRadius(island) - away).toFixed(1)} m) can open it`,
    );
    // the sea side looks away from the island: the heading's forward is the outward direction
    const forward = { x: Math.sin(yard.facing), z: -Math.cos(yard.facing) };
    assert.ok(
      Math.abs(forward.x - Math.cos(angle)) < 1e-9 &&
        Math.abs(forward.z - Math.sin(angle)) < 1e-9,
      `${yard.id} faces out`,
    );
  }
});

test("a boat can open the nearest yard within its range and no yard farther away", () => {
  const yard = SHIPYARDS[1];
  assert.equal(shipyardAt(yard.x, yard.z)?.id, yard.id);
  assert.equal(shipyardAt(yard.x + SHIPYARD_RANGE - 0.1, yard.z)?.id, yard.id);
  assert.equal(shipyardAt(yard.x + SHIPYARD_RANGE + 0.1, yard.z), undefined);
  assert.equal(shipyardAt(0, 22), undefined, "not at the harbor");
});

test("a yard is drawn whole near, as a copy farther and not at all as a speck, and keeps its level near an edge", () => {
  const width = 20;
  const whole = width / YARD_FULL_ANGLE;
  const mid = width / YARD_MID_ANGLE;
  assert.equal(yardLevelOf(30), 0);
  assert.equal(yardLevelOf(whole - 1), 0);
  assert.equal(yardLevelOf(whole + 1), 1);
  assert.equal(yardLevelOf(mid - 1), 1);
  assert.equal(yardLevelOf(mid + 1), 2);
  assert.ok(
    whole > 400 && whole < 600 && mid > 1500 && mid < 1800,
    `${whole} ${mid}`,
  );
  // the band: just past the edge a yard that was whole stays whole, one that was not stays not
  assert.equal(yardLevelOf(whole * 1.05, 0), 0);
  assert.equal(yardLevelOf(whole * 1.05, 1), 1);
  assert.equal(yardLevelOf(mid * 1.05, 1), 1);
  assert.equal(yardLevelOf(mid * 1.05, 2), 2);
  assert.equal(yardLevelOf(0), 0, "never divides by nothing");
});

// ---------------------------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------------------------
const model = () =>
  parseMeshesGlb(
    readFileSync(new URL("../public/models/shipyard.glb", import.meta.url)),
  );

test("the model is the 20 x 12.6 m yard the numbers describe: sea side +Z, workshop inland, slipway entering the water", () => {
  const { main, min, max } = model();
  assert.equal(main.indices.length / 3, 7537, "the triangles of the file");
  assert.ok(
    min[0] > -10.1 && max[0] < 10.3 && max[0] - min[0] > 19.5,
    `x ${min[0]}..${max[0]}`,
  );
  assert.ok(
    min[2] > -6.5 && max[2] < 6.3 && max[2] - min[2] > 12.4,
    `z ${min[2]}..${max[2]}`,
  );
  assert.ok(max[1] > 7 && max[1] < 8, `the crane is ${max[1]} m high`);
  assert.ok(
    min[1] > -1.7 && min[1] < -1.5,
    "the piles go down to the seabed's edge",
  );
  // the slipway goes under the waterline toward +Z: the vertices below the sea are seaward
  let belowLand = 0;
  let belowSea = 0;
  for (let i = 0; i < main.positions.length; i += 3)
    if (main.positions[i + 1] < 0) {
      if (main.positions[i + 2] < 0) belowLand++;
      else belowSea++;
    }
  assert.ok(
    belowSea > belowLand,
    `${belowSea} below the sea seaward, ${belowLand} inland`,
  );
  // the workshop (the red roof, the tallest thing on the land side) is inland
  let tallestInland = 0;
  let tallestSea = 0;
  for (let i = 0; i < main.positions.length; i += 3) {
    if (main.positions[i + 2] < -0.5)
      tallestInland = Math.max(tallestInland, main.positions[i + 1]);
    if (main.positions[i + 2] > 2)
      tallestSea = Math.max(tallestSea, main.positions[i + 1]);
  }
  assert.ok(
    tallestInland > 5 && tallestSea < 3.5,
    `inland ${tallestInland}, seaward ${tallestSea}`,
  );
});

test("every vertex colour of the model is a palette colour", () => {
  const allowed = new Set();
  const walk = (v) => {
    if (typeof v === "number")
      allowed.add(`${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`);
    else if (v && typeof v === "object")
      for (const x of Object.values(v)) walk(x);
  };
  walk(PAL);
  const { colors } = model().main;
  const seen = new Set();
  for (let i = 0; i < colors.length; i += 4)
    seen.add([0, 1, 2].map((k) => Math.round(colors[i + k] * 255)).join(","));
  for (const colour of seen)
    assert.ok(allowed.has(colour), `${colour} is not in the palette`);
  assert.ok(seen.size > 8, `${seen.size} colours`);
});

test("the middle copy is at most 1,500 triangles, made from the model's own triangles, and the model is not changed", () => {
  const { main } = model();
  const whole = {
    positions: main.positions,
    normals: main.normals,
    indices: main.indices,
    colors: main.colors,
  };
  const before = main.indices.length;
  const [full, middle] = yardLevels(whole);
  assert.equal(full, whole, "the whole model as it is");
  assert.equal(main.indices.length, before);
  assert.ok(
    middle.indices.length / 3 <= YARD_LOD_TRIANGLES[1],
    `${middle.indices.length / 3}`,
  );
  assert.ok(middle.indices.length / 3 > 300, "still a yard");
  for (const i of middle.indices) assert.ok(i < middle.positions.length / 3);
});

test("a yard is turned so its sea side (+Z) looks out to sea along its facing, and its land side (-Z) at the island", async () => {
  const { Quaternion, Vector3 } = await import(
    "@babylonjs/core/Maths/math.vector"
  );
  const { Axis } = await import("@babylonjs/core/Maths/math.axis");
  for (const yard of SHIPYARDS) {
    const turn = Quaternion.RotationAxis(Axis.Y, yardTurn(yard));
    const matrix = new (
      await import("@babylonjs/core/Maths/math.vector")
    ).Matrix();
    turn.toRotationMatrix(matrix);
    const sea = Vector3.TransformNormal(new Vector3(0, 0, 1), matrix);
    const out = { x: Math.sin(yard.facing), z: -Math.cos(yard.facing) };
    assert.ok(
      Math.abs(sea.x - out.x) < 1e-5 && Math.abs(sea.z - out.z) < 1e-5,
      `${yard.id}: the sea side looks (${sea.x.toFixed(3)}, ${sea.z.toFixed(3)}), out to sea is (${out.x.toFixed(3)}, ${out.z.toFixed(3)})`,
    );
  }
});
