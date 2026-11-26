# 2026-11-25 Banner seaplanes

Request: NPC seaplanes towing a banner that advertises the game, flying and turning to random directions in the sky. Correction from the user after the first version: it is an online game, every player must see the same planes, so they follow the shared clock.
Branch `wt/seaplanes` (from `origin/main` at `b45a0e8`). Decision: [0019](../decisions/0019-banner-seaplanes.md).

## Built

- `src/ocean/plane-flight.ts` (random flight), `plane-plan.ts` (the shared-clock plan and replay), `banner.ts` (tow trail and banner geometry), `plane-fleet.ts` (models, texture, drawing), wiring in `babylon-scene.ts`, the `?planes=0` switch in `probe.ts`, exclusion from the water mirror.
- Tests: `tests/plane-flight.test.mjs`, `tests/plane-plan.test.mjs`, `tests/banner.test.mjs`, browser `ocean-planes` (two browsers compared), one more name pinned in `tests/reflection.test.mjs`.

## Second pass (after the user's play test: "hiếm khi thấy máy bay", "buổi tối có ánh sáng không?")

- Twelve planes with homes (harbour and nearest islands), roaming 450 m, flying 50 to 85 m; draw 4 within 600 m (3 within 450 m on a phone); measured coverage in `docs/ocean.md`.
- Night lights (`plane-lights.ts`, `plane-glow.ts`) and a banner that stays readable at night.
- Tests: `plane-lights.test.mjs`, the homes and coverage tests in `plane-plan.test.mjs`, the night checks and retried screenshots in `ocean-planes`.

## Third pass: planes vanished at the edge of the range

- `plane-fade.ts`: a distance taper and a time fade, applied as the dithered tile fade to the plane, propeller and banner; the glow shrinks. Test: `plane-fade.test.mjs` and a fly-away check in `ocean-planes`.

## Also fixed on this branch: the sky near the edge of the sea

- Reported by the user ("lỗi bầu trời khi tiến tới gần rìa map"). The sky dome's position was set to the camera's although `infiniteDistance` already adds the camera's, so the dome sat twice as far out as the camera and, past 1,200 m, the camera left the dome. Fixed in `sky.ts`; tests `sky-dome.test.mjs` and `ocean-edge`.

## Not done

- Not pushed or deployed. No phone reading; no automatic give-up by a governor; only Chromium compared.
