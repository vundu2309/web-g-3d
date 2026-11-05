import { useSupabase } from "./online-config";
import type { Boat } from "../ocean/model";
export async function connectOcean(
  onBoats: (boats: Boat[], serverTime: number) => void,
  onError: (error: unknown) => void,
  signal: AbortSignal,
) {
  const adapter = useSupabase
    ? await import("./ocean-socket")
    : await import("./ocean-firebase");
  return adapter.connectOcean(onBoats, onError, signal);
}
