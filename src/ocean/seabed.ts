import { PAL } from "./art/colors.ts";
import { drawnBed, noise, fbm, random } from "./island-shape.ts";
import { coastDistance, seabedDepth } from "./shore.ts";
import { SEA_BOUND } from "./model.ts";

/**
 * The sea floor as real geometry (pure part, no Babylon: the rules and the data, so tests can
 * read them; `seabed-visual.ts` makes the meshes). It covers the whole sea, from every beach
 * out to the sea's edge, on one profile: the island's own shelf at the sand, then a long gentle
 * slope (shore.ts `seabedDepth`: under 0.11 of rise to the metre anywhere, a bit over 6
 * degrees) down to the deep floor about 40 m down, 500 m from the coast. The same profile is
 * what the water's shader paints, so the real floor and the painted one meet.
 *
 * On the profile lie the relief and what grows on it: low dunes and long swells, silt in the
 * hollows, rocky outcrops, weed, coral heads and tufts of seagrass. The floor never reaches the
 * surface past the beach (`SEABED_CEILING`): a boat's keel and the troughs of the waves stay
 * clear of it, so it is something to look at, not to run aground on.
 *
 * The sea is cut into square tiles (one mesh each, so the clear-water layer can leave out those
 * that are far from the camera). A tile's grid is as fine as it needs to be for how near a coast
 * it lies (6.4 m cells within 60 m of one, 12.8 m to 200 m, 25.6 m to 420 m) and the stretches of deep
 * floor farther from every coast are one coarse mesh of 64 m cells. The edge of a tile hangs a
 * skirt down, so where two grids of different fineness meet there is no crack to see through.
 */
/** Metres from the coast where the sand starts being built. */
export const SEABED_FROM = 1.5;
/** A tile is this many metres across; the tiles cover the sea out to its bound. */
export const TILE = 128;
export const TILES = Math.ceil(SEA_BOUND / TILE) * 2;
/** Coarse cells (m), and the longest distance from a coast (m) a tile gets a finer grid. */
export const COARSE = 64;
export const DETAIL = [
  { within: 60, cells: 20 },
  { within: 200, cells: 10 },
  { within: 420, cells: 5 },
] as const;
/** How far the skirt of a tile hangs (m). */
export const SKIRT = 4;
/** The floor is never higher than this below the still sea (m), once off the beach. */
export const SEABED_CEILING = -0.5;
/** Coral, weed and rock stand only on tiles within this distance of a coast (m). */
export const PROPS_WITHIN = 90;
/** The seed of the floor's noise: world coordinates, so every tile and island agree. */
const SEED = 4242;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** What is on the floor at a place, as the weights of the kinds (0 to 1). */
export interface SeabedKind {
  /** Bare rock. */
  rock: number;
  /** Weed (a darker, greener floor with tufts). */
  weed: number;
  /** Silt (a duller sand in the hollows). */
  silt: number;
}

/** The floor's relief and its kind at world (x, z), `d` metres off the nearest coast. */
function floorAt(x: number, z: number, d: number) {
  const base = drawnBed(-seabedDepth(d));
  const depth = -base;
  // No relief on the beach itself (the terrain's own beach is there); it grows over 10 m.
  const grow = smooth(2, 12, d) * smooth(0.7, 3, depth);
  // Features are as wide as the grid under them can show (the grid is 6 to 26 m): dunes and
  // patches tens of metres across, and they fade out with depth, where the grid is coarsest.
  const shallow = 1 - smooth(6, 14, depth);
  const dunes =
    (fbm(x * 0.022 + 10, z * 0.022 - 7, SEED) - 0.5) * 1.3 * shallow;
  // Long swells of the floor, felt only farther out where the water is deep.
  const swell =
    (fbm(x * 0.009 - 4, z * 0.009 + 13, SEED + 6) - 0.5) *
    5 *
    smooth(30, 220, d);
  const rockNoise = noise(x * 0.024 + 55, z * 0.024 + 21, SEED + 1);
  const rock = smooth(0.58, 0.8, rockNoise) * shallow;
  const bump =
    rock * (0.5 + 0.9 * noise(x * 0.11 + 3, z * 0.11 - 9, SEED + 2)) * 1.4;
  const weedNoise = noise(x * 0.03 + 90, z * 0.03 + 40, SEED + 3);
  const silt =
    smooth(0.45, 0.8, noise(x * 0.02 - 30, z * 0.02 + 60, SEED + 4)) * shallow;
  // Weed grows where the light reaches and the floor is not rock.
  const weed =
    smooth(0.42, 0.72, weedNoise) *
    smooth(0.8, 1.6, depth) *
    (1 - smooth(6, 9, depth)) *
    (1 - rock);
  let y = base + (dunes * 0.8 + bump) * grow + swell;
  // Past the beach the floor stays well under the troughs of the waves.
  y = Math.min(y, Math.max(SEABED_CEILING, base));
  const kind: SeabedKind = { rock: rock * grow, weed, silt: silt * (1 - rock) };
  return { y, kind };
}

/** The height of the floor at world (x, z) (m, negative: below the still sea). */
export function seabedHeight(x: number, z: number): number {
  return floorAt(x, z, Math.max(0, coastDistance(x, z))).y;
}

/** The kind of floor at world (x, z). */
export function seabedKind(x: number, z: number): SeabedKind {
  return floorAt(x, z, Math.max(0, coastDistance(x, z))).kind;
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

/** The colour of the floor at a place (the water's absorption does the rest). */
export function seabedColour(kind: SeabedKind, depth: number, shade: number) {
  const sand = rgb(PAL.seabed.sand);
  const silt = rgb(PAL.seabed.silt);
  const weed = rgb(PAL.seabed.weed[1]!);
  const rock = rgb(PAL.stone.dark);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let c = mix(sand[i]!, silt[i]!, kind.silt * 0.8);
    c = mix(c, weed[i]!, kind.weed * 0.75);
    c = mix(c, rock[i]!, kind.rock);
    // A little lighter in the shallows, a little duller in the deep; `shade` is a grain of noise.
    out[i] = clamp(
      c * (1.08 - 0.12 * clamp(depth / 30)) * (0.94 + 0.12 * shade),
    );
  }
  return out;
}

export interface SeabedChunk {
  name: string;
  /** x, y, z per vertex, in world metres. */
  positions: number[];
  /** r, g, b, a per vertex. */
  colors: number[];
  indices: number[];
  /** Where the chunk is and how far it reaches (for its own culling). */
  centre: { x: number; z: number };
  radius: number;
  /** The square of the world the chunk's grid covers. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** What stands on the floor in the chunk (counts, for the tests). */
  props: { coral: number; weed: number; rock: number };
}

interface Parts {
  positions: number[];
  colors: number[];
  indices: number[];
}

/** A lumpy dome of seven sides standing on the floor: coral heads and rocks. */
function dome(
  out: Parts,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  colour: readonly [number, number, number],
  rng: () => number,
) {
  const sides = 7;
  const base = out.positions.length / 3;
  const rings = [
    { up: -0.15, wide: 1 },
    { up: 0.55, wide: 0.82 },
  ];
  for (const ring of rings)
    for (let s = 0; s < sides; s++) {
      const a = ((s + rng() * 0.4) / sides) * Math.PI * 2;
      const lump = 0.75 + rng() * 0.45;
      out.positions.push(
        cx + Math.cos(a) * rx * ring.wide * lump,
        cy + ry * ring.up,
        cz + Math.sin(a) * rz * ring.wide * lump,
      );
      const shade = 0.88 + 0.2 * rng();
      out.colors.push(
        clamp(colour[0] * shade),
        clamp(colour[1] * shade),
        clamp(colour[2] * shade),
        1,
      );
    }
  out.positions.push(
    cx + (rng() - 0.5) * rx * 0.3,
    cy + ry,
    cz + (rng() - 0.5) * rz * 0.3,
  );
  out.colors.push(
    clamp(colour[0] * 1.08),
    clamp(colour[1] * 1.08),
    clamp(colour[2] * 1.08),
    1,
  );
  const top = base + sides * 2;
  for (let s = 0; s < sides; s++) {
    const n = (s + 1) % sides;
    const a = base + s;
    const b = base + n;
    const c = base + sides + s;
    const d = base + sides + n;
    out.indices.push(a, c, b, b, c, d, c, top, d);
  }
}

/** A tuft of seagrass: a few thin blades leaning out. */
function tuft(
  out: Parts,
  cx: number,
  cy: number,
  cz: number,
  rng: () => number,
  room: number,
) {
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = rng() * Math.PI * 2;
    const lean = 0.15 + rng() * 0.3;
    const height = Math.min(0.45 + rng() * 0.6, room);
    const ox = cx + (rng() - 0.5) * 0.35;
    const oz = cz + (rng() - 0.5) * 0.35;
    const wide = 0.07 + rng() * 0.05;
    const tx = Math.cos(a + Math.PI / 2) * wide;
    const tz = Math.sin(a + Math.PI / 2) * wide;
    const colour = rgb(PAL.seabed.weed[b % PAL.seabed.weed.length]!);
    const at = out.positions.length / 3;
    out.positions.push(
      ox - tx,
      cy,
      oz - tz,
      ox + tx,
      cy,
      oz + tz,
      ox + Math.cos(a) * height * lean,
      cy + height,
      oz + Math.sin(a) * height * lean,
    );
    out.colors.push(
      ...colour,
      1,
      ...colour,
      1,
      clamp(colour[0] * 1.2),
      clamp(colour[1] * 1.2),
      clamp(colour[2] * 1.2),
      1,
    );
    out.indices.push(at, at + 1, at + 2);
  }
}

/** The grid of a square of the sea, `cells` each way, with a skirt round its edge. */
function grid(out: Parts, x0: number, z0: number, size: number, cells: number) {
  const row = cells + 1;
  const base = out.positions.length / 3;
  for (let j = 0; j <= cells; j++)
    for (let i = 0; i <= cells; i++) {
      const x = x0 + (i / cells) * size;
      const z = z0 + (j / cells) * size;
      const d = Math.max(0, coastDistance(x, z));
      const { y, kind } = floorAt(x, z, d);
      out.positions.push(x, y, z);
      const grain = noise(x * 0.9, z * 0.9, SEED + 5);
      out.colors.push(...seabedColour(kind, -y, grain), 1);
    }
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = base + j * row + i;
      const b = a + 1;
      const e = a + row;
      const f = e + 1;
      out.indices.push(a, e, b, b, e, f);
    }
  // The skirt: a copy of each edge vertex, and another hung SKIRT metres lower, joined by a
  // strip. The strip has vertices of its own, so its faces do not bend the floor's own normals.
  const edges: number[][] = [[], [], [], []];
  for (let k = 0; k <= cells; k++) {
    edges[0]!.push(base + k);
    edges[1]!.push(base + cells * row + k);
    edges[2]!.push(base + k * row);
    edges[3]!.push(base + k * row + cells);
  }
  for (const edge of edges) {
    const top = out.positions.length / 3;
    for (const drop of [0, SKIRT])
      for (const v of edge) {
        out.positions.push(
          out.positions[v * 3]!,
          out.positions[v * 3 + 1]! - drop,
          out.positions[v * 3 + 2]!,
        );
        out.colors.push(
          out.colors[v * 4]!,
          out.colors[v * 4 + 1]!,
          out.colors[v * 4 + 2]!,
          1,
        );
      }
    const low = top + edge.length;
    for (let k = 0; k < edge.length - 1; k++)
      out.indices.push(
        top + k,
        low + k,
        top + k + 1,
        top + k + 1,
        low + k,
        low + k + 1,
      );
  }
}

const centreOf = (out: Parts) => {
  let sx = 0;
  let sz = 0;
  const count = out.positions.length / 3;
  for (let i = 0; i < count; i++) {
    sx += out.positions[i * 3]!;
    sz += out.positions[i * 3 + 2]!;
  }
  const centre = { x: sx / count, z: sz / count };
  let radius = 0;
  for (let i = 0; i < count; i++)
    radius = Math.max(
      radius,
      Math.hypot(
        out.positions[i * 3]! - centre.x,
        out.positions[i * 3 + 2]! - centre.z,
      ),
    );
  return { centre, radius };
};

/** The finest grid a tile with this nearest coast distance needs (0: none, the coarse mesh covers it). */
export function tileCells(nearest: number): number {
  for (const level of DETAIL) if (nearest <= level.within) return level.cells;
  return 0;
}

/** Coral, weed and rock on the floor of a tile (seeded by the tile, so every client agrees). */
function scatter(out: Parts, x0: number, z0: number, seed: number) {
  const rng = random(seed);
  const props = { coral: 0, weed: 0, rock: 0 };
  for (let t = 0; t < 150; t++) {
    const x = x0 + rng() * TILE;
    const z = z0 + rng() * TILE;
    const d = coastDistance(x, z);
    if (d < 4.5 || d > 78) continue;
    const { y, kind } = floorAt(x, z, d);
    const depth = -y;
    const pick = rng();
    if (kind.weed > 0.35 && pick < kind.weed * 0.9) {
      tuft(out, x, y, z, rng, depth - 0.45);
      props.weed++;
    } else if (kind.rock > 0.3 && pick < 0.7) {
      // Never closer to the surface than the troughs of the waves.
      const size = Math.min(0.6 + rng() * 1.5, (depth - 0.5) / 0.8);
      if (size < 0.3) continue;
      dome(out, x, y, z, size, size * 0.8, size, rgb(PAL.stone.rock), rng);
      props.rock++;
    } else if (depth > 1.4 && depth < 7 && kind.rock < 0.5 && pick > 0.82) {
      const colour = rgb(
        PAL.seabed.coral[Math.floor(rng() * PAL.seabed.coral.length)]!,
      );
      const heads = 2 + Math.floor(rng() * 3);
      for (let h = 0; h < heads; h++)
        dome(
          out,
          x + (rng() - 0.5) * 1.1,
          y,
          z + (rng() - 0.5) * 1.1,
          0.3 + rng() * 0.35,
          Math.min(0.5 + rng() * 0.7, (depth - 0.5) / 0.9),
          0.3 + rng() * 0.35,
          colour,
          rng,
        );
      props.coral++;
    }
  }
  return props;
}

/** The whole floor: the tiles that need a grid, and one coarse mesh for the deep floor between them. */
export function buildSeabed(): SeabedChunk[] {
  const chunks: SeabedChunk[] = [];
  const origin = -(TILES / 2) * TILE;
  const coarse: Parts = { positions: [], colors: [], indices: [] };
  // Half the diagonal of a tile: how far a corner can be from its middle.
  const reach = TILE * Math.SQRT1_2;
  for (let tz = 0; tz < TILES; tz++)
    for (let tx = 0; tx < TILES; tx++) {
      const x0 = origin + tx * TILE;
      const z0 = origin + tz * TILE;
      const middle = coastDistance(x0 + TILE / 2, z0 + TILE / 2);
      // Wholly inland: the island's own mesh is all there is.
      if (middle < -reach) continue;
      const cells = tileCells(middle - reach);
      if (cells === 0) {
        // The deep floor: coarse cells, none of the tile's own.
        const part: Parts = { positions: [], colors: [], indices: [] };
        grid(part, x0, z0, TILE, TILE / COARSE);
        const base = coarse.positions.length / 3;
        coarse.positions.push(...part.positions);
        coarse.colors.push(...part.colors);
        for (const index of part.indices) coarse.indices.push(index + base);
        continue;
      }
      const out: Parts = { positions: [], colors: [], indices: [] };
      grid(out, x0, z0, TILE, cells);
      const props =
        middle - reach <= PROPS_WITHIN
          ? scatter(out, x0, z0, 1000 + tz * TILES + tx)
          : { coral: 0, weed: 0, rock: 0 };
      chunks.push({
        name: `seabed-${tx}-${tz}`,
        ...out,
        ...centreOf(out),
        bounds: { minX: x0, maxX: x0 + TILE, minZ: z0, maxZ: z0 + TILE },
        props,
      });
    }
  if (coarse.indices.length > 0) {
    const half = SEA_BOUND + TILE;
    chunks.push({
      name: "seabed-far",
      ...coarse,
      ...centreOf(coarse),
      bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
      props: { coral: 0, weed: 0, rock: 0 },
    });
  }
  return chunks;
}
