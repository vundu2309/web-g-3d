import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { useSolid } from "./art/materials.ts";

/**
 * Loads a GLB made by the Blender pipeline (tools/blender, committed under public/models) and
 * dresses it like everything else in the sea: its own materials are dropped and its meshes take
 * the shared solid look, painted by the per-vertex colours the pipeline baked from the game's
 * palette. The model is added to the scene under one root node you can place and parent.
 *
 * Blender faces -Y and the pipeline exports Y-up glTF, which the loader turns into the scene's
 * left-handed frame: the model's front ends up on -Z, like a boat's bow.
 */
export interface LoadedModel {
  root: TransformNode;
  meshes: Mesh[];
  /** A node of the model by name (a pivot for animation), or undefined. */
  node(name: string): TransformNode | undefined;
}

const base = () => import.meta.env.BASE_URL ?? "./";

export async function loadModel(
  scene: Scene,
  file: string,
): Promise<LoadedModel> {
  const container = await LoadAssetContainerAsync(
    `${base()}models/${file}`,
    scene,
  );
  container.addAllToScene();
  const root = container.rootNodes[0] as TransformNode | undefined;
  if (!root) throw new Error(`${file}: empty model`);
  const meshes = container.meshes.filter(
    (mesh): mesh is Mesh =>
      "setVerticesData" in mesh && mesh.getTotalVertices() > 0,
  );
  for (const mesh of meshes) {
    mesh.isPickable = false;
    useSolid(mesh, "satin");
  }
  for (const material of container.materials) material.dispose();
  const nodes = new Map<string, TransformNode>();
  for (const node of container.transformNodes) nodes.set(node.name, node);
  return { root, meshes, node: (name) => nodes.get(name) };
}

/** Every mesh of the model, for callers that hide or move them as a whole. */
export const meshesOf = (model: LoadedModel): AbstractMesh[] => model.meshes;
