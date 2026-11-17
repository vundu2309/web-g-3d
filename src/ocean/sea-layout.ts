import { islandCollisionRadius, islands } from "./model.ts";
import { MARKETS } from "./market.ts";

/**
 * Where the extra things in the sea are: channel buoys and seagulls circling the islands.
 * None of them is solid and none is part of the shared state (the boats still only collide
 * with `islands`): they are scenery, so they are the same for every player without any
 * message.
 */
export interface Buoy {
  x: number;
  z: number;
  /** Red marks the port side of a channel, green the starboard. */
  color: "red" | "green";
}

/** How far each side of a market pier its channel buoys float (m). */
const GATE_HALF_WIDTH = 14;

/** A gate just north of the harbor and a gate either side of each market's pier. */
export const BUOYS: readonly Buoy[] = [
  { x: -9, z: -6, color: "red" },
  { x: 9, z: -6, color: "green" },
  ...MARKETS.flatMap((market): Buoy[] => {
    // The pier faces (sin facing, -cos facing); the gate runs across that.
    const px = Math.cos(market.facing);
    const pz = Math.sin(market.facing);
    return [
      {
        x: market.x + px * GATE_HALF_WIDTH,
        z: market.z + pz * GATE_HALF_WIDTH,
        color: "red",
      },
      {
        x: market.x - px * GATE_HALF_WIDTH,
        z: market.z - pz * GATE_HALF_WIDTH,
        color: "green",
      },
    ];
  }),
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

export const GULLS: readonly Gull[] = islands.flatMap((island, index) =>
  gullsAround(island, 3, index + 1),
);

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

/** Whether a point is clear of every island by `margin` metres past the boats' ring. */
export const clearOfIslands = (x: number, z: number, margin = 3) =>
  islands.every(
    (island) =>
      Math.hypot(x - island.x, z - island.z) >
      islandCollisionRadius(island) + margin,
  );
