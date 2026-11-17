import assert from "node:assert/strict";
import test from "node:test";

const { NEAR_RADIUS, NEAR_RINGS, WATER_RADIUS, waterRingRadii } = await import(
  "../src/ocean/water-extent.ts"
);
const { FOG_DENSITY } = await import("../src/ocean/sea-style.ts");
const { SEA_BOUND, islands } = await import("../src/ocean/model.ts");

const fogAt = (distance) =>
  1 - Math.exp(-FOG_DENSITY * FOG_DENSITY * distance * distance);

test("the near rings are the dense ones the waves were tuned on", () => {
  const radii = waterRingRadii();
  for (let ring = 1; ring <= NEAR_RINGS; ring++)
    assert.equal(
      radii[ring - 1],
      4 * Math.pow(ring / NEAR_RINGS, 2.2) * 120,
      `ring ${ring}`,
    );
  assert.ok(Math.abs(radii[NEAR_RINGS - 1] - NEAR_RADIUS) < 1e-9);
});

test("the rings only grow outward, and the far ones are not coarse enough to show", () => {
  const radii = waterRingRadii();
  for (let i = 1; i < radii.length; i++) assert.ok(radii[i] > radii[i - 1]);
  const gaps = radii.map((r, i) => r - (radii[i - 1] ?? 0));
  assert.ok(Math.max(...gaps.slice(NEAR_RINGS)) < 700);
  assert.ok(Math.abs(radii.at(-1) - WATER_RADIUS) < 1e-6);
});

test("the edge of the water is hidden by the fog, and lies beyond every island and the sea's edge", () => {
  assert.ok(
    fogAt(WATER_RADIUS) > 0.999,
    `fog at the edge ${fogAt(WATER_RADIUS)}`,
  );
  // The water follows the camera, so a boat at the sea's edge still has water out to the fog.
  assert.ok(WATER_RADIUS > SEA_BOUND, "the disc reaches past the sea's edge");
  for (const island of islands)
    assert.ok(
      WATER_RADIUS > island.radius * 2,
      "every island is far smaller than the water disc",
    );
});
