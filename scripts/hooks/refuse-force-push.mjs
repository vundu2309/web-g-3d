// Claude Code PreToolUse hook (.claude/settings.json): refuse a Bash command that force pushes. It reads the
// command word by word, so grouped flags (-uf), git's own options (-C, -c) and quoted commit messages are
// told apart, which the permission patterns cannot do. Exit 2 refuses the call and shows the reason.
//
// It is a guard against a slip, not a security boundary: a push inside a string that another program runs
// (bash -c "...", eval), an alias, a variable, a script file or unusual shell syntax is not seen. Only branch
// protection on GitHub refuses it for everyone.
import { readFileSync } from "node:fs";
import path from "node:path";

// The simple commands of a shell line, each a list of words with quotes removed. A substitution
// ($(...), backticks, also inside double quotes) gives commands of its own and does not cut the command
// around it. Heredoc bodies, comments, arithmetic and redirections are skipped.
function commands(line) {
  const all = [];
  const heredocs = [];
  let i = 0;

  // Past the "))" that closes the arithmetic starting at i.
  function arithmetic() {
    let depth = 0;
    for (; i < line.length; i++) {
      if (line[i] === "(") depth++;
      else if (line[i] === ")" && --depth === 0) break;
    }
    i++;
  }

  // A substitution starting at i, if there is one: reads its commands and returns true.
  function substitution(closing) {
    if (line.startsWith("$((", i)) {
      i++;
      arithmetic();
    } else if (line.startsWith("$(", i)) {
      i += 2;
      read(")");
    } else if (line[i] === "`" && closing !== "`") {
      i++;
      read("`");
    } else return false;
    return true;
  }

  function heredocBodies() {
    while (heredocs.length) {
      const end = heredocs.shift();
      while (i < line.length) {
        let next = line.indexOf("\n", i);
        if (next < 0) next = line.length;
        const text = line.slice(i, next).replace(/^\t+/, "");
        i = next + 1;
        if (text === end) break;
      }
    }
  }

  // Reads commands up to the character that closes this level (undefined: the end of the line).
  function read(closing) {
    let words = [];
    let word; // undefined: between words
    let redirected = false; // the next word names a redirection's file
    let cases = 0; // open "case" blocks, whose patterns end with ")"
    const add = (text) => (word = (word ?? "") + text);
    const endWord = () => {
      if (word !== undefined) {
        if (!redirected) words.push(word);
        redirected = false;
        if (word === "case" && words.length === 1) cases++;
        if (word === "esac") cases--;
      }
      word = undefined;
    };
    const endCommand = () => {
      endWord();
      if (words.length) all.push(words);
      words = [];
      redirected = false;
    };
    while (i < line.length) {
      const c = line[i];
      const rest = () => line.slice(i, i + 200);
      let found;
      if (c === closing && !(c === ")" && cases > 0)) {
        i++;
        break;
      }
      if (substitution(closing)) add("$()");
      else if (line.startsWith("<<<", i)) {
        endWord();
        i += 3;
        redirected = true;
      } else if (
        c === "<" &&
        (found = /^<<-?[ \t]*\\?(["']?)([\w.-]+)\1/.exec(rest()))
      ) {
        endWord();
        heredocs.push(found[2]);
        i += found[0].length;
      } else if ((found = /^(&>>?|>>?[&|]?|<>|<&|<)/.exec(rest()))) {
        if (/^\d+$/.test(word ?? "")) word = undefined; // the 2 of 2>
        endWord();
        redirected = true;
        i += found[0].length;
      } else if (line.startsWith("$'", i)) {
        add("");
        for (i += 2; i < line.length && line[i] !== "'"; i++) {
          if (line[i] === "\\") i++;
          add(line[i] ?? "");
        }
        i++;
      } else if (c === "'") {
        const end = line.indexOf("'", i + 1);
        const stop = end < 0 ? line.length : end;
        add(line.slice(i + 1, stop));
        i = stop + 1;
      } else if (c === '"') {
        add("");
        i++;
        while (i < line.length && line[i] !== '"') {
          if (substitution()) add("$()");
          else {
            if (line[i] === "\\" && '"\\$`\n'.includes(line[i + 1])) i++;
            add(line[i++]);
          }
        }
        i++;
      } else if (c === "\\") {
        if (line[i + 1] !== "\n") add(line[i + 1] ?? "");
        i += 2;
      } else if (c === "#" && word === undefined) {
        while (i < line.length && line[i] !== "\n") i++;
      } else if (c === " " || c === "\t") {
        endWord();
        i++;
      } else if (c === "\n") {
        endCommand();
        i++;
        heredocBodies();
      } else if (line.startsWith("((", i) && word === undefined) {
        arithmetic();
      } else if (c === "(") {
        endCommand();
        i++;
        read(")");
      } else if (";&|)".includes(c)) {
        endCommand();
        i++;
      } else {
        add(c);
        i++;
      }
    }
    endCommand();
  }

  read();
  return all;
}

// Words of the shell itself that may stand before a command.
const KEYWORDS = new Set([
  "if",
  "then",
  "elif",
  "else",
  "do",
  "while",
  "until",
  "!",
  "{",
]);
// Programs that run what follows them, after options of their own.
const WRAPPERS = new Set([
  "command",
  "builtin",
  "env",
  "exec",
  "nice",
  "nohup",
  "time",
  "timeout",
  "stdbuf",
  "sudo",
  "xargs",
]);
const GIT_OPTION_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
]);
const PUSH_OPTION_WITH_VALUE = new Set([
  "--push-option",
  "--repo",
  "--receive-pack",
  "--exec",
]);

// Git also takes an unambiguous start of a long option.
const forcingLongOption = (name) =>
  name === "--force" ||
  (name.length >= "--for".length && "--force-with-lease".startsWith(name)) ||
  (name.length >= "--mi".length && "--mirror".startsWith(name));

// The word of a `git push` that forces it, or undefined.
function forcing(words) {
  const isGit = (word) => path.basename(word) === "git";
  let i = 0;
  while (
    i < words.length &&
    (/^[A-Za-z_]\w*=/.test(words[i]) || KEYWORDS.has(words[i]))
  )
    i++;
  // After a wrapper, whatever its options are, the command is the next "git".
  if (WRAPPERS.has(path.basename(words[i] ?? "")))
    while (i < words.length && !isGit(words[i])) i++;
  if (!isGit(words[i] ?? "")) return undefined;
  for (i++; i < words.length && words[i].startsWith("-"); i++)
    if (GIT_OPTION_WITH_VALUE.has(words[i])) i++;
  if (words[i] !== "push") return undefined;
  let options = true;
  for (i++; i < words.length; i++) {
    const w = words[i];
    if (options && w === "--") options = false;
    else if (options && w.startsWith("--")) {
      if (forcingLongOption(w.split("=")[0])) return w;
      if (PUSH_OPTION_WITH_VALUE.has(w)) i++;
    } else if (options && w.startsWith("-")) {
      // Grouped short flags; -o takes the rest of the word, or the next word.
      const o = w.indexOf("o");
      if ((o < 0 ? w : w.slice(0, o)).includes("f")) return w;
      if (o === w.length - 1) i++;
    } else if (w.startsWith("+")) return w;
  }
  return undefined;
}

let command;
try {
  command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command;
} catch {
  command = undefined;
}
if (typeof command === "string") {
  // A line too odd to read (nesting thousands deep) throws: the call then goes on to the deny rules.
  for (const words of commands(command)) {
    const word = forcing(words);
    if (word === undefined) continue;
    console.error(
      `[settings] refused: "${word}" makes this a force push (.claude/settings.json). Rewriting pushed history needs the user to run it.`,
    );
    process.exitCode = 2;
    break;
  }
}
