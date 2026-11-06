import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { islands } from "./model.ts";
import { glslWaveHeight } from "./waves.ts";
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

Effect.ShadersStore["seaVertexShader"] = `
${COMMON}
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform vec3 anchor;
varying vec3 vWorld;
varying float vHeight;
void main() {
  vec3 p = position;
  p.x += anchor.x;
  p.z += anchor.z;
  p.y = waveHeight(p.xz, time);
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
varying vec3 vWorld;
varying float vHeight;
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
void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 view = toCamera / dist;
  // The exact slope of the waves, with the short ones faded out with distance.
  vec2 slope = waveSlope(vWorld.xz, time, dist);
  // Fine ripples: two crossing layers, drifting, gone before they would shimmer.
  float ripple = 1.0 - smoothstep(25.0, 130.0, dist);
  vec2 q = vWorld.xz;
  vec2 detail = vec2(0.0);
  if (ripple > 0.0) {
  detail += vec2(0.8, 0.6) * cos(dot(q, vec2(0.8, 0.6)) * 3.1 + time * 1.9 + sin(dot(q, vec2(-0.6, 0.8)) * 0.9) * 2.0) * 0.075;
  detail += vec2(-0.5, 0.87) * cos(dot(q, vec2(-0.5, 0.87)) * 4.3 - time * 1.4 + sin(dot(q, vec2(0.9, 0.4)) * 0.7) * 2.0) * 0.05;
  }
  vec3 n = normalize(vec3(-slope.x - detail.x * ripple, 1.0, -slope.y - detail.y * ripple));
  float fresnel = mix(0.03, 1.0, pow(1.0 - max(dot(n, view), 0.0), 4.5));
  vec3 reflected = reflect(-view, n);
  float sky = clamp(reflected.y, 0.0, 1.0);
  vec3 skyColor = mix(horizon, zenith, pow(sky, 0.55));
  // Shore: how far this water is from the nearest beach.
  float shore = 1.0e3;
  for (int i = 0; i < ${islands.length}; i++)
    shore = min(shore, distance(vWorld.xz, islands[i].xy) - islands[i].z);
  float near = 1.0 - smoothstep(0.0, 26.0, shore);
  // Body colour: deeper with distance from land, lighter on the crests.
  vec3 body = mix(deep, shallow, clamp(0.35 + vHeight * 0.8 + near * 0.55, 0.0, 1.0));
  // Light through the waves: crests seen against the sun glow green-blue.
  float against = pow(clamp(dot(-view, normalize(vec3(sunDirection.x, 0.0, sunDirection.z))) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  float thin = smoothstep(0.0, 0.8, vHeight * 1.2 + length(slope) * 1.5);
  body += vec3(0.05, 0.42, 0.34) * against * thin * 0.55;
  vec3 color = mix(body, skyColor, fresnel);
  // Sun glitter: a sharp core and a broad soft path; wider with distance so it never sparkles.
  float sun = max(dot(reflected, normalize(sunDirection)), 0.0);
  float tight = mix(300.0, 60.0, smoothstep(40.0, 320.0, dist));
  color += vec3(1.0, 0.94, 0.8) * (pow(sun, tight) * 1.5 + pow(sun, 18.0) * 0.12);
  // Foam: white caps on steep crests, broken up by noise, and a surf line at the beach.
  float cap = smoothstep(0.46, 0.92, vHeight * 0.9 + length(slope) * 0.9);
  // The foam pattern is only worked out where there can be foam (steep crests, the beach).
  if (cap > 0.0 || shore < 10.0) {
    float lace = noise(vWorld.xz * 1.35 + vec2(time * 0.25, -time * 0.18)) * 0.65 + noise(vWorld.xz * 3.7 - time * 0.4) * 0.35;
    float foam = cap * smoothstep(0.38, 0.72, lace);
    float edge = shore + sin(time * 0.9 + vWorld.x * 0.2) * 0.9 + (lace - 0.5) * 2.4;
    float surf = (1.0 - smoothstep(0.4, 3.4, edge)) * smoothstep(-1.2, 0.2, edge);
    float trail = (1.0 - smoothstep(2.8, 6.0, edge)) * smoothstep(2.2, 3.0, edge) * smoothstep(0.55, 0.8, lace) * 0.55;
    foam = clamp(max(foam * 0.85, max(surf, trail)), 0.0, 1.0);
    color = mix(color, vec3(0.95, 0.98, 1.0), foam);
  }
  float fog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  color = mix(color, horizon, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
}`;

export interface Water {
  mesh: Mesh;
  /** Keeps the grid centred under the camera and advances the wave clock. */
  update(cameraX: number, cameraZ: number, time: number): void;
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
  material.setArray4(
    "islands",
    islands.flatMap((island) => [island.x, island.z, island.radius, 0]),
  );
  mesh.material = material;
  const anchor = new Vector3();
  return {
    mesh,
    update(cameraX, cameraZ, time) {
      material.setFloat("time", time);
      anchor.set(cameraX, 0, cameraZ);
      material.setVector3("anchor", anchor);
      material.setVector3(
        "cameraPosition",
        scene.activeCamera?.position ?? anchor,
      );
    },
  };
}
