import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";
import { islands } from "./model.ts";
import { drawnBed } from "./island-shape.ts";
import { glslSkyModel } from "./sky-model.ts";
import {
  HORIZON,
  SEA_FLOOR,
  SHALLOW_WATER,
  SUN_DIRECTION,
  WATER_ABSORPTION,
  ZENITH,
} from "./sea-style.ts";
import {
  SHORE_ISLANDS,
  coastAt,
  glslShore,
  shoreOf,
  shoreShape,
  shoreTable,
} from "./shore.ts";

/**
 * The swash: the last of each breaker running up the beach and sliding back. The sea's mesh
 * stops at the waterline (the land hides it), so a thin sheet is draped over each beach of
 * the play area, a few centimetres above the sand, from three metres out (where a trough bares the sand) to eleven metres
 * inland (the swash climbs 3 to 9 m up the gentle beach). Its shader draws a film of water whose front rushes up and slides back once a
 * breaker (on the surf's own clock, shore.ts, so the white bores of the sea run on into it),
 * white foam at the front that thins into lace on the way back, and darker wet sand where the
 * water has just left. Purely visual: nothing floats on it.
 */

/** Angles round each beach (about 0.6 to 0.9 m apart along the sand). */
export const SWASH_ANGLES = 256;
/** Rows of the sheet across the beach, in metres from the coast (negative is inland). */
export const SWASH_ROWS = [
  3.5, 2, 1, 0, -0.9, -1.8, -2.8, -3.9, -5.1, -6.4, -7.8, -9.4, -11,
] as const;
/**
 * How high above the sand the sheet lies (m): just clear of the flat-shaded terrain. The sheet
 * is draped on the ground itself (every vertex stands this far above the terrain's height
 * under it), so on the gentle beach, where the water's edge runs 12 m inland for the metre
 * it climbs, it still floats a hand's breadth above the sand wherever it is.
 */
export const SWASH_LIFT = 0.07;

export interface SwashSheet {
  positions: number[];
  /** Metres from the coast at each vertex (the shore field's distance, + out at sea). */
  shore: number[];
  indices: number[];
}

/** The sheet over shore island `index`'s beach, in world coordinates. Pure, so it is tested. */
export function swashSheet(index: number): SwashSheet {
  const island = SHORE_ISLANDS[index]!;
  const shape = shoreShape(index);
  const table = shoreTable(index);
  const positions: number[] = [];
  const shore: number[] = [];
  const indices: number[] = [];
  for (let k = 0; k < SWASH_ANGLES; k++) {
    const angle = (k / SWASH_ANGLES) * Math.PI * 2;
    const c = coastAt(table, angle).fraction * island.radius;
    for (const row of SWASH_ROWS) {
      const lx = Math.cos(angle) * (c + row);
      const lz = Math.sin(angle) * (c + row);
      const x = island.x + lx;
      const z = island.z + lz;
      positions.push(
        x,
        Math.max(drawnBed(shape.height(lx, lz)), -0.45) + SWASH_LIFT,
        z,
      );
      shore.push(shoreOf(index, x, z).distance);
    }
  }
  const rows = SWASH_ROWS.length;
  for (let k = 0; k < SWASH_ANGLES; k++) {
    const next = (k + 1) % SWASH_ANGLES;
    for (let r = 0; r < rows - 1; r++) {
      const a = k * rows + r;
      const b = next * rows + r;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, shore, indices };
}

Effect.ShadersStore["swashVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute float shore;
uniform mat4 worldViewProjection;
varying vec3 vWorld;
varying float vShore;
void main() {
  vWorld = position;
  vShore = shore;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore["swashFragmentShader"] = `
precision highp float;
uniform float time;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 shallow;
uniform vec3 sand;
varying vec3 vWorld;
varying float vShore;
${glslSkyModel()}
${glslShore(false)}
const vec3 absorb = vec3(${WATER_ABSORPTION.map((v) => v.toFixed(4)).join(", ")});
void main() {
  vec2 p = vWorld.xz;
  float inland = -vShore;
  float dist = distance(cameraPosition, vWorld);
  // This place's swash cycle: it starts when the breaker arrives at the waterline.
  float base = surfPhase(0.0, surfJitter(p));
  // Each wave also arrives early or late in its own pattern along the sand, so successive
  // waves do not break in the same places: the film runs up in separate tongues, not as one band.
  float phase = base + (shoreNoise(p * 0.22 + floor(base) * 5.17) - 0.5) * 0.45;
  float f = fract(phase);
  float cycle = floor(phase);
  // How far up each cycle runs varies along the beach and from one wave to the next.
  float reach = 3.0 + 6.0 * (shoreNoise(p * 0.07 + cycle * 7.31) * 0.65 + shoreNoise(p * 0.23 - cycle * 3.7) * 0.35);
  float lastReach = 3.0 + 6.0 * (shoreNoise(p * 0.07 + (cycle - 1.0) * 7.31) * 0.65 + shoreNoise(p * 0.23 - (cycle - 1.0) * 3.7) * 0.35);
  float front = swashFront(f, reach) + (shoreNoise(p * 0.6 + cycle * 3.1) - 0.5) * 1.2;
  float under = front - inland;
  bool rising = f < UPRUSH;
  // The film of water behind the front: thin and clear at the front, deeper behind.
  float film = smoothstep(-0.04, 0.12, under);
  // Foam: a white roll at the front on the way up; on the way back it is left behind as lace.
  float lace = shoreNoise(p * 3.1 + vec2(time * 0.2, 0.0)) * 0.5 + shoreNoise(p * 7.3 - time * 0.15) * 0.3 + shoreNoise(p * 15.0) * 0.2;
  float roll = film * exp(-max(under, 0.0) / (rising ? 0.45 + 0.1 * reach : 0.3)) * (rising ? 1.0 : 0.8);
  float left = film * (rising ? 0.0 : 0.55 * (1.0 - f) * (1.0 - f)) * smoothstep(0.6, 0.72, lace);
  float foam = clamp(max(roll * smoothstep(0.1, 0.35, lace + roll * 0.5), left), 0.0, 1.0);
  foam = mix(foam, roll * 0.6, smoothstep(30.0, 120.0, dist));
  // Wet sand below the highest reach of this wave (once it slides back) or the last one, drying.
  float peak = rising ? max(lastReach, front) : reach;
  float since = rising ? f + 1.0 - UPRUSH : f - UPRUSH;
  float wet = max((1.0 - film) * smoothstep(peak + 0.4, peak - 1.0, inland) * (1.0 - 0.5 * since), smoothstep(-0.2, 0.4, vShore) * 0.8);
  vec3 sunDir = normalize(sunDirection);
  vec3 skyIrradiance = mix(toLinear(horizon), toLinear(zenith), 0.6);
  float nl = max(sunDir.y, 0.0);
  vec3 incident = skyIrradiance * 0.55 + sunColor() * SUN_RADIANCE * nl * 0.55;
  // Layered front to back (premultiplied): wet sand, then the film, then the foam.
  float alpha = wet * 0.42;
  vec3 layered = toLinear(sand) * incident * 0.18 * alpha;
  // Thin clear water over sand: the sand seen through a few centimetres of water (a touch of
  // turquoise as it deepens) and a little of the sky on its glassy surface.
  float filmDepth = clamp(under * 0.08, 0.0, 0.25);
  vec3 filmColor = toLinear(sand) * incident * 0.2 * exp(-absorb * filmDepth * 6.0) + toLinear(shallow) * incident * 0.015 + skyIrradiance * 0.05;
  // Off the still-water line the sheet is under the sea except in a trough, where the sand it
  // uncovers should read as wet sand, not as a band of film: the film fades out there.
  float filmAlpha = film * mix(0.2, 0.45, smoothstep(0.0, 1.8, under)) * (1.0 - smoothstep(-0.1, 0.6, vShore));
  layered = filmColor * filmAlpha + layered * (1.0 - filmAlpha);
  alpha = filmAlpha + alpha * (1.0 - filmAlpha);
  vec3 foamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * nl * 0.3);
  layered = foamColor * foam + layered * (1.0 - foam);
  alpha = foam + alpha * (1.0 - foam);
  vec3 color = layered / max(alpha, 1.0e-3);
  alpha *= 1.0 - smoothstep(180.0, 320.0, dist);
  // The sheet ends a few metres out at sea: it fades out before its edge, so it never shows as
  // a patch where a deep trough leaves it above the water.
  alpha *= 1.0 - smoothstep(1.2, 3.3, vShore);
  gl_FragColor = vec4(toScreen(color), alpha);
}`;

export interface Swash {
  meshes: Mesh[];
  update(time: number): void;
}

/** One sheet per island of the play area (the backdrop islands are too far to need one). */
export function createSwash(scene: Scene): Swash {
  const material = new ShaderMaterial(
    "swash",
    scene,
    { vertex: "swash", fragment: "swash" },
    {
      attributes: ["position", "shore"],
      uniforms: [
        "worldViewProjection",
        "time",
        "cameraPosition",
        "sunDirection",
        "horizon",
        "zenith",
        "shallow",
        "sand",
      ],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alphaMode = Constants.ALPHA_COMBINE;
  // Drawn over the sand it lies on, never fighting it for depth.
  material.zOffset = -2;
  material.setVector3("sunDirection", SUN_DIRECTION);
  material.setColor3("horizon", HORIZON);
  material.setColor3("zenith", ZENITH);
  material.setColor3("shallow", SHALLOW_WATER);
  material.setColor3("sand", SEA_FLOOR);
  const meshes = islands.map((_, index) => {
    const sheet = swashSheet(index);
    const mesh = new Mesh(`swash-${index}`, scene);
    const data = new VertexData();
    data.positions = sheet.positions;
    data.indices = sheet.indices;
    data.applyToMesh(mesh);
    mesh.setVerticesData("shore", sheet.shore, false, 1);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  });
  return {
    meshes,
    update(time) {
      material.setFloat("time", time);
      const camera = scene.activeCamera;
      if (camera) material.setVector3("cameraPosition", camera.position);
    },
  };
}
