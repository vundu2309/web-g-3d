import type { Scene } from "@babylonjs/core/scene";
import { meshFrom } from "./mesh-parts.ts";

/**
 * A growing buffer of small low-poly shapes (boxes, cones, grass blades) with a colour on
 * every vertex, turned into ONE mesh at the end. Hundreds of tufts, flowers and planks
 * cost one mesh and no per-object scene overhead, so detail stays cheap to build.
 */
export type Rgb = readonly [number, number, number];

export const rgbOf = (value: number): Rgb => [
  ((value >> 16) & 255) / 255,
  ((value >> 8) & 255) / 255,
  (value & 255) / 255,
];
/** A colour a little lighter or darker (amount about -0.1..0.1). */
export const shade = (c: Rgb, amount: number): Rgb => [
  Math.min(1, Math.max(0, c[0] + amount)),
  Math.min(1, Math.max(0, c[1] + amount)),
  Math.min(1, Math.max(0, c[2] + amount)),
];

export class Geo {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  get triangles() {
    return this.indices.length / 3;
  }

  private vertex(x: number, y: number, z: number, c: Rgb) {
    this.positions.push(x, y, z);
    this.colors.push(c[0], c[1], c[2], 1);
    return this.positions.length / 3 - 1;
  }

  /** One triangle from three points. */
  tri(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    color: Rgb,
  ) {
    const i = this.vertex(a[0], a[1], a[2], color);
    this.vertex(b[0], b[1], b[2], color);
    this.vertex(c[0], c[1], c[2], color);
    this.indices.push(i, i + 1, i + 2);
  }

  /** A box centred at (cx, cy, cz), half sizes (hx, hy, hz) in its own axes, turned by yaw about Y. */
  box(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    color: Rgb,
    yaw = 0,
  ) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const corner = (sx: number, sy: number, sz: number) => {
      const lx = sx * hx;
      const lz = sz * hz;
      return this.vertex(
        cx + lx * cos - lz * sin,
        cy + sy * hy,
        cz + lx * sin + lz * cos,
        color,
      );
    };
    const v: number[] = [
      corner(-1, -1, -1),
      corner(1, -1, -1),
      corner(1, -1, 1),
      corner(-1, -1, 1),
      corner(-1, 1, -1),
      corner(1, 1, -1),
      corner(1, 1, 1),
      corner(-1, 1, 1),
    ];
    const quad = (a: number, b: number, c: number, d: number) =>
      this.indices.push(v[a]!, v[b]!, v[c]!, v[a]!, v[c]!, v[d]!);
    quad(0, 1, 2, 3);
    quad(4, 7, 6, 5);
    quad(0, 4, 5, 1);
    quad(1, 5, 6, 2);
    quad(2, 6, 7, 3);
    quad(3, 7, 4, 0);
  }

  /** A cone (or a flat-topped one with `top` radius) standing on y = cy. */
  cone(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    height: number,
    sides: number,
    color: Rgb,
    yaw = 0,
    top = 0,
  ) {
    const ring: number[] = [];
    const upper: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = yaw + (i / sides) * Math.PI * 2;
      ring.push(
        this.vertex(
          cx + Math.cos(a) * radius,
          cy,
          cz + Math.sin(a) * radius,
          color,
        ),
      );
      upper.push(
        this.vertex(
          cx + Math.cos(a) * top,
          cy + height,
          cz + Math.sin(a) * top,
          color,
        ),
      );
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.indices.push(ring[i]!, ring[j]!, upper[j]!);
      if (top > 0) this.indices.push(ring[i]!, upper[j]!, upper[i]!);
    }
    if (top > 0)
      for (let i = 1; i < sides - 1; i++)
        this.indices.push(upper[0]!, upper[i]!, upper[i + 1]!);
  }

  /** A blade of grass: one tapering triangle that leans. */
  blade(
    x: number,
    y: number,
    z: number,
    height: number,
    width: number,
    yaw: number,
    lean: number,
    color: Rgb,
  ) {
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    this.tri(
      [x - dx * width, y, z - dz * width],
      [x + dx * width, y, z + dz * width],
      [x - dz * lean, y + height, z + dx * lean],
      color,
    );
  }

  toMesh(scene: Scene, name: string) {
    return meshFrom(name, scene, this.positions, this.indices, this.colors);
  }
}
