import { HARBOR } from "./model.ts";
import {
  coastAt,
  islandSeed,
  seabedDepth,
  shoreOf,
  shoreTable,
  SHORE_ISLANDS,
} from "./shore.ts";

/**
 * Where the small fish of the shallows are, as plain numbers (no Babylon, so tests read it
 * directly). Every island has a few schools; a school's middle swims slowly round the island at
 * a distance off the coast (drifting in and out), and each fish keeps its own place in the
 * school and its own wobble. A boat that comes close scatters the school: its middle is pushed
 * away from the hull and eases back when the boat has gone.
 */

/** Schools round each island, and fish in each school. */
export const SCHOOLS_PER_ISLAND = 3;
export const FISH_PER_SCHOOL = 12;
/** Schools circling the harbour. */
export const HARBOUR_SCHOOLS = 4;
/** Metres off the coast the school swims (the middle of the range, and how far it drifts). */
export const OFFSHORE = { min: 20, max: 44, drift: 7 };
/** How fast a school's middle moves (m/s). */
export const SCHOOL_SPEED = { min: 0.9, max: 1.5 };
/** A boat closer than this (m) frightens the school; it is pushed out to about this far. */
export const SCARE_RANGE = 16;

export interface School {
  island: number;
  /** A school of the harbour: it circles a point in open water instead of an island's coast. */
  anchor?: { x: number; z: number; radius: number };
  /** Which of the two looks (0 silver-blue, 1 yellow). */
  look: number;
  angle0: number;
  /** Radians per second round the island (negative: the other way). */
  rate: number;
  distance0: number;
  driftPhase: number;
  fish: {
    forward: number;
    right: number;
    depth: number;
    phase: number;
    size: number;
  }[];
}

/** A small deterministic random generator (the same schools on every device). */
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

export function makeSchools(): School[] {
  const schools: School[] = [];
  SHORE_ISLANDS.forEach((island, index) => {
    const random = seeded(islandSeed(index) ^ 0x5f3759df);
    for (let s = 0; s < SCHOOLS_PER_ISLAND; s++) {
      const speed =
        SCHOOL_SPEED.min + (SCHOOL_SPEED.max - SCHOOL_SPEED.min) * random();
      const distance0 =
        OFFSHORE.min +
        OFFSHORE.drift +
        (OFFSHORE.max - OFFSHORE.min - 2 * OFFSHORE.drift) * random();
      const circle = Math.max(40, island.radius + distance0);
      schools.push({
        island: index,
        look: random() < 0.35 ? 1 : 0,
        angle0: random() * Math.PI * 2,
        rate: ((random() < 0.5 ? -1 : 1) * speed) / circle,
        distance0,
        driftPhase: random() * Math.PI * 2,
        fish: Array.from({ length: FISH_PER_SCHOOL }, () => ({
          forward: (random() - 0.5) * 6,
          right: (random() - 0.5) * 5,
          depth: random(),
          phase: random() * Math.PI * 2,
          size: 0.8 + 0.4 * random(),
        })),
      });
    }
  });
  // The harbour has its own schools, so the first sea a player sees is not empty: the nearest
  // island is hundreds of metres away and the water layer reaches 110 m.
  const random = seeded(0x4a7b1);
  for (let s = 0; s < HARBOUR_SCHOOLS; s++) {
    const radius = 26 + s * 9;
    schools.push({
      island: -1,
      anchor: { x: HARBOR.x, z: HARBOR.z + 8, radius },
      look: s % 2,
      angle0: random() * Math.PI * 2,
      rate: ((s % 2 ? -1 : 1) * 1.1) / radius,
      distance0: radius,
      driftPhase: random() * Math.PI * 2,
      fish: Array.from({ length: FISH_PER_SCHOOL }, () => ({
        forward: (random() - 0.5) * 6,
        right: (random() - 0.5) * 5,
        depth: random(),
        phase: random() * Math.PI * 2,
        size: 0.8 + 0.4 * random(),
      })),
    });
  }
  return schools;
}

export const SCHOOLS: readonly School[] = makeSchools();

/** The middle of a school at time `t`: world x, z and how far off the coast it is. */
export function schoolCentre(school: School, t: number) {
  if (school.anchor) {
    const angle = school.angle0 + school.rate * t;
    const r = school.anchor.radius + 3 * Math.sin(t * 0.06 + school.driftPhase);
    return {
      x: school.anchor.x + Math.cos(angle) * r,
      z: school.anchor.z + Math.sin(angle) * r,
      off: 40,
    };
  }
  const island = SHORE_ISLANDS[school.island]!;
  const angle = school.angle0 + school.rate * t;
  const off =
    school.distance0 + OFFSHORE.drift * Math.sin(t * 0.06 + school.driftPhase);
  const { fraction } = coastAt(shoreTable(school.island), angle);
  const r = fraction * island.radius + off;
  return {
    x: island.x + Math.cos(angle) * r,
    z: island.z + Math.sin(angle) * r,
    off,
  };
}

export interface FishPose {
  x: number;
  y: number;
  z: number;
  /** Yaw (radians) so that a fish's +z axis points along its swimming. */
  yaw: number;
  /** A little roll and yaw wobble of the body (radians): the swimming. */
  roll: number;
  size: number;
}

/** A point of the sea a boat is at, to be avoided. */
export interface Scarer {
  x: number;
  z: number;
}

/**
 * The poses of every fish of `school` at time `t` (written into `out`, FISH_PER_SCHOOL of them).
 * `push` is the school's current scatter offset (metres, x and z), eased by the caller with
 * `scatterTarget`.
 */
export function schoolPoses(
  school: School,
  t: number,
  push: { x: number; z: number },
  out: FishPose[],
) {
  const c = schoolCentre(school, t);
  const c2 = schoolCentre(school, t + 0.5);
  let fx = c2.x - c.x;
  let fz = c2.z - c.z;
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  const rx = -fz;
  const rz = fx;
  school.fish.forEach((fish, i) => {
    // Each fish drifts about its place in the school.
    const wf = fish.forward + 1.1 * Math.sin(t * 0.7 + fish.phase);
    const wr = fish.right + 0.9 * Math.sin(t * 0.55 + fish.phase * 1.7);
    const x = c.x + push.x + fx * wf + rx * wr;
    const z = c.z + push.z + fz * wf + rz * wr;
    // Fish keep clear of the sand: shallow where the shelf is thin, deeper (up to 2.4 m) otherwise.
    const gap = school.anchor ? 6 : Math.max(0.05, seabedDepth(c.off));
    const depth = Math.min(0.5 + 1.4 * fish.depth, gap * 0.55);
    const wobble = Math.sin(t * 6 + fish.phase * 3);
    const turn = 0.3 * Math.sin(t * 0.9 + fish.phase);
    const pose = (out[i] ??= { x: 0, y: 0, z: 0, yaw: 0, roll: 0, size: 1 });
    pose.x = x;
    pose.z = z;
    pose.y = -depth;
    pose.yaw = Math.atan2(fx, fz) + turn + 0.12 * wobble;
    pose.roll = 0.15 * wobble;
    pose.size = fish.size;
  });
  return out;
}

/**
 * Where a school wants its scatter to be given the boats about: away from each boat nearer than
 * SCARE_RANGE, by what it takes to be that far. Boats far away leave it zero.
 */
export function scatterTarget(
  school: School,
  t: number,
  boats: readonly Scarer[],
  into: { x: number; z: number },
) {
  const c = schoolCentre(school, t);
  into.x = 0;
  into.z = 0;
  for (const boat of boats) {
    const dx = c.x - boat.x;
    const dz = c.z - boat.z;
    const d = Math.hypot(dx, dz);
    if (d >= SCARE_RANGE || d < 1e-3) continue;
    const need = SCARE_RANGE - d;
    into.x += (dx / d) * need;
    into.z += (dz / d) * need;
  }
  return into;
}

/** How far (m) the water over a school's middle is from the coast, for tests and the island checks. */
export function schoolShore(school: School, t: number) {
  if (school.anchor) return Infinity;
  const c = schoolCentre(school, t);
  return shoreOf(school.island, c.x, c.z).distance;
}
