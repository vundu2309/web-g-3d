/**
 * Procedural board face. One canvas draws the whole plate; the WebGL renderer uploads it as a single
 * CanvasTexture and the flat fallback draws it with the same code. Drawing uses world units via a transform.
 * No generated artwork is used as a runtime image.
 */
import {
  BOARD_SIZE,
  GRID,
  PLATE_SIZE,
  RING_DEPTH,
  TEXT_BAND_HALF_DEPTH,
  cellOf,
  isCorner,
  labelCentre,
  labelRotation,
  rectCenter,
  spaceRect,
  stripeRect,
  type Rect,
} from "./layout.ts";
import { BOARD_SPACES, GROUP_COLORS, type BoardSpace } from "./spaces.ts";

export const BOARD_COLORS = {
  rim: "#153b80",
  ivory: "#fffcf4",
  cornerIvory: "#fffef3",
  mint: "#bfeeda",
  ink: "#1c2e51",
  seam: "#7d8fb0",
  railroad: "#2b2f38",
} as const;

const FONT = 'Arial, Helvetica, "Be Vietnam Pro", sans-serif';
/** Text block limits inside a space's white band, in world units. */
const BAND_DEPTH = 2 * TEXT_BAND_HALF_DEPTH;
/** Along the frontage (one unit), leaving a margin at each end. */
const BAND_LENGTH = 0.86;

/** Draws the full board plate at `pixels`×`pixels` onto a 2D context whose size is already set. */
export function drawBoardFace(
  ctx: CanvasRenderingContext2D,
  pixels: number,
): void {
  const k = pixels / PLATE_SIZE;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, (PLATE_SIZE / 2) * k, (PLATE_SIZE / 2) * k);
  ctx.fillStyle = BOARD_COLORS.rim;
  ctx.fillRect(-PLATE_SIZE / 2, -PLATE_SIZE / 2, PLATE_SIZE, PLATE_SIZE);
  const half = BOARD_SIZE / 2;
  ctx.fillStyle = BOARD_COLORS.ivory;
  ctx.fillRect(-half, -half, BOARD_SIZE, BOARD_SIZE);
  // Mint centre inside the ring, derived from the same seam grid.
  const inner = GRID[1]!;
  ctx.fillStyle = BOARD_COLORS.mint;
  ctx.fillRect(inner, inner, GRID[10]! - inner, GRID[10]! - inner);
  for (const space of BOARD_SPACES) drawSpace(ctx, space);
  // Outline only perimeter cells; the centre is a continuous mint surface.
  ctx.strokeStyle = BOARD_COLORS.seam;
  ctx.lineWidth = 0.018;
  for (const space of BOARD_SPACES) {
    const r = spaceRect(space.index);
    ctx.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  }
  ctx.restore();
}

function drawSpace(ctx: CanvasRenderingContext2D, space: BoardSpace): void {
  const cell = cellOf(space.index);
  const rect = spaceRect(space.index);
  if (isCorner(cell)) {
    fillRect(ctx, rect, BOARD_COLORS.cornerIvory);
    drawCornerLabel(ctx, space, rect);
    return;
  }
  const stripe = stripeRect(space.index);
  if (stripe && space.group) fillRect(ctx, stripe, GROUP_COLORS[space.group]);
  if (stripe && space.kind === "railroad")
    fillRect(ctx, stripe, BOARD_COLORS.railroad);
  drawEdgeLabel(ctx, space);
}

/** Label block sits in the white band: beyond the inner stripe, short of the token zone. */
function drawEdgeLabel(ctx: CanvasRenderingContext2D, space: BoardSpace): void {
  const centre = labelCentre(space.index);
  ctx.save();
  ctx.translate(centre.x, centre.z);
  ctx.rotate(labelRotation(space.index));
  drawFittedLines(ctx, [space.name], BAND_LENGTH, BAND_DEPTH, 0.2, 0.09);
  ctx.restore();
}

function drawCornerLabel(
  ctx: CanvasRenderingContext2D,
  space: BoardSpace,
  rect: Rect,
): void {
  const c = rectCenter(rect);
  const lines =
    space.index === 0
      ? ["GO"]
      : space.index === 10
        ? ["JAIL", "Just Visiting"]
        : space.index === 20
          ? ["FREE", "PARKING"]
          : ["GO TO", "JAIL"];
  ctx.save();
  ctx.translate(c.x, c.z);
  drawFittedLines(
    ctx,
    lines,
    RING_DEPTH * 0.8,
    RING_DEPTH * 0.8,
    space.index === 0 ? 0.5 : 0.26,
    0.1,
  );
  ctx.restore();
}

/**
 * Draw centred lines with a font size shrunk until the block fits `maxLength` (along x) and `maxDepth` (along y).
 * Caller has already translated and rotated the context.
 */
function drawFittedLines(
  ctx: CanvasRenderingContext2D,
  input: string[],
  maxLength: number,
  maxDepth: number,
  startSize: number,
  minSize: number,
): void {
  let size = startSize;
  let lines: string[];
  for (;;) {
    ctx.font = `700 ${size}px ${FONT}`;
    lines = input.flatMap((text) => wrapWords(ctx, text, maxLength));
    const lineHeight = size * 1.12;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const height = lines.length * lineHeight;
    if ((widest <= maxLength && height <= maxDepth) || size <= minSize) break;
    size = Math.max(minSize, size - 0.004);
  }
  ctx.fillStyle = BOARD_COLORS.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineHeight = size * 1.12;
  const top = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 0, top + i * lineHeight));
}

/** Greedy word wrap at the current font. A single over-long word stays on its own line. */
function wrapWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fillRect(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
}
