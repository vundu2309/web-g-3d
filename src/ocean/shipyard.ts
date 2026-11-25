import { HARBOR, SEA_BOUND, islands } from "./model.ts";
import { shoreShape } from "./shore.ts";

/**
 * The shipyards: three yards on the shores of three far-apart islands, where the player buys a
 * better boat (the boats of the upgrade shop, boat-tier.ts; rods and baits are bought at the
 * markets, market.ts). One shared model (public/models/shipyard.glb, tools/blender/upgrade_boats.py).
 * Pure data and maths (no rendering): the 3D yard is shipyard-visual.ts, the minimap icon
 * app/minimap.ts and the hub app/shipyard-ui.ts. A boat that comes within `SHIPYARD_RANGE` of a
 * yard can open it.
 *
 * The model's axes: the sea side is +Z, the land side -Z (the workshop and the hull on the stocks
 * are inland), 20 m wide (x) and 12.6 m deep (z, -6.4 to 6.2 m), its origin at the foot of the
 * slipway: the slipway enters the water about 1.5 m seaward of it. The yard stands on the shore
 * of its island with that origin 1.5 m inland of the coast, so the slipway's end is at the
 * waterline; boats cannot reach it (the island's collision ring is round the shore) but can come
 * as close as the ring allows, well inside the range.
 */
export interface Shipyard {
  id: string;
  name: string;
  /** Which island (an index of `islands`) the yard stands on. */
  island: number;
  /** The yard's origin on the shore. */
  x: number;
  z: number;
  /** Which way the sea side looks (radians, 0 is toward -Z like a boat heading): out to sea. */
  facing: number;
}

/** A boat this close to a yard (m, from its origin) can open it. */
export const SHIPYARD_RANGE = 24;
/** Where the slipway meets the sea, in the model's own z (m seaward of the origin). */
export const SLIPWAY_WATERLINE = 1.5;
/** Half the yard's width (m), for the minimap icon and the tests. */
export const SHIPYARD_HALF_WIDTH = 10;

/**
 * A yard on `index`'s shore, `turn` radians round the island from the direction of the harbor
 * (the markets are on the harbor side; the yards are turned away from them).
 */
const place = (
  index: number,
  turn: number,
  id: string,
  name: string,
): Shipyard => {
  const island = islands[index]!;
  const toward = Math.atan2(HARBOR.z - island.z, HARBOR.x - island.x) + turn;
  const coast = shoreShape(index).coast(toward);
  const reach = coast - SLIPWAY_WATERLINE;
  return {
    id,
    name,
    island: index,
    x: island.x + Math.cos(toward) * reach,
    z: island.z + Math.sin(toward) * reach,
    // The sea side looks away from the island: the heading whose forward is (cos toward, sin toward).
    facing: Math.atan2(Math.cos(toward), -Math.sin(toward)),
  };
};

/**
 * Three yards on islands 0, 4 and 7: far apart, so that wherever the player sails a yard is
 * a real trip (the first is near the harbor, the others out in the sea).
 */
export const SHIPYARDS: readonly Shipyard[] = [
  place(0, 1.6, "xuong-hai-dang", "Xưởng tàu Hải Đăng"),
  place(4, 1.6, "xuong-giua-khoi", "Xưởng tàu Giữa Khơi"),
  place(7, 1.6, "xuong-cuoi-bien", "Xưởng tàu Cuối Biển"),
];

/** The yard a boat at (x, z) can open, if any (the nearest one in range). */
export function shipyardAt(x: number, z: number): Shipyard | undefined {
  let best: Shipyard | undefined;
  let bestDistance = SHIPYARD_RANGE;
  for (const yard of SHIPYARDS) {
    const distance = Math.hypot(x - yard.x, z - yard.z);
    if (distance <= bestDistance) {
      best = yard;
      bestDistance = distance;
    }
  }
  return best;
}

export const inSea = (yard: Shipyard) =>
  Math.abs(yard.x) < SEA_BOUND && Math.abs(yard.z) < SEA_BOUND;

/**
 * How much of a yard is drawn, by how big it looks (the pattern of boat-lod.ts): the whole model
 * (7,537 triangles) while its width covers about 0.04 rad or more of the view (to about 500 m), a copy of
 * at most `YARD_LOD_TRIANGLES` triangles from 0.012 rad (to about 1,700 m), nothing beyond (a
 * speck on the horizon). The yards are 723 m or more apart, so at most one or two are ever in view.
 */
export const YARD_FULL_ANGLE = 0.04;
export const YARD_MID_ANGLE = 0.012;
export const YARD_LOD_TRIANGLES = [Infinity, 1500] as const;
/** A yard keeps its level while it is within this share of a threshold, so one at the edge does not flicker. */
export const YARD_LEVEL_BAND = 0.15;

/** 0 whole, 1 middle copy, 2 not drawn; give the level it has as `current` to keep it inside the band. */
export function yardLevelOf(distance: number, current?: number): 0 | 1 | 2 {
  const apparent = (2 * SHIPYARD_HALF_WIDTH) / Math.max(distance, 0.5);
  let level: 0 | 1 | 2 =
    apparent >= YARD_FULL_ANGLE ? 0 : apparent >= YARD_MID_ANGLE ? 1 : 2;
  const up = 1 + YARD_LEVEL_BAND;
  const down = 1 - YARD_LEVEL_BAND;
  if (current === 0 && apparent >= YARD_FULL_ANGLE * down) level = 0;
  else if (
    current === 1 &&
    apparent < YARD_FULL_ANGLE * up &&
    apparent >= YARD_MID_ANGLE * down
  )
    level = 1;
  else if (current === 2 && apparent < YARD_MID_ANGLE * up) level = 2;
  return level;
}
