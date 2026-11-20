// One command to run the browser tests the way they must be run on this Mac: a Vite server on
// 127.0.0.1 and its own port, system Chrome, a time limit per test (there is no `timeout`
// command on macOS), and one rerun of a failing test ALONE (the timing checks of
// ocean-fishing and ocean-babylon are flaky under software WebGL). Reports both outcomes.
//
//   node scripts/qa.mjs ocean-fishing ocean-cast          # tests/<name>-browser.mjs
//   node scripts/qa.mjs ocean                              # the ocean group
//   node scripts/qa.mjs --cwd ../web-g-3d-wt/foo ocean-babylon   # in a worktree
//   options: --port N  --timeout SECONDS (default 600)  --no-rerun
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { CHROME, startVite, TEST_ENV } from "./lib/dev.mjs";

const GROUPS = {
  ocean: [
    "ocean-babylon",
    "ocean-fishing",
    "ocean-cast",
    "ocean-market",
    "ocean-server-store",
    "ocean-rank",
    "ocean-input",
    "ocean-steer",
    "ocean-stick",
  ],
};
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  return args.splice(i, 2)[1];
};
const cwd = path.resolve(opt("--cwd", process.cwd()));
const port = opt("--port") ? Number(opt("--port")) : undefined;
const seconds = Number(opt("--timeout", 600));
const rerun = !args.includes("--no-rerun");
const names = args
  .filter((a) => !a.startsWith("--"))
  .flatMap((a) => GROUPS[a] ?? [a]);
if (!names.length) {
  console.error("usage: node scripts/qa.mjs [--cwd dir] <test-name|ocean>...");
  process.exit(2);
}
const fileOf = (name) =>
  name.endsWith(".mjs") ? name : `tests/${name}-browser.mjs`;
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
    let tail = "";
    const keep = (chunk) => (tail = (tail + chunk).slice(-1500));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => {
      tail += `\n[qa] killed after ${seconds} s`;
      child.kill("SIGKILL");
    }, seconds * 1000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        seconds: Math.round((Date.now() - started) / 1000),
        tail: tail.trim(),
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
  if (first.code !== 0)
    console.log(
      `  first run: ${first.tail.split("\n").slice(-4).join("\n  ")}`,
    );
  if (row.second && row.second.code !== 0)
    console.log(
      `  rerun:     ${row.second.tail.split("\n").slice(-4).join("\n  ")}`,
    );
}
server.stop();
const failed = rows.filter((r) => (r.second ?? r.first).code !== 0);
console.log(
  `qa: ${rows.length - failed.length}/${rows.length} passed` +
    (rows.some((r) => r.first.code !== 0 && r.second?.code === 0)
      ? " (some only on the rerun: timing-sensitive, report both outcomes)"
      : ""),
);
process.exit(failed.length ? 1 : 0);
