import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { hex, meshFrom, paint } from "./mesh-parts.ts";
import { RodSim } from "./rod.ts";

/**
 * The fishing boat, built from code and merged into ONE mesh with vertex colours,
 * so a boat is one draw call and every other player's boat is a cheap instance.
 * The bow points to -Z and the hull origin is the waterline.
 */
import { boatPalettes, type BoatPalette } from "./palette.ts";
import { PAL } from "./art/colors.ts";
import { Parts, SIDES, cylinderMesh } from "./art/shapes.ts";
import { useSolid, glowMaterial } from "./art/materials.ts";

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
  const trim = hex(PAL.wood.trim);
  const boot = hex(PAL.hull.boot);
  const paintRed = hex(PAL.hull.waterline);
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
  const planks = PAL.wood.deck.map(hex);
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
    hex(PAL.wood.trim),
  );
}

/** Builds the merged boat. Parts use world-style transforms that are baked on merge. */
export function createBoatTemplate(
  scene: Scene,
  palette: BoatPalette,
  name: string,
): Mesh {
  const parts = new Parts(scene);
  for (const mesh of [
    hullMesh(scene, palette),
    deckMesh(scene),
    railMesh(scene, 1),
    railMesh(scene, -1),
  ])
    parts.add(mesh);
  const houseZ = BOAT_LENGTH * 0.22;
  const mastZ = -BOAT_LENGTH * 0.12;

  // Wheelhouse, windows and roof.
  parts.box([2, 1.55, 2], PAL.paint.cream, [0, DECK_Y + 0.78, houseZ]);
  parts.box([2.4, 0.16, 2.4], PAL.paint.coral, [0, DECK_Y + 1.62, houseZ]);
  parts.box([1.5, 0.5, 0.04], PAL.paint.window, [
    0,
    DECK_Y + 0.98,
    houseZ - 1.01,
  ]);
  for (const side of [1, -1])
    parts.box([0.04, 0.5, 1.15], PAL.paint.window, [
      side * 1.01,
      DECK_Y + 0.98,
      houseZ - 0.1,
    ]);
  parts.tube({ top: 0.2, bottom: 0.26, height: 0.6 }, PAL.paint.funnel, [
    0.55,
    DECK_Y + 2.1,
    houseZ + 0.55,
  ]);
  parts.tube(
    { top: 0.03, bottom: 0.03, height: 1.4, sides: SIDES.thin },
    PAL.metal.steel,
    [-0.6, DECK_Y + 2.4, houseZ + 0.4],
  );

  // Mast, derrick boom, pennant and lamp.
  parts.tube({ top: 0.14, bottom: 0.2, height: 3.3 }, PAL.wood.mid, [
    0,
    DECK_Y + 1.65,
    mastZ,
  ]);
  parts.tube(
    { top: 0.1, bottom: 0.14, height: 1.9 },
    PAL.wood.mid,
    [0.85, DECK_Y + 2.3, mastZ - 0.55],
    [Math.PI / 2.6, 0, -Math.PI / 4],
  );
  parts.box(
    [0.55, 0.3, 0.02],
    palette.trim,
    [0.3, DECK_Y + 3.05, mastZ],
    [0, 0.25, 0],
  );
  parts.sphere(0.26, PAL.light.lamp, [0, DECK_Y + 3.38, mastZ]);

  // Crates, net heap and life ring (the rod is its own mesh: ocean/rod-visual.ts).
  for (const [x, y] of [
    [-0.85, 0],
    [0.85, 0],
    [-0.85, 0.36],
  ] as const) {
    parts.box([0.72, 0.34, 0.55], PAL.paint.crate, [
      x,
      DECK_Y + 0.18 + y,
      BOAT_LENGTH * 0.42,
    ]);
    parts.box([0.74, 0.05, 0.57], PAL.paint.crateLid, [
      x,
      DECK_Y + 0.36 + y,
      BOAT_LENGTH * 0.42,
    ]);
  }
  parts.sphere(
    1,
    PAL.paint.net,
    [-0.7, DECK_Y + 0.2, -BOAT_LENGTH * 0.05],
    [0, 0, 0],
    [1.2, 0.55, 1],
  );
  parts.torus(
    0.6,
    0.15,
    PAL.paint.red,
    [1.015, DECK_Y + 1.05, houseZ + 0.6],
    [0, 0, Math.PI / 2],
  );

  // The fisherman: a round, friendly sailor at the stern holding the rod (yellow coat,
  // straw hat), so the boat has someone on it.
  const cx = 0.88;
  const cz = 3.02;
  parts.tube(
    { top: 0.3, bottom: 0.34, height: 0.5, sides: SIDES.round },
    PAL.crew.trousers,
    [cx, DECK_Y + 0.25, cz],
  );
  parts.tube(
    { top: 0.5, bottom: 0.58, height: 0.62, sides: SIDES.round },
    PAL.crew.coat,
    [cx, DECK_Y + 0.8, cz],
  );
  parts.sphere(
    0.4,
    PAL.crew.skin,
    [cx, DECK_Y + 1.32, cz],
    undefined,
    undefined,
    SIDES.round,
  );
  parts.tube(
    { top: 0.5, bottom: 0.5, height: 0.03, sides: SIDES.round },
    PAL.crew.hat,
    [cx, DECK_Y + 1.46, cz],
  );
  parts.tube(
    { top: 0.26, bottom: 0.34, height: 0.16, sides: SIDES.round },
    PAL.crew.hat,
    [cx, DECK_Y + 1.55, cz],
  );
  const arm = (
    from: [number, number, number],
    to: [number, number, number],
  ) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const;
    const len = Math.hypot(...d);
    parts.tube(
      { top: 0.13, bottom: 0.15, height: len },
      PAL.crew.coat,
      [from[0] + d[0] / 2, from[1] + d[1] / 2, from[2] + d[2] / 2],
      [Math.asin(d[2] / len), 0, -Math.asin(d[0] / len)],
    );
  };
  arm([cx + 0.2, DECK_Y + 1.02, cz], [1.2, DECK_Y + 0.62, 2.62]);
  arm([cx - 0.2, DECK_Y + 1.02, cz], [1.02, DECK_Y + 0.7, 2.7]);

  return useSolid(parts.merge(name), "satin");
}

/** Thin line shown while fishing; one small mesh per boat that is casting. */
export function createFishingLine(scene: Scene, parent: TransformNode) {
  const line = cylinderMesh(
    scene,
    { top: 0.025, bottom: 0.025, height: 2.6, sides: 4 },
    "fishing-line",
  );
  line.material = glowMaterial(scene, "fishing-line-material");
  line.parent = parent;
  const rest = new RodSim().tip();
  line.position.set(rest.x, 0.35, rest.z);
  line.isPickable = false;
  return line;
}
