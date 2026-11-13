import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { loadModel } from "./model-loader.ts";
import { BOAT_FILE, BOAT_YAW, paintBoat, rgb } from "./boat-paint.ts";
import { boatPalettes } from "./palette.ts";
import { PAL } from "./art/colors.ts";
import { glowMaterial, useSolid } from "./art/materials.ts";
import { hex } from "./mesh-parts.ts";

/**
 * The player's boat from Blender (public/models/boat.glb, built by tools/blender/boat.py), loaded
 * ONCE per scene: one painted hull mesh per player palette (the hull paint and trim roles are
 * replaced, see boat-paint.ts) and one small glowing lantern. Every boat in the sea, the
 * player's and the others', is an instance of these, so a boat is two draw calls (plus its rod).
 *
 * `createBoatTemplate` in boat-visual.ts still builds the boat from code: it is what a boat
 * looks like until this has loaded, and for good if the load fails (the scene logs a warning),
 * exactly as the island props do (island-models.ts).
 */
export interface BoatModels {
  /** One hidden source mesh per palette, in the order of `boatPalettes`. */
  hulls: readonly Mesh[];
  /** The mast lantern's glass, an unlit glowing mesh (the same for every palette). */
  lamp: Mesh;
}

const LAMP = rgb(PAL.light.lamp);
const SAME = 0.5 / 255;

/** Whether every vertex of a mesh is the lamp colour (the exporter writes one mesh per colour). */
function isLamp(mesh: Mesh) {
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  if (!colors || colors.length < 3) return false;
  const stride = colors.length / mesh.getTotalVertices();
  for (let i = 0; i + 2 < colors.length; i += stride)
    if (
      Math.abs(colors[i]! - LAMP[0]) > SAME ||
      Math.abs(colors[i + 1]! - LAMP[1]) > SAME ||
      Math.abs(colors[i + 2]! - LAMP[2]) > SAME
    )
      return false;
  return true;
}

/** Merges meshes (their node transforms baked in) and turns the result into the game's axes. */
function mergeTurned(meshes: Mesh[], name: string): Mesh {
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  if (!merged) throw new Error(`${BOAT_FILE}: nothing to merge for ${name}`);
  merged.name = name;
  // The file's bow is at +Z; the game's is at -Z (see BOAT_YAW). A pure turn: no faces flip.
  merged.bakeTransformIntoVertices(Matrix.RotationY(BOAT_YAW));
  merged.isPickable = false;
  merged.hasVertexAlpha = false;
  return merged;
}

/** A new mesh with the geometry of `source` and the vertex colours `colors` (RGBA). */
function withColors(
  source: Mesh,
  name: string,
  colors: Float32Array | undefined,
): Mesh {
  const data = VertexData.ExtractFromMesh(source, false, true);
  if (colors) data.colors = colors;
  else data.colors = null;
  const mesh = new Mesh(name, source.getScene());
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.hasVertexAlpha = false;
  return mesh;
}

/** RGBA colours with the alpha channel the engine wants, whatever the file stored. */
function rgba(mesh: Mesh): Float32Array {
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  const count = mesh.getTotalVertices();
  if (!colors) throw new Error(`${BOAT_FILE}: the boat has no vertex colours`);
  const stride = colors.length / count;
  if (stride === 4) return Float32Array.from(colors);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = colors[i * stride]!;
    out[i * 4 + 1] = colors[i * stride + 1]!;
    out[i * 4 + 2] = colors[i * stride + 2]!;
    out[i * 4 + 3] = 1;
  }
  return out;
}

/** Loads the boat model and builds the per-palette meshes. Rejects if the file is bad. */
export async function loadBoatModels(scene: Scene): Promise<BoatModels> {
  const model = await loadModel(scene, BOAT_FILE);
  try {
    if (scene.isDisposed) throw new Error("scene disposed while loading");
    // Every part sits at its own pivot: the world matrices are baked in on merge.
    model.root.computeWorldMatrix(true);
    for (const node of model.root.getDescendants(false))
      (node as TransformNode).computeWorldMatrix?.(true);
    const lampMeshes = model.meshes.filter(isLamp);
    const bodyMeshes = model.meshes.filter(
      (mesh) => !lampMeshes.includes(mesh),
    );
    if (!lampMeshes.length || !bodyMeshes.length)
      throw new Error(`${BOAT_FILE}: no lantern glass or no hull found`);
    const body = mergeTurned(bodyMeshes, "boat-model-body");
    const lampMerged = mergeTurned(lampMeshes, "boat-model-lamp");
    model.root.dispose();
    const base = rgba(body);
    const hulls = boatPalettes.map((palette, i) => {
      const hull = withColors(
        body,
        `boat-model-${i}`,
        paintBoat(base, palette, 4),
      );
      hull.isVisible = false;
      return useSolid(hull, "satin");
    });
    body.dispose();
    const lamp = withColors(lampMerged, "boat-model-lamp-glow", undefined);
    lampMerged.dispose();
    lamp.material = glowMaterial(scene, "boat-lamp-material", {
      color: hex(PAL.light.lamp),
    });
    lamp.isVisible = false;
    return { hulls, lamp };
  } catch (error) {
    model.root.dispose();
    throw error;
  }
}

/** Puts a boat made of instances of the models under `parent` (its pose node). */
export function dressBoat(
  models: BoatModels,
  palette: number,
  parent: TransformNode,
  name: string,
): InstancedMesh[] {
  const hull = models.hulls[palette % models.hulls.length]!.createInstance(
    `${name}-hull`,
  );
  const lamp = models.lamp.createInstance(`${name}-lamp`);
  for (const mesh of [hull, lamp]) {
    mesh.parent = parent;
    mesh.isPickable = false;
  }
  return [hull, lamp];
}
