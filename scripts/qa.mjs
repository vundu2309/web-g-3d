// One command to run the browser tests the way they must be run on this Mac: a Vite server on
// 127.0.0.1 and its own port, system Chrome, a time limit per test (there is no `timeout`
// command on macOS), and one rerun of a failing test ALONE (the timing checks of
// ocean-fishing and ocean-babylon are flaky under software WebGL). Reports both outcomes.
//
//   node scripts/qa.mjs ocean-fishing ocean-cast          # tests/<name>-browser.mjs
//   node scripts/qa.mjs ocean                              # the ocean group
//   node scripts/qa.mjs --cwd ../web-g-3d-wt/foo ocean-babylon   # in a worktree
//   node scripts/qa.mjs --changed                        # the tests that fit the files changed
//                                                          # since origin/main (--base ref)
//   node scripts/qa.mjs --changed --list                 # only name them
//   options: --port N  --timeout SECONDS (default 600)  --no-rerun
//
// A failing run's whole output is printed.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { CHROME, startVite, TEST_ENV } from "./lib/dev.mjs";
import { failureBlock, testsFor } from "./lib/qa-select.mjs";

const GROUPS = {
  ocean: [
    "ocean-babylon",
    "ocean-fishing",
    "ocean-cast",
    "ocean-market",
    "ocean-server-store",
    "ocean-rank",
    "ocean-book",
    "ocean-event",
    "ocean-quests",
    "ocean-planes",
    "ocean-edge",
    "ocean-fade",
    "ocean-input",
    "ocean-steer",
    "ocean-stick",
    "ocean-audio",
  ],
};
function fileOf(name) {
  return name.endsWith(".mjs") ? name : `tests/${name}-browser.mjs`;
}
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  return args.splice(i, 2)[1];
};
let cwd = path.resolve(opt("--cwd", process.cwd()));
const port = opt("--port") ? Number(opt("--port")) : undefined;
const seconds = Number(opt("--timeout", 600));
const baseGiven = args.includes("--base");
const base = opt("--base", "origin/main");
const rerun = !args.includes("--no-rerun");
const changed = args.includes("--changed");
const list = args.includes("--list");
const names = args
  .filter((a) => !a.startsWith("--"))
  .flatMap((a) => GROUPS[a] ?? [a]);
const usageError = (message) => {
  console.error(`qa: ${message}`);
  process.exit(2);
};
if (!changed && (list || baseGiven))
  usageError("--list and --base need --changed");
if (changed) {
  const git = (at, ...argv) =>
    execFileSync("git", argv, {
      cwd: at,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\0")
      .filter(Boolean);
  let files;
  try {
    // Paths are relative to the top of the checkout, also when qa runs from a folder inside it.
    cwd = git(cwd, "rev-parse", "--show-toplevel")[0].trim();
    const from = git(cwd, "merge-base", base, "HEAD")[0].trim();
    // Committed on this branch, not yet committed, and new files; a renamed file counts at both paths.
    files = [
      ...git(cwd, "diff", "-z", "--name-only", "--no-renames", from),
      ...git(cwd, "ls-files", "-z", "--others", "--exclude-standard"),
    ];
  } catch (error) {
    usageError(
      `cannot list the changes since ${base}: ${String(error.stderr || error.message).trim()}`,
    );
  }
  const picked = testsFor(files, GROUPS.ocean);
  // A deleted test is in the diff but cannot be run.
  for (const name of picked.tests)
    if (!names.includes(name) && existsSync(path.join(cwd, fileOf(name))))
      names.push(name);
  if (picked.unmatched.length)
    console.log(
      `qa: the ocean group, because no row fits: ${picked.unmatched.join(", ")}`,
    );
  console.log(
    `qa: changed since ${base}: ${names.length ? names.join(" ") : "no browser test fits"}`,
  );
  for (const note of picked.notes) console.log(`qa: ${note}`);
  if (list || !names.length) process.exit(0);
}
if (!names.length) {
  console.error(
    "usage: node scripts/qa.mjs [--cwd dir] <test-name|ocean>... | --changed [--base ref] [--list]",
  );
  process.exit(2);
}
for (const name of names)
  if (!existsSync(path.join(cwd, fileOf(name)))) {
    console.error(`no such test: ${fileOf(name)} in ${cwd}`);
    process.exit(2);
  }

const server = await startVite({ cwd, port, env: TEST_ENV });
console.log(`qa: ${cwd} served at ${server.url}`);

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [fileOf(name)], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TEST_BASE_URL: server.url,
        CHROMIUM_PATH: CHROME,
      },
    });
    // The whole output; the cap only guards against a test that logs without end.
    let output = "";
    const keep = (chunk) => {
      output += chunk;
      if (output.length > 200_000)
        output = `[qa] the start is cut off\n${output.slice(-200_000)}`;
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => {
      output += `\n[qa] killed after ${seconds} s`;
      child.kill("SIGKILL");
    }, seconds * 1000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        seconds: Math.round((Date.now() - started) / 1000),
        output,
      });
    });
  });
}

const rows = [];
for (const name of names) {
  const first = await run(name);
  const row = { name, first };
  if (first.code !== 0 && rerun) row.second = await run(name);
  rows.push(row);
  const verdict =
    first.code === 0
      ? "pass"
      : row.second?.code === 0
        ? "FLAKY (failed, then passed alone)"
        : "FAIL";
  console.log(`${verdict.padEnd(34)} ${name} (${first.seconds} s)`);
  if (first.code !== 0) console.log(failureBlock("first run", first.output));
  if (row.second && row.second.code !== 0)
    console.log(failureBlock("rerun", row.second.output));
}
server.stop();
const failed = rows.filter((r) => (r.second ?? r.first).code !== 0);
console.log(
  `qa: ${rows.length - failed.length}/${rows.length} passed` +
    (rows.some((r) => r.first.code !== 0 && r.second?.code === 0)
      ? " (some only on the rerun: timing-sensitive, report both outcomes)"
      : ""),
);
// Not process.exit: it would cut a long piped output off before it is written.
process.exitCode = failed.length ? 1 : 0;
