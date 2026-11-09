import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { drawnLength, speciesById, type FishingView } from "./fishing.ts";
import { createCreature, type CreatureModel } from "./creature-kit.ts";
import { fishPose, lineColour, lineTremble } from "./fight-look.ts";
import { Ribbon } from "./ribbon.ts";
import { Rope, smoothRope } from "./rope.ts";
import { waveHeight } from "./waves.ts";
import { PAL } from "./art/colors.ts";
import { SIDES, sphereMesh } from "./art/shapes.ts";
import { hex } from "./mesh-parts.ts";
import { glowMaterial } from "./art/materials.ts";

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
const RINGS = 8;
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
  private readonly line: Ribbon;
  private readonly arc: LinesMesh;
  private readonly rings: Mesh[] = [];
  private readonly marker: Mesh;
  private readonly markerMaterial: StandardMaterial;
  private readonly linePoints: Vector3[] = [];
  private readonly arcPoints: Vector3[] = [];
  private readonly ripples: { t: number; x: number; z: number }[] = [];
  private idleRipple = -9;
  private readonly lure: Mesh;
  private readonly rope = new Rope(POINTS);
  private readonly smooth = new Float64Array(POINTS * 3);
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
  /** The fish's smoothed place and heading while it fights (so it swims, not teleports). */
  private fightX = 0;
  private fightZ = 0;
  private fightYaw = 0;
  private fightSeeded = false;
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
    this.line = new Ribbon(scene, "gear-line", POINTS);
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
      const material = glowMaterial(scene, `${name}-material`, {
        texture,
        alpha: 0,
      });
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
    // A small bright lure where the line ends; the fish takes its place in a fight.
    this.lure = sphereMesh(scene, 0.3, SIDES.small, "gear-lure");
    this.lure.material = glowMaterial(scene, "gear-lure-material", {
      color: hex(PAL.rod.lure),
    });
    this.lure.isPickable = false;
    this.lure.isVisible = false;
    this.setVisible(false);
  }

  /** A ring spreads from where the line enters the water (splash, nibble, bite). */
  ripple() {
    this.ripples.push({ t: this.clock, x: this.entry.x, z: this.entry.z });
    if (this.ripples.length > RINGS) this.ripples.shift();
  }

  /** Where the line ends (the lure, or the fish's mouth) while fishing, for the camera. */
  endPoint(): { x: number; z: number } | undefined {
    return this.shown && this.roped ? this.entry : undefined;
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
    if (!on) this.lure.isVisible = false;
  }

  /** Where the camera is, for the line strip to face it. */
  private eye() {
    return this.scene.activeCamera?.position ?? this.entry;
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
        ? hex(PAL.signal.blocked)
        : preview.sweet
          ? hex(PAL.signal.sweet)
          : Color3.White();
    }
    let ringsOn = false;
    this.roped = false;
    if (!(view.phase === "fighting" && view.fight)) this.fightSeeded = false;
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
    this.fightSeeded = false;
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
    this.line.draw(this.linePoints, this.eye());
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
    this.line.draw(this.linePoints, this.eye());
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
    taut = 0,
  ) {
    // Drawn smoothed, so a rope with hardly any slack does not look saw-toothed.
    const p = smoothRope(this.rope.positions, this.smooth);
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
      // A taut line is straight: with tension the drawn line is pulled onto the chord
      // from the rod tip to the end (the rope itself can lag a fast-moving fish).
      const cx = tip.x + (this.entry.x - tip.x) * s;
      const cy = tip.y + (this.entry.y - tip.y) * s;
      const cz = tip.z + (this.entry.z - tip.z) * s;
      this.linePoints[i]!.set(
        p[i * 3]! + (cx - p[i * 3]!) * taut + px * wob,
        p[i * 3 + 1]! + (cy - p[i * 3 + 1]!) * taut,
        p[i * 3 + 2]! + (cz - p[i * 3 + 2]!) * taut + pz * wob,
      );
    }
    this.line.draw(this.linePoints, this.eye());
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
    this.lure.position.set(ex, ey + 0.2, ez);
    this.lure.isVisible = true;
    // Where the line enters the water a slow ring keeps showing it, so the end of a long cast
    // is not a thin line stopping in mid-air.
    if (!flying && time - this.idleRipple > 1.0) {
      this.idleRipple = time;
      this.ripple();
    }
    this.top.set(ex, waveHeight(ex, ez, time) + 2.4, ez);
    this.pull.shake = biting ? 0.35 : 0;
    // How much line there is: a hair of slack while waiting (a sag of half a metre or so;
    // sag grows with the square root of the spare line), none once a fish is taking it.
    const stretch = Math.hypot(ex - tip.x, ey - tip.y, ez - tip.z);
    const length = flying ? stretch * 1.12 : biting ? stretch : stretch + 0.05;
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
    // Waiting, the line keeps a gentle sag; once a fish takes it, it is straight.
    this.drawRope(WHITE, biting ? 0.05 : 0, time, tip, biting ? 1 : 0.85);
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
    const targetX = tip.x + dx * pose.distance - dz * pose.swing;
    const targetZ = tip.z + dz * pose.distance + dx * pose.swing;
    // The fish swims to where it wants to be (no jumps between moods) and faces the way
    // it is going: along its run, sideways when it thrashes across, toward the boat when
    // it is hauled in.
    const follow = seconds > 0 ? 1 - Math.exp(-seconds * 8) : 1;
    const away = fight.mood === "surge" ? 1 : -1;
    let headX = dx * away;
    let headZ = dz * away;
    if (!this.fightSeeded) {
      this.fightSeeded = true;
      this.fightX = targetX;
      this.fightZ = targetZ;
      this.fightYaw = Math.atan2(-headZ, headX);
    } else if (seconds > 0) {
      const lastX = this.fightX;
      const lastZ = this.fightZ;
      this.fightX += (targetX - lastX) * follow;
      this.fightZ += (targetZ - lastZ) * follow;
      const vx = (this.fightX - lastX) / seconds;
      const vz = (this.fightZ - lastZ) / seconds;
      const speed = Math.hypot(vx, vz);
      // Heading follows the motion once it is moving; the line's axis otherwise.
      const w = clamp(speed / 2);
      headX = headX * (1 - w) + (vx / (speed || 1)) * w;
      headZ = headZ * (1 - w) + (vz / (speed || 1)) * w;
    }
    const fx = this.fightX;
    const fz = this.fightZ;
    const surface = waveHeight(fx, fz, time);
    // Drawn at its species' size, but a fish far from the camera is drawn up to twice as
    // large so it can still be seen (about 3 degrees of the view, never more than 2.5
    // times its size).
    const species = view.species ? speciesById(view.species) : undefined;
    const kg = species
      ? species.kg[0] + (view.size ?? 0.3) * (species.kg[1] - species.kg[0])
      : 1;
    const baseLength = species ? drawnLength(species, kg) : 1;
    const eye = this.eye();
    const viewDistance = Math.hypot(fx - eye.x, surface - eye.y, fz - eye.z);
    const length = Math.min(
      baseLength * 2.5,
      Math.max(baseLength, viewDistance * 0.055),
    );
    // Its mouth is where the line ends, just above the water.
    const mouthY = surface + 0.25 + pose.lift * 0.6;
    this.entry.set(fx, mouthY, fz);
    this.lure.isVisible = false;
    this.top.set(fx, surface + 2.2, fz);
    const wanted = Math.atan2(-headZ + pose.yaw * 0.15, headX);
    let turn = wanted - this.fightYaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.fightYaw += turn * (seconds > 0 ? 1 - Math.exp(-seconds * 6) : 1);
    this.fightYaw = Math.atan2(
      Math.sin(this.fightYaw),
      Math.cos(this.fightYaw),
    );
    const yaw = this.fightYaw;
    if (this.fish) {
      const nx = Math.cos(yaw);
      const nz = -Math.sin(yaw);
      this.fishWhere.set(
        fx - nx * length * 0.45,
        mouthY - 0.1 - length * 0.02,
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
    // Ripples where the fish is: a trail in a run, a slow ring when it pulls steadily.
    const every =
      fight.mood === "surge" ? 0.1 : fight.mood === "strong" ? 0.55 : 1.4;
    if (time - this.lastSplash > every) {
      this.lastSplash = time;
      this.ripple();
    }
    const stretch = Math.hypot(fx - tip.x, mouthY - tip.y, fz - tip.z);
    // A hooked fish that pulls keeps the line straight: no spare line at all. Only a tired
    // fish lets a little go slack (3 % extra line would sag the middle by 2.5 m; 12 cm gives a clean arc of about a metre).
    this.stepRope(tip, stretch + (fight.mood === "tired" ? 0.05 : 0), seconds);
    this.roped = true;
    this.drawRope(
      lineColourFor(fight.tension),
      lineTremble(fight.tension),
      time,
      tip,
      // Straight while the fish pulls; a tired fish lets it curve a little.
      fight.mood === "tired" ? 0.85 : 1,
    );
    this.line.alpha = 1;
    // How hard it pulls the rod: a run is hard, a tired fish hardly at all.
    const base =
      fight.mood === "surge" ? 0.75 : fight.mood === "strong" ? 0.4 : 0.12;
    this.pull.strength = clamp(
      base +
        0.3 * fight.tension +
        (fight.reeling && fight.mood !== "tired" ? 0.15 : 0),
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
    const on = !!view?.landing && view.phase !== "flying";
    this.rings.forEach((mesh, i) => {
      const ripple = this.ripples[i];
      const u = ripple ? (time - ripple.t) / RING_LIFE : 2;
      const show = on && u >= 0 && u <= 1;
      mesh.isVisible = show;
      if (!show || !ripple) return;
      // Each ring stays where it was made, so a running fish leaves a trail of them.
      const radius = 0.7 + ease(u) * 4.5;
      mesh.position.set(
        ripple.x,
        waveHeight(ripple.x, ripple.z, time) + 0.18,
        ripple.z,
      );
      mesh.scaling.set(radius, 1, radius);
      (mesh.material as StandardMaterial).alpha = (1 - u) * 0.9;
    });
  }

  dispose() {
    this.fish?.dispose();
    this.line.dispose();
    this.lure.dispose();
    this.arc.dispose();
    for (const ring of this.rings) ring.dispose();
    this.marker.dispose();
  }
}

type Vector3Like = { x: number; y: number; z: number };
