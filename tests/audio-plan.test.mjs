import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANE_RANGE,
  SURF_RANGE,
  nearShore,
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
    music: true,
  });
  // The music switch is saved, and an old save without it keeps the music on.
  assert.equal(parseAudioSettings('{"music":false}').music, false);
  assert.equal(parseAudioSettings('{"enabled":true,"volume":0.5}').music, true);
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

test("the hull rushes only at speed, and louder the faster it goes", () => {
  assert.equal(soundPlan(calm).hull, 0, "silent at rest");
  assert.equal(soundPlan({ ...calm, speed: 1 }).hull, 0, "silent at a crawl");
  const cruise = soundPlan({ ...calm, speed: 9 });
  const top = soundPlan({ ...calm, speed: 18 });
  assert.ok(cruise.hull > 0 && top.hull > cruise.hull);
  assert.ok(top.hullCutoff > cruise.hullCutoff, "and brighter");
});

test("the surf is heard only near a beach and grows as the boat comes closer", () => {
  assert.equal(soundPlan(calm).surf, 0, "no beach known");
  assert.equal(soundPlan({ ...calm, shore: SURF_RANGE.far + 1 }).surf, 0);
  const far = soundPlan({ ...calm, shore: 120 });
  const near = soundPlan({ ...calm, shore: 40 });
  const sand = soundPlan({ ...calm, shore: 0 });
  assert.ok(far.surf > 0 && near.surf > far.surf && sand.surf >= near.surf);
  assert.ok(near.surfCutoff > far.surfCutoff, "brighter close to the break");
  assert.equal(nearShore(Infinity), 0);
  assert.equal(nearShore(undefined), 0);
  assert.equal(nearShore(0), 1);
  // Rough weather breaks louder.
  assert.ok(soundPlan({ ...calm, shore: 40, gloom: 1 }).surf > near.surf);
});

test("a seaplane's engine fades in with its approach and is silent without one", () => {
  assert.equal(soundPlan(calm).plane, 0);
  assert.equal(soundPlan({ ...calm, plane: Infinity }).plane, 0);
  assert.equal(soundPlan({ ...calm, plane: PLANE_RANGE.far + 1 }).plane, 0);
  const far = soundPlan({ ...calm, plane: 200 }).plane;
  const near = soundPlan({ ...calm, plane: 30 }).plane;
  assert.ok(far > 0 && near > far);
  for (const bad of [NaN, -50])
    assert.ok(Number.isFinite(soundPlan({ ...calm, plane: bad }).plane));
});

test("every new layer is silent with sound off, and the new numbers are always finite", () => {
  const off = soundPlan({
    ...calm,
    enabled: false,
    speed: 18,
    shore: 0,
    plane: 0,
  });
  for (const key of ["hull", "surf", "plane"]) assert.equal(off[key], 0, key);
  const odd = soundPlan({ ...calm, speed: 9, shore: NaN, plane: NaN });
  for (const v of Object.values(odd)) assert.ok(Number.isFinite(v));
});
