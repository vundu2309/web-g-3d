import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/check-work-record.mjs");
// No user or system git settings: signing, hooks and templates stay out of the way.
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.test",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.test",
};

// A throwaway repository with one commit, tagged "base".
function repo(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "work-record-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const commit = (message, files) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.join(cwd, path.dirname(file)), { recursive: true });
      writeFileSync(path.join(cwd, file), text);
    }
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const check = (...range) =>
    spawnSync(
      process.execPath,
      [script, ...(range.length ? range : ["base"])],
      {
        cwd,
        env,
        encoding: "utf8",
      },
    );
  git("init", "-q", "-b", "main");
  commit("start", {
    "README.md": "x\n",
    "docs/work/2026-01-01-old.md": "old\n",
  });
  git("tag", "base");
  return { cwd, git, commit, check };
}

for (const folder of ["src", "server", "supabase", "tests", "scripts"])
  test(`a change under ${folder}/ with no record fails and is named`, (t) => {
    const { commit, check } = repo(t);
    const sha = commit("change the game", { [`${folder}/a.txt`]: "1\n" });
    const run = check();
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stderr, new RegExp(sha.slice(0, 7)));
    assert.match(run.stderr, new RegExp(`${folder}/a\\.txt`));
    assert.match(run.stderr, /No work record: <reason>/);
  });

test("a record anywhere in the range covers it", (t) => {
  const { commit, check } = repo(t);
  commit("change the game", { "src/a.ts": "1\n" });
  commit("write it up", { "docs/work/2026-01-02-new.md": "new\n" });
  const run = check();
  assert.equal(run.status, 0, run.stderr);
});

test("updating an existing record counts", (t) => {
  const { commit, check } = repo(t);
  commit("change the game", {
    "src/a.ts": "1\n",
    "docs/work/2026-01-01-old.md": "more\n",
  });
  assert.equal(check().status, 0);
});

test("the template, the README, a deletion and other docs are not a record", (t) => {
  const { git, commit, check } = repo(t);
  git("rm", "-q", "docs/work/2026-01-01-old.md");
  commit("change the game", {
    "src/a.ts": "1\n",
    "docs/work/_template.md": "t\n",
    "docs/work/README.md": "r\n",
    "docs/ocean.md": "o\n",
  });
  const run = check();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /src\/a\.ts/);
});

test("moving a file out of src/ is a change under src/", (t) => {
  const { git, commit } = repo(t);
  commit("add", { "src/a.ts": "a long enough line to be seen as a move\n" });
  git("tag", "-f", "base");
  git("mv", "src/a.ts", "a.ts");
  const run = spawnSync(process.execPath, [script, "base"], {
    cwd: git("rev-parse", "--show-toplevel"),
    env,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, "nothing is committed yet");
  commit("move it", {});
  const after = spawnSync(process.execPath, [script, "base"], {
    cwd: git("rev-parse", "--show-toplevel"),
    env,
    encoding: "utf8",
  });
  assert.equal(after.status, 1, after.stderr);
});

test("the exception in the commit message passes, only for its own commit", (t) => {
  const { commit, check } = repo(t);
  commit("fix a typo\n\nNo work record: a typo in a comment", {
    "src/a.ts": "1\n",
  });
  assert.equal(check().status, 0);
  const sha = commit("change the game", { "src/b.ts": "2\n" });
  const run = check();
  assert.equal(run.status, 1);
  assert.match(run.stderr, new RegExp(sha.slice(0, 7)));
  assert.doesNotMatch(run.stderr, /src\/a\.ts/);
});

test("the exception needs a reason", (t) => {
  const { commit, check } = repo(t);
  commit("change\n\nNo work record:", { "src/a.ts": "1\n" });
  commit("change\n\nNo work record: <reason>", { "src/b.ts": "1\n" });
  const run = check();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /src\/a\.ts/);
  assert.match(run.stderr, /src\/b\.ts/);
});

test("docs and root files alone need no record", (t) => {
  const { commit, check } = repo(t);
  commit("docs", { "docs/ocean.md": "o\n", "package.json": "{}\n" });
  assert.equal(check().status, 0);
});

test("a merge commit is skipped, the commits it brings are not", (t) => {
  const { git, commit, check } = repo(t);
  git("switch", "-q", "-c", "side");
  commit("side work\n\nNo work record: test", { "src/side.ts": "s\n" });
  git("switch", "-q", "main");
  commit("main docs", { "docs/ocean.md": "o\n" });
  git("merge", "-q", "--no-ff", "-m", "merge side", "side");
  assert.equal(check().status, 0);
  git("switch", "-q", "-c", "side2");
  commit("more side work", { "src/side2.ts": "s\n" });
  git("switch", "-q", "main");
  git("merge", "-q", "--no-ff", "-m", "merge side2", "side2");
  const run = check();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /src\/side2\.ts/);
});

test("a range that cannot be read exits with 2", (t) => {
  const { check, cwd } = repo(t);
  assert.equal(check("no-such-ref").status, 2);
  assert.equal(
    spawnSync(process.execPath, [script], { cwd, env }).status,
    2,
    "no base",
  );
});

// The step's own shell lines, run here as GitHub runs them (bash -e), in a throwaway repository.
function workflowStep(cwd, extra) {
  const yml = readFileSync(".github/workflows/work-record.yml", "utf8");
  const [, block] = yml.split("        run: |\n");
  assert.ok(block, "no run block");
  return spawnSync("bash", ["-e", "-c", block.replace(/^ {10}/gm, "")], {
    cwd,
    env: { ...env, ...extra },
    encoding: "utf8",
  });
}

test("the workflow checks the pushed range of a push to main", (t) => {
  const { cwd, commit } = repo(t);
  const code = commit("change the game", {
    "scripts/check-work-record.mjs": readFileSync(script, "utf8"),
    "src/a.ts": "1\n",
  });
  const push = (before, sha) =>
    workflowStep(cwd, {
      EVENT_NAME: "push",
      BEFORE_SHA: before,
      GITHUB_SHA: sha,
    });
  const red = push("base", code);
  assert.equal(red.status, 1, red.stdout + red.stderr);
  const docs = commit("docs", { "docs/ocean.md": "o\n" });
  assert.equal(push(code, docs).status, 0);
});

test("the workflow checks a pull request against the base it was merged into", (t) => {
  const { cwd, git, commit } = repo(t);
  commit("the checker\n\nNo work record: test", {
    "scripts/check-work-record.mjs": readFileSync(script, "utf8"),
  });
  git("switch", "-q", "-c", "pr");
  commit("pr change", { "src/pr.ts": "1\n" });
  git("switch", "-q", "main");
  commit("main moved, with its record", {
    "src/main.ts": "1\n",
    "docs/work/2026-01-03-main.md": "m\n",
  });
  git("switch", "-q", "pr");
  git("merge", "-q", "--no-ff", "-m", "update from main", "main");
  // GitHub checks out a merge of the pull request's head into the base branch.
  git("switch", "-q", "--detach", "main");
  git("merge", "-q", "--no-ff", "-m", "merge ref", "pr");
  const run = workflowStep(cwd, { EVENT_NAME: "pull_request" });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /src\/pr\.ts/);
  assert.doesNotMatch(run.stderr, /src\/main\.ts/);
});

test("nothing can skip, cancel or excuse the workflow run", () => {
  const yml = readFileSync(".github/workflows/work-record.yml", "utf8");
  assert.match(yml, /push:\n {4}branches: \[main\]/);
  assert.match(yml, /\n {2}pull_request:/);
  assert.match(yml, /fetch-depth: 0/);
  assert.doesNotMatch(
    yml.replace(/^\s*#.*$/gm, ""),
    /concurrency|continue-on-error|\|\| true|\n\s+if:|\n\s+needs:/,
  );
});
