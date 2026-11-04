import { defineConfig } from "vite";
import { pwaBuild } from "./scripts/pwa-build.mjs";
export default defineConfig({ base: "./", plugins: [pwaBuild()] });
