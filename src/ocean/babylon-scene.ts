import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import {
  createBoatPhysics,
  enableSeaPhysics,
  type BoatPhysics,
  type BoatState,
} from "./boat-physics.ts";
import {
  boatPalettes,
  createBoatTemplate,
  createFishingLine,
  createWake,
} from "./boat-visual.ts";
import { createHavok } from "./havok.ts";
import { createIsland } from "./island-visual.ts";
import { SeaProps } from "./sea-props.ts";
import {
  islandCollisionRadius,
  islands,
  type Boat,
  type Pose,
} from "./model.ts";
import { FishingGear, type GearInput } from "./fishing-gear.ts";
import { RodVisual } from "./rod-visual.ts";
import { FOG_DENSITY, HORIZON, SUN_DIRECTION } from "./sea-style.ts";
import { edgeIndicator, separateLabels } from "./indicator.ts";
import { ScaleGovernor } from "./render-scale.ts";
import { createSky, type Sky } from "./sky.ts";
import { createWater, type Water } from "./water.ts";
import { waveHeight } from "./waves.ts";

// A tab that comes back after being hidden must not replay seconds of physics.
Scene.MaxDeltaTime = 100;

interface Craft {
  mesh: InstancedMesh;
  rod: RodVisual;
  label: HTMLElement;
  line?: Mesh;
  // Smoothed display pose of a remote boat.
  x: number;
  z: number;
  heading: number;
  seen: boolean;
}

const paletteOf = (uid: string) => {
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % boatPalettes.length;
};
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const blend = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
const NORMALIZED = new Viewport(0, 0, 1, 1);

/**
 * Babylon.js + Havok sea. The player's boat is a Havok body floating on the shared
 * wave function; other players' boats follow their published poses. Same public
 * surface the screen controller uses: spawnSelf, setInput, update, dispose.
 */
export class OceanScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly water: Water;
  private readonly sky: Sky;
  private readonly templates: Mesh[];
  private readonly fleet = new Map<string, Craft>();
  private readonly observer: ResizeObserver;
  private self:
    | {
        physics: BoatPhysics;
        craft: Craft;
        wake: ReturnType<typeof createWake>;
        uid: string;
      }
    | undefined;
  private clock = 0;
  private viewHeading = 0;
  private viewReady = false;
  private readonly governor: ScaleGovernor;
  private lost = false;
  private gear: FishingGear | undefined;
  private readonly seaProps: SeaProps;
  private gearInput: Omit<GearInput, "tip" | "time"> | undefined;
  private readonly canvas: HTMLCanvasElement;

  static async create(host: HTMLElement, onLost: () => void) {
    const plugin = await createHavok();
    return new OceanScene(host, onLost, plugin);
  }

  private constructor(
    private readonly host: HTMLElement,
    onLost: () => void,
    plugin: Awaited<ReturnType<typeof createHavok>>,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute(
      "aria-label",
      "Biển chung 3D, mỗi người chơi một thuyền",
    );
    this.canvas.className = "ocean-canvas";
    host.append(this.canvas);
    this.engine = new Engine(
      this.canvas,
      true,
      { powerPreference: "low-power", stencil: false },
      false,
    );
    // Start sharp (up to 2x the CSS size); the governor lowers it only if the phone struggles.
    this.governor = new ScaleGovernor({
      sharpest: 1 / Math.min(window.devicePixelRatio || 1, 2),
    });
    this.engine.setHardwareScalingLevel(this.governor.scaling);
    this.engine.onContextLostObservable.add(() => {
      this.lost = true;
      onLost();
    });
    this.engine.onContextRestoredObservable.add(() => {
      this.lost = false;
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(HORIZON.r, HORIZON.g, HORIZON.b, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = FOG_DENSITY;
    this.scene.fogColor = HORIZON;
    enableSeaPhysics(this.scene, plugin);
    this.camera = new FreeCamera("camera", new Vector3(0, 10, 16), this.scene);
    this.camera.inputs.clear();
    this.camera.fov = 0.9;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 3200;
    this.scene.activeCamera = this.camera;
    const sky = new HemisphericLight(
      "sky-light",
      new Vector3(0, 1, 0),
      this.scene,
    );
    sky.intensity = 0.9;
    sky.diffuse = new Color3(0.9, 0.95, 1);
    sky.groundColor = new Color3(0.32, 0.42, 0.5);
    const sun = new DirectionalLight(
      "sun",
      SUN_DIRECTION.scale(-1),
      this.scene,
    );
    sun.intensity = 1.5;
    sun.diffuse = new Color3(1, 0.94, 0.82);
    this.water = createWater(this.scene);
    this.sky = createSky(this.scene);
    this.templates = boatPalettes.map((palette, i) => {
      const template = createBoatTemplate(this.scene, palette, `boat-${i}`);
      template.isVisible = false;
      return template;
    });
    islands.forEach((island, index) => {
      const visual = createIsland(this.scene, {
        seed: 11 + index * 7,
        radius: island.radius,
        lighthouse: index === 0,
      });
      visual.mesh.position.set(island.x, 0, island.z);
      visual.mesh.freezeWorldMatrix();
      visual.foam?.position.set(island.x, 0.08, island.z);
    });
    this.seaProps = new SeaProps(this.scene);
    this.observer = new ResizeObserver(() => this.engine.resize());
    this.observer.observe(host);
    this.engine.resize();
  }

  private craft(uid: string, name: string, isSelf: boolean): Craft {
    const mesh = this.templates[paletteOf(uid)]!.createInstance(`boat-${uid}`);
    mesh.isPickable = false;
    const label = document.createElement("span");
    label.className = "ocean-boat-label";
    label.textContent = isSelf ? "Bạn" : name;
    label.dataset.uid = uid;
    if (isSelf) label.classList.add("is-self");
    this.host.append(label);
    return {
      mesh,
      rod: new RodVisual(this.scene, mesh),
      label,
      x: 0,
      z: 0,
      heading: 0,
      seen: true,
    };
  }

  /** Creates the player's physics boat at the server-assigned start pose. */
  spawnSelf(uid: string, name: string, pose: Pose) {
    if (this.self) return;
    const physics = createBoatPhysics(this.scene, {
      islands: islands.map((island) => ({
        x: island.x,
        z: island.z,
        radius: islandCollisionRadius(island),
      })),
      time: () => this.clock,
      start: { x: pose.x, z: pose.z, heading: pose.heading },
    });
    const craft = this.craft(uid, name, true);
    craft.mesh.parent = physics.mesh;
    craft.mesh.position.set(0, -0.25, 0);
    this.self = {
      physics,
      craft,
      wake: createWake(this.scene, craft.mesh),
      uid,
    };
    this.viewHeading = pose.heading;
    this.viewReady = false;
  }

  setInput(steer: number, throttle: number) {
    if (!this.self) return;
    this.self.physics.input.steer = steer;
    this.self.physics.input.throttle = throttle;
  }

  selfState(): BoatState | undefined {
    return this.self?.physics.state();
  }

  private setLine(craft: Craft, fishing: boolean) {
    if (fishing && !craft.line)
      craft.line = createFishingLine(this.scene, craft.mesh);
    if (!fishing && craft.line) {
      craft.line.dispose();
      craft.line = undefined;
    }
  }

  /** Orients a boat on the sea surface from the wave slope under it. */
  private rest(
    mesh: InstancedMesh,
    x: number,
    z: number,
    heading: number,
    t: number,
  ) {
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = Math.sin(heading);
    const bow = waveHeight(x + fx * 3.5, z + fz * 3.5, t);
    const stern = waveHeight(x - fx * 3.5, z - fz * 3.5, t);
    const starboard = waveHeight(x + rx * 1.4, z + rz * 1.4, t);
    const port = waveHeight(x - rx * 1.4, z - rz * 1.4, t);
    const pitch = Math.atan2(bow - stern, 7);
    const roll = Math.atan2(starboard - port, 2.8);
    mesh.position.set(x, (bow + stern + starboard + port) / 4, z);
    mesh.rotationQuaternion = Quaternion.RotationAxis(Axis.Y, -heading)
      .multiply(Quaternion.RotationAxis(Axis.X, pitch))
      .multiply(Quaternion.RotationAxis(Axis.Z, roll));
  }

  /** Resolves once every mesh, material and shader has been compiled for the first frame. */
  ready() {
    return this.scene.whenReadyAsync();
  }

  /** The tip of the player's rod in the world (the line starts there; the rod bends). */
  rodTip() {
    const craft = this.self?.craft;
    if (!craft) return undefined;
    craft.mesh.computeWorldMatrix(true);
    const local = craft.rod.tip();
    const tip = Vector3.TransformCoordinates(
      new Vector3(local.x, local.y, local.z),
      craft.mesh.getWorldMatrix(),
    );
    return { x: tip.x, y: tip.y, z: tip.z };
  }

  /** What the fishing gear should show this frame; undefined puts the line away. */
  setGear(input: Omit<GearInput, "tip" | "time"> | undefined) {
    this.gearInput = input;
  }

  /** The line snapped or the hook came back empty: the loose end whips back. */
  gearSnap() {
    this.gear?.snap(this.clock);
  }

  /** A landed fish hangs from the rod (undefined puts it away at once). */
  holdFish(fish: { id: string; scale: number } | undefined) {
    this.gear ??= new FishingGear(this.scene);
    this.gear.hold(fish);
  }

  /** The hanging fish is kept (rises away) or put back (falls). */
  leaveFish(kind: "keep" | "drop") {
    this.gear?.leave(kind, this.clock);
  }

  /** A ring spreads from where the line enters the water. */
  gearRipple() {
    this.gear?.ripple();
  }

  /** Where a world point is on screen (0..1 of the stage), if it is in front of the camera. */
  project(x: number, y: number, z: number) {
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      NORMALIZED,
    );
    return { x: p.x, y: p.y, visible: p.z >= 0 && p.z <= 1 };
  }

  /** Above where the line enters the water, for the on-screen bite signal. */
  entryTop() {
    return this.gear?.entryTop();
  }

  /** How far the rod is bent, 0..1 (for tests and the screen). */
  rodBend() {
    return this.self?.craft.rod.bend ?? 0;
  }

  /** Advances the world one frame and draws it. */
  update(
    boats: Boat[],
    uid: string,
    time: number,
    dt: number,
    reduced: boolean,
  ) {
    if (this.lost) return;
    this.clock = reduced ? 0 : time;
    const step = Math.min(dt, 0.1);
    const present = new Set<string>();
    for (const boat of boats) {
      if (boat.uid === uid) {
        if (this.self) {
          this.self.craft.label.dataset.x = String(this.self.physics.state().x);
          this.self.craft.label.dataset.z = String(this.self.physics.state().z);
          this.setLine(this.self.craft, boat.fishing);
        }
        continue;
      }
      present.add(boat.uid);
      let craft = this.fleet.get(boat.uid);
      if (!craft) {
        craft = this.craft(boat.uid, boat.name, false);
        craft.x = boat.x;
        craft.z = boat.z;
        craft.heading = boat.heading;
        this.fleet.set(boat.uid, craft);
      }
      // The pose is already played back between samples by the app (src/ocean/remote.ts);
      // easing it again made boats lag and smear.
      craft.x = boat.x;
      craft.z = boat.z;
      craft.heading = boat.heading;
      this.rest(craft.mesh, craft.x, craft.z, craft.heading, this.clock);
      this.setLine(craft, boat.fishing);
      craft.label.dataset.x = String(boat.x);
      craft.label.dataset.z = String(boat.z);
    }
    for (const [id, craft] of this.fleet)
      if (!present.has(id)) {
        craft.label.remove();
        craft.line?.dispose();
        craft.rod.dispose();
        craft.mesh.dispose();
        this.fleet.delete(id);
      }

    const state = this.self?.physics.state();
    if (this.self && state) {
      const speed = Math.hypot(state.forwardSpeed, state.sideSpeed);
      this.self.wake.setStrength(speed / 12);
      this.followWith(state, step);
    }
    // The line's pull bends the rod; the rod's tip is where the line starts.
    if (this.self) {
      const pull = this.gear?.pull;
      const rod = this.self.craft.rod;
      if (pull && pull.strength > 0) {
        this.self.craft.mesh.computeWorldMatrix(true);
        const inverse = this.self.craft.mesh.getWorldMatrix().clone().invert();
        const local = Vector3.TransformNormal(
          new Vector3(pull.x, pull.y, pull.z),
          inverse,
        ).normalize();
        rod.step(
          step,
          {
            x: local.x * pull.strength,
            y: local.y * pull.strength,
            z: local.z * pull.strength,
          },
          pull.shake,
        );
      } else rod.step(step, { x: 0, y: 0, z: 0 }, 0);
    }
    const tip =
      this.gearInput || this.gear?.recoiling || this.gear?.holding
        ? this.rodTip()
        : undefined;
    if (this.gearInput && tip) {
      this.gear ??= new FishingGear(this.scene);
      this.gear.update({ ...this.gearInput, tip, time: this.clock });
    } else if (tip && this.gear?.recoiling)
      this.gear.updateRecoil(tip, this.clock);
    else if (tip && this.gear?.holding) this.gear.updateHeld(tip, this.clock);
    else this.gear?.hide();
    this.seaProps.update(this.clock);
    this.water.update(
      this.camera.position.x,
      this.camera.position.z,
      this.clock,
    );
    this.sky.update(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      this.clock,
    );
    this.engine.beginFrame();
    this.scene.render();
    this.engine.endFrame();
    this.placeLabels();
    this.adapt(dt);
  }

  private followWith(state: BoatState, dt: number) {
    this.viewHeading = this.viewReady
      ? wrap(
          this.viewHeading +
            wrap(state.heading - this.viewHeading) * blend(dt, 3.2),
        )
      : state.heading;
    const fx = Math.sin(this.viewHeading);
    const fz = -Math.cos(this.viewHeading);
    // Low and far behind, looking well ahead, so the horizon and sky stay in view.
    const want = new Vector3(state.x - fx * 17, 7.6, state.z - fz * 17);
    const look = new Vector3(state.x + fx * 30, 2.2, state.z + fz * 30);
    if (!this.viewReady) {
      this.camera.position.copyFrom(want);
      this.viewReady = true;
    } else {
      this.camera.position.x +=
        (want.x - this.camera.position.x) * blend(dt, 4);
      this.camera.position.y +=
        (want.y - this.camera.position.y) * blend(dt, 4);
      this.camera.position.z +=
        (want.z - this.camera.position.z) * blend(dt, 4);
    }
    this.camera.setTarget(look);
  }

  private placeLabels() {
    const transform = this.scene.getTransformMatrix();
    const camera = this.camera.position;
    const place = (
      craft: Craft,
      x: number,
      y: number,
      z: number,
      remote: boolean,
    ) => {
      const p = Vector3.Project(
        new Vector3(x, y, z),
        Matrix.IdentityReadOnly,
        transform,
        NORMALIZED,
      );
      const visible =
        p.z >= 0 &&
        p.z <= 1 &&
        p.x > 0.04 &&
        p.x < 0.96 &&
        p.y > 0.08 &&
        p.y < 0.9;
      const label = craft.label;
      if (visible) {
        delete label.dataset.edge;
        // Far names would only clutter the horizon; the arrows and crew list cover them.
        label.hidden = Math.hypot(x - camera.x, z - camera.z) > 75;
        label.style.left = `${p.x * 100}%`;
        label.style.top = `${p.y * 100}%`;
        return;
      }
      if (!remote) {
        label.hidden = true;
        return;
      }
      // Off-screen player: an arrow with their name and distance, so nobody gets lost.
      const mark = edgeIndicator(x - camera.x, z - camera.z, this.viewHeading);
      label.hidden = false;
      label.dataset.edge = "true";
      label.dataset.distance = `${Math.round(mark.distance)} m`;
      label.style.setProperty("--turn", `${mark.turn}rad`);
      label.style.left = `${mark.x * 100}%`;
      label.style.top = `${mark.y * 100}%`;
    };
    if (this.self) {
      const s = this.self.physics.state();
      place(this.self.craft, s.x, s.y + 4.4, s.z, false);
    }
    for (const craft of this.fleet.values())
      place(
        craft,
        craft.mesh.position.x,
        craft.mesh.position.y + 6.2,
        craft.mesh.position.z,
        true,
      );
    this.separateNames();
  }

  /** Names that would overlap on screen are stacked instead (arrows are left alone). */
  private separateNames() {
    const labels = [
      ...(this.self ? [this.self.craft.label] : []),
      ...[...this.fleet.values()].map((craft) => craft.label),
    ].filter((label) => !label.hidden && !label.dataset.edge);
    if (labels.length < 2) return;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const boxes = labels.map((label) => ({
      x: (parseFloat(label.style.left) / 100) * width,
      y: (parseFloat(label.style.top) / 100) * height,
      w: label.offsetWidth,
      h: label.offsetHeight,
    }));
    const lifts = separateLabels(boxes);
    labels.forEach((label, i) => {
      const lift = lifts[i] ?? 0;
      if (lift > 0)
        label.style.top = `calc(${label.style.top} - ${Math.round(lift)}px)`;
    });
  }

  /** Slow phones render fewer pixels instead of dropping frames, and recover when fast again. */
  private adapt(dt: number) {
    const next = this.governor.sample(dt);
    if (next !== undefined) this.engine.setHardwareScalingLevel(next);
  }

  /** Frame cost, for diagnostics and tests. */
  stats() {
    return {
      meshes: this.scene.getActiveMeshes().length,
      triangles: Math.round(this.scene.getActiveIndices() / 3),
      renderScale: 1 / this.governor.scaling,
    };
  }

  dispose() {
    this.observer.disconnect();
    for (const craft of this.fleet.values()) craft.label.remove();
    this.gear?.dispose();
    this.seaProps.dispose();
    this.self?.craft.label.remove();
    this.self?.physics.dispose();
    this.fleet.clear();
    this.scene.dispose();
    this.engine.dispose();
    this.canvas.remove();
  }
}
