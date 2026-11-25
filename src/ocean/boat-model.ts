import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { loadModel } from "./model-loader.ts";
import { BOAT_YAW, paintBoat, rgb } from "./boat-paint.ts";
import { PATROL_FILE, PATROL_MODEL, boatTier } from "./boat-tier.ts";
import { boatPalettes } from "./palette.ts";
import { PAL } from "./art/colors.ts";
import { glowMaterial, useSolid } from "./art/materials.ts";
import { hex, meshFrom } from "./mesh-parts.ts";
import { LAMP_FAR_TRIANGLES, boatLevels } from "./boat-lod.ts";
import { simplifyPart } from "./simplify.ts";
import type { Part } from "./creature-geometry.ts";

/**
 * The boats from Blender (public/models/boat.glb, built by tools/blender/boat.py, and the bigger
 * boat-2.glb, boat-3.glb, boat-4.glb of the upgrade shop, tools/blender/upgrade_boats.py; which
 * file a tier is, is in boat-tier.ts), each loaded ONCE per scene when it is first needed: one
 * painted hull mesh per player palette (the hull paint and trim roles are replaced, see
 * boat-paint.ts) and one small glowing lantern. Every boat in the sea, the player's and the
 * others', is an instance of the models of its tier, so a boat is two draw calls (plus its rod).
 *
 * `createBoatTemplate` in boat-visual.ts still builds the boat from code: it is what a boat
 * looks like until this has loaded, and for good if the load fails (the scene logs a warning),
 * exactly as the island props do (island-models.ts).
 */
export interface BoatModels {
  /** The tier these models are (boat-tier.ts, 0 to 3). */
  tier: number;
  /** One hidden source mesh per palette, in the order of `boatPalettes`. */
  hulls: readonly Mesh[];
  /** The mast lantern's glass, an unlit glowing mesh (the same for every palette). */
  lamp: Mesh;
  /**
   * The coarser copies the other players' boats are drawn as when they are far away (boat-lod.ts):
   * the hulls of level 1 and 2, per palette, and the lantern's far copy.
   */
  coarse: readonly (readonly Mesh[])[];
  lampFar: Mesh;
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
function mergeTurned(meshes: Mesh[], name: string, file: string): Mesh {
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  if (!merged) throw new Error(`${file}: nothing to merge for ${name}`);
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
function rgba(mesh: Mesh, file: string): Float32Array {
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  const count = mesh.getTotalVertices();
  if (!colors) throw new Error(`${file}: the boat has no vertex colours`);
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

/**
 * Loads the model of a tier (0, the first boat, by default) and builds the per-palette meshes.
 * Rejects if the file is bad. The meshes of tier 0 keep their names (`boat-model-<palette>`,
 * `boat-model-lamp-glow`); the others are `boat-model-t<tier>-<palette>` and
 * `boat-model-t<tier>-lamp-glow`, so the clear-water and reflection passes, which find boats by
 * name prefix (clear-water.ts, reflection-model.ts), draw them all.
 */
export async function loadBoatModels(
  scene: Scene,
  tier = 0,
): Promise<BoatModels> {
  const patrol = tier === PATROL_MODEL;
  const { file, tier: which } = patrol
    ? { file: PATROL_FILE, tier: -1 }
    : boatTier(tier);
  const prefix = patrol
    ? "boat-model-patrol"
    : which === 0
      ? "boat-model"
      : `boat-model-t${which}`;
  const model = await loadModel(scene, file);
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
      throw new Error(`${file}: no lantern glass or no hull found`);
    const body = mergeTurned(bodyMeshes, `${prefix}-body`, file);
    const lampMerged = mergeTurned(lampMeshes, `${prefix}-lamp`, file);
    model.root.dispose();
    const base = rgba(body, file);
    // The coarser copies, made from the model's own triangles (the model itself is not changed).
    const whole: Part = {
      positions: Array.from(body.getVerticesData(VertexBuffer.PositionKind)!),
      normals: Array.from(body.getVerticesData(VertexBuffer.NormalKind) ?? []),
      colors: Array.from(base),
      indices: Array.from(body.getIndices()!),
    };
    if (!whole.normals!.length) delete whole.normals;
    const coarse = boatLevels(whole)
      .slice(1)
      .map((part, k) => {
        const source = meshFrom(
          `${prefix}-source-${k + 1}`,
          scene,
          part.positions,
          part.indices,
          part.colors,
          part.normals,
        );
        const made = boatPalettes.map((palette, i) => {
          const hull = withColors(
            source,
            `${prefix}-${i}-l${k + 1}`,
            paintBoat(Float32Array.from(part.colors), palette, 4),
          );
          hull.isVisible = false;
          return useSolid(hull, "satin");
        });
        source.dispose();
        return made;
      });
    const hulls = boatPalettes.map((palette, i) => {
      const hull = withColors(
        body,
        `${prefix}-${i}`,
        paintBoat(base, palette, 4),
      );
      hull.isVisible = false;
      return useSolid(hull, "satin");
    });
    body.dispose();
    const lamp = withColors(lampMerged, `${prefix}-lamp-glow`, undefined);
    const lampPart: Part = {
      positions: Array.from(
        lampMerged.getVerticesData(VertexBuffer.PositionKind)!,
      ),
      colors: new Array(lampMerged.getTotalVertices() * 4).fill(1),
      indices: Array.from(lampMerged.getIndices()!),
    };
    lampMerged.dispose();
    const glow = glowMaterial(
      scene,
      which === 0 ? "boat-lamp-material" : `${prefix}-lamp-material`,
      {
        color: hex(PAL.light.lamp),
      },
    );
    lamp.material = glow;
    lamp.isVisible = false;
    const far = simplifyPart(lampPart, LAMP_FAR_TRIANGLES);
    const lampFar = meshFrom(
      `${prefix}-lamp-far-glow`,
      scene,
      far.positions,
      far.indices,
      far.colors,
    );
    lampFar.material = glow;
    lampFar.isVisible = false;
    lampFar.isPickable = false;
    lampFar.hasVertexAlpha = false;
    return { tier: which, hulls, lamp, coarse, lampFar };
  } catch (error) {
    model.root.dispose();
    throw error;
  }
}

/**
 * Puts a boat made of instances of the models under `parent` (its pose node). With `levels` (the
 * other players' boats) it also gets the instances of the two coarser copies, hidden until
 * `showBoatLevel` asks for them: the layout is [hull, lantern, middle hull, far hull, far lantern]
 * (the player's own boat is just the first two, always whole).
 */
export function dressBoat(
  models: BoatModels,
  palette: number,
  parent: TransformNode,
  name: string,
  levels = false,
): InstancedMesh[] {
  const at = palette % models.hulls.length;
  const look = [
    models.hulls[at]!.createInstance(`${name}-hull`),
    models.lamp.createInstance(`${name}-lamp`),
  ];
  if (levels)
    look.push(
      models.coarse[0]![at]!.createInstance(`${name}-l1-hull`),
      models.coarse[1]![at]!.createInstance(`${name}-l2-hull`),
      models.lampFar.createInstance(`${name}-l2-lamp`),
    );
  for (const mesh of look) {
    mesh.parent = parent;
    mesh.isPickable = false;
  }
  if (levels) showBoatLevel(look, 0);
  return look;
}

/** Shows level 0 (whole), 1 (middle) or 2 (far) of a boat dressed with `levels`, and hides the others. */
export function showBoatLevel(look: readonly AbstractMesh[], level: number) {
  if (look.length < 5) return;
  look[0]!.setEnabled(level === 0);
  look[1]!.setEnabled(level < 2);
  look[2]!.setEnabled(level === 1);
  look[3]!.setEnabled(level === 2);
  look[4]!.setEnabled(level === 2);
}
