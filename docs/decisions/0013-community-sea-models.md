# 0013. Sea animals from community models, ten species

Date: 2026-11-18. Status: the species list, the models and the file format were accepted by the user
on 2026-11-18. The price-row migration is written but **not applied** to the live database; applying
it needs the user's say (see decision 0010).

## Context

The sea animals were sixteen body plans built from code and exported by `tools/blender/fish.py`
(1,000 triangles each), recoloured per species. The user found them ugly and asked for realistic,
beautiful animals. Hand-built pilots (a matte realistic mackerel, shark and octopus, then a smooth
stylised mackerel, and a low-poly one for comparison) were shown; the user then asked for ready-made
models from the Blender community (BlenderKit) instead, and to change the species to match what could
be found.

## Decision

- Ten species, one GLB each, from BlenderKit models, with the triangle count of each download kept
  (the user said not to reduce them): cá madeka, cua biển, sao biển, sứa, cá hề, cá ngựa, rùa biển,
  tôm hùm, cá heo, cá mập. The models, authors and licences are in docs/ocean.md "Sea animal models".
- The other ten species of the old table (cơm, bống, chim, nóc, mú, thu, hồng, ngừ, đuối, kiếm, nục,
  bơn, mực ống, bạch tuộc; there is no free model of a mackerel, tuna, ray, swordfish, flounder,
  pufferfish, squid or octopus that is light enough) are no longer in the game.
- The file contract changed: one file per species named after its id, no ROLE colours and no per
  species recolouring, no tail node. The code-built animals (`creatures.ts`), the sixteen body-plan
  files and the generator `fish.py` were deleted. A small plain ellipsoid stands in until a file has
  arrived.
- The weight ranges of the species that kept their id (`ca-he`, `ca-ngua`, `cua-bien`, `sao-bien`,
  `tom-hum`, `ca-map`) did not change, so their price rows on the server stay as they are. The cua biển
  is now the rocky shore crab (a red crab model that was also downloaded was dropped at the user's
  request). Four species are new and need price rows: `supabase/migrations/20261118120000_sea_species.sql`
  adds them (nothing is deleted: the ledger of fish already caught still points at the old rows).

## Consequences

- A player's saved fish of a species that is gone are dropped when the save is read (`save.ts` ignores
  unknown ids); fish of those species still unsold in the server ledger stay there, but the game no
  longer lists them, so they cannot be sold from the market.
- The files weigh 6.6 MB (the old ones 1.4 MB) and hold up to 78,048 triangles (the old ones about
  1,000). The cost on a phone is not measured (see docs/ocean.md "Not measured").
- Licence: only the starfish and the crab are CC0. The others are BlenderKit royalty_free, which allows
  commercial use but forbids reselling the model; the game serves the files publicly. The user was asked
  and did not rule on it; the owner should read the terms before a public release.
- The supabase migration only exists as a file. If the GitHub integration applies migrations on a push
  to `main` (decision 0010 says the earlier one was recorded to avoid a second apply), pushing it may
  change production: confirm with the user before pushing.
