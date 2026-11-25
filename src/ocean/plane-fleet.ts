import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { DitheredTileFadeMaterialPlugin } from "@babylonjs/core/Materials/ditheredTileFadeMaterialPlugin";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { glowMaterial, solidMaterial, useSolid } from "./art/materials.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import { beaconLevel } from "./atmosphere.ts";
import { BANNER, bannerLayout, fillBanner } from "./banner.ts";
import { FADE_IN, FADE_OUT, approach, fadeAmount } from "./plane-fade.ts";
import { PlaneGlow, createGlowMaterial } from "./plane-glow.ts";
import { PlaneSim, makePlans, type PlanePose } from "./plane-plan.ts";
import { SEA } from "./sea-atmosphere.ts";

/**
 * The NPC seaplanes: little floatplanes that fly over the sea towing a banner that advertises the
 * game, turning to random directions. Where each is, and where its banner hangs, is a function of
 * the SHARED clock (plane-plan.ts), so every player sees the same planes at the same places. All
 * of them are simulated (a few arithmetic steps each); only the nearest few within `range` are
 * drawn. Two shared models (the body and the propeller, both hidden templates) are drawn as
 * instances, so a drawn plane is two instance draws, one banner draw and, at night, one draw for
 * the glow of its lights (plane-lights.ts). A plane comes into view and leaves it by dithered
 * fade (plane-fade.ts), never in one frame. Only a picture over the
 * sea: no collision, no sound, and no part of play depends on them.
 */
export interface PlaneFleetOptions {
  /** Planes farther than this (m) from the camera are not drawn. */
  range: number;
  /** At most this many planes are drawn at once (the nearest). */
  limit: number;
  /** The text on the banner. */
  text?: string;
}

export const BANNER_TEXT = "RA KHƠI CÙNG BẠN";
/** Where the propeller sits (nose end, m). */
const NOSE = -3.7;

const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/**
 * The seaplane, nose toward -Z like the boats: a cream fuselage with a red nose, a high white wing
 * with red tips, two red floats on struts, a tail fin, and a propeller as its own mesh.
 */
export function buildPlane(scene: Scene): { body: Mesh; prop: Mesh } {
  const { paint, fit, metal } = PAL;
  const parts = new Parts(scene);
  const along = [Math.PI / 2, 0, 0] as const;
  // Fuselage: a cabin, a tail cone and a rounded nose.
  parts.tube(
    { top: 1.3, bottom: 1.3, height: 4.4, sides: SIDES.small },
    paint.cream,
    [0, 0, -0.5],
    along,
  );
  parts.tube(
    { top: 0.2, bottom: 1.3, height: 3.6, sides: SIDES.small },
    paint.cream,
    [0, 0.05, 3.5],
    along,
  );
  parts.tube(
    { top: 1.3, bottom: 0.45, height: 0.9, sides: SIDES.small },
    paint.red,
    [0, 0, -3.15],
    along,
  );
  // Cabin windows.
  for (const side of [-1, 1])
    parts.box([0.05, 0.45, 1.5], paint.window, [side * 0.66, 0.22, -1.2]);
  // The high wing, its red tips and the struts that hold it.
  parts.box([8.2, 0.16, 1.9], paint.white, [0, 1.0, -0.7]);
  for (const side of [-1, 1]) {
    parts.box([1.5, 0.17, 1.9], paint.red, [side * 4.85, 1.0, -0.7]);
    parts.box(
      [0.08, 1.2, 0.08],
      metal.light,
      [side * 1.3, 0.55, -0.2],
      [0, 0, side * -0.45],
    );
  }
  // Two floats and the struts that carry them.
  for (const side of [-1, 1]) {
    parts.sphere(
      1,
      paint.red,
      [side * 1.9, -1.4, -0.3],
      undefined,
      [0.55, 0.42, 6.2],
    );
    for (const z of [-1.4, 1.1])
      parts.box(
        [0.08, 1.4, 0.08],
        metal.light,
        [side * 1.3, -0.7, z],
        [0, 0, side * 0.6],
      );
  }
  // Tail: a fin and the tail plane.
  parts.box([0.12, 1.5, 1.3], paint.red, [0, 1.0, 4.0]);
  parts.box([3.6, 0.1, 1.0], paint.white, [0, 0.3, 4.3]);
  const body = parts.merge("plane-body");
  useSolid(body, "satin");
  body.isVisible = false;

  const blades = new Parts(scene);
  blades.box([0.22, 2.5, 0.06], metal.steel, [0, 0, 0]);
  blades.box([2.5, 0.22, 0.06], metal.steel, [0, 0, 0]);
  blades.tube(
    { top: 0, bottom: 0.4, height: 0.4, sides: SIDES.small },
    fit.winch,
    [0, 0, -0.18],
    [Math.PI / 2, 0, 0],
  );
  const prop = blades.merge("plane-prop");
  useSolid(prop, "satin");
  prop.isVisible = false;
  return { body, prop };
}

/** The banner's picture: bold cobalt letters on yellow with a cobalt frame, and a strip of rope colour at the foot. */
function paintBanner(texture: DynamicTexture, text: string) {
  const w = 1024;
  const h = 192;
  const c = texture.getContext() as CanvasRenderingContext2D;
  const strip = Math.round(h * BANNER.textV0);
  const top = h - strip;
  c.fillStyle = css(PAL.fit.rope);
  c.fillRect(0, top, w, strip);
  c.fillStyle = css(PAL.market.coin);
  c.fillRect(0, 0, w, top);
  c.strokeStyle = css(PAL.market.board);
  c.lineWidth = 10;
  c.strokeRect(5, 5, w - 10, top - 10);
  c.fillStyle = css(PAL.market.board);
  c.textAlign = "center";
  c.textBaseline = "middle";
  let size = 120;
  const font = (px: number) => `800 ${px}px "Baloo 2", sans-serif`;
  c.font = font(size);
  const room = w - 180;
  const wide = c.measureText(text).width;
  if (wide > room) size = Math.floor((size * room) / wide);
  c.font = font(size);
  c.fillText(text, w / 2, top / 2 + 6);
  // A small fish at each end.
  for (const [x, dir] of [
    [70, 1],
    [w - 70, -1],
  ] as const) {
    c.beginPath();
    c.ellipse(x, top / 2, 30, 17, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x - dir * 26, top / 2);
    c.lineTo(x - dir * 52, top / 2 - 17);
    c.lineTo(x - dir * 52, top / 2 + 17);
    c.closePath();
    c.fill();
  }
  texture.update();
}

interface Drawn {
  root: TransformNode;
  body: InstancedMesh;
  prop: InstancedMesh;
  banner: Mesh;
  glow: PlaneGlow;
  positions: Float32Array;
  spin: number;
}

export class PlaneFleet {
  private readonly scene: Scene;
  private readonly options: PlaneFleetOptions;
  private readonly templates: { body: Mesh; prop: Mesh };
  private readonly sims = makePlans().map((plan) => new PlaneSim(plan));
  private readonly drawn = new Map<number, Drawn>();
  private readonly poses: PlanePose[] = this.sims.map(() => ({
    x: 0,
    z: 0,
    altitude: 0,
    heading: 0,
    bank: 0,
    pitch: 0,
  }));
  private readonly texture: DynamicTexture;
  private readonly material: StandardMaterial;
  private readonly glowMaterial: ShaderMaterial;
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly layout = bannerLayout();
  private readonly quaternion = new Quaternion();
  /** How whole each plane is drawn (1 whole, 0 not at all), by the time fade. */
  private readonly amounts: number[] = this.sims.map(() => 0);
  /** How whole each plane was drawn in the last frame (0: not drawn). */
  private readonly drawnAmounts: number[] = this.sims.map(() => 0);
  private readonly fade: DitheredTileFadeMaterialPlugin;
  private readonly bannerFade: DitheredTileFadeMaterialPlugin;
  private last: number | undefined;
  private primed = false;
  private shown = 0;
  private disposed = false;

  constructor(scene: Scene, options: PlaneFleetOptions) {
    this.scene = scene;
    this.options = options;
    this.templates = buildPlane(scene);
    const text = options.text ?? BANNER_TEXT;
    this.texture = new DynamicTexture(
      "plane-banner",
      { width: 1024, height: 192 },
      scene,
      true,
    );
    paintBanner(this.texture, text);
    // The letters may be drawn before the page's font has loaded: draw once more when it has.
    void document.fonts
      ?.load('800 80px "Baloo 2"')
      .then(() => {
        if (!this.disposed) paintBanner(this.texture, text);
      })
      .catch(() => {});
    this.glowMaterial = createGlowMaterial(scene);
    this.material = glowMaterial(scene, "plane-banner", {
      texture: this.texture,
      textureAlpha: false,
      doubleSided: false,
    });
    // A plane (and its banner) comes into view and leaves it by dithered fade, as the animals do.
    this.fade = DitheredTileFadeMaterialPlugin.GetOrCreate(
      solidMaterial(scene, "satin"),
    );
    this.bannerFade = DitheredTileFadeMaterialPlugin.GetOrCreate(this.material);
  }

  private draw(index: number): Drawn {
    const made = this.drawn.get(index);
    if (made) return made;
    const scene = this.scene;
    const root = new TransformNode(`plane-${index}`, scene);
    root.rotationQuaternion = new Quaternion();
    const body = this.templates.body.createInstance(`plane-body-${index}`);
    body.parent = root;
    const prop = this.templates.prop.createInstance(`plane-prop-${index}`);
    prop.parent = root;
    prop.position.z = NOSE;
    const banner = new Mesh(`banner-${index}`, scene);
    const positions = new Float32Array(this.layout.vertices * 3);
    const data = new VertexData();
    data.positions = Array.from(positions);
    data.indices = this.layout.indices;
    data.uvs = this.layout.uvs;
    data.normals = new Array(this.layout.vertices * 3)
      .fill(0)
      .map((_, i) => (i % 3 === 1 ? 1 : 0));
    data.applyToMesh(banner, true);
    banner.material = this.material;
    // Its box moves every frame and the whole thing is small: always draw it rather than cull it by a stale box.
    banner.alwaysSelectAsActiveMesh = true;
    banner.isPickable = false;
    const glow = new PlaneGlow(
      scene,
      `plane-lights-${index}`,
      this.glowMaterial,
    );
    const entry = { root, body, prop, banner, glow, positions, spin: 0 };
    this.drawn.set(index, entry);
    return entry;
  }

  private show(entry: Drawn, on: boolean) {
    entry.root.setEnabled(on);
    entry.banner.setEnabled(on);
    if (!on) entry.glow.mesh.setEnabled(false);
  }

  /** Where every plane is now (all of them, drawn or not). */
  all(): readonly PlanePose[] {
    return this.poses;
  }

  /** How whole plane `index` was drawn in the last frame, 0 to 1 (0: not drawn). */
  amountOf(index: number): number {
    return this.drawnAmounts[index] ?? 0;
  }

  /** How many planes are drawn now. */
  get visible(): number {
    return this.shown;
  }

  /** Puts plane `index` at a place, flying straight on (tests and tools use it to frame a shot). */
  place(
    index: number,
    x: number,
    altitude: number,
    z: number,
    heading: number,
  ) {
    const sim = this.sims[index];
    if (!sim) return;
    for (const flight of [sim.cur, sim.prev]) {
      flight.x = x;
      flight.z = z;
      flight.altitude = altitude;
      flight.targetAltitude = altitude;
      flight.heading = heading;
      flight.targetHeading = heading;
      flight.rate = 0;
      flight.bank = 0;
      flight.pitch = 0;
      flight.legLeft = 1e9;
      flight.homing = false;
      flight.leaving = false;
    }
    sim.trail.prime(x, altitude, z, heading);
    // Put there by hand: whole at once, not fading in.
    this.amounts[index] = 1;
  }

  /**
   * Each frame. `shared` is the shared clock in seconds (every player's planes are where it says),
   * `time` the sea's own clock (the flutter and the propeller), `camera` where the nearest are chosen.
   */
  update(shared: number, time: number, camera: { x: number; z: number }) {
    const dt = this.last === undefined ? 0 : Math.min(time - this.last, 0.25);
    this.last = time;
    const night = beaconLevel(SEA.grade.y, SEA.weather.y, SEA.weather.z);
    // The banner is unlit so its letters stay readable: at night it only dims a little (it is lit
    // from within, as a night banner is), and the plane's lights come on.
    this.material.emissiveColor = Color3.White().scale(1 - 0.25 * night);
    this.glowMaterial.setFloat("level", night);
    const view = this.scene.activeCamera?.getViewMatrix().m;
    if (view) {
      this.right.set(view[0]!, view[4]!, view[8]!);
      this.up.set(view[1]!, view[5]!, view[9]!);
    }
    const eye = this.scene.activeCamera?.globalPosition;
    this.sims.forEach((sim, index) => {
      sim.advance(shared);
      sim.pose(shared, this.poses[index]!);
    });
    const { range, limit } = this.options;
    const nearest = this.poses
      .map((pose, index) => ({
        index,
        d: Math.hypot(pose.x - camera.x, pose.z - camera.z),
      }))
      .filter((item) => item.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit);
    const show = new Set(nearest.map((item) => item.index));
    this.shown = show.size;
    // Planes already in view when the sea opens start whole, not fading in.
    const first = !this.primed;
    this.primed = true;
    this.poses.forEach((pose, index) => {
      const wanted = show.has(index);
      let fadeTime = this.amounts[index]!;
      if (first && wanted) fadeTime = 1;
      fadeTime = approach(
        fadeTime,
        wanted ? 1 : 0,
        dt,
        wanted ? FADE_IN : FADE_OUT,
      );
      this.amounts[index] = fadeTime;
      const distance = Math.hypot(pose.x - camera.x, pose.z - camera.z);
      const amount = fadeAmount(fadeTime, distance, range);
      const made = this.drawn.get(index);
      this.drawnAmounts[index] = amount;
      if (amount <= 0) {
        if (made) this.show(made, false);
        return;
      }
      const entry = this.draw(index);
      const sim = this.sims[index]!;
      this.show(entry, true);
      this.fade.setFadeBounds(entry.body, 0, amount);
      this.fade.setFadeBounds(entry.prop, 0, amount);
      this.bannerFade.setFadeBounds(entry.banner, 0, amount);
      entry.root.position.set(pose.x, pose.altitude, pose.z);
      Quaternion.RotationYawPitchRollToRef(
        -pose.heading,
        pose.pitch,
        -pose.bank,
        this.quaternion,
      );
      entry.root.rotationQuaternion!.copyFrom(this.quaternion);
      entry.spin += dt * 38;
      entry.prop.rotation.z = entry.spin;
      if (eye)
        entry.glow.update(
          entry.root.computeWorldMatrix(true),
          eye,
          this.right,
          this.up,
          time,
          night,
          amount,
        );
      sim.trail.follow(pose.x, pose.altitude, pose.z);
      fillBanner(this.layout, sim.trail, time, entry.positions);
      entry.banner.updateVerticesData(
        VertexBuffer.PositionKind,
        entry.positions,
      );
    });
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.drawn.values()) {
      entry.glow.dispose();
      entry.banner.dispose();
      entry.prop.dispose();
      entry.body.dispose();
      entry.root.dispose();
    }
    this.drawn.clear();
    this.templates.body.dispose();
    this.templates.prop.dispose();
    this.material.dispose();
    this.glowMaterial.dispose();
    this.texture.dispose();
  }
}
