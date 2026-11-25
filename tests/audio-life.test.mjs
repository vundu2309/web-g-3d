import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAR_SECONDS,
  gullIn,
  musicBar,
  seeded,
  shoreDistance,
} from "../src/ocean/audio-life.ts";

test("the seeded generator repeats and stays in 0..1", () => {
  const a = seeded(7);
  const b = seeded(7);
  const run = Array.from({ length: 50 }, a);
  assert.deepEqual(run, Array.from({ length: 50 }, b));
  assert.ok(run.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(run, Array.from({ length: 50 }, seeded(8)));
});

test("gulls call only by day and near a beach, more often the closer it is", () => {
  const mid = () => 0.5;
  assert.equal(gullIn(mid, 1, 0), undefined, "none at night");
  assert.equal(gullIn(mid, 1, 0.3), undefined, "none at dusk");
  assert.equal(gullIn(mid, 0, 1), undefined, "none far out");
  assert.equal(gullIn(mid, 0.03, 1), undefined);
  const near = gullIn(mid, 1, 1);
  const edge = gullIn(mid, 0.2, 1);
  assert.ok(near > 3 && near < 20, `near a beach: ${near}`);
  assert.ok(edge > near, "farther out they call less often");
  for (const r of [0, 0.999]) {
    const wait = gullIn(() => r, 0.5, 1);
    assert.ok(wait > 2 && wait < 25, `${wait}`);
  }
});

test("a bar of music is the same every time and stays inside its bar", () => {
  for (const daylight of [1, 0]) {
    assert.deepEqual(musicBar(5, daylight), musicBar(5, daylight));
    for (const bar of [-3, 0, 1, 2, 3, 4, 1000]) {
      const notes = musicBar(bar, daylight);
      assert.ok(notes.length >= 4, "a pad of three and a melody");
      for (const n of notes) {
        assert.ok(
          n.at >= 0 && n.at < BAR_SECONDS,
          `starts in the bar: ${n.at}`,
        );
        assert.ok(
          n.dur > 0 && n.at + n.dur < BAR_SECONDS + 4,
          "and ends soon after",
        );
        assert.ok(n.freq > 40 && n.freq < 2500, `a sane pitch: ${n.freq}`);
        assert.ok(n.gain > 0 && n.gain <= 0.06, "and quiet");
      }
    }
  }
});

test("by day the music is brighter and busier than at night", () => {
  const day = musicBar(2, 1);
  const night = musicBar(2, 0);
  assert.ok(day.length > night.length, "more melody notes by day");
  const root = (notes) => Math.min(...notes.map((n) => n.freq));
  assert.ok(root(night) < root(day), "the night is lower");
  // The chords come round every four bars.
  assert.deepEqual(
    musicBar(2, 1)
      .map((n) => n.freq)
      .slice(0, 3),
    musicBar(6, 1)
      .map((n) => n.freq)
      .slice(0, 3),
  );
  assert.notDeepEqual(
    musicBar(2, 1)
      .map((n) => n.freq)
      .slice(0, 3),
    musicBar(3, 1)
      .map((n) => n.freq)
      .slice(0, 3),
  );
});

test("the distance to a beach counts from the coast, not the middle of the island", () => {
  const islands = [
    { x: 0, z: 0, radius: 100 },
    { x: 1000, z: 0, radius: 200 },
  ];
  assert.equal(shoreDistance(0, 0, islands), 0, "on the island");
  assert.equal(shoreDistance(95, 0, islands), 0, "on the coast");
  assert.ok(Math.abs(shoreDistance(195, 0, islands) - 100) < 1e-9);
  assert.ok(
    Math.abs(shoreDistance(700, 0, islands) - (300 - 190)) < 1e-9,
    "the nearer island",
  );
  assert.equal(shoreDistance(5, 5, []), Number.POSITIVE_INFINITY);
});
