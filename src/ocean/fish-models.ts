import type { CreatureKind } from "./creatures.ts";
import { CREATURE_KINDS } from "./creatures.ts";
import {
  allFishFiles,
  fishFile,
  parseFishGlb,
  type FishTemplate,
} from "./glb-parts.ts";

/**
 * Fetches and keeps the sea animals' GLB files (see glb-parts.ts). Each file is downloaded once
 * per page, on first need or by `preloadFishModels`, and parsed into a template that every animal
 * of that body plan shares; the scene (creature-kit.ts) and the fish store thumbnails
 * (app/fish-thumb.ts) both read it. Nothing here blocks the game: a caller gets `undefined` for a
 * file that is not loaded yet (or failed) and draws the code-built animal instead.
 */
const templates = new Map<string, FishTemplate>();
const pending = new Map<string, Promise<FishTemplate | undefined>>();
/** When a file last failed (ms), so a dead network is not asked again at every frame. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 30_000;

const base = () => {
  const env = import.meta.env as { BASE_URL?: string } | undefined;
  return env?.BASE_URL ?? "./";
};

/** The parsed template of a file once it has loaded, else undefined. */
export const cachedFishModel = (file: string) => templates.get(file);

/** The file's template; resolves undefined (with one console warning) if it cannot be had. */
export function loadFishModel(
  file: string,
  now: () => number = Date.now,
): Promise<FishTemplate | undefined> {
  const known = templates.get(file);
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
      const template = parseFishGlb(await response.arrayBuffer());
      templates.set(file, template);
      failedAt.delete(file);
      return template;
    } catch (error) {
      failedAt.set(file, now());
      console.warn(
        `The sea animal model ${file} did not load; the animal built from code is drawn.`,
        error,
      );
      return undefined;
    } finally {
      pending.delete(file);
    }
  })();
  pending.set(file, job);
  return job;
}

/** The template for a body plan (or a species with its own file), loading it if needed. */
export const loadFishFor = (kind: CreatureKind, variant?: string) =>
  loadFishModel(fishFile(kind, variant));

/**
 * Starts downloading every file (about 1.4 MB in all), a few at a time so the first frames of the
 * sea are not starved of bandwidth. The game calls it once the scene is ready and does not wait
 * for it. Resolves when all have settled.
 */
export async function preloadFishModels(parallel = 3): Promise<void> {
  const queue = allFishFiles(CREATURE_KINDS);
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift())
      await loadFishModel(file);
  };
  await Promise.all(Array.from({ length: parallel }, worker));
}
