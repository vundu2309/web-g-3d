# 0015. The upgrade shop: boats, rods and baits

Date: 2026-11-20. Status: built and checked in the working tree, not published; the migration is not applied to the live database (the user decides both).

## The decision

Coins ([decision 0010](0010-server-economy.md)) had nothing to buy. The user chose an upgrade shop of three kinds, four tiers each, tier 0 free, bought once and kept for good:

| Kind     | What a tier does                                                                 | Prices (xu)          | Where it is bought                                    |
| -------- | -------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------- |
| **Boat** | more store slots, 1 slot = 1 fish: 20, 50, 100, 200; its own 3D model            | 0, 200, 1,500, 8,000 | the three shipyards (boats only)                      |
| **Rod**  | a stronger line: the tension builds 1, 0.85, 0.7, 0.55 times as fast             | 0, 100, 600, 3,000   | the markets, tab "Cần & mồi"                          |
| **Bait** | rarer fish: rarity-2 odds 1, 1.5, 2.2, 3.2 times and rarity-3 1, 1.8, 3, 5 times | 0, 100, 600, 3,000   | the markets; every bait bought is kept, one is in use |

A better boat has more slots, **not** more speed: the hull's mass, drive and every handling number stay as tuned, and a test pins that all four boats reach the same top speed in the same time and turn at the same rate. Tier 1 of the boat is the first boat to the last digit. The rods are bamboo (free), fibreglass, carbon fibre and gold; the baits are giun, tôm, cá con and mực. Other players see the boat and the rod of everyone. All of it was drawn as concept images and approved before the code (the three boats and the yard, the four baits, the four rods with their reels).

## Authority and its limit

- **Ownership and price are the server's** (`supabase/migrations/20261120130000_upgrades.sql`): tables `economy_private.upgrade_prices` and `loadouts`, functions `loadout_of`, `state` (now with the loadout), `loadout`, `buy` (locks the wallet row, refuses with `EC409` owned, `EC422` order, `EC402` poor) and `set_bait`, reached through `economy_loadout`, `economy_buy` and `economy_set_bait` for `authenticated` only. `tests/upgrades.test.mjs` fails if the table in `src/ocean/upgrades.ts` and the migration's prices differ; `tests/economy-postgres.sh` runs the SQL scenarios on a throwaway PostgreSQL.
- **The effects are applied on the device**: a fishing catch is still a client report ([decision 0010](0010-server-economy.md)), so a modified client can claim any rod's strength or any bait's odds. Buying them cannot be faked (the server charges and records); using them cannot be policed until the server decides the catch, which is a separate proposal ([the server decides the catch](../work/2026-11-19-server-authoritative-catch.md)). Slots are the same: the store is on the device.
- **Other players' boats** are never taken from the client: `server/ocean.mjs` reads `economy_loadout` with the player's OWN token when the boat enters and again when the client says it bought something (`ocean:refit`, once in two seconds, the payload ignored), and sends `tier` and `rod` with the boat. A read that fails or takes over 2.5 s is the first boat and rod when the boat enters, and changes nothing at a refit (a hiccup never demotes a player in everyone's eyes); a refit asked within two seconds of the last is done once the gap is over, not dropped. No admin key is used. Older clients ignore the new fields and the new event.

## What it touches

- **Boat by tier** (`src/ocean/boat-tier.ts`): per tier the model, the hull the feel is worked from, the box Havok collides with, the waterline, the wake, the rod holder, the shadow. The flagship's collision box covers its outrigger booms (7.3 m, the user's choice) while its hull stays 3.88 m: the buoyancy points, the rudder, the lean and the yaw inertia Havok is given follow the hull, so the box does not change how it turns. The Vietnam flag on the boats is the fixed colours `PAL.flag`, never a role colour.
- **Rods** (`rod-plan.ts`, `rod-visual.ts`, `rod.ts`): four plans, slim, with a reel under the handle, the rarer the finer; a slight curve at rest (`RodSim`'s `rest`, not part of the spring).
- **Baits** (`bait-view.ts`, `fishing-gear.ts`): the orange fish lure the game always had IS the default bait; each bait bought replaces it on the line with its own model at the same half metre.
- **Slots** (`fishing.ts` `canKeep`, `fishing-ui.ts`): a full store locks the keep button, the fish on the rod can only be put back, a store from before the slots is never trimmed.
- **Shipyards** (`shipyard.ts`, `shipyard-visual.ts`, the hub is `market-ui.ts` serving a second kind of place): three yards on islands 0, 4 and 7, 723 m or more apart, one shared model.
- **Pictures** in the hubs are drawn from the game's own models (`app/item-thumb.ts`), not drawn separately.

## Performance

The convention of [performance](../performance.md) was applied: other players' boats are drawn by how big they look (whole, a copy of at most 1,500 triangles, one of at most 300), models load lazily, the yards have a middle copy and are not drawn beyond about 1,700 m, switches `?tiers=0` and `?yards=0` exist (also in Settings), and every cost is under "Performance pass" in [the sea contract](../ocean.md). **Nothing was measured on a phone.**

## Consequences and what is not done

- The live database has no upgrade tables until the migration is applied; a client without them reads an answer with no loadout as the default loadout and the market's buy calls fail with a message. Apply the migration before (or with) the app.
- **Limits found in review** (2026-11-20): the fish hanging on the rod is screen state, not saved, so a page unload with a full store loses it (opening a hub or reconnecting keeps it); the loadout read when entering is retried three times (2, 6 and 15 s) and then waits for the market; without a server economy the store has no cap.
- Not seen: the game played in a real browser session with real fish and a real purchase, a phone, the flagship docking at a market bridge (its box is 7.3 m wide), a rod bent by a real fish.
- Deferred: faster boats, boat colour, longer casts, consumable bait, quests and leaderboards.
