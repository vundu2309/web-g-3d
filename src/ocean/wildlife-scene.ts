import "@babylonjs/core/Meshes/instancedMesh";
import { DitheredTileFadeMaterialPlugin } from "@babylonjs/core/Materials/ditheredTileFadeMaterialPlugin";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { solidMaterial } from "./art/materials.ts";
import { cachedFishModel, loadFishModel } from "./fish-models.ts";
import { creatureOf, fishFile } from "./glb-parts.ts";
import { meshFrom } from "./mesh-parts.ts";
import { simplifyPart } from "./simplify.ts";
import { waveHeight } from "./waves.ts";
import {
  ANIMALS,
  KINDS,
  LOD_TRIANGLES,
  approach,
  chooseVisible,
  hasLevels,
  wildPose,
  type Kind,
} from "./wildlife.ts";

/**
 * Draws the living animals of wildlife.ts. Each kind has up to three meshes built from its model
 * file once it has loaded (the whole model and two coarser copies, simplify.ts) and every animal
 * has one instance of each, so a hundred animals still read the same geometry; of an animal's
 * instances only the one for its level (how big it looks on screen) is switched on.
 *
 * An animal comes into view and leaves it by dithered fade, as in most games: the pixels of its
 * model switch on or off in a fixed screen pattern (Babylon's DitheredTileFadeMaterialPlugin, an
 * opaque fade: no blending, no sorting), so it dissolves in and out instead of appearing in one
 * frame. The meshes are named `wild-*`, which keeps them out of the water's mirror
 * (reflection-model.ts): drawing a 78,048-triangle crab a second time for a reflection nobody could
 * see is not worth it.
 */
/** Fade per second: about 1.4 s to come in, 0.8 s to go out. */
const FADE_IN = 0.7;
const FADE_OUT = 1.25;

export class Wildlife {
  private readonly levels = new Map<Kind, Mesh[]>();
  private readonly instances = new Map<string, InstancedMesh[]>();
  private readonly state = new Map<string, { amount: number; level: number }>();
  private readonly fade: DitheredTileFadeMaterialPlugin;
  private last: number | undefined;
  /** False until the first update: animals already in view then start fully shown, not fading in. */
  private primed = false;
  private disposed = false;

  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.fade = DitheredTileFadeMaterialPlugin.GetOrCreate(
      solidMaterial(scene, "satin"),
    );
    // Each kind appears as soon as its file is there; nothing waits for them.
    for (const kind of Object.keys(KINDS) as Kind[]) this.prepare(kind);
  }

  private prepare(kind: Kind) {
    const file = fishFile(KINDS[kind].species);
    const make = () => {
      const template = cachedFishModel(file);
      if (!template || this.disposed || this.scene.isDisposed) return;
      const whole = creatureOf(template).main;
      // The coarse copies are only ever seen from far away; the whole model is never changed.
      const parts = hasLevels(kind)
        ? [
            whole,
            simplifyPart(whole, LOD_TRIANGLES[1]),
            simplifyPart(whole, LOD_TRIANGLES[2]),
          ]
        : [whole];
      const meshes = parts.map((part, level) => {
        const mesh = meshFrom(
          `wild-${kind}-${level}`,
          this.scene,
          part.positions,
          part.indices,
          part.colors,
          part.normals,
        );
        mesh.material = solidMaterial(this.scene, "satin");
        mesh.useVertexColors = true;
        mesh.hasVertexAlpha = false;
        mesh.isVisible = false;
        mesh.isPickable = false;
        return mesh;
      });
      this.levels.set(kind, meshes);
      for (const animal of ANIMALS)
        if (animal.kind === kind)
          this.instances.set(
            animal.id,
            meshes.map((mesh, level) => {
              const instance = mesh.createInstance(
                `wild-${animal.id}-${level}`,
              );
              instance.isPickable = false;
              instance.setEnabled(false);
              return instance;
            }),
          );
    };
    if (cachedFishModel(file)) make();
    else void loadFishModel(file).then(make);
  }

  /** Poses the animals for time `t` (seconds), as seen from `eye` (the camera), and fades the rest out. */
  update(t: number, eye: { x: number; y: number; z: number } | undefined) {
    const dt =
      this.last === undefined ? 0 : Math.min(Math.max(t - this.last, 0), 0.25);
    this.last = t;
    const wanted = eye ? chooseVisible(eye, t) : new Map<string, number>();
    for (const animal of ANIMALS) {
      const instances = this.instances.get(animal.id);
      if (!instances) continue;
      const level = wanted.get(animal.id);
      let now = this.state.get(animal.id);
      if (level !== undefined) {
        if (!now) now = { amount: this.primed ? 0 : 1, level };
        now.level = Math.min(level, instances.length - 1);
        now.amount = approach(now.amount, 1, dt, FADE_IN);
      } else if (now) {
        now.amount = approach(now.amount, 0, dt, FADE_OUT);
        if (now.amount <= 0) now = undefined;
      }
      if (!now) {
        this.state.delete(animal.id);
        instances.forEach((instance) => {
          if (instance.isEnabled()) instance.setEnabled(false);
        });
        continue;
      }
      this.state.set(animal.id, now);
      const pose = wildPose(animal, t);
      const length = KINDS[animal.kind].length;
      instances.forEach((instance, i) => {
        const on = i === now.level;
        if (instance.isEnabled() !== on) instance.setEnabled(on);
        if (!on) return;
        // The pixels in [0, amount) of the screen's dither pattern are drawn: 1 is the whole animal.
        this.fade.setFadeBounds(instance, 0, now.amount);
        instance.position.set(
          pose.x,
          pose.level === "sea"
            ? waveHeight(pose.x, pose.z, t) + pose.y
            : pose.y,
          pose.z,
        );
        instance.rotation.set(pose.roll, pose.heading, pose.pitch);
        instance.scaling.set(
          length * pose.sx,
          length * pose.sy,
          length * pose.sz,
        );
      });
    }
    if (eye) this.primed = true;
  }

  dispose() {
    this.disposed = true;
    for (const list of this.instances.values())
      for (const instance of list) instance.dispose();
    for (const list of this.levels.values())
      for (const mesh of list) mesh.dispose();
    this.instances.clear();
    this.levels.clear();
    this.state.clear();
  }
}
