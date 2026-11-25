import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import { ATMOSPHERE_UNIFORMS, bindAtmosphere } from "./sea-atmosphere.ts";
import { glslSkyModel } from "./sky-model.ts";

/**
 * Gradient sky with a sun and drifting clouds, drawn on a dome that follows the camera. The sky
 * follows the time of day and the weather (atmosphere.ts): the gradient and the sun come from
 * the shared model (sky-model.ts), and this adds the moon and the stars at night, and clouds
 * whose cover and darkness the weather sets (cover 0 is the few clouds the sea always had).
 */
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
uniform float sunDisc;
${glslSkyModel()}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// Stars: a few dots in a grid of cells on the sphere, each at its own place, size and twinkle.
vec3 starField(vec3 d) {
  vec3 p = d * 64.0;
  vec3 cell = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash3(cell);
  if (h < 0.93) return vec3(0.0);
  float b = (h - 0.93) / 0.07;
  vec3 off = (vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)) - 0.5) * 0.6;
  float star = smoothstep(0.1 + 0.08 * b, 0.0, length(f - off));
  float twinkle = 0.75 + 0.25 * sin(time * (1.5 + 3.0 * h) + h * 90.0);
  vec3 tint = mix(vec3(0.75, 0.88, 1.0), vec3(1.0, 0.9, 0.78), hash3(cell + 9.1));
  return tint * star * twinkle * (0.5 + 1.6 * b);
}
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
  vec3 color = skyRadiance(d, sunDisc > 0.5);
  bool withDisc = sunDisc > 0.5;
  // Night: stars, and the moon (a full disc opposite the sun, with its dark seas and a soft halo).
  if (grade.z > 0.01 && d.y > 0.0) color += starField(d) * grade.z * smoothstep(0.0, 0.3, d.y);
  vec3 moonDir = normalize(moonDirection);
  float toMoon = dot(d, moonDir);
  float moonStrength = clamp(moonLight.b * 6.0, 0.0, 1.0);
  float moonUp = smoothstep(-0.02, 0.05, d.y);
  if (toMoon > 0.9) {
    vec3 mcol = vec3(0.62, 0.74, 1.0);
    color += mcol * exp(-(1.0 - toMoon) * 260.0) * 0.45 * moonStrength * moonUp;
    if (withDisc && toMoon > 0.9980) {
      vec3 right = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(right, moonDir);
      vec2 uv = vec2(dot(d, right), dot(d, up)) / 0.0558;
      float r = length(uv);
      float edge = 1.0 - smoothstep(0.93, 1.0, r);
      float seas = smoothstep(0.46, 0.64, fbm(uv * 2.3 + 3.0));
      float body = (0.9 - 0.34 * seas) * (0.82 + 0.18 * sqrt(max(1.0 - r * r, 0.0)));
      color = mix(color, vec3(0.86, 0.91, 1.0) * body * 2.4, edge * moonStrength * moonUp);
    }
  }
  // Clouds: thick ones are bright where the sun lights them and grey-blue in their own shade,
  // with a silver edge where they are thin and the sun shines through.
  vec2 plane = d.xz / (d.y + 0.2) * 1.4 + vec2(time * 0.012, time * 0.004);
  float density = fbm(plane);
  float cover = weather.x;
  float gloom = weather.y;
  float cloud = smoothstep(0.5 - 0.32 * cover, 0.78 - 0.3 * cover, density) * smoothstep(0.02, 0.28, d.y);
  float toward = max(dot(d, normalize(sunDirection)), 0.0);
  // How deep into the cloud this point is (a second sample nearer the sun makes the shade).
  float lit = clamp(1.0 - (fbm(plane + normalize(sunDirection).xz * 0.25) - density) * 3.0, 0.0, 1.0);
  vec3 sunLit = sunColor() * (1.1 + 0.9 * lit);
  vec3 shade = toLinear(zenith) * 0.55 + toLinear(horizon) * 0.25;
  // Under a grey sky the clouds are the sky: their shade takes the colour of the haze, broken up
  // into darker and lighter masses.
  shade = mix(shade, toLinear(mix(horizon, zenith, 0.3)) * (0.7 + 0.7 * smoothstep(0.2, 0.75, density)), gloom);
  vec3 cloudColor = mix(shade, sunLit, lit * 0.8 + 0.2 * pow(toward, 4.0));
  // At night the moon lights their edges.
  cloudColor += moonLight * 0.9 * (0.4 + 0.6 * lit);
  float silver = pow(toward, 8.0) * (1.0 - smoothstep(0.55, 0.8, density)) * 1.4;
  cloudColor += sunColor() * silver * cloud;
  color = mix(color, cloudColor, cloud * mix(0.9, 1.0, cover));
  gl_FragColor = vec4(toScreen(color), 1.0);
}`;

export interface Sky {
  mesh: Mesh;
  /** The sun and moon discs are drawn, or not (the sea's mirror leaves them out: the water adds its own glitter). */
  showSun(on: boolean): void;
  /** Each frame: the dome is kept on the camera by Babylon itself (`infiniteDistance`), so only the clock is needed. */
  update(time: number): void;
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
        "time",
        "sunDisc",
        ...ATMOSPHERE_UNIFORMS,
      ],
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  bindAtmosphere(material);
  material.setFloat("sunDisc", 1);
  mesh.material = material;
  // `infiniteDistance` puts the dome on the camera by itself: its world position is the camera's PLUS
  // `position`. The position must therefore stay zero. (It was once set to the camera's too, which
  // doubled it: harmless near the middle of the sea, but past about 1,200 m, the dome's radius, the
  // camera was outside the dome and the sky showed its edge as a white shape.)
  mesh.position.setAll(0);
  mesh.infiniteDistance = true;
  mesh.renderingGroupId = 0;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  return {
    mesh,
    showSun(on) {
      material.setFloat("sunDisc", on ? 1 : 0);
    },
    update(time) {
      material.setFloat("time", time);
    },
  };
}
