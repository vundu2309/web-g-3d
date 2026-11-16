// Shared helpers for the one-command scripts (qa.mjs, shots.mjs, wt.mjs): the macOS Chrome
// path, a free port, a Vite dev server bound to 127.0.0.1 and a wait for it to answer.
// Development tooling only: nothing here is built into the game.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { get } from "node:http";
import { existsSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const CHROME =
  process.env.CHROMIUM_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** The first port from `start` up that nothing listens on (checked on 127.0.0.1). */
export async function freePort(start = 5300) {
  for (let port = start; port < start + 400; port++) {
    const free = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port from ${start}`);
}

/** Resolves when GET url answers with any status, rejects after `ms`. */
export function waitHttp(url, ms = 60000) {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > until) reject(new Error(`${url} did not answer`));
        else setTimeout(attempt, 300);
      });
      req.setTimeout(2000, () => req.destroy());
    };
    attempt();
  });
}

/** A per-checkout Vite cache outside the repository, so two servers never share one. */
export const cacheDirFor = (cwd) =>
  path.join(tmpdir(), "web-g-3d-vite", path.basename(cwd));

/**
 * Public settings the browser tests need: the sea refuses to start without a Supabase
 * address (no fallback), and the tests that open the account dialog answer for it themselves.
 */
export const TEST_ENV = {
  VITE_SUPABASE_URL: "http://127.0.0.1:18999",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

/**
 * Starts `vite` in `cwd` on 127.0.0.1:port (--strictPort). `detached` lets it outlive this
 * process (wt.mjs preview); `logFile` receives its output.
 */
export async function startVite({
  cwd = process.cwd(),
  port,
  detached = false,
  logFile,
  env = {},
} = {}) {
  const bin = path.join(cwd, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(bin))
    throw new Error(
      `no node_modules in ${cwd} (run npm ci, or use wt.mjs new)`,
    );
  port ??= await freePort();
  const cacheDir = cacheDirFor(cwd);
  mkdirSync(cacheDir, { recursive: true });
  let out = "ignore";
  if (logFile) {
    mkdirSync(path.dirname(logFile), { recursive: true });
    out = openSync(logFile, "a");
  }
  const child = spawn(
    process.execPath,
    [bin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd,
      detached,
      stdio: ["ignore", out, out],
      env: {
        ...process.env,
        ...env,
        VITE_CACHE_DIR: cacheDir,
        // Where node_modules really lives (a worktree symlinks it): Vite must be allowed to serve it.
        VITE_FS_ALLOW: realpathSync(path.join(cwd, "node_modules")),
      },
    },
  );
  if (detached) child.unref();
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitHttp(`${url}/`);
  } catch (error) {
    child.kill();
    throw error;
  }
  return { port, url, child, stop: () => child.kill() };
}
