import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as hubCanvas from "../src/ui/hub-canvas.ts";
import { ART_H, ART_W, artLayout, waveY } from "../src/ui/hub-canvas.ts";
import { CHROME_COLORS } from "../src/app/chrome-color.ts";

test("landscape: the art covers the canvas and sits on its bottom edge", () => {
  for (const [w, h] of [
    [844, 390],
    [667, 375],
    [932, 430],
    [1280, 720],
  ]) {
    const { scale, x, y } = artLayout(w, h);
    assert.ok(ART_W * scale >= w - 1e-6, `${w}x${h}: covers the width`);
    assert.ok(ART_H * scale >= h - 1e-6, `${w}x${h}: covers the height`);
    assert.ok(Math.abs(y + ART_H * scale - h) < 1e-6, "bottom-anchored");
    assert.ok(x <= 1e-6 && x + ART_W * scale >= w - 1e-6, "centred sideways");
  }
  const exact = artLayout(844, 390);
  assert.equal(exact.scale, 1);
  assert.equal(exact.x, 0);
  assert.equal(exact.y, 0);
});

test("portrait: the boat and sun (x 270..670) stay on screen, bands above and below", () => {
  const { scale, x, y } = artLayout(390, 844);
  const left = x + 270 * scale;
  const right = x + 670 * scale;
  assert.ok(left >= -1 && right <= 390 + 1, `boat spans ${left}..${right}`);
  assert.ok(
    y > 0 && y + ART_H * scale < 844,
    "the art floats between two bands",
  );
});

test("a wave line is a smooth drift: the same shape, moved sideways", () => {
  const a = waveY(100, 232, 5, 260, 0, 0);
  const b = waveY(100 + 37, 232, 5, 260, 0, 37);
  assert.ok(
    Math.abs(a - b) < 1e-9,
    "shifting the wave moves it, it does not change it",
  );
  // One full period later it is the same height again.
  assert.ok(
    Math.abs(waveY(100, 232, 5, 260, 0, 0) - waveY(360, 232, 5, 260, 0, 0)) <
      1e-9,
  );
  // It stays within its amplitude (plus the second harmonic) of the centre line.
  for (let x = 0; x < 844; x += 7)
    assert.ok(Math.abs(waveY(x, 232, 5, 260, 0, 0) - 232) <= 5 * 1.35 + 1e-9);
});

test("Coastal Frosted Glass palette matches chrome harbor color and uses bright sky/sea", () => {
  const palette = hubCanvas.HUB_PALETTE;
  assert.ok(palette, "hub-canvas exports HUB_PALETTE");
  assert.equal(
    palette.skyTop,
    CHROME_COLORS.harbor,
    "top sky colour matches CHROME_COLORS.harbor",
  );
  assert.notEqual(
    palette.skyTop.toLowerCase(),
    "#4b3a8f",
    "old sunset violet is replaced by bright morning sky",
  );
  assert.equal(palette.waves.length, 4, "four sunlit wave layers");
});

test("harbor markup uses SVG icons instead of raw anchor or fish emojis", () => {
  const source = readFileSync(
    new URL("../src/app/harbor.ts", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes("⚓"), "no raw anchor emoji in harbor.ts");
  assert.ok(!source.includes("🐟"), "no raw fish emoji in harbor.ts");
  assert.ok(
    !source.includes("cá trong kho"),
    "harbor omits meaningless fish stock count",
  );
  assert.ok(
    source.includes("hub-sea"),
    "harbor renders icon-first live sea pill",
  );
  assert.ok(
    source.includes("countdownText"),
    "harbor uses compact MM:SS countdown for active event",
  );
});
