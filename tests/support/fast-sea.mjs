// Page-address switches (src/ocean/probe.ts) that leave out the parts of the sea a test does not look at,
// so the scene boots faster under software WebGL. Measured on tests/ocean-map-browser.mjs on 2026-11-26:
// one boot of the sea went from 10 to 15 s down to about 5.5 s, and the whole test from 77.5 s to 39.2 s.
//
// Use it ONLY in a test whose assertions do not depend on the water's reflection, the fish, the island props,
// the big boats, the cats, the seaplanes, the shipyards or the full render resolution. A test that checks any
// of those must not add it. The default (no switches) is still what every other test, and the player, gets.
export const FAST_SEA =
  "&reflect=0&fish=0&props=0&tiers=0&cats=0&planes=0&yards=0&scale=1";
