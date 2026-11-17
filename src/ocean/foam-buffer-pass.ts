import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import {
  FOAM_MAX,
  FOAM_SIZE,
  FOAM_WINDOW,
  PUFF,
  foamPuffs,
  foamWindow,
} from "./foam-buffer.ts";
import type { WakeTrail } from "./wake-trail.ts";

/**
 * The GPU part of the foam buffer (the rules are in foam-buffer.ts): one small render target
 * that follows the camera and is drawn from scratch every frame, one mesh of round puffs, each a
 * quad with a soft disc, added together. The water's shader reads it (water.ts). It costs one
 * more pass over one mesh (at most FOAM_MAX quads, usually a few hundred), a 512 x 512 target
 * and one texture read per water pixel; the old strips and their material per boat are gone.
 *
 * The vertex shader puts each puff straight into the target's clip space from its world
 * position (no scene camera is used, the camera below only exists to select the mesh), so the
 * window is a plain square of the sea centred on `centre`.
 */
Effect.ShadersStore["foamPuffVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform vec3 window;
varying vec2 vUV;
varying vec2 vData;
void main() {
  vUV = uv;
  vData = color.rg;
  vec2 ndc = (position.xz - window.xy) / (window.z * 0.5);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

Effect.ShadersStore["foamPuffFragmentShader"] = `
precision highp float;
varying vec2 vUV;
varying vec2 vData;
void main() {
  float r2 = dot(vUV, vUV);
  if (r2 >= 1.0) discard;
  // A soft round puff: dense in the middle, no edge at its rim.
  float body = (1.0 - r2);
  body *= body;
  gl_FragColor = vec4(vData.x * body, 0.0, 0.0, 1.0);
}`;

/** The layer the puffs and the target's own camera live on: not the main camera's. */
const LAYER = 0x20000000;

export interface FoamBuffer {
  readonly texture: RenderTargetTexture;
  /** Each frame: the boats' foam trails, the sea clock and the camera's place. Returns the window. */
  update(
    trails: Iterable<WakeTrail>,
    now: number,
    cameraX: number,
    cameraZ: number,
  ): { cx: number; cz: number; size: number };
  /** How many puffs the last frame drew. */
  drawn(): number;
  dispose(): void;
}

/** Sets up the foam buffer. Undefined if the render target cannot be made (the sea has no wake foam then). */
export function createFoamBuffer(scene: Scene): FoamBuffer | undefined {
  let texture: RenderTargetTexture;
  try {
    texture = new RenderTargetTexture(
      "foam-buffer",
      { width: FOAM_SIZE, height: FOAM_SIZE },
      scene,
      false,
      true,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
      false,
      false,
    );
  } catch (error) {
    console.warn("No foam buffer; the wakes leave no white water.", error);
    return undefined;
  }
  texture.clearColor = new Color4(0, 0, 0, 0);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;

  // The puffs: FOAM_MAX quads, each four vertices; only the first `count` are drawn.
  const vertices = FOAM_MAX * 4;
  const positions = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 4);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  const uvs = new Float32Array(vertices * 2);
  const indices = new Uint32Array(FOAM_MAX * 6);
  for (let q = 0; q < FOAM_MAX; q++) {
    for (let c = 0; c < 4; c++) {
      uvs[(q * 4 + c) * 2] = corners[c]![0];
      uvs[(q * 4 + c) * 2 + 1] = corners[c]![1];
    }
    const v = q * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  const mesh = new Mesh("foam-puffs", scene);
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh, true);
  mesh.layerMask = LAYER;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.doNotSyncBoundingInfo = true;
  // The quads are anywhere in the world and only the first `count` are drawn (a sub-mesh that
  // does not cover the whole mesh has a bounding box of its own, which the sorting of blended
  // meshes reads): one huge box for both, so nothing is ever culled or left without one.
  const everywhere = new BoundingInfo(
    new Vector3(-1e6, -1, -1e6),
    new Vector3(1e6, 1, 1e6),
  );
  mesh.setBoundingInfo(everywhere);
  mesh.subMeshes[0]?.setBoundingInfo(everywhere);
  const material = new ShaderMaterial(
    "foam-puffs",
    scene,
    { vertex: "foamPuff", fragment: "foamPuff" },
    {
      attributes: ["position", "uv", "color"],
      uniforms: ["window"],
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alphaMode = Constants.ALPHA_ONEONE;
  material.needAlphaBlending = () => true;
  mesh.material = material;
  const camera = new FreeCamera("foam-camera", new Vector3(0, 10, 0), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.layerMask = LAYER;
  // The projection is never used (the shader writes clip space), but it must not be NaN.
  camera.orthoLeft = -1;
  camera.orthoRight = 1;
  camera.orthoTop = 1;
  camera.orthoBottom = -1;
  // It must never take over the view.
  scene.removeCamera(camera);
  texture.activeCamera = camera;
  texture.renderList = [mesh];
  scene.customRenderTargets.push(texture);

  const puffs = new Float32Array(FOAM_MAX * PUFF);
  let count = 0;
  const frame = new Vector3();
  return {
    texture,
    update(trails, now, cameraX, cameraZ) {
      const view = foamWindow(cameraX, cameraZ);
      frame.set(view.cx, view.cz, view.size);
      material.setVector3("window", frame);
      count = foamPuffs(trails, now, view.cx, view.cz, FOAM_WINDOW / 2, puffs);
      for (let i = 0; i < count; i++) {
        const [x, z, radius, strength, seed] = [
          puffs[i * PUFF]!,
          puffs[i * PUFF + 1]!,
          puffs[i * PUFF + 2]!,
          puffs[i * PUFF + 3]!,
          puffs[i * PUFF + 4]!,
        ];
        for (let c = 0; c < 4; c++) {
          const v = i * 4 + c;
          // The quad's corners in world space: x and z (the y slot is unused).
          positions[v * 3] = x + corners[c]![0] * radius;
          positions[v * 3 + 1] = 0;
          positions[v * 3 + 2] = z + corners[c]![1] * radius;
          colors[v * 4] = strength;
          colors[v * 4 + 1] = seed;
        }
      }
      if (count > 0) {
        // Only the quads in use go up to the GPU.
        mesh.updateVerticesData(
          VertexBuffer.PositionKind,
          positions.subarray(0, count * 12),
          false,
          false,
        );
        mesh.updateVerticesData(
          VertexBuffer.ColorKind,
          colors.subarray(0, count * 16),
          false,
          false,
        );
      }
      const sub = mesh.subMeshes[0];
      if (sub) sub.indexCount = count * 6;
      mesh.isVisible = count > 0;
      return view;
    },
    drawn: () => count,
    dispose() {
      const at = scene.customRenderTargets.indexOf(texture);
      if (at >= 0) scene.customRenderTargets.splice(at, 1);
      texture.dispose();
      mesh.dispose();
      material.dispose();
      camera.dispose();
    },
  };
}
