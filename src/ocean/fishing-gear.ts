import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { speciesById, type FishingView } from "./fishing.ts";
import { createCreature, type CreatureModel } from "./creature-kit.ts";
import { fishPose, lineColour, lineSag, lineTremble } from "./fight-look.ts";
import { hex, mergeParts, paint } from "./mesh-parts.ts";
import { waveHeight } from "./waves.ts";

/**
 * What the player sees of their own fishing: the throw preview, the bobber riding the
 * waves, the line and the ripples. All of it is a handful of small meshes created once
 * and moved every frame (no allocation per frame, no new draw calls while idle). The
 * state that drives it lives in fishing.ts; this only draws a FishingView.
 */
const POINTS = 22;
const RINGS = 3;
const RING_LIFE = 0.9;
const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));
const ease = (t: number) => t * t * (3 - 2 * t);
const RECOIL_S = 0.55;
const WHITE = new Color3(1, 1, 1);
const lineColourFor = (tension: number) => {
  const c = lineColour(tension);
  return new Color3(c.r, c.g, c.b);
};

export interface GearInput {
  view: FishingView;
  /** Rod tip in the world. */
  tip: { x: number; y: number; z: number };
  /** Where the throw would land right now (while charging). */
  preview: { x: number; z: number; sweet: boolean; water: boolean } | undefined;
  /** Scene clock in seconds. */
  time: number;
}

function ringTexture(scene: Scene) {
  const texture = new DynamicTexture("gear-ring", 128, scene, true);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(64, 64, 34, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.95)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}

function bobberMesh(scene: Scene) {
  const body = MeshBuilder.CreateSphere(
    "bobber-body",
    { diameter: 1.8, segments: 10 },
    scene,
  );
  const positions = body.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((positions.length / 3) * 4);
  const red = hex(0xe9573f);
  const white = hex(0xfff7e8);
  for (let i = 0; i < positions.length / 3; i++) {
    const paintRed = positions[i * 3 + 1]! > -0.02;
    const color = paintRed ? red : white;
    colors.set([color.r, color.g, color.b, 1], i * 4);
  }
  body.setVerticesData(VertexBuffer.ColorKind, colors);
  const stick = MeshBuilder.CreateCylinder(
    "bobber-stick",
    { diameterTop: 0.14, diameterBottom: 0.22, height: 2.4, tessellation: 6 },
    scene,
  );
  stick.position.y = 2.0;
  paint(stick, hex(0xffd35a));
  const tip = MeshBuilder.CreateSphere(
    "bobber-tip",
    { diameter: 0.5, segments: 6 },
    scene,
  );
  tip.position.y = 3.2;
  paint(tip, red);
  const merged = mergeParts("bobber", [body, stick, tip]);
  const material = new StandardMaterial("bobber-material", scene);
  material.diffuseColor = Color3.White();
  material.emissiveColor = new Color3(0.28, 0.24, 0.2);
  material.specularColor = Color3.Black();
  merged.material = material;
  merged.useVertexColors = true;
  merged.isPickable = false;
  merged.isVisible = false;
  return merged;
}

export class FishingGear {
  private readonly bobber: Mesh;
  private readonly line: LinesMesh;
  private readonly arc: LinesMesh;
  private readonly rings: Mesh[] = [];
  private readonly marker: Mesh;
  private readonly markerMaterial: StandardMaterial;
  private readonly linePoints: Vector3[] = [];
  private readonly arcPoints: Vector3[] = [];
  private readonly rippleStarts: number[] = [];
  private readonly top = new Vector3();
  private shown = false;
  private clock = 0;
  private readonly scene: Scene;
  private fish: CreatureModel | undefined;
  private fishId: string | undefined;
  private recoil = 0;
  private lastFight = false;
  private lastSplash = 0;
  private readonly recoilFrom = new Vector3();

  constructor(scene: Scene) {
    this.scene = scene;
    this.bobber = bobberMesh(scene);
    for (let i = 0; i < POINTS; i++) this.linePoints.push(new Vector3());
    for (let i = 0; i < 16; i++) this.arcPoints.push(new Vector3());
    this.line = MeshBuilder.CreateLines(
      "gear-line",
      { points: this.linePoints, updatable: true },
      scene,
    );
    this.line.color = new Color3(1, 1, 1);
    this.line.isPickable = false;
    this.line.alwaysSelectAsActiveMesh = true;
    this.arc = MeshBuilder.CreateDashedLines(
      "gear-arc",
      {
        points: this.arcPoints,
        dashSize: 1,
        gapSize: 1.4,
        dashNb: 60,
        updatable: true,
      },
      scene,
    ) as unknown as LinesMesh;
    this.arc.color = new Color3(1, 1, 1);
    this.arc.isPickable = false;
    this.arc.alwaysSelectAsActiveMesh = true;
    const texture = ringTexture(scene);
    const makeRing = (name: string) => {
      const mesh = MeshBuilder.CreateGround(
        name,
        { width: 2, height: 2 },
        scene,
      );
      const material = new StandardMaterial(`${name}-material`, scene);
      material.diffuseTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
      material.emissiveColor = Color3.White();
      material.disableLighting = true;
      material.backFaceCulling = false;
      material.alpha = 0;
      mesh.material = material;
      mesh.isPickable = false;
      mesh.isVisible = false;
      return { mesh, material };
    };
    for (let i = 0; i < RINGS; i++)
      this.rings.push(makeRing(`gear-ring-${i}`).mesh);
    const marker = makeRing("gear-marker");
    this.marker = marker.mesh;
    this.markerMaterial = marker.material;
    this.setVisible(false);
  }

  /** A ring spreads from the bobber (splash, nibble, bite). */
  ripple() {
    this.rippleStarts.push(this.clock);
    if (this.rippleStarts.length > RINGS) this.rippleStarts.shift();
  }

  /** World position just above the bobber, for the "!" badge; undefined when out of water. */
  bobberTop(): Vector3 | undefined {
    return this.shown && this.bobber.isVisible ? this.top : undefined;
  }

  /** Everything away (line in, nothing held). */
  hide() {
    this.showFish(undefined);
    this.setVisible(false);
    this.arc.isVisible = false;
    this.marker.isVisible = false;
    for (const ring of this.rings) ring.isVisible = false;
  }

  private setVisible(on: boolean) {
    this.shown = on;
    this.bobber.isVisible = on;
    this.line.isVisible = on;
  }

  update({ view, tip, preview, time }: GearInput) {
    this.clock = time;
    const out = view.phase !== "idle" && view.phase !== "charging";
    this.setVisible(out);
    // Throw preview while the button is held.
    const charging = view.phase === "charging" && !!preview;
    this.arc.isVisible = charging;
    this.markerMaterial.alpha = 0;
    this.marker.isVisible = charging;
    if (charging && preview) {
      this.drawArc(tip, preview.x, preview.z);
      this.marker.position.set(
        preview.x,
        waveHeight(preview.x, preview.z, time) + 0.2,
        preview.z,
      );
      const pulse = 1 + 0.08 * Math.sin(time * 9);
      this.marker.scaling.set(2.6 * pulse, 1, 2.6 * pulse);
      this.markerMaterial.alpha = 0.95;
      this.markerMaterial.emissiveColor = !preview.water
        ? new Color3(1, 0.35, 0.3)
        : preview.sweet
          ? new Color3(0.45, 1, 0.6)
          : Color3.White();
    }
    let ringsOn = false;
    if (out && view.landing) {
      if (view.phase === "fighting" && view.fight)
        this.drawFight(view, tip, time);
      else this.drawBobber(view, tip, time);
      ringsOn = true;
    }
    this.showFish(view.phase === "fighting" ? view.species : undefined);
    this.drawRings(ringsOn ? view : undefined, time);
  }

  /** The hooked fish: built once per species, shown only while it is on the line. */
  private showFish(id: string | undefined) {
    if (id !== this.fishId) {
      this.fish?.dispose();
      this.fish = undefined;
      this.fishId = id;
      const species = id ? speciesById(id) : undefined;
      if (species)
        this.fish = createCreature(
          this.scene,
          "hooked-fish",
          species.shape,
          species.body,
          species.fin,
        );
    }
    this.fish?.root.setEnabled(id !== undefined);
  }

  /** The line is cut or the hook is empty: it whips back toward the rod for a moment. */
  snap(time: number) {
    if (!this.lastFight) return;
    this.lastFight = false;
    this.recoil = time;
    this.recoilFrom.copyFrom(this.bobber.position);
    this.showFish(undefined);
  }

  /** Whether the snapped line is still whipping back. */
  get recoiling() {
    return this.recoil > 0 && this.clock - this.recoil < RECOIL_S;
  }

  /** Draws the loose end flying back to the rod tip. */
  updateRecoil(tip: { x: number; y: number; z: number }, time: number) {
    this.clock = time;
    const u = clamp((time - this.recoil) / RECOIL_S);
    const e = ease(u);
    this.line.isVisible = true;
    this.bobber.isVisible = false;
    const n = this.linePoints.length;
    const endX = this.recoilFrom.x + (tip.x - this.recoilFrom.x) * e;
    const endZ = this.recoilFrom.z + (tip.z - this.recoilFrom.z) * e;
    const endY = this.recoilFrom.y + 1 + (tip.y - this.recoilFrom.y - 1) * e;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const whip = Math.sin(s * 9 - time * 40) * 0.6 * (1 - u) * s;
      this.linePoints[i]!.set(
        tip.x + (endX - tip.x) * s + whip,
        tip.y + (endY - tip.y) * s - 1.2 * 4 * s * (1 - s) * u,
        tip.z + (endZ - tip.z) * s,
      );
    }
    MeshBuilder.CreateLines("gear-line", {
      points: this.linePoints,
      instance: this.line,
    });
    this.line.color = lineColourFor(1);
    this.line.alpha = 1 - u;
    if (u >= 1) {
      this.recoil = 0;
      this.line.isVisible = false;
    }
  }

  private drawFight(
    view: FishingView,
    tip: { x: number; y: number; z: number },
    time: number,
  ) {
    const fight = view.fight!;
    const landing = view.landing!;
    this.lastFight = true;
    const pose = fishPose(fight, time);
    // The fish is on the line from the boat toward where it was hooked.
    const span = Math.hypot(landing.x - tip.x, landing.z - tip.z) || 1;
    const dx = (landing.x - tip.x) / span;
    const dz = (landing.z - tip.z) / span;
    const fx = tip.x + dx * pose.distance - dz * pose.swing;
    const fz = tip.z + dz * pose.distance + dx * pose.swing;
    const surface = waveHeight(fx, fz, time);
    // The bobber rides at the fish, pulled under while it surges.
    const sunk = fight.mood === "surge" ? 0.5 : 0.1;
    this.bobber.position.set(fx, surface - sunk, fz);
    this.bobber.rotation.set(0, 0, Math.sin(time * 9) * 0.25 * pose.splash);
    this.top.set(fx, surface + 4.6, fz);
    if (this.fish) {
      const model = this.fish.root;
      const heading = Math.atan2(-dz, -dx); // Nose toward the boat while reeled, away in a run.
      const away = fight.mood === "surge" ? Math.PI : 0;
      model.position.set(fx, surface - 0.15 + pose.lift, fz);
      model.rotation.set(pose.roll, -heading + away + pose.yaw, 0);
      model.scaling.setAll(4.2);
      if (this.fish.tail)
        this.fish.tail.rotation.y =
          Math.sin(time * pose.beat * 2 * Math.PI) * 0.6;
    }
    // Splashes while it thrashes.
    if (pose.splash > 0.5 && time - this.lastSplash > 0.32) {
      this.lastSplash = time;
      this.ripple();
    }
    // The line: slack when the fish tires, straight and humming as it pulls.
    const n = this.linePoints.length;
    const endY = Math.max(surface + 0.2, 0);
    const sag = lineSag(fight.tension);
    const tremble = lineTremble(fight.tension);
    const px = -dz;
    const pz = dx;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const base = 4 * s * (1 - s);
      const wob = Math.sin(time * 70 + s * 9) * tremble * base;
      const x = tip.x + (fx - tip.x) * s + px * wob;
      const z = tip.z + (fz - tip.z) * s + pz * wob;
      let y = tip.y + (endY - tip.y) * s - sag * base;
      if (i > 0 && i < n - 1) y = Math.max(y, waveHeight(x, z, time) + 0.04);
      this.linePoints[i]!.set(x, y, z);
    }
    MeshBuilder.CreateLines("gear-line", {
      points: this.linePoints,
      instance: this.line,
    });
    this.line.color = lineColourFor(fight.tension);
    this.line.alpha = 1;
  }

  private drawArc(
    tip: { x: number; y: number; z: number },
    x: number,
    z: number,
  ) {
    const n = this.arcPoints.length;
    const span = Math.hypot(x - tip.x, z - tip.z);
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      this.arcPoints[i]!.set(
        tip.x + (x - tip.x) * s,
        tip.y * (1 - s) + 0.3 * s + 4 * s * (1 - s) * (2.5 + span * 0.16),
        tip.z + (z - tip.z) * s,
      );
    }
    MeshBuilder.CreateDashedLines("gear-arc", {
      points: this.arcPoints,
      dashSize: 1,
      gapSize: 1.4,
      dashNb: 60,
      instance: this.arc as never,
    });
  }

  private drawBobber(
    view: FishingView,
    tip: { x: number; y: number; z: number },
    time: number,
  ) {
    const landing = view.landing!;
    const flying = view.phase === "flying";
    const biting = view.phase === "biting";
    let bx: number;
    let bz: number;
    let by: number;
    if (flying) {
      // A throw is an arc from the rod tip down to the landing spot.
      const s = ease(view.flight);
      bx = tip.x + (landing.x - tip.x) * s;
      bz = tip.z + (landing.z - tip.z) * s;
      const span = Math.hypot(landing.x - tip.x, landing.z - tip.z);
      by =
        tip.y * (1 - s) +
        (waveHeight(landing.x, landing.z, time) + 0.1) * s +
        4 * s * (1 - s) * (2.5 + span * 0.16);
    } else {
      bx = landing.x;
      bz = landing.z;
      by = waveHeight(bx, bz, time) + 0.05;
      // A nibble is a quick dip and a wobble; each recent nibble adds one.
      let dip = 0;
      for (const age of view.nibbleAges)
        dip +=
          0.55 * Math.exp(-(((age - 0.08) / 0.06) ** 2)) +
          0.12 * Math.sin(age * 38) * Math.exp(-age * 5);
      by -= dip;
      if (biting) {
        // Taken under, and dragged away from the boat by the fish.
        const sink = ease(clamp(view.hurry / 0.18));
        by -= sink * 2.1;
        const away = Math.hypot(bx - tip.x, bz - tip.z) || 1;
        const drag = view.hurry * 5;
        bx += ((bx - tip.x) / away) * drag;
        bz += ((bz - tip.z) / away) * drag;
      }
    }
    const tilt = flying ? time * 6 : 0;
    this.bobber.position.set(bx, by, bz);
    this.bobber.rotation.set(tilt * 0.3, 0, Math.sin(time * 1.7 + bx) * 0.09);
    this.top.set(bx, by + 4.6, bz);
    // The line: slack and curved while waiting, straight and trembling when a fish is on.
    const taut = biting;
    const n = this.linePoints.length;
    const endY = Math.max(by + 2.4, waveHeight(bx, bz, time) + 0.05);
    const sag = taut ? 0.04 : flying ? 0.3 : 1.7;
    const length = Math.hypot(bx - tip.x, bz - tip.z) || 1;
    const px = -(bz - tip.z) / length;
    const pz = (bx - tip.x) / length;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const base = 4 * s * (1 - s);
      const tremble = taut ? Math.sin(time * 70 + s * 9) * 0.07 * base : 0;
      const x = tip.x + (bx - tip.x) * s + px * tremble;
      const z = tip.z + (bz - tip.z) * s + pz * tremble;
      let y = tip.y + (endY - tip.y) * s - sag * base;
      if (i > 0 && i < n - 1) y = Math.max(y, waveHeight(x, z, time) + 0.04);
      this.linePoints[i]!.set(x, y, z);
    }
    MeshBuilder.CreateLines("gear-line", {
      points: this.linePoints,
      instance: this.line,
    });
    this.line.alpha = 0.9;
    this.line.color = WHITE;
  }

  private drawRings(view: FishingView | undefined, time: number) {
    const spot = view?.landing;
    const age = (start: number) => (time - start) / RING_LIFE;
    this.rings.forEach((mesh, i) => {
      const start = this.rippleStarts[i];
      const u = start === undefined ? 2 : age(start);
      const on = !!spot && u >= 0 && u <= 1 && view?.phase !== "flying";
      mesh.isVisible = on;
      if (!on || !spot) return;
      // The ring follows the bobber, which the fish drags once it bites.
      const x = this.bobber.position.x;
      const z = this.bobber.position.z;
      const radius = 0.9 + ease(u) * 5.5;
      mesh.position.set(x, waveHeight(x, z, time) + 0.18, z);
      mesh.scaling.set(radius, 1, radius);
      (mesh.material as StandardMaterial).alpha = (1 - u) * 0.9;
    });
  }

  dispose() {
    this.fish?.dispose();
    this.bobber.dispose();
    this.line.dispose();
    this.arc.dispose();
    for (const ring of this.rings) ring.dispose();
    this.marker.dispose();
  }
}
