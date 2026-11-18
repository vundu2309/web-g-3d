import { WATER_ABSORPTION } from "./sea-style.ts";
import {
  MAX_WAVE_HEIGHT,
  glslHorizontalFade,
  glslWaveDisplace,
  glslWaveHeight,
} from "./waves.ts";

/**
 * Clear water: the sea is see-through. The sea itself stays one opaque shader (water.ts), so
 * what lies below it (a hull's keel, the market's piles, rocks in the shallows, buoy chains, the
 * hooked fish and the line) is drawn on a small layer of its own first and the water shows that
 * layer through itself, the deeper the dimmer. This file is the pure part: the rules (how thick
 * the water is over a point, what colour is left of it, how much of it is seen, when the layer
 * is switched off) and the GLSL for the layer and for the water's side of it. `clear-water-pass.ts`
 * is the thin GPU part. See docs/ocean.md, "Clear water".
 *
 * Why a layer and not a depth texture (decision 0011, item 18): the water would have to be
 * drawn after everything, blended, with a depth copy and a colour copy of the scene (two passes
 * over the scene's 380,000 triangles and two full-size textures, and MSAA gets in the way).
 * The layer draws only the few things that can be under the water, only the part below the
 * waves, at half the canvas size.
 */

/** The layer is this fraction of the canvas in each direction (a quarter of the pixels). */
export const UNDER_SCALE = 0.75;
/** Samples per texel of the layer (multisampling, where the device has it: Babylon clamps it to what the context allows). */
export const UNDER_SAMPLES = 4;
/** The size of the layer for a canvas of this many pixels. */
export function underSize(width: number, height: number) {
  return {
    width: Math.max(2, Math.round(width * UNDER_SCALE)),
    height: Math.max(2, Math.round(height * UNDER_SCALE)),
  };
}

/** The rules of how the water treats what is under it. All lengths in metres. */
export const CLEAR = {
  /** Water refracts: the ratio of the indices (air to water), as the sea's own `refract` uses. */
  eta: 0.75,
  /** The sea is murky: absorption works over this many times the clear-water path (the floor's own is 1.7; the objects' is higher so red is gone within a metre and they turn blue-green, as they must). */
  murk: 2.4,
  /** Sunlight reaches an object along a steeper, refracted ray: its path through the water is this many times the depth. */
  sunLeg: 1.4,
  /** A refracted ray never counts as flatter than this (cosine from the vertical): keeps the path finite at grazing views. */
  minDown: 0.3,
  /** How fast what lies under the water is lost to sight (1 / m, along the refracted ray) in deep water. */
  see: 0.42,
  /** In the shallows the water is clearer: visibility is raised to this power (0.5 = twice as far). */
  shallowEase: 0.5,
  /** The shallows' clearer sight is applied only to what is already clearly seen: the faint rim of a shape stays faint (between these two sights it is blended in). */
  easeFrom: 0.1,
  easeTo: 0.4,
  /** A thing right under the surface fades in over this depth (m) instead of starting at full strength at the waterline: no hard saw-tooth edge where a hull meets the waves. */
  waterline: 0.3,
  /** What the layer shows is lit like the sea floor: the water's incident light times this. */
  light: 0.9,
  /** The layer is read a little blurred (a mip bias): what is under the water is soft, and the half-size layer has no stair-steps. */
  blur: 0.6,
  /** The ripples tilt what is seen under them by this many metres per unit of slope (the wobble of a refracted object), and never more than `wobbleMax`. */
  wobble: 0.9,
  wobbleMax: 0.7,
  /** Nothing above this height is ever under the water: the layer's shader gives up on it at once. */
  top: MAX_WAVE_HEIGHT + 0.25,
  /** The layer's meshes farther than this from the camera are left out: a keel or a pile at that distance is seen at a grazing angle, where the mirror covers it. */
  reach: 110,
  /** A market pier is a 15,600 triangle mesh (stall, awning, sign) of which only the piles are under the water: it is drawn only this close. */
  marketReach: 70,
  /** The thin line under the water keeps at least this much sight so it can be followed down to the fish. */
  lineSight: 0.85,
  /** The strip of line under the water is this many times wider on the layer (it is half the canvas: a 2 px line would break into dashes). */
  lineWiden: 1.0,
} as const;

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * The cosine (from the vertical) of the ray that goes down into the water after the view ray has
 * been refracted at the surface, for a view ray whose cosine from the vertical is `viewUp`
 * (1 looking straight down, 0 along the surface). Snell's law with `CLEAR.eta`.
 */
export function refractedDown(viewUp: number): number {
  const sin2 = (1 - clamp(viewUp) ** 2) * CLEAR.eta ** 2;
  return Math.sqrt(Math.max(1 - sin2, 0));
}

/** The length of the view ray under the surface, from the surface to a point `depth` metres down. */
export function viewPath(depth: number, viewUp: number): number {
  return Math.max(depth, 0) / Math.max(refractedDown(viewUp), CLEAR.minDown);
}

/** The whole path of the light that reaches the eye from a point `depth` metres down: down from the sun, up to the eye. */
export function lightPath(depth: number, viewUp: number): number {
  return Math.max(depth, 0) * CLEAR.sunLeg + viewPath(depth, viewUp);
}

/**
 * The share of each colour (red, green, blue) that survives a light path: the sea's own
 * absorption (red first, then green, `WATER_ABSORPTION`) over a murky path (`CLEAR.murk`).
 */
export function transmit(
  path: number,
  absorption: readonly [number, number, number],
): [number, number, number] {
  const p = Math.max(path, 0) * CLEAR.murk;
  return [
    Math.exp(-absorption[0] * p),
    Math.exp(-absorption[1] * p),
    Math.exp(-absorption[2] * p),
  ];
}

/** How much of a thing `along` metres down the refracted view ray is seen through deep water (1 at the surface, then fading). */
export function sight(along: number): number {
  return Math.exp(-CLEAR.see * Math.max(along, 0));
}

/**
 * 0 for the shallows over the sand shelf, 1 for deep water: the sea's own rule for its colour
 * (water.ts: the turquoise fades out between 3 and 13 m of water over the floor).
 */
export function deepness(waterDepth: number): number {
  return smooth(3, 13, waterDepth);
}

/**
 * Sight as the water shows it: in the shallows the water is clearer (the sight is raised to a
 * power below 1), in deep water it is as given. Continuous in the depth of the water, so nothing
 * pops where the shallows meet the deep.
 */
export function shownSight(seen: number, waterDepth: number): number {
  const power =
    CLEAR.shallowEase + (1 - CLEAR.shallowEase) * deepness(waterDepth);
  const s = clamp(seen);
  // Faint sights are left as they are (a power below 1 would raise a rim's faint edge into an outline),
  // clear ones are brought forward, with a smooth blend between: continuous in the sight.
  return s + (s ** power - s) * smooth(CLEAR.easeFrom, CLEAR.easeTo, s);
}

/** How much of a lit thing right under the surface is shown (0 at the waterline, 1 from `CLEAR.waterline` down); the line is unlit and not faded. */
export function waterlineFade(depth: number): number {
  return smooth(0, CLEAR.waterline, depth);
}

/** How much of a point `depth` metres down, seen from a ray with this cosine, is shown over `waterDepth` of water. */
export function shownAt(
  depth: number,
  viewUp: number,
  waterDepth: number,
): number {
  return shownSight(sight(viewPath(depth, viewUp)), waterDepth);
}

/** How far from the camera (m) a mesh of this name is drawn on the layer. */
export function underwaterReach(name: string): number {
  return name.startsWith("market-") ? CLEAR.marketReach : CLEAR.reach;
}

/**
 * Meshes that can lie under the water and are drawn on the layer: the boats' hulls (the Blender
 * boat's hulls and instances, the code-built boat), the market piers (their piles), the rocks,
 * the buoys and the fishing gear's fish and line. By name, like the mirror's list
 * (reflection-model.ts), so what is built later (other players' boats) joins by itself.
 */
export function underwaterCapable(name: string): boolean {
  if (name === "gear-under-line") return true;
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

/**
 * GLSL, the layer's fragment shader. It keeps only what is under the waves (the shared wave
 * function, the one the boats float on), lights it flat and warm from the sun's side, takes from
 * it what the water absorbs over its path to the eye (red first) and writes `colour x sight` with
 * `sight` as alpha, so the water can show it as `mix(water, colour, sight)`. `unlit` is 1 for the
 * fishing line (flat colour from `tint`, never fainter than `lineSight`).
 */
export const UNDER_FRAGMENT = `
precision highp float;
uniform float time;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 tint;
uniform float unlit;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vColor;
${glslWaveHeight()}
${glslHorizontalFade()}
${glslWaveDisplace()}
const vec3 absorb = vec3(${WATER_ABSORPTION.map((v) => f(v)).join(", ")});
void main() {
  // Almost every fragment of a boat is above the highest wave: gone before any wave is summed.
  if (vWorld.y > ${f(CLEAR.top)}) discard;
  float depth = seaHeight(vWorld.xz, time) - vWorld.y;
  if (depth < 0.0) discard;
  vec3 view = normalize(cameraPosition - vWorld);
  // The view ray bends toward the vertical at the surface (Snell); its length under the surface.
  float down = sqrt(max(1.0 - (1.0 - view.y * view.y) * ${f(CLEAR.eta ** 2)}, 0.0));
  float along = depth / max(down, ${f(CLEAR.minDown)});
  float path = depth * ${f(CLEAR.sunLeg)} + along;
  vec3 left = exp(-absorb * ${f(CLEAR.murk)} * path);
  float seen = exp(-${f(CLEAR.see)} * along);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float lit = mix(0.7 + 0.3 * max(dot(n, normalize(sunDirection)), 0.0), 1.0, unlit);
  vec3 albedo = pow(vColor.rgb, vec3(2.2)) * pow(tint, vec3(2.2));
  seen = max(seen, unlit * ${f(CLEAR.lineSight)});
  seen *= mix(smoothstep(0.0, ${f(CLEAR.waterline)}, depth), 1.0, unlit);
  gl_FragColor = vec4(albedo * lit * left * seen, seen);
}`;

/**
 * GLSL for the water's side: `vec4 underLayerAt(vec3 plane, vec2 slope, float deepness)` looks
 * up the layer at the water point's own screen position (moved a little by the slope of the
 * waves, which is how a refracted thing wobbles) and returns the colour of what is seen there
 * (rgb, to be lit like the sea floor) and how much of it shows (a). The caller declares
 * `underMap` and `viewProjection`.
 */
export const glslUnderLayer = () => `
vec4 underLayerAt(vec3 plane, vec2 slope, float deepness) {
  vec2 off = clamp(-slope * ${f(CLEAR.wobble)}, vec2(-${f(CLEAR.wobbleMax)}), vec2(${f(CLEAR.wobbleMax)}));
  vec4 clip = viewProjection * vec4(plane + vec3(off.x, 0.0, off.y), 1.0);
  vec2 uv = clip.xy / max(clip.w, 1.0e-4) * 0.5 + 0.5;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  vec4 layer = texture2D(underMap, clamp(uv, 0.001, 0.999), ${f(CLEAR.blur)});
  // Colour and sight come out of the layer premultiplied by each other: undo it, then clear the
  // shallows (a power below 1 on the sight) so the see-through reaches farther there.
  vec3 colour = min(layer.rgb / max(layer.a, 0.02), vec3(1.0));
  float sight = layer.a * smoothstep(0.02, 0.1, layer.a) * smoothstep(0.0, 0.03, edge) * step(0.05, clip.w);
  // Clear sights are brought forward over the shallows; faint ones (the rim of a shape) are not: continuous.
  float boosted = pow(max(sight, 1.0e-4), ${f(CLEAR.shallowEase)} + ${f(1 - CLEAR.shallowEase)} * deepness);
  sight = mix(sight, boosted, smoothstep(${f(CLEAR.easeFrom)}, ${f(CLEAR.easeTo)}, sight));
  return vec4(colour, sight);
}
`;
