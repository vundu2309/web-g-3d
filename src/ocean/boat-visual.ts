import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { hex, meshFrom, mergeParts, paint } from "./mesh-parts.ts";
import { RodSim } from "./rod.ts";

/**
 * The fishing boat, built from code and merged into ONE mesh with vertex colours,
 * so a boat is one draw call and every other player's boat is a cheap instance.
 * The bow points to -Z and the hull origin is the waterline.
 */
import { boatPalettes, type BoatPalette } from "./palette.ts";

export { boatPalettes, type BoatPalette };

export const BOAT_LENGTH = 7.4;
const HALF_BEAM = 1.5;
const DECK_Y = 0.78;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Half beam along the hull: 0 at the stern, 1 at the bow. */
const beam = (u: number) => {
  const t = Math.min(1, Math.max(0, (u - 0.42) / 0.58));
  return HALF_BEAM * (0.84 + 0.16 * smooth(0, 0.4, u)) * (1 - Math.pow(t, 2.2));
};
/** Gunwale height: the bow rises in a sheer curve. */
const top = (u: number) => 1.05 + 0.62 * Math.pow(u, 2.3);
const bottom = (u: number) => -0.62 + 0.4 * Math.pow(u, 3);
const zAt = (u: number) => BOAT_LENGTH / 2 - u * BOAT_LENGTH;
const STATIONS = 28;
const RING = 12;

function section(u: number, s: number, side: number): [number, number, number] {
  const angle = (s * Math.PI) / 2;
  const x =
    side * beam(u) * Math.pow(Math.sin(angle), 0.8) * (1 + 0.12 * s * u);
  const y =
    bottom(u) + (top(u) - bottom(u)) * Math.pow(1 - Math.cos(angle), 0.85);
  return [x, y, zAt(u)];
}

function hullMesh(scene: Scene, palette: BoatPalette) {
  const hull = hex(palette.hull);
  const trim = hex(0xc98a4b);
  const boot = hex(0xfff3d6);
  const paintRed = hex(0x8c3a35);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const colorAt = (y: number, s: number) =>
    s > 0.96 ? trim : y < -0.06 ? paintRed : y < 0.2 ? boot : hull;
  for (const side of [1, -1])
    for (let i = 0; i <= STATIONS; i++)
      for (let j = 0; j <= RING; j++) {
        const [x, y, z] = section(i / STATIONS, j / RING, side);
        positions.push(x, y, z);
        const c = colorAt(y, j / RING);
        colors.push(c.r, c.g, c.b, 1);
      }
  const perSide = (STATIONS + 1) * (RING + 1);
  for (let side = 0; side < 2; side++)
    for (let i = 0; i < STATIONS; i++)
      for (let j = 0; j < RING; j++) {
        const a = side * perSide + i * (RING + 1) + j;
        const b = a + 1;
        const c = a + RING + 1;
        const d = c + 1;
        if (side === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
  // Transom: strips between the two stern rings close the hull behind the deck.
  const base = positions.length / 3;
  for (let j = 0; j <= RING; j++) {
    for (const side of [1, -1]) {
      const [x, y, z] = section(0, j / RING, side);
      positions.push(x, y, z);
      colors.push(hull.r, hull.g, hull.b, 1);
    }
  }
  for (let j = 0; j < RING; j++) {
    const r0 = base + j * 2;
    const r1 = base + (j + 1) * 2;
    indices.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
  }
  return meshFrom("hull", scene, positions, indices, colors);
}

function deckMesh(scene: Scene) {
  const planks = [hex(0xb98757), hex(0xa57647)];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const stations = 20;
  for (let i = 0; i < stations; i++) {
    const u0 = (i / stations) * 0.97;
    const u1 = ((i + 1) / stations) * 0.97;
    const c = planks[i % 2]!;
    const base = positions.length / 3;
    for (const [u, side] of [
      [u0, -1],
      [u0, 1],
      [u1, -1],
      [u1, 1],
    ] as const) {
      positions.push(side * beam(u) * 0.86, DECK_Y, zAt(u));
      colors.push(c.r, c.g, c.b, 1);
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  return meshFrom("deck", scene, positions, indices, colors);
}

function railMesh(scene: Scene, side: number) {
  const path: Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = (i / 24) * 0.985;
    path.push(new Vector3(side * beam(u) * 1.02, top(u) + 0.02, zAt(u)));
  }
  return paint(
    MeshBuilder.CreateTube(
      "rail",
      { path, radius: 0.075, tessellation: 6 },
      scene,
    ),
    hex(0xc98a4b),
  );
}

/** Builds the merged boat. Parts use world-style transforms that are baked on merge. */
export function createBoatTemplate(
  scene: Scene,
  palette: BoatPalette,
  name: string,
): Mesh {
  const parts: Mesh[] = [
    hullMesh(scene, palette),
    deckMesh(scene),
    railMesh(scene, 1),
    railMesh(scene, -1),
  ];
  const place = (
    mesh: Mesh,
    color: number,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) => {
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scaling.set(...scale);
    paint(mesh, hex(color));
    parts.push(mesh);
  };
  const box = (w: number, h: number, d: number) =>
    MeshBuilder.CreateBox("part", { width: w, height: h, depth: d }, scene);
  const tube = (top: number, bottomD: number, h: number, tess = 8) =>
    MeshBuilder.CreateCylinder(
      "part",
      {
        diameterTop: top,
        diameterBottom: bottomD,
        height: h,
        tessellation: tess,
      },
      scene,
    );
  const houseZ = BOAT_LENGTH * 0.22;
  const mastZ = -BOAT_LENGTH * 0.12;

  // Wheelhouse, windows and roof.
  place(box(2, 1.55, 2), 0xfff7e0, [0, DECK_Y + 0.78, houseZ]);
  place(box(2.4, 0.16, 2.4), 0xef866a, [0, DECK_Y + 1.62, houseZ]);
  place(box(1.5, 0.5, 0.04), 0x1d4e73, [0, DECK_Y + 0.98, houseZ - 1.01]);
  for (const side of [1, -1])
    place(box(0.04, 0.5, 1.15), 0x1d4e73, [
      side * 1.01,
      DECK_Y + 0.98,
      houseZ - 0.1,
    ]);
  place(tube(0.2, 0.26, 0.6), 0xb23a32, [0.55, DECK_Y + 2.1, houseZ + 0.55]);
  place(tube(0.03, 0.03, 1.4, 5), 0x4b4f56, [-0.6, DECK_Y + 2.4, houseZ + 0.4]);

  // Mast, derrick boom, pennant and lamp.
  place(tube(0.14, 0.2, 3.3), 0x9b6b3f, [0, DECK_Y + 1.65, mastZ]);
  place(
    tube(0.1, 0.14, 1.9, 6),
    0x9b6b3f,
    [0.85, DECK_Y + 2.3, mastZ - 0.55],
    [Math.PI / 2.6, 0, -Math.PI / 4],
  );
  place(
    box(0.55, 0.3, 0.02),
    palette.trim,
    [0.3, DECK_Y + 3.05, mastZ],
    [0, 0.25, 0],
  );
  place(
    MeshBuilder.CreateSphere("part", { diameter: 0.26, segments: 8 }, scene),
    0xfff1b0,
    [0, DECK_Y + 3.38, mastZ],
  );

  // Crates, net heap and life ring (the rod is its own mesh: ocean/rod-visual.ts).
  for (const [x, y] of [
    [-0.85, 0],
    [0.85, 0],
    [-0.85, 0.36],
  ] as const) {
    place(box(0.72, 0.34, 0.55), 0xffb93d, [
      x,
      DECK_Y + 0.18 + y,
      BOAT_LENGTH * 0.42,
    ]);
    place(box(0.74, 0.05, 0.57), 0xc77f1b, [
      x,
      DECK_Y + 0.36 + y,
      BOAT_LENGTH * 0.42,
    ]);
  }
  place(
    MeshBuilder.CreateSphere("part", { diameter: 1, segments: 7 }, scene),
    0x7ea0b8,
    [-0.7, DECK_Y + 0.2, -BOAT_LENGTH * 0.05],
    [0, 0, 0],
    [1.2, 0.55, 1],
  );
  place(
    MeshBuilder.CreateTorus(
      "part",
      { diameter: 0.6, thickness: 0.15, tessellation: 18 },
      scene,
    ),
    0xe5534b,
    [1.015, DECK_Y + 1.05, houseZ + 0.6],
    [0, 0, Math.PI / 2],
  );

  // The fisherman: a round, friendly sailor at the stern holding the rod (yellow coat,
  // straw hat), so the boat has someone on it.
  const cx = 0.88;
  const cz = 3.02;
  const sphere = (d: number, seg = 10) =>
    MeshBuilder.CreateSphere("part", { diameter: d, segments: seg }, scene);
  place(tube(0.3, 0.34, 0.5, 10), 0x2f5d8a, [cx, DECK_Y + 0.25, cz]); // trousers
  place(tube(0.5, 0.58, 0.62, 12), 0xffc83d, [cx, DECK_Y + 0.8, cz]); // coat
  place(sphere(0.4), 0xf2b98f, [cx, DECK_Y + 1.32, cz]); // head
  place(tube(0.5, 0.5, 0.03, 16), 0xe9c46a, [cx, DECK_Y + 1.46, cz]); // brim
  place(tube(0.26, 0.34, 0.16, 12), 0xe9c46a, [cx, DECK_Y + 1.55, cz]); // crown
  const arm = (
    from: [number, number, number],
    to: [number, number, number],
  ) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const;
    const len = Math.hypot(...d);
    place(
      tube(0.13, 0.15, len, 8),
      0xffc83d,
      [from[0] + d[0] / 2, from[1] + d[1] / 2, from[2] + d[2] / 2],
      [Math.asin(d[2] / len), 0, -Math.asin(d[0] / len)],
    );
  };
  arm([cx + 0.2, DECK_Y + 1.02, cz], [1.2, DECK_Y + 0.62, 2.62]);
  arm([cx - 0.2, DECK_Y + 1.02, cz], [1.02, DECK_Y + 0.7, 2.7]);

  const merged = mergeParts(name, parts);
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = Color3.White();
  material.specularColor = new Color3(0.12, 0.12, 0.12);
  material.backFaceCulling = false;
  merged.material = material;
  merged.useVertexColors = true;
  return merged;
}

/** Thin line shown while fishing; one small mesh per boat that is casting. */
export function createFishingLine(scene: Scene, parent: TransformNode) {
  const line = MeshBuilder.CreateCylinder(
    "fishing-line",
    { diameter: 0.025, height: 2.6, tessellation: 4 },
    scene,
  );
  const material = new StandardMaterial("fishing-line-material", scene);
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  line.material = material;
  line.parent = parent;
  const rest = new RodSim().tip();
  line.position.set(rest.x, 0.35, rest.z);
  line.isPickable = false;
  return line;
}
