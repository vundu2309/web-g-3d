/**
 * The shape of an island, pure maths with no Babylon: the land's height and its coastline.
 * Shared by the island mesh (island-visual.ts), the sea's shore field (shore.ts: surf, depth
 * and colour of the water), the minimap and the fishing zones, so they never disagree.
 */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number, seed: number) {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x: number, y: number, seed: number) =>
  noise(x, y, seed) * 0.6 +
  noise(x * 2.1, y * 2.1, seed + 7) * 0.28 +
  noise(x * 4.3, y * 4.3, seed + 13) * 0.12;
export function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The land itself: a low green island (like Lý Sơn or Cô Tô) rather than a cone. Two or
 * three overlapping low hills along a ridge make a gently rounded top about a fifth of the
 * radius high; a sandy apron rises from the water a few metres in; the coast has bays and
 * headlands and always stays between 0.85 and 0.99 of the radius, inside the ring boats
 * collide with (`islandCollisionRadius`, 1.08), so no boat sails through land and the
 * piers off each island keep their place. Seeded and pure: every client gets the same.
 */
export interface IslandShape {
  /** The highest point of the land, in metres. */
  peak: number;
  /** Terrain height at island-local (x, z); the sea is at 0. */
  height(x: number, z: number): number;
  /** Distance from the centre to the waterline in the direction `angle` (radians). */
  coast(angle: number): number;
}

export const COAST_MIN = 0.85;
export const COAST_MAX = 0.99;

export function islandShape(seed: number, radius: number): IslandShape {
  const rng = random(seed ^ 0x51ed);
  // Bays and headlands: three slow harmonics round the coast and a faint crinkle.
  const harmonics = [
    { k: 2, amp: 0.03 },
    { k: 3, amp: 0.022 },
    { k: 5, amp: 0.012 },
  ].map((h) => ({ ...h, phase: rng() * Math.PI * 2 }));
  const coast = (angle: number) => {
    let f = 0.92;
    for (const { k, amp, phase } of harmonics)
      f += amp * Math.sin(k * angle + phase);
    f +=
      0.016 *
      (noise(Math.cos(angle) * 3 + 9, Math.sin(angle) * 3 + 9, seed + 21) -
        0.5);
    return radius * Math.min(COAST_MAX, Math.max(COAST_MIN, f));
  };
  // Two or three low hills along a ridge through the island.
  const ridge = rng() * Math.PI;
  const count = rng() < 0.6 ? 3 : 2;
  const along = count === 3 ? [-0.4, 0, 0.36] : [-0.26, 0.3];
  const hills = along.map((t) => {
    const a = (t + (rng() - 0.5) * 0.12) * radius;
    const b = (rng() - 0.5) * 0.16 * radius;
    return {
      x: Math.cos(ridge) * a - Math.sin(ridge) * b,
      z: Math.sin(ridge) * a + Math.cos(ridge) * b,
      h: 0.6 + rng() * 0.4,
      s2: 2 * (radius * (0.3 + rng() * 0.1)) ** 2,
    };
  });
  const peak = radius * (0.2 + rng() * 0.04);
  const base = 0.9;
  // Inland relief in relative units: the hills plus slow undulations.
  const relief = (x: number, z: number) => {
    let sum = 0.12 * fbm(x * 0.05 + 3, z * 0.05, seed);
    for (const hill of hills)
      sum +=
        hill.h * Math.exp(-((x - hill.x) ** 2 + (z - hill.z) ** 2) / hill.s2);
    return sum;
  };
  // The sand apron rises from the water and the hills fade in behind it.
  const parts = (x: number, z: number) => {
    const d = coast(Math.atan2(z, x)) - Math.hypot(x, z);
    const shore =
      d >= 0 ? 1.2 * (1 - Math.exp(-d / 2.6)) : -1.7 * (1 - Math.exp(d / 4.5));
    const inland = smooth(0.8, radius * 0.32, d);
    return { shore, inland, relief: inland > 0 ? relief(x, z) : 0 };
  };
  // Scale the relief so the highest point of the land is exactly `peak`.
  const samples: { a: number; b: number }[] = [];
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const p = parts(((i / 40) * 2 - 1) * radius, ((j / 40) * 2 - 1) * radius);
      samples.push({
        a: p.shore + p.inland * base,
        b: p.inland * p.relief,
      });
    }
  let low = 0;
  let high = peak * 4;
  for (let k = 0; k < 30; k++) {
    const mid = (low + high) / 2;
    if (samples.some(({ a, b }) => a + mid * b > peak)) high = mid;
    else low = mid;
  }
  const scale = low;
  const height = (x: number, z: number) => {
    const p = parts(x, z);
    return p.shore + p.inland * (base + scale * p.relief);
  };
  return { peak, height, coast };
}
