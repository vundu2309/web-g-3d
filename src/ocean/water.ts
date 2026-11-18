import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { SIM_N, glslSim } from "./ripple-sim.ts";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { BED_DIP } from "./island-shape.ts";
import {
  CALM_WAVE_HEIGHT,
  WIND_DIRECTION,
  glslHorizontalFade,
  glslWaveDisplace,
  glslWaveHeight,
} from "./waves.ts";
import { RIPPLE_RANGE, RIPPLE_SIZE, ripplePixels } from "./ripples.ts";
import { glslSkyModel } from "./sky-model.ts";
import { glslReflection } from "./reflection-model.ts";
import { CLEAR, glslUnderLayer } from "./clear-water.ts";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { createSwash } from "./swash.ts";
import { SEA_FLOOR, WATER_ABSORPTION } from "./sea-style.ts";
import { ATMOSPHERE_UNIFORMS, bindAtmosphere, SEA } from "./sea-atmosphere.ts";
import { CREST_FOAM as CREST, CURL, SWELL_SHADING } from "./swell-look.ts";
import { waterRingRadii } from "./water-extent.ts";
import {
  FOAM_REACH,
  COLLAR,
  CREST_FOAM,
  EDGE_PER_METRE,
  HULL_REACH,
  HULL_WATER,
  RING_FADE,
  glslCollarWidth,
  glslHullEdge,
} from "./hull-water.ts";
import { SHADOW } from "./boat-shadow.ts";
import {
  COAST_SAMPLES,
  coastPixels,
  coastRows,
  glslShore,
  shoreUniform,
} from "./shore.ts";

/**
 * The sea: a camera-following grid displaced by the same wave function the
 * physics floats on. It mirrors the scene through a planar reflection pass
 * (reflection.ts: islands, props, markets, boats and the sky, wobbled by the waves and blurred
 * by the roughness); when that texture is missing it mirrors the analytic sky alone, as before.
 */
/** A unit vector turned `offset` radians from the wind, as a GLSL vec2. */
const glslAxis = (offset: number) =>
  `vec2(${Math.cos(WIND_DIRECTION + offset).toFixed(6)}, ${Math.sin(WIND_DIRECTION + offset).toFixed(6)})`;
/**
 * How much taller the calmest sea is than the 0.825 m table the white caps and the thin-crest glow
 * were tuned on (waves.ts), times 1.2: their thresholds are divided by it, so the calm sea has about
 * the share of white caps it had and a rougher sea (the sea state, waves.ts) gets more caps.
 */
const SEA_GAIN = (CALM_WAVE_HEIGHT / 0.825) * 1.2;
/** The share of the wave height the shore paint reads as water at the waterline (see `column`). */
const SHORE_WAVE = 0.4;
const COMMON = `
precision highp float;
uniform float time;
${glslWaveHeight()}
`;

/** How many boats cast a shadow on the water at once (the nearest ones, yours first). */
export const BOAT_MAX = 12;
export interface BoatSpot {
  x: number;
  z: number;
  heading: number;
}
export { HULL_WATER } from "./hull-water.ts";
/** Packs boats into the shader's vec4 array: x, z, heading, 1 for a boat and 0 for empty. */
export function packBoats(boats: readonly BoatSpot[]): number[] {
  const out = new Array<number>(BOAT_MAX * 4).fill(0);
  boats.slice(0, BOAT_MAX).forEach((boat, i) => {
    out.splice(i * 4, 4, boat.x, boat.z, boat.heading, 1);
  });
  return out;
}

Effect.ShadersStore["seaVertexShader"] = `
${COMMON}
${glslSim()}
${glslHorizontalFade()}
${glslWaveDisplace()}
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform vec3 anchor;
varying vec3 vWorld;
varying vec2 vOrigin;
varying float vHeight;
void main() {
  vec3 p = position;
  p.x += anchor.x;
  p.z += anchor.z;
  // The water the boats stir (ripple-sim.ts) is added to the waves.
  p.y = waveHeight(p.xz, time) + simAt(p.xz).x;
  // Gerstner-style horizontal motion (visual only, none near a beach): the vertex that starts at
  // vOrigin is drawn a little toward the crest it sits before, so crests pinch and troughs widen.
  vOrigin = p.xz;
  p.xz += waveDisplace(p.xz, time) * horizontalFade(p.xz);
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
uniform vec3 deepTeal;
uniform vec3 sand;
uniform float fogDensity;
uniform vec4 boats[${BOAT_MAX}];
uniform sampler2D rippleMap;
uniform sampler2D reflectionMap;
uniform vec2 reflectionSize;
uniform mat4 viewProjection;
uniform sampler2D underMap;
uniform float underOn;
varying vec3 vWorld;
varying vec2 vOrigin;
varying float vHeight;
${glslSim()}
${glslSkyModel()}
${glslShore(true)}
${glslHorizontalFade()}
${glslReflection()}
${glslUnderLayer()}
// Absorption of clear sea water per metre (red goes first, then green): turquoise shallows.
const vec3 absorb = vec3(${WATER_ABSORPTION.map((v) => v.toFixed(4)).join(", ")});
// A hash without sin(): cheaper on phone GPUs.
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
const vec2 WIND = ${glslAxis(0)};
// Moving cells (Worley): the distances to the nearest and second-nearest of a jittered grid of
// points that each circle slowly. Their difference is small along the cell walls.
vec2 foamCells(vec2 p, float t) {
  vec2 cell = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = vec2(hash(cell + o), hash(cell + o + 19.19));
      vec2 r = o + 0.5 + 0.4 * sin(t * (0.5 + h * 0.7) + h * 6.2831853) - f;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
  return vec2(sqrt(d1), sqrt(d2));
}
// Caustics: light focused by the waves into a bright moving web on the sea floor. Two layers
// of cell walls at different sizes and speeds, multiplied where they cross.
float caustics(vec2 p, float t) {
  // Warped by a slow noise so the web is made of wavy threads, not straight-edged cells.
  p += vec2(noise(p * 0.35 + t * 0.12), noise(p * 0.35 + 5.2 - t * 0.1)) * 1.6;
  vec2 a = foamCells(p * 0.7 + vec2(t * 0.05, 0.0), t * 0.9);
  vec2 b = foamCells(p * 1.05 + vec2(0.0, -t * 0.04) + 3.7, t * 1.1);
  float wa = 1.0 - smoothstep(0.0, 0.12, a.y - a.x);
  float wb = 1.0 - smoothstep(0.0, 0.14, b.y - b.x);
  return wa * 0.35 + wb * 0.25 + wa * wb * 1.2;
}
// Shoals: the shadows of small fish schools swimming round the shallows. The floor is cut into
// 14 m cells, about four in five hold a school of 7 fish circling a point that itself orbits the
// cell's middle (the school never leaves its cell, so one cell is read per pixel); each fish is a
// small ellipse along its heading with a tail that wiggles. Returns how dark the shadow is, 0 to 1.
float shoals(vec2 p, float t, float blur) {
  vec2 cell = floor(p / 14.0);
  float h0 = hash(cell + 71.3);
  if (h0 > 0.8) return 0.0;
  float turn = h0 > 0.4 ? 1.0 : -1.0;
  float a = t * (0.22 + 0.2 * hash(cell + 3.1)) * turn + h0 * 40.0;
  vec2 centre = (cell + 0.5) * 14.0 + 2.8 * vec2(cos(a), sin(a));
  vec2 dir = turn * vec2(-sin(a), cos(a));
  vec2 side = vec2(-dir.y, dir.x);
  float dark = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 hh = vec2(hash(cell + fi * 5.3 + 11.0), hash(cell + fi * 3.7 + 29.0));
    float rr = 0.4 + 1.8 * hh.x;
    float aa = hh.y * 6.2831853 + t * (0.15 + 0.1 * hh.x) * turn;
    vec2 at = centre + (dir * cos(aa) + side * sin(aa)) * rr;
    vec2 r = p - at;
    float u = dot(r, dir), v = dot(r, side);
    v += 0.07 * sin(u * 7.0 - t * 8.0 + fi) * smoothstep(0.1, -0.5, u);
    float e = (u * u) / (0.85 * 0.85) + (v * v) / (0.3 * 0.3);
    dark = max(dark, 1.0 - smoothstep(0.55, 1.0 + blur, e));
  }
  return dark;
}
// One layer of the ripple map (ripples.ts): the map's +u axis turned to \`axis\` in the world,
// one tile every \`tile\` metres, drifting, and its ripples moved along their own directions by
// the phase. Returns the slope in the world, one standard deviation being about 1 / RANGE.
vec2 rippleLayer(vec2 p, vec2 axis, float tile, vec2 drift, float phase) {
  vec2 side = vec2(-axis.y, axis.x);
  vec4 s = texture2D(rippleMap, vec2(dot(p, axis), dot(p, side)) / tile + drift) * 2.0 - 1.0;
  vec2 g = s.xy * cos(phase) + s.zw * sin(phase);
  return (g.x * axis + g.y * side) * ${RIPPLE_RANGE.toFixed(1)};
}
// GGX / Trowbridge-Reitz normal distribution and Smith visibility (the sun's glitter).
float distributionGGX(float nh, float a) {
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}
float visibilitySmith(float nl, float nv, float a) {
  float k = a * 0.5;
  return 0.25 / ((nl * (1.0 - k) + k) * (nv * (1.0 - k) + k));
}
// The shadow of the boats on the water: the sun is low, so each hull throws a long shadow
// downwind. A boat is three parts (hull, wheelhouse, mast), each swept through its own range of
// heights, and the shadow of a height is the part's footprint shifted along the sun's ground
// direction by height / tan(elevation). Sweeping (not three single slices) keeps the shadow in
// one piece: it runs on from the hull to the wheelhouse and the mast instead of leaving a
// dark patch lying apart from the boat.
float shadowSlice(vec2 d, vec2 away, vec2 fwd, vec2 side, float h, float halfLength, float halfWidth, float shift) {
  vec2 q = d - away * h - fwd * shift;
  float u = dot(q, fwd) / halfLength;
  float v = dot(q, side) / halfWidth;
  // The shadow's edge softens with the height it is thrown from, as a real penumbra does.
  return 1.0 - smoothstep(${SHADOW.edgeFrom.toFixed(2)}, 1.05 + ${SHADOW.penumbra.toFixed(2)} * h, length(vec2(u, v)));
}
float boatShadow(vec2 p, vec3 sunDir) {
  vec2 away = -sunDir.xz / max(sunDir.y, 0.15);
  float dark = 0.0;
  for (int i = 0; i < ${BOAT_MAX}; i++) {
    vec4 boat = boats[i];
    if (boat.w < 0.5 || distance(p, boat.xy) > 22.0) continue;
    vec2 fwd = vec2(sin(boat.z), -cos(boat.z));
    vec2 side = vec2(cos(boat.z), sin(boat.z));
    vec2 d = p - boat.xy;
    // The hull, from the waterline to the gunwale.
    for (int k = 0; k < 4; k++) dark = max(dark, shadowSlice(d, away, fwd, side, float(k) * 0.57, 3.9, 1.5, 0.0));
    // The wheelhouse, forward of amidships, from the deck to the top of its roof.
    for (int k = 0; k < 4; k++) dark = max(dark, shadowSlice(d, away, fwd, side, 0.8 + float(k) * 0.47, 0.95, 0.85, 1.0));
    // The mast and lantern: thin, so a faint stripe that joins the roof's shadow.
    for (int k = 0; k < 10; k++) dark = max(dark, 0.8 * shadowSlice(d, away, fwd, side, 2.2 + float(k) * 0.18, 0.5, 0.45, 0.7));
  }
  return dark;
}
// Value noise from two lattices turned against each other: the plateaus and straight steps of a
// single lattice (square cells at a pixel's size) cancel. Contrast is put back to a single lattice's.
float softNoise(vec2 p) {
  float a = noise(p);
  float b = noise(vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 1.37 + 17.3);
  return clamp(0.5 + (a + b - 1.0) * 0.72, 0.0, 1.0);
}
${glslHullEdge()}
${glslCollarWidth()}
// What a hull does to the water around it, whether the boat moves or not (the wake is for
// moving boats): a collar of white water lapping against the planking, which breaks up as it
// goes, and rings of ripple that spread from the hull and come in pulses, as the boat rocks.
// Purely visual: the water is tilted and painted near each hull, the mesh the boats float on
// is untouched. x is the white water, yz the slope the ripples add.
vec3 hullWater(vec2 p, float t) {
  float foam = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < ${BOAT_MAX}; i++) {
    vec4 boat = boats[i];
    vec2 d = p - boat.xy;
    if (boat.w < 0.5 || dot(d, d) > ${(HULL_REACH * HULL_REACH).toFixed(1)}) continue;
    vec2 fwd = vec2(sin(boat.z), -cos(boat.z));
    vec2 side = vec2(cos(boat.z), sin(boat.z));
    float u = dot(d, fwd) + ${HULL_WATER.shift.toFixed(2)};
    float v = dot(d, side);
    // Metres from the waterline (times a constant), the same along the keel and across it.
    float edge = hullEdge(u, v);
    // The collar: a narrow ragged lap of foam along the waterline, cut into pieces in places
    // (hull-water.ts: a splash at the stem that stops at the tip, a modest wash behind the
    // transom that the wake strips take on). Its width is in metres from the waterline.
    float lap = softNoise(p * 3.4 + vec2(t * 0.35, -t * 0.28));
    float gap = noise(p * 1.9 + vec2(-t * 0.21, t * 0.17));
    float metres = edge / ${EDGE_PER_METRE.toFixed(4)};
    float width = max(collarWidth(u, lap), 0.03);
    float collar = (1.0 - smoothstep(0.02, width, metres)) * smoothstep(${COLLAR.gaps.from.toFixed(2)}, ${COLLAR.gaps.to.toFixed(2)}, gap) * (0.85 + 0.15 * lap);
    // Rings: a slow pulse (the boat rocks), each ring spreading about a metre a second. The rings
    // are never perfect ellipses: the distance they are measured from is warped by slow noise,
    // so neighbouring rings drift apart and together, and their foam breaks into patches.
    float pulse = 0.55 + 0.45 * sin(t * 0.9 + boat.x * 0.37 + boat.y * 0.23);
    float k = 6.2832 / ${HULL_WATER.wavelength.toFixed(2)};
    float warp = (noise(p * 0.55 + vec2(t * 0.08, -t * 0.06)) - 0.5) * 2.2 + (noise(p * 1.7 - vec2(t * 0.15, t * 0.1)) - 0.5) * 0.8;
    float warped = edge + warp * smoothstep(0.2, 1.6, edge);
    float phase = warped * k - 6.2832 * ${HULL_WATER.rate.toFixed(2)} * t;
    // The ripples fade out well inside the shader's reach (hull-water.ts), so nothing is cut off.
    float fade = exp(-edge / 3.2) * smoothstep(0.0, 0.5, edge) * (1.0 - smoothstep(${RING_FADE.from.toFixed(1)}, ${RING_FADE.to.toFixed(1)}, edge));
    slope += normalize(d + 0.0001) * ${HULL_WATER.height.toFixed(3)} * k * cos(phase) * fade * pulse;
    // The crests of the first rings catch a little foam, in broken patches that thin out quickly.
    float broken = smoothstep(0.42, 0.72, noise(p * 1.25 + vec2(t * 0.22, -t * 0.17)) * 0.65 + softNoise(p * 3.3 - vec2(t * 0.3, t * 0.2)) * 0.35);
    float crest = smoothstep(0.55, 0.95, cos(phase)) * (1.0 - smoothstep(0.4, ${FOAM_REACH.toFixed(1)}, edge)) * smoothstep(0.1, 0.5, edge) * (0.45 + 0.55 * pulse) * (0.35 + 0.65 * lap) * broken;
    foam = max(foam, max(collar, crest * ${CREST_FOAM.toFixed(2)}));
  }
  return vec3(foam, slope);
}
void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 view = toCamera / dist;
  vec3 sunDir = normalize(sunDirection);
  // The exact slope of the waves, with the short ones faded out with distance.
  vec3 hull = hullWater(vWorld.xz, time);
  // The slope of the surface as it is drawn: the analytic slope at the point the vertex started
  // from, corrected for the horizontal motion (the mesh is squeezed at the crests, so the slope
  // there is steeper: (I - squeeze)^-1 times it).
  vec2 bigSlope;
  vec3 squeeze;
  vec2 waveOnly = waveSlopeSplit(vOrigin, time, dist, bigSlope, squeeze);
  squeeze *= horizontalFade(vOrigin);
  float squeezeDet = max((1.0 - squeeze.x) * (1.0 - squeeze.z) - squeeze.y * squeeze.y, 0.04);
  mat2 unsqueeze = mat2(1.0 - squeeze.z, squeeze.y, squeeze.y, 1.0 - squeeze.x) / squeezeDet;
  bigSlope = unsqueeze * bigSlope;
  // The water the boats stir: its slope and its white water (ripple-sim.ts).
  vec4 stirred = simAt(vOrigin);
  vec2 slope = unsqueeze * waveOnly + stirred.yz + hull.yz;
  // How choppy the sea is here: wide calm and rough patches drifting downwind, and faint
  // streaks along the wind (faded far away, where they would alias).
  vec2 q = vWorld.xz;
  vec2 across = vec2(-WIND.y, WIND.x);
  float patches = noise(q * 0.0059 - WIND * time * 0.0016) * 0.65 + noise(q * 0.0163 + across * time * 0.002 + 17.0) * 0.35;
  float streak = noise(vec2(dot(q, WIND) * 0.009 - time * 0.012, dot(q, across) * 0.11)) - 0.5;
  float choppy = smoothstep(0.28, 0.72, patches) * (1.0 + streak * 0.8 * (1.0 - smoothstep(90.0, 220.0, dist)));
  // Fine ripples (purely visual, the boats never feel them): two layers of the ripple map at
  // different sizes, turned to either side of the wind and drifting apart, so no tile repeats.
  float rippleNear = 1.0 - smoothstep(30.0, 110.0, dist);
  float rippleFar = 1.0 - smoothstep(70.0, 260.0, dist);
  vec2 detail = vec2(0.0);
  if (rippleFar > 0.0) {
    detail += rippleLayer(q, ${glslAxis(0.2)}, 6.7, vec2(0.03, 0.006) * time, -time * 1.15) * 0.06 * rippleFar;
    if (rippleNear > 0.0)
      detail += rippleLayer(q, ${glslAxis(-0.5)}, 2.3, vec2(0.05, -0.02) * time, -time * 2.3) * 0.04 * rippleNear;
    detail *= mix(0.15, 1.5, choppy);
    // Rain: drops land at random places and start rings that spread and die (a look only: the
    // mesh the boats float on is untouched).
    if (weather.z > 0.02 && rippleNear > 0.0) {
      vec2 rp = vWorld.xz * 1.7;
      vec2 rc = floor(rp);
      vec2 rf = fract(rp) - 0.5;
      float rh = hash(rc + 3.7);
      float age = fract(time * 1.1 + rh * 7.0);
      vec2 off = (vec2(hash(rc + 11.3), hash(rc + 23.9)) - 0.5) * 0.5;
      vec2 rv = rf - off;
      float rr = length(rv);
      float ring = exp(-pow((rr - age * 0.42) / 0.045, 2.0)) * (1.0 - age) * step(rh, weather.z * 0.85);
      detail += rv / max(rr, 0.01) * ring * 0.34 * rippleNear;
    }
  }
  // ----- The shore -----
  // The real coast (shore.ts): metres to the nearest beach and the beach's outward normal.
  vec3 field = shoreField(q);
  float d = field.x;
  vec2 toSea = field.yz;
  // How much water there is above the floor right here (m): the still-water depth plus the wave
  // under this pixel. Near the sand the waves matter, a crest laps over the sand (d below 0, no
  // depth in the still sea) and a trough bares it; further out only the still depth counts.
  // The floor as it is drawn (island-shape.ts, drawnBed): just off the sand it dips ${BED_DIP} m below
  // the shelf, so a trough of the taller sea does not bare it, and the white edge below is only
  // painted where the water really is thin.
  float shelfY = seabedDepth(d);
  float bedY = d < 0.0 ? beachRise(-d) : -(shelfY + ${BED_DIP.toFixed(3)} * (1.0 - exp(-shelfY / 0.06)));
  // The tall open swell does not run up the beach: it takes the shoaling breakers' place in the
  // last 34 m (the slope is faded the same way below), so only ${SHORE_WAVE} of the wave height is
  // read as water over the sand at the waterline. Purely the paint; the mesh is as high as ever.
  float shoreHeight = vHeight * mix(${SHORE_WAVE.toFixed(2)}, 1.0, smoothstep(2.0, 34.0, max(d, 0.0)));
  float column = shoreHeight - bedY;
  float depth = mix(max(column, 0.0), seabedDepth(d), smoothstep(5.0, 14.0, d));
  float nearShore = 1.0 - smoothstep(48.0, 90.0, d);
  // Surf (purely visual, like the ripples: it tilts the normal and paints the foam, the mesh the
  // boats float on is untouched). The breakers run parallel to the beach whatever the swell
  // does offshore, as real waves bend in shallow water; each crest moves in, steepens, breaks a
  // few metres off the sand and runs on as a white bore.
  float age = 0.0;
  float broken = 0.0;
  float breakAt = 12.0;
  float surfFoam = 0.0;
  float shelter = 1.0;
  vec2 surfSlope = vec2(0.0);
  if (nearShore > 0.0) {
    // The crest lines are ragged at small scale too, so their fronts are never ruled lines.
    float jitter = surfJitter(q) + (noise(q * 0.42 + 9.0) - 0.5) * 0.07;
    float phase = surfPhase(d, jitter);
    float x = fract(phase);
    age = x * SURF_PERIOD;
    // The side that faces the wind takes the biggest surf; the lee still has some.
    shelter = 0.65 + 0.35 * smoothstep(-0.5, 0.7, -dot(toSea, WIND));
    // Each wave breaks at its own distance, 9 to 24 m out (a set breaks farther out than the
    // lulls), so two or three lines are white at once. The crest at x = 1 belongs to both
    // sides: the bore behind it (x near 0) is this wave's, the face before it (x near 1) is
    // the next one's, so the break distance eases from one to the other along x.
    float wave = floor(phase);
    float breakHere = 9.0 + 15.0 * shoreNoise(q * 0.043 + 3.1 + wave * 5.3) * shelter;
    float breakNext = 9.0 + 15.0 * shoreNoise(q * 0.043 + 3.1 + (wave + 1.0) * 5.3) * shelter;
    breakAt = mix(breakHere, breakNext, smoothstep(0.55, 0.92, x));
    broken = 1.0 - smoothstep(breakAt - 1.2, breakAt + 1.6, d);
    float shoal = 1.0 - smoothstep(breakAt, 44.0, d);
    // A breaker's profile across the beach: a long gentle back and a gentler face (x near 1):
    // spilling breakers on a shelving beach are low and long, never a steep wall.
    float face = mix(0.5, 0.34, shoal);
    // A skewed cosine: smooth at crest and trough (no crease in the shading), steep in front.
    float theta = x < 1.0 - face ? x / (1.0 - face) * 3.14159265 : 3.14159265 * (1.0 + (x - 1.0 + face) / face);
    float dhdx = -0.5 * sin(theta) * 3.14159265 / (x < 1.0 - face ? 1.0 - face : face);
    float dxdd = SURF_TRAVEL / (2.0 * sqrt(max(d, 0.6)) * SURF_PERIOD);
    float amp = shelter * (0.015 + 0.3 * shoal * shoal) * mix(1.0, 0.45, broken * (1.0 - clamp(d / breakAt, 0.0, 1.0)));
    // At the waterline the spent bore is a flat sheet: no tilt (it would mirror the sky there).
    surfSlope = toSea * clamp(amp * dhdx * dxdd, -0.7, 0.7) * nearShore * smoothstep(0.0, 3.5, d);
    // The open swell fades in the shallows as the breakers take over.
    slope = slope * mix(1.0, 0.5, nearShore * (1.0 - smoothstep(0.0, 34.0, d))) + surfSlope;
    // White water: the bore behind each broken crest (fresh, nearly solid), its lip, the spill
    // on a crest about to break, and the lacy trails it leaves behind as it moves on.
    // Every term is 1 at the crest from both sides, so the front of the white water has no seam.
    float bore = broken * max(smoothstep(0.84, 1.0, x), exp(-x / 0.7));
    float spill = (1.0 - broken) * sqrt(shoal) * max(smoothstep(0.93, 1.0, x), exp(-x / 0.06)) * 0.85;
    float trail = broken * exp(-x / 1.7) * 0.62;
    // Some stretches of beach break harder than others.
    float vigour = (0.3 + 0.7 * smoothstep(0.2, 0.65, noise(q * 0.03 - 4.0))) * (0.6 + 0.4 * smoothstep(0.3, 0.6, noise(q * 0.16 + 2.0)));
    surfFoam = clamp(max(max(bore, trail) * vigour, spill * (0.6 + 0.4 * vigour)), 0.0, 1.0) * shelter;
    // At the waterline there is always a little white water from the last swash.
    surfFoam = max(surfFoam, (1.0 - smoothstep(0.0, 1.5 + 2.0 * shoreNoise(q * 0.31), max(d, 0.0))) * 0.7 * step(0.0, d));
    // And where the water laps over the sand (or a trough bares it) its thin edge is white.
    surfFoam = max(surfFoam, (1.0 - smoothstep(0.0, 0.07 + 0.1 * shoreNoise(q * 0.7 + time * 0.1), column)) * 0.9);
    // No foam below a trace: the foam cells (the costly part) are only drawn where there is some.
    surfFoam *= nearShore * smoothstep(0.0, 0.05, surfFoam);
  }
  // ----- The shape of the swell (open sea only) -----
  // The long and medium waves, read apart from the chop: how high this point sits between the
  // trough (-1) and the tallest crest (+1) of the sea as it is now, and which way its face leans.
  // Purely the paint, like the shore: the normal is exaggerated so the faces catch light and
  // shadow, the mesh and the boats' water are not touched.
  float openSea = 1.0 - nearShore;
  float hNorm = clamp(vHeight / waveReach(time), -1.0, 1.0);
  slope += (bigSlope * ${SWELL_SHADING.exaggerate.toFixed(2)} - (slope - bigSlope - stirred.yz - hull.yz) * ${(1 - SWELL_SHADING.chopKeep).toFixed(2)}) * openSea;
  vec3 n = normalize(vec3(-slope.x - detail.x * ${SWELL_SHADING.detailKeep.toFixed(2)}, 1.0, -slope.y - detail.y * ${SWELL_SHADING.detailKeep.toFixed(2)}));
  float nv = max(dot(n, view), 0.02);
  // Roughness: the waves too small to draw make the sea rougher the farther it is.
  // Calm patches stay glassy far out and rough ones go matt, so the far sea is not one tone.
  float rough = clamp(0.04 + 0.5 * smoothstep(20.0, 400.0, dist) * mix(0.6, 1.25, choppy) + 0.5 * length(slope) * 0.15, 0.04, 0.6);
  float alpha = rough * rough;
  // Schlick's Fresnel for water (F0 about 0.02), tamed at grazing angles on a rough sea.
  float f0 = 0.02;
  float fresnel = f0 + (max(1.0 - rough, f0) - f0) * pow(1.0 - nv, 5.0);
  // What the sea mirrors: the same sky the dome draws (the sun itself is added below with GGX),
  // and over it the scene's own reflection (islands, palms, markets, boats): the picture the
  // mirrored camera drew (reflection.ts), looked up at this pixel's screen position, moved by the
  // slope of the waves and blurred by the roughness. Where the picture has nothing (no texture,
  // the edge of the screen, behind the camera) the analytic sky is the mirror, as it always was.
  vec3 reflected = reflect(-view, n);
  reflected.y = abs(reflected.y);
  vec3 mirror = skyRadiance(reflected, false);
  vec4 scene = reflectionAt(vec3(vWorld.x, 0.0, vWorld.z), vec3(reflected.x, -reflected.y, reflected.z), dist, rough);
  mirror = mix(mirror, scene.rgb, scene.a);
  // ----- The water's own colour -----
  // Light that goes in and comes back: Beer-Lambert absorption over the path down to the floor
  // and back up (red is eaten first, then green), the sandy bottom showing through the shallows
  // with caustics dancing on it, and the light scattered by the water itself.
  vec3 skyIrradiance = mix(toLinear(horizon), toLinear(zenith), 0.6);
  float nl = max(dot(vec3(0.0, 1.0, 0.0), sunDir), 0.0);
  float shade = boatShadow(vWorld.xz, sunDir);
  float sunlit = 1.0 - ${SHADOW.sun.toFixed(2)} * shade;
  vec3 incident = skyIrradiance * 0.55 + sunColor() * SUN_RADIANCE * nl * 0.55 * sunlit + nightGlow;
  vec3 refracted = refract(-view, n, 0.75);
  // The water is a little murky (1.7 x the clear-water path), so the sand fades to turquoise.
  // How deep the floor LOOKS (paint only: the physics and the island floors keep seabedDepth): a
  // wide, gently shelving shallows round every island with sandbanks (shallower, paler) and
  // channels (deeper, bluer) wandering through it, so the floor shows far beyond the beach and
  // falls into deep blue only a few hundred metres out.
  float bank = noise(q * 0.011 + 3.0) * 0.65 + noise(q * 0.04 - 7.0) * 0.35;
  float lookDepth = (3.0 + 16.0 * smoothstep(20.0, 320.0, d) + 12.0 * smoothstep(320.0, 950.0, d)) * mix(0.4, 1.3, bank);
  float seeDepth = mix(depth, lookDepth, smoothstep(10.0, 40.0, d));
  float path = seeDepth * 0.8 * (1.0 + 1.0 / max(-refracted.y, 0.25));
  vec3 transmit = exp(-absorb * path);
  // The sea floor where it can be seen: sand with ripples and darker weed patches, seen through
  // the surface (shifted by the refracted view), lit by caustics in the shallows.
  vec3 floorColor = vec3(0.0);
  float seeFloor = transmit.g;
  if (seeFloor > 0.004) {
    vec2 b = q + refracted.xz / max(-refracted.y, 0.3) * seeDepth;
    float sandRipple = noise(vec2(dot(b, toSea) * 1.7, dot(b, vec2(-toSea.y, toSea.x)) * 0.25)) - 0.5;
    float weed = smoothstep(0.62, 0.8, noise(b * 0.09 + 11.0)) * smoothstep(3.0, 8.0, seeDepth);
    // Dunes, banks and dark hollows of the deep floor, wide enough to read from a long way off.
    float dune = noise(b * 0.018 + 40.0) * 0.7 + noise(b * 0.06 - 13.0) * 0.3;
    vec3 bed = toLinear(sand) * (0.92 + 0.22 * sandRipple) * (0.45 + 1.1 * dune);
    bed = mix(bed, toLinear(sand) * vec3(0.32, 0.42, 0.26), weed * 0.7);
    // Reef: rock and coral on the banks, where the floor is shallow and away from the beach.
    float reef = smoothstep(0.64, 0.76, noise(b * 0.03 + 21.0)) * (1.0 - smoothstep(9.0, 17.0, seeDepth)) * smoothstep(12.0, 40.0, d);
    float coral = noise(b * 0.35 + 4.0);
    bed = mix(bed, mix(toLinear(vec3(0.2, 0.19, 0.18)), toLinear(vec3(0.85, 0.36, 0.3)), smoothstep(0.55, 0.75, coral)) * 0.8, reef * 0.85);
    // Shoals of small fish round the islands, as shadows on the floor (seen only in the shallows,
    // not on the beach or far out), softer the deeper they are.
    float shoalWeight = smoothstep(6.0, 18.0, d) * (1.0 - smoothstep(10.0, 17.0, seeDepth)) * (1.0 - smoothstep(60.0, 170.0, dist)) * smoothstep(0.3, 1.2, seeDepth);
    if (shoalWeight > 0.01) bed *= 1.0 - 0.8 * shoalWeight * shoals(b, time, seeDepth * 0.25);
    // Light on the floor: a web of caustics over the whole of the shallows, in sight out to a long way.
    float causticWeight = smoothstep(0.05, 0.9, seeDepth) * (1.0 - smoothstep(4.0, 17.0, seeDepth)) * (1.0 - smoothstep(30.0, 170.0, dist));
    // The web is only worth its cost where it can be seen.
    float caustic = causticWeight > 0.002 ? caustics(b * 1.2, time) * causticWeight : 0.0;
    // Slow broad shafts of light (a stretched noise drifting along the surface) over the caustics.
    float shaft = 0.8 + 0.5 * noise(vec2(dot(b, vec2(0.7, 0.3)) * 0.05 + time * 0.05, dot(b, vec2(-0.3, 0.7)) * 0.012));
    floorColor = bed * (incident * 0.42 * shaft + sunColor() * SUN_RADIANCE * nl * sunlit * caustic * 0.38);
  }
  // The water's own hue: deep blue offshore, drifting toward a greener teal in wide patches,
  // and turquoise over the sand shelf where the bottom reflects light back up.
  float hue = noise(q * 0.0045 + 5.0) * 0.6 + noise(q * 0.012 - time * 0.003) * 0.4;
  vec3 open = mix(toLinear(deep), toLinear(deepTeal), smoothstep(0.32, 0.72, hue));
  vec3 scatterColor = mix(open, toLinear(shallow), (1.0 - smoothstep(4.0, 22.0, seeDepth)) * 0.85);
  // Sun on the faces: a face tilted toward the sun is lit, the one behind it is in its own shade, a
  // trough is darker (less sky, a deeper blue) and a crest is paler. Open sea only.
  float faceSun = clamp(-dot(bigSlope, sunDir.xz) / max(length(sunDir.xz), 0.2) * ${SWELL_SHADING.face.toFixed(2)}, -1.0, 1.0);
  float shape = (1.0 + faceSun * 0.55) * mix(${SWELL_SHADING.trough.toFixed(2)}, ${SWELL_SHADING.crest.toFixed(2)}, smoothstep(-0.4, 0.5, hNorm));
  incident *= mix(1.0, shape, openSea);
  vec3 body = floorColor * transmit + scatterColor * incident * 0.4 * (1.0 - transmit);
  // ----- What is under the water (clear-water.ts) -----
  // Boat hulls, piles, rocks, buoys, the hooked fish and the line are drawn on a layer of their own,
  // below the waves only, already dimmed and tinted by the depth (red first). Where the layer has
  // something, the water shows it through itself, fading into its own body with depth (clearer over
  // the shallows); the Fresnel mirror, the glitter and the foam come over it, as over everything.
  // Switched off (underOn 0) the sea is the opaque one it always was: no texture read at all.
  if (underOn > 0.5) {
    vec4 under = underLayerAt(vWorld, slope, smoothstep(3.0, 13.0, depth));
    body = mix(body, under.rgb * incident * ${CLEAR.light.toFixed(2)}, under.a);
  }
  // Light through the waves: crests seen against the sun glow green-blue (subsurface), and so
  // does the thin face of a breaker about to curl.
  float against = pow(clamp(dot(-view, normalize(vec3(sunDir.x, 0.0, sunDir.z))) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  float thin = smoothstep(0.0, 0.8, (vHeight * 1.2 + length(slope) * 1.5) / ${SEA_GAIN.toFixed(3)});
  body += toLinear(shallow) * vec3(0.3, 0.8, 0.7) * (against * thin * 0.4 + nearShore * (1.0 - broken) * smoothstep(0.1, 0.7, length(surfSlope)) * 0.25) * incident * 0.35;
  // In the shadow the water is lit by the sky alone, and the sky it mirrors is partly blocked by the hull.
  body *= 1.0 - ${SHADOW.sky.toFixed(2)} * shade;
  vec3 color = body * (1.0 - fresnel) + mirror * (fresnel * (1.0 - ${SHADOW.mirror.toFixed(2)} * shade));
  // The sun on the water: GGX specular, a bright glitter path whose width grows with roughness.
  vec3 halfway = normalize(view + sunDir);
  float nh = max(dot(n, halfway), 0.0);
  float nlSun = max(dot(n, sunDir), 0.0);
  float vh = max(dot(view, halfway), 0.0);
  float fSun = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  float specular = distributionGGX(nh, max(alpha, 0.0009)) * visibilitySmith(nlSun, nv, max(alpha, 0.03)) * fSun * nlSun;
  color += sunColor() * SUN_RADIANCE * min(specular, 40.0) * sunlit;
  // The moon's glitter path: the same highlight from the moon's direction (black by day).
  if (moonLight.b > 0.002) {
    vec3 moonDir = normalize(moonDirection);
    vec3 moonHalf = normalize(view + moonDir);
    float moonNl = max(dot(n, moonDir), 0.0);
    float moonVh = max(dot(view, moonHalf), 0.0);
    float moonF = f0 + (1.0 - f0) * pow(1.0 - moonVh, 5.0);
    float moonSpec = distributionGGX(max(dot(n, moonHalf), 0.0), max(alpha, 0.0009)) * visibilitySmith(moonNl, nv, max(alpha, 0.03)) * moonF * moonNl;
    color += moonLight * SUN_RADIANCE * min(moonSpec, 40.0);
  }
  // Foam: white caps on steep crests and the surf, broken up into lace. It is a rough white
  // surface, so it takes the light that falls on it (sun and sky), not the mirror.
  float cap = smoothstep(0.46, 0.92, (vHeight * 0.9 + length(slope) * 0.9) / ${SEA_GAIN.toFixed(3)}) * (1.0 - nearShore * 0.7);
  if (cap > 0.0 || surfFoam > 0.0) {
    // The lace drifts toward the beach with the bores; fresh foam is nearly solid, old foam
    // keeps only the edges of the bubble cells (thin trails), far foam is a soft wash.
    vec2 drift = q + toSea * time * 0.55;
    // Bubbles: round holes at the cell centres, the foam between them stays as soft walls.
    // The coordinates are warped, so the bubbles are uneven in size and shape.
    vec2 warp = drift + vec2(noise(drift * 0.5 + 3.0), noise(drift * 0.5 - 6.0)) * 1.4;
    vec2 cells = foamCells(warp * 1.1, time * 0.7);
    float walls = smoothstep(0.04, 0.38 + 0.25 * noise(drift * 0.8), cells.x);
    float blot = noise(warp * 0.5) * 0.45 + noise(warp * 1.4 + 7.0) * 0.35 + noise(q * 3.6 - time * 0.3) * 0.2;
    float lace = blot * 0.62 + walls * 0.38;
    float laceFar = smoothstep(25.0, 140.0, dist);
    float capLace = noise(vWorld.xz * 1.35 + vec2(time * 0.25, -time * 0.18)) * 0.65 + noise(vWorld.xz * 3.7 - time * 0.4) * 0.35;
    float foam = cap * smoothstep(0.38, 0.72, capLace) * 0.85;
    float need = 1.0 - surfFoam;
    float surf = max(mix(smoothstep(need - 0.08, need + 0.08, lace) * min(1.0, surfFoam * 3.0), surfFoam * 0.85, laceFar), surfFoam * 0.3);
    foam = clamp(max(foam, surf), 0.0, 1.0);
    vec3 foamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * max(nlSun, nl * 0.6) * 0.3 * sunlit + nightGlow + moonLight * SUN_RADIANCE * max(normalize(moonDirection).y, 0.0) * 0.3);
    color = mix(color, foamColor, foam);
  }
  // Foam streaks on the tallest crests, only when the sea state is high (none on a calm sea): the
  // height of the point on the swell plus its steepness, broken into streaks that run along the
  // crest line (long across the wind, short along it), with a finer lace over them.
  float crestSea = smoothstep(${CREST.seaFrom.toFixed(2)}, ${CREST.seaTo.toFixed(2)}, seaState(time)) * openSea * (1.0 - smoothstep(180.0, 420.0, dist));
  if (crestSea > 0.0) {
    float crestTop = smoothstep(${CREST.from.toFixed(2)}, ${CREST.to.toFixed(2)}, hNorm + length(bigSlope) * 0.9 + (noise(q * 0.011 + 3.0) - 0.5) * 0.3);
    if (crestTop > 0.0) {
      float along = noise(vec2(dot(q, WIND) * 0.6 - time * 0.35, dot(q, across) * 0.1));
      float lace = noise(q * 3.1 + vec2(time * 0.2, -time * 0.15)) * 0.6 + noise(q * 7.3 - time * 0.3) * 0.4;
      float crestFoam = crestTop * smoothstep(0.5, 0.62, along * 0.6 + lace * 0.4) * ${CREST.strength.toFixed(2)} * crestSea;
      vec3 crestFoamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * max(nlSun, nl * 0.6) * 0.3 * sunlit + nightGlow + moonLight * SUN_RADIANCE * max(normalize(moonDirection).y, 0.0) * 0.3);
      color = mix(color, crestFoamColor, crestFoam);
      // The look of a curl (a painted lip, not geometry: the mesh must never fold). Just ahead of
      // a tall crest the front face is darker, as if the lip overhung it; the crest line itself
      // catches a thin bright edge; and foam streams down the front face along the slope.
      float travel = dot(bigSlope, WIND);
      float front = smoothstep(${CURL.frontFrom.toFixed(3)}, ${CURL.frontTo.toFixed(3)}, -travel);
      float lip = (1.0 - smoothstep(0.0, ${CURL.lipWidth.toFixed(3)}, abs(travel))) * crestTop;
      color *= 1.0 - ${CURL.undercut.toFixed(2)} * front * crestTop * crestSea;
      color += crestFoamColor * lip * ${CURL.lip.toFixed(2)} * crestSea;
      vec2 down = WIND;
      float stream = noise(vec2(dot(q, down) * 0.2 + time * 0.5, dot(q, vec2(-down.y, down.x)) * 0.35));
      float runoff = smoothstep(0.35, 0.8, front) * crestTop * smoothstep(0.5, 0.72, stream * 0.8 + lace * 0.2) * ${CURL.runoff.toFixed(2)} * crestSea;
      color = mix(color, crestFoamColor, runoff);
    }
  }
  // The white water at the hulls (hullWater): a rough surface like the other foam.
  if (hull.x > 0.01) {
    vec3 hullFoamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * max(nlSun, nl * 0.6) * 0.3 * sunlit + nightGlow + moonLight * SUN_RADIANCE * max(normalize(moonDirection).y, 0.0) * 0.3);
    color = mix(color, hullFoamColor, hull.x * (1.0 - smoothstep(120.0, 260.0, dist)));
  }
  // The white water behind the boats (ripple-sim.ts): the grid holds only how dense the foam is,
  // spread and thinned by the simulation; the bubbles come from here, the way the surf's lace does,
  // so thick foam is solid and thin foam breaks into patches and then into nothing.
  {
    float density = stirred.w;
    if (density > 0.012) {
      vec2 wq = vWorld.xz;
      vec2 wwarp = wq + vec2(noise(wq * 0.7 + 3.0), noise(wq * 0.7 - 6.0)) * 2.0;
      vec2 wcells = foamCells(wwarp * 2.4, time * 0.9);
      float wwalls = smoothstep(0.04, 0.4 + 0.25 * noise(wq * 0.9), wcells.x);
      float wblot = noise(wwarp * 0.8) * 0.45 + noise(wwarp * 2.1 + 7.0) * 0.35 + noise(wq * 4.8 - time * 0.3) * 0.2;
      float wlace = wblot * 0.58 + wwalls * 0.42;
      // Where the foam is dense the lace is nearly all covered; where it is thin only the
      // thickest parts of the lace stay.
      float wneed = 1.0 - density;
      float wcover = smoothstep(wneed - 0.17, wneed + 0.17, wlace) * min(1.0, density * 2.4);
      float wsolid = smoothstep(0.7, 1.0, density);
      float wfoam = clamp(max(wcover, wsolid * 0.92), 0.0, 1.0) * (1.0 - smoothstep(60.0, 95.0, dist));
      // Churned water is a little paler and greener even where the foam has thinned out.
      color = mix(color, color * 1.12 + vec3(0.02, 0.06, 0.06), smoothstep(0.02, 0.5, density) * 0.4);
      vec3 wakeFoamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * max(nlSun, nl * 0.6) * 0.3 * sunlit);
      color = mix(color, wakeFoamColor, wfoam);
    }
  }
  // Aerial perspective: far water takes the colour of the sky toward the horizon in its own
  // direction, so the fog and the sky meet without a seam.
  vec3 haze = skyRadiance(normalize(vec3(-view.x, 0.015, -view.z)), false);
  float fog = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  color = mix(color, haze, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(toScreen(color), 1.0);
}`;

export interface Water {
  mesh: Mesh;
  /** The swash sheets on the beaches (swash.ts), on the same clock as the surf. */
  swash: Mesh[];
  /** Gives the water its planar reflection (reflection.ts); undefined goes back to the sky alone. */
  setReflection(texture: BaseTexture | undefined): void;
  /** Gives the water the grid of the water the boats stir (ripple-sim.ts `pack`), whose window is centred at (cx, cz). */
  setStirred(pixels: Float32Array, cx: number, cz: number): void;
  /** Gives the water the layer of what lies under it (clear-water.ts); undefined is the opaque sea. */
  setUnderlayer(texture: BaseTexture | undefined): void;
  /** Keeps the grid centred under the camera and advances the wave clock. */
  update(
    cameraX: number,
    cameraZ: number,
    time: number,
    boats?: readonly BoatSpot[],
  ): void;
}

export function createWater(scene: Scene): Water {
  // Dense near the camera, sparse far away, so waves stay smooth where they are seen; the far
  // rings reach past the fog (water-extent.ts) so a high camera never sees the edge of the sea.
  const radii = waterRingRadii();
  const rings = radii.length;
  // 144 slices (was 96): the pinched crests and the 12 to 20 m medium waves need a vertex every few
  // metres round the camera too, at 100 m out as well as near.
  const slices = 192;
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    const radius = radii[ring - 1]!;
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
        ...ATMOSPHERE_UNIFORMS,
        "deep",
        "shallow",
        "deepTeal",
        "sand",
        "fogDensity",
        "shoreIslands",
        "boats",
        "viewProjection",
        "reflectionSize",
        "underOn",
        "simCentre",
      ],
      samplers: [
        "rippleMap",
        "coastMap",
        "reflectionMap",
        "underMap",
        "simMap",
      ],
    },
  );
  material.backFaceCulling = false;
  bindAtmosphere(material);
  material.setColor3("deep", SEA.deep);
  material.setColor3("shallow", SEA.shallow);
  material.setColor3("deepTeal", SEA.deepTeal);
  material.setColor3("sand", SEA_FLOOR);
  material.setFloat("fogDensity", SEA.fogDensity);
  material.setArray4("boats", new Array(BOAT_MAX * 4).fill(0));
  const ripples = new RawTexture(
    ripplePixels(),
    RIPPLE_SIZE,
    RIPPLE_SIZE,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  ripples.wrapU = Texture.WRAP_ADDRESSMODE;
  ripples.wrapV = Texture.WRAP_ADDRESSMODE;
  ripples.anisotropicFilteringLevel = 4;
  material.setTexture("rippleMap", ripples);
  // The coasts of every island (shore.ts), read exactly: no filtering, no mipmaps.
  const coasts = new RawTexture(
    coastPixels(),
    COAST_SAMPLES,
    coastRows(),
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  coasts.wrapU = Texture.WRAP_ADDRESSMODE;
  coasts.wrapV = Texture.CLAMP_ADDRESSMODE;
  material.setTexture("coastMap", coasts);
  material.setArray4("shoreIslands", shoreUniform());
  // Until the mirror exists (or for good if it cannot): a 1 x 1 transparent picture, which makes
  // the shader fall back to the analytic sky everywhere.
  const noReflection = new RawTexture(
    new Uint8Array(4),
    1,
    1,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  let reflection: BaseTexture | undefined;
  const simCentre = new Vector2();
  material.setTexture("reflectionMap", noReflection);
  material.setVector2("reflectionSize", new Vector2(1, 1));
  // The layer of what is under the water: until the clear-water pass gives one (or when it is switched
  // off) the sea reads nothing and stays opaque.
  const noUnder = new RawTexture(
    new Uint8Array(4),
    1,
    1,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  material.setTexture("underMap", noUnder);
  material.setFloat("underOn", 0);
  // The water the boats stir: one float texture, written every frame, read exactly (the shader
  // does the bilinear read itself, so no float filtering is needed).
  const stirred = new RawTexture(
    new Float32Array(SIM_N * SIM_N * 4),
    SIM_N,
    SIM_N,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_FLOAT,
  );
  stirred.wrapU = Texture.WRAP_ADDRESSMODE;
  stirred.wrapV = Texture.WRAP_ADDRESSMODE;
  material.setTexture("simMap", stirred);
  material.setVector2("simCentre", simCentre);
  mesh.material = material;
  const swash = createSwash(scene);
  const anchor = new Vector3();
  return {
    mesh,
    swash: swash.meshes,
    setReflection(texture) {
      reflection = texture;
      material.setTexture("reflectionMap", texture ?? noReflection);
    },
    setUnderlayer(texture) {
      material.setTexture("underMap", texture ?? noUnder);
      material.setFloat("underOn", texture ? 1 : 0);
    },
    setStirred(pixels, cx, cz) {
      stirred.update(pixels);
      simCentre.set(cx, cz);
      material.setVector2("simCentre", simCentre);
    },
    update(cameraX, cameraZ, time, boats) {
      swash.update(time);
      if (boats) material.setArray4("boats", packBoats(boats));
      material.setFloat("time", time);
      material.setFloat("fogDensity", SEA.fogDensity);
      if (reflection) {
        const size = reflection.getSize();
        material.setVector2(
          "reflectionSize",
          new Vector2(size.width, size.height),
        );
      }
      anchor.set(cameraX, 0, cameraZ);
      material.setVector3("anchor", anchor);
      material.setVector3(
        "cameraPosition",
        scene.activeCamera?.position ?? anchor,
      );
    },
  };
}
