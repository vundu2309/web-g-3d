import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
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
varying vec3 vWorld;
varying float vHeight;
void main() {
  float e = 0.35;
  float hx = waveHeight(vWorld.xz + vec2(e, 0.0), time) - waveHeight(vWorld.xz - vec2(e, 0.0), time);
  float hz = waveHeight(vWorld.xz + vec2(0.0, e), time) - waveHeight(vWorld.xz - vec2(0.0, e), time);
  // Fine ripples add detail the geometry cannot carry.
  float r = sin(vWorld.x * 2.3 + time * 1.7) * sin(vWorld.z * 2.9 - time * 1.3) * 0.045;
  vec3 n = normalize(vec3(-hx / (2.0 * e) + r, 1.0, -hz / (2.0 * e) - r));
  vec3 view = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
  fresnel = mix(0.04, 1.0, fresnel);
  vec3 reflected = reflect(-view, n);
  float sky = clamp(reflected.y, 0.0, 1.0);
  vec3 skyColor = mix(horizon, zenith, pow(sky, 0.55));
  vec3 body = mix(deep, shallow, clamp(0.5 + vHeight * 0.9, 0.0, 1.0));
  vec3 color = mix(body, skyColor, fresnel);
  float spec = pow(max(dot(reflected, normalize(sunDirection)), 0.0), 220.0);
  color += vec3(1.0, 0.94, 0.8) * spec * 1.6;
  float crest = smoothstep(0.55, 0.95, vHeight + 0.18 * abs(r) * 6.0);
  color = mix(color, vec3(0.93, 0.97, 1.0), crest * 0.5);
  float dist = length(cameraPosition - vWorld);
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
  mesh.material = material;
  return {
    mesh,
    update(cameraX, cameraZ, time) {
      material.setFloat("time", time);
      material.setVector3("anchor", mesh.position.set(cameraX, 0, cameraZ));
      mesh.position.set(0, 0, 0);
      material.setVector3(
        "cameraPosition",
        scene.activeCamera?.position ?? mesh.position,
      );
    },
  };
}
