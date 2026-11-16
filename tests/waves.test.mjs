// The layered, breathing sea (src/ocean/waves.ts): tiers, leaning crests that never fold, a
// bounded slow sea state, and the same function in the shader.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CALM_GAIN,
  CALM_WAVE_HEIGHT,
  MAX_WAVE_HEIGHT,
  SEA_STATE,
  WAVES,
  glslWaveHeight,
  leanPhase,
  seaState,
  tierGain,
  waveGradient,
  waveHeight,
} from "../src/ocean/waves.ts";

const rms = (xs) => Math.sqrt(xs.reduce((s, v) => s + v * v, 0) / xs.length);

test("the sea has three readable tiers: a tall long swell, a medium tier and a small chop", () => {
  const tier = (name) => WAVES.filter((w) => w.tier === name);
  const [swell, medium, chop] = ["swell", "medium", "chop"].map(tier);
  assert.ok(swell.length >= 3 && medium.length >= 3 && chop.length >= 3);
  assert.ok(Math.min(...swell.map((w) => w.length)) >= 50, "swell is long");
  assert.ok(
    Math.max(...medium.map((w) => w.length)) <
      Math.min(...swell.map((w) => w.length)) &&
      Math.min(...medium.map((w) => w.length)) >=
        Math.max(...chop.map((w) => w.length)),
    "the tiers do not overlap in wavelength",
  );
  const sum = (ws) => ws.reduce((s, w) => s + w.amplitude, 0);
  assert.ok(sum(swell) > sum(medium) && sum(medium) > 3 * sum(chop));
});

test("crests lean without ever folding: the bent phase is strictly increasing and the slope stays modest", () => {
  for (const w of WAVES) {
    assert.ok(w.lean >= 0 && w.lean < 0.6, `lean ${w.lean}`);
    let last = -Infinity;
    for (let i = 0; i <= 2000; i++) {
      const bent = leanPhase((i / 2000) * Math.PI * 8, w.lean);
      assert.ok(bent > last, "never turns back on itself");
      last = bent;
    }
  }
  // A lean wave's travel-side face is steeper than its back: compare the steepest rise and
  // the steepest fall of the wave profile along its travel direction.
  const lean = WAVES.find((w) => w.lean >= 0.3 && w.tier === "swell");
  const profile = (th) => {
    const u = 0.5 + 0.5 * Math.sin(leanPhase(th, lean.lean));
    return Math.pow(u, lean.sharp);
  };
  let steepestRise = 0;
  let steepestFall = 0;
  const e = 1e-4;
  for (let i = 0; i < 4000; i++) {
    const th = (i / 4000) * Math.PI * 2;
    const d = (profile(th + e) - profile(th - e)) / (2 * e);
    steepestRise = Math.max(steepestRise, d);
    steepestFall = Math.max(steepestFall, -d);
  }
  assert.ok(
    steepestFall > steepestRise * 1.1,
    `front face ${steepestFall.toFixed(3)} vs back ${steepestRise.toFixed(3)}`,
  );
  // At the roughest sea no point of the surface is steeper than about 35 degrees.
  let worst = 0;
  const t = 150;
  for (let i = 0; i < 3000; i++) {
    const g = waveGradient((i * 17.3) % 1500, (i * 9.1) % 1500, t);
    worst = Math.max(worst, Math.hypot(g.x, g.z));
  }
  assert.ok(Math.atan(worst) < (35 * Math.PI) / 180, `steepest ${worst}`);
});

test("the sea state is a slow bounded cycle between calm and rough", () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t < 3000; t += 0.5) {
    const s = seaState(t);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
    assert.ok(s >= 0 && s <= 1);
  }
  assert.ok(lo < 0.1 && hi > 0.9, `reaches ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  // Slow: it never changes faster than a few percent per second.
  for (let t = 0; t < 1000; t += 1)
    assert.ok(Math.abs(seaState(t + 1) - seaState(t)) < 0.03);
  assert.ok(SEA_STATE.slow.period >= 120 && SEA_STATE.fast.period >= 60);
  assert.ok(seaState(0) > 0.15 && seaState(0) < 0.5, "starts as a fishing sea");
  // The tiers follow it: the swell swings most.
  assert.equal(tierGain("swell", 1), 1);
  assert.equal(tierGain("chop", 0), CALM_GAIN.chop);
  assert.ok(CALM_GAIN.swell < CALM_GAIN.chop);
});

test("the calmest sea is no taller than the sea before the layering, the roughest is clearly taller", () => {
  assert.ok(CALM_WAVE_HEIGHT <= 1.4, `${CALM_WAVE_HEIGHT}`);
  assert.ok(MAX_WAVE_HEIGHT >= 1.6 * CALM_WAVE_HEIGHT);
  // Find a calm and a rough moment, and compare the spread of the real heights.
  let calm = 0;
  let rough = 0;
  for (let t = 0; t < 400; t += 1) {
    if (seaState(t) < seaState(calm)) calm = t;
    if (seaState(t) > seaState(rough)) rough = t;
  }
  const spread = (t) => {
    const hs = [];
    for (let i = 0; i < 2500; i++)
      hs.push(waveHeight((i * 7.31) % 1200, (i * 3.77) % 1200, t));
    return rms(hs);
  };
  assert.ok(spread(rough) > spread(calm) * 1.4);
  for (let i = 0; i < 400; i++)
    assert.ok(
      Math.abs(waveHeight(i * 5.3, i * 2.9, i * 1.7)) <= MAX_WAVE_HEIGHT,
    );
});

test("the slope is exact with leaning waves and the sea state in it", () => {
  const e = 1e-4;
  for (let i = 0; i < 80; i++) {
    const x = i * 11.3;
    const z = i * 4.1;
    const t = i * 7.7;
    const g = waveGradient(x, z, t);
    const gx = (waveHeight(x + e, z, t) - waveHeight(x - e, z, t)) / (2 * e);
    const gz = (waveHeight(x, z + e, t) - waveHeight(x, z - e, t)) / (2 * e);
    assert.ok(
      Math.abs(g.x - gx) < 1e-4 && Math.abs(g.z - gz) < 1e-4,
      `slope at ${i}`,
    );
  }
});

test("the shader's sea is built from the same table and the same sea state", () => {
  const glsl = glslWaveHeight();
  assert.match(glsl, /float seaState\(float t\)/);
  assert.match(glsl, /vec3 tierGains\(float t\)/);
  assert.match(glsl, /return dot\(acc, tierGains\(t\)\)/);
  // Every wave of the table appears, with its own wave number, in height and slope.
  for (const w of WAVES) {
    const k = ((Math.PI * 2) / w.length).toFixed(6);
    assert.equal(glsl.split(`${k} * (`).length - 1, 2, `wave ${w.length}`);
  }
  // The sea-state constants are the CPU's.
  assert.ok(glsl.includes(SEA_STATE.slow.weight.toFixed(6)));
  assert.ok(glsl.includes(((Math.PI * 2) / SEA_STATE.fast.period).toFixed(6)));
  for (const tier of ["swell", "medium", "chop"])
    assert.ok(
      glsl.includes(
        `${CALM_GAIN[tier].toFixed(6)} + ${(1 - CALM_GAIN[tier]).toFixed(6)} * s`,
      ),
    );
  // Leaning waves bend the phase in both functions.
  for (const w of WAVES.filter((w) => w.lean > 0))
    assert.ok(glsl.includes(`th - ${w.lean.toFixed(6)} * sin(th)`));
});
