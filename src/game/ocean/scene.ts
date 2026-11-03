import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";
import {
  createOceanMaterial,
  createSkyMaterial,
  sunDirection,
} from "./materials";
import { createBoat } from "./boat";
import { heightAt } from "./waves";

export function createOceanScene(engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.6, 0.75, 0.8, 1);
  const mobile = engine.getRenderWidth() < 600;
  const camera = new ArcRotateCamera(
    "ocean-camera",
    -1.15,
    1.36,
    mobile ? 38 : 26,
    new Vector3(0, mobile ? 4.5 : 2.5, 0),
    scene,
  );
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 60;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = 1.47;
  camera.wheelPrecision = 7;
  camera.pinchPrecision = 60;
  camera.panningSensibility = 0;
  camera.maxZ = 2200;
  camera.attachControl(canvas, true);
  const ambient = new HemisphericLight("sky-light", Vector3.Up(), scene);
  ambient.intensity = 0.9;
  ambient.groundColor = new Color3(0.13, 0.28, 0.32);
  const sun = new DirectionalLight("sun", sunDirection.negate(), scene);
  sun.intensity = 1.6;
  sun.diffuse = new Color3(1, 0.82, 0.58);
  const sky = MeshBuilder.CreateSphere(
    "sky",
    { diameter: 1800, segments: 24 },
    scene,
  );
  sky.material = createSkyMaterial(scene);
  sky.isPickable = false;
  sky.infiniteDistance = true;
  const water = MeshBuilder.CreateGround(
    "ocean",
    { width: 160, height: 160, subdivisions: 180 },
    scene,
  );
  const material = createOceanMaterial(scene);
  water.material = material;
  water.isPickable = false;
  material.setVector3("sunDirection", sunDirection);
  material.setFloat("innerCutout", 0);
  const horizon = MeshBuilder.CreateGround(
    "distant-ocean",
    { width: 1400, height: 1400, subdivisions: 120 },
    scene,
  );
  const horizonMaterial = createOceanMaterial(scene);
  horizon.material = horizonMaterial;
  horizon.isPickable = false;
  horizonMaterial.setFloat("innerCutout", 79.9);
  horizonMaterial.setVector3("sunDirection", sunDirection);
  const boat = createBoat(scene);
  boat.rotation.y = 0.55;
  boat.position.x = mobile ? 0 : 3.5;
  let time = 0;
  let strength = 0.8;
  let rough = false;
  const observer = scene.onBeforeRenderObservable.add(() => {
    time += Math.min(engine.getDeltaTime() / 1000, 0.05);
    strength += ((rough ? 1.5 : 0.8) - strength) * 0.025;
    for (const surface of [material, horizonMaterial]) {
      surface.setFloat("time", time);
      surface.setVector3("boatPosition", boat.position);
      surface.setFloat("strength", strength);
      surface.setVector3("cameraPosition", camera.globalPosition);
    }
    boat.position.y = heightAt(boat.position.x, 0, time, strength) + 0.03;
    boat.rotation.x = Math.atan2(
      heightAt(boat.position.x, -1, time, strength) -
        heightAt(boat.position.x, 1, time, strength),
      2,
    );
    boat.rotation.z = Math.atan2(
      heightAt(boat.position.x + 1, 0, time, strength) -
        heightAt(boat.position.x - 1, 0, time, strength),
      2,
    );
  });
  return {
    scene,
    toggleWaves() {
      rough = !rough;
      return rough;
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      scene.dispose();
    },
  };
}
