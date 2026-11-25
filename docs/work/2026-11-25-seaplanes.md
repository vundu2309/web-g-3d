# 2026-11-25 Banner seaplanes

Request: NPC seaplanes towing a banner that advertises the game, flying and turning to random directions in the sky. Correction from the user after the first version: it is an online game, every player must see the same planes, so they follow the shared clock.
Branch `wt/seaplanes` (from `origin/main` at `b45a0e8`). Decision: [0019](../decisions/0019-banner-seaplanes.md).

## Built

- `src/ocean/plane-flight.ts` (random flight), `plane-plan.ts` (the shared-clock plan and replay), `banner.ts` (tow trail and banner geometry), `plane-fleet.ts` (models, texture, drawing), wiring in `babylon-scene.ts`, the `?planes=0` switch in `probe.ts`, exclusion from the water mirror.
- Tests: `tests/plane-flight.test.mjs`, `tests/plane-plan.test.mjs`, `tests/banner.test.mjs`, browser `ocean-planes` (two browsers compared), one more name pinned in `tests/reflection.test.mjs`.

## Not done

- Not pushed or deployed. No phone reading; no automatic give-up by a governor; only Chromium compared.
