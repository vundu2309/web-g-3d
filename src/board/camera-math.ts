/**
 * Pure camera poses. Three.js objects are created by the stage; these numbers are testable.
 */
import { PLATE_SIZE } from "./layout.ts";

export const CAMERA_FOV_DEG = 35;
/** Default overview tilt from straight down (radians). */
export const OVERVIEW_POLAR = 1.0;
export const OVERVIEW_POLAR_MIN = 0.2;
export const OVERVIEW_POLAR_MAX = 1.3;
/** Fraction of the viewport height the whole board should occupy in overview. */
export const OVERVIEW_FILL = 0.96;
/**
 * Focus camera: stands outside the token's side of the board, looking inward, so that edge's labels read upright.
 * FOCUS_OUT is the horizontal distance from the token along the token's radial direction; FOCUS_UP the height.
 */
export const FOCUS_OUT = 3.4;
export const FOCUS_UP = 4.2;
/** Half-width in board units that focus must show (token plus two neighbours each side). */
const FOCUS_HALF_SPAN = 2.4;

/** Camera presentation: follow the active token, or orbit the whole board. */
export type CameraMode = "focus" | "overview";

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Largest normalised device coordinate of the plate's corners (rim and slab included) for an overview
 * camera at distance d. Uses the same perspective projection as three.js, so near-edge enlargement counts.
 */
function overviewMaxNdc(d: number, aspect: number): number {
  const pose = overviewPose(aspect, d);
  const eye = [pose.x, pose.y, pose.z];
  const len = Math.hypot(eye[0]!, eye[1]!, eye[2]!);
  const forward = eye.map((v) => -v / len);
  // right = normalize(forward × worldUp), with worldUp = (0,1,0)
  const rightRaw = [-forward[2]!, 0, forward[0]!];
  const rl = Math.hypot(rightRaw[0]!, rightRaw[2]!) || 1;
  const right = [rightRaw[0]! / rl, 0, rightRaw[2]! / rl];
  // camUp = right × forward
  const up = [
    right[1]! * forward[2]! - right[2]! * forward[1]!,
    right[2]! * forward[0]! - right[0]! * forward[2]!,
    right[0]! * forward[1]! - right[1]! * forward[0]!,
  ];
  const tan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const h = PLATE_SIZE / 2;
  let max = 0;
  for (const x of [-h, h])
    for (const z of [-h, h])
      for (const y of [0, -0.3]) {
        const v = [x - eye[0]!, y - eye[1]!, z - eye[2]!];
        const xc = v[0]! * right[0]! + v[1]! * right[1]! + v[2]! * right[2]!;
        const yc = v[0]! * up[0]! + v[1]! * up[1]! + v[2]! * up[2]!;
        const zc =
          v[0]! * forward[0]! + v[1]! * forward[1]! + v[2]! * forward[2]!;
        if (zc <= 0) return Infinity;
        max = Math.max(
          max,
          Math.abs(xc) / (zc * tan * Math.max(aspect, 0.01)),
          Math.abs(yc) / (zc * tan),
        );
      }
  return max;
}

/** Smallest overview distance whose projected plate corners stay within OVERVIEW_FILL of the viewport. */
export function overviewDistance(aspect: number): number {
  let lo = 1;
  let hi = 400;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (overviewMaxNdc(mid, aspect) > OVERVIEW_FILL) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Overview camera position for a target at the origin. Distance defaults to the fitted value. */
export function overviewPose(aspect: number, distance?: number): Pose {
  const d = distance ?? overviewDistance(aspect);
  return {
    x: 0,
    y: d * Math.cos(OVERVIEW_POLAR),
    z: d * Math.sin(OVERVIEW_POLAR),
  };
}

/**
 * Focus camera position. `dir` is the radial direction from the board centre to the token (XZ plane),
 * so the camera rotates to the side where the token is. Scaled so about two neighbouring spaces stay visible.
 */
export function focusPose(
  target: Pose,
  dir: { x: number; z: number },
  aspect: number,
): Pose {
  const len = Math.hypot(dir.x, dir.z);
  const ux = len > 1e-6 ? dir.x / len : 0;
  const uz = len > 1e-6 ? dir.z / len : 1;
  const tan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const base = Math.hypot(FOCUS_OUT, FOCUS_UP);
  const visibleWidth = 2 * base * tan * Math.max(aspect, 0.01);
  const scale = Math.min(
    2.4,
    Math.max(1, (2 * FOCUS_HALF_SPAN) / visibleWidth),
  );
  return {
    x: target.x + ux * FOCUS_OUT * scale,
    y: target.y + FOCUS_UP * scale,
    z: target.z + uz * FOCUS_OUT * scale,
  };
}

/** Orbit distance bounds for OrbitControls, relative to the overview distance. */
export function orbitBounds(aspect: number): { min: number; max: number } {
  const d = overviewDistance(aspect);
  return { min: d * 0.55, max: d * 1.7 };
}

/** Horizontal view offset (fraction of width) that keeps the board left of the task card. */
export const TASK_SHIFT_FRACTION = 0.16;
