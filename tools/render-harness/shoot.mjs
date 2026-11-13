// Takes screenshots of the sea game through the render harness (preview.html) with software WebGL.
//
//   npx vite --port 5193 --strictPort &          # from the repo root
//   node tools/render-harness/shoot.mjs 5193 <outDir> <tag> chase,0,0,4 low,1,90,4 beach,0,30,4 ...
//
// Each spec is `mode,island,angleDeg,seconds[,boatSpeed]` (see README.md). Files are written as
// <outDir>/<tag>-<mode>-i<island>-a<angle>-t<seconds>.png. Set REFL=0 to skip the reflection pass
// (much faster); set CHROMIUM_PATH to another Chrome/Chromium; set WORKERS to change the parallelism.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [port, outDir, tag, ...specs] = process.argv.slice(2);
if (!port || !outDir || !tag || !specs.length) {
  console.error(
    "usage: node tools/render-harness/shoot.mjs <port> <outDir> <tag> mode,island,angle,t ...",
  );
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const queue = [...specs];
const worker = async () => {
  for (let spec; (spec = queue.shift()); ) {
    const [m, i = "0", a = "0", t = "4", sp = "0"] = spec.split(",");
    const page = await browser.newPage({
      viewport: { width: 1500, height: 700 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text().slice(0, 400));
      if (msg.type() === "log")
        console.log("  log", spec, msg.text().slice(0, 300));
    });
    try {
      const url = `http://localhost:${port}/tools/render-harness/preview.html?m=${m}&i=${i}&a=${a}&t=${t}&sp=${sp}&refl=${process.env.REFL ?? 1}`;
      await page.goto(url, { timeout: 240000 });
      await page.waitForFunction(() => window.__done, null, {
        timeout: 300000,
      });
    } catch (e) {
      errors.push(String(e).slice(0, 200));
    }
    console.log(spec, errors.filter((e) => !/404/.test(e)).slice(0, 3));
    await page.screenshot({
      path: `${outDir}/${tag}-${m}-i${i}-a${a}-t${t}${+sp ? `-sp${sp}` : ""}.png`,
    });
    await page.close();
  }
};
await Promise.all(
  Array.from({ length: Number(process.env.WORKERS || 4) }, worker),
);
await browser.close();
