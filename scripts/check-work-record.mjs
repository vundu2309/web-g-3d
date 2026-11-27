// Does a push (or a pull request) that changes code also say what the change was? (decision 0023, step 3)
//
//   node scripts/check-work-record.mjs <base> [head]    # the commits in base..head; head is HEAD
//
// A commit that changes a file under src/, server/, supabase/, tests/ or scripts/ needs a work record in the
// same range (a file in docs/work/ added or changed; not _template.md or README.md), or the line
// "No work record: <reason>" in its own message. Merge commits are skipped. Exit 0: passes; 1: a record is
// missing; 2: the range cannot be read. No network.
//
// It sees that a record was touched, not that it is true or that it is about this change.
import { execFileSync } from "node:child_process";

const CODE = /^(src|server|supabase|tests|scripts)\//;
const RECORD = /^docs\/work\/(?!_template\.md$|README\.md$)[^/]+\.md$/;
// A reason, not the placeholder "<reason>" copied from the rule.
const EXEMPT = /^No work record:[ \t]*(?!<reason>)\S/m;

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

function die(message) {
  console.error(`[work-record] ${message}`);
  process.exit(2);
}

let [base, head = "HEAD"] = process.argv.slice(2);
if (!base) die("usage: node scripts/check-work-record.mjs <base> [head]");
// GitHub sends all zeros as "before" for a new branch.
if (/^0+$/.test(base)) base = "origin/main";

let commits;
try {
  for (const ref of [base, head])
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  commits = git("rev-list", "--no-merges", "--reverse", `${base}..${head}`)
    .split("\n")
    .filter(Boolean);
} catch {
  die(`cannot read the range ${base}..${head} (is the history fetched?)`);
}

let recorded = false;
const missing = [];
for (const sha of commits) {
  // --no-renames: a file moved out of src/ is still a change under src/.
  const fields = git(
    "diff-tree",
    "--root",
    "--no-commit-id",
    "--no-renames",
    "--name-status",
    "-r",
    "-z",
    sha,
  ).split("\0");
  const code = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const [status, file] = [fields[i], fields[i + 1]];
    if (status !== "D" && RECORD.test(file)) recorded = true;
    if (CODE.test(file)) code.push(file);
  }
  if (!code.length) continue;
  const message = git("log", "-1", "--format=%B", sha);
  if (!EXEMPT.test(message))
    missing.push({ sha, subject: message.split("\n")[0], code });
}

if (recorded || !missing.length) {
  console.log(`[work-record] passed: ${commits.length} commit(s) checked`);
} else {
  console.error(
    `[work-record] no work record in ${base}..${head} for these commits:`,
  );
  for (const { sha, subject, code } of missing) {
    console.error(`  ${sha.slice(0, 7)} ${subject}`);
    for (const file of code.slice(0, 10)) console.error(`    ${file}`);
    if (code.length > 10) console.error(`    and ${code.length - 10} more`);
  }
  console.error(
    'Add or update a record in docs/work/ (copy _template.md), or, only for a change with no behaviour and no contract change, put "No work record: <reason>" in the commit message.',
  );
  process.exitCode = 1;
}
