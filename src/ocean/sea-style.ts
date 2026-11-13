import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Shared look of the sea: the sky, the water and the fog must agree. */
export const SUN_DIRECTION = new Vector3(-0.45, 0.32, -0.55).normalize();
export const HORIZON = new Color3(0.8, 0.89, 0.94);
export const ZENITH = new Color3(0.28, 0.55, 0.84);
/** Open water: a deep blue, drifting in wide patches toward a greener teal. */
export const DEEP_WATER = new Color3(0.0, 0.26, 0.52);
export const DEEP_TEAL = new Color3(0.0, 0.4, 0.5);
/** Turquoise over the sand shelf near the beaches. */
export const SHALLOW_WATER = new Color3(0.08, 0.72, 0.72);
/** The sandy sea floor seen through the shallows (the wet sand of the beaches). */
export const SEA_FLOOR = Color3.FromHexString("#e4d3a8");
/** Absorption of clear sea water per metre (linear RGB): red goes first, then green. */
export const WATER_ABSORPTION = [0.36, 0.07, 0.045] as const;
export const FOG_DENSITY = 0.0016;
