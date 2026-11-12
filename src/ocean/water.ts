import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { islands } from "./model.ts";
import { WAKE_MAX, glslWake } from "./wake.ts";
import { glslWaveHeight } from "./waves.ts";
import { glslSkyModel } from "./sky-model.ts";
import {
  DEEP_WATER,
  FOG_DENSITY,
  HORIZON,
  SHALLOW_WATER,
  SUN_DIRECTION,
  ZENITH,
} from "./sea-style.ts";

/**
 * The sea: a camera-following grid displaced by the same wave function the
 * physics floats on. Reflection is the analytic sky (no extra render pass), which
 * keeps the cost near a plain mesh on phones.
 */
const COMMON = `
precision highp float;
uniform float time;
${glslWaveHeight()}
`;

/** How many boats cast a shadow on the water at once (the nearest ones, yours first). */
export const BOAT_MAX = 12;
export interface BoatSpot {
  x: number;
  z: number;
  heading: number;
}
/** Packs boats into the shader's vec4 array: x, z, heading, 1 for a boat and 0 for empty. */
export function packBoats(boats: readonly BoatSpot[]): number[] {
  const out = new Array<number>(BOAT_MAX * 4).fill(0);
  boats.slice(0, BOAT_MAX).forEach((boat, i) => {
    out.splice(i * 4, 4, boat.x, boat.z, boat.heading, 1);
  });
  return out;
}

Effect.ShadersStore["seaVertexShader"] = `
${COMMON}
${glslWake()}
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform vec3 anchor;
varying vec3 vWorld;
varying float vHeight;
varying vec4 vWake;
void main() {
  vec3 p = position;
  p.x += anchor.x;
  p.z += anchor.z;
  // The wake of the boats is added to the waves: height, slope and white water.
  vec4 wakeHere = wakeAt(p.xz, time);
  vWake = wakeHere;
  p.y = waveHeight(p.xz, time) + wakeHere.x;
  vWorld = p;
  vHeight = p.y;
  gl_Position = worldViewProjection * vec4(p, 1.0);
}`;

Effect.ShadersStore["seaFragmentShader"] = `
${COMMON}
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 deep;
uniform vec3 shallow;
uniform float fogDensity;
uniform vec4 islands[${islands.length}];
uniform vec4 boats[${BOAT_MAX}];
varying vec3 vWorld;
varying float vHeight;
varying vec4 vWake;
${glslSkyModel()}
// A hash without sin(): cheaper on phone GPUs.
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// GGX / Trowbridge-Reitz normal distribution and Smith visibility (the sun's glitter).
float distributionGGX(float nh, float a) {
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}
float visibilitySmith(float nl, float nv, float a) {
  float k = a * 0.5;
  return 0.25 / ((nl * (1.0 - k) + k) * (nv * (1.0 - k) + k));
}
// The shadow of the boats on the water: the sun is low, so each hull throws a long shadow
// downwind. A boat is three slices (hull, cabin, mast) each at its own height, and the shadow
// of a slice is the slice shifted along the sun's ground direction by height / tan(elevation).
float boatShadow(vec2 p, vec3 sunDir) {
  vec2 away = -sunDir.xz / max(sunDir.y, 0.15);
  float dark = 0.0;
  for (int i = 0; i < ${BOAT_MAX}; i++) {
    vec4 boat = boats[i];
    if (boat.w < 0.5 || distance(p, boat.xy) > 22.0) continue;
    vec2 fwd = vec2(sin(boat.z), -cos(boat.z));
    vec2 side = vec2(cos(boat.z), sin(boat.z));
    for (int k = 0; k < 3; k++) {
      float h = k == 0 ? 0.5 : (k == 1 ? 1.7 : 3.4);
      float halfLength = k == 0 ? 4.0 : (k == 1 ? 2.0 : 0.45);
      float halfWidth = k == 0 ? 1.8 : (k == 1 ? 1.3 : 0.4);
      float shift = k == 1 ? 1.4 : 0.0;
      vec2 d = p - boat.xy - away * h - fwd * shift;
      float u = dot(d, fwd) / halfLength;
      float v = dot(d, side) / halfWidth;
      dark = max(dark, 1.0 - smoothstep(0.55, 1.05, length(vec2(u, v))));
    }
  }
  return dark;
}
void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 view = toCamera / dist;
  vec3 sunDir = normalize(sunDirection);
  // The exact slope of the waves, with the short ones faded out with distance.
  vec2 slope = waveSlope(vWorld.xz, time, dist) + vWake.yz;
  // Fine ripples: two crossing layers, drifting, gone before they would shimmer.
  float ripple = 1.0 - smoothstep(25.0, 130.0, dist);
  vec2 q = vWorld.xz;
  vec2 detail = vec2(0.0);
  if (ripple > 0.0) {
  detail += vec2(0.8, 0.6) * cos(dot(q, vec2(0.8, 0.6)) * 3.1 + time * 1.9 + sin(dot(q, vec2(-0.6, 0.8)) * 0.9) * 2.0) * 0.075;
  detail += vec2(-0.5, 0.87) * cos(dot(q, vec2(-0.5, 0.87)) * 4.3 - time * 1.4 + sin(dot(q, vec2(0.9, 0.4)) * 0.7) * 2.0) * 0.05;
  }
  vec3 n = normalize(vec3(-slope.x - detail.x * ripple, 1.0, -slope.y - detail.y * ripple));
  float nv = max(dot(n, view), 0.02);
  // Roughness: the waves too small to draw make the sea rougher the farther it is.
  float rough = clamp(0.04 + 0.5 * smoothstep(20.0, 400.0, dist) + 0.5 * length(slope) * 0.15, 0.04, 0.6);
  float alpha = rough * rough;
  // Schlick's Fresnel for water (F0 about 0.02), tamed at grazing angles on a rough sea.
  float f0 = 0.02;
  float fresnel = f0 + (max(1.0 - rough, f0) - f0) * pow(1.0 - nv, 5.0);
  // What the sea mirrors: the same sky the dome draws (the sun itself is added below with GGX).
  vec3 reflected = reflect(-view, n);
  reflected.y = abs(reflected.y);
  vec3 mirror = skyRadiance(reflected, false);
  // Shore and depth: how far this water is from the nearest beach, and how deep it is there.
  float shore = 1.0e3;
  for (int i = 0; i < ${islands.length}; i++)
    shore = min(shore, distance(vWorld.xz, islands[i].xy) - islands[i].z);
  float near = 1.0 - smoothstep(0.0, 26.0, shore);
  float depth = mix(40.0, 0.4, near);
  // Light that goes in and comes back: Beer-Lambert absorption (red is eaten first, then green),
  // the bottom showing through the shallows, and scattering from the water itself.
  vec3 absorb = vec3(0.52, 0.10, 0.045);
  vec3 transmit = exp(-absorb * depth * 2.0);
  vec3 skyIrradiance = mix(toLinear(horizon), toLinear(zenith), 0.6);
  float nl = max(dot(vec3(0.0, 1.0, 0.0), sunDir), 0.0);
  float shade = boatShadow(vWorld.xz, sunDir);
  float sunlit = 1.0 - 0.9 * shade;
  vec3 incident = skyIrradiance * 0.55 + sunColor() * SUN_RADIANCE * nl * 0.55 * sunlit;
  vec3 scatterColor = toLinear(deep) * 1.2 + toLinear(shallow) * 0.25;
  vec3 bottom = vec3(0.78, 0.68, 0.46) * incident * 0.35;
  vec3 body = (bottom * transmit + scatterColor * incident * (1.0 - transmit * 0.8)) * 0.55;
  // Light through the waves: crests seen against the sun glow green-blue (subsurface).
  float against = pow(clamp(dot(-view, normalize(vec3(sunDir.x, 0.0, sunDir.z))) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  float thin = smoothstep(0.0, 0.8, vHeight * 1.2 + length(slope) * 1.5);
  body += vec3(0.02, 0.32, 0.26) * against * thin * incident * 0.35;
  // In the shadow the water is lit by the sky alone, and the sky it mirrors is partly blocked by the hull.
  body *= 1.0 - 0.45 * shade;
  vec3 color = body * (1.0 - fresnel) + mirror * (fresnel * (1.0 - 0.3 * shade));
  // The sun on the water: GGX specular, a bright glitter path whose width grows with roughness.
  vec3 halfway = normalize(view + sunDir);
  float nh = max(dot(n, halfway), 0.0);
  float nlSun = max(dot(n, sunDir), 0.0);
  float vh = max(dot(view, halfway), 0.0);
  float fSun = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  float specular = distributionGGX(nh, max(alpha, 0.0009)) * visibilitySmith(nlSun, nv, max(alpha, 0.03)) * fSun * nlSun;
  color += sunColor() * SUN_RADIANCE * min(specular, 40.0) * sunlit;
  // Foam: white caps on steep crests, broken up by noise, and a surf line at the beach. It is a
  // rough white surface, so it takes the light that falls on it (sun and sky), not the mirror.
  float cap = smoothstep(0.46, 0.92, vHeight * 0.9 + length(slope) * 0.9);
  if (cap > 0.0 || shore < 10.0) {
    float lace = noise(vWorld.xz * 1.35 + vec2(time * 0.25, -time * 0.18)) * 0.65 + noise(vWorld.xz * 3.7 - time * 0.4) * 0.35;
    float foam = cap * smoothstep(0.38, 0.72, lace);
    float edge = shore + sin(time * 0.9 + vWorld.x * 0.2) * 0.9 + (lace - 0.5) * 2.4;
    float surf = (1.0 - smoothstep(0.4, 3.4, edge)) * smoothstep(-1.2, 0.2, edge);
    float trail = (1.0 - smoothstep(2.8, 6.0, edge)) * smoothstep(2.2, 3.0, edge) * smoothstep(0.55, 0.8, lace) * 0.55;
    foam = clamp(max(foam * 0.85, max(surf, trail)), 0.0, 1.0);
    vec3 foamColor = vec3(0.92, 0.95, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * nlSun * 0.3 * sunlit);
    color = mix(color, foamColor, foam);
  }
  // Aerial perspective: far water takes the colour of the sky toward the horizon in its own
  // direction, so the fog and the sky meet without a seam.
  vec3 haze = skyRadiance(normalize(vec3(-view.x, 0.015, -view.z)), false);
  float fog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  color = mix(color, haze, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(toScreen(color), 1.0);
}`;

export interface Water {
  mesh: Mesh;
  /** Keeps the grid centred under the camera and advances the wave clock. */
  update(
    cameraX: number,
    cameraZ: number,
    time: number,
    wake?: readonly number[],
    boats?: readonly BoatSpot[],
  ): void;
}

export function createWater(scene: Scene): Water {
  // Dense near the camera, sparse far away, so waves stay smooth where they are seen.
  const rings = 56;
  const slices = 96;
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    const radius = 4 * Math.pow(ring / rings, 2.2) * 120;
    for (let slice = 0; slice < slices; slice++) {
      const angle = (slice / slices) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }
  }
  const at = (ring: number, slice: number) =>
    ring === 0 ? 0 : 1 + (ring - 1) * slices + (slice % slices);
  for (let slice = 0; slice < slices; slice++)
    indices.push(0, at(1, slice + 1), at(1, slice));
  for (let ring = 1; ring < rings; ring++)
    for (let slice = 0; slice < slices; slice++) {
      const a = at(ring, slice);
      const b = at(ring, slice + 1);
      const c = at(ring + 1, slice);
      const d = at(ring + 1, slice + 1);
      indices.push(a, b, c, b, d, c);
    }
  const mesh = new Mesh("sea", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  const material = new ShaderMaterial(
    "sea",
    scene,
    { vertex: "sea", fragment: "sea" },
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "time",
        "anchor",
        "cameraPosition",
        "sunDirection",
        "horizon",
        "zenith",
        "deep",
        "shallow",
        "fogDensity",
        "islands",
        "wake",
        "boats",
      ],
    },
  );
  material.backFaceCulling = false;
  material.setVector3("sunDirection", SUN_DIRECTION);
  material.setColor3("horizon", HORIZON);
  material.setColor3("zenith", ZENITH);
  material.setColor3("deep", DEEP_WATER);
  material.setColor3("shallow", SHALLOW_WATER);
  material.setFloat("fogDensity", FOG_DENSITY);
  material.setArray4("wake", new Array(WAKE_MAX * 4).fill(0));
  material.setArray4("boats", new Array(BOAT_MAX * 4).fill(0));
  material.setArray4(
    "islands",
    islands.flatMap((island) => [island.x, island.z, island.radius, 0]),
  );
  mesh.material = material;
  const anchor = new Vector3();
  return {
    mesh,
    update(cameraX, cameraZ, time, wake, boats) {
      if (boats) material.setArray4("boats", packBoats(boats));
      material.setFloat("time", time);
      if (wake) material.setArray4("wake", wake as number[]);
      anchor.set(cameraX, 0, cameraZ);
      material.setVector3("anchor", anchor);
      material.setVector3(
        "cameraPosition",
        scene.activeCamera?.position ?? anchor,
      );
    },
  };
}
