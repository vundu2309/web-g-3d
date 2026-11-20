import { Color3 } from "@babylonjs/core/Maths/math.color";
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

export interface Lantern {
  /** Each frame: the glass and halo follow the time of day. */
  update(): void;
  dispose(): void;
}

export function createLantern(scene: Scene, parent: TransformNode): Lantern {
  const frame: Mesh = lanternFrame().toMesh(scene, "cat-lantern-frame");
  useSolid(frame, "matte");
  const glass: Mesh = lanternGlass().toMesh(scene, "cat-lantern-glass");
  const glassMaterial = glowMaterial(scene, "cat-lantern-glass-material", {
    color: GLASS.scale(0.5),
  });
  glass.material = glassMaterial;
  for (const mesh of [frame, glass]) {
    mesh.parent = parent;
    mesh.isPickable = false;
  }
  const glow = createLampGlow(
    scene,
    parent,
    LANTERN.at,
    LANTERN.halo,
    "cat-lantern",
  );
  return {
    update() {
      const level = glow.update();
      // Dull amber by day, bright warm white-yellow at night.
      glassMaterial.emissiveColor = GLASS.scale(0.45 + 0.55 * level);
    },
    dispose() {
      glow.dispose();
      frame.dispose();
      glass.dispose();
      glassMaterial.dispose();
    },
  };
}
