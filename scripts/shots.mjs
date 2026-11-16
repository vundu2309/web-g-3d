// One command for the standard before/after screenshots of the sea (render harness, software
// WebGL). It starts its own Vite server, runs tools/render-harness/shoot.mjs and stops.
//
//   node scripts/shots.mjs before                 # the standard set -> /private/tmp/.../shots/before
//   node scripts/shots.mjs after --out /some/dir
//   node scripts/shots.mjs after --cwd ../web-g-3d-wt/foo --refl 0 chase,0,0,6 low,0,0,6
// Each spec is mode,island,angleDeg,seconds[,boatSpeed] (tools/render-harness/README.md).
// Default set: chase, low (fishing camera), beach, high (horizon) at t = 4.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { CHROME, startVite } from "./lib/dev.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  return args.splice(i, 2)[1];
};
const cwd = path.resolve(opt("--cwd", process.cwd()));
const refl = opt("--refl", "1");
const label = args.find((a) => !a.startsWith("--") && !a.includes(","));
const out = path.resolve(
  opt("--out", path.join(tmpdir(), "web-g-3d-shots", label ?? "shots")),
);
const specs = args.filter((a) => a.includes(","));
if (!label) {
  console.error(
    "usage: node scripts/shots.mjs <label> [--out dir] [--cwd dir] [--refl 0|1] [spec...]",
  );
  process.exit(2);
}
const set = specs.length
  ? specs
  : ["chase,0,0,4", "low,0,0,4", "beach,0,30,4", "high,0,0,4"];

const server = await startVite({ cwd });
const code = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    [
      path.join(cwd, "tools/render-harness/shoot.mjs"),
      String(server.port),
      out,
      label,
      ...set,
    ],
    {
      cwd,
      stdio: "inherit",
      env: { ...process.env, CHROMIUM_PATH: CHROME, REFL: refl },
    },
  );
  child.on("exit", resolve);
});
server.stop();
console.log(`shots: ${code === 0 ? "done" : "FAILED"}, images in ${out}`);
process.exit(code ?? 1);
