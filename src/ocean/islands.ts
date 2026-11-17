import { islandShape } from "./island-shape.ts";

/**
 * The islands of the sea: where they are and how big (the radius is the shape's scale, the coast
 * stays between 0.88 and 0.99 of it, island-shape.ts) and the ring boats collide at. Plain data
 * with no dependency on the rest of the sea, so the shore field (shore.ts) and the movement
 * rules (model.ts) can both read it.
 */
export interface Island {
  x: number;
  z: number;
  radius: number;
  /**
   * The ring the hull collides at: the farthest headland of the coast plus 4 m, so the invisible
   * wall stands only a few metres off the beach where the land reaches furthest out and a pier
   * there can reach the sand.
   */
  ring: number;
}

/** The seed of island `index` (its shape and props follow from it). */
export const islandSeed = (index: number) => 11 + index * 7;

const PLACES: ReadonlyArray<Pick<Island, "x" | "z" | "radius">> = [
  { x: 348, z: -106, radius: 100 },
  { x: 37, z: 465, radius: 91 },
  { x: 450, z: 676, radius: 147 },
  { x: -710, z: 162, radius: 181 },
  { x: -665, z: -485, radius: 126 },
  { x: -74, z: -1015, radius: 219 },
  { x: 827, z: -675, radius: 170 },
  { x: 993, z: 156, radius: 257 },
];

/** How far the coast reaches at its farthest point (m). */
function farthestCoast(seed: number, radius: number): number {
  const { coast } = islandShape(seed, radius);
  let far = 0;
  for (let k = 0; k < 1024; k++)
    far = Math.max(far, coast((k / 1024) * Math.PI * 2));
  return far;
}

export const islands: readonly Island[] = PLACES.map((place, index) => ({
  ...place,
  ring: farthestCoast(islandSeed(index), place.radius) + 4,
}));

/** Which islands (indices of `islands`) carry a lighthouse: landmarks to steer by across the open sea. */
export const lighthouseIslands: readonly number[] = [0, 3, 7];
