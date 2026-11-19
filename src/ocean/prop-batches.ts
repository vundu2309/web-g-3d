import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Plane } from "@babylonjs/core/Maths/math.plane";
import { CLEAR } from "./clear-water.ts";
import {
  propCopiesOf,
  propDistancesOf,
  type PlacedProps,
} from "./island-models.ts";

/**
 * The island props as batches. A palm, bush or hut (and a rock on dry ground) is not a mesh of its
 * own: the props of one model and one level of detail are ONE mesh drawn with thin instances, so
 * hundreds of props cost a handful of draw calls and no per-prop scene work. Every frame each
 * prop is placed in a level by its distance (the whole model, a mid copy, a far copy, then an
 * impostor: the model cut to a few dozen triangles, a stand-in for a prop only a few pixels big),
 * or dropped when it is out of range or out of view (the frustum test is ours, since Babylon only
 * culls a thin-instanced mesh as a whole). A rock in the shallows is NOT batched: the clear-water
 * layer draws it by name (clear-water.ts), so it stays an ordinary instance.
 *
 * The levels are not Babylon LOD levels (those would apply to the whole batch, by the distance of
 * its middle); they are separate meshes, each with its own thin-instance buffer.
 */

/** A prop of this model covers this angle (radians) at the far end of its far copy; beyond, the impostor. */
export const IMPOSTOR_ANGLE = 0.01;

/** The four distances of a prop of this longest side: whole to `full`, mid to `mid`, far copy to `far`, impostor to `end`. */
export function batchDistances(
  size: number,
  full: number,
  mid: number,
  end: number,
) {
  const far = Math.min(Math.max(size / IMPOSTOR_ANGLE, mid * 1.2), end * 0.9);
  return { full, mid, far, end };
}

/** Which level (0 whole, 1 mid, 2 far, 3 impostor) a prop at this squared distance is drawn at; -1 for none. */
export function levelAt(
  squared: number,
  d: { full: number; mid: number; far: number; end: number },
): number {
  if (squared <= d.full * d.full) return 0;
  if (squared <= d.mid * d.mid) return 1;
  if (squared <= d.far * d.far) return 2;
  if (squared <= d.end * d.end) return 3;
  return -1;
}

interface Model {
  levels: Mesh[];
  buffers: Float32Array[];
  distances: { full: number; mid: number; far: number; end: number };
  /** Per prop: 16 matrix numbers, then x, y, z of the middle and the radius. */
  matrices: number[];
  centres: number[];
  radii: number[];
}

const nameOf = (source: Mesh) => {
  const found = /(palm|rock|bush|hut)-?(\d*)/.exec(source.name);
  return found ? `${found[1]}-batch-${found[2] || 0}` : `prop-batch`;
};

export class PropBatches {
  private readonly models = new Map<Mesh, Model>();

  private modelOf(source: Mesh): Model | undefined {
    let model = this.models.get(source);
    if (model) return model;
    const copies = propCopiesOf(source);
    const base = propDistancesOf(source);
    if (!copies || !base) return undefined;
    const bounds = source.getBoundingInfo().boundingBox.extendSize;
    const size = Math.max(bounds.x, bounds.y, bounds.z) * 2;
    const name = nameOf(source);
    const levels = [source, ...copies].map((mesh, level) => {
      const batch = mesh.clone(`${name}-L${level}`, null, true);
      // A clone takes the levels of detail of what it copies; a batch has none of its own.
      for (const lod of [...batch.getLODLevels()])
        batch.removeLODLevel(lod.mesh);
      batch.isVisible = false;
      batch.isPickable = false;
      // The batch's own bounds are those of one model at the origin: the frustum test is ours.
      batch.alwaysSelectAsActiveMesh = true;
      return batch;
    });
    model = {
      levels,
      buffers: [],
      distances: batchDistances(size, base.full, base.mid, base.end),
      matrices: [],
      centres: [],
      radii: [],
    };
    this.models.set(source, model);
    return model;
  }

  /**
   * Takes over the props of one island that can be batched: reads their places (they never move),
   * disposes those instances and remembers where they stood. Returns how many were taken.
   */
  add(placed: PlacedProps): number {
    let taken = 0;
    const kept: typeof placed.instances = [];
    const keptEnds: number[] = [];
    placed.instances.forEach((instance, i) => {
      const source = instance.sourceMesh;
      instance.computeWorldMatrix(true);
      const info = instance.getBoundingInfo();
      // Only a rock can be seen through the water (the clear-water layer draws it by name), and
      // only one that is not wholly above the highest wave.
      const model =
        !/rock/.test(source.name) || info.boundingBox.minimumWorld.y > CLEAR.top
          ? this.modelOf(source)
          : undefined;
      if (!model) {
        kept.push(instance);
        keptEnds.push(placed.ends[i] ?? Infinity);
        return;
      }
      const world = instance.getWorldMatrix();
      for (let k = 0; k < 16; k++) model.matrices.push(world.m[k]!);
      const sphere = info.boundingSphere;
      model.centres.push(
        sphere.centerWorld.x,
        sphere.centerWorld.y,
        sphere.centerWorld.z,
      );
      model.radii.push(sphere.radiusWorld);
      instance.dispose();
      taken++;
    });
    placed.instances.length = 0;
    placed.instances.push(...kept);
    placed.ends.length = 0;
    placed.ends.push(...keptEnds);
    for (const model of this.models.values()) {
      const count = model.radii.length;
      model.buffers = model.levels.map((mesh) => {
        const buffer = new Float32Array(count * 16);
        mesh.thinInstanceSetBuffer("matrix", buffer, 16, false);
        mesh.thinInstanceCount = 0;
        return buffer;
      });
    }
    return taken;
  }

  /** Puts every prop in the level its distance asks for; call once a frame. */
  update(eye: { x: number; y: number; z: number }, planes: readonly Plane[]) {
    for (const model of this.models.values()) {
      const counts = [0, 0, 0, 0];
      const { distances, matrices, centres, radii, buffers } = model;
      for (let i = 0; i < radii.length; i++) {
        const dx = centres[i * 3]! - eye.x;
        const dy = centres[i * 3 + 1]! - eye.y;
        const dz = centres[i * 3 + 2]! - eye.z;
        const level = levelAt(dx * dx + dy * dy + dz * dz, distances);
        if (level < 0) continue;
        // Out of view, with a margin: the planes are the last frame's.
        const radius = radii[i]! + 4;
        let seen = true;
        for (const plane of planes)
          if (
            plane.normal.x * centres[i * 3]! +
              plane.normal.y * centres[i * 3 + 1]! +
              plane.normal.z * centres[i * 3 + 2]! +
              plane.d <
            -radius
          ) {
            seen = false;
            break;
          }
        if (!seen) continue;
        const out = buffers[level]!;
        const at = counts[level]! * 16;
        for (let k = 0; k < 16; k++) out[at + k] = matrices[i * 16 + k]!;
        counts[level]!++;
      }
      model.levels.forEach((mesh, level) => {
        const count = counts[level]!;
        // A thin-instanced mesh with no instances would be drawn once as a plain mesh.
        mesh.isVisible = count > 0;
        mesh.thinInstanceCount = count;
        if (count > 0) mesh.thinInstanceBufferUpdated("matrix");
      });
    }
  }

  dispose() {
    for (const model of this.models.values())
      for (const mesh of model.levels) mesh.dispose();
    this.models.clear();
  }
}
