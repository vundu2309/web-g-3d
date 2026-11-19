import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Geo, shade, type Rgb } from "./geo.ts";
import { useSolid } from "./art/materials.ts";
import {
  FISH_PER_SCHOOL,
  SCHOOLS,
  scatterTarget,
  schoolCentre,
  schoolPoses,
  type FishPose,
  type Scarer,
} from "./fish-school-plan.ts";

/**
 * The small fish that swim round the islands: real little meshes, instances of two looks
 * (silver-blue and yellow), moved every frame by the plan in fish-school-plan.ts. They lie under
 * the waves, so they are named `school-fish-N` and the clear-water layer (clear-water.ts) draws
 * them and the sea shows them through itself, dimmer the deeper they are. A school is skipped
 * (its fish are left where they were, and are too far to be drawn) when it is far from the
 * camera, so the cost follows what can be seen.
 */

/** The fish of a school farther than this (m) from the camera are switched off: the layer draws nothing beyond about 110 m (CLEAR.reach). */
const DRAW_RANGE = 150;
/** A school farther than this (m) from the camera is not moved. */
const ACTIVE_RANGE = 260;
/** How quickly a school's scatter eases toward its target (per second). */
const EASE = 2.2;

/** A fish about a metre long (1 unit = 1 m at size 1), nose along +Z, tail fin at -Z, up is +Y. */
function fishTemplate(
  scene: Scene,
  name: string,
  back: Rgb,
  belly: Rgb,
  tail: Rgb,
) {
  const geo = new Geo();
  const rings = 7;
  const sides = 6;
  // A spindle: rings from the nose (z 0.5) to the tail root (z -0.45), a flat deep body.
  const ring = (i: number) => {
    const u = i / (rings - 1); // 0 nose .. 1 tail
    const z = 0.5 - 0.95 * u;
    const body = Math.pow(Math.sin(Math.PI * (0.08 + 0.88 * u)), 0.8);
    const w = 0.11 * body * (u > 0.75 ? 1 - (u - 0.75) * 2.2 : 1);
    const h = 0.17 * body * (u > 0.75 ? 1 - (u - 0.75) * 2.2 : 1);
    return { z, w: Math.max(0.015, w), h: Math.max(0.02, h) };
  };
  const at = (i: number, k: number): [number, number, number] => {
    const r = ring(i);
    const a = (k / sides) * Math.PI * 2;
    return [Math.cos(a) * r.w, Math.sin(a) * r.h, r.z];
  };
  const colourOf = (k: number): Rgb => {
    const up = Math.sin((k / sides) * Math.PI * 2);
    return up > 0.2 ? back : up < -0.2 ? belly : shade(back, 0.1);
  };
  for (let i = 0; i < rings - 1; i++)
    for (let k = 0; k < sides; k++) {
      const a = at(i, k);
      const b = at(i, (k + 1) % sides);
      const c = at(i + 1, (k + 1) % sides);
      const d = at(i + 1, k);
      const colour = colourOf(k);
      geo.tri(a, b, c, colour);
      geo.tri(a, c, d, colour);
    }
  // The tail fin, a fan of two triangles (both sides are drawn by the layer; the scene's material
  // is double-sided for it too), and a small dorsal fin.
  geo.tri([0, 0, -0.42], [0, 0.2, -0.72], [0, -0.2, -0.72], tail);
  geo.tri([0, 0, -0.42], [0, -0.2, -0.72], [0, 0.2, -0.72], tail);
  geo.tri(
    [0, 0.15, 0.15],
    [0, 0.3, -0.12],
    [0, 0.14, -0.2],
    shade(back, -0.08),
  );
  geo.tri(
    [0, 0.14, -0.2],
    [0, 0.3, -0.12],
    [0, 0.15, 0.15],
    shade(back, -0.08),
  );
  const mesh = geo.toMesh(scene, name);
  useSolid(mesh, "satin");
  mesh.isVisible = false;
  mesh.isPickable = false;
  return mesh;
}

export class FishSchools {
  private readonly templates: Mesh[];
  private readonly fish: InstancedMesh[][] = [];
  private readonly push = SCHOOLS.map(() => ({ x: 0, z: 0 }));
  private readonly target = { x: 0, z: 0 };
  private readonly poses: FishPose[] = [];
  private readonly drawn: boolean[] = [];
  private last = -1;

  constructor(scene: Scene) {
    this.templates = [
      fishTemplate(
        scene,
        "school-fish-template-0",
        [0.2, 0.55, 0.85],
        [0.95, 0.97, 0.98],
        [0.4, 0.75, 0.95],
      ),
      fishTemplate(
        scene,
        "school-fish-template-1",
        [0.95, 0.78, 0.2],
        [0.98, 0.93, 0.7],
        [0.95, 0.5, 0.15],
      ),
    ];
    SCHOOLS.forEach((school, s) => {
      const source = this.templates[school.look]!;
      const list: InstancedMesh[] = [];
      for (let i = 0; i < FISH_PER_SCHOOL; i++) {
        const instance = source.createInstance(`school-fish-${s}-${i}`);
        instance.isPickable = false;
        // Out of sight until the first update places them.
        instance.position.y = -50;
        instance.setEnabled(false);
        list.push(instance);
      }
      this.fish.push(list);
    });
  }

  private hidden = false;
  /** Leaves the fish out altogether (a page-address switch for finding what costs frames). */
  hide() {
    this.hidden = true;
  }

  /** Moves the schools near the camera; `boats` frighten the schools they come close to. */
  update(
    time: number,
    camera: { x: number; z: number },
    boats: readonly Scarer[],
  ) {
    if (this.hidden) return;
    const dt = this.last < 0 ? 0 : Math.min(0.1, Math.abs(time - this.last));
    this.last = time;
    const ease = 1 - Math.exp(-EASE * dt);
    SCHOOLS.forEach((school, s) => {
      const push = this.push[s]!;
      const list = this.fish[s]!;
      const centre = schoolCentre(school, time);
      const dx = centre.x - camera.x;
      const dz = centre.z - camera.z;
      const near = dx * dx + dz * dz < DRAW_RANGE * DRAW_RANGE;
      if (near !== this.drawn[s]) {
        // Fish beyond the clear-water layer's reach cannot be seen: switched off, they cost the
        // scene nothing (no culling, no draw), where a parked instance still costs both.
        for (const mesh of list) mesh.setEnabled(near);
        this.drawn[s] = near;
      }
      if (dx * dx + dz * dz > ACTIVE_RANGE * ACTIVE_RANGE) return;
      scatterTarget(school, time, boats, this.target);
      push.x += (this.target.x - push.x) * ease;
      push.z += (this.target.z - push.z) * ease;
      schoolPoses(school, time, push, this.poses);
      for (let i = 0; i < list.length; i++) {
        const mesh = list[i]!;
        const pose = this.poses[i]!;
        mesh.position.set(pose.x, pose.y, pose.z);
        mesh.rotation.set(0, pose.yaw, pose.roll);
        mesh.scaling.setAll(1.2 * pose.size);
      }
    });
  }

  dispose() {
    for (const list of this.fish) for (const mesh of list) mesh.dispose();
    for (const mesh of this.templates) mesh.dispose();
  }
}
