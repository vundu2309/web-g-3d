import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Creature, Part } from "./creature-geometry.ts";
import { buildCreature, type CreatureKind, type Look } from "./creatures.ts";
import { cachedFishModel, loadFishModel } from "./fish-models.ts";
import {
  fishColours,
  fishFile,
  paintFish,
  type FishTemplate,
} from "./glb-parts.ts";
import { meshFrom } from "./mesh-parts.ts";
import { solidMaterial } from "./art/materials.ts";

/**
 * Turns an animal into Babylon meshes: one mesh for the body and fins, and one for the tail
 * that swings about its own pivot. The material is shared per scene, with the colours carried
 * by the vertices, so any number of animals cost one material.
 *
 * The animal is the Blender model (public/models/fish-*.glb, read by glb-parts.ts and fetched
 * once per page by fish-models.ts, recoloured for the species). While the file is not loaded
 * yet, or if it cannot be had, it is the animal built from code (creatures.ts); an animal made
 * before the file arrived changes into the model in place when it does (`root`, `body` and
 * `tail` may be replaced then, so read them from the object, not once).
 */
export interface CreatureModel {
  /** Move, turn and scale this. Model units: about 1 long, nose toward +X. */
  root: TransformNode;
  body: Mesh;
  /** Rotate this about Y to swing the tail. */
  tail?: TransformNode;
  creature: Creature;
  /** True once it is drawn from the Blender model, false for the code-built stand-in. */
  fromModel: boolean;
  /**
   * Dresses the body and tail in another material (the hooked fish under the water), or back in the
   * shared satin one with undefined. Kept when the model replaces the code-built stand-in.
   */
  setSkin(material: Material | undefined): void;
  dispose(): void;
}

function meshOf(name: string, scene: Scene, part: Part, shift = [0, 0, 0]) {
  const positions = part.positions.map((v, i) => v - shift[i % 3]!);
  const mesh = meshFrom(
    name,
    scene,
    positions,
    part.indices,
    part.colors,
    part.normals,
  );
  mesh.material = solidMaterial(scene, "satin");
  mesh.useVertexColors = true;
  // The colours carry an alpha channel that is always 1: left on, it would be drawn as
  // transparent and its far side would show through.
  mesh.hasVertexAlpha = false;
  mesh.isPickable = false;
  return mesh;
}

export function createCreature(
  scene: Scene,
  name: string,
  kind: CreatureKind,
  body: string,
  fin: string,
  look?: Look,
  /** The species' id, for the species that have a model file of their own. */
  variant?: string,
): CreatureModel {
  const root = new TransformNode(name, scene);
  let tailMesh: Mesh | undefined;
  let disposed = false;
  let skin: Material | undefined;
  const model: CreatureModel = {
    root,
    body: undefined as unknown as Mesh,
    creature: undefined as unknown as Creature,
    fromModel: false,
    setSkin(material) {
      skin = material;
      dress();
    },
    dispose() {
      disposed = true;
      model.tail?.dispose();
      tailMesh?.dispose();
      model.body.dispose();
      root.dispose();
    },
  };
  /** Puts the chosen skin (satin unless one was set) on the meshes that exist now. */
  const dress = () => {
    const material = skin ?? solidMaterial(scene, "satin");
    if (model.body) model.body.material = material;
    if (tailMesh) tailMesh.material = material;
  };
  /** Builds the meshes of `creature` under the root, replacing any drawn before. */
  const show = (creature: Creature, fromModel: boolean) => {
    tailMesh?.dispose();
    model.tail?.dispose();
    model.body?.dispose();
    model.creature = creature;
    model.fromModel = fromModel;
    model.body = meshOf(`${name}-body`, scene, creature.main);
    model.body.parent = root;
    model.tail = undefined;
    tailMesh = undefined;
    if (creature.tail) {
      const tail = new TransformNode(`${name}-tail`, scene);
      tail.position.set(...creature.tail.pivot);
      tail.parent = root;
      tailMesh = meshOf(
        `${name}-tail-mesh`,
        scene,
        creature.tail.part,
        creature.tail.pivot as unknown as number[],
      );
      tailMesh.parent = tail;
      model.tail = tail;
    }
    dress();
  };
  const paint = (template: FishTemplate) =>
    paintFish(template, fishColours(kind, body, fin, look));
  const file = fishFile(kind, variant);
  const loaded = cachedFishModel(file);
  if (loaded) show(paint(loaded), true);
  else {
    show(buildCreature(kind, body, fin, look), false);
    void loadFishModel(file).then((template) => {
      if (template && !disposed && !scene.isDisposed)
        show(paint(template), true);
    });
  }
  return model;
}
