import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Geo, rgbOf } from "./geo.ts";
import { createIsland } from "./island-visual.ts";

import { BACKDROP, BUOYS, GULLS, gullPose } from "./sea-layout.ts";
import { waveGradient, waveHeight } from "./waves.ts";
import { PAL } from "./art/colors.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import { useSolid } from "./art/materials.ts";

/**
 * The extra life of the sea: bobbing channel buoys, circling gulls and the backdrop
 * islands beyond the edge of the sea. Buoys and gulls are instances of two small meshes,
 * so they cost two draw calls; the backdrop islands are coarse and only have palms.
 */
function buoyTemplate(scene: Scene, color: number) {
  const parts = new Parts(scene);
  // Float, white band, mast and lamp.
  parts.tube({ top: 0.7, bottom: 1.1, height: 0.9 }, color, [0, 0.1, 0]);
  parts.tube(
    { top: 0.74, bottom: 0.74, height: 0.22 },
    PAL.paint.cream,
    [0, 0.62, 0],
  );
  parts.tube(
    { top: 0.06, bottom: 0.16, height: 1.3, sides: SIDES.thin },
    PAL.metal.steel,
    [0, 1.4, 0],
  );
  parts.sphere(
    0.34,
    PAL.light.lamp,
    [0, 2.1, 0],
    undefined,
    undefined,
    SIDES.thin,
  );
  const merged = parts.merge("buoy");
  useSolid(merged, "buoy");
  merged.isVisible = false;
  merged.isPickable = false;
  return merged;
}

/** A seagull: a body, a tail and two long wings in a shallow V, dark at the tips. */
function gullTemplate(scene: Scene) {
  const geo = new Geo();
  const white = rgbOf(PAL.paint.white);
  const grey = rgbOf(PAL.gull.grey);
  const dark = rgbOf(PAL.gull.dark);
  const beak = rgbOf(PAL.gull.beak);
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
  useSolid(mesh, "gull");
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
    const red = buoyTemplate(scene, PAL.paint.red);
    const green = buoyTemplate(scene, PAL.paint.green);
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
