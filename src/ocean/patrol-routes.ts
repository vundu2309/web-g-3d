import type { Boat } from "./model.ts";
import { seaObstacles } from "./market.ts";
import { PATROL_HULL_TIER } from "./boat-tier.ts";
import { NPC_PREFIX } from "./palette.ts";
import { SHIPYARDS } from "./shipyard.ts";

/**
 * The patrol ships: boats that nobody steers, each sailing a closed loop round one island, all by
 * the shared clock. Pure maths, no rendering and no network: a ship's place is a function of the
 * time (the server's clock, which every client already follows), so every player sees the same ship
 * in the same place with nothing sent. The scene draws them as other players' boats (`npc: true`,
 * the model `boat-patrol.glb` (tools/blender/patrol_boat.py) painted white with the navy trim of `PATROL_PALETTE`); the app adds them to the boats it hands to
 * the scene. Ships do not collide with anything (like other players' boats).
 *
 * A loop keeps its distance from the island's collision ring, from the other islands and from the
 * piers and shipyards: for each direction round the island the nearest of a few radii that clears
 * everything is taken, and the radii are smoothed (a maximum, then an average over the same
 * width, which can only widen the loop, never pull it in) so the ship turns gently.
 * `tests/patrol-routes.test.mjs` checks the clearance of every route.
 */

/** Which islands (indices of `islands`) have a patrol ship: spread over the sea. */
export const PATROL_ISLANDS: readonly number[] = [0, 2, 3, 4, 6, 7];
/**
 * The tier whose hull numbers a patrol ship takes (boat-tier.ts `PATROL_HULL_TIER`: its waterline,
 * wake, foam collar and shadow); its model is its own, `public/models/boat-patrol.glb`.
 */
export const PATROL_TIER = PATROL_HULL_TIER;
/** Cruising speed (m/s): about a third of a player's top speed. */
export const PATROL_SPEED = 6;
/** The ship's name above the water (at most 24 characters, like a player's). */
export const PATROL_NAME = "Tàu tuần tra";
/** How far (m) a route stays from the edge of every obstacle (a hull is about 10 m long). */
export const PATROL_CLEARANCE = 40;
/** Distances (m) from the island's collision ring that a loop may take, nearest first. */
const OFFSETS = [70, 90, 115, 145, 180, 220] as const;
/** Points on a loop, and the half-width (in points) of the smoothing. */
const POINTS = 144;
const SMOOTH = 6;

export interface PatrolRoute {
  /** `npc:patrol-<n>`: the boat's id in the scene. */
  uid: string;
  island: number;
  /** The loop, closed (the last point joins the first), in metres. */
  points: readonly { x: number; z: number }[];
  /** Cumulative length at each point (the first is 0) and the whole loop's length (m). */
  at: readonly number[];
  length: number;
  /** 1 or -1: which way round. */
  direction: 1 | -1;
  /** Where on the loop (0 to 1) the ship is at time 0. */
  phase: number;
  speed: number;
}

const wrap = (value: number, length: number) =>
  ((value % length) + length) % length;

/** The loop round island `index`, or throws if no radius clears everything in some direction. */
function loopAround(index: number): { x: number; z: number }[] {
  const all = [
    ...seaObstacles().map((o) => ({ ...o })),
    ...SHIPYARDS.map((yard) => ({ x: yard.x, z: yard.z, radius: 12 })),
  ];
  const own = all[index]!;
  const others = all.filter((_, i) => i !== index);
  const clear = (x: number, z: number) =>
    others.every(
      (o) => Math.hypot(x - o.x, z - o.z) >= o.radius + PATROL_CLEARANCE,
    );
  const radii: number[] = [];
  for (let k = 0; k < POINTS; k++) {
    const angle = (k / POINTS) * Math.PI * 2;
    const offset = OFFSETS.find((o) =>
      clear(
        own.x + Math.sin(angle) * (own.radius + o),
        own.z - Math.cos(angle) * (own.radius + o),
      ),
    );
    if (offset === undefined)
      throw new Error(`no clear patrol loop round island ${index}`);
    radii.push(own.radius + offset);
  }
  const at = (list: number[], i: number) =>
    list[((i % POINTS) + POINTS) % POINTS]!;
  const widest = radii.map((_, i) => {
    let best = 0;
    for (let d = -SMOOTH; d <= SMOOTH; d++)
      best = Math.max(best, at(radii, i + d));
    return best;
  });
  const smooth = widest.map((_, i) => {
    let sum = 0;
    for (let d = -SMOOTH; d <= SMOOTH; d++) sum += at(widest, i + d);
    return sum / (2 * SMOOTH + 1);
  });
  return smooth.map((r, k) => {
    const angle = (k / POINTS) * Math.PI * 2;
    return { x: own.x + Math.sin(angle) * r, z: own.z - Math.cos(angle) * r };
  });
}

let routes: PatrolRoute[] | undefined;

/** The routes of the patrol ships (built once). */
export function patrolRoutes(): readonly PatrolRoute[] {
  routes ??= PATROL_ISLANDS.map((island, n) => {
    const loop = loopAround(island);
    const points = [...loop, loop[0]!];
    const at = [0];
    for (let i = 1; i < points.length; i++)
      at.push(
        at[i - 1]! +
          Math.hypot(
            points[i]!.x - points[i - 1]!.x,
            points[i]!.z - points[i - 1]!.z,
          ),
      );
    return {
      uid: `${NPC_PREFIX}patrol-${n}`,
      island,
      points,
      at,
      length: at[at.length - 1]!,
      direction: n % 2 === 0 ? 1 : -1,
      phase: (n * 0.382) % 1,
      speed: PATROL_SPEED,
    } satisfies PatrolRoute;
  });
  return routes;
}

/** The point at distance `s` (m) along the loop. */
function pointAt(route: PatrolRoute, s: number) {
  const d = wrap(s, route.length);
  let lo = 0;
  let hi = route.at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route.at[mid]! <= d) lo = mid;
    else hi = mid;
  }
  const span = route.at[hi]! - route.at[lo]! || 1;
  const k = (d - route.at[lo]!) / span;
  const a = route.points[lo]!;
  const b = route.points[hi]!;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
}

/**
 * Where the ship is `seconds` after the clock's zero: position and heading (radians, 0 toward -z as
 * for every boat). The heading follows the loop a few metres either side, so it turns smoothly
 * instead of changing with each straight piece.
 */
export function patrolPose(route: PatrolRoute, seconds: number) {
  const s =
    route.phase * route.length + route.direction * route.speed * seconds;
  const here = pointAt(route, s);
  const ahead = pointAt(route, s + 4 * route.direction);
  const behind = pointAt(route, s - 4 * route.direction);
  return {
    x: here.x,
    z: here.z,
    heading: Math.atan2(ahead.x - behind.x, -(ahead.z - behind.z)),
  };
}

/** The patrol ships as boats for the scene, at the server's time `serverMs` (the clock the sea follows). */
export function patrolBoats(serverMs: number): Boat[] {
  const seconds = serverMs / 1000;
  return patrolRoutes().map((route) => ({
    uid: route.uid,
    name: PATROL_NAME,
    session: "",
    ...patrolPose(route, seconds),
    fishing: false,
    updatedAt: serverMs,
    tier: PATROL_TIER,
    rod: 0,
    npc: true,
  }));
}
