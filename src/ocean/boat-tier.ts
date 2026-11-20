import { ROD_BASE, type V3 } from "./rod.ts";

/**
 * The four boats of the upgrade shop and everything about a boat that depends on its tier (pure
 * numbers, no Babylon: tests read them, boat-physics.ts, boat-visual.ts, the water shader and the
 * wake build on them). Tier index 0 is the player's first boat (public/models/boat.glb, 7.4 m),
 * 1 to 3 are the bigger ones (boat-2.glb 8.4 m, boat-3.glb 9.6 m, boat-4.glb 10.8 m); an invalid
 * tier is tier 0. See docs/work/2026-11-19-upgrade-shop.md, step 6.
 *
 * A better boat has more slots, NOT more speed (the user's choice): the hull's mass, the drive and
 * every handling number stay as tuned, and only the body (the box Havok collides with, the points
 * the buoyancy is sampled at), the picture and the water round it follow the tier. Tier 0 is today's
 * boat to the last digit; tests/boat-tier.test.mjs pins it, and pins every other row against the
 * exported models, so a re-export that changes a size fails there.
 *
 * Axes are the game's: +X starboard, +Y up, the bow at -Z (the rod holder at the stern, +Z).
 */

/** How many boats there are. */
export const BOAT_TIER_COUNT = 4;

/** Hull mass (kg), the same for every tier: a better boat is not heavier to push. */
export const HULL_MASS = 900;
/** Height of the collision box (m), the same for every tier: it sets where the waterline is. */
export const HULL_HEIGHT = 1.4;

/** The waterline outline the collar and the rings of hull-water.ts are measured from (m). */
export interface Waterline {
  /** Half the length of the outline. */
  halfLength: number;
  /** Half the width amidships. */
  beam: number;
  /** Half the width of the transom, where the outline is narrowest at the stern. */
  stern: number;
  /** Half the width at the stem, where it is drawn to a point. */
  tip: number;
}

/** How a hull stirs the water (ripple-sim.ts): the reach of its push, and where its stern is (m). */
export interface WakeShape {
  /** Reach of the push along the keel. */
  length: number;
  /** Reach of the push across it. */
  width: number;
  /** How far behind the middle of the hull the propeller churns. */
  stern: number;
  /** How far from the middle of the hull the grid cells are touched. */
  reach: number;
}

/**
 * The shadow a boat throws on the water, as the three parts the shader sweeps (water.ts): the
 * hull, the wheelhouse and the mast with its lantern. `shift` is how far ahead of the middle of
 * the hull the part is centred, the lengths and widths are half sizes, `from`/`to` the heights
 * (m above the waterline) it is swept through.
 */
export interface BoatShadow {
  hull: { length: number; width: number; top: number };
  house: {
    shift: number;
    length: number;
    width: number;
    from: number;
    to: number;
  };
  mast: { shift: number; from: number; to: number };
}

export interface BoatTierSpec {
  /** 0 to 3. */
  tier: number;
  /** The GLB under public/models. */
  file: string;
  /** Triangles of the whole model (the six parts of the file, without the rod), measured on the export. */
  triangles: number;
  /** The hull as modelled: its design length and half its beam at the gunwale (m). */
  hullLength: number;
  halfBeam: number;
  /**
   * The box Havok collides with (m). Its length and height are the hull's; its width is the hull's
   * too, except for a boat whose outrigger booms reach farther out (the flagship: 7.3 m), where the
   * box covers them (the user's choice, 2026-11-20). The mast and the house are not in it.
   */
  box: { width: number; height: number; length: number };
  /**
   * The hull's own body (m): the box of the hull without the booms. Everything the boat's feel is
   * worked from (the buoyancy points, the inertia Havok is given, the rudder and the lean) follows
   * this, so a wide collision box does not change how a boat turns, leans or floats.
   */
  hull: { width: number; length: number };
  waterline: Waterline;
  /** How far ahead of the boat's position the stem is (m). */
  bowTip: number;
  wake: WakeShape;
  /** Where the rod is held, in the boat's axes (rod.ts ROD_BASE for tier 0). */
  rod: V3;
  shadow: BoatShadow;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The box is this share of the beam at the gunwale (tier 0: 2.8 m of 3.0): the planking leans in below it. */
const BOX_BEAM = 2.8 / 3.0;

/**
 * The width of the flagship over its outrigger booms (m), measured on boat-4.glb (the farthest
 * vertex from the keel is 3.65 m out, tests/boat-tier.test.mjs pins it).
 */
const OUTRIGGER_SPAN = 7.3;

/** Tier 0 as it always was; every other tier scales these by its length and beam. */
const BASE = {
  hullLength: 7.4,
  halfBeam: 1.5,
  waterline: { halfLength: 3.9, beam: 1.45, stern: 1.0, tip: 0.2 },
  wake: { length: 3.2, width: 1.2, stern: 2.8, reach: 9 },
};

interface Row {
  file: string;
  triangles: number;
  hullLength: number;
  halfBeam: number;
  /** The widest the collision box must be (m), when a part of the boat reaches out past the hull. */
  reach?: number;
  rod: V3;
  shadow: BoatShadow;
}

/**
 * Measured on the exported models (tests/boat-tier.test.mjs): the hull's length and beam, where
 * the rod holder's collar is, the wheelhouse and the lantern.
 */
const ROWS: readonly Row[] = [
  {
    file: "boat.glb",
    triangles: 3721,
    hullLength: 7.4,
    halfBeam: 1.5,
    rod: ROD_BASE,
    shadow: {
      hull: { length: 3.9, width: 1.5, top: 1.71 },
      house: { shift: 1.0, length: 0.95, width: 0.85, from: 0.8, to: 2.21 },
      mast: { shift: 0.7, from: 2.2, to: 3.82 },
    },
  },
  {
    file: "boat-2.glb",
    triangles: 5443,
    hullLength: 8.4,
    halfBeam: 1.78,
    rod: { x: 1.38, y: 1.37, z: 3.02 },
    shadow: {
      hull: { length: 4.4, width: 1.78, top: 1.82 },
      house: { shift: 1.2, length: 1.15, width: 0.98, from: 0.8, to: 2.5 },
      mast: { shift: 0.85, from: 2.5, to: 4.19 },
    },
  },
  {
    file: "boat-3.glb",
    triangles: 5757,
    hullLength: 9.6,
    halfBeam: 1.93,
    rod: { x: 1.52, y: 1.41, z: 3.62 },
    shadow: {
      hull: { length: 5.0, width: 1.93, top: 1.94 },
      house: { shift: 1.5, length: 1.5, width: 1.1, from: 0.84, to: 2.9 },
      mast: { shift: 0.2, from: 2.9, to: 5.36 },
    },
  },
  {
    file: "boat-4.glb",
    triangles: 7991,
    hullLength: 10.8,
    halfBeam: 2.08,
    reach: OUTRIGGER_SPAN,
    rod: { x: 1.66, y: 1.45, z: 4.22 },
    shadow: {
      hull: { length: 5.6, width: 2.08, top: 2.06 },
      house: { shift: 1.55, length: 1.7, width: 1.2, from: 0.88, to: 4.3 },
      mast: { shift: 1.85, from: 4.3, to: 6.81 },
    },
  },
];

function spec(row: Row, tier: number): BoatTierSpec {
  const kLength = row.hullLength / BASE.hullLength;
  const kBeam = row.halfBeam / BASE.halfBeam;
  const line = BASE.waterline;
  const wake = BASE.wake;
  const hullWidth = round2(2 * row.halfBeam * BOX_BEAM);
  return {
    tier,
    file: row.file,
    triangles: row.triangles,
    hullLength: row.hullLength,
    halfBeam: row.halfBeam,
    box: {
      width: Math.max(hullWidth, row.reach ?? 0),
      height: HULL_HEIGHT,
      length: row.hullLength,
    },
    hull: { width: hullWidth, length: row.hullLength },
    waterline: {
      halfLength: round2(row.hullLength / 2 + 0.2),
      beam: round2(row.halfBeam - 0.05),
      stern: round2(line.stern * kBeam),
      tip: round2(line.tip * kBeam),
    },
    bowTip: round2(row.hullLength / 2),
    wake: {
      length: round2(wake.length * kLength),
      width: round2(wake.width * kBeam),
      stern: round2(wake.stern * kLength),
      reach: round2(wake.reach * kLength),
    },
    rod: { ...row.rod },
    shadow: row.shadow,
  };
}

/** Every boat, tier 0 first. */
export const BOAT_TIERS: readonly BoatTierSpec[] = ROWS.map(spec);

/** `tier` if it is a whole number from 0 to the top boat, else 0 (the free first boat). */
export function boatTierIndex(tier: unknown): number {
  return typeof tier === "number" &&
    Number.isInteger(tier) &&
    tier >= 0 &&
    tier < BOAT_TIER_COUNT
    ? tier
    : 0;
}

/** The row of a tier; an invalid tier gives tier 0. */
export function boatTier(tier: unknown): BoatTierSpec {
  return BOAT_TIERS[boatTierIndex(tier)]!;
}

/** The box of tier 0, which every handling number was tuned on. */
const FIRST = BOAT_TIERS[0]!;
/** The hull of tier 0 (7.4 x 2.8 m): every handling number was tuned on it. */
export const FIRST_BOX = FIRST.hull;

/**
 * The points the buoyancy is sampled at, on the hull's bottom: stern, midship and bow on each
 * side. They keep their place in the box (tier 0: 1.1 m out and 3 m fore and aft in a 2.8 x 7.4 m
 * box), so the boat rolls and pitches as stiffly for its size, and the mass on them gives the same
 * waterline whatever the box (the stiffness is set from the mass, see boat-physics.ts).
 */
export function hullSamples(tier: unknown): { x: number; z: number }[] {
  const { hull } = boatTier(tier);
  const x = 1.1 * (hull.width / FIRST_BOX.width);
  const z = 3 * (hull.length / FIRST_BOX.length);
  return [-1, 1].flatMap((side) =>
    [z, 0, -z].map((at) => ({ x: side * x, z: at })),
  );
}

/** Where the bow's lift is applied, metres ahead of the middle (tier 0: 3.2 m). */
export function bowAnchor(tier: unknown): number {
  const { hull } = boatTier(tier);
  return 3.2 * (hull.length / FIRST_BOX.length);
}

/**
 * How much farther back and higher the chase camera sits for a bigger boat, so its stern is not cut
 * off by the bottom of the screen (1 for the first boat, whose framing was tuned; half the growth of
 * the hull's length for the others: 1.07, 1.13, 1.23).
 */
export function cameraScale(tier: unknown): number {
  return 1 + 0.5 * (boatTier(tier).hullLength / FIRST.hullLength - 1);
}

/** Ratio of the tier's hull to tier 0's, for the numbers that follow the hull's size. */
export function boxRatio(tier: unknown): { width: number; length: number } {
  const { hull } = boatTier(tier);
  return {
    width: hull.width / FIRST_BOX.width,
    length: hull.length / FIRST_BOX.length,
  };
}

/**
 * The GLSL that gives the water shader the shape of a boat from its code (the `w` of its slot in
 * `boats`: 1 for tier 0, 2 for tier 1 ...; 0 is an empty slot). One `if` chain from the table, so
 * the shader and the CPU cannot drift apart.
 */
export function glslBoatShape(): string {
  const f = (n: number) => n.toFixed(4);
  const branch = (
    s: BoatTierSpec,
  ) => `s.hullLength = ${f(s.shadow.hull.length)};
    s.hullWidth = ${f(s.shadow.hull.width)};
    s.hullTop = ${f(s.shadow.hull.top)};
    s.houseShift = ${f(s.shadow.house.shift)};
    s.houseLength = ${f(s.shadow.house.length)};
    s.houseWidth = ${f(s.shadow.house.width)};
    s.houseFrom = ${f(s.shadow.house.from)};
    s.houseTo = ${f(s.shadow.house.to)};
    s.mastShift = ${f(s.shadow.mast.shift)};
    s.mastFrom = ${f(s.shadow.mast.from)};
    s.mastTo = ${f(s.shadow.mast.to)};
    s.lineLength = ${f(s.waterline.halfLength)};
    s.lineBeam = ${f(s.waterline.beam)};
    s.lineStern = ${f(s.waterline.stern)};
    s.lineTip = ${f(s.waterline.tip)};`;
  const top = BOAT_TIERS.length - 1;
  const chain = BOAT_TIERS.slice(1)
    .reverse()
    .map(
      (s) =>
        `if (code > ${(s.tier + 0.5).toFixed(1)}) {\n    ${branch(s)}\n  } else `,
    )
    .join("");
  return `struct BoatShape {
  float hullLength; float hullWidth; float hullTop;
  float houseShift; float houseLength; float houseWidth; float houseFrom; float houseTo;
  float mastShift; float mastFrom; float mastTo;
  float lineLength; float lineBeam; float lineStern; float lineTip;
};
// The shape of the boat in a slot of \`boats\`: its w is 1 + the tier (boat-tier.ts, ${top + 1} boats).
BoatShape boatShape(float code) {
  BoatShape s;
  ${chain}{
    ${branch(BOAT_TIERS[0]!)}
  }
  return s;
}`;
}
