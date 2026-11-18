import { projectCreature } from "../ocean/creature-thumb.ts";
import { cachedFishModel, loadFishModel } from "../ocean/fish-models.ts";
import { creatureOf, fishFile } from "../ocean/glb-parts.ts";
import type { Species } from "../ocean/fishing.ts";

/**
 * The picture of a species in the fish store: its 3D model drawn once to a small canvas
 * (no second WebGL context) and kept as a data URL. The model is the same data the sea draws (see
 * ocean/glb-parts.ts). A species whose file is not loaded (yet) has no picture until it is.
 * Only table data goes in.
 */
const cache = new Map<string, string>();

export function fishThumb(species: Species, size = 120): string {
  const template = cachedFishModel(fishFile(species.id));
  if (!template) return "";
  const key = `${species.id}:${size}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const creature = creatureOf(template);
  let url = "";
  try {
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = size * scale;
    canvas.height = Math.round(size * 0.7 * scale);
    const context = canvas.getContext("2d");
    if (context) {
      const thumb = projectCreature(creature);
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
      url = canvas.toDataURL("image/png");
    }
  } catch {
    /* No canvas: the cell just has no picture. */
  }
  cache.set(key, url);
  return url;
}

/**
 * Puts a species' picture in an <img>. A loaded model is drawn at once; otherwise the file is
 * fetched first and the picture appears when it has arrived (the cell is empty for that moment).
 * If the file cannot be had the cell stays empty.
 */
export function showFishThumb(
  picture: HTMLImageElement,
  species: Species,
  size = 120,
) {
  // The picture's shape is known before it arrives, so the cell does not jump when it does.
  picture.width = size;
  picture.height = Math.round(size * 0.7);
  if (cachedFishModel(fishFile(species.id)))
    picture.src = fishThumb(species, size);
  else
    void loadFishModel(fishFile(species.id)).then(() => {
      picture.src = fishThumb(species, size);
    });
}
