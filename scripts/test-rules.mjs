import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

// Start only the local Java service. Firebase CLI 15.34 ignores NO_PROXY for its
// own localhost requests; keep inherited proxy/CA settings for verified downloads.
const require = createRequire(import.meta.url);
const downloads = require("firebase-tools/lib/emulator/downloadableEmulators");
const { downloadEmulator } = require("firebase-tools/lib/emulator/download");
const {
  validateChecksum,
  validateSize,
} = require("firebase-tools/lib/downloadUtils");
const details = downloads.getDownloadDetails("database");
if (!existsSync(details.downloadPath)) await downloadEmulator("database");
await validateSize(details.downloadPath, details.opts.expectedSize);
await validateChecksum(
  details.downloadPath,
  details.opts.expectedChecksum,
  "md5",
);
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const java = spawn(
  "java",
  ["-jar", details.downloadPath, "--host", "127.0.0.1", "--port", String(port)],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
let stopped = false;
java.stdout.on("data", (data) => {
  log += data;
});
java.stderr.on("data", (data) => {
  log += data;
});
java.on("exit", () => {
  stopped = true;
});
java.on("error", (error) => {
  log += error.message;
  stopped = true;
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (stopped) throw new Error(`Database emulator stopped: ${log}`);
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/.json?ns=demo-photyphu`,
        { signal: AbortSignal.timeout(500) },
      );
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Await the owned emulator's first response. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Database emulator did not become ready: ${log}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", "tests/rules.test.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        FIREBASE_DATABASE_EMULATOR_HOST: `127.0.0.1:${port}`,
      },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Rules tests failed: ${code}`)),
    );
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (!stopped) {
    const exited = new Promise((resolve) => java.once("exit", resolve));
    java.kill("SIGTERM");
    const timer = setTimeout(() => java.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  }
}
