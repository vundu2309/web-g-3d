// Shared Gerstner field. CPU sampling inverts horizontal displacement for buoyancy.
// Fixed seed keeps the same sea on every launch, without a short repeating tile.
export const waves = Array.from({ length: 14 }, (_, i) => {
  const angle = [
    0.31, 1.42, -0.72, 2.18, 0.88, -1.13, 2.75, 0.12, -2.3, 1.84, -0.38, 2.43,
    0.57, -1.74,
  ][i]!;
  const frequency = 0.24 * Math.pow(1.285, i);
  return {
    x: Math.cos(angle),
    z: Math.sin(angle),
    frequency,
    speed: Math.sqrt(9.81 * frequency),
    amplitude: 0.29 * Math.pow(0.77, i),
    phase: i * 2.399963,
    packet: 0.035 + i * 0.0061,
  };
});
export function envelope(
  w: (typeof waves)[number],
  x: number,
  z: number,
  time: number,
): number {
  const phase = (-x * w.z + z * w.x) * w.packet + time * 0.13 + w.phase;
  return 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(phase), 2);
}
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
        ((px * w.x) / len + (pz * w.z) / len) * w.frequency +
        time * w.speed +
        w.phase;
      dx +=
        (w.x / len) *
        0.65 *
        w.amplitude *
        envelope(w, px, pz, time) *
        strength *
        Math.cos(a);
      dz +=
        (w.z / len) *
        0.65 *
        w.amplitude *
        envelope(w, px, pz, time) *
        strength *
        Math.cos(a);
    }
    px = x - dx;
    pz = z - dz;
  }
  return waves.reduce(
    (h, w) =>
      h +
      Math.sin(
        ((px * w.x + pz * w.z) / Math.hypot(w.x, w.z)) * w.frequency +
          time * w.speed +
          w.phase,
      ) *
        w.amplitude *
        envelope(w, px, pz, time) *
        strength,
    0,
  );
}
