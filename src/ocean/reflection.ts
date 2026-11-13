import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import type { Scene } from "@babylonjs/core/scene";
import { reflectionSize, reflectsInWater } from "./reflection-model.ts";
import type { Sky } from "./sky.ts";
import type { Water } from "./water.ts";

/**
 * Plans the sea's mirror: the scene (islands and their palms, markets, boats, buoys, the sky
 * dome) drawn once more, every frame, from a camera mirrored about the water plane y = 0 with
 * everything below the water clipped away, into a texture half the size of the canvas. The water
 * shader reads it back (water.ts, reflection-model.ts). It costs a second pass over the scene
 * (see "Deferred work" in docs/ocean.md).
 *
 * The render list is a predicate over the whole scene (`reflectsInWater`), not a list, so
 * whatever is built later (other players' boats) is mirrored too, and the water, the swash
 * sheets, the wake foam and the ripple rings never are. Fallback: if the texture cannot be made
 * the water keeps mirroring the analytic sky alone (the old look) and a warning is logged.
 */
export function createSeaReflection(
  scene: Scene,
  water: Water,
  sky?: Sky,
): MirrorTexture | undefined {
  const engine = scene.getEngine();
  let mirror: MirrorTexture;
  try {
    mirror = new MirrorTexture(
      "sea-reflection",
      reflectionSize(engine.getRenderWidth(), engine.getRenderHeight()),
      scene,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      Texture.TRILINEAR_SAMPLINGMODE,
      true,
    );
  } catch (error) {
    console.warn("No reflection texture; the sea mirrors the sky only.", error);
    return undefined;
  }
  // Keeps what lies above y = 0 (the plane faces down: the mirrored camera is under the sea).
  mirror.mirrorPlane = new Plane(0, -1, 0, 0);
  mirror.renderListPredicate = (mesh) => reflectsInWater(mesh.name);
  // Nothing drawn means alpha 0: the water then falls back to the analytic sky there.
  mirror.clearColor = new Color4(0, 0, 0, 0);
  mirror.wrapU = Texture.CLAMP_ADDRESSMODE;
  mirror.wrapV = Texture.CLAMP_ADDRESSMODE;
  scene.customRenderTargets.push(mirror);
  // The sun is not drawn in the picture: the water adds its own glitter, a second disc would double it.
  if (sky) {
    mirror.onBeforeRenderObservable.add(() => sky.showSun(false));
    mirror.onAfterRenderObservable.add(() => sky.showSun(true));
  }
  // The canvas changes size (rotation, the render-scale governor): the picture follows.
  scene.onBeforeRenderObservable.add(() => {
    const want = reflectionSize(
      engine.getRenderWidth(),
      engine.getRenderHeight(),
    );
    const have = mirror.getSize();
    if (want.width !== have.width || want.height !== have.height)
      mirror.resize(want);
  });
  water.setReflection(mirror);
  // The scene owns the texture (scene.textures) and disposes it with itself.
  return mirror;
}
