import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { speciesById, type FishingView } from "./fishing.ts";
import { createCreature, type CreatureModel } from "./creature-kit.ts";
import { fishLength, fishPose, lineColour, lineTremble } from "./fight-look.ts";
import { Rope } from "./rope.ts";
import { waveHeight } from "./waves.ts";

/**
 * What the player sees of their own fishing: the throw preview, the line and the ripples
 * where it meets the water, the hooked fish and the catch hanging from the rod. There is
 * no float. The line is a real rope (ocean/rope.ts): it trails behind the cast, hangs in
 * a curve when there is slack, twitches at a nibble, goes taut and trembles in a fight.
 * It also says how hard it pulls the rod (`pull`), which bends it (ocean/rod.ts).
 * A handful of small meshes created once and moved every frame. The state that drives
 * it lives in fishing.ts; this only draws a FishingView.
 */
const POINTS = 22;
const RINGS = 3;
const RING_LIFE = 0.9;
const RECOIL_S = 0.55;
const LEAVE_S = 0.5;
const ARRIVE_S = 0.45;
/** How far below the rod tip a landed fish hangs by the mouth (m). */
const HANG = 1.15;
const WHITE = new Color3(1, 1, 1);
const clamp = (value: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, value));
const ease = (t: number) => t * t * (3 - 2 * t);
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

/** What the line does to the rod this frame (world axes). */
export interface Pull {
  x: number;
  y: number;
  z: number;
  /** 0..1: how hard. */
  strength: number;
  /** 0..1: a fish thrashing on the line. */
  shake: number;
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

export class FishingGear {
  private readonly line: LinesMesh;
  private readonly arc: LinesMesh;
  private readonly rings: Mesh[] = [];
  private readonly marker: Mesh;
  private readonly markerMaterial: StandardMaterial;
  private readonly linePoints: Vector3[] = [];
  private readonly arcPoints: Vector3[] = [];
  private readonly rippleStarts: number[] = [];
  private readonly rope = new Rope(POINTS);
  /** Where the line meets the water (or the fish's mouth), world. */
  private readonly entry = new Vector3();
  private readonly top = new Vector3();
  private shown = false;
  private clock = 0;
  private lastFrame = 0;
  private roped = false;
  private readonly scene: Scene;
  private fish: CreatureModel | undefined;
  private fishId: string | undefined;
  private fishWhere = new Vector3();
  private fishRoll = 0;
  private fishYaw = 0;
  private recoil = 0;
  private lastFight = false;
  private lastSplash = 0;
  private held:
    | { id: string; scale: number; since: number; from: Vector3 }
    | undefined;
  private leaving: { kind: "keep" | "drop"; since: number } | undefined;
  private readonly recoilFrom = new Vector3();
  /** The pull on the rod from the last frame drawn. */
  readonly pull: Pull = { x: 0, y: -1, z: 0, strength: 0, shake: 0 };

  constructor(scene: Scene) {
    this.scene = scene;
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

  /** A ring spreads from where the line enters the water (splash, nibble, bite). */
  ripple() {
    this.rippleStarts.push(this.clock);
    if (this.rippleStarts.length > RINGS) this.rippleStarts.shift();
  }

  /** World position above where the line enters the water, for the "!" badge. */
  entryTop(): Vector3 | undefined {
    return this.shown && this.roped ? this.top : undefined;
  }

  /** Everything away (line in, nothing held). */
  hide() {
    this.showFish(undefined);
    this.setVisible(false);
    this.roped = false;
    this.arc.isVisible = false;
    this.marker.isVisible = false;
    for (const ring of this.rings) ring.isVisible = false;
    this.pull.strength = 0;
    this.pull.shake = 0;
  }

  private setVisible(on: boolean) {
    this.shown = on;
    this.line.isVisible = on;
  }

  private dt(time: number) {
    const seconds = this.lastFrame ? clamp(time - this.lastFrame, 0, 0.1) : 0;
    this.lastFrame = time;
    return seconds;
  }

  update({ view, tip, preview, time }: GearInput) {
    this.clock = time;
    const seconds = this.dt(time);
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
    this.roped = false;
    if (out && view.landing) {
      if (view.phase === "fighting" && view.fight)
        this.drawFight(view, tip, time, seconds);
      else this.drawLine(view, tip, time, seconds);
      ringsOn = true;
    } else {
      this.pull.strength = 0;
      this.pull.shake = 0;
    }
    this.showFish(view.phase === "fighting" ? view.species : undefined);
    this.drawRings(ringsOn ? view : undefined, time);
  }

  /** The fish on the line: built once per species, shown only while it is on. */
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
    this.recoilFrom.copyFrom(this.entry);
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
    this.pull.strength = 0;
    this.pull.shake = 0;
    if (u >= 1) {
      this.recoil = 0;
      this.line.isVisible = false;
    }
  }

  /** A landed fish hangs from the rod tip until the player keeps it or lets it go. */
  hold(fish: { id: string; scale: number } | undefined) {
    this.held = fish
      ? { ...fish, since: this.clock, from: this.fishWhere.clone() }
      : undefined;
    this.leaving = undefined;
    if (!fish) {
      this.showFish(undefined);
      this.line.isVisible = false;
      this.pull.strength = 0;
    }
  }

  get holding() {
    return this.held !== undefined;
  }

  /** The hanging fish goes into the store (it rises away) or back to the sea (it falls). */
  leave(kind: "keep" | "drop", time: number) {
    if (this.held && !this.leaving) this.leaving = { kind, since: time };
  }

  /** Draws the hanging fish and the line it hangs from. */
  updateHeld(tip: { x: number; y: number; z: number }, time: number) {
    const held = this.held;
    if (!held) return;
    this.clock = time;
    let u = 0;
    if (this.leaving) u = clamp((time - this.leaving.since) / LEAVE_S);
    if (u >= 1) {
      this.hold(undefined);
      return;
    }
    this.showFish(held.id);
    // The catch leaps from the water to the rod tip, then hangs and sways.
    const arrive = clamp((time - held.since) / ARRIVE_S);
    const a = ease(arrive);
    const sway = Math.sin(time * 1.7) * 0.2 * (1 - u) * a;
    const keep = this.leaving?.kind === "keep";
    const e = ease(u);
    const mouthX = tip.x + sway;
    const mouthY =
      tip.y -
      HANG +
      (keep ? e * 4 : -e * e * 6) +
      Math.sin(a * Math.PI) * 0.9 * (1 - a);
    const scale = held.scale * (keep ? 1 - e : 1);
    const hangY = mouthY - scale * 0.5;
    if (this.fish) {
      const x = held.from.x + (mouthX - held.from.x) * a;
      const y =
        held.from.y + (hangY - held.from.y) * a + Math.sin(a * Math.PI) * 1.6;
      const z = held.from.z + (tip.z - held.from.z) * a;
      this.fish.root.position.set(x, y, z);
      this.fish.root.rotation.set(
        0,
        this.fishYaw + (time * 0.9 - this.fishYaw) * a,
        this.fishRoll + (Math.PI / 2 + sway * 0.3 - this.fishRoll) * a,
      );
      this.fish.root.scaling.setAll(Math.max(0.01, scale));
      if (this.fish.tail)
        this.fish.tail.rotation.y = Math.sin(time * 5) * 0.5 * (1 - u);
    }
    // The rope is a plain straight hang from the tip to the mouth.
    const n = this.linePoints.length;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      this.linePoints[i]!.set(
        tip.x + sway * s * s,
        tip.y + (mouthY - tip.y) * s,
        tip.z,
      );
    }
    MeshBuilder.CreateLines("gear-line", {
      points: this.linePoints,
      instance: this.line,
    });
    this.line.isVisible = true;
    this.line.color = WHITE;
    this.line.alpha = 0.9;
    // The weight of the catch bows the rod (down, and a little out).
    this.pull.x = 0.12;
    this.pull.y = -1;
    this.pull.z = 0;
    this.pull.strength = (0.22 + 0.4 * clamp(held.scale / 2.8)) * (1 - u) * a;
    this.pull.shake = 0;
  }

  /** Lays the rope on the line mesh, with an optional sideways tremble. */
  private drawRope(
    color: Color3,
    tremble: number,
    time: number,
    tip: Vector3Like,
  ) {
    const p = this.rope.positions;
    const n = this.rope.count;
    const dx = this.entry.x - tip.x;
    const dz = this.entry.z - tip.z;
    const span = Math.hypot(dx, dz) || 1;
    const px = -dz / span;
    const pz = dx / span;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const wob = tremble
        ? Math.sin(time * 70 + s * 9) * tremble * 4 * s * (1 - s)
        : 0;
      this.linePoints[i]!.set(
        p[i * 3]! + px * wob,
        p[i * 3 + 1]!,
        p[i * 3 + 2]! + pz * wob,
      );
    }
    MeshBuilder.CreateLines("gear-line", {
      points: this.linePoints,
      instance: this.line,
    });
    this.line.color = color;
    this.line.alpha = 0.95;
  }

  /** The line through the cast, the wait, a nibble and the bite (no float). */
  private drawLine(
    view: FishingView,
    tip: { x: number; y: number; z: number },
    time: number,
    seconds: number,
  ) {
    const landing = view.landing!;
    const flying = view.phase === "flying";
    const biting = view.phase === "biting";
    let ex: number;
    let ez: number;
    let ey: number;
    const span = Math.hypot(landing.x - tip.x, landing.z - tip.z) || 1;
    if (flying) {
      // The lure arcs out and the line trails behind it.
      const s = ease(view.flight);
      ex = tip.x + (landing.x - tip.x) * s;
      ez = tip.z + (landing.z - tip.z) * s;
      ey =
        tip.y * (1 - s) +
        (waveHeight(landing.x, landing.z, time) - 0.1) * s +
        4 * s * (1 - s) * (2.5 + span * 0.16);
    } else {
      ex = landing.x;
      ez = landing.z;
      ey = waveHeight(ex, ez, time) - 0.12;
      // A nibble is a quick dip and a tug; each recent nibble adds one.
      let dip = 0;
      for (const age of view.nibbleAges)
        dip +=
          0.55 * Math.exp(-(((age - 0.08) / 0.06) ** 2)) +
          0.12 * Math.sin(age * 38) * Math.exp(-age * 5);
      ey -= dip * 0.8;
      this.pull.strength = clamp(dip * 0.9);
      if (biting) {
        // Taken, and run away from the boat by the fish.
        const sink = ease(clamp(view.hurry / 0.18));
        ey -= sink * 1.2;
        const away = Math.hypot(ex - tip.x, ez - tip.z) || 1;
        const drag = view.hurry * 5;
        ex += ((ex - tip.x) / away) * drag;
        ez += ((ez - tip.z) / away) * drag;
        this.pull.strength = 0.5 + 0.4 * clamp(view.hurry / 0.4);
      } else if (!dip) this.pull.strength = 0.05;
    }
    this.entry.set(ex, ey, ez);
    this.top.set(ex, waveHeight(ex, ez, time) + 2.4, ez);
    this.pull.shake = biting ? 0.35 : 0;
    // How much line there is: slack while waiting, none once a fish is taking it.
    const stretch = Math.hypot(ex - tip.x, ey - tip.y, ez - tip.z);
    const length = flying
      ? stretch * 1.12
      : biting
        ? stretch * 1.002
        : stretch * 1.09 + 0.8;
    this.stepRope(tip, length, seconds);
    this.roped = !flying;
    const direction = new Vector3(
      ex - tip.x,
      ey - tip.y,
      ez - tip.z,
    ).normalize();
    this.pull.x = direction.x;
    this.pull.y = direction.y;
    this.pull.z = direction.z;
    this.drawRope(WHITE, biting ? 0.05 : 0, time, tip);
    this.line.alpha = 0.9;
  }

  private stepRope(
    tip: { x: number; y: number; z: number },
    length: number,
    seconds: number,
  ) {
    if (!this.rope.positions[0] && !this.rope.positions[1])
      this.rope.reset(tip, this.entry);
    this.rope.step(seconds || 1 / 60, tip, this.entry, length, (x, z) =>
      waveHeight(x, z, this.clock),
    );
  }

  /** The fish on the line: the line tightens, the rod bends, the fish moves by mood. */
  private drawFight(
    view: FishingView,
    tip: { x: number; y: number; z: number },
    time: number,
    seconds: number,
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
    const length = fishLength(view.size ?? 0.3);
    // Its mouth is where the line ends, just above the water.
    const mouthY = surface + 0.25 + pose.lift * 0.6;
    this.entry.set(fx, mouthY, fz);
    this.top.set(fx, surface + 2.2, fz);
    // Nose away from the boat in a run, toward it when it is being reeled in.
    const away = fight.mood === "surge" ? 1 : -1;
    const yaw = Math.atan2(-dz * away + pose.yaw * 0.4, dx * away);
    if (this.fish) {
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);
      this.fishWhere.set(
        fx - nx * length * 0.45,
        mouthY - 0.1 - length * 0.12,
        fz - nz * length * 0.45,
      );
      this.fish.root.position.copyFrom(this.fishWhere);
      this.fishYaw = yaw;
      this.fishRoll = pose.roll;
      this.fish.root.rotation.set(pose.roll, yaw, 0);
      this.fish.root.scaling.setAll(length);
      if (this.fish.tail)
        this.fish.tail.rotation.y =
          Math.sin(time * pose.beat * 2 * Math.PI) * 0.6;
    }
    // Splashes while it thrashes.
    if (pose.splash > 0.5 && time - this.lastSplash > 0.32) {
      this.lastSplash = time;
      this.ripple();
    }
    // The line: slack when the fish tires, tight as it pulls.
    const stretch = Math.hypot(fx - tip.x, mouthY - tip.y, fz - tip.z);
    const slack = 0.05 * (1 - clamp(fight.tension / 0.45));
    this.stepRope(tip, stretch * (1 + slack), seconds);
    this.roped = true;
    this.drawRope(
      lineColourFor(fight.tension),
      lineTremble(fight.tension),
      time,
      tip,
    );
    this.line.alpha = 1;
    // How hard it pulls the rod: a run is hard, a tired fish hardly at all.
    const base =
      fight.mood === "surge" ? 0.75 : fight.mood === "strong" ? 0.4 : 0.12;
    this.pull.strength = clamp(
      (base + 0.3 * fight.tension) * (fight.reeling ? 1.1 : 1),
    );
    this.pull.shake =
      fight.mood === "surge" ? 1 : fight.tension > 0.8 ? 0.4 : 0;
    const direction = new Vector3(
      fx - tip.x,
      mouthY - tip.y,
      fz - tip.z,
    ).normalize();
    this.pull.x = direction.x;
    this.pull.y = direction.y;
    this.pull.z = direction.z;
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

  private drawRings(view: FishingView | undefined, time: number) {
    const spot = view?.landing;
    const age = (start: number) => (time - start) / RING_LIFE;
    this.rings.forEach((mesh, i) => {
      const start = this.rippleStarts[i];
      const u = start === undefined ? 2 : age(start);
      const on = !!spot && u >= 0 && u <= 1 && view?.phase !== "flying";
      mesh.isVisible = on;
      if (!on || !spot) return;
      // The ring follows where the line meets the water.
      const x = this.entry.x;
      const z = this.entry.z;
      const radius = 0.7 + ease(u) * 4.5;
      mesh.position.set(x, waveHeight(x, z, time) + 0.18, z);
      mesh.scaling.set(radius, 1, radius);
      (mesh.material as StandardMaterial).alpha = (1 - u) * 0.9;
    });
  }

  dispose() {
    this.fish?.dispose();
    this.line.dispose();
    this.arc.dispose();
    for (const ring of this.rings) ring.dispose();
    this.marker.dispose();
  }
}

type Vector3Like = { x: number; y: number; z: number };
