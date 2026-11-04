import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

/** Version every static shell asset, including lazy routes, for offline reloads. */
export function pwaBuild() {
  let output;
  return {
    name: "photyphu-pwa",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      async function files(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        const nested = await Promise.all(
          entries.map((e) =>
            e.isDirectory()
              ? files(resolve(dir, e.name))
              : [resolve(dir, e.name)],
          ),
        );
        return nested.flat();
      }
      const paths = (await files(output))
        .filter(
          (p) =>
            !p.endsWith("/sw.js") &&
            /\.(html|js|css|woff2?|png|svg|webmanifest)$/.test(p),
        )
        .sort();
      const hash = createHash("sha256");
      for (const path of paths) {
        hash.update(relative(output, path));
        hash.update(await readFile(path));
      }
      const template = await readFile(
        new URL("./service-worker.js", import.meta.url),
        "utf8",
      );
      hash.update(template);
      const script = template
        .replace(
          '"__PWA_VERSION__"',
          JSON.stringify(hash.digest("hex").slice(0, 16)),
        )
        .replace(
          '"__PWA_ASSETS__"',
          JSON.stringify(
            paths.map((p) => relative(output, p).split("\\").join("/")),
          ),
        );
      await writeFile(resolve(output, "sw.js"), script);
    },
  };
}
