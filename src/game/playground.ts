import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { Scene } from '@babylonjs/core/scene';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';

export interface Playground {
  readonly scene: Scene;
  drop(): void;
  dispose(): void;
}

export function createPlayground(engine: Engine, canvas: HTMLCanvasElement, physics: HavokPlugin): Playground {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.035, 0.055, 0.1, 1);
  scene.enablePhysics(new Vector3(0, -9.81, 0), physics);
  const camera = new ArcRotateCamera('orbit', -Math.PI / 2.5, Math.PI / 3, 19, new Vector3(0, 2, 0), scene);
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 35;
  camera.attachControl(canvas, true);
  new HemisphericLight('sky', new Vector3(0, 1, 0), scene);

  const groundMaterial = new StandardMaterial('ground-material', scene);
  groundMaterial.diffuseColor = new Color3(0.13, 0.22, 0.29);
  const boxMaterial = new StandardMaterial('box-material', scene);
  boxMaterial.diffuseColor = new Color3(0.25, 0.85, 0.68);
  const ground = MeshBuilder.CreateBox('ground', { width: 18, depth: 18, height: 1 }, scene);
  ground.position.y = -0.5;
  ground.material = groundMaterial;
  const groundPhysics = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.7 }, scene);
  const boxes: { mesh: ReturnType<typeof MeshBuilder.CreateBox>; body: PhysicsAggregate }[] = [];
  const removeOldest = () => {
    const box = boxes.shift();
    if (box) { box.body.dispose(); box.mesh.dispose(); }
  };
  const drop = () => {
    // Bound both physics work and retained resources during long sessions.
    if (boxes.length >= 32) removeOldest();
    const mesh = MeshBuilder.CreateBox('dynamic-box', { size: 1 }, scene);
    mesh.position.set((Math.random() - 0.5) * 5, 8 + Math.random() * 3, (Math.random() - 0.5) * 5);
    mesh.rotation.set(Math.random(), Math.random(), 0);
    mesh.material = boxMaterial;
    const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 1, restitution: 0.25, friction: 0.6 }, scene);
    boxes.push({ mesh, body });
  };
  for (let i = 0; i < 8; i++) drop();
  return {
    scene,
    drop,
    dispose() {
      while (boxes.length) removeOldest();
      groundPhysics.dispose();
      scene.dispose(); // Also disposes the physics engine/plugin and scene materials.
    },
  };
}
