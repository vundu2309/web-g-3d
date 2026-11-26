# 0019. NPC seaplanes towing a banner for the game

Date: 2026-11-25. Status: built and tested locally. The user asked for "npc các thuỷ phi cơ kéo theo băng rôn quảng bá về trò chơi bay lượn và chuyển hướng random trên bầu trời". The first version flew each device's own planes; the user rejected that ("đây là game online"): **what every player sees must be the same.** This is the second version.

## Decision

- A few NPC seaplanes fly over the sea, each towing a banner that says "RA KHƠI CÙNG BẠN" (the game's name in the page title), and change direction at random.
- **Every player sees the same planes at the same places**, on the same shared clock as the rowing cats ([cat-routes.ts](../../src/ocean/cat-routes.ts)): the server's time the app already follows, nothing sent over the network.
- **Random, yet the same everywhere.** A flight is a seeded random flight (`plane-flight.ts`); its seed comes from the plane and the number of its flight; a flight lasts a fixed time on the shared clock. A device replays the flight from its start in fixed 0.25 s steps and then follows the clock (`plane-plan.ts`). A closed-form path would repeat; a replay from a fixed epoch would be too slow; a flight per cycle replays in about a millisecond a plane.
- **The seam is out of sight.** A flight begins on a ring 2,300 m out, heading in, and ends by flying out over the edge, so the jump to the next flight happens where no boat can see it.
- **All eight are simulated, the nearest three are drawn**, as with the cats. A device that cannot see a plane still knows where it is.
- **Built in code, not in Blender**: a seaplane of 1,052 triangles from the shared `Parts` builder and palette colours, like the code-built boat; the banner is one small mesh with a canvas texture. The download is unchanged (no new model file).
- The planes are a cost added for looks: `?planes=0` switches them off, they are left out of the water mirror, and the cost is written in `docs/ocean.md` ("Banner seaplanes").

## Changes after the first play test (2026-11-25)

The user played it and rarely saw a plane, and asked about night. Measured: planes roamed one 1.8 km area, so near a player they were few, high and tiny. Three changes, all agreed with the user: **(1)** each plane has a home (the harbour, with three planes, and the nearest islands) and roams within 450 m of it, lower (50 to 85 m); at the harbour a plane is now within 200 m 44 % of the time instead of 21 %; a phone draws three planes within 450 m, a desktop four within 600 m. **(2)** At night the planes carry red and green wing-tip lights, a white tail light and a flashing white strobe, and the banner is lit from within (it dims by a quarter, not by 60 %). **(3)** Twelve planes instead of eight (only the nearest are drawn, so the added cost is the simulation, a few microseconds a frame).

## Fade at the edge of the range (2026-11-25)

The user noticed planes vanishing suddenly when they sailed away: a plane was switched off at the draw range. Now it dissolves by dithered fade, as the animals do: a distance taper over the last 160 m of the range and a time fade (1.5 s in, 1 s out) when the set of drawn planes changes (`distance-fade.ts`). The plane, propeller and banner use the dithered tile fade; the glow of the lights shrinks.

## Limits

- **Same places within the clock's error.** Devices follow the server clock to within some tens of milliseconds, so a plane at about 25 m/s can differ by a metre or two between two screens. `Math.sin` and friends may differ in the last bit between browser engines; the flight depends on them only continuously (never on a threshold they decide), so the difference stays far below a millimetre. Two Chromium browsers were compared; Safari and Firefox were not.
- **A burst when entering the sea**: the replay (5 to 11 ms on a laptop for all eight, a phone is slower and was not measured) happens once, and again when a hidden tab comes back.
- No governor gives the planes up automatically; the page switch is the only way. Not measured on a phone.
- The banner text is fixed in code (`BANNER_TEXT`); it is not an advertising system and nothing is fetched or tracked.
- Planes do not avoid islands or the lighthouse (they fly at 55 to 100 m); they cast no shadow and make no sound.
