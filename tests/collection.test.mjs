import assert from "node:assert/strict";
import test from "node:test";
import {
  BAND_NAMES,
  WEATHER_NAMES,
  ZONE_NAMES,
  collectionProgress,
  collectionView,
  hotSpotText,
  seaText,
  whereText,
} from "../src/ocean/collection.ts";
import { habitatOf, seaAt } from "../src/ocean/fishing-conditions.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { HOT_SLOT_MS, hotSpotsOfSlot } from "../src/ocean/hot-spots.ts";

const NOW = 1_795_000_000_000;

test("an empty store has found nothing; every species is in the book once, rarest last", () => {
  const view = collectionView({});
  assert.equal(view.length, SPECIES.length);
  assert.deepEqual(collectionProgress(view), {
    found: 0,
    total: SPECIES.length,
  });
  assert.equal(new Set(view.map((e) => e.id)).size, SPECIES.length);
  for (let i = 1; i < view.length; i++)
    assert.ok(view[i - 1].rarity <= view[i].rarity);
  for (const e of view) {
    assert.equal(e.state, "unknown");
    assert.equal(e.bestKg, 0);
    assert.ok(e.where.length > 3);
  }
});

test("a species is found when its record weight is above 0, also when none is held any more", () => {
  const view = collectionView({
    "tom-hum": { n: 2, best: 3.4 },
    "ca-map": { n: 0, best: 61.5 }, // sold, the record stays
    sua: { n: 1, best: 0 }, // a stock with no record weight is not a found species
  });
  const by = Object.fromEntries(view.map((e) => [e.id, e]));
  assert.equal(by["tom-hum"].state, "found");
  assert.equal(by["tom-hum"].bestKg, 3.4);
  assert.equal(by["tom-hum"].held, 2);
  assert.equal(by["ca-map"].state, "found");
  assert.equal(by["ca-map"].held, 0);
  assert.equal(by.sua.state, "unknown");
  assert.equal(by["cua-bien"].state, "unknown");
  assert.deepEqual(collectionProgress(view), {
    found: 2,
    total: SPECIES.length,
  });
});

test("the words for where a species is found are made from its habitat tables", () => {
  assert.equal(
    whereText({ zones: ["shore"], bands: [], weathers: [] }),
    "Gần bờ",
  );
  assert.equal(
    whereText({ zones: ["deep", "open"], bands: ["night"], weathers: ["fog"] }),
    "Biển sâu, biển mở · ban đêm · khi có sương",
  );
  const shark = collectionView({}).find((e) => e.id === "ca-map");
  assert.deepEqual(shark.habitat, habitatOf("ca-map"));
  assert.match(shark.where, /biển sâu/i);
  assert.match(shark.where, /ban đêm/);
  for (const e of collectionView({})) {
    for (const z of e.habitat.zones) assert.ok(ZONE_NAMES[z]);
    for (const b of e.habitat.bands) assert.ok(BAND_NAMES[b]);
    for (const w of e.habitat.weathers) assert.ok(WEATHER_NAMES[w]);
  }
});

test("the line about the sea says the time, the weather, what is easy and how fast they bite", () => {
  let seen = 0;
  for (let t = NOW; t < NOW + 6 * 60 * 60_000 && seen < 400; t += 20_000) {
    const sea = seaAt(t);
    const text = seaText(sea);
    assert.match(
      text.title,
      /^(Ban đêm|Chạng vạng|Ban ngày) · (Trời quang|Trời âm u|Mưa|Sương mù)$/,
    );
    assert.ok(text.easy.length > 5);
    assert.match(text.pace, /^Cá /);
    // What it calls easy is what the odds call easy.
    if (sea.easy.length) assert.ok(text.easy.startsWith("Dễ gặp: "));
    seen++;
  }
  assert.ok(seen > 100);
});

test("a hot spot reads as 'species · place · time left'", () => {
  const slot = Math.floor(NOW / HOT_SLOT_MS);
  const [spot] = hotSpotsOfSlot(slot);
  const text = hotSpotText(spot, spot.endsAtMs - 9 * 60_000);
  assert.match(text, /^.+ · .+ · còn 9 phút$/);
  assert.ok(hotSpotText(spot, spot.endsAtMs + 5000).endsWith("còn 0 phút"));
  assert.ok(
    hotSpotText(spot, spot.endsAtMs - 10 * HOT_SLOT_MS).includes("còn 15 phút"),
  );
});
