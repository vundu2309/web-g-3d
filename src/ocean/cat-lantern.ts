import { Color3 } from "@babylonjs/core/Maths/math.color";
import { beaconLevel } from "./atmosphere.ts";
import { SEA } from "./sea-atmosphere.ts";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { glowMaterial, useSolid } from "./art/materials.ts";
import { createLampGlow } from "./beacon.ts";
import { Geo, type Rgb } from "./geo.ts";

/**
 * The lantern on the rowing boat's bow post: an iron frame with a glass that shines. By day the
 * glass is a dull amber; from dusk to dawn it glows and a soft halo (the lighthouse lamp's,
 * `createLampGlow`) lights the air round it. Positions are in the boat's space (bow is -Z).
 */
export const LANTERN = {
  /** Where the lantern hangs (m, boat space). */
  at: { x: 0, y: 1.02, z: -1.5 },
  /** The halo's width (m). */
  halo: 3.4,
};
const IRON: Rgb = [0.16, 0.14, 0.13];
const BRASS: Rgb = [0.72, 0.52, 0.2];
const GLASS = new Color3(1, 0.78, 0.4);

/** The pole, the hook and the frame, as one mesh (iron and brass). */
export function lanternFrame(): Geo {
  const g = new Geo();
  const { x, y, z } = LANTERN.at;
  // A post on the bow with a short arm reaching over.
  g.box(x, 0.62, z, 0.022, 0.3, 0.022, IRON);
  g.box(x, y + 0.2, z, 0.022, 0.02, 0.022, IRON);
  // The lantern: a base plate, four corner bars, a roof and a ring.
  g.box(x, y - 0.12, z, 0.07, 0.012, 0.07, BRASS);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.box(x + sx * 0.06, y, z + sz * 0.06, 0.008, 0.115, 0.008, IRON);
  g.cone(x, y + 0.115, z, 0.1, 0.07, 4, BRASS, Math.PI / 4);
  g.box(x, y + 0.2, z, 0.02, 0.012, 0.02, IRON);
  return g;
}

/** The glass: a small box, drawn unlit so it can shine. */
export function lanternGlass(): Geo {
  const g = new Geo();
  const { x, y, z } = LANTERN.at;
  g.box(x, y, z, 0.05, 0.1, 0.05, [1, 1, 1]);
  return g;
}

/** The lantern's shared meshes and glass material (made once; each boat hangs instances of them). */
export interface LanternKit {
  frame: Mesh;
  glass: Mesh;
  /** Once a frame: the glass is dull amber by day, bright at night. */
  update(): void;
  dispose(): void;
}

export function createLanternKit(scene: Scene): LanternKit {
  const frame: Mesh = lanternFrame().toMesh(scene, "cat-lantern-frame");
  useSolid(frame, "matte");
  const glass: Mesh = lanternGlass().toMesh(scene, "cat-lantern-glass");
  const material = glowMaterial(scene, "cat-lantern-glass-material", {
    color: GLASS.scale(0.5),
  });
  glass.material = material;
  for (const mesh of [frame, glass]) {
    mesh.isVisible = false;
    mesh.isPickable = false;
  }
  return {
    frame,
    glass,
    update() {
      const level = beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z);
      material.emissiveColor = GLASS.scale(0.45 + 0.55 * Math.max(level, 0));
    },
    dispose() {
      frame.dispose();
      glass.dispose();
      material.dispose();
    },
  };
}

export interface Lantern {
  /** Each frame: the halo follows the time of day. */
  update(): void;
  dispose(): void;
}

/** A lantern on `parent`: instances of the kit's meshes and a halo of its own. */
export function createLantern(
  scene: Scene,
  parent: TransformNode,
  kit: LanternKit,
  name: string,
): Lantern {
  const frame = kit.frame.createInstance(`${name}-frame`);
  const glass = kit.glass.createInstance(`${name}-glass`);
  for (const mesh of [frame, glass]) {
    mesh.parent = parent;
    mesh.isPickable = false;
  }
  const glow = createLampGlow(scene, parent, LANTERN.at, LANTERN.halo, name);
  return {
    update() {
      glow.update();
    },
    dispose() {
      glow.dispose();
      frame.dispose();
      glass.dispose();
    },
  };
}
