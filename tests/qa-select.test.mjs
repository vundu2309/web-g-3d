import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  failureBlock,
  tableTests,
  testsFor,
} from "../scripts/lib/qa-select.mjs";

const group = ["ocean-babylon", "ocean-input"];

test("a file with a row names its tests, not the group", () => {
  assert.deepEqual(testsFor(["src/app/big-map.ts"], group), {
    tests: ["ocean-map"],
    unmatched: [],
    notes: [],
  });
});

test("a relevant file with no row adds the group to the other picks", () => {
  const file = "src/ocean/babylon-scene.ts";
  assert.deepEqual(testsFor(["src/app/big-map.ts", file], group), {
    tests: ["ocean-map", ...group],
    unmatched: [file],
    notes: [],
  });
});

test("a shared file runs the group and the tests outside it", () => {
  const { tests, unmatched } = testsFor(["src/app/ocean.ts"], group);
  for (const name of [...group, "ocean-resume", "ocean-parked"])
    assert.ok(tests.includes(name), name);
  assert.deepEqual(unmatched, []);
});

test("the PWA test is named, never picked: it needs a build", () => {
  for (const file of ["tests/pwa-browser.mjs", "scripts/service-worker.js"]) {
    const { tests, notes } = testsFor([file], group);
    assert.ok(!tests.includes("pwa"), file);
    assert.match(notes.join(), /npm run build/, file);
  }
});

test("docs, SQL and unit tests pick nothing; a browser test picks itself", () => {
  const quiet = [
    "docs/ocean.md",
    "supabase/migrations/1.sql",
    "tests/ocean.test.mjs",
    ".claude/scratch-agent-board/server.mjs",
  ];
  assert.deepEqual(testsFor(quiet, group), {
    tests: [],
    unmatched: [],
    notes: [],
  });
  assert.deepEqual(testsFor(["tests/ocean-edge-browser.mjs"], group).tests, [
    "ocean-edge",
  ]);
});

test("a wrong use of --changed exits with 2, not like a failed test", () => {
  for (const argv of [
    ["ocean", "--list"],
    ["--changed", "--base", "no-such-ref", "--list"],
  ]) {
    const run = spawnSync(process.execPath, ["scripts/qa.mjs", ...argv], {
      encoding: "utf8",
    });
    assert.equal(run.status, 2, `${argv.join(" ")}: ${run.stderr}`);
  }
});

test("every test that imports a support file is picked when it changes", () => {
  for (const helper of ["fast-sea", "tap", "supabase-dev"]) {
    const users = readdirSync("tests")
      .filter(
        (file) =>
          file.endsWith("-browser.mjs") &&
          readFileSync(`tests/${file}`, "utf8").includes(
            `support/${helper}.mjs`,
          ),
      )
      .map((file) => file.replace("-browser.mjs", ""));
    const { tests } = testsFor([`tests/support/${helper}.mjs`], []);
    assert.ok(users.length, helper);
    for (const name of users) assert.ok(tests.includes(name), name);
  }
});

test("every test the table names exists", () => {
  for (const name of tableTests())
    assert.ok(existsSync(`tests/${name}-browser.mjs`), name);
});

test("a failure is shown whole, the assertion at its start included", () => {
  const output = `AssertionError: the gear opens Settings\n${"    at frame\n".repeat(400)}end\n`;
  const shown = failureBlock("first run", output);
  assert.match(
    shown,
    /first run:\n {4}AssertionError: the gear opens Settings/,
  );
  assert.ok(shown.endsWith("end"));
});
