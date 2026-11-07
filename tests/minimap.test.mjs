import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_RANGE,
  arrowPoints,
  islandsOnMap,
  toMap,
} from "../src/ocean/minimap-math.ts";
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
