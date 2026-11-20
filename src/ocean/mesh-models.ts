import { parseMeshesGlb } from "./glb-parts.ts";

/**
 * Fetches and keeps the whole-model GLB files that are drawn as one mesh or shown as a picture (the
 * boats on the shipyard's cards; fish-models.ts does the same for the sea animals). Each file is
 * downloaded once per page and parsed (glb-parts.ts `parseMeshesGlb`). A caller gets `undefined`
 * for a file that is not loaded yet or that failed.
 */
type Parsed = ReturnType<typeof parseMeshesGlb>;
const models = new Map<string, Parsed>();
const pending = new Map<string, Promise<Parsed | undefined>>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 30_000;

const base = () => {
  const env = import.meta.env as { BASE_URL?: string } | undefined;
  return env?.BASE_URL ?? "./";
};

/** The parsed model once it has loaded, else undefined. */
export const cachedMeshModel = (file: string) => models.get(file);

/** The file's model; resolves undefined (with one console warning) if it cannot be had. */
export function loadMeshModel(
  file: string,
  now: () => number = Date.now,
): Promise<Parsed | undefined> {
  const known = models.get(file);
  if (known) return Promise.resolve(known);
  const running = pending.get(file);
  if (running) return running;
  const failed = failedAt.get(file);
  if (failed !== undefined && now() - failed < RETRY_AFTER_MS)
    return Promise.resolve(undefined);
  const job = (async () => {
    try {
      const response = await fetch(`${base()}models/${file}`);
      if (!response.ok) throw new Error(`${response.status} for ${file}`);
      const parsed = parseMeshesGlb(await response.arrayBuffer());
      models.set(file, parsed);
      failedAt.delete(file);
      return parsed;
    } catch (error) {
      failedAt.set(file, now());
      console.warn(`The model ${file} did not load.`, error);
      return undefined;
    } finally {
      pending.delete(file);
    }
  })();
  pending.set(file, job);
  return job;
}
