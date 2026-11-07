import { Constants } from "@babylonjs/core/Engines/constants";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import {
  TRAIL_SAMPLES,
  TRAIL_STRIPS,
  foamPixels,
  layTrail,
  trailGeometry,
  type WakeTrail,
} from "./wake-trail.ts";
import { waveHeight } from "./waves.ts";

/**
 * Draws a boat's wake: the strips from wake-trail.ts as one small mesh on the sea, with a
 * foam texture and a shader that cuts the foam away where the strip is faint, so it
 * breaks into patches as it dies. One shared material; one mesh per boat that moves.
 */
Effect.ShadersStore["wakeFoamVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec2 vUV;
varying float vAlpha;
varying vec3 vWorld;
void main() {
  vUV = uv;
  vAlpha = color.a;
  vWorld = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore["wakeFoamFragmentShader"] = `
precision highp float;
varying vec2 vUV;
varying float vAlpha;
varying vec3 vWorld;
uniform sampler2D foam;
uniform vec3 cameraPosition;
void main() {
  float f = texture2D(foam, vUV).r;
  // Soft edges across the strip.
  float edge = smoothstep(0.0, 0.3, vUV.x) * smoothstep(1.0, 0.7, vUV.x);
  // The fainter the strip, the more of the foam is cut away: patches, then nothing.
  float cut = 1.0 - vAlpha * 1.15;
  float a = smoothstep(cut - 0.05, cut + 0.22, f) * edge * min(1.0, vAlpha * 1.6);
  float dist = length(cameraPosition - vWorld);
  a *= 1.0 - smoothstep(90.0, 260.0, dist);
  gl_FragColor = vec4(0.95, 0.985, 1.0, a);
}`;

const materials = new WeakMap<Scene, ShaderMaterial>();
function material(scene: Scene) {
  let found = materials.get(scene);
  if (!found) {
    const pixels = foamPixels(128, 7);
    const texture = new RawTexture(
      pixels,
      128,
      128,
      Constants.TEXTUREFORMAT_LUMINANCE,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    found = new ShaderMaterial(
      "wake-foam",
      scene,
      { vertex: "wakeFoam", fragment: "wakeFoam" },
      {
        attributes: ["position", "uv", "color"],
        uniforms: ["worldViewProjection", "cameraPosition"],
        samplers: ["foam"],
      },
    );
    found.setTexture("foam", texture);
    found.alphaMode = Constants.ALPHA_COMBINE;
    found.needAlphaBlending = () => true;
    found.backFaceCulling = false;
    found.disableDepthWrite = true;
    materials.set(scene, found);
  }
  return found;
}

/** How far above the waves the foam lies (m): over the water, under the boat's hull. */
const LIFT = 0.16;

export class WakeMesh {
  private readonly mesh: Mesh;
  private readonly scene: Scene;
  private readonly geometry = trailGeometry();
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;

  constructor(scene: Scene) {
    this.scene = scene;
    const vertices = TRAIL_STRIPS * TRAIL_SAMPLES * 2;
    this.positions = new Float32Array(vertices * 3);
    this.colors = new Float32Array(vertices * 4).fill(1);
    const indices: number[] = [];
    for (let strip = 0; strip < TRAIL_STRIPS; strip++)
      for (let i = 0; i < TRAIL_SAMPLES - 1; i++) {
        const a = (strip * TRAIL_SAMPLES + i) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    this.mesh = new Mesh("wake-foam", scene);
    const data = new VertexData();
    data.positions = Array.from(this.positions);
    data.uvs = new Array(vertices * 2).fill(0);
    data.colors = Array.from(this.colors);
    data.indices = indices;
    data.applyToMesh(this.mesh, true);
    this.mesh.material = material(scene);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  /** Lays the strips along the trail for time `now` (the scene clock, for the waves). */
  update(trail: WakeTrail, now: number) {
    layTrail(trail, now, this.geometry);
    const { xz, uv, alpha } = this.geometry;
    const count = alpha.length;
    for (let i = 0; i < count; i++) {
      const x = xz[i * 2]!;
      const z = xz[i * 2 + 1]!;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = waveHeight(x, z, now) + LIFT;
      this.positions[i * 3 + 2] = z;
      this.colors[i * 4 + 3] = alpha[i]!;
    }
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.updateVerticesData(VertexBuffer.UVKind, uv);
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors);
    const camera = this.scene.activeCamera?.position ?? Vector3.Zero();
    (this.mesh.material as ShaderMaterial).setVector3("cameraPosition", camera);
  }

  dispose() {
    this.mesh.dispose();
  }
}
