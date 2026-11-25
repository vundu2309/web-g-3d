// Compares GLBs rebuilt by `npm run assets:rebuild -- --out DIR` with the committed ones in
// public/models and the catalogue (tools/blender/assets.json): triangles, node names, vertex
// colours. Usage: node scripts/check-asset-rebuild.mjs DIR
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!dir) {
  console.error("usage: node scripts/check-asset-rebuild.mjs DIR");
  process.exit(2);
}
const root = new URL("../", import.meta.url);
const { assets } = JSON.parse(
  readFileSync(new URL("tools/blender/assets.json", root), "utf8"),
);

function summary(path) {
  const data = readFileSync(path);
  const json = JSON.parse(
    data.toString("utf8", 20, 20 + data.readUInt32LE(12)),
  );
  let triangles = 0;
  let plain = 0;
  for (const node of json.nodes)
    if (node.mesh !== undefined)
      for (const p of json.meshes[node.mesh].primitives) {
        triangles += json.accessors[p.indices].count / 3;
        if (p.attributes.COLOR_0 === undefined) plain++;
      }
  return { triangles, plain, nodes: json.nodes.map((n) => n.name) };
}

let problems = 0;
let compared = 0;
for (const [file, entry] of Object.entries(assets)) {
  const rebuilt = resolve(dir, file);
  if (!existsSync(rebuilt)) continue;
  compared++;
  const now = summary(rebuilt);
  const kept = summary(new URL(`public/models/${file}`, root).pathname);
  const notes = [];
  if (now.triangles !== kept.triangles)
    notes.push(`triangles ${kept.triangles} -> ${now.triangles}`);
  if (now.triangles > entry.maxTriangles)
    notes.push(`over the ceiling ${entry.maxTriangles}`);
  if (now.plain) notes.push(`${now.plain} mesh(es) without COLOR_0`);
  for (const name of entry.nodes)
    if (!now.nodes.includes(name)) notes.push(`node "${name}" missing`);
  if (notes.length) problems++;
  console.log(
    `${notes.length ? "DIFF" : "same"}  ${file}${notes.length ? "  " + notes.join("; ") : ""}`,
  );
}
console.log(`${compared} compared, ${problems} differ`);
process.exit(problems ? 1 : 0);
