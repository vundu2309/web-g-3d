import { test } from "node:test";
import assert from "node:assert/strict";
import { CUES, cueVoices, cueLength } from "../src/ocean/audio-cues.ts";

const names = Object.keys(CUES);

test("every cue has voices that are valid and short", () => {
  assert.ok(names.length >= 12);
  for (const name of names) {
    const voices = CUES[name];
    assert.ok(voices.length >= 1, name);
    for (const v of voices) {
      assert.ok(v.dur > 0.02 && v.at >= 0 && v.gain > 0 && v.gain <= 1, name);
      if (v.kind === "tone") assert.ok(v.from > 20 && v.to > 20, name);
      else assert.ok(v.cutoff > 20 && v.cutoffTo > 20, name);
    }
    assert.ok(cueLength(name) <= 0.6, `${name} lasts ${cueLength(name)} s`);
  }
});

test("volume scales a cue and off or zero silences it", () => {
  const full = cueVoices("bite", 1);
  const half = cueVoices("bite", 0.5);
  assert.equal(full.length, CUES.bite.length);
  assert.ok(half[0].gain < full[0].gain);
  assert.deepEqual(cueVoices("bite", 0), []);
  assert.deepEqual(cueVoices("bite", 1, false), []);
  assert.deepEqual(cueVoices("nope", 1), []);
  assert.ok(cueVoices("bite", NaN).length === 0);
});

test("the bite is two notes and the sale is brighter than the error", () => {
  const bite = CUES.bite;
  assert.equal(bite.length, 2);
  assert.ok(bite[1].at > bite[0].at && bite[1].from > bite[0].from);
  assert.ok(CUES.coin[0].from > CUES.error[0].from * 4);
});

test("the interface cues are short and distinct, and a buy is the richest of them", () => {
  for (const name of ["tap", "open", "close", "buy", "gull"])
    assert.ok(CUES[name], name);
  // Opening rises and closing falls.
  assert.ok(CUES.open[0].to > CUES.open[0].from);
  assert.ok(CUES.close[0].to < CUES.close[0].from);
  assert.ok(CUES.tap[0].dur < 0.1, "a tap is a tick");
  assert.ok(CUES.buy.length > CUES.coin.length, "more notes than a sale");
  // The gull cries twice, each falling.
  assert.equal(CUES.gull.length, 2);
  for (const v of CUES.gull) assert.ok(v.to < v.from);
});
