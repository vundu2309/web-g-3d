import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GANGWAY_LANDING,
  GANGWAY_REACH,
  MARKETS,
  MARKET_BODY_RADIUS,
  MARKET_RANGE,
  inSea,
  marketAt,
  seaObstacles,
} from "../src/ocean/market.ts";
import { BUOYS } from "../src/ocean/sea-layout.ts";
import { CAT_IDS } from "../src/ocean/cat-pose.ts";
import { coastDistance, shoreShape } from "../src/ocean/shore.ts";
import { HARBOR, islandCollisionRadius, islands } from "../src/ocean/model.ts";

test("every island has a market, named and inside the sea", () => {
  assert.equal(MARKETS.length, islands.length);
  assert.equal(new Set(MARKETS.map((m) => m.id)).size, MARKETS.length);
  for (const market of MARKETS) {
    assert.ok(market.name.startsWith("Chợ "), market.name);
    assert.ok(inSea(market), `${market.id} is in the sea`);
  }
});

test("a pier stands in the shallows with its gangway on the sand, clear of every island's ring", () => {
  MARKETS.forEach((market, index) => {
    const island = islands[index];
    const from = Math.hypot(market.x - island.x, market.z - island.z);
    const ring = islandCollisionRadius(island);
    // Its solid circle never reaches into the ring boats collide with.
    assert.ok(
      from >= ring + MARKET_BODY_RADIUS,
      `${market.id} clear of the ring`,
    );
    // The gangway points at the island and its end rests on the beach of the real coast, up
    // the long gentle sand to where the beach has risen to the planks (the walkway is 0.8 m
    // above the sea, its planks 0.69 to 0.83 m), while the deck stands in the water.
    const ux = (island.x - market.x) / from;
    const uz = (island.z - market.z) / from;
    const ex = market.x + ux * GANGWAY_REACH;
    const ez = market.z + uz * GANGWAY_REACH;
    const end = coastDistance(ex, ez);
    assert.ok(
      end < -GANGWAY_LANDING + 0.8 && end > -GANGWAY_LANDING - 0.8,
      `${market.id} gangway lands ${GANGWAY_LANDING} m up the sand: ${end}`,
    );
    const ground = shoreShape(index).height(ex - island.x, ez - island.z);
    assert.ok(
      ground > 0.55 && ground < 0.83,
      `${market.id} gangway rests on the sand, not above it or through it: ${ground}`,
    );
    const deck = coastDistance(market.x + ux * 2.7, market.z + uz * 2.7);
    assert.ok(deck > 5, `${market.id} deck stands in the water: ${deck}`);
    // In the shallows next to the beach, a few metres closer than the old ring + 9 m.
    assert.ok(from < ring + 9 - 2, `${market.id} close to its beach`);
    for (const other of islands)
      assert.ok(
        Math.hypot(market.x - other.x, market.z - other.z) >
          islandCollisionRadius(other) + MARKET_BODY_RADIUS,
        `${market.id} is not on an island`,
      );
  });
});

test("piers are not on the harbor or on top of a channel buoy or each other", () => {
  for (const market of MARKETS) {
    assert.ok(
      Math.hypot(market.x - HARBOR.x, market.z - HARBOR.z) > 30,
      `${market.id} away from the harbor`,
    );
    for (const buoy of BUOYS)
      assert.ok(
        Math.hypot(market.x - buoy.x, market.z - buoy.z) > 8,
        `${market.id} clear of a buoy`,
      );
  }
  for (const a of MARKETS)
    for (const b of MARKETS)
      if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 40);
});

test("a boat in range opens the nearest market; out of range opens none", () => {
  for (const market of MARKETS) {
    assert.equal(marketAt(market.x, market.z)?.id, market.id);
    assert.equal(
      marketAt(market.x + MARKET_RANGE - 0.5, market.z)?.id,
      market.id,
    );
    assert.equal(marketAt(market.x + MARKET_RANGE + 0.5, market.z), undefined);
  }
  assert.equal(
    marketAt(HARBOR.x, HARBOR.z),
    undefined,
    "the harbor has no market",
  );
});

test("the piers are solid for the boats, like the islands", () => {
  const obstacles = seaObstacles();
  assert.equal(obstacles.length, islands.length + MARKETS.length);
  for (const market of MARKETS) {
    const hit = obstacles.find((o) => o.x === market.x && o.z === market.z);
    assert.equal(hit?.radius, MARKET_BODY_RADIUS);
  }
});

test("every market has its own vendor with a name, a greeting and a look", () => {
  const names = new Set();
  for (const market of MARKETS) {
    const { vendor } = market;
    assert.ok(vendor.name.length > 1 && vendor.greeting.length > 10, market.id);
    assert.ok(
      CAT_IDS.includes(vendor.look),
      `${market.id}: look ${vendor.look}`,
    );
    names.add(vendor.name);
  }
  assert.equal(names.size, MARKETS.length, "vendors are different people");
  const looks = new Set(MARKETS.map((m) => m.vendor.look));
  assert.equal(looks.size, MARKETS.length, "and look different");
});
