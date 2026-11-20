import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { glowMaterial } from "./art/materials.ts";
import { beaconLevel } from "./atmosphere.ts";
import { createLampLight } from "./beacon.ts";
import type { PartsModel } from "./model-loader.ts";
import { SEA } from "./sea-atmosphere.ts";

/**
 * The lantern on the rowing boat's bow: a wooden crook post with a brass oil lantern hanging from
 * its hook (public/models/rower-lantern.glb, made in Blender, tools/blender/rowers.py), the glass
 * a separate part that shines. By day the glass is a dull amber; from dusk to dawn it glows, a
 * soft halo lights the air round it and a pool of light lies on the water under it
 * (`createLampLight`). Positions are in the boat's space (the model is already placed there; the
 * bow is -Z).
 */
export const LANTERN_PARTS = ["post", "glass"] as const;
export type LanternModel = PartsModel<(typeof LANTERN_PARTS)[number]>;

export const LANTERN = {
  /** The centre of the glass (m, boat space). */
  at: { x: 0, y: 0.918, z: -1.892 },
  /** The halo's width and the pool of light's width on the water (m, boat space), and the water's height under the lamp (the boat is carried `RIG.lift` above it). */
  halo: 1.8,
  pool: 4.2,
  water: -0.3,
};
const GLASS = new Color3(1, 0.78, 0.4);

/** The lantern's shared meshes and glass material (made once; each boat hangs instances of them). */
export interface LanternKit {
  post: Mesh[];
  glass: Mesh[];
  /** Once a frame: the glass is dull amber by day, bright at night. */
  update(): void;
  dispose(): void;
}

export function createLanternKit(
  scene: Scene,
  model: LanternModel,
): LanternKit {
  const post = model.parts.post.getChildMeshes() as Mesh[];
  const glass = model.parts.glass.getChildMeshes() as Mesh[];
  const material = glowMaterial(scene, "cat-lantern-glass-material", {
    color: GLASS.scale(0.5),
    doubleSided: false,
  });
  for (const mesh of glass) mesh.material = material;
  for (const mesh of [...post, ...glass]) {
    mesh.isVisible = false;
    mesh.isPickable = false;
  }
  return {
    post,
    glass,
    update() {
      const level = beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z);
      material.emissiveColor = GLASS.scale(0.45 + 0.55 * Math.max(level, 0));
    },
    dispose() {
      for (const mesh of [...post, ...glass]) mesh.dispose();
      material.dispose();
      model.root.dispose();
    },
  };
}

export interface Lantern {
  /** Each frame: the light follows the time of day (`time`: the sea's clock, for the flame's waver). */
  update(time: number): void;
  dispose(): void;
}

/** A lantern on `parent`: instances of the kit's meshes and a light of its own. */
export function createLantern(
  scene: Scene,
  parent: TransformNode,
  kit: LanternKit,
  name: string,
): Lantern {
  const copies = [...kit.post, ...kit.glass].map((mesh, i) => {
    const copy = mesh.createInstance(`${name}-${i}`);
    copy.parent = parent;
    copy.isPickable = false;
    return copy;
  });
  const light = createLampLight(
    scene,
    parent,
    {
      at: LANTERN.at,
      haloSize: LANTERN.halo,
      poolSize: LANTERN.pool,
      water: LANTERN.water,
    },
    name,
  );
  return {
    update(time) {
      light.update(time);
    },
    dispose() {
      light.dispose();
      for (const copy of copies) copy.dispose();
    },
  };
}
