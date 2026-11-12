import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import { HORIZON, SUN_DIRECTION, ZENITH } from "./sea-style.ts";
import { glslSkyModel } from "./sky-model.ts";

/** Gradient sky with a sun and drifting clouds, drawn on a dome that follows the camera. */
Effect.ShadersStore["seaSkyVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
Effect.ShadersStore["seaSkyFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 sunDirection;
uniform float time;
${glslSkyModel()}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 color = skyRadiance(d, true);
  // Clouds: thick ones are bright where the sun lights them and grey-blue in their own shade,
  // with a silver edge where they are thin and the sun shines through.
  vec2 plane = d.xz / (d.y + 0.2) * 1.4 + vec2(time * 0.012, time * 0.004);
  float density = fbm(plane);
  float cloud = smoothstep(0.5, 0.78, density) * smoothstep(0.02, 0.28, d.y);
  float toward = max(dot(d, normalize(sunDirection)), 0.0);
  // How deep into the cloud this point is (a second sample nearer the sun makes the shade).
  float lit = clamp(1.0 - (fbm(plane + normalize(sunDirection).xz * 0.25) - density) * 3.0, 0.0, 1.0);
  vec3 sunLit = sunColor() * (1.1 + 0.9 * lit);
  vec3 shade = toLinear(zenith) * 0.55 + toLinear(horizon) * 0.25;
  vec3 cloudColor = mix(shade, sunLit, lit * 0.8 + 0.2 * pow(toward, 4.0));
  float silver = pow(toward, 8.0) * (1.0 - smoothstep(0.55, 0.8, density)) * 1.4;
  cloudColor += sunColor() * silver * cloud;
  color = mix(color, cloudColor, cloud * 0.9);
  gl_FragColor = vec4(toScreen(color), 1.0);
}`;

export interface Sky {
  mesh: Mesh;
  update(cameraX: number, cameraY: number, cameraZ: number, time: number): void;
}

export function createSky(scene: Scene): Sky {
  const mesh = MeshBuilder.CreateSphere(
    "sky",
    { diameter: 2400, segments: 24, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  const material = new ShaderMaterial(
    "sky",
    scene,
    { vertex: "seaSky", fragment: "seaSky" },
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "horizon",
        "zenith",
        "sunDirection",
        "time",
      ],
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setColor3("horizon", HORIZON);
  material.setColor3("zenith", ZENITH);
  material.setVector3("sunDirection", SUN_DIRECTION);
  mesh.material = material;
  mesh.infiniteDistance = true;
  mesh.renderingGroupId = 0;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  return {
    mesh,
    update(cameraX, cameraY, cameraZ, time) {
      mesh.position.set(cameraX, cameraY, cameraZ);
      material.setFloat("time", time);
    },
  };
}
