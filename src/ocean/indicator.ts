/**
 * Where to draw an arrow for a boat that is outside the camera's view: on a ring
 * inside the screen, pointing toward it, so players can always find each other.
 * Pure maths; the scene decides when a boat counts as off-screen.
 */
export interface Indicator {
  /** Position as a fraction of the screen, 0..1 from the left. */
  x: number;
  /** Position as a fraction of the screen, 0..1 from the top. */
  y: number;
  /** Arrow rotation in radians: 0 points up (ahead), positive turns clockwise. */
  turn: number;
  /** Straight-line distance in metres. */
  distance: number;
}

/**
 * @param dx world offset to the boat along x
 * @param dz world offset to the boat along z
 * @param viewHeading the camera's heading, same convention as boats (0 looks toward -Z)
 */
export function edgeIndicator(
  dx: number,
  dz: number,
  viewHeading: number,
  halfWidth = 0.36,
  halfHeight = 0.27,
): Indicator {
  const ahead = dx * Math.sin(viewHeading) - dz * Math.cos(viewHeading);
  const side = dx * Math.cos(viewHeading) + dz * Math.sin(viewHeading);
  const turn = Math.atan2(side, ahead);
  const vx = Math.sin(turn);
  const vy = -Math.cos(turn);
  const reach = Math.min(
    Math.abs(vx) > 1e-9 ? halfWidth / Math.abs(vx) : Infinity,
    Math.abs(vy) > 1e-9 ? halfHeight / Math.abs(vy) : Infinity,
  );
  return {
    x: 0.5 + vx * reach,
    y: 0.5 + vy * reach,
    turn,
    distance: Math.hypot(dx, dz),
  };
}

export interface LabelBox {
  /** Horizontal centre and bottom edge, in px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Nudges name labels up so two never sit on top of each other. Returns how far to
 * lift each one (px, 0 or more), in the order given. The label nearest the bottom
 * of the screen keeps its place; others stack above it. Pure maths.
 */
export function separateLabels(boxes: readonly LabelBox[], gap = 3): number[] {
  const lift: number[] = boxes.map(() => 0);
  // Lowest on screen first: it keeps its place and the others stack above it.
  const order = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => b.box.y - a.box.y);
  const placed: LabelBox[] = [];
  for (const { box: original, index } of order) {
    const box = { ...original };
    for (let tries = 0; tries < 8; tries++) {
      const hit = placed.find(
        (other) =>
          Math.abs(other.x - box.x) < (other.w + box.w) / 2 &&
          Math.abs(other.y - box.y) < (other.h + box.h) / 2,
      );
      if (!hit) break;
      box.y = hit.y - hit.h - gap;
    }
    lift[index] = Math.max(0, original.y - box.y);
    placed.push(box);
  }
  return lift;
}
