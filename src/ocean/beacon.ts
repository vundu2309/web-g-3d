import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { beaconLevel } from "./atmosphere.ts";
import { SEA } from "./sea-atmosphere.ts";

/**
 * The lighthouse lamp at night: a soft halo that always faces the camera and two long beams that
 * sweep round the sea, drawn additively (so they add light and never hide anything), two meshes
 * and two draw calls, switched off by day. Its level comes from the shared atmosphere
 * (`beaconLevel`: dusk to dawn, dimmer in rain and mist). Purely a look.
 */
const BEAM_LENGTH = 300;
const SWEEP = 0.7; // rad/s

Effect.ShadersStore["beaconHaloVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
Effect.ShadersStore["beaconHaloFragmentShader"] = `
precision highp float;
varying vec2 vUv;
uniform vec3 color;
uniform float level;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = (exp(-r * r * 6.0) * 0.55 + exp(-r * r * 60.0) * 0.9) * (1.0 - smoothstep(0.7, 1.0, r)) * level;
  gl_FragColor = vec4(color * a, a);
}`;
Effect.ShadersStore["beaconBeamVertexShader"] =
  Effect.ShadersStore["beaconHaloVertexShader"]!;
Effect.ShadersStore["beaconBeamFragmentShader"] = `
precision highp float;
varying vec2 vUv;
uniform vec3 color;
uniform float level;
void main() {
  float along = clamp(vUv.x, 0.0, 1.0);
  float across = abs(vUv.y - 0.5) * 2.0;
  float a = pow(1.0 - along, 1.6) * (1.0 - across * across) * smoothstep(0.0, 0.02, along) * 0.3 * level;
  gl_FragColor = vec4(color * a, a);
}`;

const COLOR = new Color3(1, 0.86, 0.5);

function material(name: string, scene: Scene, shader: string) {
  const m = new ShaderMaterial(
    name,
    scene,
    { vertex: shader, fragment: shader },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "color", "level"],
      needAlphaBlending: true,
    },
  );
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.alphaMode = Constants.ALPHA_ONEONE;
  m.setColor3("color", COLOR);
  m.setFloat("level", 0);
  return m;
}

/** Two beams (one each way) as a vertical and a horizontal strip, so one is seen from any side. */
export function beamGeometry(length = BEAM_LENGTH) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const strip = (dir: number, vertical: boolean) => {
    const base = positions.length / 3;
    for (const t of [0, 1]) {
      const x = dir * (0.8 + t * length);
      const w = 1.2 + t * 14;
      for (const side of [-1, 1]) {
        positions.push(x, vertical ? side * w : 0, vertical ? 0 : side * w);
        uvs.push(t, side * 0.5 + 0.5);
      }
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  };
  for (const dir of [1, -1]) {
    strip(dir, true);
    strip(dir, false);
  }
  return { positions, uvs, indices };
}

export interface Beacon {
  update(time: number): void;
}

/** A lamp at a world position. */
export function createBeacon(
  scene: Scene,
  at: { x: number; y: number; z: number },
  name = "beacon",
): Beacon {
  const haloMaterial = material(`${name}-halo`, scene, "beaconHalo");
  const halo = new Mesh(`${name}-halo`, scene);
  const size = 22;
  const quad = new VertexData();
  quad.positions = [
    -size / 2,
    -size / 2,
    0,
    size / 2,
    -size / 2,
    0,
    -size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    0,
  ];
  quad.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
  quad.indices = [0, 1, 2, 1, 3, 2];
  quad.applyToMesh(halo);
  halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
  halo.material = haloMaterial;

  const beamMaterial = material(`${name}-beam`, scene, "beaconBeam");
  const beam = new Mesh(`${name}-beam`, scene);
  const geometry = beamGeometry();
  const data = new VertexData();
  data.positions = geometry.positions;
  data.uvs = geometry.uvs;
  data.indices = geometry.indices;
  data.applyToMesh(beam);
  beam.material = beamMaterial;

  for (const mesh of [halo, beam]) {
    mesh.position.set(at.x, at.y, at.z);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = false;
  }
  return {
    update(time) {
      const level = beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z);
      const on = level > 0.01;
      halo.isVisible = on;
      beam.isVisible = on;
      if (!on) return;
      haloMaterial.setFloat("level", level);
      beamMaterial.setFloat("level", level);
      beam.rotation.y = time * SWEEP;
    },
  };
}

/**
 * A small soft glow that always faces the camera, hung on `parent` at `at` (local): a boat's
 * lantern. Same halo and same level as the lighthouse lamp (dusk to dawn, dimmer in rain), drawn
 * additively, off by day. `update()` once a frame; returns the level (0..1) for the lamp's glass.
 */
export function createLampGlow(
  scene: Scene,
  parent: TransformNode,
  at: { x: number; y: number; z: number },
  size: number,
  name = "lamp-glow",
): { update(): number; dispose(): void } {
  const haloMaterial = material(`${name}-halo`, scene, "beaconHalo");
  const halo = new Mesh(`${name}-halo`, scene);
  const quad = new VertexData();
  const h = size / 2;
  quad.positions = [-h, -h, 0, h, -h, 0, -h, h, 0, h, h, 0];
  quad.uvs = [0, 0, 1, 0, 0, 1, 1, 1];
  quad.indices = [0, 1, 2, 1, 3, 2];
  quad.applyToMesh(halo);
  halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
  halo.material = haloMaterial;
  halo.parent = parent;
  halo.position.set(at.x, at.y, at.z);
  halo.isPickable = false;
  halo.alwaysSelectAsActiveMesh = true;
  halo.isVisible = false;
  return {
    update() {
      const level = beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z);
      const on = level > 0.01;
      halo.isVisible = on;
      if (on) haloMaterial.setFloat("level", level);
      return Math.max(level, 0);
    },
    dispose() {
      halo.dispose();
      haloMaterial.dispose();
    },
  };
}
