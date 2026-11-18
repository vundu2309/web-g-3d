import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { solidMaterial } from "./art/materials.ts";
import { cachedFishModel, loadFishModel } from "./fish-models.ts";
import { fishFile } from "./glb-parts.ts";
import { meshFrom } from "./mesh-parts.ts";
import { waveHeight } from "./waves.ts";
import {
  ANIMALS,
  KINDS,
  chooseVisible,
  wildPose,
  type Kind,
} from "./wildlife.ts";

/**
 * Draws the living animals of wildlife.ts: one mesh per species (built from its model file once
 * it has loaded) and one instance per animal, so a hundred animals still read the same geometry.
 * Only the animals `chooseVisible` picks near the player are enabled; the others are switched off.
 * The meshes are named `wild-*`, which keeps them out of the water's mirror (reflection-model.ts):
 * drawing a 78,048-triangle crab a second time for a reflection nobody could see is not worth it.
 */
export class Wildlife {
  private readonly templates = new Map<Kind, Mesh>();
  private readonly instances = new Map<string, InstancedMesh>();
  private disposed = false;

  constructor(private readonly scene: Scene) {
    // Each kind appears as soon as its file is there; nothing waits for them.
    for (const kind of Object.keys(KINDS) as Kind[]) this.prepare(kind);
  }

  private prepare(kind: Kind) {
    const file = fishFile(KINDS[kind].species);
    const make = () => {
      const template = cachedFishModel(file);
      if (!template || this.disposed || this.scene.isDisposed) return;
      const part = template.main;
      const mesh = meshFrom(
        `wild-${kind}`,
        this.scene,
        part.positions,
        part.indices,
        part.colors,
        part.normals,
      );
      mesh.material = solidMaterial(this.scene, "satin");
      mesh.useVertexColors = true;
      mesh.hasVertexAlpha = false;
      mesh.isVisible = false;
      mesh.isPickable = false;
      this.templates.set(kind, mesh);
      for (const animal of ANIMALS)
        if (animal.kind === kind) {
          const instance = mesh.createInstance(`wild-${animal.id}`);
          instance.isPickable = false;
          instance.setEnabled(false);
          this.instances.set(animal.id, instance);
        }
    };
    if (cachedFishModel(file)) make();
    else void loadFishModel(file).then(make);
  }

  /** Poses the animals near `viewer` for time `t` (seconds) and switches the rest off. */
  update(t: number, viewer: { x: number; z: number } | undefined) {
    const shown = viewer ? chooseVisible(viewer, t) : new Set<string>();
    for (const animal of ANIMALS) {
      const instance = this.instances.get(animal.id);
      if (!instance) continue;
      const on = shown.has(animal.id);
      if (instance.isEnabled() !== on) instance.setEnabled(on);
      if (!on) continue;
      const pose = wildPose(animal, t);
      const length = KINDS[animal.kind].length;
      instance.position.set(
        pose.x,
        pose.level === "sea" ? waveHeight(pose.x, pose.z, t) + pose.y : pose.y,
        pose.z,
      );
      instance.rotation.set(pose.roll, pose.heading, pose.pitch);
      instance.scaling.set(
        length * pose.sx,
        length * pose.sy,
        length * pose.sz,
      );
    }
  }

  dispose() {
    this.disposed = true;
    for (const instance of this.instances.values()) instance.dispose();
    for (const mesh of this.templates.values()) mesh.dispose();
    this.instances.clear();
    this.templates.clear();
  }
}
