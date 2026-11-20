import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { useSolid } from "./art/materials.ts";
import { meshFrom } from "./mesh-parts.ts";
import { buildSeabed } from "./seabed.ts";

/**
 * The meshes of the sea floor (the rules and the data are in seabed.ts). One mesh per chunk of
 * about 110 m of coast, named `seabed-<island>-<chunk>`. They are hidden from the scene's own
 * camera (a layer mask it does not have). The first, colour see-through layer drew them; the depth
 * layer that replaced it (2026-11-20, clear-water.ts) deliberately leaves them out because the sea
 * paints its own floor, so nothing draws them now. They are KEPT on purpose (the user's decision,
 * 2026-11-20) for a later use; they cost memory only (see docs/ocean.md, "The sea floor").
 */
export const SEABED_LAYER_MASK = 0x10000000;

export interface Seabed {
  readonly meshes: readonly Mesh[];
  /** Triangles of the whole floor (for the tests and the budget). */
  readonly triangles: number;
  dispose(): void;
}

/** Builds the floor of the whole sea. */
export function createSeabed(scene: Scene): Seabed {
  const meshes: Mesh[] = [];
  let triangles = 0;
  for (const chunk of buildSeabed()) {
    const mesh = meshFrom(
      chunk.name,
      scene,
      chunk.positions,
      chunk.indices,
      chunk.colors,
    );
    useSolid(mesh, "matte");
    mesh.layerMask = SEABED_LAYER_MASK;
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    mesh.freezeWorldMatrix();
    triangles += chunk.indices.length / 3;
    meshes.push(mesh);
  }
  return {
    meshes,
    triangles,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      meshes.length = 0;
    },
  };
}
