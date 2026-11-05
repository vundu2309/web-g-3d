import { defineConfig } from "vite";
import { pwaBuild } from "./scripts/pwa-build.mjs";
export default defineConfig({
  base: "./",
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
