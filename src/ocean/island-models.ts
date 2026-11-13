import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Scene } from "@babylonjs/core/scene";
import { loadMergedModel } from "./model-loader.ts";
import { layoutIsland, type KeepOut, type Spot } from "./island-layout.ts";
import type { IslandVisual } from "./island-visual.ts";
import { GANGWAY_LANDING } from "./market.ts";

/**
 * The Blender-made island props (public/models, built by tools/blender/props.py): three coconut
 * palms, three rocks, three bushes and the stilt hut, loaded ONCE per scene and drawn as instances.
 *
 * Contract: `createIsland` is synchronous and always builds the procedural palms, broadleaf trees,
 * boulders, bushes and hut in a mesh of their own (`IslandVisual.fallback`), so an island is complete
 * without the models (headless tests, a failed or slow load). When `loadIslandModels` resolves,
 * `placeIslandProps` disposes that fallback mesh and puts instances of the models in its place,
 * parented to the island mesh (disposed with it, or with the scene). Calling it twice for one
 * island does nothing the second time. A failed load leaves the fallback where it is.
 */
export interface IslandModels {
  palms: readonly Mesh[];
  rocks: readonly Mesh[];
  bushes: readonly Mesh[];
  hut: Mesh;
}

const FILES = [
  "palm-1.glb",
  "palm-2.glb",
  "palm-3.glb",
  "rock-1.glb",
  "rock-2.glb",
  "rock-3.glb",
  "bush-1.glb",
  "bush-2.glb",
  "bush-3.glb",
  "hut.glb",
] as const;

/** Loads the ten models, each merged into one hidden source mesh. All or none. */
export async function loadIslandModels(scene: Scene): Promise<IslandModels> {
  const results = await Promise.allSettled(
    FILES.map((file) => loadMergedModel(scene, file)),
  );
  const meshes = results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed || scene.isDisposed) {
    for (const mesh of meshes) mesh.dispose();
    throw failed?.reason ?? new Error("scene disposed while loading");
  }
  for (const mesh of meshes) {
    mesh.isVisible = false;
    mesh.isPickable = false;
  }
  return {
    palms: meshes.slice(0, 3),
    rocks: meshes.slice(3, 6),
    bushes: meshes.slice(6, 9),
    hut: meshes[9]!,
  };
}

export interface PlacedProps {
  palms: number;
  rocks: number;
  bushes: number;
  hut: boolean;
  instances: InstancedMesh[];
}

const placed = new WeakMap<IslandVisual, PlacedProps>();

/**
 * Where a fish market's gangway lands on this island, as a keep-out capsule from the pier (in the
 * island's frame) to where it rests on the sand, up the beach. `piers` are in world coordinates; piers far from
 * the island are ignored.
 */
export function gangwayKeepOut(
  visual: IslandVisual,
  piers: readonly { x: number; z: number }[],
): KeepOut[] {
  const { x: ox, z: oz } = visual.mesh.position;
  return piers.flatMap((pier) => {
    const px = pier.x - ox;
    const pz = pier.z - oz;
    if (Math.hypot(px, pz) > visual.radius * 1.08 + 20) return [];
    const angle = Math.atan2(pz, px);
    const land = visual.coast(angle) - (GANGWAY_LANDING + 1);
    return [
      {
        ax: px,
        az: pz,
        bx: Math.cos(angle) * land,
        bz: Math.sin(angle) * land,
        r: 1.8,
      },
    ];
  });
}

/**
 * Replaces an island's procedural palms, trees, boulders, bushes and hut with instances of the models.
 * Returns what was placed (the same object on a second call).
 */
export function placeIslandProps(
  visual: IslandVisual,
  models: IslandModels,
  piers: readonly { x: number; z: number }[] = [],
): PlacedProps {
  const done = placed.get(visual);
  if (done) return done;
  const layout = layoutIsland({
    seed: visual.seed,
    radius: visual.radius,
    peak: visual.peak,
    height: visual.height,
    coast: visual.coast,
    keepOut: [...visual.keepOut, ...gangwayKeepOut(visual, piers)],
  });
  visual.fallback?.dispose();
  visual.fallback = undefined;
  const instances: InstancedMesh[] = [];
  const add = (source: Mesh, spot: Spot, name: string) => {
    const bottom = source.getBoundingInfo().boundingBox.minimum.y;
    const instance = source.createInstance(name);
    instance.parent = visual.mesh;
    instance.isPickable = false;
    instance.position.set(spot.x, spot.y - bottom * spot.scale, spot.z);
    instance.rotation.y = spot.yaw;
    instance.scaling.setAll(spot.scale);
    instance.freezeWorldMatrix();
    instances.push(instance);
  };
  layout.palms.forEach((spot, i) =>
    add(models.palms[spot.variant]!, spot, `palm-${i}`),
  );
  layout.rocks.forEach((spot, i) =>
    add(models.rocks[spot.variant]!, spot, `rock-${i}`),
  );
  layout.bushes.forEach((spot, i) =>
    add(models.bushes[spot.variant]!, spot, `bush-${i}`),
  );
  if (layout.hut) add(models.hut, layout.hut, "hut");
  const result: PlacedProps = {
    palms: layout.palms.length,
    rocks: layout.rocks.length,
    bushes: layout.bushes.length,
    hut: !!layout.hut,
    instances,
  };
  placed.set(visual, result);
  return result;
}
