import assert from "node:assert/strict";
import test from "node:test";
import {
  CAT_LOOKS,
  GRIP,
  ROWBOAT,
  catGeo,
  oarGeo,
  rowboatGeo,
} from "../src/ocean/cat-model.ts";
import { STROKE, stroke } from "../src/ocean/cat-boat.ts";

const bounds = (geo) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geo.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], geo.positions[i + k]);
      hi[k] = Math.max(hi[k], geo.positions[i + k]);
    }
  return { lo, hi };
};

test("a cat sits on its seat: about a metre tall with its ears, within a boat's width, small in triangles", () => {
  for (const look of CAT_LOOKS) {
    const geo = catGeo(look);
    const { lo, hi } = bounds(geo);
    assert.ok(lo[1] >= -0.001 && lo[1] < 0.05, `feet at ${lo[1]}`);
    assert.ok(hi[1] > 0.95 && hi[1] < 1.1, `tall ${hi[1]}`);
    assert.ok(hi[0] - lo[0] < 0.6, "narrow enough for two on a thwart");
    assert.ok(geo.triangles < 450, `triangles ${geo.triangles}`);
  }
});

test("an oar has its oarlock at the origin, the blade outboard and the handle inboard, on its own side", () => {
  for (const side of [1, -1]) {
    const { lo, hi } = bounds(oarGeo(side, CAT_LOOKS[0]));
    const outboard = side === 1 ? hi[0] : -lo[0];
    const inboard = side === 1 ? -lo[0] : hi[0];
    assert.ok(outboard > 1.9 && outboard < 2.2, `blade end ${outboard}`);
    assert.ok(inboard > GRIP && inboard < 0.6, `handle end ${inboard}`);
  }
});

test("the oarlocks sit beside the cats and outside the gunwale; the seat is within the boat", () => {
  assert.ok(ROWBOAT.lockX > ROWBOAT.seatX + 0.2);
  assert.ok(ROWBOAT.lockX >= ROWBOAT.halfBeam);
  assert.ok(ROWBOAT.seatX < ROWBOAT.halfBeam);
  const { lo, hi } = bounds(rowboatGeo());
  assert.ok(Math.abs(hi[2] - lo[2] - ROWBOAT.length) < 0.2);
  assert.ok(
    hi[0] <= ROWBOAT.halfBeam + 0.01 && lo[0] >= -ROWBOAT.halfBeam - 0.01,
  );
});

test("the stroke is periodic, the blade dips only in the drive, and the oars sweep both ways", () => {
  const a = stroke(0.3);
  const b = stroke(1.3);
  assert.ok(
    Math.abs(a.sweep - b.sweep) < 1e-9 && Math.abs(a.dip - b.dip) < 1e-9,
  );
  let min = Infinity;
  let max = -Infinity;
  let dipped = 0;
  for (let i = 0; i < 100; i++) {
    const s = stroke(i / 100);
    min = Math.min(min, s.sweep);
    max = Math.max(max, s.sweep);
    if (s.dip > 0) dipped++;
    assert.ok(s.dip >= 0 && s.dip <= 0.45 + 1e-9);
  }
  assert.ok(min < -0.4 && max > 0.4);
  assert.ok(dipped > 40 && dipped < 60);
  assert.ok(STROKE > 1);
});
