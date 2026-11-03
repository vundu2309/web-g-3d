import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import { createOceanSurface } from "./surface";
import { OceanSpectrum } from "./waves";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";

export function createOceanScene(engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.6, 0.75, 0.8, 1);
  const mobile = engine.getRenderWidth() < 600;
  const camera = new ArcRotateCamera(
    "ocean-camera",
    -1.15,
    1.51,
    mobile ? 34 : 24,
    new Vector3(0, mobile ? 1.8 : 0.6, 0),
    scene,
  );
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 60;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = 1.54;
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
  const water = createOceanSurface(scene);
  const spectrum = new OceanSpectrum();
  const field = RawTexture.CreateRGBATexture(
    spectrum.displacement,
    spectrum.size,
    spectrum.size,
    scene,
    false,
    false,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_FLOAT,
  );
  const surfaceField = RawTexture.CreateRGBATexture(
    spectrum.surface,
    spectrum.size,
    spectrum.size,
    scene,
    false,
    false,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_FLOAT,
  );
  field.wrapU =
    field.wrapV =
    surfaceField.wrapU =
    surfaceField.wrapV =
      Constants.TEXTURE_WRAP_ADDRESSMODE;
  const material = createOceanMaterial(scene);
  water.material = material;
  material.setTexture("displacementMap", field);
  material.setTexture("surfaceMap", surfaceField);
  material.setVector3("sunDirection", sunDirection);
  const boat = createBoat(scene);
  boat.rotation.y = 0.55;
  boat.position.set(mobile ? -5 : 9, 0, 14);
  const inverseViewProjection = Matrix.Identity();
  let time = 0;
  let strength = 0.8;
  let rough = false;
  const observer = scene.onBeforeRenderObservable.add(() => {
    time += Math.min(engine.getDeltaTime() / 1000, 0.05);
    strength += ((rough ? 1.5 : 0.8) - strength) * 0.025;
    spectrum.update(time, strength);
    field.update(spectrum.displacement);
    surfaceField.update(spectrum.surface);
    scene.getTransformMatrix().invertToRef(inverseViewProjection);
    material.setMatrix("inverseViewProjection", inverseViewProjection);
    material.setFloat("time", time);
    material.setVector3("cameraPosition", camera.globalPosition);
    boat.position.y =
      spectrum.heightAt(boat.position.x, boat.position.z) + 0.03;
    boat.rotation.x = Math.atan2(
      spectrum.heightAt(boat.position.x, boat.position.z - 1) -
        spectrum.heightAt(boat.position.x, boat.position.z + 1),
      2,
    );
    boat.rotation.z = Math.atan2(
      spectrum.heightAt(boat.position.x + 1, boat.position.z) -
        spectrum.heightAt(boat.position.x - 1, boat.position.z),
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
