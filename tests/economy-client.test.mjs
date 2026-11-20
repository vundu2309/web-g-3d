import { test } from "node:test";
import assert from "node:assert/strict";
import { EconomyError, memoryEconomy } from "../src/ocean/economy-api.ts";
import { priceOf } from "../src/ocean/economy.ts";
import { SPECIES } from "../src/ocean/fishing.ts";
import { UPGRADES } from "../src/ocean/upgrades.ts";

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
const lobster = SPECIES.find((s) => s.id === "tom-hum");

test("a catch needs a real species, a weight in its range, and six seconds since the last", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  time.tick(10);
  await money.recordCatch({ species: "tom-hum", kg: 2.34 });
  await fails(money.recordCatch({ species: "tom-hum", kg: 2 }), "fast");
  time.tick(7);
  await fails(money.recordCatch({ species: "no-such", kg: 1 }), "invalid");
  await fails(money.recordCatch({ species: "tom-hum", kg: 99 }), "invalid");
  await fails(money.recordCatch({ species: "tom-hum", kg: 0.1 }), "invalid");
  await money.recordCatch({ species: "tom-hum", kg: 2 });
  assert.equal((await money.state()).ledger.length, 2);
});

test("selling pays the prices of the rules and removes the fish; fish not caught cannot be sold", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  for (const kg of [1, 4.5]) {
    time.tick(10);
    await money.recordCatch({ species: "tom-hum", kg });
  }
  const result = await money.sell([{ species: "tom-hum", kg: 1 }]);
  assert.equal(result.sold, 1);
  assert.equal(result.earned, priceOf(lobster, 1));
  assert.equal(result.coins, priceOf(lobster, 1));
  await fails(money.sell([{ species: "tom-hum", kg: 1 }]), "invalid");
  await fails(money.sell([{ species: "ca-map", kg: 100 }]), "invalid");
  // One missing fish cancels the whole sale.
  await fails(
    money.sell([
      { species: "tom-hum", kg: 4.5 },
      { species: "tom-hum", kg: 1 },
    ]),
    "invalid",
  );
  assert.equal((await money.state()).ledger.length, 1);
  const all = await money.sell(null);
  assert.equal(all.sold, 1);
  assert.equal(all.coins, priceOf(lobster, 1) + priceOf(lobster, 4.5));
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
    await money.recordCatch({ species: "ca-madeka", kg: 0.02 });
  }
  time.tick(10);
  await fails(money.recordCatch({ species: "ca-madeka", kg: 0.02 }), "full");
});

// ----- The profile kept on the server (docs/decisions/0016-server-profile.md) -----

test("a catch counts and sets a record; a lighter fish of the same species does not", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  time.tick(10);
  await money.recordCatch({ species: "tom-hum", kg: 3 });
  time.tick(10);
  await money.recordCatch({ species: "tom-hum", kg: 1.5 });
  const profile = await money.profile();
  assert.equal(profile.caught, 2);
  assert.equal(profile.records["tom-hum"], 3);
  assert.equal(profile.imported, false);
  assert.equal(profile.pose, undefined);
});

test("putting a fish back removes the lightest of that species, pays nothing and keeps the record", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  for (const kg of [4, 1, 2.5]) {
    time.tick(10);
    await money.recordCatch({ species: "tom-hum", kg });
  }
  await money.release("tom-hum");
  const state = await money.state();
  assert.deepEqual(state.ledger.map((f) => f.kg).sort(), [2.5, 4]);
  assert.equal(state.coins, 0);
  assert.equal((await money.profile()).records["tom-hum"], 4);
  await fails(money.release("ca-map"), "invalid");
});

test("the boat position is checked and saved at most once every ten seconds", async () => {
  const time = clock();
  const money = memoryEconomy({ now: time.now });
  time.tick(100);
  await fails(money.savePose({ x: 99999, z: 0, heading: 0 }), "invalid");
  await fails(money.savePose({ x: 0, z: 0, heading: 9 }), "invalid");
  await fails(money.savePose({ x: NaN, z: 0, heading: 0 }), "invalid");
  await money.savePose({ x: 10, z: -20, heading: 1 });
  time.tick(5);
  await money.savePose({ x: 500, z: 500, heading: 0 });
  assert.deepEqual(
    { ...(await money.profile()).pose, age: 0 },
    { x: 10, z: -20, heading: 1, age: 0 },
    "the second save inside ten seconds is ignored",
  );
  time.tick(6);
  await money.savePose({ x: 500, z: 500, heading: 0 });
  assert.equal((await money.profile()).pose.x, 500);
});

test("the old store on the device moves once, at the lightest weight, bounded", async () => {
  const money = memoryEconomy();
  const lobster = SPECIES.find((s) => s.id === "tom-hum");
  const result = await money.importLocal(
    {
      "tom-hum": { n: 9999, best: 4.2 },
      "ca-map": { n: 9999, best: 9999 },
      "no-such": { n: 5, best: 1 },
    },
    40,
  );
  assert.equal(result.already, false);
  assert.equal(result.imported, 100, "at most 100 fish move");
  const state = await money.state();
  const lobsters = state.ledger.filter((f) => f.species === "tom-hum");
  assert.equal(lobsters.length, 50, "each species is cut by the same ratio");
  assert.ok(
    lobsters.every((f) => f.kg === lobster.kg[0]),
    "lightest weight",
  );
  assert.ok(state.ledger.every((f) => f.species !== "no-such"));
  const profile = await money.profile();
  assert.equal(profile.records["tom-hum"], 4.2);
  assert.ok(
    profile.records["ca-map"] <= SPECIES.find((s) => s.id === "ca-map").kg[1],
    "a record above the heaviest possible fish is clamped",
  );
  assert.equal(profile.caught, 40);
  assert.equal(profile.imported, true);
  // A second import changes nothing.
  const again = await money.importLocal({ "tom-hum": { n: 50, best: 5 } }, 999);
  assert.deepEqual(again, { imported: 0, already: true });
  assert.equal((await money.state()).ledger.length, 100);
  assert.equal((await money.profile()).caught, 40);
});

test("an old store that fits moves whole, every fish at its species' lightest weight", async () => {
  const money = memoryEconomy();
  const result = await money.importLocal(
    { "tom-hum": { n: 3, best: 4.2 }, "ca-map": { n: 2, best: 0 } },
    5,
  );
  assert.equal(result.imported, 5);
  const state = await money.state();
  assert.equal(state.ledger.filter((f) => f.species === "tom-hum").length, 3);
  assert.equal(state.ledger.filter((f) => f.species === "ca-map").length, 2);
  assert.equal(
    (await money.profile()).records["ca-map"],
    undefined,
    "a best of 0 is no record",
  );
});

// Upgrades: the same rules as economy_private.buy / set_bait (tests/economy-postgres.sql).
test("a new account owns only the free tiers", async () => {
  const money = memoryEconomy();
  assert.deepEqual((await money.state()).loadout, {
    rod: 0,
    bait: 0,
    baitUsed: 0,
    boat: 0,
  });
});

test("buying charges the table's price and records the tier", async () => {
  const money = memoryEconomy({ coins: 1000 });
  const rod = await money.buy("rod", 1);
  assert.equal(rod.coins, 1000 - UPGRADES.rod[1].price);
  assert.equal(rod.loadout.rod, 1);
  const boat = await money.buy("boat", 1);
  assert.equal(
    boat.coins,
    1000 - UPGRADES.rod[1].price - UPGRADES.boat[1].price,
  );
  const state = await money.state();
  assert.equal(state.coins, boat.coins);
  assert.equal(state.loadout.rod, 1);
  assert.equal(state.loadout.boat, 1);
  assert.equal(state.loadout.bait, 0);
});

test("buying a tier too early, again, or without the coins changes nothing", async () => {
  const money = memoryEconomy({ coins: 150 });
  const before = await money.state();
  await fails(money.buy("rod", 2), "order"); // tier 1 first
  await fails(money.buy("rod", 3), "order");
  await fails(money.buy("boat", 1), "poor"); // 200 coins, 150 held
  await fails(money.buy("rod", 0), "owned"); // the free tier is owned from the start
  await money.buy("rod", 1);
  await fails(money.buy("rod", 1), "owned");
  await fails(money.buy("rod", 2), "poor"); // 600 coins, 50 held
  await fails(money.buy("sail", 1), "invalid");
  await fails(money.buy("rod", 4), "invalid");
  await fails(money.buy("rod", 1.5), "invalid");
  await fails(money.buy("rod", -1), "invalid");
  const after = await money.state();
  assert.equal(after.coins, before.coins - UPGRADES.rod[1].price);
  assert.deepEqual(after.loadout, { rod: 1, bait: 0, baitUsed: 0, boat: 0 });
});

test("the tiers are bought in order up to the top, then nothing is left", async () => {
  const money = memoryEconomy({ coins: 1e6 });
  for (const tier of [1, 2, 3]) await money.buy("boat", tier);
  assert.equal((await money.state()).loadout.boat, 3);
  await fails(money.buy("boat", 3), "owned");
  const total = UPGRADES.boat.reduce((sum, t) => sum + t.price, 0);
  assert.equal((await money.state()).coins, 1e6 - total);
});

test("a double press charges exactly once", async () => {
  const money = memoryEconomy({ coins: 250 });
  const results = await Promise.allSettled([
    money.buy("rod", 1),
    money.buy("rod", 1),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const lost = results.find((r) => r.status === "rejected");
  assert.ok(lost.reason instanceof EconomyError);
  assert.equal(lost.reason.failure, "owned");
  assert.equal((await money.state()).coins, 150);
});

test("bait: every bought bait is kept, one is in use, only an owned one can be chosen", async () => {
  const money = memoryEconomy({ coins: 1000 });
  await fails(money.setBait(1), "order"); // not owned yet
  await fails(money.setBait(7), "invalid");
  await fails(money.setBait(0.5), "invalid");
  await money.buy("bait", 1);
  assert.deepEqual((await money.state()).loadout, {
    rod: 0,
    bait: 1,
    baitUsed: 1,
    boat: 0,
  });
  await money.buy("bait", 2);
  assert.equal((await money.state()).loadout.baitUsed, 2);
  const back = await money.setBait(0);
  assert.deepEqual(back, { rod: 0, bait: 2, baitUsed: 0, boat: 0 });
  await money.setBait(1);
  assert.equal((await money.state()).loadout.baitUsed, 1);
  assert.equal(
    (await money.state()).loadout.bait,
    2,
    "the better bait stays owned",
  );
  await fails(money.setBait(3), "order");
  assert.equal(
    (await money.state()).loadout.baitUsed,
    1,
    "a refused choice changes nothing",
  );
});

test("the state hands out a copy of the loadout, not the live object", async () => {
  const money = memoryEconomy({ coins: 100 });
  const state = await money.state();
  state.loadout.rod = 3;
  assert.equal((await money.state()).loadout.rod, 0);
});
