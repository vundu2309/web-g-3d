import { createServer, preview } from "vite";
import { spawn } from "node:child_process";

async function run(file, port) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      stdio: "inherit",
      env: { ...process.env, TEST_BASE_URL: `http://127.0.0.1:${port}` },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} failed: ${signal || code}`));
    });
  });
}

// The sea refuses to start without a Supabase address (no fallback); tests answer for it.
Object.assign(process.env, {
  VITE_SUPABASE_URL: "http://127.0.0.1:18999",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
});
let dev;
let production;
try {
  // Port 0 avoids collisions with user servers. Only close servers we own.
  dev = await createServer({
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "warn",
  });
  await dev.listen();
  const port = dev.httpServer.address().port;
  await run("tests/ocean-stick-browser.mjs", port);
  await run("tests/ocean-input-browser.mjs", port);
  await run("tests/ocean-steer-browser.mjs", port);
  await run("tests/boot-fallback-browser.mjs", port);
  await run("tests/ocean-babylon-browser.mjs", port);
  await run("tests/harbor-browser.mjs", port);
  await run("tests/ocean-loading-browser.mjs", port);
  await run("tests/ocean-resume-browser.mjs", port);
  await run("tests/ocean-presence-browser.mjs", port);
  await run("tests/ocean-parked-browser.mjs", port);
  await run("tests/ocean-fishing-browser.mjs", port);
  await run("tests/ocean-cast-browser.mjs", port);
  await run("tests/ocean-market-browser.mjs", port);
  await run("tests/ocean-server-store-browser.mjs", port);
  await run("tests/ocean-multiplayer-browser.mjs", port);
  await run("tests/account-signup-browser.mjs", port);
  await dev.close();
  dev = undefined;
  production = await preview({
    preview: { host: "127.0.0.1", port: 0 },
    logLevel: "warn",
  });
  await run(
    "tests/boot-fallback-browser.mjs",
    production.httpServer.address().port,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await dev?.close();
  await new Promise((resolve, reject) => {
    if (!production) return resolve();
    production.httpServer.close((error) => (error ? reject(error) : resolve()));
    production.httpServer.closeAllConnections();
  });
}
