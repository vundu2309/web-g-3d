/**
 * Analytic sea surface shared by physics (CPU) and rendering (GLSL string below).
 * A sum of travelling waves with deep-water dispersion (omega = sqrt(g k)). Each wave is
 * a sharpened sine, ((1 + sin) / 2)^sharp: broad troughs and narrow crests like a real
 * sea, instead of round hills. It only displaces vertically, so the CPU and GPU heights
 * are identical by construction and the hull floats on exactly the surface the player
 * sees. The slope (waveGradient) is analytic too, so the shader needs no finite
 * differences.
 */
export interface Wave {
  /** Wavelength in metres. */
  length: number;
  /** Amplitude in metres (before the sharpening is normalised, see `terms`). */
  amplitude: number;
  /** Travel direction, radians in the XZ plane. */
  direction: number;
  phase: number;
  /** 1 is a plain sine; larger gives narrower crests and broader troughs. */
  sharp: number;
}
export const GRAVITY = 9.81;
export const WAVES: readonly Wave[] = [
  { length: 46, amplitude: 0.34, direction: 0.2, phase: 1.7, sharp: 1.5 },
  { length: 31, amplitude: 0.42, direction: 0.35, phase: 0.4, sharp: 2.2 },
  { length: 19, amplitude: 0.26, direction: -0.5, phase: 2.1, sharp: 2.4 },
  { length: 12, amplitude: 0.15, direction: 1.1, phase: 4.2, sharp: 2.6 },
  { length: 7.5, amplitude: 0.09, direction: -1.25, phase: 1.3, sharp: 2.8 },
  { length: 4.2, amplitude: 0.05, direction: 0.8, phase: 5.5, sharp: 3 },
  { length: 2.7, amplitude: 0.025, direction: -0.15, phase: 3.3, sharp: 3 },
];

/** The mean of ((1 + sin) / 2)^sharp over a period, so every wave averages to zero. */
function meanOfSharpened(sharp: number) {
  const samples = 4096;
  let sum = 0;
  for (let i = 0; i < samples; i++)
    sum += Math.pow(0.5 + 0.5 * Math.sin((i / samples) * Math.PI * 2), sharp);
  return sum / samples;
}

const terms = WAVES.map((wave) => {
  const k = (Math.PI * 2) / wave.length;
  // f = 2 u^s - 1 - m has zero mean (m = 2 mean(u^s) - 1) and |f| <= 1 + |m| after
  // dividing, so the sum stays inside the summed amplitudes.
  const m = 2 * meanOfSharpened(wave.sharp) - 1;
  const scale = wave.amplitude / (1 + Math.abs(m));
  return {
    k,
    length: wave.length,
    sharp: wave.sharp,
    m,
    scale,
    omega: Math.sqrt(GRAVITY * k),
    dx: Math.cos(wave.direction),
    dz: Math.sin(wave.direction),
    phase: wave.phase,
  };
});

/** Sum of the wave amplitudes: the sea never rises or falls farther than this. */
export const MAX_WAVE_HEIGHT = WAVES.reduce((s, w) => s + w.amplitude, 0);

/** Sea surface height in metres at world (x, z) and time t in seconds. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of terms) {
    const u =
      0.5 + 0.5 * Math.sin(w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase);
    h += w.scale * (2 * Math.pow(u, w.sharp) - 1 - w.m);
  }
  return h;
}

/** Slope of the surface, dh/dx and dh/dz, exact (not a finite difference). */
export function waveGradient(
  x: number,
  z: number,
  t: number,
): { x: number; z: number } {
  let gx = 0;
  let gz = 0;
  for (const w of terms) {
    const theta = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
    const u = 0.5 + 0.5 * Math.sin(theta);
    const slope =
      w.scale * w.sharp * Math.pow(u, w.sharp - 1) * Math.cos(theta) * w.k;
    gx += slope * w.dx;
    gz += slope * w.dz;
  }
  return { x: gx, z: gz };
}

/**
 * The same functions as GLSL, built from WAVES so the shader can never drift from the
 * CPU. `waveHeight` is what the vertex shader displaces by (exactly the CPU height).
 * `waveSurface` also returns the slope, with each wave's slope faded out with the
 * distance to the camera in proportion to its wavelength: far away the short waves
 * would only shimmer. The fade is only in the slope, never in the height.
 */
export function glslWaveHeight(): string {
  const f = (n: number) => n.toFixed(6);
  const height = terms.map(
    (w) =>
      `  h += ${f(w.scale)} * (2.0 * pow(0.5 + 0.5 * sin(${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.omega)} * t + ${f(w.phase)}), ${f(w.sharp)}) - ${f(1 + w.m)});`,
  );
  // Waves whose slope has faded to nothing are skipped, so the far sea (most of the
  // screen) pays only for its long swell.
  const surface = terms.map(
    (w) => `  {
    float fade = 1.0 - smoothstep(${f(w.length * 12)}, ${f(w.length * 45)}, dist);
    if (fade > 0.0) {
      float th = ${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.omega)} * t + ${f(w.phase)};
      float u = max(0.5 + 0.5 * sin(th), 0.0);
      float s = ${f(w.scale * w.sharp * w.k)} * pow(u, ${f(w.sharp - 1)}) * cos(th) * fade;
      grad += s * vec2(${f(w.dx)}, ${f(w.dz)});
    }
  }`,
  );
  return `float waveHeight(vec2 p, float t) {
  float h = 0.0;
${height.join("\n")}
  return h;
}
vec2 waveSlope(vec2 p, float t, float dist) {
  vec2 grad = vec2(0.0);
${surface.join("\n")}
  return grad;
}`;
}
