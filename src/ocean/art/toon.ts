import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

/**
 * Soft cel shading for the solid materials: the final colour is pulled toward a few flat
 * brightness steps (a posterize that is only partly applied), so a hull, a hill or a fish
 * reads as bands of colour with soft edges instead of a smooth photographic gradient. One
 * plugin, added by `solidMaterial`, so every solid object gets the same treatment.
 */
export const TOON = {
  /** Brightness steps per channel. */
  steps: 5,
  /** 0 keeps the smooth shading, 1 is fully flat bands. */
  amount: 0.55,
} as const;

class ToonPlugin extends MaterialPluginBase {
  constructor(material: StandardMaterial) {
    super(material, "Toon", 200, { TOON: false });
    this._enable(true);
  }
  override getClassName() {
    return "ToonPlugin";
  }
  override prepareDefines(defines: Record<string, unknown>) {
    defines.TOON = true;
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef TOON
        {
          vec3 steps = floor(color.rgb * ${TOON.steps.toFixed(1)} + 0.5) / ${TOON.steps.toFixed(1)};
          color.rgb = mix(color.rgb, steps, ${TOON.amount.toFixed(2)});
        }
#endif`,
    };
  }
}

export function addToon(material: StandardMaterial) {
  return new ToonPlugin(material);
}
