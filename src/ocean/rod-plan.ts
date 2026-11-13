/**
 * The shape of the rod, as plain numbers (no Babylon, so a test reads it): the rings the blank is
 * lofted through, where its colour changes, and the line guides. `rod-visual.ts` follows it every
 * frame along the bent rod (rod.ts), so the blank bends and the colours stay where they are.
 *
 * Chunky and cute on purpose: seen from the chase camera (17.5 m away) the rod is a few pixels
 * wide, so it is thick for its length, tapers, has hard colour bands, a fat cork handle, a ferrule,
 * line guides and a round bright tip. `s` runs along the rod, 0 at the butt and 1 where the line
 * starts (the tip RodSim reports); the ball of the tip reaches a little past 1.
 */
export type RodColour =
  | "cap"
  | "cork"
  | "ferrule"
  | "bandA"
  | "bandB"
  | "tip"
  | "guide";

export interface RodRing {
  s: number;
  radius: number;
  colour: RodColour;
}

/** Sides of the blank (a round rod at a phone's size; the shared SIDES.small tier). */
export const ROD_SIDES = 8;

/**
 * The rings, butt to tip. Two rings at the same `s` are a hard edge (a colour change or a step in
 * thickness): equal radii mean no surface between them, only the change of colour.
 */
export const ROD_RINGS: readonly RodRing[] = [
  // Butt cap, then the cork handle, fattest in the hand.
  { s: 0, radius: 0, colour: "cap" },
  { s: 0, radius: 0.085, colour: "cap" },
  { s: 0, radius: 0.125, colour: "cork" },
  { s: 0.045, radius: 0.145, colour: "cork" },
  { s: 0.17, radius: 0.135, colour: "cork" },
  { s: 0.195, radius: 0.118, colour: "cork" },
  // A metal ferrule where the blank starts.
  { s: 0.195, radius: 0.118, colour: "ferrule" },
  { s: 0.225, radius: 0.108, colour: "ferrule" },
  // The blank: four bands of two colours, tapering.
  { s: 0.225, radius: 0.108, colour: "bandA" },
  { s: 0.4, radius: 0.088, colour: "bandA" },
  { s: 0.4, radius: 0.088, colour: "bandB" },
  { s: 0.57, radius: 0.072, colour: "bandB" },
  { s: 0.57, radius: 0.072, colour: "bandA" },
  { s: 0.74, radius: 0.056, colour: "bandA" },
  { s: 0.74, radius: 0.056, colour: "bandB" },
  { s: 0.93, radius: 0.042, colour: "bandB" },
  // The bright round tip.
  { s: 0.93, radius: 0.042, colour: "tip" },
  { s: 0.965, radius: 0.07, colour: "tip" },
  { s: 0.995, radius: 0.105, colour: "tip" },
  { s: 1.03, radius: 0.095, colour: "tip" },
  { s: 1.058, radius: 0.06, colour: "tip" },
  { s: 1.068, radius: 0, colour: "tip" },
];

/** Whether the surface between ring i and ring i + 1 is drawn (not for a pure change of colour). */
export const joined = (i: number) => {
  const a = ROD_RINGS[i]!;
  const b = ROD_RINGS[i + 1]!;
  return !(a.s === b.s && a.radius === b.radius);
};

/** Line guides: where along the rod, and the size of the eyelet (a flat ring facing the stern). */
export const GUIDES = [0.34, 0.53, 0.72, 0.89] as const;
export const GUIDE_OUTER = 0.12;
export const GUIDE_INNER = 0.068;
export const GUIDE_SIDES = 8;

/** The blank's radius at s (linear between rings; the first ring of a pair at the same s). */
export function radiusAt(s: number): number {
  for (let i = 0; i + 1 < ROD_RINGS.length; i++) {
    const a = ROD_RINGS[i]!;
    const b = ROD_RINGS[i + 1]!;
    if (s >= a.s && s <= b.s && b.s > a.s)
      return a.radius + ((b.radius - a.radius) * (s - a.s)) / (b.s - a.s);
  }
  return 0;
}

/** Triangles of the blank plus its guides (what is drawn, one mesh per rod). */
export function rodTriangles(): number {
  let strips = 0;
  for (let i = 0; i + 1 < ROD_RINGS.length; i++) if (joined(i)) strips++;
  return strips * ROD_SIDES * 2 + GUIDES.length * GUIDE_SIDES * 2;
}
