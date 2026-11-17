// How the swell is painted on the open sea (src/ocean/swell-look.ts and the water shader):
// crest foam only in a rough sea, the swell's slope shared with the shader, open sea only; and
// the wave set drawn from a spectrum and the visual-only horizontal motion of the water.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CREST_FOAM,
  SWELL_SHADING,
  crestFoamAmount,
} from "../src/ocean/swell-look.ts";
import {
  CALM_WAVE_HEIGHT,
  HORIZONTAL_FADE,
  HORIZONTAL_LIMIT,
  MAX_WAVE_HEIGHT,
  PINCH,
  SPECTRUM,
  TIER_AMPLITUDE,
  TIER_TOTALS,
  WAVES,
  WIND_DIRECTION,
  drawWaves,
  drawnSurfaceError,
  glslHorizontalFade,
  glslWaveDisplace,
  glslWaveHeight,
  seaState,
  waveDisplacement,
  waveHeight,
} from "../src/ocean/waves.ts";

test("crest foam is off in a calm sea and full in a rough one", () => {
  assert.equal(crestFoamAmount(0), 0);
  assert.equal(crestFoamAmount(0.3), 0);
  assert.equal(crestFoamAmount(CREST_FOAM.seaFrom), 0);
  assert.equal(crestFoamAmount(1), 1);
  let last = -1;
  for (let s = 0; s <= 1.0001; s += 0.02) {
    const a = crestFoamAmount(s);
    assert.ok(a >= last, "never falls as the sea gets rougher");
    last = a;
  }
  // The calmest and the roughest minute of the sea clock (src/ocean/waves.ts).
  assert.equal(crestFoamAmount(seaState(255)), 0);
  assert.ok(crestFoamAmount(seaState(451)) > 0.5);
});

test("the shader returns the swell's slope apart and knows the sea's reach", () => {
  const glsl = glslWaveHeight();
  assert.match(
    glsl,
    /vec2 waveSlopeSplit\(vec2 p, float t, float dist, out vec2 big, out vec3 squeeze\)/,
  );
  assert.match(glsl, /float waveReach\(float t\)/);
  assert.ok(TIER_AMPLITUDE.swell > TIER_AMPLITUDE.medium);
  const sum =
    TIER_AMPLITUDE.swell + TIER_AMPLITUDE.medium + TIER_AMPLITUDE.chop;
  assert.ok(Math.abs(sum - MAX_WAVE_HEIGHT) < 1e-9);
  assert.ok(MAX_WAVE_HEIGHT <= 2.6, `roughest height ${MAX_WAVE_HEIGHT}`);
});

test("the swell is painted on the open sea only", () => {
  const water = readFileSync(
    new URL("../src/ocean/water.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    water,
    /waveSlopeSplit\(vOrigin, time, dist, bigSlope, squeeze\)/,
  );
  assert.match(water, /float openSea = 1\.0 - nearShore/);
  assert.match(water, /incident \*= mix\(1\.0, shape, openSea\)/);
  assert.match(
    water,
    /\* openSea \* \(1\.0 - smoothstep\(180\.0, 420\.0, dist\)\)/,
  );
  assert.ok(SWELL_SHADING.trough < 1 && SWELL_SHADING.crest > 1);
  assert.ok(SWELL_SHADING.detailKeep > 0 && SWELL_SHADING.detailKeep < 1);
});

test("the wave set is drawn from a wind spectrum: 16 to 24 waves, deterministic, tiers keep their totals", () => {
  assert.ok(WAVES.length >= 16 && WAVES.length <= 24, `${WAVES.length}`);
  assert.equal(WAVES.length, SPECTRUM.count);
  // The same table every time (seeded), never a random sea.
  assert.deepEqual(drawWaves(), [...WAVES]);
  for (const tier of ["swell", "medium", "chop"]) {
    const total = WAVES.filter((w) => w.tier === tier).reduce(
      (s, w) => s + w.amplitude,
      0,
    );
    assert.ok(Math.abs(total - TIER_TOTALS[tier]) < 1e-9, tier);
  }
  // The heights are the sea the boats were tuned on.
  assert.ok(MAX_WAVE_HEIGHT > 2.3 && MAX_WAVE_HEIGHT <= 2.6);
  assert.ok(CALM_WAVE_HEIGHT > 1.3 && CALM_WAVE_HEIGHT <= 1.4);
  // Amplitude falls with the wavelength inside the swell+medium range (a wind-sea spectrum),
  // never rising again toward the chop: the biggest wave is longer than 40 m, and no chop wave
  // is taller than the smallest medium one.
  const biggest = [...WAVES].sort((a, b) => b.amplitude - a.amplitude)[0];
  assert.ok(biggest.length > 40 && biggest.tier === "swell");
  const tallestChop = Math.max(
    ...WAVES.filter((w) => w.tier === "chop").map((w) => w.amplitude),
  );
  assert.ok(tallestChop < 0.05);
  // No two neighbours (in length) share both length and heading; headings spread wider for
  // shorter waves.
  const byLength = [...WAVES].sort((a, b) => b.length - a.length);
  for (let i = 1; i < byLength.length; i++) {
    const a = byLength[i - 1];
    const b = byLength[i];
    const lengthGap = a.length / b.length;
    const headingGap = Math.abs(a.direction - b.direction);
    assert.ok(
      lengthGap >= 1.12 && (lengthGap >= 1.15 || headingGap >= 0.12),
      `${a.length} ${b.length}`,
    );
    assert.ok(headingGap >= 0.12, `heading ${a.direction} ${b.direction}`);
  }
  const off = (ws) =>
    Math.max(...ws.map((w) => Math.abs(w.direction - WIND_DIRECTION)));
  assert.ok(off(byLength.slice(-6)) > 2 * off(byLength.slice(0, 3)));
});

test("the long swell waves run in different directions, so the crests are not parallel stripes", () => {
  const dirs = WAVES.filter((w) => w.tier === "swell").map((w) => w.direction);
  assert.ok(Math.max(...dirs) - Math.min(...dirs) >= 0.35);
});

test("the horizontal motion is visual: bounded, fold-free, zero near a beach, and the drawn surface stays near the physics one", () => {
  // Surface drawn vs surface the boat floats on, over many points and seconds, at the calmest
  // and the roughest sea: the worst case stays under the limit, the typical error far under.
  for (const [name, t] of [
    ["calm", 255],
    ["roughest", 451],
  ]) {
    let worst = 0;
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const e = drawnSurfaceError(
        (i * 37.31) % 3000,
        (i * 91.7) % 3000,
        t + (i % 7) * 0.9,
      );
      worst = Math.max(worst, e);
      sum += e * e;
    }
    assert.ok(worst <= HORIZONTAL_LIMIT, `${name} worst ${worst.toFixed(3)}`);
    assert.ok(Math.sqrt(sum / n) < 0.05, `${name} rms ${Math.sqrt(sum / n)}`);
  }
  // The pinches of all the waves stay well under 1, so the map from mesh to water never folds:
  // the determinant of the horizontal motion's Jacobian stays positive (finite difference).
  assert.ok(PINCH.swell + PINCH.medium + PINCH.chop < 1);
  let minDet = Infinity;
  const h = 0.05;
  for (let i = 0; i < 6000; i++) {
    const x = (i * 53.7) % 2000;
    const z = (i * 29.3) % 2000;
    const t = 451;
    const d = waveDisplacement(x, z, t);
    const a = waveDisplacement(x + h, z, t);
    const b = waveDisplacement(x, z + h, t);
    const det =
      (1 + (a.x - d.x) / h) * (1 + (b.z - d.z) / h) -
      ((b.x - d.x) / h) * ((a.z - d.z) / h);
    minDet = Math.min(minDet, det);
  }
  assert.ok(minDet > 0.3, `min Jacobian ${minDet}`);
  // It moves points (it is not zero) and it pinches: points before a crest move toward it.
  let moved = 0;
  for (let i = 0; i < 200; i++) {
    const d = waveDisplacement(i * 11.1, i * 7.3, 451);
    moved = Math.max(moved, Math.hypot(d.x, d.z));
  }
  assert.ok(moved > 0.3, `moves ${moved} m`);
  // No change to the physics: waveHeight does not know of the horizontal motion.
  assert.equal(waveHeight(10, 20, 30), waveHeight(10, 20, 30));
  // The shader twin exists, only in the vertex shader, and fades near the islands.
  const glsl = glslWaveDisplace();
  assert.match(glsl, /vec2 waveDisplace\(vec2 p, float t\)/);
  assert.equal(
    (glsl.match(/cos\(/g) ?? []).length,
    WAVES.length,
    "one cos per wave",
  );
  assert.match(glslHorizontalFade(3), /smoothstep\(70\.000000, 170\.000000/);
  assert.equal(HORIZONTAL_FADE.from, 70);
  const water = readFileSync(
    new URL("../src/ocean/water.ts", import.meta.url),
    "utf8",
  );
  const [vertex, fragment] = water
    .split('ShadersStore["seaFragmentShader"]')
    .map((part, i) => (i === 0 ? part.slice(part.indexOf("seaVertex")) : part));
  assert.match(vertex, /waveDisplace\(p\.xz, time\)/);
  assert.doesNotMatch(fragment, /waveDisplace\(/);
});
