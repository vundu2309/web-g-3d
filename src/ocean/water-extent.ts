/**
 * How far the water disc reaches, as plain numbers (no Babylon, so it is tested directly). The
 * disc follows the camera, so its edge must lie where the fog has already turned the water into
 * the colour of the sky; if it ends sooner, a high camera sees the edge and the far backdrop
 * islands (340 to 420 m out) hang over the gap like floating things.
 */
export const NEAR_RINGS = 56;
/** The near rings, dense so the waves stay smooth where they are seen: out to this radius (m). */
export const NEAR_RADIUS = 480;
export const FAR_RINGS = 8;
/** The outermost ring (m): the fog (FOG_DENSITY in sea-style.ts) has hidden the water by then. */
export const WATER_RADIUS = 3000;

/** The ring radii from the centre outward: the dense near rings, then a few that grow geometrically. */
export function waterRingRadii(): number[] {
  const radii: number[] = [];
  for (let ring = 1; ring <= NEAR_RINGS; ring++)
    radii.push(4 * Math.pow(ring / NEAR_RINGS, 2.2) * 120);
  const growth = Math.pow(WATER_RADIUS / NEAR_RADIUS, 1 / FAR_RINGS);
  for (let ring = 1; ring <= FAR_RINGS; ring++)
    radii.push(NEAR_RADIUS * Math.pow(growth, ring));
  return radii;
}
