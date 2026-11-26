import assert from "node:assert/strict";
import test from "node:test";
import { atmosphereAt } from "../src/ocean/atmosphere.ts";
import {
  BANDS,
  BITE_MAX,
  EASY_FROM,
  NIGHT_BELOW,
  SKIES,
  TWILIGHT_BELOW,
  WAIT_RANGE,
  WEIGHT_RANGE,
  bandOf,
  conditionsAt,
  conditionsOfSea,
  habitatOf,
  seaAt,
} from "../src/ocean/fishing-conditions.ts";
import {
  GIANT_FROM,
  SPECIES,
  planRound,
  rollFish,
} from "../src/ocean/fishing.ts";
import { HOT_BOOST, HOT_SLOT_MS, hotSpotsAt } from "../src/ocean/hot-spots.ts";

const NOW = 1_795_000_000_000;
const MIN = 60_000;

/** A seeded generator that counts its draws. */
function counted(seed) {
  let s = seed >>> 0;
  const rng = () => {
    rng.draws++;
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  rng.draws = 0;
  return rng;
}

test("without conditions, or with empty ones, nothing changes: the same fish and the same draws", () => {
  for (const zone of ["shore", "open", "deep"])
    for (let seed = 1; seed <= 40; seed++) {
      const a = counted(seed);
      const b = counted(seed);
      const c = counted(seed);
      const plain = rollFish(zone, a, seed % 2 === 0);
      const empty = rollFish(zone, b, seed % 2 === 0, undefined, {});
      const none = rollFish(zone, c, seed % 2 === 0, undefined, {
        weights: {},
      });
      assert.deepEqual(empty, plain);
      assert.deepEqual(none, plain);
      assert.equal(b.draws, a.draws);
      assert.equal(c.draws, a.draws);
    }
  for (let seed = 1; seed <= 40; seed++) {
    const a = counted(seed);
    const b = counted(seed);
    assert.deepEqual(
      planRound(100, seed % 2 === 0, b, {}),
      planRound(100, seed % 2 === 0, a),
    );
    assert.equal(b.draws, a.draws);
    // New numbers draw the same, except that the bite roll may come out the other way (a fish that
    // bites draws once more for when).
    const c = counted(seed);
    const d = counted(seed);
    planRound(100, false, c, { biteChance: 0.95, waitScale: 1.2 });
    planRound(100, false, d);
    assert.ok(Math.abs(c.draws - d.draws) <= 1);
  }
});

test("species weights, the bite chance and the wait act on the roll", () => {
  const tally = (conditions) => {
    const rng = counted(99);
    const counts = {};
    for (let i = 0; i < 4000; i++) {
      const fish = rollFish("deep", rng, false, undefined, conditions);
      counts[fish.species] = (counts[fish.species] ?? 0) + 1;
    }
    return counts;
  };
  const base = tally(undefined);
  const boosted = tally({ weights: { "ca-map": 4 } });
  const gone = tally({ weights: { "ca-map": 0 } });
  assert.ok(boosted["ca-map"] > base["ca-map"] * 1.5);
  assert.equal(gone["ca-map"] ?? 0, 0);
  // Bite chance: 1 always bites, 0 never.
  for (let i = 0; i < 200; i++) {
    assert.notEqual(
      planRound(0, false, counted(i + 1), { biteChance: 1 }).biteAt,
      undefined,
    );
    assert.equal(
      planRound(0, false, counted(i + 1), { biteChance: 0 }).biteAt,
      undefined,
    );
  }
  // The wait scales the time to the first nibble.
  for (let i = 1; i < 50; i++) {
    const base = planRound(1000, false, counted(i)).nibbles[0] - 1000;
    const slow =
      planRound(1000, false, counted(i), { waitScale: 1.2 }).nibbles[0] - 1000;
    assert.ok(Math.abs(slow - base * 1.2) < 1e-6);
  }
});

test("a giant is rolled from the top of its species' range, with the same number of draws", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const a = counted(seed);
    const b = counted(seed);
    const normal = rollFish("deep", a, false);
    const giant = rollFish("deep", b, false, undefined, { giant: true });
    assert.equal(a.draws, b.draws);
    assert.equal(giant.species, normal.species, "the species is the same roll");
    const [lo, hi] = SPECIES.find((s) => s.id === giant.species).kg;
    assert.ok(
      giant.kg >= lo + (hi - lo) * GIANT_FROM - 0.06,
      `${giant.species} ${giant.kg} kg`,
    );
    assert.ok(giant.kg <= hi + 1e-9);
  }
});

test("the time bands and the tables name real species and stay inside their ranges", () => {
  assert.equal(bandOf(0), "night");
  assert.equal(bandOf(NIGHT_BELOW - 0.001), "night");
  assert.equal(bandOf(NIGHT_BELOW), "twilight");
  assert.equal(bandOf(TWILIGHT_BELOW - 0.001), "twilight");
  assert.equal(bandOf(TWILIGHT_BELOW), "day");
  assert.equal(bandOf(1), "day");
  const ids = new Set(SPECIES.map((s) => s.id));
  for (const layer of [...Object.values(BANDS), ...Object.values(SKIES)])
    for (const id of Object.keys(layer.weights ?? {}))
      assert.ok(ids.has(id), `${id} is not a species`);
});

test("at any time the sea's numbers are inside their bounds, the same for everyone, and 'easy' is sorted", () => {
  const seen = {
    night: 0,
    twilight: 0,
    day: 0,
    clear: 0,
    overcast: 0,
    rain: 0,
    fog: 0,
  };
  // (A game day is 24 minutes and twilight a minute or two of it, so look every 20 seconds.)
  for (let t = NOW; t < NOW + 24 * 60 * MIN; t += 20_000) {
    const sea = seaAt(t);
    assert.deepEqual(sea, seaAt(t));
    seen[sea.band]++;
    seen[sea.weather]++;
    for (const [id, w] of Object.entries(sea.weights)) {
      assert.ok(SPECIES.some((s) => s.id === id));
      assert.ok(
        w >= WEIGHT_RANGE[0] - 1e-9 && w <= WEIGHT_RANGE[1] + 1e-9,
        `${id} ${w}`,
      );
    }
    assert.ok(sea.biteChance >= 0.8 && sea.biteChance <= BITE_MAX + 1e-9);
    assert.ok(
      sea.waitScale >= WAIT_RANGE[0] - 1e-9 &&
        sea.waitScale <= WAIT_RANGE[1] + 1e-9,
    );
    for (let i = 1; i < sea.easy.length; i++)
      assert.ok(sea.weights[sea.easy[i - 1]] >= sea.weights[sea.easy[i]]);
    for (const id of sea.easy) assert.ok(sea.weights[id] >= EASY_FROM);
    // It reads the same clock as the look: the band is the one the daylight says.
    assert.equal(sea.band, bandOf(atmosphereAt(t).daylight));
  }
  for (const [k, n] of Object.entries(seen))
    assert.ok(n > 0, `${k} never happens in a day`);
});

test("night favours the lobster and the shark; rain, the crab; a clear day, the dolphin", () => {
  let night, rain, day;
  for (
    let t = NOW;
    t < NOW + 6 * 24 * 60 * MIN && !(night && rain && day);
    t += MIN
  ) {
    const sea = seaAt(t);
    if (!night && sea.band === "night" && sea.weather === "clear") night = sea;
    if (!rain && sea.band === "day" && sea.weather === "rain") rain = sea;
    if (!day && sea.band === "day" && sea.weather === "clear") day = sea;
  }
  assert.ok(
    night.weights["tom-hum"] >= 1.6 - 1e-9 &&
      night.weights["ca-map"] >= 1.4 - 1e-9,
  );
  assert.ok(night.weights["ca-heo"] < 1);
  assert.ok(rain.weights["cua-bien"] >= 1.4 - 1e-9 && rain.biteChance >= 0.9);
  assert.ok(day.weights["ca-heo"] >= 1.4 - 1e-9);
  assert.equal(day.biteChance, 0.8);
  assert.ok(night.easy.includes("tom-hum"));
});

test("the conditions at a place add a hot spot's boost on top, after the limit", () => {
  let checked = 0;
  for (let slot = 0; slot < 40; slot++) {
    const t = NOW + slot * HOT_SLOT_MS + 1000;
    const sea = seaAt(t);
    const away = conditionsAt(t, 0, 0);
    assert.deepEqual(
      away,
      conditionsOfSea(sea),
      "away from a spot it is the sea's",
    );
    for (const spot of hotSpotsAt(t)) {
      const here = conditionsAt(t, spot.x, spot.z);
      const base = sea.weights[spot.species] ?? 1;
      assert.ok(Math.abs(here.weights[spot.species] - base * HOT_BOOST) < 1e-9);
      assert.ok(
        here.weights[spot.species] > WEIGHT_RANGE[1] || base < 1,
        "the boost is after the limit",
      );
      assert.ok(
        here.waitScale <= sea.waitScale + 1e-9 &&
          here.waitScale >= WAIT_RANGE[0] - 1e-9,
      );
      for (const [id, w] of Object.entries(sea.weights))
        if (id !== spot.species) assert.equal(here.weights[id], w);
      checked++;
    }
  }
  assert.ok(checked >= 60);
});

test("where a species is found comes from the same tables the odds use", () => {
  const ids = new Set(SPECIES.map((s) => s.id));
  for (const species of SPECIES) {
    const h = habitatOf(species.id);
    assert.ok(h.zones.length >= 1, `${species.id} lives somewhere`);
    for (const zone of h.zones) assert.ok(species.zones[zone] > 0);
    for (let i = 1; i < h.zones.length; i++)
      assert.ok(species.zones[h.zones[i - 1]] >= species.zones[h.zones[i]]);
    for (const band of h.bands)
      assert.ok((BANDS[band].weights?.[species.id] ?? 1) >= EASY_FROM);
    for (const kind of h.weathers)
      assert.ok((SKIES[kind].weights?.[species.id] ?? 1) >= EASY_FROM);
  }
  assert.ok(habitatOf("ca-map").bands.includes("night"));
  assert.ok(habitatOf("ca-map").weathers.includes("fog"));
  assert.ok(habitatOf("cua-bien").weathers.includes("rain"));
  assert.ok(habitatOf("ca-heo").bands.includes("day"));
  assert.deepEqual(habitatOf("ca-madeka").bands, []);
  assert.ok(ids.has("ca-map"));
});
