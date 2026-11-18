import "@babylonjs/core/Meshes/instancedMesh";
import { DitheredTileFadeMaterialPlugin } from "@babylonjs/core/Materials/ditheredTileFadeMaterialPlugin";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Scene } from "@babylonjs/core/scene";
import { solidMaterial } from "./art/materials.ts";
import type { PlacedProps } from "./island-models.ts";
import { FADE_BAND, fadeAmount } from "./prop-lod.ts";

/**
 * Fades the island props out by dithering as they reach the end of their range (prop-lod.ts), so a
 * palm does not vanish in one frame: Babylon's DitheredTileFadeMaterialPlugin switches a growing
 * share of the instance's pixels off in a fixed screen pattern (opaque, no sorting). The levels of
 * detail themselves are the source meshes' own (island-models.ts); this only sets how much of the
 * instance is drawn, and only for the props in the last part of their range.
 */
const STEPS = 32;

export class PropFade {
  private readonly plugin: DitheredTileFadeMaterialPlugin;
  private readonly instances: InstancedMesh[] = [];
  private readonly at: number[] = [];
  private readonly ends: number[] = [];
  private readonly shown: number[] = [];

  constructor(scene: Scene) {
    this.plugin = DitheredTileFadeMaterialPlugin.GetOrCreate(
      solidMaterial(scene, "satin"),
    );
  }

  /** Starts watching the props of one island (their places are read once: they never move). */
  add(placed: PlacedProps) {
    placed.instances.forEach((instance, i) => {
      instance.computeWorldMatrix(true);
      const p = instance.getAbsolutePosition();
      this.instances.push(instance);
      this.at.push(p.x, p.y, p.z);
      this.ends.push(placed.ends[i] ?? Infinity);
      this.shown.push(1);
    });
  }

  /** Sets the fade of every prop near the end of its range, seen from `eye` (the camera). */
  update(eye: { x: number; y: number; z: number }) {
    for (let i = 0; i < this.instances.length; i++) {
      const end = this.ends[i]!;
      const dx = this.at[i * 3]! - eye.x;
      const dy = this.at[i * 3 + 1]! - eye.y;
      const dz = this.at[i * 3 + 2]! - eye.z;
      const squared = dx * dx + dy * dy + dz * dz;
      const start = end * (1 - FADE_BAND);
      let amount = 1;
      if (squared > start * start)
        amount =
          Math.round(fadeAmount(Math.sqrt(squared), end) * STEPS) / STEPS;
      if (amount === this.shown[i]) continue;
      this.shown[i] = amount;
      this.plugin.setFadeBounds(this.instances[i]!, 0, amount);
    }
  }

  dispose() {
    this.instances.length = 0;
    this.at.length = 0;
    this.ends.length = 0;
    this.shown.length = 0;
  }
}
