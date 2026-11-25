/**
 * The four rods of the upgrade shop as plain numbers (no Babylon, so a test reads them): the rings
 * the blank is lofted through and where its colour changes, the line guides, the little ornaments
 * of the rarer rods and the reel under the handle. `rod-visual.ts` follows a plan every frame along
 * the bent rod (rod.ts), so the blank bends and the colours stay where they are.
 *
 * Tier 0 BAMBOO (free), 1 FIBREGLASS, 2 CARBON FIBRE, 3 GOLD: the user's choice, 2026-11-20, drawn
 * as concept images (tools/blender/rods.py) and approved before this code. A better rod is
 * prettier, not longer (every rod is the same 4 m, rod.ts) and not thicker: slim blanks that bend a
 * little at rest, the rarer the finer the reel and the ornaments. What a tier does to the fight
 * (the line's strength) is in upgrades.ts, not here.
 *
 * `s` runs along the rod, 0 at the butt and 1 where the line starts (the tip RodSim reports); the
 * ball of the tip reaches a little past 1. Every colour is a role of the shared palette
 * (rod-visual.ts maps the names), never a hex of its own.
 */
export type RodColour =
  // shared by every rod
  | "cap"
  | "cork"
  | "steel"
  | "dark"
  | "tip"
  // bamboo: the nodes and the thread wrap (the wrap takes the boat's trim colour)
  | "culm"
  | "node"
  | "wrap"
  // fibreglass
  | "glass"
  | "glassBand"
  | "foam"
  // carbon fibre
  | "carbonA"
  | "carbonB"
  | "carbonWrap"
  | "grip"
  // gold
  | "gold"
  | "goldPale"
  | "gem"
  | "rosewood"
  | "pearl"
  // reels
  | "reel"
  | "accent";

/** Every colour name, for the tables that map a name to a palette colour (rod-colours.ts). */
export const ROD_COLOUR_NAMES: readonly RodColour[] = [
  "cap",
  "cork",
  "steel",
  "dark",
  "tip",
  "culm",
  "node",
  "wrap",
  "glass",
  "glassBand",
  "foam",
  "carbonA",
  "carbonB",
  "carbonWrap",
  "grip",
  "gold",
  "goldPale",
  "gem",
  "rosewood",
  "pearl",
  "reel",
  "accent",
];

export interface RodRing {
  s: number;
  radius: number;
  colour: RodColour;
}

/** How many rods there are. */
export const ROD_TIER_COUNT = 4;

/** Sides of the blank (a round rod at a phone's size; the shared SIDES.small tier). */
export const ROD_SIDES = 8;

/** Line guides: the size of the eyelet (a flat ring facing the stern), the same on every rod. */
export const GUIDE_OUTER = 0.09;
export const GUIDE_INNER = 0.05;
export const GUIDE_SIDES = 8;
/** A stud on a guide (the gold rod's gems, the carbon rod's red beads): a small flat fan. */
export const STUD_SIDES = 6;

/**
 * One part of a reel, in the reel's own frame: `at` is [down, back, along], metres. `down` is the
 * side the rod leans away from, `back` toward the stern (where the chase camera looks at the reel's
 * face) and `along` the distance from the butt up the rod. rod-visual.ts turns that into boat axes.
 */
export type ReelPart =
  /** A round plate whose face looks to the stern. */
  | {
      kind: "disc";
      radius: number;
      depth: number;
      at: [number, number, number];
      colour: RodColour;
      sides: number;
    }
  /** A ball (a knob, a pearl, a gem); `flat` squashes it along `back` (1 is round). */
  | {
      kind: "ball";
      diameter: number;
      at: [number, number, number];
      colour: RodColour;
      sides: number;
      flat?: number;
    }
  /** The crank arm: `length` runs along `down`, `turn` swings it about the reel's face. */
  | {
      kind: "arm";
      size: [number, number, number];
      at: [number, number, number];
      turn: number;
      colour: RodColour;
    }
  /** A rod that runs along `down` (the stem to the handle). */
  | {
      kind: "stem";
      radius: number;
      length: number;
      at: [number, number, number];
      colour: RodColour;
      sides: number;
    }
  /** A short post along the rod (the carbon reel's drag knob). */
  | {
      kind: "post";
      radius: number;
      length: number;
      at: [number, number, number];
      colour: RodColour;
      sides: number;
    };

export interface RodPlan {
  tier: number;
  /** Bamboo, fibreglass, carbon fibre, gold: for the shop's cards and the tests' messages. */
  id: "bamboo" | "fibreglass" | "carbon" | "gold";
  /** The rings, butt to tip. Two rings at the same `s` are a hard edge (a colour change or a step in thickness): equal radii mean no surface between them, only the change of colour. */
  rings: readonly RodRing[];
  /** Where along the rod the guides are, and their colour. */
  guides: readonly number[];
  guideColour: RodColour;
  /** A stud on every guide (the carbon rod's red beads, the gold rod's gems). */
  stud?: { colour: RodColour; radius: number };
  /** How far the blank rests bent toward the reel's side, as RodSim's `offset` (m): the tip sits about 0.78 of it away from a straight rod. */
  restBend: number;
  reel: readonly ReelPart[];
}

const R = (s: number, radius: number, colour: RodColour): RodRing => ({
  s,
  radius,
  colour,
});

/** The round tip every rod shares (the bite cue stays orange); it grows from where the blank ends. */
const tipFrom = (end: number): RodRing[] => [
  R(0.93, end, "tip"),
  R(0.965, 0.057, "tip"),
  R(0.995, 0.086, "tip"),
  R(1.03, 0.078, "tip"),
  R(1.058, 0.049, "tip"),
  R(1.068, 0, "tip"),
];

const GUIDES = [0.34, 0.53, 0.72, 0.89] as const;
/** About 0.3 m of tip lean (the tip sits 0.78 of this away from straight). */
const REST_BEND = 0.38;
/** Where along the rod the reel's stem leaves the handle (m from the butt). */
const REEL_AT = 0.5;

/** The reel's parts, with the sizes that change with the tier. */
function reelOf(
  id: RodPlan["id"],
  radius: number,
  handle: number,
  depth: number,
): ReelPart[] {
  const cx = handle + 0.1 + radius; // the reel's centre, under the handle
  const z = REEL_AT;
  const back = depth / 2;
  const parts: ReelPart[] = [];
  const stem = (colour: RodColour, thick: number): ReelPart => ({
    kind: "stem",
    radius: thick,
    length: radius + 0.14,
    at: [handle + 0.05 + radius / 2 + 0.02, 0, z],
    colour,
    sides: 6,
  });
  if (id === "bamboo") {
    // plain: a red body, a light plate, a crank with a yellow knob
    parts.push(
      stem("dark", 0.05),
      {
        kind: "disc",
        radius,
        depth,
        at: [cx, 0, z],
        colour: "reel",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.58,
        depth: 0.03,
        at: [cx, back + 0.01, z],
        colour: "steel",
        sides: 12,
      },
      {
        kind: "arm",
        size: [0.26, 0.04, 0.05],
        at: [cx + 0.13, back + 0.05, z - 0.03],
        turn: 0.3,
        colour: "dark",
      },
      {
        kind: "ball",
        diameter: 0.16,
        at: [cx + 0.26, back + 0.07, z - 0.08],
        colour: "accent",
        sides: 4,
      },
    );
  } else if (id === "fibreglass") {
    // a blue body with a steel rim front and back, a white plate, a steel hub
    parts.push(
      stem("steel", 0.05),
      {
        kind: "disc",
        radius,
        depth,
        at: [cx, 0, z],
        colour: "glassBand",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius + 0.015,
        depth: 0.03,
        at: [cx, back - 0.01, z],
        colour: "steel",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius + 0.015,
        depth: 0.03,
        at: [cx, -back + 0.01, z],
        colour: "steel",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.9,
        depth: 0.025,
        at: [cx, back + 0.012, z],
        colour: "glassBand",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.66,
        depth: 0.03,
        at: [cx, back + 0.03, z],
        colour: "glass",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.3,
        depth: 0.03,
        at: [cx, back + 0.05, z],
        colour: "steel",
        sides: 4,
      },
      {
        kind: "arm",
        size: [0.28, 0.04, 0.055],
        at: [cx + 0.14, back + 0.06, z - 0.03],
        turn: 0.3,
        colour: "steel",
      },
      {
        kind: "ball",
        diameter: 0.19,
        at: [cx + 0.28, back + 0.085, z - 0.09],
        colour: "accent",
        sides: 4,
      },
    );
  } else if (id === "carbon") {
    // machined: a steel-grey body, dark rims, a red anodised ring, a drag knob on top, a long
    // slim crank with a red knob
    parts.push(
      stem("dark", 0.05),
      {
        kind: "disc",
        radius,
        depth,
        at: [cx, 0, z],
        colour: "carbonB",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius + 0.012,
        depth: 0.035,
        at: [cx, back - 0.005, z],
        colour: "dark",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius + 0.012,
        depth: 0.035,
        at: [cx, -back + 0.005, z],
        colour: "dark",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.8,
        depth: 0.03,
        at: [cx, back + 0.02, z],
        colour: "carbonWrap",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.58,
        depth: 0.03,
        at: [cx, back + 0.04, z],
        colour: "carbonA",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.18,
        depth: 0.04,
        at: [cx, back + 0.06, z],
        colour: "steel",
        sides: 8,
      },
      {
        kind: "post",
        radius: 0.07,
        length: 0.1,
        at: [cx, 0, z + radius + 0.06],
        colour: "steel",
        sides: 6,
      },
      {
        kind: "arm",
        size: [0.36, 0.035, 0.045],
        at: [cx + 0.17, back + 0.07, z - 0.04],
        turn: 0.3,
        colour: "dark",
      },
      {
        kind: "ball",
        diameter: 0.15,
        at: [cx + 0.35, back + 0.1, z - 0.11],
        colour: "carbonWrap",
        sides: 4,
      },
    );
  } else {
    // gold: a golden body, a pale rim, a ring of fourteen pearls, a red gem in the middle, a gem
    // on the crank and a collar on the stem
    parts.push(
      stem("gold", 0.058),
      {
        kind: "disc",
        radius,
        depth,
        at: [cx, 0, z],
        colour: "gold",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius + 0.018,
        depth: 0.03,
        at: [cx, back - 0.01, z],
        colour: "goldPale",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.92,
        depth: 0.025,
        at: [cx, back + 0.012, z],
        colour: "gold",
        sides: 12,
      },
    );
    for (let i = 0; i < 14; i++) {
      const a = (2 * Math.PI * i) / 14;
      parts.push({
        kind: "disc",
        radius: 0.034,
        depth: 0.04,
        at: [
          cx + (radius + 0.005) * Math.cos(a),
          back + 0.03,
          z + (radius + 0.005) * Math.sin(a),
        ],
        colour: "pearl",
        sides: 4,
      });
    }
    parts.push(
      {
        kind: "disc",
        radius: radius * 0.74,
        depth: 0.03,
        at: [cx, back + 0.03, z],
        colour: "goldPale",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.6,
        depth: 0.03,
        at: [cx, back + 0.05, z],
        colour: "gold",
        sides: 12,
      },
      {
        kind: "disc",
        radius: radius * 0.38,
        depth: 0.025,
        at: [cx, back + 0.065, z],
        colour: "goldPale",
        sides: 12,
      },
      {
        kind: "ball",
        diameter: 0.17,
        at: [cx, back + 0.085, z],
        colour: "gem",
        sides: 4,
        flat: 0.6,
      },
      {
        kind: "arm",
        size: [0.34, 0.04, 0.055],
        at: [cx + 0.17, back + 0.07, z - 0.04],
        turn: 0.3,
        colour: "gold",
      },
      {
        kind: "ball",
        diameter: 0.19,
        at: [cx + 0.34, back + 0.1, z - 0.11],
        colour: "gem",
        sides: 4,
        flat: 0.7,
      },
      {
        kind: "stem",
        radius: 0.075,
        length: 0.05,
        at: [handle + 0.1, 0, z],
        colour: "goldPale",
        sides: 6,
      },
    );
  }
  return parts;
}

/**
 * The four rods, tier 0 first. Radii are metres at the rod's own scale: the blank 0.62 of the first
 * concept's thickness (the user asked for a slimmer rod), the tip ball 0.82 of it, since the round
 * orange tip is what the player watches for a bite.
 */
export const ROD_PLANS: readonly RodPlan[] = [
  {
    // BAMBOO: the cork handle, a tan culm with dark nodes that swell a little, a thread wrap in the
    // boat's trim colour at the ferrule.
    tier: 0,
    id: "bamboo",
    rings: [
      R(0, 0, "cap"),
      R(0, 0.053, "cap"),
      R(0, 0.078, "cork"),
      R(0.045, 0.09, "cork"),
      R(0.17, 0.084, "cork"),
      R(0.195, 0.073, "cork"),
      R(0.195, 0.073, "wrap"),
      R(0.225, 0.069, "wrap"),
      R(0.225, 0.069, "culm"),
      R(0.395, 0.056, "culm"),
      R(0.395, 0.061, "node"),
      R(0.415, 0.061, "node"),
      R(0.415, 0.055, "culm"),
      R(0.565, 0.046, "culm"),
      R(0.565, 0.051, "node"),
      R(0.585, 0.051, "node"),
      R(0.585, 0.045, "culm"),
      R(0.735, 0.036, "culm"),
      R(0.735, 0.041, "node"),
      R(0.755, 0.041, "node"),
      R(0.755, 0.035, "culm"),
      R(0.93, 0.026, "culm"),
      ...tipFrom(0.026),
    ],
    guides: GUIDES,
    guideColour: "steel",
    restBend: REST_BEND,
    reel: reelOf("bamboo", 0.28, 0.09, 0.15),
  },
  {
    // FIBREGLASS: a smooth white blank with two blue bands, a long steel ferrule and a green foam
    // handle.
    tier: 1,
    id: "fibreglass",
    rings: [
      R(0, 0, "cap"),
      R(0, 0.056, "cap"),
      R(0, 0.081, "foam"),
      R(0.05, 0.093, "foam"),
      R(0.2, 0.087, "foam"),
      R(0.235, 0.076, "foam"),
      R(0.235, 0.076, "steel"),
      R(0.285, 0.067, "steel"),
      R(0.285, 0.064, "glass"),
      R(0.42, 0.055, "glass"),
      R(0.42, 0.055, "glassBand"),
      R(0.455, 0.052, "glassBand"),
      R(0.455, 0.052, "glass"),
      R(0.62, 0.041, "glass"),
      R(0.62, 0.041, "glassBand"),
      R(0.655, 0.038, "glassBand"),
      R(0.655, 0.038, "glass"),
      R(0.93, 0.025, "glass"),
      ...tipFrom(0.025),
    ],
    guides: GUIDES,
    guideColour: "steel",
    restBend: REST_BEND,
    reel: reelOf("fibreglass", 0.3, 0.095, 0.17),
  },
  {
    // CARBON FIBRE: the slimmest blank and the longest handle, a woven look made of short dark and
    // steel-grey bands, red thread wraps and red beads on the guides.
    tier: 2,
    id: "carbon",
    rings: [
      R(0, 0, "cap"),
      R(0, 0.053, "cap"),
      R(0, 0.074, "grip"),
      R(0.04, 0.086, "grip"),
      R(0.1, 0.082, "grip"),
      R(0.1, 0.082, "cork"),
      R(0.14, 0.081, "cork"),
      R(0.14, 0.081, "grip"),
      R(0.255, 0.071, "grip"),
      R(0.255, 0.071, "carbonWrap"),
      R(0.28, 0.064, "carbonWrap"),
      R(0.28, 0.062, "carbonA"),
      R(0.345, 0.055, "carbonA"),
      R(0.345, 0.055, "carbonB"),
      R(0.41, 0.05, "carbonB"),
      R(0.41, 0.05, "carbonA"),
      R(0.475, 0.046, "carbonA"),
      R(0.475, 0.046, "carbonB"),
      R(0.54, 0.042, "carbonB"),
      R(0.54, 0.042, "carbonA"),
      R(0.605, 0.038, "carbonA"),
      R(0.605, 0.038, "carbonB"),
      R(0.67, 0.035, "carbonB"),
      R(0.67, 0.035, "carbonA"),
      R(0.735, 0.031, "carbonA"),
      R(0.735, 0.031, "carbonB"),
      R(0.8, 0.028, "carbonB"),
      R(0.8, 0.028, "carbonA"),
      R(0.93, 0.022, "carbonA"),
      ...tipFrom(0.022),
    ],
    guides: GUIDES,
    guideColour: "dark",
    stud: { colour: "carbonWrap", radius: 0.028 },
    restBend: REST_BEND,
    reel: reelOf("carbon", 0.32, 0.085, 0.19),
  },
  {
    // GOLD: a rosewood handle ringed in gold with a red gem band, a wide gold collar, a gold blank
    // with pale-gold bands, a pearl under the tip and a gem on every guide.
    tier: 3,
    id: "gold",
    rings: [
      R(0, 0, "gold"),
      R(0, 0.062, "gold"),
      R(0.015, 0.09, "gold"),
      R(0.045, 0.093, "rosewood"),
      R(0.07, 0.094, "rosewood"),
      R(0.07, 0.094, "gold"),
      R(0.09, 0.094, "gold"),
      R(0.09, 0.093, "rosewood"),
      R(0.13, 0.092, "rosewood"),
      R(0.13, 0.092, "gem"),
      R(0.15, 0.092, "gem"),
      R(0.15, 0.091, "rosewood"),
      R(0.19, 0.084, "rosewood"),
      R(0.19, 0.084, "gold"),
      R(0.215, 0.088, "gold"),
      R(0.25, 0.088, "gold"),
      R(0.275, 0.069, "gold"),
      R(0.275, 0.067, "gold"),
      R(0.4, 0.056, "gold"),
      R(0.4, 0.056, "goldPale"),
      R(0.43, 0.054, "goldPale"),
      R(0.43, 0.054, "gold"),
      R(0.58, 0.043, "gold"),
      R(0.58, 0.043, "goldPale"),
      R(0.61, 0.042, "goldPale"),
      R(0.61, 0.042, "gold"),
      R(0.75, 0.033, "gold"),
      R(0.75, 0.033, "goldPale"),
      R(0.78, 0.032, "goldPale"),
      R(0.78, 0.032, "gold"),
      R(0.905, 0.027, "gold"),
      R(0.905, 0.027, "pearl"),
      R(0.917, 0.04, "pearl"),
      R(0.93, 0.026, "pearl"),
      ...tipFrom(0.026),
    ],
    guides: GUIDES,
    guideColour: "gold",
    stud: { colour: "gem", radius: 0.034 },
    restBend: REST_BEND,
    reel: reelOf("gold", 0.35, 0.095, 0.21),
  },
];

/** `tier` if it is a whole number from 0 to the top rod, else 0 (the free first rod). */
export function rodTierIndex(tier: unknown): number {
  return typeof tier === "number" &&
    Number.isInteger(tier) &&
    tier >= 0 &&
    tier < ROD_TIER_COUNT
    ? tier
    : 0;
}

/** The plan of a tier; an invalid tier gives tier 0. */
export function rodPlan(tier: unknown): RodPlan {
  return ROD_PLANS[rodTierIndex(tier)]!;
}

/** Whether the surface between ring i and ring i + 1 of a plan is drawn (not for a pure change of colour). */
export const joined = (plan: RodPlan, i: number) => {
  const a = plan.rings[i]!;
  const b = plan.rings[i + 1]!;
  return !(a.s === b.s && a.radius === b.radius);
};

/** The blank's radius of a plan at s (linear between rings; the first ring of a pair at the same s). */
export function radiusAt(plan: RodPlan, s: number): number {
  const { rings } = plan;
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    if (s >= a.s && s <= b.s && b.s > a.s)
      return a.radius + ((b.radius - a.radius) * (s - a.s)) / (b.s - a.s);
  }
  return 0;
}

/** Triangles of the blank, its guides and their studs (what bends, one mesh per rod); the reel is counted separately. */
export function rodTriangles(tier: unknown = 0): number {
  const plan = rodPlan(tier);
  let strips = 0;
  for (let i = 0; i + 1 < plan.rings.length; i++) if (joined(plan, i)) strips++;
  const studs = plan.stud ? plan.guides.length * STUD_SIDES * 2 : 0;
  return strips * ROD_SIDES * 2 + plan.guides.length * GUIDE_SIDES * 2 + studs;
}
