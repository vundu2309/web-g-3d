import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import {
  LIGHTS_MIN_LEVEL,
  NAV_LIGHTS,
  glowSize,
  strobeOn,
} from "./plane-lights.ts";

/**
 * The glow of a plane's lights: one small mesh per drawn plane with a camera-facing square for
 * each light, drawn additively (it adds light and never hides anything), one draw call, switched
 * off by day. The squares are placed on the CPU each frame from the plane's pose and the
 * camera's right and up. Purely a look.
 */
Effect.ShadersStore["planeGlowVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv;
  vColor = color.rgb;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
Effect.ShadersStore["planeGlowFragmentShader"] = `
precision highp float;
varying vec2 vUv;
varying vec3 vColor;
uniform float level;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = (exp(-r * r * 5.0) * 0.55 + exp(-r * r * 36.0) * 0.95) * (1.0 - smoothstep(0.7, 1.0, r)) * level;
  gl_FragColor = vec4(vColor * a, a);
}`;

/** The one glow material of a scene (the level is set on it each frame). */
export function createGlowMaterial(scene: Scene): ShaderMaterial {
  const m = new ShaderMaterial(
    "plane-glow",
    scene,
    { vertex: "planeGlow", fragment: "planeGlow" },
    {
      attributes: ["position", "uv", "color"],
      uniforms: ["worldViewProjection", "level"],
      needAlphaBlending: true,
    },
  );
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.alphaMode = Constants.ALPHA_ONEONE;
  m.setFloat("level", 0);
  return m;
}

const LIGHTS = NAV_LIGHTS.length;
const spot = new Vector3();
const local = new Vector3();

export class PlaneGlow {
  readonly mesh: Mesh;
  private readonly positions = new Float32Array(LIGHTS * 4 * 3);

  constructor(scene: Scene, name: string, material: ShaderMaterial) {
    this.mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = Array.from(this.positions);
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    NAV_LIGHTS.forEach((light, i) => {
      const color = Color3.FromHexString(
        `#${light.color.toString(16).padStart(6, "0")}`,
      );
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        uvs.push(u!, v!);
        colors.push(color.r, color.g, color.b, 1);
      }
      const b = i * 4;
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    data.uvs = uvs;
    data.colors = colors;
    data.indices = indices;
    data.applyToMesh(this.mesh, true);
    this.mesh.material = material;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.isPickable = false;
    this.mesh.setEnabled(false);
  }

  /**
   * Places the glows. `world` is the plane's world matrix, `camera` where it looks from, `right`
   * and `up` its axes, `level` the night level (0 by day: nothing is drawn), `amount` how whole the plane is drawn (its fade: the glows shrink with it).
   */
  update(
    world: Matrix,
    camera: Vector3,
    right: Vector3,
    up: Vector3,
    time: number,
    level: number,
    amount = 1,
  ) {
    const on = level > LIGHTS_MIN_LEVEL;
    this.mesh.setEnabled(on);
    if (!on) return;
    const flash = strobeOn(time);
    NAV_LIGHTS.forEach((light, i) => {
      local.set(...light.local);
      Vector3.TransformCoordinatesToRef(local, world, spot);
      const distance = Vector3.Distance(spot, camera);
      const size = light.flashes && !flash ? 0 : glowSize(distance) * amount;
      const o = i * 12;
      let k = 0;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        this.positions[o + k++] = spot.x + (right.x * sx + up.x * sy) * size;
        this.positions[o + k++] = spot.y + (right.y * sx + up.y * sy) * size;
        this.positions[o + k++] = spot.z + (right.z * sx + up.z * sy) * size;
      }
    });
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
  }

  dispose() {
    this.mesh.dispose();
  }
}
