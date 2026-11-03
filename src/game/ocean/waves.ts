// Shared wave field: visuals and floating objects sample the same surface.
export const waves = [
  { x: 0.94, z: 0.34, frequency: 0.31, speed: 0.91, amplitude: 0.32 },
  { x: 0.77, z: 0.64, frequency: 0.53, speed: 1.18, amplitude: 0.17 },
  { x: -0.42, z: 0.91, frequency: 0.83, speed: 1.43, amplitude: 0.095 },
  { x: 0.98, z: -0.21, frequency: 1.37, speed: 1.81, amplitude: 0.048 },
  { x: 0.61, z: 0.79, frequency: 2.13, speed: 2.28, amplitude: 0.022 },
  { x: -0.71, z: 0.7, frequency: 3.21, speed: 2.77, amplitude: 0.01 },
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
      (Math.sin(
        (x * wave.x + z * wave.z) * wave.frequency + time * wave.speed,
      ) +
        0.16 *
          Math.cos(
            2 *
              ((x * wave.x + z * wave.z) * wave.frequency + time * wave.speed),
          )) *
        wave.amplitude *
        strength,
    0,
  );
}
