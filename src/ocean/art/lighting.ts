import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { paintClear, SEA } from "../sea-atmosphere.ts";

/**
 * The light rig every object in the sea is lit by, in one place: a warm sun from the front
 * left and a soft sky fill whose underside is the blue bounce of the sea, so the shaded side
 * of a hull or a hill is a cool blue and never black. With the rim light of the solid
 * materials (materials.ts) this is the whole "soft cartoon" lighting; objects never add
 * lights of their own. `LIGHT` is the midday, clear rig; the time of day and the weather
 * (atmosphere.ts) drive the lights, the fog and the clear colour every frame from `SEA`, and a
 * second directional light is the moon (off by day).
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
  const sun = new DirectionalLight("sun", SEA.sunDirection.scale(-1), scene);
  sun.intensity = LIGHT.sun.intensity;
  sun.diffuse = LIGHT.sun.colour.clone();
  const moon = new DirectionalLight("moon", SEA.moonDirection.scale(-1), scene);
  moon.intensity = 0;
  moon.diffuse = SEA.moon.colour.clone();
  // Once per frame, before drawing: no allocation, the lights and the fog follow the shared sea.
  scene.onBeforeRenderObservable.add(() => {
    sky.intensity = SEA.sky.intensity;
    sky.diffuse.copyFrom(SEA.sky.colour);
    sky.groundColor.copyFrom(SEA.sky.bounce);
    sun.direction.copyFrom(SEA.sunDirection).scaleInPlace(-1);
    sun.intensity = SEA.sun.intensity;
    sun.diffuse.copyFrom(SEA.sun.colour);
    moon.direction.copyFrom(SEA.moonDirection).scaleInPlace(-1);
    moon.intensity = SEA.moon.intensity;
    moon.diffuse.copyFrom(SEA.moon.colour);
    if (scene.fogMode === Scene.FOGMODE_EXP2) {
      scene.fogDensity = SEA.fogDensity;
      scene.fogColor.copyFrom(SEA.horizon);
    }
    paintClear(scene.clearColor);
  });
  return { sky, sun, moon };
}
