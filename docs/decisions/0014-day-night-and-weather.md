# 0014. Day, night and weather on the shared sea

Date: 2026-11-17. Status: decided by the user, implemented in the repository (not yet on a real phone).

## The decision

The user asked for a day/night cycle and weather on the fishing sea, with these final choices:

1. **One shared clock from real UTC time, no server change.** One game day is 24 real minutes (`DAY_MS` in `src/ocean/atmosphere.ts`, the only place that number lives). Every player sees the same time and the same weather.
2. **Four weathers**: clear / few clouds, overcast, rain, fog. Chosen deterministically from the UTC time in slots of a few minutes (4), by a hash of the slot number, with a smooth cross-fade between slots, so every client agrees without a server. **Weather is visual only**: no change to fishing rules, boat physics, `waves.ts`, the server or the economy, and no change to wave heights (physics and drawing share them).
3. The approved sky/cobalt/yellow look stays: midday, clear is the sea as it was, pixel for pixel in the render harness.

## Design

- A pure, tested module (`atmosphere.ts`, no Babylon) maps a UTC millisecond to an `Atmosphere`: sun and moon directions, sky, horizon and fog colours, fog density, light colours and intensities for the shaders and for Babylon's lights, cloud cover and gloom, rain, star visibility, water colours and a night glow, exposure, and the lighthouse lamp level. The same millisecond gives the same value everywhere; nothing in it has state.
- Keyframes are laid along the sun's height rather than the clock, and eased, so there is no jump anywhere and dawn and dusk are the same colours mirrored (dawn a little rosier). The weather is four numbers, so a cross-fade is an interpolation. Both properties are tested (a one-second sweep over three days in every weather, the edges of every slot, determinism, frequencies).
- One shared mutable `SEA` object (`sea-atmosphere.ts`) is rewritten once per frame without allocation, and the sky, water, swash, underwater skin, lights, fog, clear colour and (through the same scene and lights) the sea's mirror read it. Shaders hold its Color3/Vector3 objects as uniforms by reference. The old constants in `sea-style.ts` and `LIGHT` stay as the midday-clear defaults and a test pins the equality.
- The sky gains stars, a moon and weather-driven clouds; the water gains night glow, a moon glitter path, weather colours and rain rings (a fragment-level normal detail, never the mesh); rain is one mesh in one draw call; the lighthouse gets a halo and two sweeping beams at night. Details and the cost list are in `docs/ocean.md`, "Day, night and weather".
- **Default is the shared clock again** ([decision 0020](0020-gameplay-clock-and-conditions.md), 2026-11-26): for one day (2026-11-25, commit `42d02cd`) every player started at a clear noon (`DEFAULT_PIN`); that is reversed because the same clock now also sets the bites. `DEFAULT_PIN` stays as the noon the Settings card's first pin starts from, and browser tests start at it (`VITE_TEST_NOON`).
- **Pinning for development and tests**: `?daytime=<hour>` and `?weather=<kind>` in the page address, `pinAtmosphere()` for tools; the render harness takes both and defaults to noon, clear. Documented in `docs/ocean.md` and `tools/render-harness/README.md`.

## Consequences and limits

- Tests that read pixels or compare to the original look must pin the time (`?daytime=12&weather=clear`); browser tests started by `scripts/qa.mjs` and `scripts/test-browser.mjs` already start at a clear noon (`VITE_TEST_NOON=on`) because the sea follows the real clock.
- The sea's fog never gets thinner than before, so the reach of the water (`water-extent.ts`) is unchanged; rain and mist thicken it.
- A device with a wrong clock sees the wrong hour. The look follows the shared server clock (`this.sharedClock()`, the server's time plus an offset) since decision 0020. There is no rain sound.
- New shader and draw cost is logged under "Performance pass" in `docs/ocean.md`. Nothing here has run on a real phone; the pictures are software-rendered.
- Not done: moon phases, rotating stars, wet decks, other boats' lanterns beyond their own unlit mesh, a weather forecast in the HUD.
