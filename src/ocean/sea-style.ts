import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Shared look of the sea: the sky, the water and the fog must agree. */
export const SUN_DIRECTION = new Vector3(-0.45, 0.32, -0.55).normalize();
export const HORIZON = new Color3(0.8, 0.89, 0.94);
export const ZENITH = new Color3(0.28, 0.55, 0.84);
export const DEEP_WATER = new Color3(0.02, 0.28, 0.4);
export const SHALLOW_WATER = new Color3(0.1, 0.56, 0.66);
export const FOG_DENSITY = 0.0016;
