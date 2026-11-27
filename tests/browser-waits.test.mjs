import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// Playwright's waitForFunction takes the promise of an async predicate as true at once (seen with
// playwright-core 1.64.1), so such a wait checks nothing. Poll page.evaluate instead.
// Only an inline `async` predicate is caught, not one passed by name or a function returning a promise.
test("no async predicate in waitForFunction", () => {
  const files = readdirSync("tests", { recursive: true }).filter(
    (file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"),
  );
  assert.ok(files.includes("pwa-browser.mjs"), "the browser tests are scanned");
  const found = files.flatMap((file) => {
    const source = readFileSync(`tests/${file}`, "utf8");
    return [...source.matchAll(/waitForFunction\(\s*async\b/g)].map(
      (match) =>
        `tests/${file}:${source.slice(0, match.index).split("\n").length}`,
    );
  });
  assert.deepEqual(found, []);
});
