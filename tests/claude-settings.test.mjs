// The shared Claude Code settings (.claude/settings.json): the format hook is run here as Claude Code runs it.
// The deny rules are matched with a small model of the documented wildcard rules (https://code.claude.com/docs/en/permissions),
// so this test can see a missing or broken rule, not how Claude Code itself matches it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const settings = () =>
  JSON.parse(readFileSync(".claude/settings.json", "utf8"));

// Runs the committed hook command with the JSON a PostToolUse hook gets on stdin.
function runHook(file, project = process.cwd()) {
  const [group] = settings().hooks.PostToolUse;
  assert.equal(group.matcher, "Edit|Write");
  const [hook] = group.hooks;
  assert.equal(hook.type, "command");
  return spawnSync(hook.command, {
    shell: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: file },
    }),
    encoding: "utf8",
  });
}

function scratch(t, directory, name, text) {
  const folder = mkdtempSync(path.join(directory, ".hook-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, name);
  writeFileSync(file, text);
  return file;
}

const messy = "const  a = {b:1}\n";
const tidy = "const a = { b: 1 };\n";

test("an edited file under a formatted folder is formatted", (t) => {
  const file = scratch(t, path.resolve("scripts"), "a.mjs", messy);
  const run = runHook(file);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(file, "utf8"), tidy);
});

test("a file outside the formatted scope or the repository is left alone", (t) => {
  for (const directory of [path.resolve("docs"), tmpdir()]) {
    const file = scratch(t, directory, "a.mjs", messy);
    const run = runHook(file);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(file, "utf8"), messy, file);
  }
});

test("a file in another git repository is left alone", (t) => {
  const file = scratch(t, tmpdir(), "a.mjs", messy);
  const folder = path.dirname(file);
  mkdirSync(path.join(folder, "src"));
  writeFileSync(path.join(folder, "src/b.mjs"), messy);
  assert.equal(spawnSync("git", ["init", "-q", folder]).status, 0);
  const run = runHook(path.join(folder, "src/b.mjs"));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(path.join(folder, "src/b.mjs"), "utf8"), messy);
});

test("a file in a worktree is formatted by that worktree's rules", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "hook worktree "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = path.join(root, "main");
  const other = path.join(root, "other");
  mkdirSync(path.join(main, "scripts/hooks"), { recursive: true });
  cpSync(
    "scripts/hooks/format-edited.mjs",
    path.join(main, "scripts/hooks/format-edited.mjs"),
  );
  symlinkSync(path.resolve("node_modules"), path.join(main, "node_modules"));
  const git = (...args) => {
    const run = spawnSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args],
      {
        cwd: main,
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
        encoding: "utf8",
      },
    );
    assert.equal(run.status, 0, run.stderr);
  };
  git("init", "-q");
  git("add", "scripts");
  git("commit", "-q", "-m", "start");
  git("worktree", "add", "-q", other);
  // Only the worktree ignores skip.mjs.
  writeFileSync(path.join(other, ".prettierignore"), "scripts/skip.mjs\n");
  const files = ["scripts/a.mjs", "scripts/skip.mjs"].map((name) =>
    path.join(other, name),
  );
  for (const file of files) writeFileSync(file, messy);
  const [run, skipped] = files.map((file) => runHook(file, main));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.equal(readFileSync(files[0], "utf8"), tidy);
  assert.equal(readFileSync(files[1], "utf8"), messy);
});

test("a file that cannot be formatted is reported to the session", (t) => {
  const file = scratch(t, path.resolve("scripts"), "a.mjs", "const = ;\n");
  const run = runHook(file);
  assert.equal(run.status, 2, "exit 2 shows stderr to Claude");
  assert.match(run.stderr, /a\.mjs/);
});

test("the hook formats the same files as npm run format", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const listed = scripts["format:check"].replace(/^prettier --check /, "");
  const hook = readFileSync("scripts/hooks/format-edited.mjs", "utf8");
  for (const entry of listed.split(" "))
    assert.ok(hook.includes(`"${entry}"`), entry);
});

// "*" is any text; a final " *" also matches the bare command.
function matches(rule, command) {
  const pattern = /^Bash\((.*)\)$/.exec(rule)[1];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const open = pattern.endsWith(" *");
  const body = (open ? pattern.slice(0, -2) : pattern)
    .split("*")
    .map(escape)
    .join(".*");
  return new RegExp(`^${body}${open ? "( .*)?" : ""}$`, "s").test(command);
}
const denied = (command) =>
  settings().permissions.deny.some((rule) => matches(rule, command));

// Runs the committed PreToolUse hook command as Claude Code does before a Bash call.
function guard(command) {
  const [group] = settings().hooks.PreToolUse;
  assert.equal(group.matcher, "Bash");
  return spawnSync(group.hooks[0].command, {
    shell: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() },
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
    encoding: "utf8",
  });
}

test("the plain forms of a force push are denied by rule", () => {
  for (const command of [
    "git push --force",
    "git push -f",
    "git push --force origin main",
    "git push -f origin main",
    "git push origin main --force",
    "git push origin main -f",
    "git push --force-with-lease",
    "git push origin --force-with-lease=main main",
    "git push origin +main",
    "git push git@github.com:o/r.git +HEAD:main",
  ])
    assert.ok(denied(command), command);
});

test("the hook refuses a force push, however git is given its options", () => {
  for (const command of [
    "git push --force",
    "git push -f origin main",
    "git push -uf origin x",
    "git push -qf origin main",
    "git push -vf",
    "git push origin main -nf",
    "git push origin x -uf",
    "git push --force-with-lease=main origin main",
    "git push --mirror origin",
    "git push origin +main",
    "git push -- origin +HEAD:main",
    "git -C ../wt push -f",
    "git -C ../wt push -uf origin x",
    "git -C '../my tree' push --force",
    "git -c push.default=current push -f",
    "git --no-pager -C x push origin main --force",
    "/usr/bin/git push -f",
    "GIT_SSH_COMMAND='ssh -i ~/.ssh/k -o IdentitiesOnly=yes' git push -f git@github.com:o/r.git main",
    "env GIT_TRACE=1 git push -f",
    "timeout 60 git push -f",
    "cd /x && git push -f",
    "git fetch; git push --force 2>&1 | tail -3",
    "git push 2>&1 --force",
    "(git push -f)",
    "git status\ngit push -f",
    "git push \\\n  --force origin main",
    "echo $(git push -f)",
    "cat <<'EOF' > m\ntext\nEOF\ngit push -f",
    "git -C ../wt push origin $(git branch --show-current) -f",
    "git push origin $(git branch --show-current) --force",
    "git push origin `git branch --show-current` -f",
    "git -C $(pwd) push -f",
    "git -C x push origin HEAD:$(git rev-parse --abbrev-ref HEAD) +main",
    'echo "$(git push -f)"',
    "git -C x push --force>log",
    "git -C x push --force> log",
    "git -C x push origin main &>/tmp/log -f",
    "2>/dev/null git -C x push -f",
    "echo $((1<<2))\ngit push -f",
    "(( x = 1 << 3 ))\ngit push -f",
    "git -C x push --force-w origin main",
    "git push --force-with-leas",
    "git push --mirr origin",
    "sudo -u me git push -f",
    "env -u GIT_DIR git -C x push -f",
    "timeout -s KILL 60 git -C x push -f",
    "echo $'don\\'t' && git push -f",
    'git commit -q -m "$(cat <<\'EOF\'\nthe 5" screen\nEOF\n)" && git push -f',
    "case x in a) git push -f ;; esac",
  ]) {
    const run = guard(command);
    assert.equal(run.status, 2, `${command}: ${run.stderr}`);
    assert.match(run.stderr, /force push/i, command);
  }
});

test("ordinary commands pass both the rules and the hook", () => {
  for (const command of [
    "git push",
    "git push origin main",
    "git push git@github.com:o/r.git HEAD:main",
    "GIT_SSH_COMMAND='ssh -o IdentitiesOnly=yes -i $HOME/.ssh/k' git push git@github.com:o/r.git main",
    "git push -u origin wt/follow-flags",
    "git push --follow-tags",
    "git push -o ci.skip -ofast origin main",
    "git push origin main && rm -f x",
    "git fetch --force origin",
    "git worktree remove --force x",
    "git -C /x stash push -f",
    'git -C /x commit -m "fix(ocean): push boats apart + keep the wake"',
    'git -C ../wt commit -m "feat: refuse a force push (-f, --force) in settings"',
    'git -C /x commit -m "docs: say what a push does -f"',
    'git commit -m "never git push -f; git push --force is refused"',
    "git commit -q -F - <<'EOF'\nfix: x\n\ngit push -f\nEOF\ngit push origin main",
    "echo 'git push -f'",
    'grep -n "push --force" docs/workflow.md',
    "ls # git push -f",
    'git commit -q -m "$(cat <<\'EOF\'\n- "(git push -f)" is refused\nEOF\n)"',
    'git commit -q -m "$(cat <<\'EOF\'\nthe 5" screen\n\ngit push -f is refused\nEOF\n)" && git push origin main',
    "cat <<\\EOF > notes\ngit push -f\nEOF",
    "git push origin $(git branch --show-current)",
    "git push origin main 2>&1 | tail -f",
    "git push --follow-tags --no-force-with-lease",
  ]) {
    // Claude Code matches each part of a compound command by itself; this model does not split them.
    if (!/&&|\||\n/.test(command))
      assert.ok(!denied(command), `rule: ${command}`);
    const run = guard(command);
    assert.equal(run.status, 0, `hook: ${command}: ${run.stderr}`);
  }
});

test("the shared settings only restrict: nothing is allowed or switched off", () => {
  const all = settings();
  assert.deepEqual(Object.keys(all).sort(), ["hooks", "permissions"]);
  assert.deepEqual(Object.keys(all.permissions), ["deny"]);
  assert.deepEqual(Object.keys(all.hooks).sort(), [
    "PostToolUse",
    "PreToolUse",
  ]);
});
