import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { beaconLevel } from "./atmosphere.ts";
import { lightMaterial } from "./beacon.ts";
import type { BoatModels } from "./boat-model.ts";
import {
  LIGHT_RANGE,
  PATROL_LIGHTS,
  flash,
  lensGlow,
  searchAngle,
  searchWedge,
} from "./patrol-light-plan.ts";
import { SEA } from "./sea-atmosphere.ts";

/**
 * The patrol ships' lights (the plan and the numbers are in patrol-light-plan.ts): the light bar's
 * lenses flash one after the other with a halo round each, the mast lantern has a warm halo and the
 * searchlights lay a wedge of light on the sea ahead that swings from side to side. All of it is
 * drawn additively (it only adds light, never hides anything), from dusk to dawn, only for a ship
 * near the camera, and cheap: per ship two lens instances, three halos and one wedge, none of them
 * drawn by day. With reduced motion the lenses are a steady glow and the wedge stays ahead.
 */
const BLUE = new Color3(
  ((PAL.paint.beacon >> 16) & 255) / 255,
  ((PAL.paint.beacon >> 8) & 255) / 255,
  (PAL.paint.beacon & 255) / 255,
);
const RED = new Color3(
  ((PAL.paint.beaconRed >> 16) & 255) / 255,
  ((PAL.paint.beaconRed >> 8) & 255) / 255,
  (PAL.paint.beaconRed & 255) / 255,
);
const WARM = new Color3(1, 0.86, 0.5);
const SEARCH = new Color3(1, 0.95, 0.82);

type Lenses = NonNullable<BoatModels["lenses"]>;

/** Once a frame for the whole fleet: the lenses' glass is steady by day and flashes at night (the glow is shared by every ship). */
export function updateLensGlow(lenses: Lenses, time: number, reduced: boolean) {
  const night = Math.max(
    beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z),
    0,
  );
  const f = reduced ? { blue: 0.6, red: 0.6 } : flash(time);
  const set = (mesh: Mesh, colour: Color3, flashing: number) => {
    (mesh.material as StandardMaterial).emissiveColor = colour.scale(
      lensGlow(flashing, night),
    );
  };
  set(lenses.blue, BLUE, f.blue);
  set(lenses.red, RED, f.red);
}

export interface PatrolLights {
  /** Each frame: `time` the sea's clock, `camera` its position, `reduced` the player's motion preference. */
  update(time: number, camera: Vector3, reduced: boolean): void;
  dispose(): void;
}

/** The lights of one patrol ship, hung from `parent` (its pose node); `phase` (0..1) is where its searchlight swings. */
export function createPatrolLights(
  scene: Scene,
  parent: TransformNode,
  lenses: Lenses,
  name: string,
  phase: number,
): PatrolLights {
  const lensCopies: InstancedMesh[] = [lenses.blue, lenses.red].map(
    (mesh, i) => {
      const copy = mesh.createInstance(`${name}-lens-${i}`);
      copy.parent = parent;
      copy.isPickable = false;
      return copy;
    },
  );

  const halo = (
    suffix: string,
    colour: Color3,
    size: number,
    at: { x: number; y: number; z: number },
  ) => {
    const mat = lightMaterial(`${name}-${suffix}`, scene, "beaconHalo", colour);
    const mesh = new Mesh(`${name}-${suffix}`, scene);
    const quad = new VertexData();
    const h = size / 2;
    quad.positions = [-h, -h, 0, h, -h, 0, -h, h, 0, h, h, 0];
    quad.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
    quad.indices = [0, 1, 2, 1, 3, 2];
    quad.applyToMesh(mesh);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = false;
    // A billboard under a turned parent lands off its place: it hangs from nothing and is put at the
    // lamp's world position every frame (as beacon.ts's lamp light does).
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    return { mat, mesh, local: new Vector3(at.x, at.y, at.z) };
  };
  const blue = halo("halo-blue", BLUE, 2.4, PATROL_LIGHTS.blue);
  const red = halo("halo-red", RED, 2.4, PATROL_LIGHTS.red);
  const mast = halo("halo-mast", WARM, 2.6, PATROL_LIGHTS.mast);

  // The searchlights' wedge on the sea, swung by a node at the searchlight.
  const swing = new TransformNode(`${name}-search-swing`, scene);
  swing.parent = parent;
  swing.position.set(PATROL_LIGHTS.search.x, 0, PATROL_LIGHTS.search.z);
  const wedge = new Mesh(`${name}-search`, scene);
  const geometry = searchWedge();
  const data = new VertexData();
  data.positions = geometry.positions;
  data.uvs = geometry.uvs;
  data.indices = geometry.indices;
  data.applyToMesh(wedge);
  const wedgeMaterial = lightMaterial(
    `${name}-search`,
    scene,
    "beaconBeam",
    SEARCH,
  );
  wedge.material = wedgeMaterial;
  wedge.parent = swing;
  wedge.isPickable = false;
  wedge.alwaysSelectAsActiveMesh = true;
  wedge.isVisible = false;

  const world = new Vector3();
  const place = (h: ReturnType<typeof halo>, level: number) => {
    h.mesh.isVisible = level > 0.01;
    if (!h.mesh.isVisible) return;
    Vector3.TransformCoordinatesToRef(h.local, parent.getWorldMatrix(), world);
    h.mesh.position.copyFrom(world);
    h.mesh.scaling.setAll(parent.absoluteScaling.x);
    h.mat.setFloat("level", level);
  };
  return {
    update(time, camera, reduced) {
      const near =
        Vector3.DistanceSquared(parent.getAbsolutePosition(), camera) <
        LIGHT_RANGE * LIGHT_RANGE;
      const night = near
        ? Math.max(beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z), 0)
        : 0;
      if (night <= 0.01) {
        for (const h of [blue, red, mast]) h.mesh.isVisible = false;
        wedge.isVisible = false;
        return;
      }
      parent.computeWorldMatrix(true);
      const f = reduced ? { blue: 0.6, red: 0.6 } : flash(time);
      place(blue, 0.9 * night * f.blue);
      place(red, 0.9 * night * f.red);
      const waver =
        1 +
        0.04 * Math.sin(time * 5.3 + phase * 7) +
        0.03 * Math.sin(time * 2.1);
      place(mast, 0.7 * night * waver);
      swing.rotation.y = reduced ? 0 : searchAngle(time, phase);
      wedge.isVisible = true;
      wedgeMaterial.setFloat("level", 2.2 * night);
    },
    dispose() {
      for (const h of [blue, red, mast]) {
        h.mesh.dispose();
        h.mat.dispose();
      }
      wedge.dispose();
      wedgeMaterial.dispose();
      swing.dispose();
      for (const copy of lensCopies) copy.dispose();
    },
  };
}
