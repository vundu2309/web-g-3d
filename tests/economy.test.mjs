import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEDGER_CAP,
  CATCH_COOLDOWN_SECONDS,
  basePrice,
  priceOf,
  priceTable,
} from "../src/ocean/economy.ts";
import { SPECIES } from "../src/ocean/fishing.ts";

const migration = readFileSync(
  "supabase/migrations/20261113032223_economy.sql",
  "utf8",
);

test("the database's price table is exactly the TypeScript one", () => {
  const seed = [
    ...migration.matchAll(/\('([a-z-]+)', (\d+), ([\d.]+), ([\d.]+)\)/g),
  ].map(([, species, base, min, max]) => ({
    species,
    base: Number(base),
    minKg: Number(min),
    maxKg: Number(max),
  }));
  assert.deepEqual(seed, priceTable());
  assert.equal(seed.length, SPECIES.length, "every species has a price");
});

test("a heavier or rarer fish pays more, and a fish pays 0.6 to 1.5 times its base", () => {
  for (const s of SPECIES) {
    const base = basePrice(s);
    assert.ok(base > 0);
    assert.equal(priceOf(s, s.kg[0]), Math.round(base * 0.6));
    assert.equal(priceOf(s, s.kg[1]), Math.round(base * 1.5));
    assert.ok(priceOf(s, s.kg[1]) >= priceOf(s, s.kg[0]));
    // Outside the range the weight is clamped, never extrapolated.
    assert.equal(priceOf(s, s.kg[1] * 10), priceOf(s, s.kg[1]));
  }
  const tuna = SPECIES.find((s) => s.id === "ca-ngu");
  assert.equal(priceOf(tuna, tuna.kg[0]), 128);
  assert.equal(priceOf(tuna, tuna.kg[1]), 320);
  const anchovy = SPECIES.find((s) => s.id === "ca-com");
  assert.ok(priceOf(anchovy, anchovy.kg[1]) < priceOf(tuna, tuna.kg[0]));
});

test("the migration enforces the same limits the app documents", () => {
  assert.match(
    migration,
    new RegExp(`interval '${CATCH_COOLDOWN_SECONDS} seconds'`),
  );
  assert.match(migration, new RegExp(`>= ${LEDGER_CAP} then`));
  // Tables are private and the RPCs are the only way in.
  assert.match(
    migration,
    /revoke all on all tables in schema economy_private from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.economy_sell\(jsonb\) to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant (select|insert|update|delete)[^;]*economy_private/i,
  );
});
