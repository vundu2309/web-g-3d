import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { Geo, rgbOf } from "./geo.ts";
import {
  addBoulders,
  addBushes,
  addDriftwood,
  addFlowers,
  addGrass,
  addHut,
  addBoardwalk,
  addRowboat,
  addShells,
  addTrees,
  type PropSummary,
} from "./island-props.ts";
import type { KeepOut } from "./island-layout.ts";
import { hex, meshFrom, mergeParts, paint } from "./mesh-parts.ts";
import { PAL } from "./art/colors.ts";
import { SIDES, cylinderMesh, sphereMesh } from "./art/shapes.ts";
import { useSolid } from "./art/materials.ts";
import {
  drawnBed,
  islandShape,
  noise,
  random,
  smooth,
} from "./island-shape.ts";

export {
  COAST_MAX,
  COAST_MIN,
  islandShape,
  type IslandShape,
} from "./island-shape.ts";

/**
 * Procedural island: low-poly terrain with beach, grass and rock, bushes, grass, flowers, a
 * boardwalk and an optional lighthouse merged into ONE vertex-coloured mesh. The palms, trees,
 * boulders and hut that the Blender models replace (island-models.ts) are a second mesh,
 * `fallback`, parented to the first, so they can be swapped out once the models load. A
 * backdrop island keeps everything in one mesh. Seeded, so every client builds the identical
 * island.
 */
export interface IslandOptions {
  seed: number;
  radius: number;
  lighthouse?: boolean;
  /** A far backdrop island beyond the sea's edge: coarser, with only palms. */
  distant?: boolean;
}

export interface IslandVisual {
  mesh: Mesh;
  /**
   * The procedural palms, trees, boulders and hut (a child of `mesh`), drawn until the models
   * replace them (`placeIslandProps` disposes it and clears this). Undefined on a backdrop island.
   */
  fallback?: Mesh;
  /** Terrain height at island-local (x, z). */
  height(x: number, z: number): number;
  /** Distance from the centre to the waterline in a direction (radians). */
  coast(angle: number): number;
  seed: number;
  radius: number;
  peak: number;
  /** Island-local places the model props stay off: boardwalk, rowboat, driftwood, lighthouse. */
  keepOut: KeepOut[];
  /** Triangles in the island (both meshes), and what was placed on it. */
  triangles: number;
  props: PropSummary;
}

export function createIsland(
  scene: Scene,
  { seed, radius, lighthouse = false, distant = false }: IslandOptions,
): IslandVisual {
  const rng = random(seed);
  const { peak, height, coast } = islandShape(seed, radius);

  // Terrain grid with colours from height and slope. It reaches out over the shallow shelf (the
  // coast is inside 0.99 of the radius); the sea's surface hides everything deeper than the
  // waves' troughs, so cells that lie wholly deeper than 0.9 m are left out.
  const extent = radius * 1.4;
  const segments = distant ? 28 : 76;
  const floor = -0.9;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const wet = hex(PAL.sand.wet);
  const sand = hex(PAL.sand.dry);
  const grassLow = hex(PAL.plants.grassLow);
  const grassHigh = hex(PAL.plants.grassHigh);
  const rock = hex(PAL.stone.rock);
  const rockDark = hex(PAL.stone.dark);
  const dry = hex(PAL.plants.grassDry);
  for (let iz = 0; iz <= segments; iz++)
    for (let ix = 0; ix <= segments; ix++) {
      const x = -extent + (ix / segments) * extent * 2;
      const z = -extent + (iz / segments) * extent * 2;
      const y = height(x, z);
      positions.push(x, Math.max(drawnBed(y), floor), z);
      const slope = Math.hypot(
        height(x + 0.5, z) - height(x - 0.5, z),
        height(x, z + 0.5) - height(x, z - 0.5),
      );
      // Patches of dry grass, ripples in the sand and a few rocky outcrops, from slow noise.
      const patch = noise(x * 0.09 + 20, z * 0.09, seed + 3);
      const ripple = noise(x * 0.7, z * 0.7, seed + 5) - 0.5;
      const outcrop = noise(x * 0.13 + 40, z * 0.13, seed + 9);
      let c: Color3;
      if (y < 0.15) c = wet;
      else if (y < 0.5) c = Color3.Lerp(wet, sand, (y - 0.15) / 0.35);
      else {
        const beach = Color3.Lerp(
          sand,
          wet,
          0.1 + 0.25 * Math.max(0, ripple + 0.2),
        );
        let green = Color3.Lerp(
          grassLow,
          grassHigh,
          Math.min(1, (y - 1) / (peak * 0.8)),
        );
        green = Color3.Lerp(green, dry, smooth(0.58, 0.76, patch) * 0.7);
        if (y > 2.2 && (slope > 0.75 || outcrop > 0.8))
          // Rock outcrops in bands, like layers.
          green = Math.floor(y * 1.8 + patch * 2) % 2 ? rock : rockDark;
        // Sand fades into grass behind the beach, unevenly.
        c = Color3.Lerp(beach, green, smooth(0.95, 1.45, y + ripple * 0.5));
      }
      const jitter = (rng() - 0.5) * 0.05;
      colors.push(c.r + jitter, c.g + jitter, c.b + jitter, 1);
    }
  const deep = (i: number) => positions[i * 3 + 1]! <= floor;
  for (let iz = 0; iz < segments; iz++)
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * (segments + 1) + ix;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      if (deep(a) && deep(b) && deep(c) && deep(d)) continue;
      indices.push(a, b, c, b, d, c);
    }
  const parts: Mesh[] = [
    meshFrom("terrain", scene, positions, indices, colors),
  ];
  // What the models replace goes to its own mesh (on a play island), in the same order and
  // from the same random stream as always, so the rest of the island does not move.
  const swappable: Mesh[] = distant ? parts : [];

  const place = (
    mesh: Mesh,
    color: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
    into: Mesh[] = parts,
  ) => {
    mesh.position.set(x, y, z);
    mesh.scaling.set(...scale);
    paint(mesh, hex(color));
    into.push(mesh);
    return mesh;
  };

  function palm(x: number, z: number) {
    const base = height(x, z) - 0.1;
    const lean = (rng() - 0.5) * 1.8;
    const tall = 4.2 + rng() * 2.2;
    const yaw = rng() * Math.PI * 2;
    const spin = (px: number, pz: number) =>
      new Vector3(
        x + px * Math.cos(yaw) - pz * Math.sin(yaw),
        0,
        z + px * Math.sin(yaw) + pz * Math.cos(yaw),
      );
    const path = Curve3.CreateCatmullRomSpline(
      [
        new Vector3(0, 0, 0),
        new Vector3(lean * 0.35, tall * 0.5, 0),
        new Vector3(lean, tall, 0),
      ],
      8,
    )
      .getPoints()
      .map((p) => {
        const w = spin(p.x, p.z);
        return new Vector3(w.x, base + p.y, w.z);
      });
    swappable.push(
      paint(
        MeshBuilder.CreateTube(
          "trunk",
          { path, radius: 0.2, tessellation: 6 },
          scene,
        ),
        hex(PAL.wood.mid),
      ),
    );
    const top = path[path.length - 1]!;
    for (let i = 0; i < 8; i++) {
      const rows = 6;
      const fp: number[] = [];
      const fi: number[] = [];
      for (let r = 0; r <= rows; r++) {
        const along = r / rows;
        const half = 0.42 * (1 - along * 0.75);
        for (const side of [-1, 1])
          fp.push(
            side * half,
            along * 3 - along * along * 1.1 * 1.5,
            along * 3,
          );
      }
      for (let r = 0; r < rows; r++)
        fi.push(r * 2, r * 2 + 1, r * 2 + 2, r * 2 + 1, r * 2 + 3, r * 2 + 2);
      const frond = meshFrom(
        "frond",
        scene,
        fp,
        fi,
        hex(i % 2 ? PAL.plants.frond : PAL.plants.leaves[1]!),
      );
      frond.position.copyFrom(top);
      frond.rotation.y = (i / 8) * Math.PI * 2;
      swappable.push(frond);
    }
    for (let i = 0; i < 3; i++) {
      const nut = sphereMesh(scene, 0.3, SIDES.thin, "nut");
      nut.position.set(
        top.x + Math.cos(i * 2.1) * 0.28,
        top.y - 0.2,
        top.z + Math.sin(i * 2.1) * 0.28,
      );
      paint(nut, hex(PAL.wood.deep));
      swappable.push(nut);
    }
  }

  let palms = 0;
  let attempts = 0;
  while (
    palms < Math.round(Math.min(radius, 24) / (distant ? 9 : 2.3)) &&
    attempts++ < 400
  ) {
    const angle = rng() * Math.PI * 2;
    const distance = radius * (0.35 + rng() * 0.6);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const y = height(x, z);
    if (y > 0.7 && y < peak * 0.55) {
      palm(x, z);
      palms++;
    }
  }
  for (let i = 0; i < (distant ? 0 : 9); i++) {
    const angle = rng() * Math.PI * 2;
    const distance = radius * (0.5 + rng() * 0.6);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (height(x, z) <= 0.2) continue;
    const size = 0.5 + rng() * 1.1;
    const rockMesh = MeshBuilder.CreatePolyhedron(
      "rock",
      { type: 1, size },
      scene,
    );
    place(
      rockMesh,
      PAL.stone.rock,
      x,
      Math.max(height(x, z), 0) + size * 0.25,
      z,
      [0.85 + rng() * 0.3, 0.7 + rng() * 0.3, 0.85 + rng() * 0.3],
      swappable,
    );
    rockMesh.rotation.y = rng() * 6;
  }
  // The small things: grass, flowers, bushes, trees, shells, driftwood, boulders at the
  // shore, a boardwalk, a hut and a rowboat. One buffer, one mesh.
  const geo = new Geo();
  const taken: { x: number; z: number; r: number }[] = [];
  const ctx = { geo, rng, height, coast, radius, peak, taken };
  const swapGeo = distant ? geo : new Geo();
  const swapCtx = { ...ctx, geo: swapGeo };
  const keepOut: KeepOut[] = [];
  // Bigger islands get more of everything, but only up to a phone-sized budget.
  const f = Math.min(1.25, radius / 18);
  const props: PropSummary = {
    grass: 0,
    flowers: 0,
    shells: 0,
    driftwood: 0,
    boulders: 0,
    bushes: 0,
    trees: 0,
    boardwalk: false,
    hut: false,
    boat: false,
  };
  if (!distant) {
    props.grass = addGrass(ctx, Math.round(520 * f));
    props.flowers = addFlowers(ctx, Math.round(90 * f));
    props.bushes = addBushes(swapCtx, Math.round(26 * f));
    props.trees = addTrees(swapCtx, Math.round(7 * f));
    props.shells = addShells(ctx, Math.round(50 * f));
    props.driftwood = addDriftwood(ctx, Math.round(5 * f));
    props.boulders = addBoulders(swapCtx, Math.round(6 * f));
    const walk = addBoardwalk(ctx);
    props.boardwalk = !!walk;
    props.hut = !!addHut(swapCtx);
    const boat = addRowboat(ctx, walk);
    props.boat = !!boat;
    if (walk) {
      // The boardwalk starts at least half the radius out; keep the whole run clear.
      const from = radius * 0.45;
      keepOut.push({
        ax: Math.cos(walk.angle) * from,
        az: Math.sin(walk.angle) * from,
        bx: walk.x,
        bz: walk.z,
        r: 1.5,
      });
    }
    if (boat)
      keepOut.push({ ax: boat.x, az: boat.z, bx: boat.x, bz: boat.z, r: 2 });
    for (const { x, z, r } of taken)
      keepOut.push({ ax: x, az: z, bx: x, bz: z, r });
  } else props.bushes = addBushes(ctx, Math.min(12, Math.round(4 * f)));

  if (lighthouse) {
    // On the highest point of the land (a 0.5 m search over the middle of the island).
    let bestX = 0;
    let bestZ = 0;
    let best = -Infinity;
    for (let x = -radius * 0.7; x <= radius * 0.7; x += 0.5)
      for (let z = -radius * 0.7; z <= radius * 0.7; z += 0.5) {
        const y = height(x, z);
        if (y > best) {
          best = y;
          bestX = x;
          bestZ = z;
        }
      }
    // Sunk to the lowest ground under its foot, so no side floats.
    let foot = best;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      foot = Math.min(
        foot,
        height(bestX + Math.cos(a) * 1.5, bestZ + Math.sin(a) * 1.5),
      );
    }
    const base = foot - 0.1;
    keepOut.push({ ax: bestX, az: bestZ, bx: bestX, bz: bestZ, r: 3 });
    for (let i = 0; i < 4; i++) {
      const bottomR = 1.5 - i * 0.14;
      place(
        cylinderMesh(scene, {
          top: (bottomR - 0.14) * 2,
          bottom: bottomR * 2,
          height: 2.3,
          sides: SIDES.round,
        }),
        i % 2 ? PAL.paint.red : PAL.paint.cream,
        bestX,
        base + 1.15 + i * 2.3,
        bestZ,
      );
    }
    place(
      cylinderMesh(scene, {
        top: 3,
        bottom: 3,
        height: 0.22,
        sides: SIDES.round,
      }),
      PAL.metal.steel,
      bestX,
      base + 9.3,
      bestZ,
    );
    place(
      cylinderMesh(scene, {
        top: 1.5,
        bottom: 1.5,
        height: 1.2,
        sides: SIDES.round,
      }),
      PAL.light.lamp,
      bestX,
      base + 10,
      bestZ,
    );
    place(
      cylinderMesh(scene, {
        top: 0,
        bottom: 2,
        height: 1.1,
        sides: SIDES.round,
      }),
      PAL.paint.red,
      bestX,
      base + 11.15,
      bestZ,
    );
    // A door, windows and a railing round the gallery.
    const dark = rgbOf(PAL.stone.night);
    geo.box(
      bestX + 1.46,
      base + 0.8,
      bestZ,
      0.05,
      0.8,
      0.4,
      rgbOf(PAL.wood.deep),
    );
    for (const [h, a] of [
      [3.4, 0.6],
      [5.9, 2.4],
      [7.6, 4.2],
    ] as const)
      geo.box(
        bestX + Math.cos(a) * 1.2,
        base + h,
        bestZ + Math.sin(a) * 1.2,
        0.05,
        0.3,
        0.18,
        dark,
        a,
      );
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      geo.box(
        bestX + Math.cos(a) * 1.4,
        base + 9.75,
        bestZ + Math.sin(a) * 1.4,
        0.04,
        0.3,
        0.04,
        rgbOf(PAL.paint.red),
      );
    }
  }

  if (geo.triangles > 0) parts.push(geo.toMesh(scene, "props"));
  const mesh = mergeParts("island", parts);
  mesh.convertToFlatShadedMesh();
  useSolid(mesh, "matte");
  mesh.freezeWorldMatrix();
  let fallback: Mesh | undefined;
  if (!distant) {
    if (swapGeo.triangles > 0)
      swappable.push(swapGeo.toMesh(scene, "props-fallback"));
    if (swappable.length > 0) {
      fallback = mergeParts("island-fallback", swappable);
      fallback.convertToFlatShadedMesh();
      useSolid(fallback, "matte");
      fallback.parent = mesh;
    }
  }

  return {
    mesh,
    fallback,
    height,
    coast,
    seed,
    radius,
    peak,
    keepOut,
    triangles:
      (mesh.getTotalIndices() + (fallback?.getTotalIndices() ?? 0)) / 3,
    props,
  };
}
