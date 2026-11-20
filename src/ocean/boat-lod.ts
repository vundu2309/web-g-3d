import type { Part } from "./creature-geometry.ts";
import { simplifyPart } from "./simplify.ts";
import { boatTier } from "./boat-tier.ts";

/**
 * How much of a boat is drawn (pure maths and numbers, no Babylon: tests/boat-lod.test.mjs pins
 * it; boat-model.ts makes the copies and babylon-scene.ts picks the level). The boats of the
 * upgrade shop are up to 7,991 triangles (boat-tier.ts), and the other players' boats are
 * instances of them, so a boat that is far away is drawn as a coarser copy chosen by how big it
 * LOOKS (the pattern of `levelOf` in wildlife.ts): the whole model while it covers 24 pixels or
 * more, a copy of at most `BOAT_LOD_TRIANGLES[1]` triangles from 10 pixels, and a copy of at most
 * `BOAT_LOD_TRIANGLES[2]` below that, with no rod. The copies are made at load from the model's own
 * triangles (simplify.ts, vertex clustering); the model is never changed. The player's own boat is
 * always whole.
 */

/** A boat's hull covers this much of the view (radians; about 490 pixels to the radian on a phone held wide) or more: the whole model. */
export const BOAT_FULL_ANGLE = 0.05;
/** At least this much: the middle copy; less: the far copy. */
export const BOAT_MID_ANGLE = 0.02;
/** Most triangles of the whole model (no limit), the middle copy and the far copy. */
export const BOAT_LOD_TRIANGLES = [Infinity, 1500, 300] as const;
/** The lantern's far copy (the whole lantern is 144 triangles; it is the only light at night). */
export const LAMP_FAR_TRIANGLES = 24;
/** A boat keeps its level while it is within this share of a threshold, so one at the edge does not flicker between two. */
export const BOAT_LEVEL_BAND = 0.15;

export type BoatLevel = 0 | 1 | 2;

/**
 * The level of a boat of `tier` at `distance` m from the camera (the length of the hull over the
 * distance is how big it looks). Give the level it has now as `current` to keep it inside the
 * band round a threshold.
 */
export function boatLevelOf(
  tier: unknown,
  distance: number,
  current?: number,
): BoatLevel {
  const apparent = boatTier(tier).hullLength / Math.max(distance, 0.5);
  let level: BoatLevel =
    apparent >= BOAT_FULL_ANGLE ? 0 : apparent >= BOAT_MID_ANGLE ? 1 : 2;
  const up = 1 + BOAT_LEVEL_BAND;
  const down = 1 - BOAT_LEVEL_BAND;
  if (current === 0 && apparent >= BOAT_FULL_ANGLE * down) level = 0;
  else if (
    current === 1 &&
    apparent < BOAT_FULL_ANGLE * up &&
    apparent >= BOAT_MID_ANGLE * down
  )
    level = 1;
  else if (current === 2 && apparent < BOAT_MID_ANGLE * up) level = 2;
  return level;
}

/** The most triangles a boat of `tier` costs drawn at `level` (the model's own if it is already lighter). */
export const boatTrianglesAt = (tier: unknown, level: number) =>
  Math.min(boatTier(tier).triangles, BOAT_LOD_TRIANGLES[level] ?? 0);

/** The whole part, then its copies for the middle and the far level (the part itself is not changed). */
export const boatLevels = (part: Part): Part[] => [
  part,
  simplifyPart(part, BOAT_LOD_TRIANGLES[1]),
  simplifyPart(part, BOAT_LOD_TRIANGLES[2]),
];

/**
 * Draw calls of a boat: its hull and its lantern, each an instance of a mesh shared by every boat
 * of that tier, palette and level (Babylon draws the instances of one mesh in one call), and the
 * rod's two meshes (the blank and the reel) when it is drawn: the far level has none.
 */
export const BOAT_DRAWS = { hull: 1, lamp: 1, rod: 2 } as const;
export const boatDraws = (level: number) =>
  BOAT_DRAWS.hull + BOAT_DRAWS.lamp + (level < 2 ? BOAT_DRAWS.rod : 0);
