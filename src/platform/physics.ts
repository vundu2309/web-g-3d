import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

// Keep the WASM URL in Vite's asset graph; no runtime CDN is required.
export async function createPhysics(): Promise<HavokPlugin> {
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  return new HavokPlugin(true, havok);
}
