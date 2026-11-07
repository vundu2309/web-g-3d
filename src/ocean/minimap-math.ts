import { SEA_BOUND, islands } from "./model.ts";

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

/** Each island on the map: its centre and radius in pixels. */
export function islandsOnMap(size: number) {
  const scale = mapScale(size);
  return islands.map((island) => ({
    ...toMap(island.x, island.z, size),
    radius: island.radius * scale,
  }));
}
