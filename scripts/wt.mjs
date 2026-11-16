// Git worktrees for parallel agents: one checkout per task, its own branch, its own preview.
// Editing code in a worktree and running `preview` serves THAT code, so you can look at the
// result before anything reaches main.
//
//   node scripts/wt.mjs new <name> [base]    # worktree ../web-g-3d-wt/<name>, branch wt/<name> from base (main)
//   node scripts/wt.mjs preview <name>       # Vite for that worktree on its own port (kept running)
//   node scripts/wt.mjs stop <name>          # stop its preview
//   node scripts/wt.mjs list                 # worktrees, branches, previews
//   node scripts/wt.mjs sync <name>          # rebase the branch onto main
//   node scripts/wt.mjs remove <name> [--force]   # stop preview, remove the worktree (refuses if it has changes)
//
// node_modules is a symlink to the main checkout's (no second install). Each worktree gets its
// own Vite cache under the temp folder (VITE_CACHE_DIR, see vite.config.ts).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { freePort, startVite } from "./lib/dev.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const here = process.cwd();
// The main checkout, whichever worktree this runs from.
const common = path.resolve(here, git(here, "rev-parse", "--git-common-dir"));
const main = path.dirname(common);
const base = path.join(path.dirname(main), `${path.basename(main)}-wt`);
const dirOf = (name) => path.join(base, name);
const state = (name) => path.join(dirOf(name), ".wt-preview.json");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const safe = (name) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name ?? ""))
    die("name: lowercase letters, digits and dashes");
  return name;
};
function die(message) {
  console.error(message);
  process.exit(1);
}
const readPreview = (name) => {
  try {
    const s = JSON.parse(readFileSync(state(name), "utf8"));
    return alive(s.pid) ? s : undefined;
  } catch {
    return undefined;
  }
};

const [cmd, nameArg, ...rest] = process.argv.slice(2);

if (cmd === "new") {
  const name = safe(nameArg);
  const from = rest[0] ?? "main";
  const dir = dirOf(name);
  if (existsSync(dir)) die(`${dir} exists`);
  mkdirSync(base, { recursive: true });
  git(main, "worktree", "add", "-b", `wt/${name}`, dir, from);
  symlinkSync(path.join(main, "node_modules"), path.join(dir, "node_modules"));
  // Keep the preview state file out of git status in every worktree.
  const exclude = path.join(common, "info", "exclude");
  mkdirSync(path.dirname(exclude), { recursive: true });
  const text = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!text.includes(".wt-preview.json"))
    appendFileSync(exclude, "\n.wt-preview.json\n.wt-vite.log\nnode_modules\n");
  console.log(`worktree ${dir} on branch wt/${name} (from ${from})`);
  console.log(`next: node scripts/wt.mjs preview ${name}`);
} else if (cmd === "preview") {
  const name = safe(nameArg);
  const dir = dirOf(name);
  if (!existsSync(dir)) die(`no worktree ${name}`);
  const running = readPreview(name);
  if (running) {
    console.log(`already running: ${running.url}`);
  } else {
    const port = await freePort(5300);
    const server = await startVite({
      cwd: dir,
      port,
      detached: true,
      logFile: path.join(dir, ".wt-vite.log"),
    });
    writeFileSync(
      state(name),
      JSON.stringify({ pid: server.child.pid, port, url: server.url }),
    );
    console.log(
      `preview ${name}: ${server.url}  (harness: ${server.url}/tools/render-harness/preview.html)`,
    );
  }
} else if (cmd === "stop") {
  const s = readPreview(safe(nameArg));
  if (!s) console.log("not running");
  else {
    process.kill(s.pid);
    rmSync(state(nameArg), { force: true });
    console.log(`stopped ${nameArg}`);
  }
} else if (cmd === "list") {
  for (const block of git(main, "worktree", "list", "--porcelain").split(
    "\n\n",
  )) {
    const dir = /^worktree (.+)$/m.exec(block)?.[1];
    const branch =
      /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "(detached)";
    const name = dir && dir.startsWith(base) ? path.basename(dir) : undefined;
    const p = name ? readPreview(name) : undefined;
    const dirty = dir
      ? git(dir, "status", "--short").split("\n").filter(Boolean).length
      : 0;
    console.log(
      `${dir}  ${branch}  ${dirty ? `${dirty} changed` : "clean"}${p ? `  preview ${p.url}` : ""}`,
    );
  }
} else if (cmd === "sync") {
  const dir = dirOf(safe(nameArg));
  if (!existsSync(dir)) die(`no worktree ${nameArg}`);
  console.log(git(dir, "rebase", "main"));
} else if (cmd === "remove") {
  const name = safe(nameArg);
  const dir = dirOf(name);
  if (!existsSync(dir)) die(`no worktree ${name}`);
  const force = rest.includes("--force");
  const dirty = git(dir, "status", "--short");
  if (dirty && !force)
    die(`${dir} has changes:\n${dirty}\nCommit or merge them, or pass --force`);
  const s = readPreview(name);
  if (s) process.kill(s.pid);
  rmSync(path.join(dir, "node_modules"), { force: true }); // the symlink only
  git(main, "worktree", "remove", ...(force ? ["--force"] : []), dir);
  console.log(
    `removed ${dir}; branch wt/${name} is kept (git branch -d wt/${name} when merged)`,
  );
} else {
  die("usage: node scripts/wt.mjs new|preview|stop|list|sync|remove <name>");
}
