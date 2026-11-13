/**
 * The sea's planar reflection, pure part (no GPU, so tests can read it). The scene is drawn a
 * second time from a camera mirrored about the water plane (reflection.ts), into a texture as
 * big as the screen; the water fragment looks that picture up at its own screen position, nudged
 * by the wave slope and blurred by the water's roughness (`glslReflection`).
 */

/** The reflection texture is this fraction of the canvas in each direction (half: a quarter of the pixels). */
export const REFLECTION_SCALE = 0.5;
/** The most the waves may move the picture, as a fraction of the screen (so it wobbles, never tears). */
export const REFLECT_WOBBLE_MAX = 0.045;
/** Blur radius (fraction of the screen height) of a perfectly calm, near patch of water. */
export const REFLECT_BLUR_MIN = 0.0012;
/** Extra blur radius per unit of roughness (rough grows with distance, see water.ts). */
export const REFLECT_BLUR_ROUGH = 0.03;
/** Extra blur radius that grows with the size of the wobble itself. */
export const REFLECT_BLUR_WOBBLE = 0.35;
/** Taps of the blur (a spiral disc, turned per pixel so the pattern does not show). */
export const REFLECT_TAPS = 9;

/** Meshes that lie on or in the water and are never mirrored: the water itself and the white water. */
const NEVER = new Set(["sea", "wake-foam", "gear-marker", "gear-shadow"]);
const NEVER_PREFIX = ["swash-", "gear-ring-"];

/**
 * Whether a mesh belongs in the reflection. A predicate over the whole scene, not a list, so the
 * islands, props, markets and boats that appear later (other players) join it by themselves.
 */
export function reflectsInWater(name: string): boolean {
  if (NEVER.has(name)) return false;
  for (const prefix of NEVER_PREFIX) if (name.startsWith(prefix)) return false;
  return true;
}

/** The reflection texture's size for a canvas of this many pixels. */
export function reflectionSize(width: number, height: number) {
  return {
    width: Math.max(2, Math.round(width * REFLECTION_SCALE)),
    height: Math.max(2, Math.round(height * REFLECTION_SCALE)),
  };
}

/** How far (screen fraction) the waves move the reflected picture: never more than the cap. */
export function cappedWobble(offset: number): number {
  return Math.min(Math.max(offset, 0), REFLECT_WOBBLE_MAX);
}

/** The blur radius (fraction of the screen height) for a roughness and a wobble. */
export function reflectionBlur(roughness: number, wobble: number): number {
  return (
    REFLECT_BLUR_MIN +
    roughness * REFLECT_BLUR_ROUGH +
    cappedWobble(wobble) * REFLECT_BLUR_WOBBLE
  );
}

const f = (value: number) => value.toFixed(5);

/**
 * GLSL: `vec4 reflectionAt(vec3 plane, vec3 mirrorDir, float dist, float rough)` returns the
 * reflected colour in linear light (rgb) and how much of the picture is real (a). The caller
 * declares `reflectionMap`, `reflectionSize` and `viewProjection`, and includes the sky model
 * (for `aces`). `plane` is the point of the water plane, `mirrorDir` the ray the waves reflect
 * the view into, turned upside down (what the mirrored camera looks along).
 */
export const glslReflection = () => `
// The picture holds screen colours (the scene is drawn gamma-space, the sky already tone mapped);
// this takes them back to linear light so the water's own tone map is applied once.
vec3 fromScreen(vec3 s) {
  vec3 y = clamp(pow(s, vec3(2.2)), 0.0, 0.985);
  vec3 a = 2.51 - 2.43 * y;
  vec3 b = 0.03 - 0.59 * y;
  return (-b + sqrt(b * b + 4.0 * a * 0.14 * y)) / (2.0 * a);
}
vec3 reflectionUv(vec3 p) {
  vec4 clip = viewProjection * vec4(p, 1.0);
  return vec3(clip.xy / max(clip.w, 1.0e-4) * 0.5 + 0.5, step(0.05, clip.w));
}
vec4 reflectionAt(vec3 plane, vec3 mirrorDir, float dist, float rough) {
  // The mirrored camera sees a point of the plane at the same screen position as the real one;
  // the waves tilt the reflected ray, which moves the point an object is seen at.
  float reach = min(dist * 0.6 + 8.0, 140.0);
  vec3 straight = reflectionUv(plane);
  vec3 tilted = reflectionUv(plane + mirrorDir * reach);
  vec2 wobble = tilted.xy - straight.xy;
  float wobbleLength = length(wobble);
  wobble *= min(1.0, ${f(REFLECT_WOBBLE_MAX)} / max(wobbleLength, 1.0e-5));
  vec2 uv = straight.xy + wobble;
  float radius = ${f(REFLECT_BLUR_MIN)} + rough * ${f(REFLECT_BLUR_ROUGH)} + min(wobbleLength, ${f(REFLECT_WOBBLE_MAX)}) * ${f(REFLECT_BLUR_WOBBLE)};
  vec2 aspect = vec2(reflectionSize.y / reflectionSize.x, 1.0);
  // Mip bias so the taps are filtered over the footprint of the blur, not just point-sampled.
  float bias = log2(max(radius * reflectionSize.y, 1.0)) - 0.5;
  float turn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  vec3 sum = vec3(0.0);
  float seen = 0.0;
  for (int i = 0; i < ${REFLECT_TAPS}; i++) {
    float k = (float(i) + 0.5) / ${REFLECT_TAPS}.0;
    float angle = turn + float(i) * 2.399963;
    vec2 tap = uv + vec2(cos(angle), sin(angle)) * sqrt(k) * radius * aspect;
    vec4 s = texture2D(reflectionMap, clamp(tap, 0.001, 0.999), bias);
    sum += s.rgb;
    seen += s.a;
  }
  // The picture is premultiplied by coverage (cleared to nothing): divide it back out.
  vec3 colour = sum / max(seen, 1.0e-4);
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float cover = seen / ${REFLECT_TAPS}.0 * smoothstep(0.0, 0.03, edge) * straight.z * tilted.z;
  return vec4(fromScreen(colour), cover);
}
`;
