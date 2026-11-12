import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKETS,
  MARKET_BODY_RADIUS,
  MARKET_RANGE,
  inSea,
  marketAt,
  seaObstacles,
} from "../src/ocean/market.ts";
import { BUOYS } from "../src/ocean/sea-layout.ts";
import { HARBOR, islandCollisionRadius, islands } from "../src/ocean/model.ts";

test("every island has a market, named and inside the sea", () => {
  assert.equal(MARKETS.length, islands.length);
  assert.equal(new Set(MARKETS.map((m) => m.id)).size, MARKETS.length);
  for (const market of MARKETS) {
    assert.ok(market.name.startsWith("Chợ "), market.name);
    assert.ok(inSea(market), `${market.id} is in the sea`);
  }
});

test("a pier sits in open water just off its island, never inside any island", () => {
  MARKETS.forEach((market, index) => {
    const island = islands[index];
    const from = Math.hypot(market.x - island.x, market.z - island.z);
    const shore = islandCollisionRadius(island);
    assert.ok(
      from > shore + MARKET_BODY_RADIUS + 3,
      `${market.id} clear of its shore`,
    );
    assert.ok(from < shore + 15, `${market.id} close to its island`);
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
