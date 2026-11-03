import { Engine } from "@babylonjs/core/Engines/engine";
import { createOceanScene } from "../game/ocean/scene";

export async function start(
  canvas: HTMLCanvasElement,
  waveButton: HTMLButtonElement,
): Promise<() => void> {
  const engine = new Engine(canvas, true, {
    stencil: false,
    powerPreference: "high-performance",
  });
  // Cap render resolution on high-DPI phones; keep geometry and shaders shared.
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  try {
    const ocean = createOceanScene(engine, canvas);
    const resize = () => engine.resize();
    const toggle = () => {
      const rough = ocean.toggleWaves();
      waveButton.textContent = rough ? "Sóng mạnh ↗" : "Sóng êm ≋";
      waveButton.setAttribute("aria-pressed", String(rough));
    };
    window.addEventListener("resize", resize);
    waveButton.addEventListener("click", toggle);
    engine.runRenderLoop(() => ocean.scene.render());
    waveButton.disabled = false;
    return () => {
      waveButton.disabled = true;
      window.removeEventListener("resize", resize);
      waveButton.removeEventListener("click", toggle);
      engine.stopRenderLoop();
      ocean.dispose();
      engine.dispose();
    };
  } catch (error) {
    engine.dispose();
    throw error;
  }
}
