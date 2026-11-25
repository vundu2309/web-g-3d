import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { solidMaterial } from "./art/materials.ts";
import type { Part } from "./creature-geometry.ts";
import { parseMeshesGlb } from "./glb-parts.ts";
import { meshFrom } from "./mesh-parts.ts";
import { probe } from "./probe.ts";
import {
  SHIPYARDS,
  YARD_LOD_TRIANGLES,
  yardLevelOf,
  type Shipyard,
} from "./shipyard.ts";
import { simplifyPart } from "./simplify.ts";

/**
 * The three shipyards in the sea (shipyard.ts says where): the model public/models/shipyard.glb,
 * one source mesh per level (the whole model, and a copy of at most `YARD_LOD_TRIANGLES[1]`
 * triangles made at load from the model's own triangles, simplify.ts), each yard an instance of
 * one of them chosen by how big it looks (shipyard.ts `yardLevelOf`) or none when it is a speck.
 * The yards never move, so their matrices are frozen. A load that fails leaves the shores bare
 * (one console warning): the hub still works from the minimap and the button.
 *
 * Cost (not measured on a phone): while one yard is near it is one draw call and 7,537 triangles;
 * the middle copy is 1,500; beyond 1,700 m nothing. See docs/ocean.md "Performance pass".
 */
const FILE = "shipyard.glb";

const base = () => {
  const env = import.meta.env as { BASE_URL?: string } | undefined;
  return env?.BASE_URL ?? "./";
};

/** The model as parts: the whole, then the middle copy (the model itself is not changed). */
export function yardLevels(whole: Part): Part[] {
  return YARD_LOD_TRIANGLES.map((limit) =>
    Number.isFinite(limit) ? simplifyPart(whole, limit) : whole,
  );
}

/**
 * The turn of a yard about the vertical axis (radians, Babylon's `rotation.y`): the model's sea
 * side is +Z, and a node turned by `-heading` has its -Z where a boat of that heading points, so
 * the sea side looks along `facing` when the node is turned by `-facing + PI`.
 */
export const yardTurn = (yard: Shipyard) => Math.PI - yard.facing;

export interface ShipyardVisuals {
  /** Resolves when the model is drawn (or has failed); the scene's `ready()` waits for it. */
  ready: Promise<void>;
  /** Picks the level of every yard for the camera at (x, z); call once a frame. */
  update(x: number, z: number): void;
  dispose(): void;
}

export function createShipyards(scene: Scene): ShipyardVisuals {
  const sources: Mesh[] = [];
  const instances: { yard: Shipyard; at: (InstancedMesh | undefined)[] }[] = [];
  const levels: number[] = SHIPYARDS.map(() => 2);
  let disposed = false;
  const ready = (async () => {
    // `?yards=0` leaves the three yards out (a switch for finding what costs frames, probe.ts).
    if (probe("yards") === "0") return;
    try {
      const response = await fetch(`${base()}models/${FILE}`);
      if (!response.ok) throw new Error(`${response.status} for ${FILE}`);
      const { main } = parseMeshesGlb(await response.arrayBuffer());
      if (disposed || scene.isDisposed) return;
      const whole: Part = {
        positions: main.positions,
        normals: main.normals,
        indices: main.indices,
        colors: main.colors,
      };
      yardLevels(whole).forEach((part, level) => {
        const source = meshFrom(
          `shipyard-source-${level}`,
          scene,
          part.positions,
          part.indices,
          part.colors,
          part.normals,
        );
        source.material = solidMaterial(scene, "satin");
        source.useVertexColors = true;
        source.hasVertexAlpha = false;
        source.isPickable = false;
        source.isVisible = false;
        sources.push(source);
      });
      for (const yard of SHIPYARDS) {
        const at = sources.map((source, level) => {
          const instance = source.createInstance(`${yard.id}-${level}`);
          instance.position.set(yard.x, 0, yard.z);
          instance.rotationQuaternion = Quaternion.RotationAxis(
            Axis.Y,
            yardTurn(yard),
          );
          instance.isPickable = false;
          instance.freezeWorldMatrix();
          instance.setEnabled(false);
          return instance;
        });
        instances.push({ yard, at });
      }
    } catch (error) {
      if (!scene.isDisposed)
        console.warn(
          "The shipyard model did not load; the shores stay bare.",
          error,
        );
    }
  })();
  return {
    ready,
    update(x, z) {
      instances.forEach(({ yard, at }, i) => {
        const level = yardLevelOf(
          Math.hypot(x - yard.x, z - yard.z),
          levels[i],
        );
        if (level === levels[i]) return;
        levels[i] = level;
        at.forEach((instance, k) => instance?.setEnabled(k === level));
      });
    },
    dispose() {
      disposed = true;
      for (const { at } of instances) for (const mesh of at) mesh?.dispose();
      for (const source of sources) source.dispose();
    },
  };
}
