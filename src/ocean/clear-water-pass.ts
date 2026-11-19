import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Material } from "@babylonjs/core/Materials/material";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import {
  CLEAR,
  UNDER_DEPTH_FRAGMENT,
  UNDER_FRAGMENT,
  UNDER_VERTEX,
  UNDER_SAMPLES,
  underSize,
  underwaterCapable,
  underwaterReach,
} from "./clear-water.ts";
import { SEA } from "./sea-atmosphere.ts";
import type { Water } from "./water.ts";

/**
 * The GPU part of the clear water (the rules and the shaders are in clear-water.ts): a small
 * render target, half the canvas in each direction, that the scene's under-the-water meshes
 * (boat hulls, market piles, rocks, buoys, the hooked fish and the line) are drawn on each frame
 * with a shader of their own (only the part below the waves, tinted by what the water absorbs),
 * and that the sea's shader reads back through itself (water.ts). Costs, per frame: one more
 * pass over those few meshes (see "Performance pass" in docs/ocean.md), one render target and
 * one texture read per water pixel. Switched off (`setEnabled(false)`: the target is not drawn
 * and the water reads nothing) the sea is the old opaque one.
 */
Effect.ShadersStore["underLayerVertexShader"] = UNDER_VERTEX;
Effect.ShadersStore["underLayerFragmentShader"] = UNDER_FRAGMENT;
Effect.ShadersStore["underDepthFragmentShader"] = UNDER_DEPTH_FRAGMENT;

export const UNDER_LAYER_MATERIAL = "under-layer";

/** "layer": the meshes are drawn in colour on the layer. "depth": only their distance is, and the sea blends over the main pass (a trial). */
export type SeeMode = "layer" | "depth";

export interface ClearWater {
  readonly mode: SeeMode;
  /** The layer, as the water reads it. */
  readonly texture: RenderTargetTexture;
  readonly enabled: boolean;
  /** Draws the layer (and lets the water show it) or not (the opaque sea). */
  setEnabled(on: boolean): void;
  /** Each frame: the sea clock and the camera (the layer follows the canvas size by itself). */
  update(time: number, camera: Vector3): void;
  /** Whether the layer draws this mesh (by its name, once it exists). */
  isDrawnBy(mesh: AbstractMesh): boolean;
  /** Draws `mesh` on the layer with `material` instead of the usual one (the fishing line). */
  dress(mesh: AbstractMesh, material: Material): void;
  /** A flat-coloured material for a thin strip on the layer (`tint` is its colour). */
  readonly lineMaterial: ShaderMaterial;
  /** How many meshes the layer drew in its last pass (0 when nothing is under the water in view, or when it is off). */
  drawn(): number;
  /** Compiles the layer's shaders ahead of the first frame that needs them. */
  compile(): Promise<void>;
  dispose(): void;
}

function layerMaterial(
  scene: Scene,
  name: string,
  unlit: boolean,
  fragment = "underLayer",
) {
  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: "underLayer", fragment },
    {
      attributes: ["position", "normal", "color"],
      uniforms: [
        "world",
        "viewProjection",
        "time",
        "cameraPosition",
        "sunDirection",
        "tint",
        "unlit",
      ],
    },
  );
  // Fins and the line are single sheets: both sides are drawn.
  material.backFaceCulling = false;
  material.setVector3("sunDirection", SEA.sunDirection);
  material.setColor3("tint", Color3.White());
  material.setFloat("unlit", unlit ? 1 : 0);
  material.setFloat("time", 0);
  return material;
}

/** Sets up the layer and hands it to the water. Undefined if the render target cannot be made (the sea stays opaque). */
export function createClearWater(
  scene: Scene,
  water: Water,
  mode: SeeMode = "layer",
): ClearWater | undefined {
  const depth = mode === "depth";
  const engine = scene.getEngine();
  let texture: RenderTargetTexture;
  try {
    texture = new RenderTargetTexture(
      "clear-water-layer",
      underSize(engine.getRenderWidth(), engine.getRenderHeight()),
      scene,
      !depth,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      false,
      depth ? Texture.NEAREST_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE,
      true,
      false,
    );
  } catch (error) {
    console.warn("No clear-water layer; the sea stays opaque.", error);
    return undefined;
  }
  // Multisampled (the layer is half the canvas: without it every silhouette is a staircase of 2 px steps).
  // (The depth mode packs a distance in the bytes: no averaging of samples.)
  texture.samples = depth ? 1 : UNDER_SAMPLES;
  // Nothing drawn: no colour, no sight. The water then shows only its own body there.
  texture.clearColor = new Color4(0, 0, 0, 0);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const fragment = depth ? "underDepth" : "underLayer";
  const material = layerMaterial(scene, UNDER_LAYER_MATERIAL, false, fragment);
  const lineMaterial = layerMaterial(scene, "under-layer-line", true, fragment);
  // Which meshes the layer draws, by name. Looked at each frame (a mesh can be renamed after it is
  // made: merged meshes are), remembered with the name it was judged by, and dressed in the layer's
  // material the first time it is seen to qualify.
  const seen = new Map<AbstractMesh, { name: string; capable: boolean }>();
  const dressed = new Map<AbstractMesh, Material>();
  const consider = (mesh: AbstractMesh) => {
    let note = seen.get(mesh);
    if (!note || note.name !== mesh.name) {
      // In the depth mode the main pass must draw what the layer holds: not the sea floor (the sea
      // paints its own) and not the line (the fishing gear keeps its own skin there).
      note = {
        name: mesh.name,
        capable:
          underwaterCapable(mesh.name) &&
          !(
            depth &&
            (mesh.name === "gear-under-line" || mesh.name.startsWith("seabed-"))
          ),
      };
      seen.set(mesh, note);
    }
    if (note.capable && !dressed.has(mesh)) {
      dressed.set(mesh, material);
      texture.setMaterialForRendering(mesh, material);
    }
    return note.capable;
  };
  const removed: Observer<AbstractMesh> | null =
    scene.onMeshRemovedObservable.add((mesh) => {
      seen.delete(mesh);
      dressed.delete(mesh);
    });
  // The list: the tracked meshes that are near the camera and in view (with a margin: a boat
  // moves between the frame its bounds were made and this one). Everything else is skipped, so
  // the layer costs only what could be seen through the water.
  texture.renderListPredicate = (mesh) => {
    if (!consider(mesh) || !mesh.isVisible) return false;
    const camera = scene.activeCamera;
    if (!camera) return true;
    const info = mesh.getBoundingInfo();
    // Wholly above the highest wave (a rock on the beach, a palm): never under the water.
    if (info.boundingBox.minimumWorld.y > CLEAR.top) return false;
    const sphere = info.boundingSphere;
    const centre = sphere.centerWorld;
    const radius = sphere.radiusWorld + 4;
    const near = underwaterReach(mesh.name) + radius;
    const dx = centre.x - camera.globalPosition.x;
    const dy = centre.y - camera.globalPosition.y;
    const dz = centre.z - camera.globalPosition.z;
    if (dx * dx + dy * dy + dz * dz > near * near) return false;
    for (const plane of scene.frustumPlanes ?? [])
      if (plane.dotCoordinate(centre) < -radius) return false;
    return true;
  };
  let on = false;
  const control: ClearWater = {
    mode,
    texture,
    lineMaterial,
    get enabled() {
      return on;
    },
    setEnabled(next) {
      if (next === on) return;
      on = next;
      const at = scene.customRenderTargets.indexOf(texture);
      if (next && at < 0) scene.customRenderTargets.push(texture);
      if (!next && at >= 0) scene.customRenderTargets.splice(at, 1);
      water.setUnderlayer(next ? texture : undefined, mode);
    },
    update(time, camera) {
      for (const m of [material, lineMaterial]) {
        m.setFloat("time", time);
        m.setVector3("cameraPosition", camera);
      }
      if (!on) return;
      const want = underSize(engine.getRenderWidth(), engine.getRenderHeight());
      const have = texture.getSize();
      if (want.width !== have.width || want.height !== have.height)
        texture.resize(want);
    },
    drawn() {
      return on ? (texture.renderList?.length ?? 0) : 0;
    },
    isDrawnBy(mesh) {
      return consider(mesh);
    },
    dress(mesh, dressing) {
      seen.set(mesh, { name: mesh.name, capable: true });
      dressed.set(mesh, dressing);
      texture.setMaterialForRendering(mesh, dressing);
    },
    async compile() {
      const sample = scene.meshes.find(
        (mesh) =>
          !mesh.isAnInstance && mesh.getTotalVertices() > 0 && consider(mesh),
      );
      if (!sample) return;
      await Promise.all(
        [material, lineMaterial].flatMap((m) => [
          m.forceCompilationAsync(sample as never),
          m.forceCompilationAsync(sample as never, { useInstances: true }),
        ]),
      ).catch(() => undefined);
    },
    dispose() {
      control.setEnabled(false);
      scene.onMeshRemovedObservable.remove(removed);
      texture.dispose();
      material.dispose();
      lineMaterial.dispose();
    },
  };
  control.setEnabled(true);
  return control;
}
