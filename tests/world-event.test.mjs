import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES, rollFish, zoneAt } from "../src/ocean/fishing.ts";
import { conditionsAt } from "../src/ocean/fishing-conditions.ts";
import { HOUR_MS } from "../src/ocean/game-clock.ts";
import { isOpenWater } from "../src/ocean/hot-spots.ts";
import {
  EVENT_RADIUS,
  EVENT_WINDOW_MS,
  FALLBACK_SPOTS,
  GIANT_QUOTA,
  eventAt,
  giantWeights,
  giantsLeft,
  inRing,
  quotaKey,
} from "../src/ocean/world-event.ts";
import { HARBOR } from "../src/ocean/model.ts";
import { coastDistance } from "../src/ocean/shore.ts";

const NOW = 1_795_000_000_000;
const HOUR0 = Math.floor(NOW / HOUR_MS) * HOUR_MS;

// A well-mixed generator (a plain LCG gives nearly the same first draw for neighbouring seeds).
function counted(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the event is on for the first 20 minutes of every hour, the same for everyone", () => {
  assert.equal(eventAt(HOUR0).active, true);
  assert.equal(eventAt(HOUR0 + EVENT_WINDOW_MS - 1).active, true);
  assert.equal(eventAt(HOUR0 + EVENT_WINDOW_MS).active, false);
  assert.equal(eventAt(HOUR0 + HOUR_MS - 1).active, false);
  assert.equal(eventAt(HOUR0 + HOUR_MS).active, true);
  const a = eventAt(HOUR0 + 5000);
  assert.deepEqual(a, eventAt(HOUR0 + 600_000));
  assert.equal(a.endsAtMs - a.startsAtMs, EVENT_WINDOW_MS);
  assert.equal(a.startsAtMs, HOUR0);
  assert.equal(eventAt(HOUR0 + HOUR_MS).slot, a.slot + 1);
  assert.notDeepEqual(
    [a.x, a.z],
    [eventAt(HOUR0 + HOUR_MS).x, eventAt(HOUR0 + HOUR_MS).z],
  );
});

test("over many hours the ring is always open water, off every coast, a fair way from the harbour", () => {
  const places = new Set();
  for (let slot = 0; slot < 10_000; slot++) {
    const ev = eventAt((Math.floor(NOW / HOUR_MS) + slot) * HOUR_MS);
    assert.ok(Number.isFinite(ev.x) && Number.isFinite(ev.z));
    assert.ok(
      isOpenWater(ev.x, ev.z),
      `slot ${slot}: ${ev.x},${ev.z} is not open water`,
    );
    assert.notEqual(zoneAt(ev.x, ev.z), "shore");
    assert.ok(
      coastDistance(ev.x, ev.z) >= 60 - 1,
      `a coast is near ${ev.x},${ev.z}`,
    );
    const far = Math.hypot(ev.x - HARBOR.x, ev.z - HARBOR.z);
    assert.ok(far > 240 && far < 1100, `${far} m from the harbour`);
    places.add(`${ev.x},${ev.z}`);
  }
  assert.ok(places.size > 5000, "the rings are in many places");
});

test("the fallback places are all good ones", () => {
  assert.equal(FALLBACK_SPOTS.length, 8);
  for (const p of FALLBACK_SPOTS) {
    assert.ok(isOpenWater(p.x, p.z), `${p.x},${p.z}`);
    assert.notEqual(zoneAt(p.x, p.z), "shore");
    assert.ok(coastDistance(p.x, p.z) >= 60, `a coast is near ${p.x},${p.z}`);
  }
});

test("a lure is in the ring inside its radius only", () => {
  const ev = eventAt(HOUR0);
  assert.equal(inRing(ev, ev.x, ev.z), true);
  assert.equal(inRing(ev, ev.x + EVENT_RADIUS, ev.z), true);
  assert.equal(inRing(ev, ev.x + EVENT_RADIUS + 1, ev.z), false);
});

test("only a lobster, a dolphin or a shark can be a giant", () => {
  const weights = giantWeights();
  const allowed = SPECIES.filter((s) => weights[s.id] > 0)
    .map((s) => s.id)
    .sort();
  assert.deepEqual(allowed, ["ca-heo", "ca-map", "tom-hum"]);
  for (const id of allowed)
    assert.ok(SPECIES.find((s) => s.id === id).rarity >= 2);
});

test("in the ring a lure fishes for giants: the species and the weight come from the top of the range", () => {
  const ev = eventAt(HOUR0 + 1000);
  const t = HOUR0 + 1000;
  const c = conditionsAt(t, ev.x, ev.z, GIANT_QUOTA);
  assert.equal(c.giant, true);
  assert.equal(c.tag, "event");
  assert.ok(c.biteChance >= 0.9 && c.waitScale <= 0.9);
  const zone = zoneAt(ev.x, ev.z);
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const fish = rollFish(zone, counted(seed), false, undefined, c);
    assert.equal(fish.giant, true);
    const species = SPECIES.find((s) => s.id === fish.species);
    assert.ok(
      ["tom-hum", "ca-heo", "ca-map"].includes(fish.species),
      fish.species,
    );
    const [lo, hi] = species.kg;
    assert.ok(
      fish.kg >= lo + (hi - lo) * 0.88 - 0.06 && fish.kg <= hi + 1e-9,
      `${fish.species} ${fish.kg}`,
    );
    seen.add(fish.species);
  }
  assert.equal(seen.size, 3, "all three can come");
  // A giant is marked on the catch; an ordinary fish is not.
  assert.equal(rollFish("open", counted(1)).giant, undefined);
});

test("outside the ring, after the window, or with no giants left, nothing of the event applies", () => {
  const ev = eventAt(HOUR0 + 1000);
  const inside = HOUR0 + 1000;
  const far = conditionsAt(inside, ev.x + 500, ev.z, GIANT_QUOTA);
  assert.notEqual(far.giant, true);
  assert.notEqual(far.tag, "event");
  const over = HOUR0 + EVENT_WINDOW_MS + 1000;
  const same = eventAt(over);
  assert.equal(same.active, false);
  assert.notEqual(conditionsAt(over, same.x, same.z, GIANT_QUOTA).giant, true);
  const spent = conditionsAt(inside, ev.x, ev.z, 0);
  assert.notEqual(spent.giant, true);
  assert.equal(spent.tag, "event-spent");
  // Not given: every giant is allowed (the book and tests ask without a count).
  assert.equal(conditionsAt(inside, ev.x, ev.z).giant, true);
});

test("a device's giant count: bad or absent records count as none landed, and it never goes below 0", () => {
  assert.equal(giantsLeft(null), GIANT_QUOTA);
  assert.equal(giantsLeft(undefined), GIANT_QUOTA);
  assert.equal(giantsLeft("0"), GIANT_QUOTA);
  assert.equal(giantsLeft("2"), GIANT_QUOTA - 2);
  assert.equal(giantsLeft("3"), 0);
  assert.equal(giantsLeft("99"), 0);
  assert.equal(giantsLeft("abc"), GIANT_QUOTA);
  assert.equal(giantsLeft("-4"), GIANT_QUOTA);
  assert.equal(quotaKey(123), "seaplanes.event.123");
  assert.equal(GIANT_QUOTA, 3);
});

test("the page's words: time left, how far and which way (north is up the map)", async () => {
  const { eventText } = await import("../src/ocean/world-event.ts");
  const { compassWord } = await import("../src/ocean/hot-spots.ts");
  assert.equal(compassWord(0, -10), "bắc");
  assert.equal(compassWord(10, 0), "đông");
  assert.equal(compassWord(0, 10), "nam");
  assert.equal(compassWord(-10, 0), "tây");
  assert.equal(compassWord(10, -10), "đông bắc");
  assert.equal(compassWord(-10, 10), "tây nam");
  const ev = eventAt(HOUR0);
  const on = eventText(ev, HOUR0 + 6 * 60_000, { x: ev.x, z: ev.z + 100 });
  assert.match(on.title, /^Cá khổng lồ đang xuất hiện · còn 14 phút$/);
  assert.equal(on.where, "Vòng sáng cách bạn 100 m, về phía bắc.");
  const off = eventText(eventAt(HOUR0 + 30 * 60_000), HOUR0 + 30 * 60_000, {
    x: 0,
    z: 0,
  });
  assert.match(off.title, /^Sự kiện tiếp theo còn 30 phút$/);
  assert.match(off.where, /chỗ mới/);
});
