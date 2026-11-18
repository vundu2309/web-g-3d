import assert from "node:assert/strict";
import test from "node:test";
import {
  DETAIL,
  SEABED_CEILING,
  TILE,
  buildSeabed,
  seabedHeight,
  seabedKind,
  tileCells,
} from "../src/ocean/seabed.ts";
import { OPEN_FLOOR, coastDistance, seabedDepth } from "../src/ocean/shore.ts";
import { islands, SEA_BOUND } from "../src/ocean/model.ts";
import {
  underwaterCapable,
  underwaterReach,
} from "../src/ocean/clear-water.ts";
import { reflectsInWater } from "../src/ocean/reflection-model.ts";

const chunks = buildSeabed();

test("the floor covers the whole sea: every point past a beach lies under some chunk", () => {
  const under = (x, z) =>
    chunks.some(
      (c) =>
        x >= c.bounds.minX &&
        x <= c.bounds.maxX &&
        z >= c.bounds.minZ &&
        z <= c.bounds.maxZ,
    );
  let checked = 0;
  for (let x = -SEA_BOUND; x <= SEA_BOUND; x += 37)
    for (let z = -SEA_BOUND; z <= SEA_BOUND; z += 41) {
      if (coastDistance(x, z) < 1) continue;
      checked++;
      assert.ok(under(x, z), `no floor at ${x}, ${z}`);
    }
  assert.ok(checked > 3000, `${checked} points checked`);
});

test("the grid is finer near a coast and coarse where the water is deep", () => {
  assert.equal(tileCells(10), DETAIL[0].cells);
  assert.ok(tileCells(100) < tileCells(10));
  assert.ok(tileCells(300) < tileCells(100));
  assert.equal(tileCells(600), 0, "the coarse mesh covers it");
  assert.ok(
    chunks.some((c) => c.name === "seabed-far"),
    "one coarse mesh for the deep floor",
  );
  for (const c of chunks) {
    assert.match(c.name, /^seabed-(far|\d+-\d+)$/);
    assert.ok(c.indices.length % 3 === 0 && c.positions.length % 3 === 0);
    assert.equal(c.colors.length / 4, c.positions.length / 3);
    assert.ok(
      Math.max(...c.indices) < c.positions.length / 3,
      "indices in range",
    );
  }
});

test("the floor falls away gently from every island down to the deep, never steeper than 7 degrees", () => {
  // The profile itself, and the floor the meshes lie on, along a ray out from each island.
  assert.ok(
    (OPEN_FLOOR.depth * 1.5) / (OPEN_FLOOR.to - OPEN_FLOOR.from) < 0.12,
  );
  for (const island of islands) {
    let last = seabedHeight(island.x + island.ring + 2, island.z);
    for (let d = 4; d < 560; d += 4) {
      const x = island.x + island.ring + d;
      const y = seabedHeight(x, island.z);
      if (coastDistance(x, island.z) > 8) {
        // Relief rides on the profile (dunes, rock, swell): the average slope over 4 m stays gentle.
        assert.ok(
          Math.abs(y - last) / 4 < 0.6,
          `${island.x}: step ${(y - last).toFixed(2)} m at ${d}`,
        );
      }
      last = y;
    }
  }
  assert.ok(seabedDepth(500) > 40, "the deep floor is about 40 m down");
});

test("the floor never reaches the surface past the beach, and nothing stands within the waves' troughs", () => {
  for (const c of chunks) {
    // Tuft tips and domes stay below -0.4; the skirts hang lower still.
    for (let i = 1; i < c.positions.length; i += 3)
      assert.ok(c.positions[i] <= 0.001, `${c.name} reaches ${c.positions[i]}`);
  }
  for (let x = -1400; x <= 1400; x += 53)
    for (let z = -1400; z <= 1400; z += 59) {
      const d = coastDistance(x, z);
      if (d > 8)
        assert.ok(seabedHeight(x, z) <= SEABED_CEILING + 1e-9, `${x},${z}`);
    }
});

test("the floor has relief and life: dunes, rock, weed, coral and tufts", () => {
  const total = { coral: 0, weed: 0, rock: 0 };
  for (const c of chunks) for (const k in total) total[k] += c.props[k];
  assert.ok(
    total.coral > 100 && total.weed > 300 && total.rock > 100,
    JSON.stringify(total),
  );
  let rockPlaces = 0;
  let weedPlaces = 0;
  const heights = new Set();
  for (let x = -900; x <= 900; x += 17)
    for (let z = -900; z <= 900; z += 19) {
      if (coastDistance(x, z) < 12) continue;
      const kind = seabedKind(x, z);
      if (kind.rock > 0.5) rockPlaces++;
      if (kind.weed > 0.5) weedPlaces++;
      heights.add(
        Math.round(
          (seabedHeight(x, z) - -seabedDepth(coastDistance(x, z))) * 5,
        ),
      );
    }
  assert.ok(
    rockPlaces > 20 && weedPlaces > 20,
    `${rockPlaces} rock, ${weedPlaces} weed`,
  );
  assert.ok(heights.size > 8, "the floor is not a bare slope");
});

test("the floor is deterministic, drawn on the clear-water layer only and never mirrored", () => {
  const again = buildSeabed();
  assert.equal(again.length, chunks.length);
  assert.deepEqual(again[3].positions, chunks[3].positions);
  for (const c of chunks) {
    assert.ok(underwaterCapable(c.name), c.name);
    assert.ok(underwaterReach(c.name) >= 150);
    assert.ok(!reflectsInWater(c.name), "not in the mirror");
  }
});

test("the whole floor stays within a triangle budget", () => {
  const tris = chunks.reduce((sum, c) => sum + c.indices.length / 3, 0);
  assert.ok(tris < 320_000, `${tris} triangles`);
  assert.ok(
    chunks.every((c) => c.radius < TILE * 1.1 || c.name === "seabed-far"),
  );
});
