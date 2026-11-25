import type { Creature } from "./creature-geometry.ts";
import type { FishPart } from "./glb-parts.ts";

/**
 * A boat as the creature the picture painter draws (creature-thumb.ts), from its parsed model file
 * (glb-parts.ts `parseMeshesGlb`; the file's colours are palette 0's, which is what the shipyard's
 * cards show). The files have the bow at +Z and up at +Y; the painter looks along +Z with the nose
 * toward +X, so the boat is turned a quarter about Y (the bow to +X). Pure maths.
 */
export function boatCreature(main: FishPart, size: number): Creature {
  const positions = new Array<number>(main.positions.length);
  const normals = new Array<number>(main.normals.length);
  for (let i = 0; i < main.positions.length; i += 3) {
    positions[i] = main.positions[i + 2]!;
    positions[i + 1] = main.positions[i + 1]!;
    positions[i + 2] = -main.positions[i]!;
  }
  for (let i = 0; i < main.normals.length; i += 3) {
    normals[i] = main.normals[i + 2]!;
    normals[i + 1] = main.normals[i + 1]!;
    normals[i + 2] = -main.normals[i]!;
  }
  return {
    main: {
      positions,
      normals,
      indices: main.indices,
      colors: main.colors,
    },
    size,
    hook: [0, 0, 0],
  };
}
