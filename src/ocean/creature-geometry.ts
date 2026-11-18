/**
 * The sea animals as plain arrays (positions, triangle indices, per-vertex colours). No Babylon
 * here: the animals can be tested for size, validity and facing without a GPU, and
 * `creature-kit.ts` turns them into one mesh each. The animals themselves are the GLB files
 * (see glb-parts.ts); the only shape made from code is the stand-in below.
 * Convention: the longest side is 1 unit, the nose toward +X, up is +Y and the animal is
 * centred on its origin.
 */
export type V3 = readonly [number, number, number];
export type RGB = readonly [number, number, number];

/** What a mesh needs; `tail` is a separate part so it can swing about `pivot`. */
export interface Part {
  positions: number[];
  indices: number[];
  colors: number[];
  /** Smooth normals when the part comes with them (the models); else they are computed. */
  normals?: number[];
}
export interface Creature {
  main: Part;
  tail?: { part: Part; pivot: V3 };
  /** Longest side of the creature in model units (for fitting to a view). */
  size: number;
  /** Where a hook goes through the animal (the mouth or the head), model units. */
  hook: V3;
}

export function bounds(part: Part) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < part.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, part.positions[i + k]!);
      max[k] = Math.max(max[k]!, part.positions[i + k]!);
    }
  return { min, max };
}
export const triangleCount = (part: Part) => part.indices.length / 3;

/**
 * A plain pale ellipsoid, 1 long, nose toward +X: what is drawn for the moment before an animal's
 * file has arrived (or if it never does), so a hooked fish is never missing from the line. It is
 * not any species; it is only there so the scene has something to hold until the real model comes.
 */
export function placeholderCreature(): Creature {
  const rings = 10;
  const sides = 12;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const radii: V3 = [0.5, 0.14, 0.1];
  for (let r = 0; r <= rings; r++) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s < sides; s++) {
      const theta = (2 * Math.PI * s) / sides;
      const x = Math.cos(phi);
      const y = Math.sin(phi) * Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      positions.push(x * radii[0], y * radii[1], z * radii[2]);
      const nx = x / radii[0];
      const ny = y / radii[1];
      const nz = z / radii[2];
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / length, ny / length, nz / length);
      colors.push(0.72, 0.8, 0.86, 1);
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < sides; s++) {
      const a = r * sides + s;
      const b = r * sides + ((s + 1) % sides);
      const c = (r + 1) * sides + s;
      const d = (r + 1) * sides + ((s + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  return {
    main: { positions, normals, indices, colors },
    size: 1,
    hook: [0.46, 0, 0],
  };
}
