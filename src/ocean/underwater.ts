import type { FightMood } from "./fight.ts";
import { UNDER_THE_SEA } from "./reflection-model.ts";
import { glslWaveHeight } from "./waves.ts";
import { WATER_ABSORPTION } from "./sea-style.ts";

/**
 * A hooked fish fights UNDER the water. The sea is an opaque shader that writes depth, so
 * anything below the surface is hidden by it; this file holds the pure rules and the two GLSL
 * programs that draw a fish (and the bit of line below the surface) through the water instead:
 *
 * - the mesh keeps its true place (below the waterline, bobbing with the waves);
 * - the vertex shader writes a depth as if each point lay where the view ray crosses the water
 *   plane (squeezed so the parts of the fish keep their order), so the water, which was drawn
 *   first, does not hide it while an island or a hull in front of the surface still does;
 * - the fragment shader draws nothing above the real wave height (`waveHeight`, the same
 *   function the sea mesh and the boats use) and tints what is below: the deeper, the more it
 *   fades into the water's colour, loses its shading and colour and turns transparent, until at
 *   a metre it is a faint dark shape.
 *
 * It is drawn in the ordinary transparent queue after the water: no extra pass, one draw call
 * per mesh. Pure (no Babylon); `underwater-material.ts` is the thin GPU part.
 */

/** The name of the material (so the sea's mirror can leave the meshes that wear it out: they lie under y = 0). */
export const UNDERWATER_MATERIAL = UNDER_THE_SEA;

/** How fast the fish loses its colour and opacity with depth (1 / m): clarity = exp(-rate x depth). */
export const CLARITY_RATE = 1.2;
/**
 * How opaque a fish is at the surface and deep down (alpha = mix(deep, near, clarity)). The fishing
 * line is a thin thing seen through the water: it stays at least this opaque and keeps at least this
 * share of its clarity, so it can be followed down to the fish's mouth.
 */
export const ALPHA = { near: 0.96, deep: 0.3 } as const;
export const LINE_VISIBLE = { alpha: 0.8, clarity: 0.55 } as const;
/**
 * The depth buffer sees a point of the fish as if it lay where the view ray crosses a plane this
 * far above the sea's level under it (m), so that a swell between the camera and the fish does not
 * hide it, and squeezed toward that point by this fraction so the parts still order themselves.
 */
export const DEPTH_BIAS = 0.5;
/** A fish that sinks deeper than this (a fish put back, falling) fades out between these two depths (m). */
export const FADE_OUT = { from: 1.4, to: 2.6 } as const;
export const DEPTH_SQUEEZE = 0.05;
/** Fish under this much water never go there: the body is never nearer the surface than this share of its length. */
export const BELLY = 0.2;

const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));

/** How much of the fish's own look is left at `depth` metres under the water (1 at the surface). */
export function clarity(depth: number): number {
  return Math.exp(-CLARITY_RATE * Math.max(0, depth));
}

/** Opacity of a fish at `depth` metres, as the shader draws it. */
export function fishAlpha(depth: number): number {
  const c = clarity(depth);
  const gone = clamp((depth - FADE_OUT.from) / (FADE_OUT.to - FADE_OUT.from));
  return (
    (ALPHA.deep + (ALPHA.near - ALPHA.deep) * c) *
    (1 - gone * gone * (3 - 2 * gone))
  );
}

/**
 * How deep the middle of the body swims by mood (m below the surface, before the size and the
 * floor limit it): shallow and thrashing when it surges, deep and steady when strong, near the
 * surface and rolling when tired.
 */
export function moodDepth(mood: FightMood, time: number): number {
  if (mood === "surge") return 0.42 + 0.1 * Math.sin(time * 7.3);
  if (mood === "strong") return 0.88 + 0.12 * Math.sin(time * 0.9);
  return 0.4 + 0.07 * Math.sin(time * 1.3);
}

export interface SwimInput {
  mood: FightMood;
  time: number;
  /** The fish as drawn (m). */
  length: number;
  /** The still water above the floor right here (m): the fish keeps inside it. */
  water: number;
}

/**
 * The depth of the middle of the body (m below the surface): the mood's depth, but at least
 * deep enough that the back is under the water, and never in the lower part of the water over
 * a shallow floor.
 */
export function swimDepth({ mood, time, length, water }: SwimInput): number {
  const wanted = Math.max(moodDepth(mood, time), BELLY * length + 0.08);
  return clamp(wanted, 0.06, Math.max(0.06, water * 0.6));
}

export interface SwimPose {
  /** Roll about the long axis (rad). */
  roll: number;
  /** Nose up (+) or down (-) (rad). */
  pitch: number;
  /** The body's sway about the vertical, added to the heading (rad); the tail beats against it. */
  wiggle: number;
}

/** Roll, pitch and sway of the body by mood, so it swims (nose where it pulls) and does not slide. */
export function swimPose(
  mood: FightMood,
  time: number,
  beat: number,
): SwimPose {
  const phase = time * beat * 2 * Math.PI;
  if (mood === "surge")
    return {
      roll: Math.sin(time * 11) * 0.5,
      pitch: -0.1 + 0.08 * Math.sin(time * 9),
      wiggle: Math.sin(phase) * 0.3,
    };
  if (mood === "tired")
    // It rolls on its side and, now and then, shows its belly.
    return {
      roll:
        1.0 +
        0.3 * Math.sin(time * 1.3) +
        0.6 * Math.max(0, Math.sin(time * 0.6)) ** 2,
      pitch: 0.05 * Math.sin(time * 0.8),
      wiggle: Math.sin(phase) * 0.06,
    };
  return {
    roll: Math.sin(time * 2.4) * 0.2,
    pitch: -0.14,
    wiggle: Math.sin(phase) * 0.15,
  };
}

/**
 * How strongly the sea is disturbed over the fish (0..1): a V of ripples when it surges, a
 * faint boil when it rolls tired near the surface, hardly anything when it is deep and strong.
 */
export function disturbance(mood: FightMood, depth: number): number {
  const base = mood === "surge" ? 1 : mood === "tired" ? 0.6 : 0.2;
  return clamp(base * (1.3 - depth), 0, 1);
}

/**
 * How turquoise (1) or deep blue (0) the water is that the fish fades into, from the still water over
 * the floor here (m): the sea's own rule (water.ts: the shallow colour fades out between 3 and 13 m).
 */
export function shoal(water: number): number {
  const t = clamp((water - 3) / 10);
  return 1 - t * t * (3 - 2 * t);
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Where the line dives through the surface: the point of the straight line from the rod tip to
 * the fish's mouth (below the water) where it meets the sea (found by bisection on the wave
 * height), with its height. A mouth that is not under the surface, or a tip that is not above
 * it, ends the line where the mouth is.
 */
export function surfaceEntry(
  tip: Point3,
  mouth: Point3,
  surfaceAt: (x: number, z: number) => number,
): Point3 {
  const height = (t: number) => {
    const x = tip.x + (mouth.x - tip.x) * t;
    const z = tip.z + (mouth.z - tip.z) * t;
    return tip.y + (mouth.y - tip.y) * t - surfaceAt(x, z);
  };
  if (height(0) <= 0 || height(1) >= 0) return { ...mouth };
  let low = 0;
  let high = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    if (height(mid) > 0) low = mid;
    else high = mid;
  }
  const t = (low + high) / 2;
  const x = tip.x + (mouth.x - tip.x) * t;
  const z = tip.z + (mouth.z - tip.z) * t;
  return { x, y: surfaceAt(x, z), z };
}

/**
 * The depth the buffer is given for a point (NDC), see `DEPTH_BIAS`: `ndcSurface` is the depth of the
 * point where the view ray meets the plane, `ndcPoint` that of the point itself. Mirrors the vertex shader.
 */
export function bufferDepth(ndcSurface: number, ndcPoint: number): number {
  return ndcSurface + (ndcPoint - ndcSurface) * DEPTH_SQUEEZE;
}

const f = (value: number) => value.toFixed(4);

export const UNDERWATER_VERTEX = `
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
uniform mat4 world;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform float surface;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vColor;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = mat3(world) * normal;
  vColor = color;
  vec4 clip = viewProjection * wp;
  // Where the view ray through this point crosses the plane a little above the sea under the fish:
  // the depth the water's own depth is compared with (the point itself lies behind the water).
  vec3 ray = wp.xyz - cameraPosition;
  float t = ray.y < -0.001 ? clamp((surface + ${f(DEPTH_BIAS)} - cameraPosition.y) / ray.y, 0.0, 1.0) : 1.0;
  vec4 onPlane = viewProjection * vec4(cameraPosition + ray * t, 1.0);
  float zSurface = onPlane.z / max(onPlane.w, 0.001);
  float zPoint = clip.z / clip.w;
  gl_Position = vec4(clip.xy, (zSurface + (zPoint - zSurface) * ${f(DEPTH_SQUEEZE)}) * clip.w, clip.w);
}`;

export const UNDERWATER_FRAGMENT = `
precision highp float;
uniform float time;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 murk;
uniform vec3 tint;
uniform float shade;
uniform float cut;
uniform float fade;
uniform vec2 floorKeep;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vColor;
${glslWaveHeight()}
void main() {
  // Depth under the sea as it really is under this pixel (the shared wave function).
  float depth = waveHeight(vWorld.xz, time) - vWorld.y;
  // Nothing of the fish is ever drawn above the water (unless it is leaping out of it: cut = 0).
  if (cut > 0.5 && depth < 0.0) discard;
  float d = max(depth, 0.0);
  float c = max(exp(-${f(CLARITY_RATE)} * d), floorKeep.y);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  // The light flattens with depth: a soft rim of sun near the top, an even glow below.
  float lit = mix(0.85, 0.7 + 0.45 * max(dot(n, sunDirection), 0.0), shade);
  vec3 base = vColor.rgb * tint * lit;
  // Red goes first, then green (the same absorption as the sea), and the colours drain.
  base *= exp(-vec3(${WATER_ABSORPTION.map((v) => f(v * 2.5)).join(", ")}) * d);
  float grey = dot(base, vec3(0.3, 0.59, 0.11));
  base = mix(vec3(grey), base, c);
  vec3 color = mix(murk, base, c);
  float alpha = mix(floorKeep.x, ${f(ALPHA.near)}, c) * (1.0 - smoothstep(${f(FADE_OUT.from)}, ${f(FADE_OUT.to)}, d)) * fade;
  gl_FragColor = vec4(color, alpha);
}`;
