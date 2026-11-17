// How the swell is painted on the open sea (src/ocean/swell-look.ts and the water shader):
// crest foam only in a rough sea, the swell's slope shared with the shader, open sea only; and
// the wave set drawn from a spectrum and the visual-only horizontal motion of the water.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SHORE_ISLANDS } from "../src/ocean/shore.ts";
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
  REST_STEPS,
  SPECTRUM,
  TIER_AMPLITUDE,
  TIER_TOTALS,
  WAVES,
  WIND_DIRECTION,
  drawWaves,
  drawnSurfaceError,
  horizontalFade,
  restHeight,
  restPoint,
  waveGradient,
  waveMotion,
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

test("the physics follows the drawn surface: the Newton iteration converges and the residual stays under the limit, at the calmest and the roughest sea", () => {
  for (const [name, t] of [
    ["calm", 255],
    ["roughest", 451],
    ["roughest, later", 452.7],
    ["roughest, 380 s", 380],
  ]) {
    let worstError = 0;
    let worstResidual = 0;
    let sum = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      // A grid of points over the play area and far out, including the island zones.
      const x = ((i * 37.31) % 3000) - 1500;
      const z = ((i * 91.7) % 3000) - 1500;
      const e = drawnSurfaceError(x, z, t);
      worstError = Math.max(worstError, e);
      sum += e * e;
      worstResidual = Math.max(worstResidual, restPoint(x, z, t).residual);
    }
    assert.ok(
      worstError <= HORIZONTAL_LIMIT,
      `${name}: drawn against physics ${worstError.toFixed(4)} m`,
    );
    assert.ok(worstResidual < 0.05, `${name}: residual ${worstResidual} m`);
    assert.ok(Math.sqrt(sum / n) < 0.005, `${name}: rms`);
  }
  // Fewer steps would not do: one step alone leaves a visible residual at the roughest sea.
  assert.ok(REST_STEPS >= 3 && REST_STEPS <= 5);
});

test("a boat at rest floats at the height of the crest it sits on, to within 3 cm", () => {
  // Hull positions all over the sea at the roughest minute: the mesh vertex that is drawn at the
  // hull's x, z (found independently by walking the displaced mesh) has the physics height.
  for (let i = 0; i < 300; i++) {
    const x = ((i * 53.1) % 700) - 350;
    const z = ((i * 29.7) % 700) - 350;
    const t = 451 + (i % 5) * 0.7;
    const hull = waveHeight(x, z, t);
    // Walk the mesh: from the rest position the solver found, the vertex lands on (x, z) and
    // its drawn height is its rest height.
    const p = restPoint(x, z, t);
    const d = waveDisplacement(p.x, p.z, t);
    assert.ok(Math.abs(p.x + d.x - x) < 0.01 && Math.abs(p.z + d.z - z) < 0.01);
    assert.ok(
      Math.abs(restHeight(p.x, p.z, t) - hull) < 0.03,
      `hull ${hull} against drawn ${restHeight(p.x, p.z, t)}`,
    );
  }
  // The slope the keel feels is the slope of the drawn surface: a central difference of the
  // physics height matches the analytic gradient on the crests too (not only in the troughs).
  const e = 1e-3;
  for (let i = 0; i < 80; i++) {
    const x = ((i * 41.3) % 400) - 200;
    const z = ((i * 17.9) % 400) - 200;
    const t = 451;
    const g = waveGradient(x, z, t);
    const gx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
    const gz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
    assert.ok(Math.abs(g.x - gx) < 2e-3 && Math.abs(g.z - gz) < 2e-3, `${i}`);
  }
});

test("the horizontal motion pinches without folding: the Jacobian stays positive, near zero near a beach, and the shader twin exists", () => {
  // The pinches stay under the fold: the smallest determinant of the drawn mesh's Jacobian
  // (the squeeze matrix summed in the same loop) at the roughest sea is small, so crests are
  // pointed, and positive, so the mesh never folds.
  let minDet = Infinity;
  let calmDet = Infinity;
  for (let i = 0; i < 12000; i++) {
    const x = ((i * 53.7) % 3000) - 1500;
    const z = ((i * 29.3) % 3000) - 1500;
    for (const [t, into] of [
      [451, "rough"],
      [452.7, "rough"],
      [380, "rough"],
      [255, "calm"],
    ]) {
      if (i % 4 !== 0 && into === "calm") continue;
      const m = waveMotion(x, z, t);
      const f = horizontalFade(x, z);
      const det = (1 - f * m.xx) * (1 - f * m.zz) - f * f * m.xz * m.xz;
      if (into === "rough") minDet = Math.min(minDet, det);
      else calmDet = Math.min(calmDet, det);
    }
  }
  assert.ok(minDet > 0.12, `smallest determinant ${minDet}`);
  assert.ok(minDet < 0.5, `crests are pointed: ${minDet}`);
  assert.ok(calmDet > minDet, `calm ${calmDet}`);
  // The squeeze matrix is the real Jacobian of the motion: compare with a finite difference.
  const h = 0.01;
  for (let i = 0; i < 100; i++) {
    const x = ((i * 31.7) % 1000) + 300;
    const z = ((i * 19.3) % 1000) + 300;
    const d0 = waveMotion(x, z, 451);
    const dx = waveMotion(x + h, z, 451);
    const dz = waveMotion(x, z + h, 451);
    const m = waveMotion(x, z, 451);
    assert.ok(Math.abs(1 - m.xx - (1 + (dx.x - d0.x) / h)) < 2e-3);
    assert.ok(Math.abs(-m.xz - (dz.x - d0.x) / h) < 2e-3);
    assert.ok(Math.abs(1 - m.zz - (1 + (dz.z - d0.z) / h)) < 2e-3);
  }
  assert.ok(PINCH.swell + PINCH.medium + PINCH.chop < 1.5);
  // No motion at the beaches: the surface is the exact analytic one there.
  const island = SHORE_ISLANDS[0];
  const near = waveDisplacement(island.x + island.radius, island.z, 451);
  assert.ok(Math.hypot(near.x, near.z) < 1e-9, "no motion at the coast");
  assert.equal(
    horizontalFade(island.x, island.z + island.radius * 0.92 + 70),
    0,
  );
  assert.equal(horizontalFade(9000, 9000), 1);
  // It moves points, and the shader twin exists in the vertex shader and in the shaders that
  // read the surface under the water, built from the same table.
  let moved = 0;
  for (let i = 0; i < 400; i++) {
    const d = waveDisplacement(i * 11.1 + 300, i * 7.3 + 300, 451);
    moved = Math.max(moved, Math.hypot(d.x, d.z));
  }
  assert.ok(moved > 3, `moves ${moved} m`);
  const glsl = glslWaveDisplace();
  assert.match(glsl, /vec2 waveMotion\(vec2 p, float t, out vec3 squeeze\)/);
  assert.match(glsl, /float seaHeight\(vec2 p, float t\)/);
  const leaning = WAVES.filter((w) => w.lean > 0).length;
  assert.equal(
    (glsl.match(/cos\(/g) ?? []).length,
    WAVES.length + leaning,
    "a cos per wave, one more for a leaning wave",
  );
  assert.equal(
    (glsl.match(/for \(int i = 0; i < 4; i\+\+\)/g) ?? []).length,
    1,
    "the shader solves with the same number of steps as REST_STEPS",
  );
  assert.match(
    glslHorizontalFade(),
    /float horizontalFadeGrad\(vec2 p, out vec2 grad\)/,
  );
  assert.match(glslHorizontalFade(), /\/ 100\.000000/);
  assert.equal(HORIZONTAL_FADE.from, 70);
  const read = (file) =>
    readFileSync(new URL(`../src/ocean/${file}`, import.meta.url), "utf8");
  const water = read("water.ts");
  const [vertex, fragment] = water
    .split('ShadersStore["seaFragmentShader"]')
    .map((part, i) => (i === 0 ? part.slice(part.indexOf("seaVertex")) : part));
  assert.match(vertex, /waveDisplace\(p\.xz, time\)/);
  assert.doesNotMatch(fragment, /waveDisplace\(/);
  for (const file of ["clear-water.ts", "underwater.ts"]) {
    const text = read(file);
    assert.match(text, /glslWaveDisplace\(\)/, file);
    assert.match(text, /seaHeight\(vWorld\.xz, time\)/, file);
  }
});
