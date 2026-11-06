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
  await run("tests/hub-browser.mjs", port);
  await run("tests/game-ui-browser.mjs", port);
  await run("tests/safe-area-browser.mjs", port);
  await run("tests/board-browser.mjs", port);
  await run("tests/ocean-stick-browser.mjs", port);
  await run("tests/ocean-input-browser.mjs", port);
  await run("tests/boot-fallback-browser.mjs", port);
  await run("tests/ocean-babylon-browser.mjs", port);
  await run("tests/harbor-browser.mjs", port);
  await run("tests/ocean-loading-browser.mjs", port);
  await run("tests/ocean-resume-browser.mjs", port);
  await run("tests/ocean-fishing-browser.mjs", port);
  await run("tests/ocean-multiplayer-browser.mjs", port);
  await run("tests/account-signup-browser.mjs", port);
  await dev.close();
  dev = undefined;
  production = await preview({
    preview: { host: "127.0.0.1", port: 0 },
    logLevel: "warn",
  });
  await run("tests/hub-browser.mjs", production.httpServer.address().port);
  await run("tests/game-ui-browser.mjs", production.httpServer.address().port);
  await run(
    "tests/safe-area-browser.mjs",
    production.httpServer.address().port,
  );
  await run("tests/board-browser.mjs", production.httpServer.address().port);
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
