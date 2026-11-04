/**
 * Pure geometry for the 3D board. Every seam and space edge is taken from one
 * coordinate array (GRID), so adjacent spaces and the four corners meet exactly.
 * World units: the board is centred on the origin in the XZ plane, +Y is up.
 * The bottom row (large z) holds GO at the right (+x) and moves left.
 * No three.js import here; the renderer converts these numbers to meshes.
 */
import { SPACE_COUNT } from "./spaces.ts";

/** Length of an edge space along its side. */
export const SPACE_LENGTH = 1;
/** Depth of an edge space, which is also the side of each square corner. Deep tiles per approved design. */
export const RING_DEPTH = 2.2;
export const SPACES_PER_SIDE = 9;
/** Playing surface outline, measured from the outer edge of the ring. */
export const BOARD_SIZE = 2 * RING_DEPTH + SPACES_PER_SIDE * SPACE_LENGTH;
/** Thin cobalt rim outside the ring, drawn on the same plate. */
export const RIM_WIDTH = 0.12;
export const PLATE_SIZE = BOARD_SIZE + 2 * RIM_WIDTH;
/** Depth of the coloured stripe on the inner side of each colour-group space. */
export const STRIPE_DEPTH = 0.4;
/** Label block centre, moved inward from the space centre so it clears the outer token zone. */
export const LABEL_INWARD = 0.12;
/** Half the depth available for label text, measured from the label centre. */
export const TEXT_BAND_HALF_DEPTH = 0.42;
/** Token anchor distance outward from the space centre, and token base radius. */
export const TOKEN_OUTWARD = 0.75;
export const TOKEN_RADIUS = 0.34;
/** Houses are square footprints spaced along the stripe. */
export const HOUSE_FOOTPRINT = 0.19;
export const HOUSE_SPACING = 0.22;
export const HOTEL_LENGTH = 0.5;

const HALF = BOARD_SIZE / 2;

/** Twelve seam coordinates shared by x and z: corner | nine spaces | corner. */
export const GRID: readonly number[] = (() => {
  const grid = [-HALF, -HALF + RING_DEPTH];
  for (let k = 1; k <= SPACES_PER_SIDE; k++)
    grid.push(-HALF + RING_DEPTH + k * SPACE_LENGTH);
  grid.push(HALF);
  return grid;
})();

export interface Cell {
  /** 0 is the left/-x edge, 10 the right/+x edge. */
  readonly col: number;
  /** 0 is the far/-z edge, 10 the near/+z edge. */
  readonly row: number;
}
export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

/** Ring cell (11×11 perimeter) for a space index. Index 0 = bottom-right corner. */
export function cellOf(index: number): Cell {
  const i = ((index % SPACE_COUNT) + SPACE_COUNT) % SPACE_COUNT;
  const side = Math.floor(i / 10);
  const k = i % 10;
  switch (side) {
    case 0:
      return { col: 10 - k, row: 10 };
    case 1:
      return { col: 0, row: 10 - k };
    case 2:
      return { col: k, row: 0 };
    default:
      return { col: 10, row: k };
  }
}

export function isCorner(cell: Cell): boolean {
  return (
    (cell.col === 0 || cell.col === 10) && (cell.row === 0 || cell.row === 10)
  );
}

export function spaceRect(index: number): Rect {
  const { col, row } = cellOf(index);
  return {
    x0: GRID[col]!,
    x1: GRID[col + 1]!,
    z0: GRID[row]!,
    z1: GRID[row + 1]!,
  };
}

export function rectCenter(rect: Rect): Vec2 {
  return { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
}

/**
 * Unit vector pointing from the board centre to the space. Corners point diagonally.
 * Edge spaces point straight out of their side.
 */
export function outwardOf(index: number): Vec2 {
  const { col, row } = cellOf(index);
  const sx = col === 10 ? 1 : col === 0 ? -1 : 0;
  const sz = row === 10 ? 1 : row === 0 ? -1 : 0;
  if (sx === 0 && sz === 0) return { x: 0, z: 0 };
  const len = Math.hypot(sx, sz);
  return { x: sx / len, z: sz / len };
}

/** Which side (edge) a space belongs to, or "corner". */
export type Side = "bottom" | "top" | "left" | "right" | "corner";
export function sideOf(index: number): Side {
  const cell = cellOf(index);
  if (isCorner(cell)) return "corner";
  if (cell.row === 10) return "bottom";
  if (cell.row === 0) return "top";
  return cell.col === 0 ? "left" : "right";
}

/**
 * Direction of label "up" in the board texture (canvas: +x right, +z down).
 * -1 = letter tops point toward the board centre, so an observer at each edge reads upright
 * (bottom row upright, top row upside down, left row turned clockwise 90°, right row counter-clockwise 90°).
 */
export const LABEL_UP_SIGN = -1;

/** Canvas rotation (radians) that turns screen-up (0,-1) onto the label-up direction. */
export function labelRotation(index: number): number {
  const out = outwardOf(index);
  const ux = out.x * LABEL_UP_SIGN;
  const uz = out.z * LABEL_UP_SIGN;
  if (ux === 0 && uz === 0) return 0;
  return Math.atan2(ux, -uz);
}

/** Inner colour stripe for an edge space: the band nearest the board centre. */
export function stripeRect(index: number): Rect | null {
  if (isCorner(cellOf(index))) return null;
  const rect = spaceRect(index);
  const out = outwardOf(index);
  const { x0, x1, z0, z1 } = rect;
  const xr: [number, number] =
    out.x > 0
      ? [x0, x0 + STRIPE_DEPTH]
      : out.x < 0
        ? [x1 - STRIPE_DEPTH, x1]
        : [x0, x1];
  const zr: [number, number] =
    out.z > 0
      ? [z0, z0 + STRIPE_DEPTH]
      : out.z < 0
        ? [z1 - STRIPE_DEPTH, z1]
        : [z0, z1];
  return { x0: xr[0], x1: xr[1], z0: zr[0], z1: zr[1] };
}

/** Token anchor: outer zone of a space, away from the inner stripe. */
export function tokenAnchor(index: number, offset = 0): Vec2 {
  const c = rectCenter(spaceRect(index));
  const out = outwardOf(index);
  const along = alongAxis(index);
  return {
    x: c.x + out.x * TOKEN_OUTWARD + along.x * offset,
    z: c.z + out.z * TOKEN_OUTWARD + along.z * offset,
  };
}

/** Centre of the label block: the space centre moved slightly toward the board centre. */
export function labelCentre(index: number): Vec2 {
  const c = rectCenter(spaceRect(index));
  const out = outwardOf(index);
  return { x: c.x - out.x * LABEL_INWARD, z: c.z - out.z * LABEL_INWARD };
}

/** Unit vector along the length of an edge space (perpendicular to its outward direction). */
export function alongAxis(index: number): Vec2 {
  const out = outwardOf(index);
  if (out.x === 0 && out.z === 0) return { x: 0, z: 0 };
  // Rotate outward by 90 degrees in the XZ plane.
  return { x: -out.z, z: out.x };
}

/**
 * Centres for N houses (1–4) or one hotel (5). Houses sit on the inner stripe, spread along its length.
 */
export function buildingSlots(index: number, count: number): Vec2[] {
  const stripe = stripeRect(index);
  if (!stripe || count <= 0) return [];
  const center = rectCenter(stripe);
  const along = alongAxis(index);
  if (count >= 5) return [center];
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - (count - 1) / 2) * HOUSE_SPACING;
    return { x: center.x + along.x * offset, z: center.z + along.z * offset };
  });
}

/** World position of a space's walkable top surface centre (used for focus). */
export function spaceCenter(index: number): Vec2 {
  return rectCenter(spaceRect(index));
}

/** Canvas pixel for a world point on the plate, for a square texture of `pixels`. */
export function worldToPixel(
  p: Vec2,
  pixels: number,
): { px: number; py: number } {
  const k = pixels / PLATE_SIZE;
  return { px: (p.x + PLATE_SIZE / 2) * k, py: (p.z + PLATE_SIZE / 2) * k };
}
