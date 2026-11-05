import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

/**
 * Loads Havok. The 2 MB WASM stays in Vite's asset graph (no CDN at runtime) and
 * is not in the service-worker precache: the sea is online-only, so offline
 * caching it would only make every release download it again.
 */
export async function createHavok(): Promise<HavokPlugin> {
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  return new HavokPlugin(false, havok);
}
