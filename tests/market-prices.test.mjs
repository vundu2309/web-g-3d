import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EconomyError, memoryEconomy } from "../src/ocean/economy-api.ts";
import { priceOf } from "../src/ocean/economy.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { vnDateString, vnDayKey } from "../src/ocean/game-clock.ts";
import { MARKETS } from "../src/ocean/market.ts";
import {
  EPOCH_DAY,
  MARKET_IDS,
  PCT_MAX,
  PCT_MIN,
  marketPct,
  marketPcts,
  pctText,
  priceAt,
} from "../src/ocean/market-prices.ts";

// The percent a market pays is worked out the same way in the database
// (supabase/migrations/20261127120000_market_prices.sql, `market_pct`); the SQL harness
// (tests/economy-postgres.sql) holds the SAME table of golden values and fails if the two differ.
const GOLDEN = [
  ["hai-dang", 18262, 85],
  ["doi-xanh", 18262, 103],
  ["bai-co", 18262, 121],
  ["giua-khoi", 18262, 98],
  ["cuoi-troi", 18262, 119],
  ["hai-dang", 18263, 101],
  ["doi-xanh", 18263, 122],
  ["bai-co", 18263, 99],
  ["giua-khoi", 18263, 117],
  ["cuoi-troi", 18263, 94],
  ["hai-dang", 20599, 102],
  ["doi-xanh", 20599, 120],
  ["bai-co", 20599, 97],
  ["giua-khoi", 20599, 118],
  ["cuoi-troi", 20599, 95],
  ["hai-dang", 20600, 121],
  ["doi-xanh", 20600, 98],
  ["bai-co", 20600, 116],
  ["giua-khoi", 20600, 96],
  ["cuoi-troi", 20600, 114],
  ["hai-dang", 20999, 92],
  ["doi-xanh", 20999, 110],
  ["bai-co", 20999, 87],
  ["giua-khoi", 20999, 105],
  ["cuoi-troi", 20999, 85],
  ["hai-dang", 21500, 97],
  ["doi-xanh", 21500, 115],
  ["bai-co", 21500, 92],
  ["giua-khoi", 21500, 110],
  ["cuoi-troi", 21500, 90],
  ["hai-dang", 25000, 122],
  ["doi-xanh", 25000, 99],
  ["bai-co", 25000, 117],
  ["giua-khoi", 25000, 97],
  ["cuoi-troi", 25000, 115],
];

test("the markets are the five of the sea, in the order the database seeds them", () => {
  assert.deepEqual(
    [...MARKET_IDS],
    MARKETS.map((m) => m.id),
  );
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/20261127120000_market_prices.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const seeded = [...sql.matchAll(/\('([a-z-]+)', (\d+)\)/g)].map(
    ([, id, idx]) => [id, Number(idx)],
  );
  assert.deepEqual(
    seeded,
    MARKET_IDS.map((id, i) => [id, i]),
  );
  // The same constants in both places.
  for (const constant of [
    "73856093",
    "19349663",
    "48271",
    "2147483647",
    "date '2020-01-01'",
  ])
    assert.ok(sql.includes(constant), `the migration has ${constant}`);
  assert.equal(EPOCH_DAY, vnDayKey(Date.parse("2020-01-01T00:00:00+07:00")));
});

test("golden values: the percent of each market on a day", () => {
  for (const [market, day, pct] of GOLDEN)
    assert.equal(marketPct(market, day), pct, `${market} on day ${day}`);
});

test("a percent is 85 to 125 on every day, markets differ on a day, and every market has cheap and dear days", () => {
  const seen = new Map(MARKET_IDS.map((id) => [id, { min: 999, max: 0 }]));
  let differ = 0;
  for (let d = EPOCH_DAY; d < EPOCH_DAY + 3650; d++) {
    const all = marketPcts(d);
    for (const id of MARKET_IDS) {
      const pct = all[id];
      assert.ok(
        Number.isInteger(pct) && pct >= PCT_MIN && pct <= PCT_MAX,
        `${id} ${pct}`,
      );
      const r = seen.get(id);
      r.min = Math.min(r.min, pct);
      r.max = Math.max(r.max, pct);
    }
    if (new Set(Object.values(all)).size > 1) differ++;
  }
  for (const [id, r] of seen)
    assert.ok(
      r.min <= 87 && r.max >= 123,
      `${id} stays between ${r.min} and ${r.max}`,
    );
  assert.ok(differ > 3600, "the markets are not the same on most days");
  // Even before 2020 (negative day numbers in the mix) the percent is in range.
  for (let d = 0; d < 400; d++)
    for (const id of MARKET_IDS)
      assert.ok(marketPct(id, d) >= 85 && marketPct(id, d) <= 125);
  assert.equal(marketPct(undefined, 20000), 100);
  assert.equal(marketPct(null, 20000), 100);
  assert.throws(() => marketPct("nowhere", 20000));
});

test("a price is whole coins, rounded half up, and 100 % is the ordinary price", () => {
  assert.equal(priceAt(128, 100), 128);
  assert.equal(priceAt(128, 85), 109); // 108.8
  assert.equal(priceAt(128, 125), 160);
  assert.equal(priceAt(1, 85), 1); // 0.85
  assert.equal(priceAt(1, 125), 1); // 1.25
  assert.equal(priceAt(2, 125), 3); // 2.5 rounds up
  assert.equal(priceAt(0, 125), 0);
  for (const species of SPECIES)
    for (const kg of [
      species.kg[0],
      (species.kg[0] + species.kg[1]) / 2,
      species.kg[1],
    ])
      assert.equal(priceAt(priceOf(species, kg), 100), priceOf(species, kg));
});

test("the words for the chip", () => {
  assert.equal(pctText(112), "+12%");
  assert.equal(pctText(92), "−8%");
  assert.equal(pctText(100), "như thường");
});

test("the in-memory economy prices a market as the database does: the price shown is the price paid", async () => {
  const now = () => Date.parse("2026-11-26T10:00:00Z");
  const money = memoryEconomy({ now });
  // Catches need time between them: give the fake clock a way to move.
  let t = 0;
  const clock = () => now() + t;
  const m2 = memoryEconomy({ now: clock });
  for (const [species, kg] of [
    ["tom-hum", 2.5],
    ["ca-heo", 100],
    ["cua-bien", 1],
  ]) {
    t += 10_000;
    await m2.recordCatch({ species, kg });
  }
  const day = vnDayKey(clock());
  const plain = await m2.state();
  const asked = await m2.state("bai-co");
  assert.equal(plain.market.pct, 100);
  assert.equal(asked.market.pct, marketPct("bai-co", day));
  assert.equal(asked.market.day, vnDateString(day));
  assert.deepEqual(asked.market.all, marketPcts(day));
  for (const [i, row] of asked.ledger.entries())
    assert.equal(row.price, priceAt(plain.ledger[i].price, asked.market.pct));
  const shown = asked.ledger.reduce((s, r) => s + r.price, 0);
  const sold = await m2.sell(null, "bai-co", asked.market.day);
  assert.equal(sold.earned, shown, "what the page showed is what was paid");
  void money;
  // Unknown market, and a day that is not today or yesterday, are refused.
  await assert.rejects(
    m2.state("nowhere"),
    (e) => e instanceof EconomyError && e.failure === "invalid",
  );
  await assert.rejects(
    m2.sell(null, "nowhere"),
    (e) => e instanceof EconomyError && e.failure === "invalid",
  );
  await assert.rejects(
    m2.sell(null, "bai-co", vnDateString(day - 2)),
    (e) => e instanceof EconomyError,
  );
  await assert.rejects(
    m2.sell(null, "bai-co", vnDateString(day + 1)),
    (e) => e instanceof EconomyError,
  );
  // Yesterday's price is honoured.
  t += 10_000;
  await m2.recordCatch({ species: "tom-hum", kg: 2 });
  const row = (await m2.state()).ledger[0];
  const yesterday = await m2.sell(null, "doi-xanh", vnDateString(day - 1));
  assert.equal(
    yesterday.earned,
    priceAt(row.price, marketPct("doi-xanh", day - 1)),
  );
});
