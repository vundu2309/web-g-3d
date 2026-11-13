import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { loadPartsModel, type PartsModel } from "./model-loader.ts";
import {
  CAT_IDS,
  CAT_PARTS,
  catFile,
  catRoot,
  type CatId,
  type CatPart,
} from "./cat-pose.ts";

/**
 * The three cat vendors (public/models/cat-*.glb), loaded ONCE per scene with their five parts
 * kept apart (cat-pose.ts names them and says how they move), each part one mesh with the sea's
 * shared satin solid look. Each cat is used by one market: `placeVendors` (market-vendor.ts)
 * parents the root to the pier. All or none: a failed load throws and the markets stay without a
 * vendor (the stall is complete without one).
 */
export type CatModel = PartsModel<CatPart>;
export type CatModels = Record<CatId, CatModel>;

export async function loadCats(scene: Scene): Promise<CatModels> {
  const results = await Promise.allSettled(
    CAT_IDS.map((id) => loadPartsModel(scene, catFile(id), CAT_PARTS)),
  );
  const loaded = results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed || scene.isDisposed) {
    const dispose = (mesh: Mesh) => mesh.dispose();
    for (const model of loaded) {
      model.meshes.forEach(dispose);
      model.root.dispose();
    }
    throw failed?.reason ?? new Error("scene disposed while loading");
  }
  const cats = {} as CatModels;
  CAT_IDS.forEach((id, i) => {
    const model = loaded[i]!;
    model.root.name = catRoot(id);
    model.root.setEnabled(false);
    cats[id] = model;
  });
  return cats;
}
