import { buildCreature } from "../ocean/creatures";
import { projectCreature } from "../ocean/creature-thumb";
import type { Species } from "../ocean/fishing";

/**
 * The picture of a species in the fish store: its 3D model drawn once to a small canvas
 * (no second WebGL context) and kept as a data URL. Only table data goes in.
 */
const cache = new Map<string, string>();

export function fishThumb(species: Species, size = 120): string {
  const key = `${species.id}:${size}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  let url = "";
  try {
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = size * scale;
    canvas.height = Math.round(size * 0.7 * scale);
    const context = canvas.getContext("2d");
    if (context) {
      const thumb = projectCreature(
        buildCreature(species.shape, species.body, species.fin),
      );
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
