import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

/**
 * Soft cel shading for the solid materials: the final colour is pulled toward a few flat
 * brightness steps (a posterize that is only partly applied), so a hull, a hill or a fish
 * reads as bands of colour with soft edges instead of a smooth photographic gradient. One
 * plugin, added by `solidMaterial`, so every solid object gets the same treatment.
 */
export const TOON = {
  /** Brightness steps. */
  steps: 5,
} as const;

/**
 * The brightness (not the colour) is pulled toward flat steps, so lit and shaded sides read
 * as bands while hues and painted details (windows, stripes, grass) stay as they are.
 */
// The base class asks for the shader code while it is being built, before any field of this
// class exists, so the amount waits here keyed by the material.
const amounts = new WeakMap<object, number>();

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
          float lum = max(dot(color.rgb, vec3(0.299, 0.587, 0.114)), 0.0001);
          float stepped = floor(lum * ${TOON.steps.toFixed(1)} + 0.5) / ${TOON.steps.toFixed(1)};
          color.rgb *= mix(1.0, max(stepped, 0.08) / lum, ${(amounts.get(this._material) ?? 0).toFixed(2)});
        }
#endif`,
    };
  }
}

/** Adds the cel shading to a solid material; `amount` 0 leaves it smooth. */
export function addToon(material: StandardMaterial, amount: number) {
  if (amount <= 0) return undefined;
  amounts.set(material, amount);
  return new ToonPlugin(material);
}
