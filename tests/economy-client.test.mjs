import { test } from "node:test";
import assert from "node:assert/strict";
import { EconomyError, memoryEconomy } from "../src/ocean/economy-api.ts";
import { priceOf } from "../src/ocean/economy.ts";
import { SPECIES } from "../src/ocean/fishing.ts";

// The in-memory economy follows the database's rules (tests/economy-postgres.sql), so the
// market screens can be built and tested without a server.
const clock = () => {
  let now = 0;
  return { now: () => now, tick: (seconds) => (now += seconds * 1000) };
};
const fails = async (promise, failure) =>
  assert.rejects(
    promise,
    (e) => e instanceof EconomyError && e.failure === failure,
  );
const tuna = SPECIES.find((s) => s.id === "ca-ngu");

test("a catch needs a real species, a weight in its range, and six seconds since the last", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  time.tick(10);
  await money.recordCatch({ species: "ca-ngu", kg: 12.34 });
  await fails(money.recordCatch({ species: "ca-ngu", kg: 12 }), "fast");
  time.tick(7);
  await fails(money.recordCatch({ species: "no-such", kg: 1 }), "invalid");
  await fails(money.recordCatch({ species: "ca-ngu", kg: 99 }), "invalid");
  await fails(money.recordCatch({ species: "ca-ngu", kg: 0.5 }), "invalid");
  await money.recordCatch({ species: "ca-ngu", kg: 12 });
  assert.equal((await money.state()).ledger.length, 2);
});

test("selling pays the prices of the rules and removes the fish; fish not caught cannot be sold", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  for (const kg of [6, 30]) {
    time.tick(10);
    await money.recordCatch({ species: "ca-ngu", kg });
  }
  const result = await money.sell([{ species: "ca-ngu", kg: 6 }]);
  assert.equal(result.sold, 1);
  assert.equal(result.earned, priceOf(tuna, 6));
  assert.equal(result.coins, priceOf(tuna, 6));
  await fails(money.sell([{ species: "ca-ngu", kg: 6 }]), "invalid");
  await fails(money.sell([{ species: "ca-map", kg: 100 }]), "invalid");
  // One missing fish cancels the whole sale.
  await fails(
    money.sell([
      { species: "ca-ngu", kg: 30 },
      { species: "ca-ngu", kg: 6 },
    ]),
    "invalid",
  );
  assert.equal((await money.state()).ledger.length, 1);
  const all = await money.sell(null);
  assert.equal(all.sold, 1);
  assert.equal(all.coins, priceOf(tuna, 6) + priceOf(tuna, 30));
  assert.equal(
    (await money.sell(null)).earned,
    0,
    "selling nothing pays nothing",
  );
});

test("the ledger holds at most 200 unsold fish", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  for (let i = 0; i < 200; i++) {
    time.tick(10);
    await money.recordCatch({ species: "ca-com", kg: 0.1 });
  }
  time.tick(10);
  await fails(money.recordCatch({ species: "ca-com", kg: 0.1 }), "full");
});
