import { test } from "node:test";
import assert from "node:assert/strict";
import {
  soundPlan,
  SILENT,
  parseAudioSettings,
  DEFAULT_AUDIO,
} from "../src/ocean/audio-plan.ts";

const calm = {
  speed: 0,
  rain: 0,
  gloom: 0,
  tension: 0,
  volume: 1,
  enabled: true,
};

test("off or zero volume is silent", () => {
  assert.equal(soundPlan({ ...calm, enabled: false }), SILENT);
  assert.equal(soundPlan({ ...calm, volume: 0 }), SILENT);
});

test("a calm sea still murmurs and the engine idles, with no rain", () => {
  const plan = soundPlan(calm);
  assert.ok(plan.swell > 0 && plan.engine > 0);
  assert.equal(plan.rain, 0);
});

test("speed raises the engine pitch, the swell and its brightness", () => {
  const slow = soundPlan(calm);
  const fast = soundPlan({ ...calm, speed: 18 });
  assert.ok(fast.enginePitch > slow.enginePitch);
  assert.ok(fast.engine > slow.engine && fast.swell > slow.swell);
  assert.ok(fast.swellCutoff > slow.swellCutoff);
  assert.equal(
    soundPlan({ ...calm, speed: -18 }).enginePitch,
    fast.enginePitch,
  );
});

test("rain and gloom make rain and wind louder", () => {
  const storm = soundPlan({ ...calm, rain: 1, gloom: 0.9 });
  assert.ok(storm.rain > 0.03 && storm.wind > soundPlan(calm).wind);
});

test("volume scales every layer and bad numbers cannot blow up", () => {
  const half = soundPlan({ ...calm, volume: 0.5, rain: 1 });
  const full = soundPlan({ ...calm, rain: 1 });
  assert.ok(half.rain < full.rain && half.swell < full.swell);
  const bad = soundPlan({
    speed: NaN,
    rain: Infinity,
    gloom: -3,
    volume: 9,
    enabled: true,
  });
  for (const v of Object.values(bad)) assert.ok(Number.isFinite(v));
  assert.ok(bad.swell <= 1 && bad.rain <= 0.07);
});

test("saved settings are read safely", () => {
  assert.deepEqual(parseAudioSettings(null), DEFAULT_AUDIO);
  assert.deepEqual(parseAudioSettings("not json"), DEFAULT_AUDIO);
  assert.deepEqual(parseAudioSettings('{"enabled":false,"volume":3}'), {
    enabled: false,
    volume: 1,
  });
  assert.deepEqual(
    parseAudioSettings('{"enabled":"x","volume":"y"}'),
    DEFAULT_AUDIO,
  );
});

test("the line hums only when it is really pulling, higher as it nears the snap", () => {
  assert.equal(soundPlan({ ...calm, tension: 0.2 }).line, 0, "slack is silent");
  const mid = soundPlan({ ...calm, tension: 0.6 });
  const taut = soundPlan({ ...calm, tension: 1 });
  assert.ok(mid.line > 0 && taut.line > mid.line);
  assert.ok(taut.linePitch > mid.linePitch);
  assert.equal(soundPlan({ ...calm, tension: 1, enabled: false }).line, 0);
  assert.ok(Number.isFinite(soundPlan({ ...calm, tension: NaN }).line));
});
