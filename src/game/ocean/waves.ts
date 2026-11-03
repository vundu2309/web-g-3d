// Shared Gerstner field. CPU sampling inverts horizontal displacement for buoyancy.
export const waves = [
  { x: 0.94, z: 0.34, frequency: 0.42, speed: 1.15, amplitude: 0.46 },
  { x: 0.73, z: 0.68, frequency: 0.79, speed: 1.63, amplitude: 0.2 },
  { x: -0.52, z: 0.85, frequency: 1.14, speed: 1.93, amplitude: 0.1 },
  { x: 0.97, z: -0.24, frequency: 1.91, speed: 2.49, amplitude: 0.038 },
] as const;
export function heightAt(
  x: number,
  z: number,
  time: number,
  strength: number,
): number {
  let px = x,
    pz = z;
  for (let i = 0; i < 4; i++) {
    let dx = 0,
      dz = 0;
    for (const w of waves) {
      const len = Math.hypot(w.x, w.z);
      const a =
        ((px * w.x) / len + (pz * w.z) / len) * w.frequency + time * w.speed;
      dx += (w.x / len) * 0.65 * w.amplitude * strength * Math.cos(a);
      dz += (w.z / len) * 0.65 * w.amplitude * strength * Math.cos(a);
    }
    px = x - dx;
    pz = z - dz;
  }
  return waves.reduce(
    (h, w) =>
      h +
      Math.sin(
        ((px * w.x + pz * w.z) / Math.hypot(w.x, w.z)) * w.frequency +
          time * w.speed,
      ) *
        w.amplitude *
        strength,
    0,
  );
}
