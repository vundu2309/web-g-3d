import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RIPPLE_RANGE,
  RIPPLE_SIZE,
  rippleComponents,
  ripplePixels,
  rippleSlopeDeviation,
} from "../src/ocean/ripples.ts";

const pixels = ripplePixels();
const at = (x, y, c) => (pixels[(y * RIPPLE_SIZE + x) * 4 + c] - 127.5) / 127.5;

test("the ripple map is deterministic, RGBA and the size the shader expects", () => {
  assert.equal(pixels.length, RIPPLE_SIZE * RIPPLE_SIZE * 4);
  assert.deepEqual(ripplePixels(), pixels);
});

test("the ripple map tiles without a seam and averages to a flat sea", () => {
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    let inner = 0;
    let seam = 0;
    for (let y = 0; y < RIPPLE_SIZE; y++) {
      for (let x = 0; x < RIPPLE_SIZE; x++) sum += at(x, y, c);
      // The step across the wrap is no bigger than a step inside the tile.
      seam += Math.abs(at(0, y, c) - at(RIPPLE_SIZE - 1, y, c));
      inner += Math.abs(at(1, y, c) - at(0, y, c));
    }
    assert.ok(Math.abs(sum / RIPPLE_SIZE ** 2) < 0.01, `channel ${c} mean`);
    assert.ok(seam < inner * 1.5, `channel ${c} seam ${seam} inner ${inner}`);
  }
});

test("the stored slopes span the byte range without clipping much", () => {
  let clipped = 0;
  let square = 0;
  for (const v of pixels) {
    if (v === 0 || v === 255) clipped++;
    square += ((v - 127.5) / 127.5) ** 2;
  }
  const deviation = Math.sqrt(square / pixels.length);
  // One standard deviation is stored as 1 / RIPPLE_RANGE of the range.
  assert.ok(Math.abs(deviation * RIPPLE_RANGE - 1) < 0.2, `${deviation}`);
  assert.ok(clipped / pixels.length < 0.002, `${clipped} clipped`);
});

test("ripples run in a band around the wind, not one direction and not a grid", () => {
  const components = rippleComponents();
  assert.ok(components.length >= 40);
  const keys = new Set(components.map((c) => `${c.m},${c.n}`));
  assert.equal(keys.size, components.length, "distinct wave vectors");
  const angles = components.map((c) => Math.atan2(c.n, c.m));
  // Folded to a half circle (a wave and its opposite are one wave).
  const fold = (a) => Math.abs(Math.atan2(Math.sin(a), Math.abs(Math.cos(a))));
  const near = angles.filter((a) => fold(a) < 0.9).length;
  assert.ok(near / angles.length > 0.7, "most along the wind");
  const headings = new Set(angles.map((a) => Math.round(fold(a) * 10)));
  assert.ok(headings.size >= 8, `${headings.size} distinct headings`);
  const cycles = components.map((c) => Math.hypot(c.m, c.n));
  assert.ok(Math.min(...cycles) >= 2 && Math.max(...cycles) <= 23);
  assert.ok(rippleSlopeDeviation(components) > 0);
});

test("the water shader takes its ripples from two layers of the map, modulated by calm and rough patches", () => {
  const src = readFileSync(
    new URL("../src/ocean/water.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /uniform sampler2D rippleMap;/);
  assert.match(src, /samplers: \["rippleMap"\]/);
  const layers =
    src.match(/rippleLayer\(q, \$\{glslAxis\((-?[\d.]+)\)\}, ([\d.]+),/g) ?? [];
  assert.equal(layers.length, 2, "two ripple layers");
  const parsed = layers.map((l) =>
    l.match(/glslAxis\((-?[\d.]+)\)\}, ([\d.]+)/),
  );
  assert.notEqual(parsed[0][1], parsed[1][1], "turned differently");
  assert.notEqual(parsed[0][2], parsed[1][2], "different sizes");
  assert.match(src, /choppy/);
  // The old crossing cosine ripples (a visible grid) are gone.
  assert.doesNotMatch(src, /cos\(dot\(q, vec2/);
});
