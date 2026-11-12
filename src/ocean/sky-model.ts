/**
 * The light of the sea in one place, as GLSL shared by the sky dome and the water so they
 * always agree: an analytic sky (colours worked out in linear light, a warm glow on the
 * horizon toward the sun, a forward-scattering halo round it, a real sun disc far brighter
 * than the sky), the sun's radiance, a filmic tone curve and the encoding to the screen.
 * The caller declares the uniforms `horizon`, `zenith` (display colours, converted to linear
 * here) and `sunDirection` (unit, pointing at the sun) before including this.
 */
export const SUN_RADIANCE = 4.2;
export const EXPOSURE = 1.0;

export const glslSkyModel = () => `
const float SUN_RADIANCE = ${SUN_RADIANCE.toFixed(2)};
const float EXPOSURE = ${EXPOSURE.toFixed(2)};
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 sunColor() { return vec3(1.0, 0.82, 0.58); }
/** Sky radiance looking along d; the sun disc itself is added only when asked. */
vec3 skyRadiance(vec3 d, bool withSun) {
  vec3 sunDir = normalize(sunDirection);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 horizonL = toLinear(horizon);
  vec3 zenithL = toLinear(zenith);
  vec3 color = mix(horizonL, zenithL, pow(up, 0.45));
  float toSun = max(dot(d, sunDir), 0.0);
  // The sky is brighter and warmer on the sun's side, most of all near the horizon.
  vec2 flatD = normalize(d.xz + vec2(1.0e-4));
  vec2 flatSun = normalize(sunDir.xz + vec2(1.0e-4));
  float side = pow(max(dot(flatD, flatSun), 0.0), 3.0);
  color += sunColor() * side * exp(-up * 5.0) * 0.55;
  // Mie forward scattering: a halo round the sun.
  color += sunColor() * (pow(toSun, 6.0) * 0.28 + pow(toSun, 40.0) * 0.55);
  if (withSun) color += sunColor() * smoothstep(0.9995, 0.9999, toSun) * SUN_RADIANCE * 6.0;
  // Under the horizon the sky is the haze.
  return mix(color, horizonL * 0.9, smoothstep(0.0, -0.08, d.y));
}
/** Narkowicz's fit of the ACES filmic curve. */
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
/** Linear scene light to the colour shown on screen. */
vec3 toScreen(vec3 linear) {
  return pow(aces(linear * EXPOSURE), vec3(1.0 / 2.2));
}
`;
