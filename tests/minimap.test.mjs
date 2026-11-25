import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_RANGE,
  PLACES,
  arrowPoints,
  distanceText,
  islandsOnMap,
  mapPlaces,
  playersOnMap,
  toMap,
} from "../src/ocean/minimap-math.ts";
import { MARKETS } from "../src/ocean/market.ts";
import { SHIPYARDS } from "../src/ocean/shipyard.ts";
import { HARBOR } from "../src/ocean/model.ts";
import { SEA_BOUND, islands } from "../src/ocean/model.ts";
import { boatPalettes, hullCss, paletteIndex } from "../src/ocean/palette.ts";

test("the map shows the whole sea with north up and east to the right", () => {
  const size = 200;
  const middle = toMap(0, 0, size);
  assert.equal(middle.x, size / 2);
  assert.equal(middle.y, size / 2);
  // East (+X) is to the right, and north (-Z, where heading 0 points) is up.
  assert.ok(toMap(50, 0, size).x > middle.x);
  assert.ok(toMap(0, -50, size).y < middle.y);
  // The sea wall is inside the map with a margin all round.
  const corner = toMap(-SEA_BOUND, -SEA_BOUND, size);
  assert.ok(corner.x > 0 && corner.y > 0);
  assert.ok(MAP_RANGE > SEA_BOUND);
  const far = toMap(SEA_BOUND, SEA_BOUND, size);
  assert.ok(far.x < size && far.y < size);
});

test("every island is on the map at its place and in proportion", () => {
  const size = 240;
  const on = islandsOnMap(size);
  assert.equal(on.length, islands.length);
  islands.forEach((island, i) => {
    const at = toMap(island.x, island.z, size);
    assert.equal(on[i].x, at.x);
    assert.equal(on[i].y, at.y);
    assert.ok(
      Math.abs(on[i].radius - (island.radius * size) / (2 * MAP_RANGE)) < 1e-9,
    );
    assert.ok(on[i].radius > 1, "big enough to see");
  });
});

test("a boat marker points the way the boat heads", () => {
  const c = { x: 100, y: 100 };
  const north = arrowPoints(c, 0, 10);
  assert.ok(
    north[0].y < c.y - 9 && Math.abs(north[0].x - c.x) < 1e-9,
    "heading 0 is up",
  );
  const east = arrowPoints(c, Math.PI / 2, 10);
  assert.ok(
    east[0].x > c.x + 9 && Math.abs(east[0].y - c.y) < 1e-9,
    "a quarter turn is right",
  );
  const south = arrowPoints(c, Math.PI, 10);
  assert.ok(south[0].y > c.y + 9);
  // The two back corners sit behind the tip, on either side.
  assert.ok(north[1].y > c.y && north[2].y > c.y);
  assert.ok(Math.min(north[1].x, north[2].x) < c.x);
  assert.ok(Math.max(north[1].x, north[2].x) > c.x);
});

test("a player's colour is the same everywhere and always one of the boat colours", () => {
  for (const uid of ["a", "me", "user-123", "Lan <b>"]) {
    assert.equal(paletteIndex(uid), paletteIndex(uid));
    assert.ok(
      paletteIndex(uid) >= 0 && paletteIndex(uid) < boatPalettes.length,
    );
    assert.match(hullCss(uid), /^#[0-9a-f]{6}$/);
  }
});

test("an island's shore wobbles around a circle and stays a closed ring of its own", async () => {
  const { coastFactor, coastPoints } = await import(
    "../src/ocean/minimap-math.ts"
  );
  const { islandShape } = await import("../src/ocean/island-shape.ts");
  const { islandSeed } = await import("../src/ocean/shore.ts");
  const { islands } = await import("../src/ocean/model.ts");
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    const f = coastFactor(0, a);
    assert.ok(f > 0.75 && f < 1.25, `factor ${f} stays near 1`);
  }
  // The map's coast is the real one the 3D island is built on, not a made-up wobble.
  islands.forEach((island, index) => {
    const shape = islandShape(islandSeed(index), island.radius);
    for (let a = 0; a < Math.PI * 2; a += 0.05)
      assert.ok(
        Math.abs(coastFactor(index, a) * island.radius - shape.coast(a)) < 0.02,
        `island ${index} at ${a}`,
      );
  });
  const points = coastPoints({ x: 50, y: 50 }, 10, 1, 1);
  assert.equal(points.length, 48);
  assert.notDeepEqual(points, coastPoints({ x: 50, y: 50 }, 10, 2, 1));
  // Scaling shrinks it toward the centre.
  const small = coastPoints({ x: 50, y: 50 }, 10, 1, 0.5);
  assert.ok(
    Math.hypot(small[0].x - 50, small[0].y - 50) <
      Math.hypot(points[0].x - 50, points[0].y - 50),
  );
});

test("the big map names the harbor, every market and every shipyard, numbered once and for good", () => {
  assert.equal(PLACES.length, 1 + MARKETS.length + SHIPYARDS.length);
  assert.deepEqual(
    PLACES.map((p) => p.number),
    PLACES.map((_, i) => i + 1),
    "1 to N in a fixed order",
  );
  assert.deepEqual(
    PLACES.map((p) => p.kind),
    ["harbor", ...MARKETS.map(() => "market"), ...SHIPYARDS.map(() => "yard")],
  );
  assert.equal(PLACES[0].name, "Bến cảng");
  assert.deepEqual(
    PLACES.slice(1, 1 + MARKETS.length).map((p) => p.name),
    MARKETS.map((m) => m.name),
  );
  assert.deepEqual(
    PLACES.slice(1 + MARKETS.length).map((p) => p.name),
    SHIPYARDS.map((y) => y.name),
  );
  assert.equal(
    new Set(PLACES.map((p) => p.name)).size,
    PLACES.length,
    "no two share a name",
  );
  for (const p of PLACES) {
    assert.ok(p.name.length > 0 && p.name.length <= 24, p.name);
    assert.ok(
      Math.abs(p.x) < MAP_RANGE && Math.abs(p.z) < MAP_RANGE,
      `${p.name} is on the map`,
    );
  }
});

test("the places come nearest first with their distance in metres, and the numbers do not move with the boat", () => {
  const at = { x: HARBOR.x, z: HARBOR.z };
  const here = mapPlaces(at);
  assert.equal(
    here[0].name,
    "Bến cảng",
    "from the harbor the harbor is nearest",
  );
  assert.equal(here[0].meters, 0);
  for (let i = 1; i < here.length; i++)
    assert.ok(here[i].meters >= here[i - 1].meters, "sorted by distance");
  // Far to the west the order changes but every place keeps its number.
  const far = mapPlaces({ x: -1200, z: 0 });
  assert.notDeepEqual(
    far.map((p) => p.name),
    here.map((p) => p.name),
  );
  for (const p of far)
    assert.equal(p.number, PLACES.find((q) => q.name === p.name).number);
  const market = MARKETS[0];
  const from = { x: market.x + 300, z: market.z + 400 };
  assert.equal(
    mapPlaces(from).find((p) => p.name === market.name).meters,
    500,
    "3-4-5: 500 m",
  );
});

test("a distance is metres up to 999 and kilometres with a decimal comma after", () => {
  assert.equal(distanceText(0), "0 m");
  assert.equal(distanceText(320), "320 m");
  assert.equal(distanceText(999), "999 m");
  assert.equal(distanceText(1000), "1,0 km");
  assert.equal(distanceText(1234), "1,2 km");
  assert.equal(distanceText(2950), "3,0 km");
  assert.equal(distanceText(-4), "0 m");
});

test("the map shows players only: not the patrol ships (npc), not the player's own boat", () => {
  const boats = [
    { uid: "me", x: 0, z: 0 },
    { uid: "lan", x: 1, z: 1 },
    { uid: "dai", x: 2, z: 2, offline: true },
    { uid: "npc:patrol-0", x: 3, z: 3, npc: true },
    { uid: "npc:patrol-3", x: 4, z: 4, npc: true },
  ];
  assert.deepEqual(
    playersOnMap(boats, "me").map((b) => b.uid),
    ["lan", "dai"],
    "the others, including a boat parked where its player left it",
  );
  assert.deepEqual(
    playersOnMap(boats, undefined).map((b) => b.uid),
    ["me", "lan", "dai"],
  );
  assert.deepEqual(playersOnMap([], "me"), []);
});

test("the sea screen feeds the maps with players only (the patrol ships and the cats are left out)", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/app/ocean.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    source.includes("playersOnMap(shown, connection?.uid)"),
    "the maps get the players",
  );
  assert.ok(
    !source.includes("catBoats()"),
    "the rowing cats are not drawn on the map",
  );
});
