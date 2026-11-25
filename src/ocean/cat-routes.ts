import { HARBOR, SEA_BOUND } from "./model.ts";
import { seaObstacles } from "./market.ts";
import { SHORE_ISLANDS } from "./shore.ts";

/**
 * Where the NPC rowing cats are, as plain numbers (no Babylon, so tests read it directly), the
 * same on every device: each boat rows to and fro between two ports off two islands, resting at
 * each, and its place is a function of the shared clock alone (the server time the app already
 * follows), so every player sees the same boats at the same places with nothing sent over the
 * network. A route is kept only when its straight line clears every island, market and the
 * harbour by a margin.
 */

export interface Point {
  x: number;
  z: number;
}
interface Circle extends Point {
  radius: number;
}

/** How far (m) off an island's rim a port is, and how far a route keeps from anything solid. */
export const PORT_OFFSET = 60;
export const CLEARANCE = 40;
/** Rowing speed over the water (m/s) and rest at each port (s). */
export const ROW_SPEED = 3.2;
export const REST = 45;
/** Routes shorter or longer than this (m) are not used. */
export const ROUTE_LENGTH = { min: 180, max: 1100 };
/** How many boats the sea has. */
export const BOATS = 6;

/** Everything a route must keep clear of: the islands' shores, the piers and the harbour where players start. */
export function solids(): Circle[] {
  return [...seaObstacles(), { x: HARBOR.x, z: HARBOR.z + 3.5, radius: 25 }];
}

/** The distance from `p` to the segment `a`-`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

export interface Route {
  a: Point;
  b: Point;
  length: number;
  /** Which islands (indices of SHORE_ISLANDS) the ports are off. */
  islands: [number, number];
}

/** The ports of the island `index` for a route toward `toward`: off the island's rim on the side that faces it. */
function portOf(index: number, toward: Point): Point {
  const island = SHORE_ISLANDS[index]!;
  const angle = Math.atan2(toward.z - island.z, toward.x - island.x);
  const r = island.radius * 1.35 + PORT_OFFSET;
  return {
    x: island.x + Math.cos(angle) * r,
    z: island.z + Math.sin(angle) * r,
  };
}

/** Every route between two islands whose straight line is clear, in a fixed order. */
export function makeRoutes(): Route[] {
  const solid = solids();
  const routes: Route[] = [];
  for (let i = 0; i < SHORE_ISLANDS.length; i++)
    for (let j = i + 1; j < SHORE_ISLANDS.length; j++) {
      const a = portOf(i, SHORE_ISLANDS[j]!);
      const b = portOf(j, SHORE_ISLANDS[i]!);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < ROUTE_LENGTH.min || length > ROUTE_LENGTH.max) continue;
      if (Math.abs(a.x) > SEA_BOUND - 50 || Math.abs(a.z) > SEA_BOUND - 50)
        continue;
      if (Math.abs(b.x) > SEA_BOUND - 50 || Math.abs(b.z) > SEA_BOUND - 50)
        continue;
      // The ports sit near their own island: only the other solids (and the island's own
      // market, which is a little off the shore) must be cleared along the line.
      const clear = solid.every((s) => {
        const d = distanceToSegment(s, a, b);
        const nearEnd = Math.min(
          Math.hypot(s.x - a.x, s.z - a.z),
          Math.hypot(s.x - b.x, s.z - b.z),
        );
        return (
          d >= s.radius + CLEARANCE || nearEnd < s.radius + PORT_OFFSET * 0.5
        );
      });
      if (clear) routes.push({ a, b, length, islands: [i, j] });
    }
  return routes;
}

export interface CatBoatPlan {
  route: Route;
  /** Seconds into its cycle at clock 0. */
  phase: number;
}

/** A small deterministic random generator (the same plans on every device). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The boats' plans: routes dealt out in turn (a route can carry two boats at different phases). */
export function makePlans(
  routes: readonly Route[] = makeRoutes(),
): CatBoatPlan[] {
  if (!routes.length) return [];
  const random = seeded(0xca7b047);
  return Array.from({ length: BOATS }, (_, i) => {
    const route = routes[i % routes.length]!;
    const cycle = cycleOf(route);
    return { route, phase: random() * cycle };
  });
}

/** Seconds the boat takes one way. */
export const travelTime = (route: Route) => route.length / ROW_SPEED;
/** Seconds of a whole there-and-back with both rests. */
export const cycleOf = (route: Route) => 2 * (travelTime(route) + REST);

export interface CatBoatPose {
  x: number;
  z: number;
  /** 0 is -Z, a quarter turn is +X (the game's heading). */
  heading: number;
  /** m/s over the water, 0 at rest. */
  speed: number;
  /** 0 at rest .. 1 rowing at full effort. */
  effort: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Where a boat is, and what it is doing, at the shared clock `seconds`. */
export function boatPose(plan: CatBoatPlan, seconds: number): CatBoatPose {
  const { a, b, length } = plan.route;
  const travel = travelTime(plan.route);
  const cycle = cycleOf(plan.route);
  let u = (seconds + plan.phase) % cycle;
  if (u < 0) u += cycle;
  // 0: a to b, 1: resting at b, 2: b to a, 3: resting at a.
  let leg = 0;
  if (u >= travel) {
    u -= travel;
    leg = 1;
  }
  if (leg === 1 && u >= REST) {
    u -= REST;
    leg = 2;
  }
  if (leg === 2 && u >= travel) {
    u -= travel;
    leg = 3;
  }
  const from = leg <= 1 ? a : b;
  const to = leg <= 1 ? b : a;
  const dx = (to.x - from.x) / length;
  const dz = (to.z - from.z) / length;
  const heading = Math.atan2(dx, -dz);
  if (leg === 1 || leg === 3) {
    const at = leg === 1 ? b : a;
    // At rest the bow still points the way it came.
    return { x: at.x, z: at.z, heading, speed: 0, effort: 0 };
  }
  const f = u / travel;
  const along = smooth(f) * length;
  // The speed is the slope of the eased distance: 1.5 times the cruise at the middle.
  const speed = (6 * f * (1 - f) * length) / travel;
  return {
    x: from.x + dx * along,
    z: from.z + dz * along,
    heading,
    speed,
    effort: Math.min(1, speed / ROW_SPEED),
  };
}
