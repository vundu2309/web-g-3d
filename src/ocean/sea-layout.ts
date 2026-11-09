import { SEA_BOUND, islandCollisionRadius, islands } from "./model.ts";

/**
 * Where the extra things in the sea are: channel buoys, seagulls circling the islands and
 * backdrop islands beyond the edge of the sea. None of them is solid and none is part of
 * the shared state (the boats still only collide with `islands`): they are scenery, so
 * they are the same for every player without any message.
 */
export interface Buoy {
  x: number;
  z: number;
  /** Red marks the port side of a channel, green the starboard. */
  color: "red" | "green";
}

/** A gate just north of the harbor and a marked channel off each island. */
export const BUOYS: readonly Buoy[] = [
  { x: -9, z: -6, color: "red" },
  { x: 9, z: -6, color: "green" },
  { x: -30, z: -30, color: "red" },
  { x: -22, z: -44, color: "green" },
  { x: 78, z: -58, color: "red" },
  { x: 100, z: -56, color: "green" },
  { x: 92, z: 28, color: "red" },
  { x: 114, z: 26, color: "green" },
];

export interface Gull {
  cx: number;
  cz: number;
  radius: number;
  height: number;
  /** Radians per second around the circle (negative is the other way). */
  speed: number;
  phase: number;
}

const gullsAround = (
  island: { x: number; z: number; radius: number },
  n: number,
  seed: number,
) =>
  Array.from({ length: n }, (_, i) => ({
    cx: island.x + Math.sin(seed * 3 + i) * 4,
    cz: island.z + Math.cos(seed * 5 + i) * 4,
    radius: island.radius * (0.7 + (0.5 * ((i * 37 + seed * 11) % 10)) / 10),
    height: 9 + ((i * 53 + seed * 7) % 13),
    speed: (0.18 + 0.05 * (i % 3)) * (i % 2 ? 1 : -1) * (14 / island.radius),
    phase: i * 1.9 + seed,
  }));

export const GULLS: readonly Gull[] = [
  ...gullsAround(islands[0]!, 3, 1),
  ...gullsAround(islands[1]!, 2, 2),
  ...gullsAround(islands[2]!, 2, 3),
];

export interface GullPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about Y that points the model's nose (+X) along its flight. */
  heading: number;
  /** Lean into the turn (rad). */
  bank: number;
}

/** Where gull `i` is at time `t` seconds: a lazy circle that rises and sinks a little. */
export function gullPose(gull: Gull, t: number): GullPose {
  const angle = gull.phase + gull.speed * t;
  const x = gull.cx + Math.cos(angle) * gull.radius;
  const z = gull.cz + Math.sin(angle) * gull.radius;
  const direction = Math.sign(gull.speed);
  // The flight direction is the tangent of the circle.
  const vx = -Math.sin(angle) * direction;
  const vz = Math.cos(angle) * direction;
  return {
    x,
    y: gull.height + Math.sin(t * 0.6 + gull.phase * 2) * 1.6,
    z,
    heading: Math.atan2(-vz, vx),
    bank: -0.32 * direction + Math.sin(t * 4.5 + gull.phase) * 0.12,
  };
}

export interface Backdrop {
  x: number;
  z: number;
  radius: number;
  seed: number;
}

/** Far islands beyond the edge of the sea, seen through the haze; they cannot be reached. */
export const BACKDROP: readonly Backdrop[] = [
  { x: -330, z: -210, radius: 48, seed: 101 },
  { x: 310, z: -270, radius: 60, seed: 109 },
  { x: 340, z: 160, radius: 42, seed: 117 },
  { x: -300, z: 270, radius: 55, seed: 123 },
  { x: 40, z: -420, radius: 70, seed: 131 },
];

/** Whether a point is clear of every island by `margin` metres past the boats' ring. */
export const clearOfIslands = (x: number, z: number, margin = 3) =>
  islands.every(
    (island) =>
      Math.hypot(x - island.x, z - island.z) >
      islandCollisionRadius(island) + margin,
  );

export const BEYOND_SEA = SEA_BOUND;
