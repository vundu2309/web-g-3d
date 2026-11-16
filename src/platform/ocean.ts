import type { Boat } from "../ocean/model";
export async function connectOcean(
  onBoats: (boats: Boat[], serverTime: number) => void,
  onError: (error: unknown) => void,
  signal: AbortSignal,
) {
  return (await import("./ocean-socket")).connectOcean(
    onBoats,
    onError,
    signal,
  );
}
