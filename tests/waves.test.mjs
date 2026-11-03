import test from "node:test";
import assert from "node:assert/strict";
import { OceanSpectrum } from "../src/game/ocean/waves.ts";
test("wind spectrum is deterministic and evolves without moving the tile seam", () => {
  const a = new OceanSpectrum(),
    b = new OceanSpectrum();
  a.update(3, 0.8);
  b.update(3, 0.8);
  assert.deepEqual(a.displacement, b.displacement);
  const before = a.sample(7, 11, 0);
  a.update(5, 0.8);
  assert.ok(Math.abs(a.sample(7, 11, 0) - before) > 0.001);
  assert.ok(
    Math.abs(a.sample(-0.1, 9, 0) - a.sample(a.length - 0.1, 9, 0)) < 1e-6,
  );
});
test("buoyancy samples the same displaced surface and normals remain finite", () => {
  const sea = new OceanSpectrum();
  for (const strength of [0.8, 1.5])
    for (const time of [0, 3.7, 25]) {
      sea.update(time, strength);
      for (const [x, z] of [
        [0, 0],
        [3.5, 0],
        [-18, 11],
        [51, -37],
      ]) {
        const dx = sea.sample(x, z, 1),
          dz = sea.sample(x, z, 2);
        assert.ok(
          Math.abs(sea.heightAt(x + dx, z + dz) - sea.sample(x, z, 0)) < 0.02,
        );
      }
      assert.ok(sea.surface.every(Number.isFinite));
      for (let i = 0; i < sea.surface.length; i += 4) {
        assert.ok(
          sea.surface[i + 1] > 0,
          "Horizontal map must not fold or invert water normals",
        );
        assert.ok(sea.surface[i + 3] >= 0 && sea.surface[i + 3] <= 1);
      }
    }
});
test("zero strength flattens the sea and removes foam", () => {
  const sea = new OceanSpectrum();
  sea.update(12, 0);
  for (let i = 0; i < sea.displacement.length; i += 4) {
    assert.equal(sea.displacement[i], 0);
    assert.equal(sea.surface[i + 3], 0);
  }
});
