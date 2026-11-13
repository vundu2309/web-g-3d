import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { WAKE_MAX, glslWake } from "./wake.ts";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { BED_DIP } from "./island-shape.ts";
import {
  BASE_WAVES,
  MAX_WAVE_HEIGHT,
  WIND_DIRECTION,
  glslWaveHeight,
} from "./waves.ts";
import { RIPPLE_RANGE, RIPPLE_SIZE, ripplePixels } from "./ripples.ts";
import { glslSkyModel } from "./sky-model.ts";
import { glslReflection } from "./reflection-model.ts";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { createSwash } from "./swash.ts";
import {
  DEEP_TEAL,
  DEEP_WATER,
  FOG_DENSITY,
  HORIZON,
  SEA_FLOOR,
  SHALLOW_WATER,
  SUN_DIRECTION,
  WATER_ABSORPTION,
  ZENITH,
} from "./sea-style.ts";
import { waterRingRadii } from "./water-extent.ts";
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
 * How much taller the sea is than the base table the white caps and the thin-crest glow were tuned
 * on (waves.ts): their thresholds are divided by it, so a taller sea has the same share of white
 * caps instead of a milky sheet on every crest.
 */
const SEA_GAIN =
  MAX_WAVE_HEIGHT / BASE_WAVES.reduce((s, w) => s + w.amplitude, 0);
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
/**
 * The water at a hull (see `hullWater` in the shader): the waterline is an ellipse-like outline
 * `beam` wide amidships and drawn to a point at the bow; `scale` turns the outline's size into
 * metres from the hull; the rings have this wavelength (m), spread `rate` wavelengths a
 * second and tilt the water by `height` (m, so a slope of height x 2 pi / wavelength).
 */
export const HULL_WATER = {
  halfLength: 3.9,
  beam: 1.45,
  shift: 0.2,
  scale: 1.2,
  wavelength: 2.1,
  rate: 0.5,
  height: 0.11,
};
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
${glslWake()}
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform vec3 anchor;
varying vec3 vWorld;
varying float vHeight;
varying vec4 vWake;
void main() {
  vec3 p = position;
  p.x += anchor.x;
  p.z += anchor.z;
  // The wake of the boats is added to the waves: height, slope and white water.
  vec4 wakeHere = wakeAt(p.xz, time);
  vWake = wakeHere;
  p.y = waveHeight(p.xz, time) + wakeHere.x;
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
varying vec3 vWorld;
varying float vHeight;
varying vec4 vWake;
${glslSkyModel()}
${glslShore(true)}
${glslReflection()}
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
// downwind. A boat is three slices (hull, cabin, mast) each at its own height, and the shadow
// of a slice is the slice shifted along the sun's ground direction by height / tan(elevation).
float boatShadow(vec2 p, vec3 sunDir) {
  vec2 away = -sunDir.xz / max(sunDir.y, 0.15);
  float dark = 0.0;
  for (int i = 0; i < ${BOAT_MAX}; i++) {
    vec4 boat = boats[i];
    if (boat.w < 0.5 || distance(p, boat.xy) > 22.0) continue;
    vec2 fwd = vec2(sin(boat.z), -cos(boat.z));
    vec2 side = vec2(cos(boat.z), sin(boat.z));
    for (int k = 0; k < 3; k++) {
      float h = k == 0 ? 0.5 : (k == 1 ? 1.7 : 3.4);
      float halfLength = k == 0 ? 4.0 : (k == 1 ? 2.0 : 0.45);
      float halfWidth = k == 0 ? 1.8 : (k == 1 ? 1.3 : 0.4);
      float shift = k == 1 ? 1.4 : 0.0;
      vec2 d = p - boat.xy - away * h - fwd * shift;
      float u = dot(d, fwd) / halfLength;
      float v = dot(d, side) / halfWidth;
      dark = max(dark, 1.0 - smoothstep(0.55, 1.05, length(vec2(u, v))));
    }
  }
  return dark;
}
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
    if (boat.w < 0.5 || dot(d, d) > 100.0) continue;
    vec2 fwd = vec2(sin(boat.z), -cos(boat.z));
    vec2 side = vec2(cos(boat.z), sin(boat.z));
    float u = dot(d, fwd) + ${HULL_WATER.shift.toFixed(2)};
    float v = dot(d, side);
    // The waterline: wide amidships, drawn in to a point at the bow, a little narrower at the stern.
    float hw = u > 0.0 ? mix(${HULL_WATER.beam.toFixed(2)}, 0.2, smoothstep(0.0, ${HULL_WATER.halfLength.toFixed(2)}, u)) : mix(${HULL_WATER.beam.toFixed(2)}, 1.0, smoothstep(0.0, ${HULL_WATER.halfLength.toFixed(2)}, -u));
    float edge = max((length(vec2(v / hw, u / ${HULL_WATER.halfLength.toFixed(2)})) - 1.0) * ${HULL_WATER.scale.toFixed(2)}, 0.0);
    // The collar: thin, ragged, never the same twice.
    float lap = noise(p * 3.4 + vec2(t * 0.35, -t * 0.28));
    // Wider and whiter where the bow parts the water and along the quarter, thinner at the stern.
    float push = 1.0 + 0.9 * smoothstep(0.5, 3.4, u);
    float collar = (1.0 - smoothstep(0.15, (0.8 + 1.4 * lap) * push, edge)) * (0.85 + 0.15 * lap);
    // Rings: a slow pulse (the boat rocks), each ring spreading about a metre a second.
    float pulse = 0.55 + 0.45 * sin(t * 0.9 + boat.x * 0.37 + boat.y * 0.23);
    float k = 6.2832 / ${HULL_WATER.wavelength.toFixed(2)};
    float phase = edge * k - 6.2832 * ${HULL_WATER.rate.toFixed(2)} * t;
    float fade = exp(-edge / 3.2) * smoothstep(0.0, 0.5, edge) * (1.0 - smoothstep(5.0, 8.5, edge));
    slope += normalize(d + 0.0001) * ${HULL_WATER.height.toFixed(3)} * k * cos(phase) * fade * pulse;
    // The crests of the first rings catch a little foam.
    float crest = smoothstep(0.55, 0.95, cos(phase)) * (1.0 - smoothstep(0.6, 5.0, edge)) * smoothstep(0.1, 0.5, edge) * (0.45 + 0.55 * pulse) * (0.5 + 0.5 * lap);
    foam = max(foam, max(collar, crest * 0.8));
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
  vec2 slope = waveSlope(vWorld.xz, time, dist) + vWake.yz + hull.yz;
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
  float column = vHeight - bedY;
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
  vec3 n = normalize(vec3(-slope.x - detail.x, 1.0, -slope.y - detail.y));
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
  float sunlit = 1.0 - 0.9 * shade;
  vec3 incident = skyIrradiance * 0.55 + sunColor() * SUN_RADIANCE * nl * 0.55 * sunlit;
  vec3 refracted = refract(-view, n, 0.75);
  // The water is a little murky (1.7 x the clear-water path), so the sand fades to turquoise.
  float path = depth * 1.7 * (1.0 + 1.0 / max(-refracted.y, 0.25));
  vec3 transmit = exp(-absorb * path);
  // The sea floor where it can be seen: sand with ripples and darker weed patches, seen through
  // the surface (shifted by the refracted view), lit by caustics in the shallows.
  vec3 floorColor = vec3(0.0);
  float seeFloor = transmit.g;
  if (seeFloor > 0.004) {
    vec2 b = q + refracted.xz / max(-refracted.y, 0.3) * depth;
    float sandRipple = noise(vec2(dot(b, toSea) * 1.7, dot(b, vec2(-toSea.y, toSea.x)) * 0.25)) - 0.5;
    float weed = smoothstep(0.62, 0.8, noise(b * 0.09 + 11.0)) * smoothstep(3.0, 8.0, depth);
    vec3 bed = toLinear(sand) * (0.92 + 0.22 * sandRipple);
    bed = mix(bed, toLinear(sand) * vec3(0.32, 0.42, 0.26), weed * 0.7);
    float causticWeight = smoothstep(0.05, 0.9, depth) * (1.0 - smoothstep(3.0, 8.0, depth)) * (1.0 - smoothstep(14.0, 70.0, dist));
    // The web is only worth its cost where it can be seen.
    float caustic = causticWeight > 0.002 ? caustics(b * 1.2, time) * causticWeight : 0.0;
    floorColor = bed * (incident * 0.42 + sunColor() * SUN_RADIANCE * nl * sunlit * caustic * 0.3);
  }
  // The water's own hue: deep blue offshore, drifting toward a greener teal in wide patches,
  // and turquoise over the sand shelf where the bottom reflects light back up.
  float hue = noise(q * 0.0045 + 5.0) * 0.6 + noise(q * 0.012 - time * 0.003) * 0.4;
  vec3 open = mix(toLinear(deep), toLinear(deepTeal), smoothstep(0.32, 0.72, hue));
  vec3 scatterColor = mix(open, toLinear(shallow), (1.0 - smoothstep(3.0, 13.0, depth)) * 0.85);
  vec3 body = floorColor * transmit + scatterColor * incident * 0.4 * (1.0 - transmit);
  // Light through the waves: crests seen against the sun glow green-blue (subsurface), and so
  // does the thin face of a breaker about to curl.
  float against = pow(clamp(dot(-view, normalize(vec3(sunDir.x, 0.0, sunDir.z))) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  float thin = smoothstep(0.0, 0.8, (vHeight * 1.2 + length(slope) * 1.5) / ${SEA_GAIN.toFixed(3)});
  body += toLinear(shallow) * vec3(0.3, 0.8, 0.7) * (against * thin * 0.4 + nearShore * (1.0 - broken) * smoothstep(0.1, 0.7, length(surfSlope)) * 0.25) * incident * 0.35;
  // In the shadow the water is lit by the sky alone, and the sky it mirrors is partly blocked by the hull.
  body *= 1.0 - 0.45 * shade;
  vec3 color = body * (1.0 - fresnel) + mirror * (fresnel * (1.0 - 0.3 * shade));
  // The sun on the water: GGX specular, a bright glitter path whose width grows with roughness.
  vec3 halfway = normalize(view + sunDir);
  float nh = max(dot(n, halfway), 0.0);
  float nlSun = max(dot(n, sunDir), 0.0);
  float vh = max(dot(view, halfway), 0.0);
  float fSun = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  float specular = distributionGGX(nh, max(alpha, 0.0009)) * visibilitySmith(nlSun, nv, max(alpha, 0.03)) * fSun * nlSun;
  color += sunColor() * SUN_RADIANCE * min(specular, 40.0) * sunlit;
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
    vec3 foamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * max(nlSun, nl * 0.6) * 0.3 * sunlit);
    color = mix(color, foamColor, foam);
  }
  // The white water at the hulls (hullWater): a rough surface like the other foam.
  if (hull.x > 0.01) {
    vec3 hullFoamColor = vec3(0.93, 0.96, 0.97) * (skyIrradiance * 0.7 + sunColor() * SUN_RADIANCE * max(nlSun, nl * 0.6) * 0.3 * sunlit);
    color = mix(color, hullFoamColor, hull.x * (1.0 - smoothstep(120.0, 260.0, dist)));
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
  /** Keeps the grid centred under the camera and advances the wave clock. */
  update(
    cameraX: number,
    cameraZ: number,
    time: number,
    wake?: readonly number[],
    boats?: readonly BoatSpot[],
  ): void;
}

export function createWater(scene: Scene): Water {
  // Dense near the camera, sparse far away, so waves stay smooth where they are seen; the far
  // rings reach past the fog (water-extent.ts) so a high camera never sees the edge of the sea.
  const radii = waterRingRadii();
  const rings = radii.length;
  const slices = 96;
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
        "sunDirection",
        "horizon",
        "zenith",
        "deep",
        "shallow",
        "deepTeal",
        "sand",
        "fogDensity",
        "shoreIslands",
        "wake",
        "boats",
        "viewProjection",
        "reflectionSize",
      ],
      samplers: ["rippleMap", "coastMap", "reflectionMap"],
    },
  );
  material.backFaceCulling = false;
  material.setVector3("sunDirection", SUN_DIRECTION);
  material.setColor3("horizon", HORIZON);
  material.setColor3("zenith", ZENITH);
  material.setColor3("deep", DEEP_WATER);
  material.setColor3("shallow", SHALLOW_WATER);
  material.setColor3("deepTeal", DEEP_TEAL);
  material.setColor3("sand", SEA_FLOOR);
  material.setFloat("fogDensity", FOG_DENSITY);
  material.setArray4("wake", new Array(WAKE_MAX * 4).fill(0));
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
  material.setTexture("reflectionMap", noReflection);
  material.setVector2("reflectionSize", new Vector2(1, 1));
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
    update(cameraX, cameraZ, time, wake, boats) {
      swash.update(time);
      if (boats) material.setArray4("boats", packBoats(boats));
      material.setFloat("time", time);
      if (reflection) {
        const size = reflection.getSize();
        material.setVector2(
          "reflectionSize",
          new Vector2(size.width, size.height),
        );
      }
      if (wake) material.setArray4("wake", wake as number[]);
      anchor.set(cameraX, 0, cameraZ);
      material.setVector3("anchor", anchor);
      material.setVector3(
        "cameraPosition",
        scene.activeCamera?.position ?? anchor,
      );
    },
  };
}
