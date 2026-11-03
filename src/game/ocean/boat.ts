import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

// All dimensions are metres. The scene owns meshes and shared materials.
export function createBoat(scene: Scene): TransformNode {
  const boat = new TransformNode("sailboat", scene);
  const material = (name: string, color: string, gloss = 0.15) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.set(gloss, gloss, gloss);
    m.specularPower = 64;
    return m;
  };
  const navy = material("navy enamel", "#102c42", 0.65);
  const teak = material("teak", "#a7794b");
  const cream = material("ivory", "#e6dfca");
  const metal = material("stainless steel", "#aebfc5", 0.8);
  const rope = material("rigging", "#9d9276");
  const glass = material("cabin glass", "#203e4b", 0.7);
  const linen = material("woven sailcloth", "#eee1c3");
  linen.backFaceCulling = false;
  const line = (
    name: string,
    points: Vector3[],
    radius: number,
    mat = rope,
  ) => {
    const mesh = MeshBuilder.CreateTube(
      name,
      { path: points, radius, tessellation: 6 },
      scene,
    );
    mesh.parent = boat;
    mesh.material = mat;
    return mesh;
  };
  const box = (
    name: string,
    size: Vector3,
    pos: Vector3,
    mat: StandardMaterial,
  ) => {
    const m = MeshBuilder.CreateBox(
      name,
      { width: size.x, height: size.y, depth: size.z },
      scene,
    );
    m.position.copyFrom(pos);
    m.material = mat;
    m.parent = boat;
    return m;
  };
  // Cross sections taper toward the bow; rounded bilges descend below waterline.
  const sections = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const z = -3.3 + t * 7;
    const width =
      0.1 +
      1.02 *
        Math.pow(Math.sin(Math.PI * (t * 0.91 + 0.075)), 0.65) *
        (1 - Math.pow(t, 8));
    return { z, width };
  });
  const paths = sections.map(({ z, width }) =>
    Array.from({ length: 17 }, (_, j) => {
      const a = (j / 16) * Math.PI;
      return new Vector3(-Math.cos(a) * width, 0.63 - Math.sin(a) * 1.15, z);
    }),
  );
  const hull = MeshBuilder.CreateRibbon(
    "shaped displacement hull",
    { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  hull.material = navy;
  hull.parent = boat;
  const port = sections.map((s) => new Vector3(-s.width, 0.64, s.z));
  const starboard = sections.map((s) => new Vector3(s.width, 0.64, s.z));
  const deck = MeshBuilder.CreateRibbon(
    "fitted teak deck",
    { pathArray: [port, starboard], sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  deck.parent = boat;
  deck.material = teak;
  for (const side of [-1, 1]) {
    const edge = sections.map((s) => new Vector3(side * s.width, 0.68, s.z));
    line("ivory gunwale", edge, 0.045, cream);
    line(
      "waterline stripe",
      sections.map((s) => new Vector3(side * s.width * 0.91, 0.18, s.z)),
      0.025,
      cream,
    );
    const rail = sections
      .filter((_, i) => i % 4 === 0)
      .map((s) => new Vector3(side * s.width, 0.98, s.z));
    line("lifeline", rail, 0.012, metal);
    for (const p of rail)
      line("stanchion", [new Vector3(p.x, 0.65, p.z), p], 0.016, metal);
  }
  // Thin deck seams follow the hull outline, without per-plank materials.
  for (let i = -7; i <= 7; i++) {
    const x = i * 0.12;
    const points = sections
      .filter((s) => s.width > Math.abs(x) + 0.06)
      .map((s) => new Vector3(x, 0.648, s.z));
    if (points.length > 1) line("deck caulking", points, 0.005, rope);
  }
  box("cabin", new Vector3(1.25, 0.45, 2), new Vector3(0, 0.88, 0.35), cream);
  box(
    "teak cabin roof",
    new Vector3(1.32, 0.07, 2.08),
    new Vector3(0, 1.14, 0.35),
    teak,
  );
  for (const side of [-1, 1])
    for (const z of [-0.2, 0.5])
      box(
        "portlight",
        new Vector3(0.015, 0.16, 0.4),
        new Vector3(side * 0.631, 0.94, z),
        glass,
      );
  box(
    "cockpit well",
    new Vector3(0.8, 0.035, 1.4),
    new Vector3(0, 0.66, -2),
    navy,
  );
  for (const side of [-1, 1])
    box(
      "cockpit bench",
      new Vector3(0.27, 0.15, 1.5),
      new Vector3(side * 0.6, 0.76, -2),
      teak,
    );
  const wheel = MeshBuilder.CreateTorus(
    "helm",
    { diameter: 0.55, thickness: 0.025, tessellation: 24 },
    scene,
  );
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(0, 1.1, -2.4);
  wheel.material = teak;
  wheel.parent = boat;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    line(
      "wheel spoke",
      [
        new Vector3(0, 1.1, -2.4),
        new Vector3(Math.cos(a) * 0.26, 1.1 + Math.sin(a) * 0.26, -2.4),
      ],
      0.01,
      metal,
    );
  }
  line(
    "mast",
    [new Vector3(0, 0.7, 0.7), new Vector3(0, 8.6, 0.7)],
    0.048,
    metal,
  );
  line(
    "boom",
    [new Vector3(0, 1.65, 0.7), new Vector3(0.2, 1.65, -2.7)],
    0.04,
    metal,
  );
  for (const x of [-1, 1])
    line("shroud", [new Vector3(x, 0.7, 0.1), new Vector3(0, 8.4, 0.7)], 0.008);
  line(
    "forestay",
    [new Vector3(0, 0.7, 3.65), new Vector3(0, 8.6, 0.7)],
    0.009,
  );
  line(
    "backstay",
    [new Vector3(0, 0.7, -3.3), new Vector3(0, 8.6, 0.7)],
    0.009,
  );
  const sail = (
    name: string,
    top: Vector3,
    left: Vector3,
    right: Vector3,
    bulge: number,
  ) => {
    const rows: Vector3[][] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const a = Vector3.Lerp(top, left, t),
        b = Vector3.Lerp(top, right, t);
      const row = Array.from({ length: 17 }, (_, j) => {
        const u = j / 16;
        const p = Vector3.Lerp(a, b, u);
        p.x += Math.sin(u * Math.PI) * Math.sin(t * Math.PI * 0.9) * bulge;
        return p;
      });
      rows.push(row);
      if (i > 0 && i % 4 === 0) line("sail panel seam", row, 0.004, rope);
    }
    const m = MeshBuilder.CreateRibbon(
      name,
      { pathArray: rows, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    m.material = linen;
    m.parent = boat;
    line("sail foot", rows[24]!, 0.012, cream);
  };
  sail(
    "curved mainsail",
    new Vector3(0, 8.4, 0.7),
    new Vector3(0, 1.7, 0.7),
    new Vector3(0.2, 1.7, -2.6),
    0.65,
  );
  sail(
    "curved jib",
    new Vector3(0, 7.9, 0.77),
    new Vector3(0, 0.95, 3.4),
    new Vector3(0.3, 1.35, 0.9),
    0.4,
  );
  return boat;
}
