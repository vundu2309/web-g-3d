import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { distanceAmount } from "./distance-fade.ts";
import { EVENT_RADIUS, type WorldEvent } from "./world-event.ts";

/**
 * The ring of the hourly event on the water (decision 0020): a flat glowing ring where a lure
 * fishes for giants, and a tall thin beam so it can be seen from far. Two meshes, one draw each,
 * built only while an event is on and the camera is within `SHOW` metres, switched off otherwise;
 * additive, so it adds light and hides nothing. The names start with `gear-ring-` so the water's
 * mirror leaves them out (reflection-model.ts). Purely a look.
 */
const SHOW = 900;
const BAND = 250;
const BEAM_HEIGHT = 140;

const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function ringTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture("event-ring", 256, scene, true);
  const c = texture.getContext() as CanvasRenderingContext2D;
  c.clearRect(0, 0, 256, 256);
  const g = c.createRadialGradient(128, 128, 60, 128, 128, 126);
  g.addColorStop(0, "rgba(255,211,90,0)");
  g.addColorStop(0.55, "rgba(255,211,90,0.15)");
  g.addColorStop(0.82, css(PAL.market.coin));
  g.addColorStop(0.9, "#ffffff");
  g.addColorStop(1, "rgba(255,211,90,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function beamTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture(
    "event-beam",
    { width: 32, height: 128 },
    scene,
    true,
  );
  const c = texture.getContext() as CanvasRenderingContext2D;
  const g = c.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, "rgba(255,230,140,0.85)");
  g.addColorStop(1, "rgba(255,230,140,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 128);
  const side = c.createLinearGradient(0, 0, 32, 0);
  side.addColorStop(0, "rgba(0,0,0,1)");
  side.addColorStop(0.5, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,1)");
  c.globalCompositeOperation = "destination-out";
  c.fillStyle = side;
  c.fillRect(0, 0, 32, 128);
  texture.hasAlpha = true;
  texture.update();
  return texture;
}

function additive(
  scene: Scene,
  name: string,
  texture: DynamicTexture,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.emissiveColor = Color3.White();
  m.diffuseTexture = texture;
  m.useAlphaFromDiffuseTexture = true;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.alphaMode = Constants.ALPHA_ADD;
  m.alpha = 0.999;
  return m;
}

export class EventRing {
  private ring: Mesh | undefined;
  private beam: Mesh | undefined;
  private materials: StandardMaterial[] = [];
  private textures: DynamicTexture[] = [];
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private build() {
    const scene = this.scene;
    const ringTex = ringTexture(scene);
    const beamTex = beamTexture(scene);
    this.textures = [ringTex, beamTex];
    const ringMat = additive(scene, "event-ring", ringTex);
    const beamMat = additive(scene, "event-beam", beamTex);
    this.materials = [ringMat, beamMat];
    const ring = MeshBuilder.CreateGround(
      "gear-ring-event",
      { width: 1, height: 1 },
      scene,
    );
    ring.material = ringMat;
    ring.isPickable = false;
    ring.alwaysSelectAsActiveMesh = true;
    const beam = MeshBuilder.CreatePlane(
      "gear-ring-event-beam",
      { width: 1, height: 1 },
      scene,
    );
    beam.material = beamMat;
    beam.billboardMode = 2; // faces the camera round the vertical axis
    beam.isPickable = false;
    beam.alwaysSelectAsActiveMesh = true;
    this.ring = ring;
    this.beam = beam;
  }

  /**
   * Each frame: `event` is the event now (undefined or not active: nothing drawn), `camera` where
   * the player looks from, `time` the sea's clock, `height` the sea's height at the ring.
   */
  update(
    event: WorldEvent | undefined,
    camera: { x: number; z: number },
    time: number,
    height: (x: number, z: number) => number,
  ) {
    const distance = event?.active
      ? Math.hypot(event.x - camera.x, event.z - camera.z)
      : Infinity;
    const amount = event?.active ? distanceAmount(distance, SHOW, BAND) : 0;
    if (amount <= 0 || !event) {
      this.ring?.setEnabled(false);
      this.beam?.setEnabled(false);
      return;
    }
    if (!this.ring) this.build();
    const ring = this.ring!;
    const beam = this.beam!;
    ring.setEnabled(true);
    beam.setEnabled(true);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.6);
    const size = 2 * EVENT_RADIUS * (1 + 0.03 * pulse);
    ring.scaling.set(size, 1, size);
    ring.position.set(event.x, height(event.x, event.z) + 0.2, event.z);
    this.materials[0]!.alpha = Math.max(0.01, (0.6 + 0.3 * pulse) * amount);
    // The beam: thin, tall, bright from far, fading out when the camera is close to it.
    const width = Math.max(3, distance * 0.012);
    beam.scaling.set(width, BEAM_HEIGHT, 1);
    beam.position.set(event.x, BEAM_HEIGHT / 2, event.z);
    this.materials[1]!.alpha = Math.max(
      0.01,
      0.55 * amount * Math.min(1, distance / 120),
    );
  }

  dispose() {
    this.ring?.dispose();
    this.beam?.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.ring = undefined;
    this.beam = undefined;
  }
}
