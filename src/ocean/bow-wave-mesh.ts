import { Constants } from "@babylonjs/core/Engines/constants";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Material } from "@babylonjs/core/Materials/material";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import {
  BOW_SPRAY_FROM,
  CREST_ACROSS,
  CREST_FROM,
  CREST_POINTS,
  SPRAY_COUNT,
  crestGeometry,
  crestVertex,
  dropletAt,
  layCrest,
} from "./bow-wave.ts";
import { waveHeight } from "./waves.ts";

const DRAW_CREST = false;

/**
 * Draws the bow wave of bow-wave.ts: the foamy crest (one small sheet that shares the wake's
 * foam material, so it is the same white water) and the spray (one mesh of camera-facing
 * squares, a soft disc each, drawn by a tiny shader: no particle system, no render pass).
 * Both are hidden when the boat is slower than a crawl.
 */
Effect.ShadersStore["bowSprayVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 viewProjection;
uniform mat4 view;
varying vec2 vUV;
varying float vAlpha;
void main() {
  vUV = uv;
  vAlpha = color.a;
  vec3 right = vec3(view[0][0], view[1][0], view[2][0]);
  vec3 up = vec3(view[0][1], view[1][1], view[2][1]);
  vec2 corner = uv * 2.0 - 1.0;
  vec3 world = position + (right * corner.x + up * corner.y) * color.r;
  gl_Position = viewProjection * vec4(world, 1.0);
}`;

Effect.ShadersStore["bowSprayFragmentShader"] = `
precision highp float;
varying vec2 vUV;
varying float vAlpha;
void main() {
  float d = length(vUV * 2.0 - 1.0);
  // A soft round puff with a slightly brighter heart: a droplet or a bit of mist.
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha;
  vec3 color = mix(vec3(0.82, 0.92, 0.97), vec3(1.0), 1.0 - smoothstep(0.0, 0.7, d));
  gl_FragColor = vec4(color, a);
}`;

const sprayMaterials = new WeakMap<Scene, ShaderMaterial>();
function sprayMaterial(scene: Scene) {
  let found = sprayMaterials.get(scene);
  if (!found) {
    found = new ShaderMaterial(
      "bow-spray",
      scene,
      { vertex: "bowSpray", fragment: "bowSpray" },
      {
        attributes: ["position", "uv", "color"],
        uniforms: ["viewProjection", "view"],
      },
    );
    found.alphaMode = Constants.ALPHA_COMBINE;
    found.needAlphaBlending = () => true;
    found.backFaceCulling = false;
    found.disableDepthWrite = true;
    sprayMaterials.set(scene, found);
  }
  return found;
}

/** The crest rests on the sea at the foam's height (wake-mesh.ts LIFT). */
const LIFT = 0.16;

export class BowWaveMesh {
  private readonly crest: Mesh;
  private readonly spray: Mesh;
  private readonly crestGeo = crestGeometry();
  private readonly crestPos = new Float32Array(CREST_POINTS * CREST_ACROSS * 3);
  private readonly crestColor = new Float32Array(
    CREST_POINTS * CREST_ACROSS * 4,
  ).fill(1);
  private readonly sprayPos = new Float32Array(SPRAY_COUNT * 4 * 3);
  private readonly sprayColor = new Float32Array(SPRAY_COUNT * 4 * 4).fill(1);
  private crestShown = true;
  private sprayShown = true;

  constructor(scene: Scene, foam: Material) {
    // The crest: red is where the vertex is across, as in the wake strips (the shader fades the sides).
    for (let i = 0; i < CREST_POINTS; i++)
      for (let k = 0; k < CREST_ACROSS; k++)
        this.crestColor[crestVertex(i, k) * 4] = k / (CREST_ACROSS - 1);
    const indices: number[] = [];
    for (let i = 0; i < CREST_POINTS - 1; i++)
      for (let k = 0; k < CREST_ACROSS - 1; k++) {
        const a = crestVertex(i, k);
        const b = crestVertex(i + 1, k);
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    this.crest = new Mesh("bow-crest", scene);
    const data = new VertexData();
    data.positions = Array.from(this.crestPos);
    data.uvs = new Array(CREST_POINTS * CREST_ACROSS * 2).fill(0);
    data.colors = Array.from(this.crestColor);
    data.indices = indices;
    data.applyToMesh(this.crest, true);
    this.crest.material = foam;
    this.crest.isPickable = false;
    this.crest.alwaysSelectAsActiveMesh = true;
    this.crest.isVisible = false;
    this.crestShown = false;

    // The spray: four vertices a droplet, its corner in uv, its size in red and opacity in alpha.
    const sprayIndices: number[] = [];
    const sprayUv: number[] = [];
    for (let i = 0; i < SPRAY_COUNT; i++) {
      const v = i * 4;
      sprayIndices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      sprayUv.push(0, 0, 1, 0, 1, 1, 0, 1);
    }
    this.spray = new Mesh("bow-spray", scene);
    const sprayData = new VertexData();
    sprayData.positions = Array.from(this.sprayPos);
    sprayData.uvs = sprayUv;
    sprayData.colors = Array.from(this.sprayColor);
    sprayData.indices = sprayIndices;
    sprayData.applyToMesh(this.spray, true);
    this.spray.material = sprayMaterial(scene);
    this.spray.isPickable = false;
    this.spray.alwaysSelectAsActiveMesh = true;
    this.spray.isVisible = false;
    this.sprayShown = false;
  }

  /**
   * Compiles both materials now. The meshes stay hidden until the boat is fast, so without this the
   * first fast stretch compiled the shaders in the middle of a frame (a stall of 0.3 to 0.5 s in
   * software rendering, measured: it happened on the first acceleration and not on the second).
   */
  warm(): void {
    for (const mesh of [this.crest, this.spray])
      void mesh.material?.forceCompilationAsync(mesh).catch(() => undefined);
  }

  /**
   * Lays the bow wave for a boat at (x, z) heading `heading` (0 is -Z, a quarter turn is +X)
   * doing `speed` m/s, at sea time `now`.
   */
  update(x: number, z: number, heading: number, speed: number, now: number) {
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = Math.sin(heading);
    // The foamy crest sheet is not drawn any more: the water simulation (ripple-sim.ts) raises the
    // real bow wave and breaks it into foam; only the spray stays.
    const crestOn = DRAW_CREST && speed > CREST_FROM + 0.05;
    if (crestOn !== this.crestShown) {
      this.crestShown = crestOn;
      this.crest.isVisible = crestOn;
    }
    if (crestOn) {
      const g = this.crestGeo;
      layCrest(speed, now, g);
      for (let i = 0; i < CREST_POINTS * CREST_ACROSS; i++) {
        const wx = x + fx * g.u[i]! + rx * g.v[i]!;
        const wz = z + fz * g.u[i]! + rz * g.v[i]!;
        this.crestPos[i * 3] = wx;
        this.crestPos[i * 3 + 1] = waveHeight(wx, wz, now) + LIFT + g.y[i]!;
        this.crestPos[i * 3 + 2] = wz;
        this.crestColor[i * 4 + 3] = g.alpha[i]!;
      }
      this.crest.updateVerticesData(VertexBuffer.PositionKind, this.crestPos);
      this.crest.updateVerticesData(VertexBuffer.UVKind, g.uv);
      this.crest.updateVerticesData(VertexBuffer.ColorKind, this.crestColor);
    }
    const sprayOn = speed > BOW_SPRAY_FROM - 0.3;
    if (sprayOn !== this.sprayShown) {
      this.sprayShown = sprayOn;
      this.spray.isVisible = sprayOn;
    }
    if (sprayOn) {
      for (let i = 0; i < SPRAY_COUNT; i++) {
        const d = dropletAt(i, now, speed);
        const wx = x + fx * d.u + rx * d.v;
        const wz = z + fz * d.u + rz * d.v;
        const wy = waveHeight(wx, wz, now) + LIFT + d.y;
        for (let c = 0; c < 4; c++) {
          const at = i * 4 + c;
          this.sprayPos[at * 3] = wx;
          this.sprayPos[at * 3 + 1] = wy;
          this.sprayPos[at * 3 + 2] = wz;
          this.sprayColor[at * 4] = d.size;
          this.sprayColor[at * 4 + 3] = d.alpha;
        }
      }
      this.spray.updateVerticesData(VertexBuffer.PositionKind, this.sprayPos);
      this.spray.updateVerticesData(VertexBuffer.ColorKind, this.sprayColor);
    }
  }

  dispose() {
    this.crest.dispose();
    this.spray.dispose();
  }
}
