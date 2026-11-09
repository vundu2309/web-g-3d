import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

/**
 * The only two kinds of material the sea game's objects use, so every object is lit the same
 * way and a change to the look is made here:
 *
 * - a SOLID material: vertex colours lit by the scene's lights, with one of a few "looks"
 *   (how shiny, whether it glows a little). One material per look and scene, shared by every
 *   mesh that asks for it, so a scene has a handful of them, not one per object.
 * - a GLOW material: unlit, flat colour (and an optional texture) for things that must stay
 *   readable whatever the light: the fishing line, the lure, rings, foam.
 *
 * The water, sky and wake are shaders of their own (water.ts, sky.ts, wake-mesh.ts).
 */
export type SolidLook = "matte" | "satin" | "gloss" | "buoy" | "gull";

interface Look {
  /** Grey level of the shine (0 is none). */
  shine: number;
  /** A little light the object gives off so it stays readable in shade. */
  glow: readonly [number, number, number];
  /** False draws only the outside of each face (closed shapes). */
  doubleSided: boolean;
}

const LOOKS: Record<SolidLook, Look> = {
  /** Terrain and rock: no shine. */
  matte: { shine: 0, glow: [0, 0, 0], doubleSided: true },
  /** Boats and creatures: a faint highlight. */
  satin: { shine: 0.12, glow: [0, 0, 0], doubleSided: true },
  /** The rod: a clear highlight. */
  gloss: { shine: 0.3, glow: [0, 0, 0], doubleSided: true },
  /** Buoys: closed shapes with a warm glow. */
  buoy: { shine: 0, glow: [0.18, 0.16, 0.14], doubleSided: false },
  /** Gulls: bright from every side. */
  gull: { shine: 0, glow: [0.35, 0.35, 0.35], doubleSided: true },
};

const solids = new WeakMap<Scene, Map<SolidLook, StandardMaterial>>();

/** The shared solid material for a look in this scene. */
export function solidMaterial(scene: Scene, look: SolidLook): StandardMaterial {
  let byLook = solids.get(scene);
  if (!byLook) solids.set(scene, (byLook = new Map()));
  let found = byLook.get(look);
  if (!found) {
    const spec = LOOKS[look];
    found = new StandardMaterial(`solid-${look}`, scene);
    found.diffuseColor = Color3.White();
    found.specularColor = new Color3(spec.shine, spec.shine, spec.shine);
    found.emissiveColor = new Color3(...spec.glow);
    found.backFaceCulling = !spec.doubleSided;
    byLook.set(look, found);
  }
  return found;
}

/** Gives a mesh a solid look and tells it to read its colours from its vertices. */
export function useSolid(mesh: Mesh, look: SolidLook): Mesh {
  mesh.material = solidMaterial(mesh.getScene(), look);
  mesh.useVertexColors = true;
  return mesh;
}

export interface GlowOptions {
  color?: Color3;
  texture?: Texture;
  /** Alpha comes from the texture. */
  textureAlpha?: boolean;
  alpha?: number;
  /** Default true. */
  doubleSided?: boolean;
}

/** An unlit material of its own (each glowing thing fades and recolours on its own). */
export function glowMaterial(
  scene: Scene,
  name: string,
  options: GlowOptions = {},
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.emissiveColor = options.color ?? Color3.White();
  material.backFaceCulling = !(options.doubleSided ?? true);
  if (options.texture) {
    material.diffuseTexture = options.texture;
    material.useAlphaFromDiffuseTexture = options.textureAlpha ?? true;
  }
  if (options.alpha !== undefined) material.alpha = options.alpha;
  return material;
}
