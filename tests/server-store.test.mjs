import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryFrom } from "../src/ocean/server-store.ts";
import { decodeSave, encodeSave, safePose } from "../src/ocean/save.ts";

test("the store is the ledger counted per species, with the heaviest weight of each", () => {
  const inv = inventoryFrom(
    [
      { species: "tom-hum", kg: 1.5 },
      { species: "tom-hum", kg: 3 },
      { species: "ca-map", kg: 100 },
      { species: "removed-long-ago", kg: 1 },
    ],
    {},
  );
  assert.deepEqual(inv, {
    "tom-hum": { n: 2, best: 3 },
    "ca-map": { n: 1, best: 100 },
  });
});

test("records survive after the fish is sold, and a record never lowers the best weight held", () => {
  const inv = inventoryFrom([{ species: "tom-hum", kg: 4 }], {
    "tom-hum": 2,
    "ca-map": 150,
    "unknown-species": 9,
    "ca-heo": -3,
    sua: NaN,
  });
  assert.deepEqual(inv, {
    "tom-hum": { n: 1, best: 4 },
    "ca-map": { n: 0, best: 150 },
  });
});

test("an empty ledger and no records is an empty store", () => {
  assert.deepEqual(inventoryFrom([], {}), {});
});

test("safePose accepts a position in the sea and refuses unsafe ones", () => {
  assert.deepEqual(safePose(10, 20, 1), {
    x: 10,
    z: 20,
    heading: 1,
    fishing: false,
  });
  assert.equal(safePose(NaN, 0, 0), undefined);
  assert.equal(safePose("1", 0, 0), undefined);
  assert.equal(safePose(0, 0, 4), undefined, "heading out of range");
  assert.equal(safePose(5000, 0, 0), undefined, "outside the sea");
});

test("the device save still resolves to the same position as before", () => {
  const now = 1_700_000_000_000;
  const raw = encodeSave({ x: 12, z: -34, heading: 0.5, caught: 7 }, now);
  const restored = decodeSave(raw, now + 1000);
  assert.deepEqual(restored.pose, safePose(12, -34, 0.5));
  assert.equal(restored.caught, 7);
  assert.equal(decodeSave(raw, now + 8 * 24 * 3600 * 1000).pose, undefined);
});
