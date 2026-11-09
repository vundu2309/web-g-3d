import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { hex } from "./mesh-parts.ts";
import { ROD_BASE, RodSim, type V3 } from "./rod.ts";
import { PAL } from "./art/colors.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import { solidMaterial } from "./art/materials.ts";

/**
 * The rod on the boat: a cork handle, a tapered graphite blank with a bright tip, a
 * reel and a holder. The blank is one small mesh whose vertices follow RodSim every
 * frame, so it bends and shakes. Every boat has one; only the player's is stepped.
 */
const RINGS = 12;
const ROD_SIDES = 6;
const HANDLE = 0.15;
const CORK = hex(PAL.rod.cork);
const GRAPHITE = hex(PAL.rod.graphite);
const TIP = hex(PAL.rod.tip);

/** Radius along the rod, s from 0 (hand) to 1 (tip). */
const radius = (s: number) =>
  s < HANDLE ? 0.1 : 0.075 - 0.055 * ((s - HANDLE) / (1 - HANDLE));
const colour = (s: number) => (s < HANDLE ? CORK : s > 0.9 ? TIP : GRAPHITE);

export class RodVisual {
  readonly sim: RodSim;
  private readonly blank: Mesh;
  private readonly fixed: Mesh;
  private readonly positions = new Float32Array(RINGS * ROD_SIDES * 3);
  private readonly normals = new Float32Array(RINGS * ROD_SIDES * 3);
  private readonly points: V3[] = [];

  constructor(scene: Scene, parent: TransformNode, rng?: () => number) {
    this.sim = new RodSim(rng);
    const indices: number[] = [];
    const colors: number[] = [];
    for (let r = 0; r < RINGS; r++) {
      const c = colour(r / (RINGS - 1));
      for (let k = 0; k < ROD_SIDES; k++) colors.push(c.r, c.g, c.b, 1);
    }
    for (let r = 0; r < RINGS - 1; r++)
      for (let k = 0; k < ROD_SIDES; k++) {
        const a = r * ROD_SIDES + k;
        const b = r * ROD_SIDES + ((k + 1) % ROD_SIDES);
        indices.push(a, b, a + ROD_SIDES, b, b + ROD_SIDES, a + ROD_SIDES);
      }
    this.blank = new Mesh("rod-blank", scene);
    const data = new VertexData();
    this.refresh();
    data.positions = Array.from(this.positions);
    data.normals = Array.from(this.normals);
    data.colors = colors;
    data.indices = indices;
    data.applyToMesh(this.blank, true);
    this.blank.material = solidMaterial(scene, "gloss");
    this.blank.useVertexColors = true;
    this.blank.parent = parent;
    this.blank.isPickable = false;
    // The mesh moves with the bend; do not cull it by its first bounds.
    this.blank.alwaysSelectAsActiveMesh = true;

    // The reel and the holder never move.
    const fixed = new Parts(scene);
    fixed.tube(
      { top: 0.26, bottom: 0.26, height: 0.12, sides: SIDES.round },
      PAL.metal.light,
      [ROD_BASE.x + 0.28, ROD_BASE.y + 0.1, ROD_BASE.z + 0.02],
      [Math.PI / 2, 0, 0],
    );
    fixed.box([0.14, 0.5, 0.14], PAL.metal.steel, [
      ROD_BASE.x - 0.03,
      ROD_BASE.y - 0.2,
      ROD_BASE.z,
    ]);
    this.fixed = fixed.merge("rod-fixed");
    this.fixed.material = solidMaterial(scene, "gloss");
    this.fixed.useVertexColors = true;
    this.fixed.parent = parent;
    this.fixed.isPickable = false;
  }

  /** Advances the spring and updates the mesh. `pull` is in the boat's axes. */
  step(seconds: number, pull: V3, shake: number) {
    this.sim.step(seconds, pull, shake);
    this.refresh();
    this.blank.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.blank.updateVerticesData(VertexBuffer.NormalKind, this.normals);
  }

  /** Where the line starts, in the boat's axes. */
  tip(): V3 {
    return this.points[RINGS - 1] ?? this.sim.tip();
  }

  /** How far the rod is bent, 0..1. */
  get bend() {
    return this.sim.bend;
  }

  private refresh() {
    const points = this.sim.points(RINGS, this.points);
    for (let r = 0; r < RINGS; r++) {
      const a = points[Math.max(0, r - 1)]!;
      const b = points[Math.min(RINGS - 1, r + 1)]!;
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const size = Math.hypot(tx, ty, b.z - a.z) || 1;
      tx /= size;
      ty /= size;
      // A frame around the rod: u across it in the boat's plane, v along the boat.
      let ux = ty;
      let uy = -tx;
      const usize = Math.hypot(ux, uy) || 1;
      ux /= usize;
      uy /= usize;
      const rad = radius(r / (RINGS - 1));
      for (let k = 0; k < ROD_SIDES; k++) {
        const angle = (k / ROD_SIDES) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const nx = ux * c;
        const ny = uy * c;
        const nz = s;
        const at = (r * ROD_SIDES + k) * 3;
        this.positions[at] = points[r]!.x + nx * rad;
        this.positions[at + 1] = points[r]!.y + ny * rad;
        this.positions[at + 2] = points[r]!.z + nz * rad;
        this.normals[at] = nx;
        this.normals[at + 1] = ny;
        this.normals[at + 2] = nz;
      }
    }
  }

  dispose() {
    this.blank.dispose();
    this.fixed.dispose();
  }
}
