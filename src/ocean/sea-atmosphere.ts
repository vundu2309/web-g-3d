import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
  atmosphereWithPin,
  DEFAULT_PIN,
  parsePin,
  type Atmosphere,
  type Rgb,
  type Vec3,
  type WeatherKind,
} from "./atmosphere.ts";
import {
  DEEP_TEAL,
  DEEP_WATER,
  FOG_DENSITY,
  HORIZON,
  SHALLOW_WATER,
  SUN_DIRECTION,
  ZENITH,
} from "./sea-style.ts";

/**
 * The one shared, mutable look of the sea right now: the sky, the water, the swash, the lights,
 * the fog and the sea's mirror all read this object (the constants of sea-style.ts are only its
 * midday-clear starting values). `stepAtmosphere` rewrites it once per frame from the shared
 * server clock, or a pinned time (atmosphere.ts), without allocating; the shaders hold these very Color3 / Vector3
 * objects as uniforms (`bindAtmosphere`), so they follow without being set again.
 */
export const SEA = {
  sunDirection: SUN_DIRECTION.clone(),
  moonDirection: SUN_DIRECTION.scale(-1),
  horizon: HORIZON.clone(),
  zenith: ZENITH.clone(),
  deep: DEEP_WATER.clone(),
  deepTeal: DEEP_TEAL.clone(),
  shallow: SHALLOW_WATER.clone(),
  /** The sun and the moon as the shaders see them (colour times strength). */
  sunShader: new Color3(1, 0.82, 0.58),
  moonShader: new Color3(0, 0, 0),
  /** Light added to water and sand at night, linear. */
  nightGlow: new Color3(0, 0, 0),
  /** x exposure, y daylight (1 day, 0 night), z stars. */
  grade: new Vector3(1, 1, 0),
  /** x cloud cover, y cloud gloom, z rain, w unused. */
  weather: new Vector4(0, 0, 0, 0),
  rainColor: new Color3(0.8, 0.86, 0.92),
  fogDensity: FOG_DENSITY,
  murk: 1,
  /** Directional lights and the fill light, for solid objects (art/lighting.ts). */
  sun: { colour: new Color3(1, 0.93, 0.78), intensity: 1.3 },
  moon: { colour: new Color3(0.55, 0.68, 1), intensity: 0 },
  sky: {
    colour: new Color3(0.92, 0.96, 1),
    bounce: new Color3(0.3, 0.5, 0.64),
    intensity: 0.95,
  },
  /** The kind of weather that is stronger right now (for tools and tests). */
  kind: "clear" as WeatherKind,
  /** Changes whenever the state changes (so a cheap listener can tell). */
  version: 0,
};

/** Every uniform the shared GLSL (sky-model.ts) reads; a material lists these and binds them. */
export const ATMOSPHERE_UNIFORMS = [
  "horizon",
  "zenith",
  "sunDirection",
  "sunLight",
  "moonDirection",
  "moonLight",
  "nightGlow",
  "grade",
  "weather",
] as const;

/** Hands the shared look to a material's shared GLSL uniforms (by reference: no per-frame work). */
export function bindAtmosphere(material: ShaderMaterial) {
  material.setColor3("horizon", SEA.horizon);
  material.setColor3("zenith", SEA.zenith);
  material.setVector3("sunDirection", SEA.sunDirection);
  material.setColor3("sunLight", SEA.sunShader);
  material.setVector3("moonDirection", SEA.moonDirection);
  material.setColor3("moonLight", SEA.moonShader);
  material.setColor3("nightGlow", SEA.nightGlow);
  material.setVector3("grade", SEA.grade);
  material.setVector4("weather", SEA.weather);
}

const setRgb = (to: Color3, from: Rgb) => to.set(from[0], from[1], from[2]);
const setVec = (to: Vector3, from: Vec3) => to.set(from[0], from[1], from[2]);

/** Copies a computed atmosphere into the shared object (no allocation). */
export function setAtmosphere(a: Atmosphere) {
  setVec(SEA.sunDirection, a.sunDirection);
  setVec(SEA.moonDirection, a.moonDirection);
  setRgb(SEA.horizon, a.horizon);
  setRgb(SEA.zenith, a.zenith);
  setRgb(SEA.deep, a.deep);
  setRgb(SEA.deepTeal, a.deepTeal);
  setRgb(SEA.shallow, a.shallow);
  setRgb(SEA.sunShader, a.sunShader);
  setRgb(SEA.moonShader, a.moonShader);
  setRgb(SEA.nightGlow, a.nightGlow);
  SEA.grade.set(a.exposure, a.daylight, a.stars);
  SEA.weather.set(a.cloudCover, a.cloudGloom, a.rain, 0);
  setRgb(SEA.rainColor, a.rainColor);
  SEA.fogDensity = a.fogDensity;
  SEA.murk = a.murk;
  setRgb(SEA.sun.colour, a.sun.colour);
  SEA.sun.intensity = a.sun.intensity;
  setRgb(SEA.moon.colour, a.moon.colour);
  SEA.moon.intensity = a.moon.intensity;
  setRgb(SEA.sky.colour, a.sky.colour);
  setRgb(SEA.sky.bounce, a.sky.bounce);
  SEA.sky.intensity = a.sky.intensity;
  SEA.kind = a.weather.kind;
  SEA.version++;
}

// ---------------------------------------------------------------------------------------
// The clock: the shared time by default, or a pin from the page address, the Settings card or a tool

type PinState = { hour?: number; weather?: WeatherKind } | undefined;

/**
 * Browser tests start at a clear noon (`VITE_TEST_NOON=on`, set by scripts/lib/dev.mjs and
 * scripts/test-browser.mjs): the sea follows the real clock, and what a test sees (the light, the
 * rain mesh, the triangle count) must not depend on the hour it is run at. A real visit never sets it.
 */
const testNoon = (): boolean => {
  try {
    return import.meta.env?.VITE_TEST_NOON === "on";
  } catch {
    return false;
  }
};

let pin: PinState = (() => {
  let fromAddress: PinState;
  try {
    fromAddress = parsePin(globalThis.location?.search ?? "");
  } catch {
    fromAddress = undefined;
  }
  return fromAddress ?? (testNoon() ? { ...DEFAULT_PIN } : undefined);
})();

/**
 * Pins the hour of the game day (0..24) and/or the weather, or `undefined` to follow the shared
 * clock (every player sees the same day and weather, and the same one that sets the bites,
 * decision 0020). Nothing is pinned by default; the Settings card, development tools, tests and
 * the page address (`?daytime=21.5&weather=rain`) pin.
 */
export function pinAtmosphere(next: PinState) {
  pin = next;
}

/** The pin in force (undefined when following the shared clock). */
export const currentPin = () => pin;

/** Advances the shared look to this time (milliseconds of the shared server clock); call once per frame. */
export function stepAtmosphere(utcMs: number = Date.now()): Atmosphere {
  const a = atmosphereWithPin(utcMs, pin);
  setAtmosphere(a);
  return a;
}

/** Sets the clear colour of a scene to the horizon (no allocation). */
export function paintClear(color: Color4) {
  color.set(SEA.horizon.r, SEA.horizon.g, SEA.horizon.b, 1);
}
