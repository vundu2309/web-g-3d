import {
  MAX_WAVE_HEIGHT,
  glslHorizontalFade,
  glslWaveDisplace,
  glslWaveHeight,
} from "./waves.ts";

/**
 * Clear water: the sea is see-through, read from depth. The main pass draws hulls, piles, rocks,
 * buoys and fish in colour as always; a small layer (`clear-water-pass.ts`) holds only the camera
 * distance of whatever lies under the waves, and the sea, drawn after the opaque meshes, blends
 * over them: it is thinner the less water there is between the surface and the thing. This file is
 * the pure part: the rules (how far it reaches, what can lie under the water, when it is switched
 * off for slow frames) and the GLSL for the depth layer and for the water's side of it. See
 * docs/ocean.md, "Clear water". (The earlier colour layer, drawn and tinted separately, was removed
 * on 2026-11-20 when this became the only mode.)
 */

/** The depth layer is this fraction of the canvas in each direction. */
export const UNDER_SCALE = 0.75;
/** The size of the layer for a canvas of this many pixels. */
export function underSize(width: number, height: number) {
  return {
    width: Math.max(2, Math.round(width * UNDER_SCALE)),
    height: Math.max(2, Math.round(height * UNDER_SCALE)),
  };
}

/** The rules of how the water treats what is under it. All lengths in metres. */
export const CLEAR = {
  /** How fast what lies under the water is lost to sight (1 / m, along the view ray). */
  see: 0.2,
  /** A thing right under the surface fades in over this depth (m) instead of starting at full strength at the waterline: no hard saw-tooth edge where a hull meets the waves. */
  waterline: 0.3,
  /** Nothing above this height is ever under the water: the layer's shader gives up on it at once. */
  top: MAX_WAVE_HEIGHT + 0.25,
  /** The layer's meshes farther than this from the camera are left out: a keel or a pile at that distance is seen at a grazing angle, where the mirror covers it. */
  reach: 170,
  /** A market pier is a 15,600 triangle mesh (stall, awning, sign) of which only the piles are under the water: it is drawn only this close. */
  marketReach: 70,
} as const;

/** A phone draws the layer (and reads it in the sea shader) only this close (m): the GPU is its weak part and sight under the water is short anyway. */
export const TOUCH_REACH = 70;
const onTouch =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches ?? false);
/** How far (m) from the camera the see-through layer reaches on this device. */
export const LAYER_REACH = onTouch ? TOUCH_REACH : CLEAR.reach;
/** How far from the camera (m) a mesh of this name is drawn on the layer. */
export function underwaterReach(name: string): number {
  return name.startsWith("market-")
    ? Math.min(CLEAR.marketReach, LAYER_REACH)
    : LAYER_REACH;
}

/**
 * Meshes that can lie under the water and are drawn on the layer: the boats' hulls (the Blender
 * boat's hulls and instances, the code-built boat), the market piers (their piles), the rocks,
 * the buoys and the hooked fish. Not the sea floor (the sea paints its own) and not the fishing
 * line (the gear keeps its own skin under the water). By name, like the mirror's list
 * (reflection-model.ts), so what is built later (other players' boats) joins by itself.
 */
export function underwaterCapable(name: string): boolean {
  if (name.startsWith("hooked-fish")) return true;
  if (/^school-fish-\d/.test(name)) return true;
  if (name.startsWith("boat-model-") && !name.endsWith("-lamp-glow"))
    return true;
  if (/^boat-\d+$/.test(name)) return true;
  if (name.endsWith("-hull")) return true;
  if (name.startsWith("market-") && !name.startsWith("market-sign"))
    return true;
  if (/^(model-)?rock-\d+/.test(name)) return true;
  if (name === "buoy" || /^buoy-\d+$/.test(name)) return true;
  return false;
}

// ----- The quality switch -----

/** How the layer is kept affordable: it is switched off for good measure when the frames are slow. */
export const QUALITY = {
  /** Seconds at the start that tell nothing (shader compiles, texture uploads). */
  warmup: 4,
  /** Seconds per decision. */
  window: 2,
  /** An average frame interval above this is slow (below about 19 frames a second), the same bar the render scale uses. */
  slow: 0.052,
  /** Below this the 30 frames a second cap is met with room to spare. */
  fast: 0.04,
  /** Slow windows in a row that switch the layer off. */
  slowToOff: 2,
  /** Fast windows in a row (while it is off) that try it again. */
  fastToOn: 8,
  /** It is switched on again at most this many times: a phone that cannot hold it keeps the opaque sea for good. */
  retries: 2,
} as const;

/**
 * Decides, from the frame intervals, whether the see-through sea is drawn. It starts on (if the
 * device can draw it), goes off after two slow windows in a row and comes back after eight fast
 * ones (16 s), at most twice; after that the opaque sea stays. Pure, driven by `sample(dt)`.
 */
export class ClearWaterGovernor {
  private on: boolean;
  private elapsed = 0;
  private window = 0;
  private frames = 0;
  private slow = 0;
  private fast = 0;
  private tries = 0;
  private readonly available: boolean;
  private pinned = false;
  constructor(
    /** False for a device (or a test) that never draws it. */
    available = true,
    /** True to start with it on. */
    startOn = true,
  ) {
    this.available = available;
    this.on = available && startOn;
  }
  get enabled() {
    return this.on;
  }
  /** True while it may still come back after being switched off. */
  get mayReturn() {
    return this.available && this.tries <= QUALITY.retries;
  }
  /** Forces the state (a switch in a settings screen, a test); the governor goes on from there. */
  set(on: boolean) {
    this.on = this.available && on;
    this.slow = 0;
    this.fast = 0;
    // A new start: the window in progress was measured under the old state.
    this.window = 0;
    this.frames = 0;
  }
  /** Pins the state (a test, a settings switch): `sample` then never changes it, until `unlock`. */
  lock(on: boolean) {
    this.set(on);
    this.pinned = true;
  }
  unlock() {
    this.pinned = false;
  }
  get locked() {
    return this.pinned;
  }
  /** Feed the seconds since the previous drawn frame; returns the new state when it changes. */
  sample(dt: number): boolean | undefined {
    if (!this.available || this.pinned || !(dt > 0) || dt > 1) return undefined;
    this.elapsed += dt;
    if (this.elapsed < QUALITY.warmup) return undefined;
    this.window += dt;
    this.frames++;
    if (this.window < QUALITY.window) return undefined;
    const average = this.window / this.frames;
    this.window = 0;
    this.frames = 0;
    if (this.on) {
      this.fast = 0;
      if (average > QUALITY.slow) {
        if (++this.slow >= QUALITY.slowToOff) {
          this.slow = 0;
          this.on = false;
          this.tries++;
          return false;
        }
      } else this.slow = 0;
    } else {
      this.slow = 0;
      if (average < QUALITY.fast && this.mayReturn) {
        if (++this.fast >= QUALITY.fastToOn) {
          this.fast = 0;
          this.on = true;
          return true;
        }
      } else this.fast = 0;
    }
    return undefined;
  }
}

// ----- GLSL -----

const f = (value: number, digits = 4) => value.toFixed(digits);

/**
 * GLSL, the layer's vertex shader: world position, normal and vertex colour of any mesh of the
 * game (single or instanced), drawn with the scene's camera.
 */
export const UNDER_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
#ifdef INSTANCES
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
#else
uniform mat4 world;
#endif
uniform mat4 viewProjection;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vColor;
void main() {
#ifdef INSTANCES
  mat4 finalWorld = mat4(world0, world1, world2, world3);
#else
  mat4 finalWorld = world;
#endif
  vec4 wp = finalWorld * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = mat3(finalWorld) * normal;
  vColor = color;
  gl_Position = viewProjection * wp;
}`;

// ----- The depth layer and the sea's side of it -----

/** The depth layer holds the distance (m) from the camera, over this range, packed in two bytes. */
export const DEPTH_RANGE = 512;

/**
 * GLSL, the depth layer's fragment shader: only what is under the waves is kept, and what is
 * written is how far from the camera it is (two bytes, high and low), alpha 1. The things
 * themselves are drawn by the main pass as always; the sea, drawn after them, blends over them.
 */
export const UNDER_DEPTH_FRAGMENT = `
precision highp float;
uniform float time;
uniform vec3 cameraPosition;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vColor;
${glslWaveHeight()}
${glslHorizontalFade()}
${glslWaveDisplace()}
void main() {
  if (vWorld.y > ${f(CLEAR.top)}) discard;
  if (seaHeight(vWorld.xz, time) - vWorld.y < 0.0) discard;
  float d = clamp(length(cameraPosition - vWorld) / ${f(DEPTH_RANGE, 1)}, 0.0, 0.9999) * 255.0;
  float high = floor(d);
  gl_FragColor = vec4(high / 255.0, d - high, 0.0, 1.0);
}`;

/**
 * GLSL for the sea in the depth mode: `float seeThroughAlpha(float dist)` is how opaque the sea is
 * at this pixel, `dist` being the distance to the sea here. Where a thing lies under the water
 * behind this pixel, the sea is thinner the less water there is between: the thing is read from the
 * framebuffer by the blend itself. The caller declares `underMap` and `screenSize`.
 */
export const glslSeeThrough = () => `
float seeThroughAlpha(float dist) {
  vec4 t = texture2D(underMap, gl_FragCoord.xy / screenSize);
  if (t.a < 0.5) return 1.0;
  float thick = (t.r * 255.0 + t.g) / 255.0 * ${f(DEPTH_RANGE, 1)} - dist;
  if (thick <= 0.0) return 1.0;
  float sight = exp(-${f(CLEAR.see)} * thick) * smoothstep(0.0, ${f(CLEAR.waterline)}, thick);
  return 1.0 - sight;
}
`;
