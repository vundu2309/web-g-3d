import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { hex } from "./mesh-parts.ts";
import { ROD_BASE, ROD_LEAN, ROD_LENGTH, RodSim, type V3 } from "./rod.ts";
import {
  GUIDES,
  GUIDE_INNER,
  GUIDE_OUTER,
  GUIDE_SIDES,
  ROD_RINGS,
  ROD_SIDES,
  joined,
  radiusAt,
  type RodColour,
} from "./rod-plan.ts";
import { boatPalettes, type BoatPalette } from "./palette.ts";
import { PAL } from "./art/colors.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import { solidMaterial } from "./art/materials.ts";

/**
 * The rod on the boat: a fat cork handle, a ferrule, a tapered blank in two alternating colours
 * (the boat's own hull and trim colours, so every rod matches its boat), line guides and a round
 * bright tip (the shape is in rod-plan.ts), plus a round reel with a crank. The blank and the
 * guides are one small mesh whose vertices follow RodSim every frame, so it bends and shakes; the
 * reel never moves. Every boat has one; only the player's is stepped.
 */
const SAMPLES = 15;
const CORK = hex(PAL.rod.cork);
const CAP = hex(PAL.rod.cap);
const FERRULE = hex(PAL.metal.light);
const TIP = hex(PAL.rod.tip);

const colours = (
  palette: BoatPalette,
): Record<RodColour, ReturnType<typeof hex>> => ({
  cap: CAP,
  cork: CORK,
  ferrule: FERRULE,
  bandA: hex(palette.trim),
  bandB: hex(palette.hull),
  tip: TIP,
  guide: FERRULE,
});

const ringVertices = ROD_RINGS.length * ROD_SIDES;
const GUIDE_VERTICES = GUIDE_SIDES * 2;
const TOTAL_VERTICES = ringVertices + GUIDES.length * GUIDE_VERTICES;

export class RodVisual {
  readonly sim: RodSim;
  private readonly blank: Mesh;
  private readonly fixed: Mesh;
  private readonly positions = new Float32Array(TOTAL_VERTICES * 3);
  private readonly normals = new Float32Array(TOTAL_VERTICES * 3);
  private readonly points: V3[] = [];
  private readonly at = { x: 0, y: 0, z: 0 };
  private readonly ahead = { x: 0, y: 0, z: 0 };
  private readonly behind = { x: 0, y: 0, z: 0 };

  constructor(
    scene: Scene,
    parent: TransformNode,
    palette: BoatPalette = boatPalettes[0]!,
    rng?: () => number,
  ) {
    this.sim = new RodSim(rng);
    const paint = colours(palette);
    const indices: number[] = [];
    const colors: number[] = [];
    for (const ring of ROD_RINGS) {
      const c = paint[ring.colour];
      for (let k = 0; k < ROD_SIDES; k++) colors.push(c.r, c.g, c.b, 1);
    }
    for (let r = 0; r + 1 < ROD_RINGS.length; r++) {
      if (!joined(r)) continue;
      for (let k = 0; k < ROD_SIDES; k++) {
        const a = r * ROD_SIDES + k;
        const b = r * ROD_SIDES + ((k + 1) % ROD_SIDES);
        indices.push(a, b, a + ROD_SIDES, b, b + ROD_SIDES, a + ROD_SIDES);
      }
    }
    const guide = paint.guide;
    for (let g = 0; g < GUIDES.length; g++) {
      const base = ringVertices + g * GUIDE_VERTICES;
      for (let k = 0; k < GUIDE_VERTICES; k++)
        colors.push(guide.r, guide.g, guide.b, 1);
      for (let k = 0; k < GUIDE_SIDES; k++) {
        const n = (k + 1) % GUIDE_SIDES;
        const o = base + k;
        const o2 = base + n;
        const i = base + GUIDE_SIDES + k;
        const i2 = base + GUIDE_SIDES + n;
        indices.push(o, o2, i, o2, i2, i);
      }
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

    // The reel hangs under the handle, facing the stern (the chase camera looks at its face):
    // a round body, a lighter plate, a crank arm with a knob, and a stem to the handle.
    const fixed = new Parts(scene);
    const lean = ROD_LEAN;
    const along = { x: Math.sin(lean), y: Math.cos(lean) };
    const down = { x: Math.cos(lean), y: -Math.sin(lean) };
    const centre = (s: number, off: number): [number, number, number] => [
      ROD_BASE.x + along.x * ROD_LENGTH * s + down.x * off,
      ROD_BASE.y + along.y * ROD_LENGTH * s + down.y * off,
      ROD_BASE.z,
    ];
    const reelAt = centre(0.11, 0.45);
    const faceZ = reelAt[2] + 0.1;
    fixed.tube(
      { top: 0.1, bottom: 0.1, height: 0.2, sides: SIDES.small },
      PAL.metal.steel,
      centre(0.11, 0.22),
      [0, 0, Math.PI / 2 - lean],
    );
    fixed.tube(
      { top: 0.5, bottom: 0.5, height: 0.2, sides: SIDES.round },
      PAL.rod.reel,
      reelAt,
      [Math.PI / 2, 0, 0],
    );
    fixed.tube(
      { top: 0.3, bottom: 0.3, height: 0.03, sides: SIDES.round },
      PAL.metal.light,
      [reelAt[0], reelAt[1], faceZ + 0.01],
      [Math.PI / 2, 0, 0],
    );
    // The crank: an arm from the middle of the plate, and a knob on its end.
    fixed.box(
      [0.3, 0.06, 0.05],
      PAL.metal.steel,
      [reelAt[0] + 0.14, reelAt[1] - 0.04, faceZ + 0.05],
      [0, 0, -0.3],
    );
    fixed.sphere(
      0.13,
      PAL.rod.accent,
      [reelAt[0] + 0.28, reelAt[1] - 0.085, faceZ + 0.1],
      undefined,
      undefined,
      SIDES.small,
    );
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
    return this.points[SAMPLES - 1] ?? this.sim.tip();
  }

  /** How far the rod is bent, 0..1. */
  get bend() {
    return this.sim.bend;
  }

  /** The rod's centre line at `s` (0 butt .. 1 tip; past 1 it carries on straight). */
  private centre(s: number, out: V3): V3 {
    const p = this.points;
    const last = SAMPLES - 1;
    if (s >= 1) {
      const a = p[last - 1]!;
      const b = p[last]!;
      const size = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
      const k = ((s - 1) * ROD_LENGTH) / size;
      out.x = b.x + (b.x - a.x) * k;
      out.y = b.y + (b.y - a.y) * k;
      out.z = b.z + (b.z - a.z) * k;
      return out;
    }
    const f = Math.max(0, s) * last;
    const i = Math.min(last - 1, Math.floor(f));
    const t = f - i;
    const a = p[i]!;
    const b = p[i + 1]!;
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    return out;
  }

  private refresh() {
    this.sim.points(SAMPLES, this.points);
    const delta = 0.03;
    for (let r = 0; r < ROD_RINGS.length; r++) {
      const ring = ROD_RINGS[r]!;
      const s = ring.s;
      const c = this.centre(s, this.at);
      const a = this.centre(Math.max(0, s - delta), this.behind);
      const b = this.centre(Math.min(1.07, s + delta), this.ahead);
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
      for (let k = 0; k < ROD_SIDES; k++) {
        const angle = (k / ROD_SIDES) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const at = (r * ROD_SIDES + k) * 3;
        this.positions[at] = c.x + ux * cos * ring.radius;
        this.positions[at + 1] = c.y + uy * cos * ring.radius;
        this.positions[at + 2] = c.z + sin * ring.radius;
        this.normals[at] = ux * cos;
        this.normals[at + 1] = uy * cos;
        this.normals[at + 2] = sin;
      }
    }
    // The guides: flat eyelets on the underside, facing the stern.
    for (let g = 0; g < GUIDES.length; g++) {
      const s = GUIDES[g]!;
      const c = this.centre(s, this.at);
      const a = this.centre(s - delta, this.behind);
      const b = this.centre(s + delta, this.ahead);
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const size = Math.hypot(tx, ty, b.z - a.z) || 1;
      tx /= size;
      ty /= size;
      const ux = ty;
      const uy = -tx;
      // The eyelet's centre sits just outside the blank, so its edge touches the rod.
      const off = radiusAt(s) + GUIDE_OUTER * 0.82;
      const cx = c.x + ux * off;
      const cy = c.y + uy * off;
      const base = ROD_RINGS.length * ROD_SIDES + g * GUIDE_SIDES * 2;
      for (let k = 0; k < GUIDE_SIDES; k++) {
        const angle = (k / GUIDE_SIDES) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (const [row, radius] of [
          [0, GUIDE_OUTER],
          [1, GUIDE_INNER],
        ] as const) {
          const at = (base + row * GUIDE_SIDES + k) * 3;
          this.positions[at] = cx + (tx * cos + ux * sin) * radius;
          this.positions[at + 1] = cy + (ty * cos + uy * sin) * radius;
          this.positions[at + 2] = c.z;
          this.normals[at] = 0;
          this.normals[at + 1] = 0;
          this.normals[at + 2] = 1;
        }
      }
    }
  }

  dispose() {
    this.blank.dispose();
    this.fixed.dispose();
  }
}
