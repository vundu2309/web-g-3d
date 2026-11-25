import { HARBOR, SEA_BOUND, islands } from "./model.ts";
import { MARKETS } from "./market.ts";
import { SHIPYARDS } from "./shipyard.ts";
import { coastAt, shoreTable } from "./shore.ts";

/**
 * The minimap's geometry: the whole sea on a small square, north at the top (heading 0 is
 * -Z, which is up on the map and +X is to the right). Pure, so it is tested without a
 * canvas; app/minimap.ts draws it.
 */
/** Metres from the middle to the edge of the map: the sea wall and a margin. */
export const MAP_RANGE = SEA_BOUND + 12;

export interface MapPoint {
  x: number;
  y: number;
}

/** World (x, z) to a point on a square map `size` pixels across. */
export function toMap(x: number, z: number, size: number): MapPoint {
  return {
    x: ((x + MAP_RANGE) / (2 * MAP_RANGE)) * size,
    y: ((z + MAP_RANGE) / (2 * MAP_RANGE)) * size,
  };
}

/** Pixels per metre. */
export const mapScale = (size: number) => size / (2 * MAP_RANGE);

/**
 * A boat's marker: a triangle whose tip points the way the boat heads, `length` pixels
 * long from the centre of the boat to the tip.
 */
export function arrowPoints(
  center: MapPoint,
  heading: number,
  length: number,
): [MapPoint, MapPoint, MapPoint] {
  const dx = Math.sin(heading);
  const dy = -Math.cos(heading);
  const px = -dy;
  const py = dx;
  const back = length * 0.7;
  const half = length * 0.62;
  return [
    { x: center.x + dx * length, y: center.y + dy * length },
    {
      x: center.x - dx * back + px * half,
      y: center.y - dy * back + py * half,
    },
    {
      x: center.x - dx * back - px * half,
      y: center.y - dy * back - py * half,
    },
  ];
}

export type PlaceKind = "harbor" | "market" | "yard";

export interface Place {
  /** The number on the big map's badge and in its list: fixed (harbor, markets, yards), not by distance. */
  number: number;
  kind: PlaceKind;
  name: string;
  x: number;
  z: number;
}

/** The places the big map names: the harbor, the five markets and the three shipyards, numbered in that order. */
const NAMED: Omit<Place, "number">[] = [
  { kind: "harbor", name: "Bến cảng", x: HARBOR.x, z: HARBOR.z },
  ...MARKETS.map((m) => ({
    kind: "market" as const,
    name: m.name,
    x: m.x,
    z: m.z,
  })),
  ...SHIPYARDS.map((y) => ({
    kind: "yard" as const,
    name: y.name,
    x: y.x,
    z: y.z,
  })),
];
export const PLACES: readonly Place[] = NAMED.map((place, index) => ({
  ...place,
  number: index + 1,
}));

/** The places with their distance (whole metres) from a boat at `from`, nearest first; the numbers stay put. */
export function mapPlaces(from: { x: number; z: number }) {
  return PLACES.map((place) => ({
    ...place,
    meters: Math.round(Math.hypot(place.x - from.x, place.z - from.z)),
  })).sort((a, b) => a.meters - b.meters || a.number - b.number);
}

/** A distance for the list: "320 m" up to 999 m, then kilometres with a decimal comma ("1,2 km"). */
export function distanceText(meters: number): string {
  if (meters < 1000) return `${Math.max(0, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * The boats the map shows besides the player's own: other PLAYERS, online or parked where they were left.
 * The boats nobody owns (the patrol ships, `npc: true`) are not on the map, and neither are the rowing cats.
 */
export function playersOnMap<T extends { uid: string; npc?: boolean }>(
  boats: readonly T[],
  selfUid: string | undefined,
): T[] {
  return boats.filter((boat) => boat.uid !== selfUid && boat.npc !== true);
}

/** Each island on the map: its centre and radius in pixels. */
export function islandsOnMap(size: number) {
  const scale = mapScale(size);
  return islands.map((island) => ({
    ...toMap(island.x, island.z, size),
    radius: island.radius * scale,
  }));
}

/**
 * How far island `index`'s shore is from its centre at `angle`, as a multiple of its radius:
 * the real coast the 3D island is built on (shore.ts, from islandShape), so the map shows the
 * same bays and headlands as the sea.
 */
export function coastFactor(index: number, angle: number): number {
  return coastAt(shoreTable(index), angle).fraction;
}

/** The shore of an island as `count` points around it, scaled by `scale` (1 = the shore). */
export function coastPoints(
  center: MapPoint,
  radius: number,
  index: number,
  scale: number,
  count = 48,
): MapPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const r = radius * scale * coastFactor(index, angle);
    return {
      x: center.x + Math.cos(angle) * r,
      y: center.y + Math.sin(angle) * r,
    };
  });
}
