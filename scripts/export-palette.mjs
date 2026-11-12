// Writes the sea's colour palette (src/ocean/art/colors.ts) to tools/blender/palette.json so the
// Blender characters use exactly the game's colours: one source of truth, never a second hex.
// Run through `npm run assets:palette` (it needs the TS resolver of the unit tests).
import { writeFile } from "node:fs/promises";
import { PAL } from "../src/ocean/art/colors.ts";

const out = new URL("../tools/blender/palette.json", import.meta.url);
await writeFile(out, `${JSON.stringify(PAL, null, 2)}\n`);
console.log(`palette -> ${out.pathname}`);
