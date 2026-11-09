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

/**
 * How far an island's shore is from its centre at `angle`, as a multiple of its radius:
 * a gentle, repeatable wobble (so the map shows bays and points rather than a circle).
 * Each island has its own wobble.
 */
export function coastFactor(index: number, angle: number): number {
  return (
    1 +
    0.1 * Math.sin(3 * angle + index * 1.7) +
    0.06 * Math.sin(5 * angle + index * 2.9) +
    0.03 * Math.sin(9 * angle + index)
  );
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
