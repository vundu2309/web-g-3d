import { HARBOR, SEA_BOUND, islandCollisionRadius, islands } from "./model.ts";
import type { NpcLookId } from "./npc-look.ts";
import { shoreShape } from "./shore.ts";

/**
 * The fish markets: a floating wooden pier with a stall on the side of each island that faces
 * the harbor, where the player sells fish. Pure data and maths (no rendering): the 3D pier is
 * in market-visual.ts, the minimap icon in app/minimap.ts and the sell button and hub in
 * app/market-ui.ts. A boat that comes within `MARKET_RANGE` of a pier can open its market.
 */
export interface Market {
  id: string;
  name: string;
  /** Who runs the stall: a person to greet the player (no gameplay effect). */
  vendor: Vendor;
  /** Centre of the pier on the water. */
  x: number;
  z: number;
  /** Which way the pier faces (radians, 0 is toward -Z like a boat heading): toward the harbor. */
  facing: number;
}

/** The person behind a stall: a name, how they look and a line they say when the market opens. */
export interface Vendor {
  name: string;
  /** How the person looks: a figure of the sea's people (npc-look.ts, built in npc-visual.ts). */
  look: NpcLookId;
  /** Said when the market opens. */
  greeting: string;
}

/** A boat this close to a pier (m, from its centre) can open the market. */
export const MARKET_RANGE = 17;
/** The solid part of a pier (m): boats bump into it like into an island. */
export const MARKET_BODY_RADIUS = 3.4;
/**
 * How far the gangway reaches from the pier's centre toward the island (m; market-visual.ts):
 * from the pier in the shallows over the surf and up the gentle beach to the sand.
 */
export const GANGWAY_REACH = 18.8;
/**
 * The gangway's end rests this far up the beach (m inland of the real coast): where the sand
 * has risen to the planks (the walkway is 0.8 m above the sea, the beach reaches 0.7 m about
 * 8.5 m inland, see island-shape.ts), so it lands on the sand and does not hang above it.
 */
export const GANGWAY_LANDING = 8.5;
/** The pier's solid circle stays at least this far outside the island's collision ring (m). */
const RING_GAP = 0.5;
/**
 * Pier centre from the island centre: the pier stands in the shallows with its gangway landing
 * on the sand of the real coast (shore.ts) in that direction, but never so close that its solid
 * circle reaches into the ring boats collide with round the island.
 */
const place = (
  index: number,
  turn: number,
  id: string,
  name: string,
  vendor: Vendor,
): Market => {
  const island = islands[index]!;
  const toHarbor = Math.atan2(HARBOR.z - island.z, HARBOR.x - island.x) + turn;
  const coast = shoreShape(index).coast(toHarbor);
  const reach = Math.max(
    coast + GANGWAY_REACH - GANGWAY_LANDING,
    islandCollisionRadius(island) + MARKET_BODY_RADIUS + RING_GAP,
  );
  const x = island.x + Math.cos(toHarbor) * reach;
  const z = island.z + Math.sin(toHarbor) * reach;
  // Faces away from the island, out to sea.
  const outward = toHarbor;
  return {
    id,
    name,
    vendor,
    x,
    z,
    facing: Math.atan2(Math.cos(outward), -Math.sin(outward)),
  };
};

export const MARKETS: readonly Market[] = [
  place(0, 0.25, "hai-dang", "Chợ Hải Đăng", {
    name: "Cô Lan",
    look: "lan",
    greeting: "Chào em! Cá hôm nay tươi lắm, để cô xem em câu được gì nào.",
  }),
  place(1, 0, "doi-xanh", "Chợ Đồi Xanh", {
    name: "Chú Tư",
    look: "tu",
    greeting: "Ê, về rồi đó hả? Đưa cá đây, chú trả giá tốt cho.",
  }),
  place(2, 0, "bai-co", "Chợ Bãi Cọ", {
    name: "Bà Sáu",
    look: "sau",
    greeting: "Trời ơi, con cá to quá! Lại đây bà cân cho.",
  }),
];

/** The market a boat at (x, z) can open, if any (the nearest one in range). */
export function marketAt(x: number, z: number): Market | undefined {
  let best: Market | undefined;
  let bestDistance = MARKET_RANGE;
  for (const market of MARKETS) {
    const distance = Math.hypot(x - market.x, z - market.z);
    if (distance <= bestDistance) {
      best = market;
      bestDistance = distance;
    }
  }
  return best;
}

/** Everything solid in the sea besides the boats: the islands' shores and the piers. */
export function seaObstacles() {
  return [
    ...islands.map((island) => ({
      x: island.x,
      z: island.z,
      radius: islandCollisionRadius(island),
    })),
    ...MARKETS.map((market) => ({
      x: market.x,
      z: market.z,
      radius: MARKET_BODY_RADIUS,
    })),
  ];
}

export const inSea = (market: Market) =>
  Math.abs(market.x) < SEA_BOUND && Math.abs(market.z) < SEA_BOUND;
