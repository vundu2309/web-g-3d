/**
 * Analytic sea surface shared by physics (CPU) and rendering (GLSL string below).
 * A sum of travelling sines with deep-water dispersion (omega = sqrt(g k)). It only
 * displaces vertically, so the CPU and GPU heights are identical by construction
 * and the hull always floats on exactly the surface the player sees.
 */
export interface Wave {
  /** Wavelength in metres. */
  length: number;
  /** Amplitude in metres. */
  amplitude: number;
  /** Travel direction, radians in the XZ plane. */
  direction: number;
  phase: number;
}
export const GRAVITY = 9.81;
export const WAVES: readonly Wave[] = [
  { length: 31, amplitude: 0.5, direction: 0.35, phase: 0.4 },
  { length: 19, amplitude: 0.3, direction: -0.5, phase: 2.1 },
  { length: 12, amplitude: 0.17, direction: 1.1, phase: 4.2 },
  { length: 7.5, amplitude: 0.09, direction: -1.25, phase: 1.3 },
  { length: 4.2, amplitude: 0.045, direction: 0.8, phase: 5.5 },
];
const terms = WAVES.map((wave) => {
  const k = (Math.PI * 2) / wave.length;
  return {
    k,
    amplitude: wave.amplitude,
    omega: Math.sqrt(GRAVITY * k),
    dx: Math.cos(wave.direction),
    dz: Math.sin(wave.direction),
    phase: wave.phase,
  };
});

/** Sea surface height in metres at world (x, z) and time t in seconds. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of terms)
    h +=
      w.amplitude *
      Math.sin(w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase);
  return h;
}

/** Same function as GLSL, built from WAVES so the shader can never drift from the CPU. */
export function glslWaveHeight(): string {
  const f = (n: number) => n.toFixed(6);
  const lines = terms.map(
    (w) =>
      `  h += ${f(w.amplitude)} * sin(${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) - ${f(w.omega)} * t + ${f(w.phase)});`,
  );
  return `float waveHeight(vec2 p, float t) {\n  float h = 0.0;\n${lines.join("\n")}\n  return h;\n}`;
}
