import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Geo, shade, type Rgb } from "./geo.ts";
import { useSolid } from "./art/materials.ts";

/**
 * The rowing cats, as plain geometry (low-poly boxes and cones like the rest of the sea, one mesh
 * each): a cat sitting up, a pair of oars and a small rowing boat. Units are metres, +Z is the way
 * a thing faces, +Y up. The cat's origin is the middle of its seat (it sits on y = 0), an oar's
 * origin is its oarlock (turn it about Y to sweep, about X to dip or feather the blade), and the
 * boat's origin is the waterline middle. The cats and oars are plain data until `createCatParts`
 * makes the meshes, so the numbers are testable without a scene (tests/cat-model.test.mjs).
 */

export interface CatLook {
  fur: Rgb;
  belly: Rgb;
  stripe: Rgb;
}
/** Two cats: ginger and grey. */
export const CAT_LOOKS: readonly CatLook[] = [
  {
    fur: [0.93, 0.58, 0.25],
    belly: [0.98, 0.93, 0.85],
    stripe: [0.72, 0.38, 0.14],
  },
  {
    fur: [0.6, 0.62, 0.68],
    belly: [0.93, 0.94, 0.96],
    stripe: [0.38, 0.4, 0.46],
  },
];
const PINK: Rgb = [0.95, 0.6, 0.66];
const DARK: Rgb = [0.1, 0.09, 0.12];
const WOOD: Rgb = [0.62, 0.4, 0.22];
const PALE_WOOD: Rgb = [0.86, 0.72, 0.5];

/** Where the cat's paws grip the oar, from the oarlock (m, along the oar, inboard). */
export const GRIP = 0.3;

/** A cat sitting up, facing +Z, seat at y = 0 and about 1 m tall with its ears. */
export function catGeo(look: CatLook): Geo {
  const g = new Geo();
  const { fur, belly, stripe } = look;
  // Body, a lighter chest, thighs and feet stretched forward.
  g.box(0, 0.3, 0, 0.17, 0.3, 0.14, fur);
  g.box(0, 0.27, 0.135, 0.11, 0.2, 0.02, belly);
  for (const s of [-1, 1]) {
    g.box(s * 0.1, 0.06, 0.18, 0.07, 0.06, 0.18, fur);
    g.box(s * 0.1, 0.04, 0.4, 0.06, 0.04, 0.07, belly);
    // An arm reaching forward and outward to the oar.
    g.box(s * 0.2, 0.4, 0.06, 0.035, 0.1, 0.045, fur);
    g.box(s * 0.25, 0.32, 0.17, 0.035, 0.035, 0.1, fur);
  }
  // Head: a wide box, a pale muzzle, a pink nose, two dark eyes and three stripes on the brow.
  g.box(0, 0.78, 0.03, 0.17, 0.14, 0.15, fur);
  g.box(0, 0.72, 0.17, 0.08, 0.05, 0.04, belly);
  g.box(0, 0.745, 0.215, 0.022, 0.016, 0.01, PINK);
  for (const s of [-1, 1])
    g.box(s * 0.075, 0.81, 0.18, 0.02, 0.028, 0.01, DARK);
  for (const x of [-0.05, 0, 0.05])
    g.box(x, 0.925, 0.04, 0.012, 0.006, 0.06, stripe);
  // Ears: four-sided cones, pink inside.
  for (const s of [-1, 1]) {
    g.cone(s * 0.1, 0.89, 0.01, 0.075, 0.14, 4, fur, Math.PI / 4);
    g.cone(s * 0.1, 0.89, 0.04, 0.04, 0.09, 4, PINK, Math.PI / 4);
  }
  // Tail: out behind and curling up, a pale tip.
  g.box(0, 0.08, -0.22, 0.04, 0.04, 0.1, fur);
  g.box(0, 0.12, -0.36, 0.04, 0.08, 0.04, fur);
  g.box(0, 0.28, -0.36, 0.04, 0.1, 0.04, stripe);
  g.box(0, 0.42, -0.36, 0.04, 0.04, 0.04, belly);
  return g;
}

/**
 * An oar for one side (`side` +1 starboard, -1 port): the origin is the oarlock, the handle with
 * the cat's paws lies inboard, the blade outboard along ±X.
 */
export function oarGeo(side: 1 | -1, look: CatLook): Geo {
  const g = new Geo();
  g.box(side * 0.525, 0, 0, 0.975, 0.025, 0.025, WOOD);
  g.box(side * -0.3, 0, 0, 0.15, 0.032, 0.032, shade(WOOD, -0.15));
  // The blade: a flat paddle, with a darker rim stripe along it.
  g.box(side * 1.75, 0, 0, 0.3, 0.014, 0.1, PALE_WOOD);
  g.box(side * 1.75, 0.012, 0, 0.3, 0.004, 0.015, shade(PALE_WOOD, -0.2));
  // The paws round the handle.
  g.box(side * -GRIP, 0, 0, 0.05, 0.045, 0.045, look.fur);
  return g;
}

/** Boat dimensions the cats are placed by (m). */
export const ROWBOAT = {
  length: 3.8,
  halfBeam: 0.7,
  gunwale: 0.36,
  keel: -0.3,
  /** The seat's top (the cats sit on it) and where the two sit across the boat. */
  seat: 0.02,
  seatZ: 0.2,
  seatX: 0.3,
  /** The oarlocks, on the gunwale beside each cat. */
  lockX: 0.72,
  lockY: 0.4,
} as const;

/** A small clinker-style rowing boat: a pointed bow, a square stern, one thwart, planked inside. */
export function rowboatGeo(): Geo {
  const g = new Geo();
  const { length, halfBeam, gunwale, keel } = ROWBOAT;
  const sections = 9;
  // A cross-section at u in [0, 1] from the stern to the bow: gunwale, chine, keel, chine, gunwale.
  const ring = (u: number): [number, number, number][] => {
    const z = -length / 2 + u * length;
    const taper =
      u < 0.55 ? 1 - 0.1 * (0.55 - u) : Math.pow(1 - (u - 0.55) / 0.45, 0.7);
    const w = halfBeam * Math.max(taper, 0.02);
    const rise = u > 0.7 ? (u - 0.7) * 0.5 : 0;
    const y = gunwale + rise;
    const keelY =
      keel + (u > 0.8 ? (u - 0.8) * 1.2 : 0) + (u < 0.1 ? (0.1 - u) * 0.5 : 0);
    return [
      [-w, y, z],
      [-w * 0.62, (y + keelY) / 2 - 0.02, z],
      [0, keelY, z],
      [w * 0.62, (y + keelY) / 2 - 0.02, z],
      [w, y, z],
    ];
  };
  const rings = Array.from({ length: sections }, (_, i) =>
    ring(i / (sections - 1)),
  );
  for (let i = 0; i < sections - 1; i++)
    for (let k = 0; k < 4; k++) {
      const colour = k % 2 ? shade(WOOD, -0.08) : WOOD;
      const a = rings[i]![k]!;
      const b = rings[i]![k + 1]!;
      const c = rings[i + 1]![k + 1]!;
      const d = rings[i + 1]![k]!;
      // Both sides drawn: the planking is seen from outside and inside.
      g.tri(a, b, c, colour);
      g.tri(a, c, d, colour);
      g.tri(a, c, b, colour);
      g.tri(a, d, c, colour);
    }
  // A flat floor, the transom, one thwart and a bow post.
  g.box(0, keel + 0.08, 0, halfBeam * 0.5, 0.015, length * 0.38, PALE_WOOD);
  g.box(
    0,
    gunwale * 0.55,
    -length / 2,
    halfBeam * 0.85,
    gunwale * 0.55 + 0.02,
    0.03,
    shade(WOOD, -0.12),
  );
  g.box(
    0,
    ROWBOAT.seat - 0.03,
    ROWBOAT.seatZ,
    halfBeam * 0.9,
    0.03,
    0.14,
    PALE_WOOD,
  );
  g.box(
    0,
    gunwale + 0.2,
    length / 2 - 0.02,
    0.03,
    0.2,
    0.03,
    shade(WOOD, -0.1),
  );
  return g;
}

export interface CatParts {
  cats: Mesh[];
  oars: { starboard: Mesh[]; port: Mesh[] };
  boat: Mesh;
}

/** The meshes (templates: hidden, to be instanced) of the two looks of cat, their oars and the boat. */
export function createCatParts(scene: Scene): CatParts {
  const finish = (mesh: Mesh, look: "matte" | "satin" = "matte") => {
    useSolid(mesh, look);
    mesh.isVisible = false;
    mesh.isPickable = false;
    return mesh;
  };
  return {
    cats: CAT_LOOKS.map((look, i) =>
      finish(catGeo(look).toMesh(scene, `cat-${i}`)),
    ),
    oars: {
      starboard: CAT_LOOKS.map((look, i) =>
        finish(oarGeo(1, look).toMesh(scene, `cat-oar-s-${i}`)),
      ),
      port: CAT_LOOKS.map((look, i) =>
        finish(oarGeo(-1, look).toMesh(scene, `cat-oar-p-${i}`)),
      ),
    },
    boat: finish(rowboatGeo().toMesh(scene, "cat-rowboat")),
  };
}
