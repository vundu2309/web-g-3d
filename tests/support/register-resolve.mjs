import { register } from "node:module";

// Vite and the TypeScript bundler resolve Babylon's extensionless deep imports;
// plain Node ESM does not. Tests register this hook so they can run the real
// source files unchanged.
register("./resolve-hooks.mjs", import.meta.url);
