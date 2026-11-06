import assert from "node:assert/strict";
import test from "node:test";
import {
  fishPose,
  lineColour,
  lineSag,
  lineTremble,
} from "../src/ocean/fight-look.ts";

const view = (mood, extra = {}) => ({
  mood,
  tension: 0.3,
  distance: 12,
  stamina: 0.6,
  reeling: false,
  progress: 0.4,
  elapsed: 3,
  ...extra,
});

test("the line goes from white through yellow to red as tension climbs", () => {
  const slack = lineColour(0);
  const taut = lineColour(0.55);
  const edge = lineColour(0.95);
  assert.deepEqual(slack, { r: 1, g: 1, b: 1 });
  assert.ok(taut.b < 0.5 && taut.g > 0.7, "yellow when taut");
  assert.ok(edge.g < taut.g && edge.b < 0.3, "red near the snap");
});

test("the tremble grows and the sag shrinks with tension", () => {
  assert.ok(lineTremble(0.9) > lineTremble(0.4));
  assert.ok(lineTremble(0.4) >= lineTremble(0.1));
  assert.ok(lineSag(0) > lineSag(0.3));
  assert.ok(lineSag(0.6) < 0.1);
});

test("a surging fish thrashes and splashes; a tired one lies on its side quietly", () => {
  const surge = fishPose(view("surge"), 1);
  const tired = fishPose(view("tired"), 1);
  assert.equal(surge.splash, 1);
  assert.equal(tired.splash, 0);
  assert.ok(surge.beat > tired.beat * 4);
  assert.ok(tired.roll > surge.roll || tired.roll > 0.5);
  assert.equal(surge.distance, 12);
});

test("a running fish swings the line much farther than a steady one, and a tired fish hardly moves", () => {
  const amp = (mood) => {
    let max = 0;
    for (let t = 0; t < 8; t += 0.01)
      max = Math.max(max, Math.abs(fishPose(view(mood), t).swing));
    return max;
  };
  assert.ok(amp("surge") > amp("strong") * 1.5);
  assert.ok(amp("strong") > amp("tired") * 2);
});
