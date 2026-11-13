import { islands } from "./model.ts";
import { BACKDROP } from "./sea-layout.ts";
import { islandShape, type IslandShape } from "./island-shape.ts";

/**
 * The shore field: where the sea meets each island's real, irregular coast. Pure maths (no
 * Babylon), shared by the water shader (surf, depth and colour), the swash on the beaches,
 * the minimap and the fishing zones, so they can never disagree with the land.
 *
 * Each island's coast is a closed curve r = coast(angle) around its centre (islandShape).
 * It is sampled once at start-up into a table of `COAST_SAMPLES` radii per island; the
 * distance to the coast is the radial gap to the curve, corrected by the curve's slant
 * (`(r − c) / √(1 + (c′/c)²)`), which is within centimetres of the true distance near the
 * beach (where the surf is) and within 2 % at 60 m for these gently curving coasts. The GPU gets the same table as a small texture
 * (`coastPixels`), so the water and the island are built from one source.
 */

/** The seed of the play area's island `index` (its shape and props follow from it). */
export const islandSeed = (index: number) => 11 + index * 7;

export interface ShoreIsland {
  x: number;
  z: number;
  radius: number;
  seed: number;
}

/** Every island the sea meets: the three of the play area, then the far backdrop ones. */
export const SHORE_ISLANDS: readonly ShoreIsland[] = [
  ...islands.map((island, index) => ({
    x: island.x,
    z: island.z,
    radius: island.radius,
    seed: islandSeed(index),
  })),
  ...BACKDROP.map(({ x, z, radius, seed }) => ({ x, z, radius, seed })),
];

/** Angles sampled round each coast (about 0.4 m apart on the largest island). */
export const COAST_SAMPLES = 512;

const shapes = new Map<number, IslandShape>();
/** The shape of shore island `index` (built once, then cached). */
export function shoreShape(index: number): IslandShape {
  let shape = shapes.get(index);
  if (!shape) {
    const island = SHORE_ISLANDS[index]!;
    shape = islandShape(island.seed, island.radius);
    shapes.set(index, shape);
  }
  return shape;
}

/** The coast of `shape` as fractions of `radius`, at angles 2πk / samples. */
export function coastTable(
  shape: IslandShape,
  radius: number,
  samples = COAST_SAMPLES,
): Float32Array {
  const table = new Float32Array(samples);
  for (let k = 0; k < samples; k++)
    table[k] = shape.coast((k / samples) * Math.PI * 2) / radius;
  return table;
}

const tables = new Map<number, Float32Array>();
/** The coast table of shore island `index` (built once, then cached). */
export function shoreTable(index: number): Float32Array {
  let table = tables.get(index);
  if (!table) {
    table = coastTable(shoreShape(index), SHORE_ISLANDS[index]!.radius);
    tables.set(index, table);
  }
  return table;
}

/** The coast's radius (as a fraction) and its rate of change per radian at `angle`. */
export function coastAt(
  table: Float32Array,
  angle: number,
): { fraction: number; slope: number } {
  const n = table.length;
  let u = (angle / (Math.PI * 2)) % 1;
  if (u < 0) u += 1;
  u *= n;
  const i0 = Math.floor(u) % n;
  const i1 = (i0 + 1) % n;
  const w = u - Math.floor(u);
  const a = table[i0]!;
  const b = table[i1]!;
  return {
    fraction: a + (b - a) * w,
    slope: ((b - a) * n) / (Math.PI * 2),
  };
}

export interface ShorePoint {
  /** Metres from the coast: positive out at sea, negative on land. */
  distance: number;
  /** The nearest island (an index of SHORE_ISLANDS). */
  index: number;
  /** The coast's outward normal, toward the sea. */
  nx: number;
  nz: number;
}

/** Distance and outward normal from island `index`'s coast at world (x, z). */
export function shoreOf(index: number, x: number, z: number): ShorePoint {
  const island = SHORE_ISLANDS[index]!;
  const vx = x - island.x;
  const vz = z - island.z;
  const rho = Math.hypot(vx, vz);
  const { fraction, slope } = coastAt(shoreTable(index), Math.atan2(vz, vx));
  const c = fraction * island.radius;
  const slant = slope / fraction;
  const rx = rho > 1e-6 ? vx / rho : 1;
  const rz = rho > 1e-6 ? vz / rho : 0;
  // Radial minus slant times tangential (the tangent is the radial turned +90°).
  const nx = rx + slant * rz;
  const nz = rz - slant * rx;
  const length = Math.hypot(nx, nz);
  return {
    distance: (rho - c) / Math.sqrt(1 + slant * slant),
    index,
    nx: nx / length,
    nz: nz / length,
  };
}

/** The nearest coast among shore islands `from` to `to` (exclusive) at world (x, z). */
export function shoreField(
  x: number,
  z: number,
  from = 0,
  to = SHORE_ISLANDS.length,
): ShorePoint {
  let best: ShorePoint | undefined;
  for (let i = from; i < to; i++) {
    const point = shoreOf(i, x, z);
    if (!best || point.distance < best.distance) best = point;
  }
  return best!;
}

/** Metres from (x, z) to the nearest coast of the play area's islands (negative on land). */
export const coastDistance = (x: number, z: number) =>
  shoreField(x, z, 0, islands.length).distance;

/**
 * Depth of the sea floor (m) at `distance` metres off the coast: the island's own sandy
 * apron first (the same curve as islandShape below the waterline, −1.7 (1 − e^(−d/4.5))),
 * then a sand shelf to about 16 m at 45 m out and the open sea floor beyond (about 46 m).
 */
export function seabedDepth(distance: number): number {
  const d = Math.max(0, distance);
  const shelf = (a: number, b: number) => {
    const t = Math.min(1, Math.max(0, (d - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return (
    1.7 * (1 - Math.exp(-d / 4.5)) + 14 * shelf(5, 45) + 30 * shelf(40, 160)
  );
}

// ----- Surf timing -----

/** Seconds between two breakers reaching the beach. */
export const SURF_PERIOD = 5;
/**
 * A breaker's travel time to the beach from `d` metres out is SURF_TRAVEL √d: waves slow
 * down in shallow water (c = √(g h) with h growing with d), so the lines bunch up near the
 * sand, about 1.6, 6, 14, 25 and 39 m out at one moment.
 */
export const SURF_TRAVEL = 4;

/**
 * The surf's phase `d` metres off the coast at time `t` (in cycles; a crest wherever it is
 * a whole number). Crests move toward the beach as time goes on; `jitter` (cycles) is a slow
 * along-shore variation so the lines are never perfect rings.
 */
export const surfPhase = (d: number, t: number, jitter = 0) =>
  (t + SURF_TRAVEL * Math.sqrt(Math.max(d, 0))) / SURF_PERIOD + jitter;

/** The part of a swash cycle spent rushing up the beach; the rest is the slower backwash. */
export const UPRUSH = 0.27;
/**
 * How far up the beach (m inland from the still-water coast) the swash's front is at the
 * fraction `f` (0 to 1) of a cycle that runs up to `reach`: a quick rush up, then a slower
 * slide back that ends just below the waterline, where the next breaker arrives.
 */
export function swashFront(f: number, reach: number): number {
  const low = -0.6;
  const shape =
    f < UPRUSH
      ? Math.sin((f / UPRUSH) * (Math.PI / 2))
      : Math.cos(((f - UPRUSH) / (1 - UPRUSH)) * (Math.PI / 2)) ** 1.4;
  return low + (reach - low) * shape;
}

// ----- The same in GLSL -----

/** Rows of the coast texture: one per island, padded to a power of two. */
export const coastRows = () => {
  let rows = 1;
  while (rows < SHORE_ISLANDS.length) rows *= 2;
  return rows;
};
/** A coast fraction is stored as 16 bits over this range (about 0.1 mm per step on a 39 m island). */
const CODE_LOW = 0.75;
const CODE_SPAN = 0.3;
export const encodeCoast = (fraction: number) =>
  Math.round(
    Math.min(1, Math.max(0, (fraction - CODE_LOW) / CODE_SPAN)) * 65535,
  );
export const decodeCoast = (hi: number, lo: number) =>
  ((hi * 256 + lo) / 65535) * CODE_SPAN + CODE_LOW;

/** The coast texture: COAST_SAMPLES wide, one row per island, R and G the 16-bit fraction. */
export function coastPixels(): Uint8Array {
  const rows = coastRows();
  const pixels = new Uint8Array(COAST_SAMPLES * rows * 4);
  SHORE_ISLANDS.forEach((_, row) => {
    const table = shoreTable(row);
    for (let k = 0; k < COAST_SAMPLES; k++) {
      const code = encodeCoast(table[k]!);
      const at = (row * COAST_SAMPLES + k) * 4;
      pixels[at] = code >> 8;
      pixels[at + 1] = code & 255;
      pixels[at + 3] = 255;
    }
  });
  return pixels;
}

/** The islands for the shader: x, z, radius and the texture row's v coordinate. */
export const shoreUniform = () =>
  SHORE_ISLANDS.flatMap((island, row) => [
    island.x,
    island.z,
    island.radius,
    (row + 0.5) / coastRows(),
  ]);

const f = (value: number) => value.toFixed(6);
/**
 * GLSL for the shore: `shoreField(p)` = (distance, outward normal) to the nearest coast,
 * `seabedDepth(d)`, `surfPhase(d, jitter)`, `swashFront(f, reach)` and a small value noise
 * of its own (`shoreNoise`). Needs `uniform float time;`; with `withField`, it declares the
 * `shoreIslands` uniform and the `coastMap` sampler as well.
 */
export function glslShore(withField: boolean): string {
  const count = SHORE_ISLANDS.length;
  const field = withField
    ? `
uniform vec4 shoreIslands[${count}];
uniform sampler2D coastMap;
float coastFraction(float k, float row) {
  vec4 c = texture2D(coastMap, vec2((mod(k, ${f(COAST_SAMPLES)}) + 0.5) / ${f(COAST_SAMPLES)}, row));
  return (c.r * 255.0 * 256.0 + c.g * 255.0) / 65535.0 * ${f(CODE_SPAN)} + ${f(CODE_LOW)};
}
// x: metres from the nearest coast (negative on land), yz: the coast's outward normal.
vec3 shoreField(vec2 p) {
  vec3 best = vec3(1.0e4, 1.0, 0.0);
  for (int i = 0; i < ${count}; i++) {
    vec4 island = shoreIslands[i];
    vec2 v = p - island.xy;
    float rho = max(length(v), 1.0e-3);
    vec2 radial = v / rho;
    // Far away, the coast's wobble does not matter: measure from its mean radius.
    float far = rho - island.z * 0.92;
    if (far > 160.0) {
      if (far < best.x) best = vec3(far, radial);
      continue;
    }
    float u = fract(atan(v.y, v.x) / 6.2831853) * ${f(COAST_SAMPLES)};
    float k = floor(u);
    float a = coastFraction(k, island.w);
    float b = coastFraction(k + 1.0, island.w);
    float fraction = mix(a, b, u - k);
    float slant = (b - a) * ${f(COAST_SAMPLES / (Math.PI * 2))} / fraction;
    float d = (rho - fraction * island.z) / sqrt(1.0 + slant * slant);
    if (d < best.x) best = vec3(d, normalize(radial + slant * vec2(radial.y, -radial.x)));
  }
  return best;
}`
    : "";
  return `
const float SURF_PERIOD = ${f(SURF_PERIOD)};
const float SURF_TRAVEL = ${f(SURF_TRAVEL)};
const float UPRUSH = ${f(UPRUSH)};
float shoreHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float shoreNoise(vec2 p) {
  vec2 i = floor(p), g = fract(p);
  g = g * g * (3.0 - 2.0 * g);
  return mix(mix(shoreHash(i), shoreHash(i + vec2(1.0, 0.0)), g.x), mix(shoreHash(i + vec2(0.0, 1.0)), shoreHash(i + vec2(1.0, 1.0)), g.x), g.y);
}
float seabedDepth(float distance) {
  float d = max(distance, 0.0);
  return 1.7 * (1.0 - exp(-d / 4.5)) + 14.0 * smoothstep(5.0, 45.0, d) + 30.0 * smoothstep(40.0, 160.0, d);
}
float surfPhase(float d, float jitter) {
  return (time + SURF_TRAVEL * sqrt(max(d, 0.0))) / SURF_PERIOD + jitter;
}
// The slow along-shore variation of the surf at p (cycles): lines arrive a little early
// here and late there, so no break line is a perfect ring. Shared by the sea and the swash.
float surfJitter(vec2 p) {
  return shoreNoise(p * 0.021 + 7.3) * 0.55 + shoreNoise(p * 0.067 - 2.1) * 0.22;
}
float swashFront(float f, float reach) {
  float low = -0.6;
  float s = f < UPRUSH
    ? sin(f / UPRUSH * 1.5707963)
    : pow(max(cos((f - UPRUSH) / (1.0 - UPRUSH) * 1.5707963), 0.0), 1.4);
  return low + (reach - low) * s;
}
${field}
`;
}
