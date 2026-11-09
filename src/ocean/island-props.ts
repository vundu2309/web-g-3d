import { Geo, rgbOf, shade, type Rgb } from "./geo.ts";
import { PAL } from "./art/colors.ts";

/**
 * The small things that make an island look lived in: grass, flowers, shells, driftwood,
 * boulders at the shore, bushes and broadleaf trees, a wooden boardwalk with a lantern, a
 * stilted hut and a rowboat on the sand. Everything is written into one Geo buffer, so it
 * is one mesh (merged with the terrain by island-visual.ts). Seeded: every client builds
 * the same island. Positions are island-local; the sea is at y = 0.
 */
export interface PropContext {
  geo: Geo;
  rng: () => number;
  height: (x: number, z: number) => number;
  radius: number;
  peak: number;
}

export interface PropSummary {
  grass: number;
  flowers: number;
  shells: number;
  driftwood: number;
  boulders: number;
  bushes: number;
  trees: number;
  boardwalk: boolean;
  hut: boolean;
  boat: boolean;
}

const pick = <T>(rng: () => number, list: readonly T[]) =>
  list[Math.floor(rng() * list.length) % list.length]!;
const slopeAt = (ctx: PropContext, x: number, z: number) =>
  Math.hypot(
    ctx.height(x + 0.8, z) - ctx.height(x - 0.8, z),
    ctx.height(x, z + 0.8) - ctx.height(x, z - 0.8),
  ) / 1.6;

/** Random points on the island whose height and slope pass `accept`. */
function scatter(
  ctx: PropContext,
  count: number,
  from: number,
  to: number,
  accept: (y: number, slope: number) => boolean,
) {
  const points: { x: number; y: number; z: number }[] = [];
  for (let tries = 0; points.length < count && tries < count * 14; tries++) {
    const angle = ctx.rng() * Math.PI * 2;
    const distance = ctx.radius * (from + ctx.rng() * (to - from));
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const y = ctx.height(x, z);
    if (accept(y, slopeAt(ctx, x, z))) points.push({ x, y, z });
  }
  return points;
}

const GRASS: readonly Rgb[] = PAL.plants.blades.map(rgbOf);
const FLOWERS: readonly Rgb[] = PAL.plants.flowers.map(rgbOf);
const SHELLS: readonly Rgb[] = PAL.plants.shells.map(rgbOf);
const WOOD: readonly Rgb[] = [PAL.wood.mid, PAL.wood.light, PAL.wood.dark].map(
  rgbOf,
);
const LEAVES: readonly Rgb[] = PAL.plants.leaves.map(rgbOf);

export function addGrass(ctx: PropContext, count: number) {
  const spots = scatter(
    ctx,
    count,
    0.15,
    0.95,
    (y, s) => y > 0.9 && y < ctx.peak * 0.85 && s < 1.2,
  );
  for (const { x, y, z } of spots) {
    const color = pick(ctx.rng, GRASS);
    const blades = 3 + (ctx.rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < blades; i++) {
      const a = ctx.rng() * Math.PI * 2;
      ctx.geo.blade(
        x + Math.cos(a) * 0.12,
        y - 0.05,
        z + Math.sin(a) * 0.12,
        0.35 + ctx.rng() * 0.4,
        0.07,
        ctx.rng() * Math.PI,
        0.12 + ctx.rng() * 0.18,
        shade(color, (ctx.rng() - 0.5) * 0.1),
      );
    }
  }
  return spots.length;
}

export function addFlowers(ctx: PropContext, count: number) {
  const spots = scatter(
    ctx,
    count,
    0.2,
    0.85,
    (y, s) => y > 1 && y < ctx.peak * 0.6 && s < 0.9,
  );
  for (const { x, y, z } of spots) {
    const petal = pick(ctx.rng, FLOWERS);
    const top = y + 0.32;
    ctx.geo.blade(x, y - 0.05, z, 0.3, 0.025, ctx.rng() * 3, 0, GRASS[1]!);
    // A little four-sided bloom.
    const r = 0.1;
    ctx.geo.tri(
      [x - r, top, z],
      [x + r, top, z],
      [x, top + 0.07, z + r],
      petal,
    );
    ctx.geo.tri(
      [x - r, top, z],
      [x + r, top, z],
      [x, top + 0.07, z - r],
      petal,
    );
    ctx.geo.tri(
      [x, top, z - r],
      [x, top, z + r],
      [x + r, top + 0.07, z],
      shade(petal, -0.05),
    );
    ctx.geo.tri(
      [x, top, z - r],
      [x, top, z + r],
      [x - r, top + 0.07, z],
      shade(petal, -0.05),
    );
  }
  return spots.length;
}

export function addShells(ctx: PropContext, count: number) {
  const spots = scatter(ctx, count, 0.7, 1.02, (y) => y > 0.18 && y < 0.9);
  for (const { x, y, z } of spots) {
    if (ctx.rng() < 0.3) {
      // A starfish.
      const color = rgbOf(PAL.plants.berries[ctx.rng() < 0.5 ? 0 : 1]!);
      const turn = ctx.rng() * 6;
      for (let i = 0; i < 5; i++) {
        const a = turn + (i / 5) * Math.PI * 2;
        const b = turn + ((i + 0.5) / 5) * Math.PI * 2;
        const c = turn + ((i + 1) / 5) * Math.PI * 2;
        ctx.geo.tri(
          [x + Math.cos(b) * 0.07, y + 0.04, z + Math.sin(b) * 0.07],
          [x + Math.cos(a) * 0.2, y + 0.03, z + Math.sin(a) * 0.2],
          [x + Math.cos(c) * 0.2, y + 0.03, z + Math.sin(c) * 0.2],
          color,
        );
      }
    } else
      ctx.geo.cone(
        x,
        y,
        z,
        0.09 + ctx.rng() * 0.05,
        0.07,
        6,
        pick(ctx.rng, SHELLS),
        ctx.rng() * 3,
      );
  }
  return spots.length;
}

export function addDriftwood(ctx: PropContext, count: number) {
  const spots = scatter(ctx, count, 0.75, 1.0, (y) => y > 0.25 && y < 0.9);
  for (const { x, y, z } of spots) {
    const yaw = ctx.rng() * Math.PI;
    const length = 0.7 + ctx.rng() * 1.1;
    const color = shade(pick(ctx.rng, WOOD), 0.12);
    ctx.geo.box(x, y + 0.07, z, length, 0.08, 0.1, color, yaw);
    if (ctx.rng() < 0.6)
      ctx.geo.box(
        x + Math.cos(yaw) * length * 0.4,
        y + 0.15,
        z + Math.sin(yaw) * length * 0.4,
        0.3,
        0.05,
        0.05,
        color,
        yaw + 0.7,
      );
  }
  return spots.length;
}

/** An irregular angular boulder: two rings of six points and two apexes. */
function boulder(
  ctx: PropContext,
  x: number,
  y: number,
  z: number,
  size: number,
) {
  const grey = shade(rgbOf(PAL.stone.rock), (ctx.rng() - 0.5) * 0.1);
  const moss = rgbOf(PAL.stone.moss);
  const jitter = () => 0.78 + ctx.rng() * 0.44;
  const top: [number, number, number] = [x, y + size * 0.8 * jitter(), z];
  const bottom: [number, number, number] = [x, y - size * 0.1, z];
  const ringAt = (turn: number, h: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = turn + (i / 6) * Math.PI * 2;
      const k = r * jitter();
      return [x + Math.cos(a) * k, y + h * jitter(), z + Math.sin(a) * k] as [
        number,
        number,
        number,
      ];
    });
  const turn = ctx.rng() * 3;
  const upper = ringAt(turn, size * 0.5, size * 0.6);
  const lower = ringAt(turn + Math.PI / 6, size * 0.1, size * 0.9);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    ctx.geo.tri(
      top,
      upper[j]!,
      upper[i]!,
      ctx.rng() < 0.55 ? moss : shade(grey, 0.06),
    );
    ctx.geo.tri(upper[i]!, upper[j]!, lower[i]!, grey);
    ctx.geo.tri(upper[j]!, lower[j]!, lower[i]!, shade(grey, -0.05));
    ctx.geo.tri(lower[i]!, lower[j]!, bottom, shade(grey, -0.1));
  }
}

/** Clusters of boulders along the shore, some standing in the shallows. */
export function addBoulders(ctx: PropContext, clusters: number) {
  let total = 0;
  for (let c = 0; c < clusters; c++) {
    const angle = ctx.rng() * Math.PI * 2;
    const distance = ctx.radius * (0.9 + ctx.rng() * 0.13);
    const cx = Math.cos(angle) * distance;
    const cz = Math.sin(angle) * distance;
    const n = 3 + Math.floor(ctx.rng() * 3);
    for (let i = 0; i < n; i++) {
      const x = cx + (ctx.rng() - 0.5) * 3.4;
      const z = cz + (ctx.rng() - 0.5) * 3.4;
      const size = 0.45 + ctx.rng() * (i === 0 ? 1.5 : 0.8);
      boulder(ctx, x, Math.max(ctx.height(x, z), -0.25), z, size);
      total++;
    }
  }
  return total;
}

export function addBushes(ctx: PropContext, count: number) {
  const spots = scatter(
    ctx,
    count,
    0.15,
    0.8,
    (y, s) => y > 1.1 && y < ctx.peak * 0.75 && s < 1.1,
  );
  for (const { x, y, z } of spots) {
    const color = pick(ctx.rng, LEAVES);
    const r = 0.55 + ctx.rng() * 0.5;
    ctx.geo.cone(
      x,
      y - 0.1,
      z,
      r,
      0.55 * (0.8 + r),
      6,
      color,
      ctx.rng() * 3,
      r * 0.45,
    );
    if (ctx.rng() < 0.5)
      ctx.geo.cone(
        x + r * 0.5,
        y - 0.1,
        z - r * 0.3,
        r * 0.6,
        0.5,
        5,
        shade(color, 0.05),
        ctx.rng() * 3,
        r * 0.25,
      );
  }
  return spots.length;
}

/** Broadleaf trees: a short trunk and two layers of flat crown. */
export function addTrees(ctx: PropContext, count: number) {
  const spots = scatter(
    ctx,
    count,
    0.3,
    0.8,
    (y, s) => y > 1.3 && y < ctx.peak * 0.65 && s < 0.9,
  );
  for (const { x, y, z } of spots) {
    const trunk = 1.5 + ctx.rng() * 1.1;
    const color = pick(ctx.rng, LEAVES);
    ctx.geo.box(
      x,
      y + trunk / 2 - 0.1,
      z,
      0.17,
      trunk / 2,
      0.17,
      shade(pick(ctx.rng, WOOD), -0.04),
      ctx.rng() * 3,
    );
    const r = 1.4 + ctx.rng() * 0.9;
    ctx.geo.cone(
      x,
      y + trunk - 0.2,
      z,
      r,
      1.0,
      7,
      color,
      ctx.rng() * 3,
      r * 0.55,
    );
    ctx.geo.cone(
      x + 0.1,
      y + trunk + 0.7,
      z,
      r * 0.65,
      0.9,
      7,
      shade(color, 0.06),
      ctx.rng() * 3,
      r * 0.3,
    );
  }
  return spots.length;
}

export interface Structure {
  x: number;
  z: number;
  angle: number;
}

/**
 * A wooden boardwalk with rails that runs down the slope to the beach and ends at a
 * lantern post. It follows the ground and stops inside the ring boats cannot enter (a
 * pier into open water would be sailed through), so it is a way down to the sand.
 */
export function addBoardwalk(ctx: PropContext): Structure | undefined {
  const end = ctx.radius * 1.06;
  let best: { angle: number; start: number; score: number } | undefined;
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const at = (r: number) =>
      ctx.height(Math.cos(angle) * r, Math.sin(angle) * r);
    // From the slope (about three metres up) down to the sand.
    let start = -1;
    for (let r = ctx.radius * 0.5; r < end; r += ctx.radius * 0.02)
      if (at(r) < 3) {
        start = r;
        break;
      }
    if (start < 0) continue;
    const length = end - start;
    if (length < 3 || at(end) > 0.3) continue;
    // Gentle enough to walk, and long enough to be worth drawing.
    const steep = Math.abs(at(start) - at(end)) / length;
    if (steep > 0.9) continue;
    const score = steep * 3 + Math.abs(length - 6);
    if (!best || score < best.score) best = { angle, start, score };
  }
  if (!best) return undefined;
  const { angle, start } = best;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const length = end - start;
  const ground = (r: number) => ctx.height(dx * r, dz * r);
  const deckAt = (r: number) => Math.max(ground(r), 0.2) + 0.28;
  const wood = (shift: number) => shade(pick(ctx.rng, WOOD), shift);
  for (let d = 0; d < length; d += 0.46) {
    const r = start + d + 0.23;
    ctx.geo.box(
      dx * r,
      deckAt(r),
      dz * r,
      0.22,
      0.05,
      0.85,
      wood(0.05 + (ctx.rng() - 0.5) * 0.06),
      angle,
    );
  }
  for (const side of [-1, 1]) {
    const nx = -dz * 0.8 * side;
    const nz = dx * 0.8 * side;
    for (let d = 0.2; d < length; d += 1.4) {
      const r = start + d;
      const top = deckAt(r);
      // A post from the ground up past the deck, and a rail between the posts.
      ctx.geo.box(
        dx * r + nx,
        (top + ground(r) - 0.3) / 2 + 0.3,
        dz * r + nz,
        0.07,
        (top - ground(r) + 0.6) / 2 + 0.3,
        0.07,
        wood(-0.1),
        angle,
      );
      const r2 = Math.min(end, r + 1.4);
      ctx.geo.box(
        (dx * (r + r2)) / 2 + nx,
        (deckAt(r) + deckAt(r2)) / 2 + 0.75,
        (dz * (r + r2)) / 2 + nz,
        (r2 - r) / 2,
        0.04,
        0.04,
        wood(0.02),
        angle,
      );
    }
  }
  // The lantern post at the end.
  const lx = dx * (end - 0.1) - dz * 0.8;
  const lz = dz * (end - 0.1) + dx * 0.8;
  const base = deckAt(end);
  ctx.geo.box(lx, base + 0.9, lz, 0.06, 0.9, 0.06, wood(-0.1), angle);
  ctx.geo.box(
    lx,
    base + 1.9,
    lz,
    0.14,
    0.14,
    0.14,
    rgbOf(PAL.light.lamp),
    angle,
  );
  ctx.geo.cone(lx, base + 2.02, lz, 0.22, 0.2, 4, rgbOf(PAL.metal.steel), 0.78);
  return { x: dx * end, z: dz * end, angle };
}

/** A stilted hut on a flat spot of the hill, its door to the sea. */
export function addHut(ctx: PropContext): Structure | undefined {
  let site: { x: number; y: number; z: number; slope: number } | undefined;
  for (const { x, y, z } of scatter(
    ctx,
    60,
    0.3,
    0.62,
    (y) => y > 1.4 && y < 3.4,
  )) {
    const slope = slopeAt(ctx, x, z);
    if (!site || slope < site.slope) site = { x, y, z, slope };
  }
  if (!site || site.slope > 0.7) return undefined;
  const { x, z } = site;
  const base = Math.max(
    ctx.height(x, z),
    ctx.height(x + 1.4, z),
    ctx.height(x - 1.4, z),
    ctx.height(x, z + 1.2),
    ctx.height(x, z - 1.2),
  );
  const angle = Math.atan2(z, x);
  const forward = (d: number, side = 0) =>
    [
      x + Math.cos(angle) * d - Math.sin(angle) * side,
      z + Math.sin(angle) * d + Math.cos(angle) * side,
    ] as const;
  const floor = base + 0.5;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const [px, pz] = forward(sx * 1.2, sz * 0.95);
      ctx.geo.box(
        px,
        floor - 0.6,
        pz,
        0.1,
        0.7,
        0.1,
        rgbOf(PAL.wood.dark),
        angle,
      );
    }
  ctx.geo.box(x, floor, z, 1.5, 0.08, 1.2, rgbOf(PAL.wood.light), angle);
  ctx.geo.box(x, floor + 0.95, z, 1.3, 0.85, 1.0, rgbOf(PAL.hut.wall), angle);
  const [doorX, doorZ] = forward(1.31);
  ctx.geo.box(
    doorX,
    floor + 0.7,
    doorZ,
    0.03,
    0.55,
    0.28,
    rgbOf(PAL.wood.deep),
    angle,
  );
  const [winX, winZ] = forward(1.31, 0.72);
  ctx.geo.box(
    winX,
    floor + 1.05,
    winZ,
    0.03,
    0.22,
    0.22,
    rgbOf(PAL.hut.glass),
    angle,
  );
  ctx.geo.cone(
    x,
    floor + 1.78,
    z,
    2.0,
    1.05,
    4,
    rgbOf(PAL.paint.redDeep),
    Math.PI / 4 + angle,
    0.08,
  );
  const [chX, chZ] = forward(-0.5, 0.4);
  ctx.geo.box(
    chX,
    floor + 2.6,
    chZ,
    0.16,
    0.35,
    0.16,
    rgbOf(PAL.stone.rock),
    angle,
  );
  // Steps down to the ground.
  const [stX, stZ] = forward(1.75);
  ctx.geo.box(
    stX,
    floor - 0.2,
    stZ,
    0.3,
    0.06,
    0.4,
    rgbOf(PAL.wood.light),
    angle,
  );
  return { x, z, angle };
}

/** A little wooden skiff pulled up on the sand. */
export function addRowboat(ctx: PropContext, near?: Structure): boolean {
  const baseAngle = near ? near.angle + 0.34 : ctx.rng() * Math.PI * 2;
  for (let tries = 0; tries < 24; tries++) {
    const angle =
      baseAngle + (tries % 2 ? 1 : -1) * Math.floor(tries / 2) * 0.1;
    const r = ctx.radius * (0.84 + 0.04 * (tries % 3));
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = ctx.height(x, z);
    if (y < 0.25 || y > 0.95) continue;
    const yaw = angle + 0.5;
    const hull = rgbOf(PAL.hut.rowboat);
    const trim = rgbOf(PAL.paint.creamWarm);
    ctx.geo.box(x, y + 0.14, z, 1.25, 0.07, 0.46, shade(hull, -0.05), yaw);
    for (const side of [-1, 1]) {
      const sx = x - Math.sin(yaw) * 0.5 * side;
      const sz = z + Math.cos(yaw) * 0.5 * side;
      ctx.geo.box(sx, y + 0.34, sz, 1.25, 0.2, 0.05, hull, yaw);
      ctx.geo.box(sx, y + 0.56, sz, 1.27, 0.03, 0.07, trim, yaw);
    }
    for (const t of [-0.4, 0.4]) {
      ctx.geo.box(
        x + Math.cos(yaw) * t,
        y + 0.38,
        z + Math.sin(yaw) * t,
        0.07,
        0.03,
        0.46,
        rgbOf(PAL.wood.light),
        yaw,
      );
    }
    // The bow, a small wedge.
    ctx.geo.cone(
      x + Math.cos(yaw) * 1.25,
      y + 0.14,
      z + Math.sin(yaw) * 1.25,
      0.4,
      0.34,
      4,
      hull,
      yaw + Math.PI / 4,
      0.05,
    );
    return true;
  }
  return false;
}
