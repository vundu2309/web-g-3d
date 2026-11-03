// Shared wave field: visuals and floating objects sample the same surface.
export const waves = [
  { x: 0.9, z: 0.44, frequency: 0.38, speed: 1.1, amplitude: 0.38 },
  { x: -0.4, z: 0.92, frequency: 0.71, speed: 1.5, amplitude: 0.18 },
  { x: 0.7, z: -0.71, frequency: 1.3, speed: 2.0, amplitude: 0.07 },
] as const;
export function heightAt(
  x: number,
  z: number,
  time: number,
  strength: number,
): number {
  return waves.reduce(
    (height, wave) =>
      height +
      Math.sin((x * wave.x + z * wave.z) * wave.frequency + time * wave.speed) *
        wave.amplitude *
        strength,
    0,
  );
}
