/**
 * Which bait hangs on the line (pure numbers and names, no Babylon, so a test reads them): the
 * four baits of the upgrade shop (upgrades.ts: giun, tom, ca con, muc) as the models of
 * public/models (tools/blender/baits.py, the layout of the fish files: a `body` mesh nose to +X
 * and a `hook` node at the nose).
 *
 * The user's choice, 2026-11-20: the orange fish lure the game has always drawn at the end of the
 * line IS the default bait (tier 0), kept as it is, half a metre long; each bait bought and chosen
 * from the market (tiers 1 to 3) replaces it with its own model, the same half metre. The worm's
 * model (bait-giun.glb) is therefore not drawn on the line; it stays the picture of bait 0 where
 * the market shows one (the picture itself is step 3b).
 */

/** The GLB of each bait tier, under public/models. */
export const BAIT_FILES = [
  "bait-giun.glb",
  "bait-tom.glb",
  "bait-ca-con.glb",
  "bait-muc.glb",
] as const;

/** How long a bait is on the line (m): the length of the orange lure, so a bait is as easy to find on the water. */
export const BAIT_LENGTH = 0.5;

/** `tier` if it is a whole number from 0 to the last bait, else 0 (the default bait). */
export function baitTierIndex(tier: unknown): number {
  return typeof tier === "number" &&
    Number.isInteger(tier) &&
    tier >= 0 &&
    tier < BAIT_FILES.length
    ? tier
    : 0;
}

/** The model file of a bait tier. */
export const baitFile = (tier: unknown): string =>
  BAIT_FILES[baitTierIndex(tier)]!;

/**
 * Whether the line draws the bait's own model: every bait but the default one, which is the orange
 * lure. Until its model has loaded the lure stands in, so the line never has nothing on its end.
 */
export const drawsModel = (tier: unknown): boolean => baitTierIndex(tier) > 0;

/**
 * What the end of the line shows: the orange lure and/or one bait model, from the chosen tier, which
 * models have loaded (`loaded[tier]`) and whether the end is drawn at all. The lure stands in for a
 * model that is not loaded yet; nothing is drawn when the end of the line is not shown.
 */
export function endLook(
  tier: unknown,
  loaded: readonly boolean[],
  shown: boolean,
): { lure: boolean; model: number | undefined } {
  const wanted = baitTierIndex(tier);
  const model = drawsModel(wanted) && loaded[wanted] ? wanted : undefined;
  return {
    lure: shown && model === undefined,
    model: shown ? model : undefined,
  };
}
