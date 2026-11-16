import path from "node:path";
import { defineConfig } from "vite";
import { pwaBuild } from "./scripts/pwa-build.mjs";
export default defineConfig({
  base: "./",
  // Set by scripts/qa.mjs, shots.mjs and wt.mjs so servers in different checkouts never share a cache.
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  // A git worktree (scripts/wt.mjs) links node_modules from the main checkout, which Vite would
  // refuse to serve (403 on the fonts); scripts/lib/dev.mjs lists the folders to allow here.
  server: process.env.VITE_FS_ALLOW
    ? {
        fs: {
          allow: [
            process.cwd(),
            ...process.env.VITE_FS_ALLOW.split(path.delimiter),
          ],
        },
      }
    : undefined,
  plugins: [pwaBuild()],
  build: {
    rollupOptions: {
      output: {
        // The sea engine is large and only the online game uses it. A named chunk lets
        // the service worker leave it out of the offline shell.
        manualChunks: (id) => {
          // Vite's tiny preload helper is imported by every lazy route. Left to
          // Rollup it can land inside this chunk and drag the engine into the
          // home page, so it gets its own chunk.
          if (id.includes("vite/preload-helper")) return "preload-helper";
          return id.includes("/@babylonjs/") ? "babylon" : undefined;
        },
      },
    },
  },
});
