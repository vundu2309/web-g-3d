# Render harness

Screenshots of the real sea game (water, sky, the three islands with their Blender props, markets,
sea props, a boat and the reflection pass) from fixed cameras, so a visual change can be shown as
before/after images. It is a development tool only: nothing here is built into the game.

The pictures are drawn with **software WebGL** (SwiftShader) in Chrome. They show what the code draws;
they are not evidence of how it looks or performs on a phone.

## Use

From the repository root (`npm ci` has been run; Chrome is installed):

```bash
npx vite --port 5193 --strictPort
```

in one terminal, then in another:

```bash
node tools/render-harness/shoot.mjs 5193 /tmp/out before chase,0,0,4 low,1,90,4 beach,0,30,4
```

Each spec is `mode,island,angleDeg,seconds`:

| mode           | camera                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `chase`        | the game's default chase camera (17.5 m behind, 9.6 m high) beside island `i`, at `angle` around it |
| `low`          | the closer fishing camera                                                                           |
| `beach`        | a metre or two above the sand, looking along the shore                                              |
| `surf`         | close to the waterline, looking at the breakers                                                     |
| `top`          | from above the beach                                                                                |
| `hut`, `grove` | the stilt hut / a palm seen from the sea / the beach                                                |
| `high`         | a 22 m camera looking at the horizon (edge-of-the-sea check)                                        |
| `wide`         | a very high wide view of all the islands                                                            |

`seconds` sets the sea clock, so four shots one second apart (`t = 4, 5, 6, 7`) show the surf moving.
`REFL=0` skips the reflection pass (much faster), `WORKERS` sets how many shots run at once,
`CHROMIUM_PATH` picks another Chrome. The page itself is `preview.html`; its query parameters are
`m`, `i`, `a`, `t`, `refl=0` (no reflection) and `models=0` (procedural props instead of the GLBs).

## Rules

- Take **before** images first (tag `before`), change the code, then take **after** images with the same specs.
- Do not edit source files while a Vite server is serving a browser test: Vite reloads the page and the test fails.
- Delete the output folder when done; the images are not committed.
- The browser tests of the game are separate: see `tests/*-browser.mjs` and `docs/agent-briefs.md`.
