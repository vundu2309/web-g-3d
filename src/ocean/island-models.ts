import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { loadMergedModel } from "./model-loader.ts";
import { meshFrom } from "./mesh-parts.ts";
import {
  copyTriangles,
  FOG_CUT,
  FOG_CUT_TOUCH,
  propDistances,
  type PropDistances,
} from "./prop-lod.ts";
import { simplifyPart } from "./simplify.ts";
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

/** The distances of each prop source mesh (see prop-lod.ts), by mesh, for the fade and the tests. */
const distancesOf = new WeakMap<Mesh, PropDistances>();
/** The coarser copies of a source mesh (mid, far, impostor), for the batches (prop-batches.ts), which draw them as thin instances. */
const coarserOf = new WeakMap<Mesh, Mesh[]>();
export const propCopiesOf = (source: Mesh) => coarserOf.get(source);
/** An impostor is the model cut down to about this share of its triangles, never fewer than IMPOSTOR_MIN. */
const IMPOSTOR_SHARE = 0.04;
const IMPOSTOR_MIN = 20;
export const propDistancesOf = (source: Mesh) => distancesOf.get(source);

/**
 * Gives a source mesh its levels of detail: the whole model up to `full`, a coarser copy to `mid`, a
 * coarser one to `end`, then nothing (an instance follows its source mesh's levels, by its own
 * distance from the camera). The copies are made from the model's own triangles (simplify.ts); the
 * model is not changed. The prop fades out over the last part before `end` (prop-fade.ts), so the
 * hiding level lies a little beyond it.
 */
export function addPropLevels(source: Mesh, cut: number = FOG_CUT): void {
  const bounds = source.getBoundingInfo().boundingBox.extendSize;
  const size = Math.max(bounds.x, bounds.y, bounds.z) * 2;
  const distances = propDistances(size, cut);
  const positions = source.getVerticesData(VertexBuffer.PositionKind);
  const indices = source.getIndices();
  const colors = source.getVerticesData(VertexBuffer.ColorKind);
  const normals = source.getVerticesData(VertexBuffer.NormalKind);
  if (positions && indices && colors) {
    const whole = {
      positions: Array.from(positions),
      indices: Array.from(indices),
      colors: Array.from(colors),
      normals: normals ? Array.from(normals) : undefined,
    };
    const target = copyTriangles(indices.length / 3);
    const copies = [target.mid, target.far].map((triangles, level) => {
      const part = simplifyPart(whole, triangles);
      const copy = meshFrom(
        `${source.name}-lod${level + 1}`,
        source.getScene(),
        part.positions,
        part.indices,
        part.colors,
        part.normals,
      );
      copy.material = source.material;
      copy.useVertexColors = true;
      copy.hasVertexAlpha = false;
      copy.isVisible = false;
      copy.isPickable = false;
      return copy;
    });
    const impostor = simplifyPart(
      whole,
      Math.max(IMPOSTOR_MIN, Math.round((indices.length / 3) * IMPOSTOR_SHARE)),
    );
    const stand = meshFrom(
      `${source.name}-impostor`,
      source.getScene(),
      impostor.positions,
      impostor.indices,
      impostor.colors,
      impostor.normals,
    );
    stand.material = source.material;
    stand.useVertexColors = true;
    stand.hasVertexAlpha = false;
    stand.isVisible = false;
    stand.isPickable = false;
    coarserOf.set(source, [...copies, stand]);
    source.addLODLevel(distances.full, copies[0]!);
    source.addLODLevel(distances.mid, copies[1]!);
  }
  source.addLODLevel(distances.end * 1.03, null);
  distancesOf.set(source, distances);
}

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
  const models = {
    palms: meshes.slice(0, 3),
    rocks: meshes.slice(3, 6),
    bushes: meshes.slice(6, 9),
    hut: meshes[9]!,
  };
  // The islands are big and many: a prop is drawn whole while it is big, as a coarser copy as it
  // gets small and not at all once it is a few pixels or under the fog (prop-lod.ts), fading out
  // before it goes.
  const cut = window.matchMedia?.("(pointer: coarse)").matches
    ? FOG_CUT_TOUCH
    : FOG_CUT;
  for (const mesh of [
    ...models.palms,
    ...models.rocks,
    ...models.bushes,
    models.hut,
  ])
    addPropLevels(mesh, cut);
  return models;
}

export interface PlacedProps {
  palms: number;
  rocks: number;
  bushes: number;
  hut: boolean;
  /** Every hut placed (a village of several on a big island). */
  huts: number;
  instances: InstancedMesh[];
  /** For each instance, the distance (m) at which it has faded out and is dropped (prop-lod.ts). */
  ends: number[];
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
  const ends: number[] = [];
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
    ends.push(distancesOf.get(source)?.end ?? Infinity);
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
  layout.huts.forEach((spot, i) => add(models.hut, spot, `hut-${i}`));
  const result: PlacedProps = {
    palms: layout.palms.length,
    rocks: layout.rocks.length,
    bushes: layout.bushes.length,
    hut: !!layout.hut,
    huts: layout.huts.length,
    instances,
    ends,
  };
  placed.set(visual, result);
  return result;
}
