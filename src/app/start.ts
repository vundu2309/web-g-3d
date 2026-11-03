import { Engine } from '@babylonjs/core/Engines/engine';
import { createPhysics } from '../platform/physics';
import { createPlayground } from '../game/playground';

export async function start(canvas: HTMLCanvasElement, dropButton: HTMLButtonElement): Promise<() => void> {
  const physics = await createPhysics();
  let engine: Engine;
  try {
    engine = new Engine(canvas, true);
  } catch (error) {
    physics.dispose();
    throw error;
  }
  try {
    const playground = createPlayground(engine, canvas, physics);
    const resize = () => engine.resize();
    const drop = () => playground.drop();
    window.addEventListener('resize', resize);
    dropButton.addEventListener('click', drop);
    engine.runRenderLoop(() => playground.scene.render());
    dropButton.disabled = false;
    return () => {
      dropButton.disabled = true;
      window.removeEventListener('resize', resize);
      dropButton.removeEventListener('click', drop);
      engine.stopRenderLoop();
      playground.dispose();
      engine.dispose();
    };
  } catch (error) {
    engine.dispose();
    physics.dispose();
    throw error;
  }
}
