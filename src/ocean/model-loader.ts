import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
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
 * The pipeline exports Y-up glTF and the sea's scene is right-handed (`useRightHandedSystem`), so
 * the loader adds no flip: a Blender point (x, y, z) lands at (x, z, −y) in the model's own frame.
 * Blender's +Y (the hut's door, tools/blender/props.py) is the model's −Z (checked in a render
 * and by tests/props-models.test.mjs).
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
    // The baked colours carry an alpha channel (always 1): left on, Babylon would draw the
    // model in the transparent pass without depth writes and its far side would show through.
    mesh.hasVertexAlpha = false;
    useSolid(mesh, "satin");
  }
  for (const material of container.materials) material.dispose();
  const nodes = new Map<string, TransformNode>();
  for (const node of container.transformNodes) nodes.set(node.name, node);
  return { root, meshes, node: (name) => nodes.get(name) };
}

/** Every mesh of the model, for callers that hide or move them as a whole. */
export const meshesOf = (model: LoadedModel): AbstractMesh[] => model.meshes;

/**
 * Loads a static GLB (no animated pivots) as ONE mesh with an identity transform: the exporter
 * writes one glTF primitive per palette colour, which Babylon would load as dozens of meshes, so
 * they are merged (their node transforms baked in) and the empty root dropped. The result keeps
 * the shared solid look and opaque vertex colours, and is ready to be instanced.
 */
export async function loadMergedModel(
  scene: Scene,
  file: string,
): Promise<Mesh> {
  const model = await loadModel(scene, file);
  const merged = Mesh.MergeMeshes(
    model.meshes,
    true,
    true,
    undefined,
    false,
    false,
  );
  model.root.dispose();
  if (!merged) throw new Error(`${file}: nothing to merge`);
  merged.name = `model-${file.replace(/\.glb$/, "")}`;
  merged.isPickable = false;
  merged.hasVertexAlpha = false;
  useSolid(merged, "satin");
  return merged;
}
