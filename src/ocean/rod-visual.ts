import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { hex } from "./mesh-parts.ts";
import { ROD_BASE, ROD_LEAN, ROD_LENGTH, RodSim, type V3 } from "./rod.ts";
import {
  GUIDE_INNER,
  GUIDE_OUTER,
  GUIDE_SIDES,
  ROD_SIDES,
  STUD_SIDES,
  joined,
  radiusAt,
  ROD_COLOUR_NAMES,
  rodPlan,
  rodTierIndex,
  type ReelPart,
  type RodColour,
  type RodPlan,
} from "./rod-plan.ts";
import { boatPalettes, type BoatPalette } from "./palette.ts";
import { rodColour } from "./rod-colours.ts";
import { PAL } from "./art/colors.ts";
import { Parts } from "./art/shapes.ts";
import { solidMaterial } from "./art/materials.ts";

/**
 * The rod on the boat: one of the four rods of the shop (rod-plan.ts: bamboo, fibreglass, carbon
 * fibre, gold), a slim tapered blank with hard colour bands, line guides and a round bright tip,
 * plus the reel that hangs under the handle. The blank and the guides are one small mesh whose
 * vertices follow RodSim every frame, so it bends and shakes; the reel is one merged mesh that
 * never moves. Every boat has one; only the player's is stepped.
 */
const SAMPLES = 15;

/** The colours of a plan as the blank's vertex colours; only the bamboo's thread wrap is the boat's own trim colour. */
const colours = (
  palette: BoatPalette,
): Record<RodColour, ReturnType<typeof hex>> => {
  const out = {} as Record<RodColour, ReturnType<typeof hex>>;
  for (const name of ROD_COLOUR_NAMES)
    out[name] = hex(rodColour(name, palette.trim));
  return out;
};

/** The colour of a reel part (Parts paints from a number); the reel has no boat colour. */
const reelColour = (name: RodColour): number => rodColour(name, PAL.rod.cap);

/** Vertices of the blank and what hangs on it: the rings, the guides, the studs on the guides. */
const verticesOf = (plan: RodPlan) => ({
  rings: plan.rings.length * ROD_SIDES,
  guide: GUIDE_SIDES * 2,
  stud: plan.stud ? STUD_SIDES * 2 : 0,
});

export class RodVisual {
  readonly sim: RodSim;
  /** Which rod it is (rod-plan.ts, 0 to 3). */
  readonly tier: number;
  private readonly plan: RodPlan;
  private readonly blank: Mesh;
  private readonly fixed: Mesh;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly points: V3[] = [];
  private readonly at = { x: 0, y: 0, z: 0 };
  private readonly ahead = { x: 0, y: 0, z: 0 };
  private readonly behind = { x: 0, y: 0, z: 0 };

  constructor(
    scene: Scene,
    parent: TransformNode,
    palette: BoatPalette = boatPalettes[0]!,
    rng?: () => number,
    /** Where the boat's rod holder is (boat-tier.ts `rod`); the first boat's by default. */
    base: V3 = ROD_BASE,
    /** Which rod it is (rod-plan.ts, 0 to 3; an invalid tier is the free bamboo rod). */
    tier = 0,
  ) {
    this.tier = rodTierIndex(tier);
    const plan = rodPlan(this.tier);
    this.plan = plan;
    this.sim = new RodSim(rng, base, plan.restBend);
    const per = verticesOf(plan);
    const total = per.rings + plan.guides.length * (per.guide + per.stud);
    this.positions = new Float32Array(total * 3);
    this.normals = new Float32Array(total * 3);
    const paint = colours(palette);
    const indices: number[] = [];
    const colors: number[] = [];
    for (const ring of plan.rings) {
      const c = paint[ring.colour];
      for (let k = 0; k < ROD_SIDES; k++) colors.push(c.r, c.g, c.b, 1);
    }
    for (let r = 0; r + 1 < plan.rings.length; r++) {
      if (!joined(plan, r)) continue;
      for (let k = 0; k < ROD_SIDES; k++) {
        const a = r * ROD_SIDES + k;
        const b = r * ROD_SIDES + ((k + 1) % ROD_SIDES);
        indices.push(a, b, a + ROD_SIDES, b, b + ROD_SIDES, a + ROD_SIDES);
      }
    }
    const guide = paint[plan.guideColour];
    for (let g = 0; g < plan.guides.length; g++) {
      const first = per.rings + g * (per.guide + per.stud);
      for (let k = 0; k < per.guide; k++)
        colors.push(guide.r, guide.g, guide.b, 1);
      for (let k = 0; k < GUIDE_SIDES; k++) {
        const n = (k + 1) % GUIDE_SIDES;
        const o = first + k;
        const o2 = first + n;
        const i = first + GUIDE_SIDES + k;
        const i2 = first + GUIDE_SIDES + n;
        indices.push(o, o2, i, o2, i2, i);
      }
      if (plan.stud) {
        const stud = paint[plan.stud.colour];
        const s0 = first + per.guide;
        for (let k = 0; k < per.stud; k++)
          colors.push(stud.r, stud.g, stud.b, 1);
        for (let k = 0; k < STUD_SIDES; k++) {
          const n = (k + 1) % STUD_SIDES;
          const o = s0 + k;
          const o2 = s0 + n;
          const i = s0 + STUD_SIDES + k;
          const i2 = s0 + STUD_SIDES + n;
          indices.push(o, o2, i, o2, i2, i);
        }
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
    // the parts of the plan, placed along the rod and on the side it leans away from.
    const fixed = new Parts(scene);
    const lean = ROD_LEAN;
    const along = { x: Math.sin(lean), y: Math.cos(lean) };
    const down = { x: Math.cos(lean), y: -Math.sin(lean) };
    const place = (at: readonly [number, number, number]): V3Tuple => [
      base.x + down.x * at[0] + along.x * at[2],
      base.y + down.y * at[0] + along.y * at[2],
      base.z + at[1],
    ];
    for (const part of plan.reel) addReelPart(fixed, part, place, lean);
    this.fixed = fixed.merge("rod-fixed");
    this.fixed.material = solidMaterial(scene, "gloss");
    this.fixed.useVertexColors = true;
    this.fixed.parent = parent;
    this.fixed.isPickable = false;
  }

  /** Draws the rod or leaves it out (a far boat has none, boat-lod.ts). */
  setVisible(visible: boolean) {
    this.blank.setEnabled(visible);
    this.fixed.setEnabled(visible);
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
    const plan = this.plan;
    const per = verticesOf(plan);
    this.sim.points(SAMPLES, this.points);
    const delta = 0.03;
    for (let r = 0; r < plan.rings.length; r++) {
      const ring = plan.rings[r]!;
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
    // The guides: flat eyelets on the underside, facing the stern, and a stud on each of the
    // rarer rods'.
    for (let g = 0; g < plan.guides.length; g++) {
      const s = plan.guides[g]!;
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
      const off = radiusAt(plan, s) + GUIDE_OUTER * 0.82;
      const cx = c.x + ux * off;
      const cy = c.y + uy * off;
      const first = per.rings + g * (per.guide + per.stud);
      for (let k = 0; k < GUIDE_SIDES; k++) {
        const angle = (k / GUIDE_SIDES) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (const [row, radius] of [
          [0, GUIDE_OUTER],
          [1, GUIDE_INNER],
        ] as const) {
          const at = (first + row * GUIDE_SIDES + k) * 3;
          this.positions[at] = cx + (tx * cos + ux * sin) * radius;
          this.positions[at + 1] = cy + (ty * cos + uy * sin) * radius;
          this.positions[at + 2] = c.z;
          this.normals[at] = 0;
          this.normals[at + 1] = 0;
          this.normals[at + 2] = 1;
        }
      }
      if (plan.stud) {
        // A small fan standing on the eyelet's far side, a little toward the stern so it shows.
        const sx = cx + tx * GUIDE_OUTER * 0.9;
        const sy = cy + ty * GUIDE_OUTER * 0.9;
        const s0 = first + per.guide;
        for (let k = 0; k < STUD_SIDES; k++) {
          const angle = (k / STUD_SIDES) * Math.PI * 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          for (const [row, radius] of [
            [0, plan.stud.radius],
            [1, plan.stud.radius * 0.25],
          ] as const) {
            const at = (s0 + row * STUD_SIDES + k) * 3;
            this.positions[at] = sx + (tx * cos + ux * sin) * radius;
            this.positions[at + 1] = sy + (ty * cos + uy * sin) * radius;
            this.positions[at + 2] = c.z + 0.012;
            this.normals[at] = 0;
            this.normals[at + 1] = 0;
            this.normals[at + 2] = 1;
          }
        }
      }
    }
  }

  dispose() {
    this.blank.dispose();
    this.fixed.dispose();
  }
}

type V3Tuple = [number, number, number];

/** Adds one part of a reel plan to `parts`, placed by `place` (reel frame to boat axes). */
function addReelPart(
  parts: Parts,
  part: ReelPart,
  place: (at: readonly [number, number, number]) => V3Tuple,
  lean: number,
) {
  const at = place(part.at);
  const color = reelColour(part.colour);
  switch (part.kind) {
    case "disc":
      parts.tube(
        {
          top: part.radius * 2,
          bottom: part.radius * 2,
          height: part.depth,
          sides: part.sides,
        },
        color,
        at,
        [Math.PI / 2, 0, 0],
      );
      break;
    case "ball":
      parts.sphere(
        part.diameter,
        color,
        at,
        undefined,
        part.flat === undefined ? undefined : [1, 1, part.flat],
        part.sides,
      );
      break;
    case "arm":
      parts.box(part.size, color, at, [0, 0, -lean - part.turn]);
      break;
    case "stem":
      parts.tube(
        {
          top: part.radius * 2,
          bottom: part.radius * 2,
          height: part.length,
          sides: part.sides,
        },
        color,
        at,
        [0, 0, Math.PI / 2 - lean],
      );
      break;
    case "post":
      parts.tube(
        {
          top: part.radius * 2,
          bottom: part.radius * 2,
          height: part.length,
          sides: part.sides,
        },
        color,
        at,
        [0, 0, -lean],
      );
      break;
  }
}
