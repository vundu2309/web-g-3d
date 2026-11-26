import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The sky dome has `infiniteDistance`: Babylon puts it on the camera by itself (its world position
// is the camera's PLUS its own `position`). Setting its position to the camera's as well doubled the
// offset, and past about 1,200 m from the middle of the sea (the dome's radius) the camera was
// outside the dome and the sky showed its edge as a white shape. The browser test `ocean-edge`
// checks the real position; this guards the source.
const source = readFileSync(
  new URL("../src/ocean/sky.ts", import.meta.url),
  "utf8",
);

test("the dome's own position stays zero: it is never set to the camera's", () => {
  assert.match(source, /mesh\.position\.setAll\(0\)/);
  assert.match(source, /mesh\.infiniteDistance = true/);
  assert.doesNotMatch(source, /mesh\.position\.set\(/);
  assert.doesNotMatch(source, /mesh\.position\.(x|y|z)\s*=/);
});

test("the update takes only the clock: nothing about the camera reaches the dome", () => {
  assert.match(source, /update\(time: number\): void/);
});
