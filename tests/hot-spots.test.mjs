import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES, zoneAt } from "../src/ocean/fishing.ts";
import { slotOf, slotStart } from "../src/ocean/game-clock.ts";
import {
  HOT_BOOST,
  HOT_RADIUS,
  HOT_SLOT_MS,
  bestZone,
  hotSpotAt,
  hotSpotsAt,
  hotSpotsOfSlot,
  isOpenWater,
  labelOfIsland,
} from "../src/ocean/hot-spots.ts";
import { islands } from "../src/ocean/model.ts";

const NOW = 1_795_000_000_000; // ms, a time that looks like the server's
const SLOT0 = slotOf(NOW, HOT_SLOT_MS);

test("a slot's spots are the same for everyone, every time", () => {
  for (const slot of [SLOT0, SLOT0 + 1, 7, 123456]) {
    assert.deepEqual(hotSpotsOfSlot(slot), hotSpotsOfSlot(slot));
  }
  // Two devices a few seconds apart in one slot see the same spots.
  assert.deepEqual(hotSpotsAt(NOW + 1000), hotSpotsAt(NOW + 1000 + 60_000));
  assert.notDeepEqual(hotSpotsOfSlot(SLOT0), hotSpotsOfSlot(SLOT0 + 1));
  for (const spot of hotSpotsOfSlot(SLOT0))
    assert.equal(spot.endsAtMs, slotStart(SLOT0 + 1, HOT_SLOT_MS));
});

test("over many slots every spot is open water, in the zone its fish lives in, apart from the others", () => {
  let full = 0;
  const species = new Set();
  const islandsSeen = new Set();
  const slots = 3000;
  for (let slot = SLOT0; slot < SLOT0 + slots; slot++) {
    const spots = hotSpotsOfSlot(slot);
    if (spots.length === 3) full++;
    spots.forEach((spot, i) => {
      assert.ok(isOpenWater(spot.x, spot.z), `slot ${slot}: not open water`);
      assert.equal(zoneAt(spot.x, spot.z), spot.zone, `slot ${slot}: zone`);
      assert.equal(spot.zone, bestZone(spot.species));
      const fish = SPECIES.find((s) => s.id === spot.species);
      assert.ok(fish, "a real species");
      assert.ok(fish.zones[spot.zone] > 0, "the species lives in that zone");
      assert.equal(spot.radius, HOT_RADIUS);
      assert.ok(spot.label.length > 3);
      assert.ok(Math.abs(spot.x) < 1496 && Math.abs(spot.z) < 1496);
      for (const other of spots.slice(i + 1))
        assert.ok(Math.hypot(spot.x - other.x, spot.z - other.z) >= 120);
      species.add(spot.species);
      islandsSeen.add(spot.island);
    });
    // One spot for each rarity it could place, in order.
    spots.forEach((spot) =>
      assert.equal(
        SPECIES.find((s) => s.id === spot.species).rarity,
        spot.index + 1,
      ),
    );
  }
  assert.ok(
    full / slots > 0.9,
    `only ${full} of ${slots} slots have three spots`,
  );
  assert.equal(
    species.size,
    SPECIES.length,
    "every species gets a spot sometimes",
  );
  assert.equal(
    islandsSeen.size,
    islands.length,
    "every island gets a spot sometimes",
  );
});

test("no island, species or rarity takes over the spots", () => {
  const byIsland = new Array(islands.length).fill(0);
  const bySpecies = {};
  let total = 0;
  for (let slot = SLOT0; slot < SLOT0 + 4000; slot++)
    for (const spot of hotSpotsOfSlot(slot)) {
      byIsland[spot.island]++;
      bySpecies[spot.species] = (bySpecies[spot.species] ?? 0) + 1;
      total++;
    }
  for (const n of byIsland)
    assert.ok(
      n / total > 0.06 && n / total < 0.22,
      `an island has ${((100 * n) / total).toFixed(0)} %`,
    );
  for (const [id, n] of Object.entries(bySpecies))
    assert.ok(
      n / total > 0.05 && n / total < 0.2,
      `${id} has ${((100 * n) / total).toFixed(0)} %`,
    );
});

test("a lure is in a spot inside its radius only, and the nearest centre wins", () => {
  const [spot] = hotSpotsOfSlot(SLOT0);
  const t = slotStart(SLOT0, HOT_SLOT_MS) + 1000;
  assert.equal(hotSpotAt(t, spot.x, spot.z)?.species, spot.species);
  assert.equal(
    hotSpotAt(t, spot.x + HOT_RADIUS - 0.5, spot.z)?.index,
    spot.index,
  );
  assert.equal(hotSpotAt(t, spot.x + HOT_RADIUS + 5, spot.z), undefined);
  assert.equal(
    hotSpotAt(t, 0, 0),
    undefined,
    "nothing at the middle of the sea",
  );
  assert.ok(HOT_BOOST > 2);
});

test("each zone's best species, and the words that say where a spot is", () => {
  assert.equal(bestZone("ca-map"), "deep");
  assert.equal(bestZone("cua-bien"), "shore");
  assert.equal(bestZone("ca-madeka"), "shore");
  assert.equal(bestZone("sua"), "open");
  assert.equal(bestZone("tom-hum"), "open");
  // Islands with a market are named by it; the others by their direction from the harbour (north is -Z).
  assert.equal(labelOfIsland(0), "quanh Hải Đăng");
  assert.equal(labelOfIsland(1), "quanh Đồi Xanh");
  assert.match(labelOfIsland(3), /^đảo phía (tây|tây bắc|tây nam)$/);
  assert.match(labelOfIsland(7), /^đảo phía (đông|đông bắc|đông nam)$/);
  assert.match(labelOfIsland(5), /^đảo phía (bắc|tây bắc|đông bắc)$/);
  for (let i = 0; i < islands.length; i++)
    assert.ok(labelOfIsland(i).length > 3);
});
