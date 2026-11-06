/**
 * The colour of the browser or system bar around the page (status bar on Android, the
 * toolbar tint in Safari). It is set to the colour at the very top of what is on screen,
 * so the bar blends with the picture instead of showing as a solid strip. The colours
 * live here, next to the one function that writes the `theme-color` meta tag.
 */
export const CHROME_COLORS = {
  /** The top of the harbor sky (src/ui/hub-art.ts). */
  harbor: "#4b3a8f",
  /** The sky at the top of the sea view (about the middle of its gradient). */
  sea: "#9cc6ee",
} as const;

/** Sets the bar colour and returns the previous one, so a screen can give it back. */
export function setChromeColor(color: string): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) return undefined;
  const previous = meta.content;
  meta.content = color;
  return previous;
}
