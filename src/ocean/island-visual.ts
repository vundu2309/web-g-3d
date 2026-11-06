import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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
import { hex, meshFrom, mergeParts, paint } from "./mesh-parts.ts";

/**
 * Procedural island: low-poly terrain with beach, grass and rock, plus palms, rocks,
 * bushes and an optional lighthouse, all merged into ONE vertex-coloured mesh.
 * Seeded, so every client builds the identical island.
 */
export interface IslandOptions {
  seed: number;
  radius: number;
  lighthouse?: boolean;
  /** A far backdrop island beyond the sea's edge: coarser, with only palms. */
  distant?: boolean;
  /** False skips the foam ring (it needs a canvas); only tests turn it off. */
  foam?: boolean;
}

function random(seed: number) {
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
function noise(x: number, y: number, seed: number) {
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
function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface IslandVisual {
  mesh: Mesh;
  foam: Mesh | undefined;
  /** Terrain height at island-local (x, z). */
  height(x: number, z: number): number;
  /** Triangles in the island mesh, and what was placed on it. */
  triangles: number;
  props: PropSummary;
}

/** A soft white ring where the water meets the beach. */
function createFoam(scene: Scene, radius: number) {
  const texture = new DynamicTexture("foam", 128, scene, true);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(64, 64, 40, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.65)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  texture.update();
  texture.hasAlpha = true;
  const foamMaterial = new StandardMaterial("foam-material", scene);
  foamMaterial.diffuseTexture = texture;
  foamMaterial.useAlphaFromDiffuseTexture = true;
  foamMaterial.emissiveColor = Color3.White();
  foamMaterial.disableLighting = true;
  foamMaterial.backFaceCulling = false;
  const foam = MeshBuilder.CreateGround(
    "foam",
    { width: radius * 3.1, height: radius * 3.1 },
    scene,
  );
  foam.material = foamMaterial;
  foam.position.y = 0.08;
  foam.isPickable = false;
  return foam;
}

export function createIsland(
  scene: Scene,
  {
    seed,
    radius,
    lighthouse = false,
    distant = false,
    foam: withFoam = true,
  }: IslandOptions,
): IslandVisual {
  const rng = random(seed);
  const peak = radius * (0.38 + rng() * 0.18);
  const height = (x: number, z: number) => {
    const angle = Math.atan2(z, x);
    const wobble =
      1 +
      0.2 *
        (noise(Math.cos(angle) * 2 + 5, Math.sin(angle) * 2 + 5, seed) - 0.5);
    const r = Math.hypot(x, z) / (radius * 1.12 * wobble);
    const hill =
      Math.pow(Math.max(0, 1 - r * r), 1.35) *
      peak *
      (0.75 + 0.5 * fbm(x * 0.06, z * 0.06, seed));
    const shelf = -1.6 * smooth(0.82, 1.28, r);
    return (
      hill * smooth(0, 0.22, 1 - r + 0.18) +
      shelf +
      (r < 1 ? 0.55 : 0) * (1 - smooth(0.7, 1, r))
    );
  };

  // Terrain grid with colours from height and slope.
  const extent = radius * 1.5;
  const segments = distant ? 24 : 56;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const wet = hex(0xc9b27b);
  const sand = hex(0xf2dca2);
  const grassLow = hex(0x7bbf6e);
  const grassHigh = hex(0x4b9a5a);
  const rock = hex(0x8d9298);
  const rockDark = hex(0x757b83);
  const dry = hex(0xb3bf67);
  for (let iz = 0; iz <= segments; iz++)
    for (let ix = 0; ix <= segments; ix++) {
      const x = -extent + (ix / segments) * extent * 2;
      const z = -extent + (iz / segments) * extent * 2;
      const y = height(x, z);
      positions.push(x, Math.max(y, -1.6), z);
      const slope = Math.hypot(height(x + 1, z) - y, height(x, z + 1) - y);
      // Patches of dry grass, and ripples in the sand, from a slow noise.
      const patch = noise(x * 0.09 + 20, z * 0.09, seed + 3);
      const ripple = noise(x * 0.7, z * 0.7, seed + 5) - 0.5;
      let c: Color3;
      if (y < 0.15) c = wet;
      else if (y < 0.5) c = Color3.Lerp(wet, sand, (y - 0.15) / 0.35);
      else if (y < 1.9)
        c = Color3.Lerp(sand, wet, 0.1 + 0.25 * Math.max(0, ripple + 0.2));
      else if (slope > 1.25 || y > peak * 0.9)
        // Cliff and summit rock in bands, like layers.
        c = Math.floor(y * 1.8 + patch * 2) % 2 ? rock : rockDark;
      else {
        c = Color3.Lerp(grassLow, grassHigh, Math.min(1, y / (peak * 0.7)));
        c = Color3.Lerp(c, dry, smooth(0.58, 0.76, patch) * 0.7);
      }
      const jitter = (rng() - 0.5) * 0.05;
      colors.push(c.r + jitter, c.g + jitter, c.b + jitter, 1);
    }
  for (let iz = 0; iz < segments; iz++)
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * (segments + 1) + ix;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  const parts: Mesh[] = [
    meshFrom("terrain", scene, positions, indices, colors),
  ];

  const place = (
    mesh: Mesh,
    color: number,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
  ) => {
    mesh.position.set(x, y, z);
    mesh.scaling.set(...scale);
    paint(mesh, hex(color));
    parts.push(mesh);
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
    parts.push(
      paint(
        MeshBuilder.CreateTube(
          "trunk",
          { path, radius: 0.2, tessellation: 6 },
          scene,
        ),
        hex(0x9b6b3f),
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
        hex(i % 2 ? 0x5cba6e : 0x4fae63),
      );
      frond.position.copyFrom(top);
      frond.rotation.y = (i / 8) * Math.PI * 2;
      parts.push(frond);
    }
    for (let i = 0; i < 3; i++) {
      const nut = MeshBuilder.CreateSphere(
        "nut",
        { diameter: 0.3, segments: 5 },
        scene,
      );
      nut.position.set(
        top.x + Math.cos(i * 2.1) * 0.28,
        top.y - 0.2,
        top.z + Math.sin(i * 2.1) * 0.28,
      );
      paint(nut, hex(0x6b4a2b));
      parts.push(nut);
    }
  }

  let palms = 0;
  let attempts = 0;
  while (palms < Math.round(radius / (distant ? 9 : 2.3)) && attempts++ < 400) {
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
    place(rockMesh, 0x8f9499, x, Math.max(height(x, z), 0) + size * 0.25, z, [
      0.85 + rng() * 0.3,
      0.7 + rng() * 0.3,
      0.85 + rng() * 0.3,
    ]);
    rockMesh.rotation.y = rng() * 6;
  }
  // The small things: grass, flowers, bushes, trees, shells, driftwood, boulders at the
  // shore, a boardwalk, a hut and a rowboat. One buffer, one mesh.
  const geo = new Geo();
  const ctx = { geo, rng, height, radius, peak };
  const f = radius / 18;
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
    props.bushes = addBushes(ctx, Math.round(26 * f));
    props.trees = addTrees(ctx, Math.round(7 * f));
    props.shells = addShells(ctx, Math.round(50 * f));
    props.driftwood = addDriftwood(ctx, Math.round(5 * f));
    props.boulders = addBoulders(ctx, Math.round(6 * f));
    const walk = addBoardwalk(ctx);
    props.boardwalk = !!walk;
    props.hut = !!addHut(ctx);
    props.boat = addRowboat(ctx, walk);
  } else props.bushes = addBushes(ctx, Math.min(12, Math.round(4 * f)));

  if (lighthouse) {
    let bestX = 0;
    let bestZ = 0;
    let best = -Infinity;
    for (let i = 0; i < 80; i++) {
      const x = (rng() - 0.5) * radius;
      const z = (rng() - 0.5) * radius;
      const y = height(x, z);
      if (y > best) {
        best = y;
        bestX = x;
        bestZ = z;
      }
    }
    const base = best - 0.1;
    for (let i = 0; i < 4; i++) {
      const bottomR = 1.5 - i * 0.14;
      const section = MeshBuilder.CreateCylinder(
        "tower",
        {
          diameterTop: (bottomR - 0.14) * 2,
          diameterBottom: bottomR * 2,
          height: 2.3,
          tessellation: 10,
        },
        scene,
      );
      place(
        section,
        i % 2 ? 0xe0554b : 0xfff7e6,
        bestX,
        base + 1.15 + i * 2.3,
        bestZ,
      );
    }
    place(
      MeshBuilder.CreateCylinder(
        "gallery",
        { diameter: 3, height: 0.22, tessellation: 10 },
        scene,
      ),
      0x4b4f56,
      bestX,
      base + 9.3,
      bestZ,
    );
    place(
      MeshBuilder.CreateCylinder(
        "lantern",
        { diameter: 1.5, height: 1.2, tessellation: 10 },
        scene,
      ),
      0xfff1b0,
      bestX,
      base + 10,
      bestZ,
    );
    place(
      MeshBuilder.CreateCylinder(
        "roof",
        { diameterTop: 0, diameterBottom: 2, height: 1.1, tessellation: 10 },
        scene,
      ),
      0xe0554b,
      bestX,
      base + 11.15,
      bestZ,
    );
    // A door, windows and a railing round the gallery.
    const dark = rgbOf(0x2b3a4a);
    geo.box(bestX + 1.46, base + 0.8, bestZ, 0.05, 0.8, 0.4, rgbOf(0x6b4a2b));
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
        rgbOf(0xe0554b),
      );
    }
  }

  if (geo.triangles > 0) parts.push(geo.toMesh(scene, "props"));
  const mesh = mergeParts("island", parts);
  mesh.convertToFlatShadedMesh();
  const material = new StandardMaterial("island-material", scene);
  material.diffuseColor = Color3.White();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.freezeWorldMatrix();

  const foam = withFoam ? createFoam(scene, radius) : undefined;
  return {
    mesh,
    foam,
    height,
    triangles: mesh.getTotalIndices() / 3,
    props,
  };
}
