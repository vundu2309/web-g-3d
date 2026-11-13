import { DRY_SAND, random } from "./island-shape.ts";

/**
 * Where the Blender-made island props stand (public/models: palm-1..3, rock-1..3, hut; built by
 * tools/blender/props.py): pure maths with no Babylon, so it is tested headlessly and the game
 * and the preview harness place them identically. island-models.ts turns a layout into mesh
 * instances. Positions are island-local; the sea is at y = 0.
 *
 * Model frame (verified in a render of the right-handed scene): the GLB's Y is up and Blender's
 * +Y, the hut's door side, arrives as the model's local -Z. A Babylon yaw θ (rotation.y) turns
 * local (x, z) into (x cos θ + z sin θ, −x sin θ + z cos θ), so local −Z points at
 * (−sin θ, −cos θ).
 */
export interface Spot {
  /** Which of the three models (palm-N / rock-N, 0-based); always 0 for the hut. */
  variant: number;
  x: number;
  /** Where the model's LOWEST point goes: ground under it minus how deep it is buried. */
  y: number;
  z: number;
  /** Babylon rotation.y. */
  yaw: number;
  scale: number;
}

export interface HutSpot extends Spot {
  /** Direction the door faces (radians, atan2(z, x) of the outward direction). */
  angle: number;
}

/** A capsule nothing may stand in: the segment a-b widened by r (a circle when a = b). */
export interface KeepOut {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

export interface LayoutInput {
  seed: number;
  radius: number;
  peak: number;
  height(x: number, z: number): number;
  coast(angle: number): number;
  /** The boardwalk, the lighthouse, the rowboat and the market gangways. */
  keepOut: readonly KeepOut[];
}

export interface IslandLayout {
  palms: Spot[];
  rocks: Spot[];
  bushes: Spot[];
  hut?: HutSpot;
}

/** The yaw that turns the model's local −Z (the hut's door) toward (dx, dz). */
export const yawFacing = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** A model-local (x, z) offset turned by yaw (Babylon's rotation about Y). */
export const turn = (x: number, z: number, yaw: number) =>
  [
    x * Math.cos(yaw) + z * Math.sin(yaw),
    -x * Math.sin(yaw) + z * Math.cos(yaw),
  ] as const;

/**
 * The hut model in its own frame (metres; from tools/blender/props.py `hut`, checked against the
 * GLB by tests/props-models.test.mjs): four posts reaching POST_DEPTH below the origin, the
 * ladder at the door side standing on the origin's level, the roof's half extents.
 */
export const HUT = {
  posts: [
    [-1.58, -1.23],
    [1.58, -1.23],
    [-1.58, 1.23],
    [1.58, 1.23],
  ] as const,
  ladder: [0.45, -1.8] as const,
  postDepth: 0.8,
  /** Underside of the deck above the origin. */
  deck: 1.18,
  /** Half the roof's footprint, for keeping palms and rocks off it. */
  reach: 2.6,
};
/** Rough footprint radius of each rock model at scale 1 (m). */
export const ROCK_RADIUS = [1.25, 0.8, 1.8] as const;
/** How far beyond the island radius boats collide (model.ts islandCollisionRadius). */
const RING = 1.08;
/** Half the widest span of each bush model at scale 1 (m; checked against the GLBs by the tests). */
export const BUSH_RADIUS = [0.75, 0.96, 0.58] as const;

const slopeAt = (
  height: LayoutInput["height"],
  x: number,
  z: number,
  step = 0.6,
) =>
  Math.hypot(
    height(x + step, z) - height(x - step, z),
    height(x, z + step) - height(x, z - step),
  ) /
  (2 * step);

/** The lowest ground under a disc (centre and eight points on its rim). */
export function lowestUnder(
  height: LayoutInput["height"],
  x: number,
  z: number,
  r: number,
) {
  let low = height(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    low = Math.min(low, height(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return low;
}

/** How far (x, z) is outside a keep-out capsule (negative inside). */
export function clearance(k: KeepOut, x: number, z: number) {
  const vx = k.bx - k.ax;
  const vz = k.bz - k.az;
  const len2 = vx * vx + vz * vz;
  const t =
    len2 > 0
      ? Math.min(1, Math.max(0, ((x - k.ax) * vx + (z - k.az) * vz) / len2))
      : 0;
  return Math.hypot(x - (k.ax + vx * t), z - (k.az + vz * t)) - k.r;
}

const clearOf = (
  keepOut: readonly KeepOut[],
  x: number,
  z: number,
  r: number,
) => keepOut.every((k) => clearance(k, x, z) >= r);

/** Distance inland from the coast (negative out in the water). */
const inland = (input: LayoutInput, x: number, z: number) =>
  input.coast(Math.atan2(z, x)) - Math.hypot(x, z);

/**
 * The stilt hut: a fairly level spot behind the dry sand, its door turned out to sea
 * (away from the island's centre). The origin is set so every post reaches below the lowest
 * ground under it and the ladder stands on the ground at the door, and a spot is only taken if
 * the deck then clears all the ground under the floor.
 */
export function placeHut(input: LayoutInput): HutSpot | undefined {
  const { height } = input;
  let best: (HutSpot & { score: number }) | undefined;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const coast = input.coast(angle);
    for (let d = DRY_SAND + 2.5; d <= DRY_SAND + 9; d += 0.5) {
      const r = coast - d;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      if (!clearOf(input.keepOut, x, z, HUT.reach + 0.6)) continue;
      const yaw = yawFacing(Math.cos(angle), Math.sin(angle));
      const at = ([lx, lz]: readonly [number, number]) => {
        const [wx, wz] = turn(lx, lz, yaw);
        return height(x + wx, z + wz);
      };
      const posts = HUT.posts.map(at);
      const ladder = at(HUT.ladder);
      if (ladder < 0.5) continue;
      const origin = Math.min(
        Math.min(...posts) + HUT.postDepth - 0.05,
        ladder,
      );
      // Everything under the floor: the posts, the middle and the middle of each wall.
      const under = Math.max(
        ...posts,
        height(x, z),
        at([0, -1.2]),
        at([0, 1.2]),
        at([-1.5, 0]),
        at([1.5, 0]),
      );
      if (origin + HUT.deck < under + 0.1) continue;
      const spread = Math.max(...posts, ladder) - Math.min(...posts, ladder);
      const score = spread + 0.08 * Math.abs(d - (DRY_SAND + 4));
      if (!best || score < best.score)
        best = {
          variant: 0,
          x,
          y: origin - HUT.postDepth,
          z,
          yaw,
          scale: 1,
          angle,
          score,
        };
    }
  }
  if (!best) return undefined;
  const { variant, x, y, z, yaw, scale, angle } = best;
  return { variant, x, y, z, yaw, scale, angle };
}

/**
 * Coconut palms: 8 to 16 by the island's size, on the grass and along the sand's upper edge
 * behind the dry sand (never on the open beach: the ground under a trunk is at least 0.9 m
 * high), never in the water, on steep ground or on the boardwalk, hut, lighthouse or a gangway.
 * The trunk's base is sunk below the lowest ground round it so it never floats on a slope.
 */
export function placePalms(
  input: LayoutInput,
  rng: () => number,
  keepOut: readonly KeepOut[],
): Spot[] {
  const { height, radius, peak } = input;
  const count = Math.round(Math.min(16, Math.max(8, radius * 0.42)));
  const palms: Spot[] = [];
  for (let tries = 0; palms.length < count && tries < count * 80; tries++) {
    const angle = rng() * Math.PI * 2;
    const coast = input.coast(angle);
    // Most stand along the sand's edge, the rest up the slopes.
    const d =
      rng() < 0.6
        ? DRY_SAND - 1 + rng() * 6
        : DRY_SAND + 2 + rng() * Math.max(1, coast * 0.45);
    const r = coast - d;
    if (r < radius * 0.12) continue;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = height(x, z);
    if (y < 0.9 || y > peak * 0.85) continue;
    if (slopeAt(height, x, z) > 0.42) continue;
    if (!clearOf(keepOut, x, z, 1.6)) continue;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 3.2)) continue;
    const scale = 0.8 + rng() * 0.45;
    palms.push({
      variant: Math.floor(rng() * 3) % 3,
      x,
      y: lowestUnder(height, x, z, 0.4 * scale) - 0.18 * scale,
      z,
      yaw: rng() * Math.PI * 2,
      scale,
    });
  }
  return palms;
}

/**
 * Rocks in clusters on the beaches (anywhere on the sand, the low ones in the swash) and up the
 * slopes, a big one with smaller ones round it, plus a few standing in the shallows off the sand (always inside the ring boats collide with).
 * Each is sunk a little into the ground under it.
 */
export function placeRocks(
  input: LayoutInput,
  rng: () => number,
  keepOut: readonly KeepOut[],
  palms: readonly Spot[],
): Spot[] {
  const { height, radius } = input;
  const rocks: Spot[] = [];
  const ring = radius * RING - 0.4;
  const tryRock = (
    x: number,
    z: number,
    variant: number,
    scale: number,
    lowest: number,
  ) => {
    const size = ROCK_RADIUS[variant]! * scale;
    if (Math.hypot(x, z) + size > ring) return false;
    if (!clearOf(keepOut, x, z, size * 0.8 + 0.3)) return false;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < size * 0.8 + 0.5))
      return false;
    if (
      rocks.some(
        (o) =>
          Math.hypot(o.x - x, o.z - z) <
          (size + ROCK_RADIUS[o.variant]! * o.scale) * 0.55,
      )
    )
      return false;
    const ground = lowestUnder(height, x, z, size * 0.6);
    if (ground < lowest) return false;
    rocks.push({
      variant,
      x,
      // Sunk by about a fifth of its height, more on a slope (the lowest ground is used).
      y: ground - 0.2 * scale,
      z,
      yaw: rng() * Math.PI * 2,
      scale,
    });
    return true;
  };
  const clusters = Math.round(radius / 4.5);
  for (let c = 0, tries = 0; c < clusters && tries < clusters * 30; tries++) {
    const angle = rng() * Math.PI * 2;
    const coast = input.coast(angle);
    const beach = c % 5 < 3;
    const d = beach ? -0.8 + rng() * (DRY_SAND - 1) : 14 + rng() * coast * 0.35;
    const cx = Math.cos(angle) * (coast - d);
    const cz = Math.sin(angle) * (coast - d);
    if (!beach && slopeAt(height, cx, cz) > 0.6) continue;
    // The cluster's big rock; rock-3 is the widest, so it is never blown up as far.
    const lead = Math.floor(rng() * 3) % 3;
    const leadScale =
      lead === 2 ? 0.9 + rng() * 0.5 : 1.2 + rng() * (beach ? 1.0 : 0.6);
    if (!tryRock(cx, cz, lead, leadScale, -0.6)) continue;
    c++;
    const n = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const away = ROCK_RADIUS[lead]! * leadScale * (0.8 + rng() * 0.7);
      const variant = Math.floor(rng() * 3) % 3;
      tryRock(
        cx + Math.cos(a) * away,
        cz + Math.sin(a) * away,
        variant,
        variant === 2 ? 0.6 + rng() * 0.3 : 0.6 + rng() * 0.6,
        -0.8,
      );
    }
  }
  // A few in the shallows just off the sand, big enough to break the surface.
  const shallows = 2 + Math.floor(rng() * 3);
  for (let s = 0, tries = 0; s < shallows && tries < 60; tries++) {
    const angle = rng() * Math.PI * 2;
    const r = input.coast(angle) + 1 + rng() * 4;
    const variant = rng() < 0.5 ? 0 : 1;
    if (
      tryRock(
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        variant,
        1.4 + rng() * 0.8,
        -1.1,
      )
    )
      s++;
  }
  return rocks;
}

/**
 * Low leafy bushes on the grass and the sand's upper edge: 14 to 26 by the island's size, some in
 * clusters of two or three small ones and some single bigger ones. They keep 1.2 m from every
 * keep-out area, 1.5 m from a palm, off the rocks, about a metre from each other, on ground at
 * least 0.8 m high and no steeper than 0.5, and each is sunk 0.1 x scale into the lowest ground
 * under it. They draw from a random stream of their own, so adding them moves nothing else.
 */
export function placeBushes(
  input: LayoutInput,
  rng: () => number,
  keepOut: readonly KeepOut[],
  palms: readonly Spot[],
  rocks: readonly Spot[],
): Spot[] {
  const { height, radius } = input;
  const count = Math.round(Math.min(26, Math.max(14, radius * 0.6)));
  const bushes: Spot[] = [];
  const tryBush = (x: number, z: number, scale: number) => {
    const variant = Math.floor(rng() * 3) % 3;
    const size = BUSH_RADIUS[variant]! * scale;
    if (height(x, z) < 0.8 || slopeAt(height, x, z) > 0.5) return false;
    // Not at the very edge of the land: all the ground under it is above the waterline.
    if (lowestUnder(height, x, z, size * 0.7) < 0.15) return false;
    if (!clearOf(keepOut, x, z, 1.2)) return false;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5)) return false;
    if (
      rocks.some(
        (o) =>
          Math.hypot(o.x - x, o.z - z) <
          ROCK_RADIUS[o.variant]! * o.scale * 0.8 + size * 0.7,
      )
    )
      return false;
    if (
      bushes.some(
        (o) =>
          Math.hypot(o.x - x, o.z - z) <
          Math.max(1, 0.6 * (size + BUSH_RADIUS[o.variant]! * o.scale)),
      )
    )
      return false;
    bushes.push({
      variant,
      x,
      y: lowestUnder(height, x, z, size * 0.6) - 0.1 * scale,
      z,
      yaw: rng() * Math.PI * 2,
      scale,
    });
    return true;
  };
  for (let tries = 0; bushes.length < count && tries < count * 60; tries++) {
    const angle = rng() * Math.PI * 2;
    const coast = input.coast(angle);
    // Most along the sand's edge and the lower grass, the rest further up the slopes.
    const d =
      rng() < 0.6
        ? DRY_SAND - 3 + rng() * 8
        : 12 + rng() * Math.max(1, coast * 0.45);
    const r = coast - d;
    if (r < radius * 0.1) continue;
    const cx = Math.cos(angle) * r;
    const cz = Math.sin(angle) * r;
    if (rng() < 0.45) {
      // A cluster of two or three small ones.
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n && bushes.length < count; i++) {
        const a = rng() * Math.PI * 2;
        const away = i === 0 ? 0 : 0.8 + rng() * 0.7;
        tryBush(
          cx + Math.cos(a) * away,
          cz + Math.sin(a) * away,
          0.8 + rng() * 0.35,
        );
      }
    } else tryBush(cx, cz, 1.1 + rng() * 0.5);
  }
  return bushes;
}

/**
 * The whole layout: the hut first, then palms round it, then rocks round both, then the bushes
 * (on a stream of their own). Seeded.
 */
export function layoutIsland(input: LayoutInput): IslandLayout {
  const rng = random(input.seed ^ 0x2f6b);
  const hut = placeHut(input);
  const keepOut: KeepOut[] = [...input.keepOut];
  if (hut)
    keepOut.push({ ax: hut.x, az: hut.z, bx: hut.x, bz: hut.z, r: HUT.reach });
  const palms = placePalms(input, rng, keepOut);
  const rocks = placeRocks(input, rng, keepOut, palms);
  const bushes = placeBushes(
    input,
    random(input.seed ^ 0x5b17),
    keepOut,
    palms,
    rocks,
  );
  return { palms, rocks, bushes, hut };
}

/** True where (x, z) is more than `margin` inland of the coast (for tests and callers). */
export const onLand = (input: LayoutInput, x: number, z: number, margin = 0) =>
  inland(input, x, z) > margin;
