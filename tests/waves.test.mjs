import test from "node:test";
import assert from "node:assert/strict";
import { waves, envelope, heightAt } from "../src/game/ocean/waves.ts";

test("CPU buoyancy inverts horizontally displaced wave positions", () => {
  for (const strength of [0.8, 1.5])
    for (const time of [0, 3.7, 25]) {
      for (const [x, z] of [
        [0, 0],
        [3.5, 0],
        [-18, 11],
        [51, -37],
      ]) {
        let targetX = x,
          targetZ = z,
          expected = 0;
        for (const wave of waves) {
          const phase =
            (x * wave.x + z * wave.z) * wave.frequency +
            time * wave.speed +
            wave.phase;
          const amplitude =
            wave.amplitude * envelope(wave, x, z, time) * strength;
          targetX += wave.x * 0.65 * amplitude * Math.cos(phase);
          targetZ += wave.z * 0.65 * amplitude * Math.cos(phase);
          expected += amplitude * Math.sin(phase);
        }
        assert.ok(
          Math.abs(heightAt(targetX, targetZ, time, strength) - expected) <
            0.003,
          `Buoyancy must match the displaced surface at ${x},${z},${time}`,
        );
      }
    }
});

test("zero wave strength produces a flat sea", () => {
  for (const time of [0, 8, 50]) assert.equal(heightAt(12, -9, time, 0), 0);
});
