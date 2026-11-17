import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import { SEA } from "./sea-atmosphere.ts";

/**
 * Rain: one mesh, one draw call, a few hundred streaks in a box around the camera. The streaks
 * fall in the vertex shader (their height is a function of the sea clock, the box wraps round
 * the camera so the rain stays where it is in the world while the camera moves), so nothing
 * is built or allocated per frame; each streak has a rank and shows only while the rain is
 * stronger than its rank, so the rain thickens and thins smoothly. The streaks are camera-facing
 * strips with a soft edge and a faded tail; the mesh is skipped by the sea's mirror (reflection-model.ts).
 */
export const RAIN_STREAKS = 1500;
export const RAIN_BOX = 60;
export const RAIN_HEIGHT = 30;

Effect.ShadersStore["seaRainVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec3 corner;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform float time;
uniform float rain;
varying float vAlpha;
varying float vSide;
const float BOX = ${RAIN_BOX.toFixed(1)};
const float HEIGHT = ${RAIN_HEIGHT.toFixed(1)};
void main() {
  vec2 rel = mod(position.xz * BOX - cameraPosition.xz, BOX) - BOX * 0.5;
  float fall = mod(position.y * HEIGHT + time * 21.0, HEIGHT);
  vec3 head = vec3(cameraPosition.x + rel.x, cameraPosition.y + HEIGHT * 0.45 - fall, cameraPosition.z + rel.y);
  vec3 dir = normalize(vec3(0.1, -1.0, 0.05));
  vec3 toStreak = head - cameraPosition;
  float dist = length(toStreak);
  vec3 right = normalize(cross(dir, toStreak / max(dist, 0.01)));
  float width = 0.006 + 0.0022 * dist;
  vec3 p = head - dir * (0.9 + 0.012 * dist) * corner.y + right * corner.x * width;
  vSide = corner.x;
  float reach = length(rel);
  float visible = step(corner.z, rain);
  vAlpha = visible * (1.0 - 0.75 * corner.y) * (1.0 - smoothstep(BOX * 0.25, BOX * 0.5, reach)) * smoothstep(0.8, 3.0, dist);
  gl_Position = viewProjection * vec4(p, 1.0);
}`;

Effect.ShadersStore["seaRainFragmentShader"] = `
precision highp float;
uniform vec3 color;
uniform float strength;
varying float vAlpha;
varying float vSide;
void main() {
  float a = vAlpha * strength * (1.0 - smoothstep(0.35, 1.0, abs(vSide)));
  if (a < 0.004) discard;
  gl_FragColor = vec4(color, a);
}`;

export interface Rain {
  mesh: Mesh;
  update(time: number): void;
}

/** A tiny deterministic random sequence, so the rain is the same on every client. */
function sequence(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The vertex data of the streaks: (cell x, phase, cell z) and (side, along, rank) per corner. */
export function rainGeometry(count = RAIN_STREAKS, seed = 20260117) {
  const random = sequence(seed);
  const positions = new Float32Array(count * 4 * 3);
  const corners = new Float32Array(count * 4 * 3);
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = random();
    const phase = random();
    const z = random();
    // Ranks are spread evenly (with a little jitter) so any fraction of them is spread evenly in space.
    const rank = (i + random() * 0.5) / count;
    for (let k = 0; k < 4; k++) {
      const v = (i * 4 + k) * 3;
      positions.set([x, phase, z], v);
      corners.set([k % 2 === 0 ? -1 : 1, k < 2 ? 0 : 1, rank], v);
    }
    const a = i * 4;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { positions, corners, indices };
}

export function createRain(scene: Scene): Rain {
  const geometry = rainGeometry();
  const mesh = new Mesh("rain", scene);
  const data = new VertexData();
  data.positions = geometry.positions;
  data.indices = geometry.indices;
  data.applyToMesh(mesh);
  mesh.setVerticesData("corner", geometry.corners, false, 3);
  const material = new ShaderMaterial(
    "rain",
    scene,
    { vertex: "seaRain", fragment: "seaRain" },
    {
      attributes: ["position", "corner"],
      uniforms: [
        "viewProjection",
        "cameraPosition",
        "time",
        "rain",
        "color",
        "strength",
      ],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setColor3("color", SEA.rainColor);
  material.setFloat("strength", 0.5);
  mesh.material = material;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.isVisible = false;
  return {
    mesh,
    update(time) {
      const rain = SEA.weather.z;
      mesh.isVisible = rain > 0.02;
      if (!mesh.isVisible) return;
      material.setFloat("rain", rain);
      material.setFloat("time", time);
      const camera = scene.activeCamera;
      if (camera) material.setVector3("cameraPosition", camera.position);
    },
  };
}
