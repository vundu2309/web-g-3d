import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Creature, Part } from "./creature-geometry.ts";
import { buildCreature, type CreatureKind } from "./creatures.ts";
import { meshFrom } from "./mesh-parts.ts";
import { solidMaterial } from "./art/materials.ts";

/**
 * Turns a built animal into Babylon meshes: one mesh for the body and fins, and one for
 * the tail that swings about its own pivot. The material is shared per scene, with the
 * colours carried by the vertices, so any number of animals cost one material.
 */
export interface CreatureModel {
  /** Move, turn and scale this. Model units: about 1 long, nose toward +X. */
  root: TransformNode;
  body: Mesh;
  /** Rotate this about Y to swing the tail. */
  tail?: TransformNode;
  creature: Creature;
  dispose(): void;
}

function meshOf(name: string, scene: Scene, part: Part, shift = [0, 0, 0]) {
  const positions = part.positions.map((v, i) => v - shift[i % 3]!);
  const mesh = meshFrom(name, scene, positions, part.indices, part.colors);
  mesh.material = solidMaterial(scene, "satin");
  mesh.useVertexColors = true;
  mesh.isPickable = false;
  return mesh;
}

export function createCreature(
  scene: Scene,
  name: string,
  kind: CreatureKind,
  body: string,
  fin: string,
): CreatureModel {
  const creature = buildCreature(kind, body, fin);
  const root = new TransformNode(name, scene);
  const bodyMesh = meshOf(`${name}-body`, scene, creature.main);
  bodyMesh.parent = root;
  let tail: TransformNode | undefined;
  let tailMesh: Mesh | undefined;
  if (creature.tail) {
    tail = new TransformNode(`${name}-tail`, scene);
    tail.position.set(...creature.tail.pivot);
    tail.parent = root;
    tailMesh = meshOf(
      `${name}-tail-mesh`,
      scene,
      creature.tail.part,
      creature.tail.pivot as unknown as number[],
    );
    tailMesh.parent = tail;
  }
  return {
    root,
    body: bodyMesh,
    tail,
    creature,
    dispose() {
      tailMesh?.dispose();
      bodyMesh.dispose();
      tail?.dispose();
      root.dispose();
    },
  };
}
