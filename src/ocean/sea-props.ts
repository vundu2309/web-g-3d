import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { Geo, rgbOf } from "./geo.ts";
import { createIsland } from "./island-visual.ts";
import { hex, mergeParts, paint } from "./mesh-parts.ts";
import { BACKDROP, BUOYS, GULLS, gullPose } from "./sea-layout.ts";
import { waveGradient, waveHeight } from "./waves.ts";

/**
 * The extra life of the sea: bobbing channel buoys, circling gulls and the backdrop
 * islands beyond the edge of the sea. Buoys and gulls are instances of two small meshes,
 * so they cost two draw calls; the backdrop islands are coarse and only have palms.
 */
function buoyTemplate(scene: Scene, color: number) {
  const parts: Mesh[] = [];
  const add = (mesh: Mesh, c: number, y: number) => {
    mesh.position.y = y;
    paint(mesh, hex(c));
    parts.push(mesh);
  };
  add(
    MeshBuilder.CreateCylinder(
      "part",
      { diameterTop: 0.7, diameterBottom: 1.1, height: 0.9, tessellation: 8 },
      scene,
    ),
    color,
    0.1,
  );
  add(
    MeshBuilder.CreateCylinder(
      "part",
      { diameter: 0.74, height: 0.22, tessellation: 8 },
      scene,
    ),
    0xfff7e6,
    0.62,
  );
  add(
    MeshBuilder.CreateCylinder(
      "part",
      { diameterTop: 0.06, diameterBottom: 0.16, height: 1.3, tessellation: 5 },
      scene,
    ),
    0x4b4f56,
    1.4,
  );
  add(
    MeshBuilder.CreateSphere("part", { diameter: 0.34, segments: 5 }, scene),
    0xffe28a,
    2.1,
  );
  const merged = mergeParts("buoy", parts);
  const material = new StandardMaterial("buoy-material", scene);
  material.diffuseColor = Color3.White();
  material.emissiveColor = new Color3(0.18, 0.16, 0.14);
  material.specularColor = Color3.Black();
  merged.material = material;
  merged.useVertexColors = true;
  merged.isVisible = false;
  merged.isPickable = false;
  return merged;
}

/** A seagull: a body, a tail and two long wings in a shallow V, dark at the tips. */
function gullTemplate(scene: Scene) {
  const geo = new Geo();
  const white = rgbOf(0xf6f8fa);
  const grey = rgbOf(0xc9d0d8);
  const dark = rgbOf(0x3b4048);
  const beak = rgbOf(0xf2b640);
  // Nose along +X, wings along Z, up is Y; about 1.5 m across.
  geo.tri([0.55, 0, 0], [-0.1, 0.06, 0.12], [-0.1, 0.06, -0.12], white);
  geo.tri([-0.1, 0.06, 0.12], [-0.1, 0.06, -0.12], [-0.45, 0.02, 0], grey);
  geo.tri([-0.42, 0.02, 0.08], [-0.42, 0.02, -0.08], [-0.75, 0, 0], white);
  geo.tri([0.55, 0, 0], [0.7, -0.02, 0], [0.5, 0.04, 0.04], beak);
  for (const side of [-1, 1]) {
    geo.tri(
      [0.2, 0.05, 0.05 * side],
      [-0.25, 0.05, 0.05 * side],
      [-0.05, 0.14, 0.75 * side],
      grey,
    );
    geo.tri(
      [-0.05, 0.14, 0.75 * side],
      [-0.25, 0.05, 0.05 * side],
      [-0.45, 0.12, 0.8 * side],
      white,
    );
    geo.tri(
      [-0.05, 0.14, 0.75 * side],
      [-0.45, 0.12, 0.8 * side],
      [-0.3, 0.12, 0.95 * side],
      dark,
    );
  }
  const mesh = geo.toMesh(scene, "gull");
  const material = new StandardMaterial("gull-material", scene);
  material.diffuseColor = Color3.White();
  material.emissiveColor = new Color3(0.35, 0.35, 0.35);
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.isVisible = false;
  mesh.isPickable = false;
  mesh.scaling.setAll(1.3);
  return mesh;
}

export class SeaProps {
  private readonly buoys: InstancedMesh[] = [];
  private readonly gulls: InstancedMesh[] = [];
  private readonly templates: Mesh[] = [];
  private readonly extra: Mesh[] = [];

  constructor(scene: Scene) {
    const red = buoyTemplate(scene, 0xe0554b);
    const green = buoyTemplate(scene, 0x2f9a6a);
    this.templates.push(red, green);
    BUOYS.forEach((buoy, i) => {
      const instance = (buoy.color === "red" ? red : green).createInstance(
        `buoy-${i}`,
      );
      instance.isPickable = false;
      this.buoys.push(instance);
    });
    const gull = gullTemplate(scene);
    this.templates.push(gull);
    GULLS.forEach((_, i) => {
      const instance = gull.createInstance(`gull-${i}`);
      instance.isPickable = false;
      this.gulls.push(instance);
    });
    BACKDROP.forEach((island) => {
      const visual = createIsland(scene, {
        seed: island.seed,
        radius: island.radius,
        distant: true,
      });
      visual.mesh.position.set(island.x, 0, island.z);
      visual.mesh.freezeWorldMatrix();
      visual.foam?.position.set(island.x, 0.08, island.z);
      this.extra.push(visual.mesh);
      if (visual.foam) this.extra.push(visual.foam);
    });
    this.update(0);
  }

  /** Moves the buoys with the waves and the gulls round their circles. */
  update(time: number) {
    BUOYS.forEach((buoy, i) => {
      const mesh = this.buoys[i]!;
      const g = waveGradient(buoy.x, buoy.z, time);
      mesh.position.set(
        buoy.x,
        waveHeight(buoy.x, buoy.z, time) - 0.05,
        buoy.z,
      );
      // Lean with the slope of the wave under it.
      mesh.rotation.set(Math.atan(g.z) * 0.8, 0, -Math.atan(g.x) * 0.8);
    });
    GULLS.forEach((gull, i) => {
      const pose = gullPose(gull, time);
      const mesh = this.gulls[i]!;
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.rotation.set(pose.bank, pose.heading, 0);
    });
  }

  dispose() {
    for (const mesh of [...this.buoys, ...this.gulls]) mesh.dispose();
    for (const mesh of [...this.templates, ...this.extra]) mesh.dispose();
  }
}
