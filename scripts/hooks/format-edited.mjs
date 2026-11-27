// Claude Code PostToolUse hook (.claude/settings.json): format the file an edit has just changed, with the
// same scope as `npm run format`. The hook's JSON arrives on stdin. The file may be in another worktree of
// this repository (CLAUDE_PROJECT_DIR stays where the session started), so the root is taken from the file.
// Files outside the scope or the repository are left alone. Exit 2 shows the message to the session.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCOPE = [
  "src",
  "tests",
  "scripts",
  "server",
  "eslint.config.js",
  "vite.config.ts",
];

// The top of the checkout that holds `directory`, and the git folder its worktrees share.
function checkout(directory) {
  try {
    const [top, common] = execFileSync(
      "git",
      ["rev-parse", "--show-toplevel", "--git-common-dir"],
      { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\n");
    return { top, common: realpathSync(path.resolve(directory, common)) };
  } catch {
    return undefined;
  }
}

function format(file) {
  if (!file || !existsSync(file)) return;
  const real = realpathSync(file);
  const here = checkout(path.dirname(fileURLToPath(import.meta.url)));
  const there = checkout(path.dirname(real));
  if (!here || !there || here.common !== there.common) return;
  const relative = path.relative(there.top, real);
  if (!SCOPE.includes(relative.split(path.sep)[0])) return;
  let prettier;
  try {
    prettier = path.join(
      path.dirname(
        createRequire(import.meta.url).resolve("prettier/package.json"),
      ),
      "bin/prettier.cjs",
    );
  } catch {
    return; // No dependencies installed here; `npm run format:check` in CI still applies.
  }
  const run = spawnSync(
    process.execPath,
    [prettier, "--write", "--ignore-unknown", "--log-level", "warn", relative],
    { cwd: there.top, encoding: "utf8" },
  );
  if (run.status !== 0) {
    console.error(`[format] prettier failed on ${relative}:\n${run.stderr}`);
    process.exitCode = 2;
  }
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  input = undefined;
}
format(input?.tool_input?.file_path);
