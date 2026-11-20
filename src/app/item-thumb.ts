import type { Creature } from "../ocean/creature-geometry.ts";
import { projectCreature } from "../ocean/creature-thumb.ts";
import { baitFile } from "../ocean/bait-view.ts";
import { cachedFishModel, loadFishModel } from "../ocean/fish-models.ts";
import { creatureOf } from "../ocean/glb-parts.ts";
import { boatCreature } from "../ocean/boat-picture.ts";
import { boatTier } from "../ocean/boat-tier.ts";
import { cachedMeshModel, loadMeshModel } from "../ocean/mesh-models.ts";
import { boatPalettes } from "../ocean/palette.ts";
import { rodCreature } from "../ocean/rod-geometry.ts";
import type { ShopKind } from "../ocean/upgrade-view.ts";

/**
 * The pictures of the things the market and the shipyard sell (rods, baits and boats), drawn from
 * the game's own 3D data with the painter of the fish store (ocean/creature-thumb.ts, no second WebGL context): a
 * bait from its model file (public/models/bait-*.glb, the file the line draws), a rod from its plan
 * (ocean/rod-geometry.ts, the plan the boat's rod is built from). Each is painted once to a small
 * canvas on first use and kept as a data URL, so opening the hub again costs nothing. A picture
 * that cannot be had (a model file that did not load, no canvas) leaves the card's glyph.
 */
const cache = new Map<string, string>();

/** The picture's shape (height over width), known before it is drawn so a card does not jump. */
export const THUMB_RATIO = 0.7;

/** Paints `creature` into a PNG data URL of about `size` px wide (twice that on the canvas), or "" without a canvas. */
export function paintCreature(
  creature: Creature,
  size: number,
  yaw: number,
  pitch: number,
): string {
  try {
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = size * scale;
    canvas.height = Math.round(size * THUMB_RATIO * scale);
    const context = canvas.getContext("2d");
    if (!context) return "";
    const thumb = projectCreature(creature, yaw, pitch);
    const width = thumb.maxX - thumb.minX || 1;
    const height = thumb.maxY - thumb.minY || 1;
    const fit = Math.min(
      (canvas.width * 0.92) / width,
      (canvas.height * 0.92) / height,
    );
    const offsetX = (canvas.width - width * fit) / 2 - thumb.minX * fit;
    const offsetY = (canvas.height - height * fit) / 2 - thumb.minY * fit;
    context.lineJoin = "round";
    context.lineWidth = 0.8;
    for (const triangle of thumb.triangles) {
      const [r, g, b] = triangle.color;
      const paint = `rgb(${Math.round(r * 255 * triangle.light)},${Math.round(g * 255 * triangle.light)},${Math.round(b * 255 * triangle.light)})`;
      context.fillStyle = paint;
      context.strokeStyle = paint;
      const p = triangle.points;
      context.beginPath();
      context.moveTo(p[0] * fit + offsetX, p[1] * fit + offsetY);
      context.lineTo(p[2] * fit + offsetX, p[3] * fit + offsetY);
      context.lineTo(p[4] * fit + offsetX, p[5] * fit + offsetY);
      context.closePath();
      context.fill();
      context.stroke();
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/** The picture of a rod tier (0 to 3), `size` px wide; "" when it cannot be drawn. */
export function rodThumb(tier: number, size = 120): string {
  const key = `rod:${tier}:${size}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  // The bamboo rod's thread is the boat's own colour: the first boat's trim in the picture.
  const url = paintCreature(
    rodCreature(tier, boatPalettes[0]!.trim),
    size,
    -0.3,
    0.12,
  );
  cache.set(key, url);
  return url;
}

/** The picture of a bait tier (0 to 3) once its model has loaded; "" before that. */
export function baitThumb(tier: number, size = 120): string {
  const file = baitFile(tier);
  const template = cachedFishModel(file);
  if (!template) return "";
  const key = `bait:${tier}:${size}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const url = paintCreature(creatureOf(template), size, -0.45, 0.28);
  cache.set(key, url);
  return url;
}

/** The picture of a boat tier (0 to 3) once its model has loaded; "" before that. */
export function boatThumb(tier: number, size = 120): string {
  const { file } = boatTier(tier);
  const model = cachedMeshModel(file);
  if (!model) return "";
  const key = `boat:${tier}:${size}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const url = paintCreature(
    boatCreature(model.main, model.size),
    size,
    -0.5,
    0.25,
  );
  cache.set(key, url);
  return url;
}

/**
 * Puts the picture of a shop item in `holder` in place of its glyph: a rod at once, a bait when its
 * model file has loaded (fetched first if it has not). If the picture cannot be had the glyph stays.
 */
export function showItemThumb(
  holder: HTMLElement,
  kind: ShopKind,
  tier: number,
  size = 72,
) {
  const put = (url: string) => {
    // (A holder the page has since redrawn just gets a picture nobody sees.)
    if (!url) return;
    const picture = document.createElement("img");
    picture.alt = "";
    picture.draggable = false;
    picture.width = size;
    picture.height = Math.round(size * THUMB_RATIO);
    picture.src = url;
    holder.replaceChildren(picture);
  };
  if (kind === "rod") put(rodThumb(tier, size));
  else if (kind === "boat") {
    const { file } = boatTier(tier);
    if (cachedMeshModel(file)) put(boatThumb(tier, size));
    else void loadMeshModel(file).then(() => put(boatThumb(tier, size)));
  } else if (cachedFishModel(baitFile(tier))) put(baitThumb(tier, size));
  else
    void loadFishModel(baitFile(tier)).then(() => put(baitThumb(tier, size)));
}
