import type { LedgerFish, Profile } from "./economy-api.ts";
import { speciesById, type Inventory } from "./fishing.ts";

/**
 * The fish store when the SERVER keeps it (docs/decisions/0016-server-profile.md): the unsold
 * fish are the ledger rows, the heaviest weights are the profile's records. The screen still
 * works with an `Inventory` (count and best weight per species), so this builds one.
 * A species the game no longer has is left out.
 */
export function inventoryFrom(
  ledger: readonly Pick<LedgerFish, "species" | "kg">[],
  records: Profile["records"],
): Inventory {
  const out: Inventory = {};
  for (const row of ledger) {
    if (!speciesById(row.species)) continue;
    const held = out[row.species];
    out[row.species] = {
      n: (held?.n ?? 0) + 1,
      best: Math.max(held?.best ?? 0, row.kg),
    };
  }
  for (const [id, kg] of Object.entries(records)) {
    if (!speciesById(id) || !Number.isFinite(kg) || kg <= 0) continue;
    const held = out[id];
    out[id] = { n: held?.n ?? 0, best: Math.max(held?.best ?? 0, kg) };
  }
  return out;
}
