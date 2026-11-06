import type { Creature, Part } from "./creature-geometry.ts";

/**
 * A still picture of an animal from its own 3D model, with no WebGL: the triangles are
 * turned a little, shaded by a fixed light and sorted far to near (painter's algorithm).
 * This file is the pure maths (tested without a browser); app/fish-thumb.ts paints it.
 * The viewer looks along +Z from -Z, with the nose toward +X, as in creatures.ts.
 */
export interface ThumbTriangle {
  /** Screen points x0,y0,x1,y1,x2,y2 (y down). */
  points: [number, number, number, number, number, number];
  /** Distance from the viewer: larger is farther. */
  depth: number;
  /** 0..1 brightness. */
  light: number;
  /** Mean vertex colour, 0..1. */
  color: [number, number, number];
}

export interface Thumb {
  triangles: ThumbTriangle[];
  /** Extent of the points before fitting, for scaling to a canvas. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const LIGHT = (() => {
  const v = [-0.4, 0.75, -0.55];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / n, v[1]! / n, v[2]! / n] as const;
})();

export function projectCreature(
  creature: Creature,
  yaw = -0.45,
  pitch = 0.28,
): Thumb {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const parts: Array<{ part: Part; shift: readonly number[] }> = [
    { part: creature.main, shift: [0, 0, 0] },
  ];
  if (creature.tail)
    parts.push({ part: creature.tail.part, shift: creature.tail.pivot });
  const triangles: ThumbTriangle[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { part, shift } of parts) {
    const count = part.positions.length / 3;
    // Turn every vertex once: about Y by yaw, then about X by pitch.
    const turned = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = part.positions[i * 3]! + shift[0]!;
      const y = part.positions[i * 3 + 1]! + shift[1]!;
      const z = part.positions[i * 3 + 2]! + shift[2]!;
      const x1 = x * cy + z * sy;
      const z1 = -x * sy + z * cy;
      turned[i * 3] = x1;
      turned[i * 3 + 1] = y * cp - z1 * sp;
      turned[i * 3 + 2] = y * sp + z1 * cp;
    }
    for (let t = 0; t < part.indices.length; t += 3) {
      const a = part.indices[t]!;
      const b = part.indices[t + 1]!;
      const c = part.indices[t + 2]!;
      const ax = turned[a * 3]!;
      const ay = turned[a * 3 + 1]!;
      const az = turned[a * 3 + 2]!;
      const bx = turned[b * 3]!;
      const by = turned[b * 3 + 1]!;
      const bz = turned[b * 3 + 2]!;
      const ccx = turned[c * 3]!;
      const ccy = turned[c * 3 + 1]!;
      const ccz = turned[c * 3 + 2]!;
      // Face normal, turned to face the viewer (the surfaces are drawn two-sided).
      let nx = (by - ay) * (ccz - az) - (bz - az) * (ccy - ay);
      let ny = (bz - az) * (ccx - ax) - (bx - ax) * (ccz - az);
      let nz = (bx - ax) * (ccy - ay) - (by - ay) * (ccx - ax);
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      if (nz > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const light =
        0.52 +
        0.48 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const colors = part.colors;
      const color: [number, number, number] = [0, 0, 0];
      for (const v of [a, b, c])
        for (let k = 0; k < 3; k++) color[k]! += colors[v * 4 + k]! / 3;
      const points: ThumbTriangle["points"] = [ax, -ay, bx, -by, ccx, -ccy];
      for (let k = 0; k < 6; k += 2) {
        minX = Math.min(minX, points[k]!);
        maxX = Math.max(maxX, points[k]!);
        minY = Math.min(minY, points[k + 1]!);
        maxY = Math.max(maxY, points[k + 1]!);
      }
      triangles.push({ points, depth: (az + bz + ccz) / 3, light, color });
    }
  }
  // Far first, so near triangles paint over them.
  triangles.sort((p, q) => q.depth - p.depth);
  return { triangles, minX, maxX, minY, maxY };
}
