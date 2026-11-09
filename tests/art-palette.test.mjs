import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every object colour of the sea game comes from src/ocean/art/colors.ts by role. A hex of
// its own in a visual file is how the look drifted apart, so the files already moved over
// may not grow one again (the 0x6d2b79f5 constant is a random-number step, not a colour).
const MIGRATED = [
  "boat-visual.ts",
  "rod-visual.ts",
  "sea-props.ts",
  "island-visual.ts",
  "island-props.ts",
];

test("migrated visual files take their colours from the shared palette", () => {
  for (const file of MIGRATED) {
    const source = readFileSync(`src/ocean/${file}`, "utf8");
    const raw = (source.match(/0x[0-9a-fA-F]{6}\b/g) ?? []).filter(
      (hex) => hex.toLowerCase() !== "0x6d2b79f5",
    );
    assert.deepEqual(
      raw,
      [],
      `${file} has colours of its own: ${raw.join(", ")}`,
    );
    assert.ok(source.includes("art/colors"), `${file} imports the palette`);
  }
});

test("the shared palette has no duplicate colours under two names", () => {
  const source = readFileSync("src/ocean/art/colors.ts", "utf8");
  const seen = new Map();
  for (const [, hex] of source.matchAll(/(0x[0-9a-fA-F]{6})/g)) {
    seen.set(hex.toLowerCase(), (seen.get(hex.toLowerCase()) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([hex]) => hex);
  assert.deepEqual(dupes, [], `colours written twice: ${dupes.join(", ")}`);
});
