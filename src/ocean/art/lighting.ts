import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { Scene } from "@babylonjs/core/scene";
import { SUN_DIRECTION } from "../sea-style.ts";

/**
 * The light rig every object in the sea is lit by, in one place: a warm sun from the front
 * left and a soft sky fill whose underside is the blue bounce of the sea, so the shaded side
 * of a hull or a hill is a cool blue and never black. With the rim light of the solid
 * materials (materials.ts) this is the whole "soft cartoon" lighting; objects never add
 * lights of their own.
 */
export const LIGHT = {
  sun: { colour: new Color3(1, 0.93, 0.78), intensity: 1.3 },
  sky: {
    colour: new Color3(0.92, 0.96, 1),
    bounce: new Color3(0.3, 0.5, 0.64),
    intensity: 0.95,
  },
  /** The glow along the edges that face away from the sun (cool, like the sky). */
  rim: { colour: new Color3(0.85, 0.95, 1), power: 2.6, strength: 0.25 },
} as const;

export function createSeaLights(scene: Scene) {
  const sky = new HemisphericLight("sky-light", new Vector3(0, 1, 0), scene);
  sky.intensity = LIGHT.sky.intensity;
  sky.diffuse = LIGHT.sky.colour.clone();
  sky.groundColor = LIGHT.sky.bounce.clone();
  const sun = new DirectionalLight("sun", SUN_DIRECTION.scale(-1), scene);
  sun.intensity = LIGHT.sun.intensity;
  sun.diffuse = LIGHT.sun.colour.clone();
  return { sky, sun };
}
