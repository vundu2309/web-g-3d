import { topGroups } from "./perf-meter.ts";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Meshes/instancedMesh";
import {
  createBoatPhysics,
  type ParkedBoat,
  enableSeaPhysics,
  type BoatPhysics,
  type BoatState,
} from "./boat-physics.ts";
import {
  boatPalettes,
  createBoatTemplate,
  createFishingLine,
} from "./boat-visual.ts";
import {
  dressBoat,
  loadBoatModels,
  showBoatLevel,
  type BoatModels,
} from "./boat-model.ts";
import { boatLevelOf } from "./boat-lod.ts";
import {
  PATROL_BOX,
  PATROL_MODEL,
  boatTier,
  boatTierIndex,
  boxRatio,
  cameraScale,
} from "./boat-tier.ts";
import { createHavok } from "./havok.ts";
import { createIsland, type IslandVisual } from "./island-visual.ts";
import { createSeabed, type Seabed } from "./seabed-visual.ts";
import { loadIslandModels, placeIslandProps } from "./island-models.ts";
import { islandSeed } from "./shore.ts";
import { SeaProps } from "./sea-props.ts";
import { Wildlife } from "./wildlife-scene.ts";
import { PropBatches } from "./prop-batches.ts";
import { probe } from "./probe.ts";
import { RippleSim, SIM_N, type Hull } from "./ripple-sim.ts";
import { OrbitCamera } from "./orbit-camera.ts";
import {
  CHASE,
  clearFraction,
  easeClear,
  heightFor,
  pushOut,
  reachFor,
  turnLead,
} from "./chase-camera.ts";
import { MARKETS, seaObstacles } from "./market.ts";
import { PATROL_SPEED } from "./patrol-routes.ts";
import {
  createPatrolLights,
  updateLensGlow,
  type PatrolLights,
} from "./patrol-lights.ts";
import { createMarket } from "./market-visual.ts";
import { createShipyards, type ShipyardVisuals } from "./shipyard-visual.ts";
import { SHIPYARDS } from "./shipyard.ts";
import { loadCats } from "./cats.ts";
import { preloadFishModels } from "./fish-models.ts";
import { placeVendors } from "./market-vendor.ts";
import { WakeMesh } from "./wake-mesh.ts";
import { WakeTrail } from "./wake-trail.ts";
import { islands, lighthouseIslands, type Boat, type Pose } from "./model.ts";
import { FishSchools } from "./fish-schools.ts";
import { FishingGear, type GearInput } from "./fishing-gear.ts";
import { paletteIndex } from "./palette.ts";
import { baitTierIndex } from "./bait-view.ts";
import { rodPlan, rodTierIndex } from "./rod-plan.ts";
import { RodVisual } from "./rod-visual.ts";
import { FOG_DENSITY, HORIZON } from "./sea-style.ts";
import { stepAtmosphere } from "./sea-atmosphere.ts";
import { createRain, type Rain } from "./rain.ts";
import { createBeacon, type Beacon } from "./beacon.ts";
import { createSeaLights } from "./art/lighting.ts";
import { edgeIndicator, separateLabels } from "./indicator.ts";
import { ScaleGovernor } from "./render-scale.ts";
import { loadRowerAssets } from "./cat-boat.ts";
import { CatFleet } from "./cat-fleet.ts";
import { createSeaReflection } from "./reflection.ts";
import { createClearWater, type ClearWater } from "./clear-water-pass.ts";
import { ClearWaterGovernor } from "./clear-water.ts";
import { createSky, type Sky } from "./sky.ts";
import { createWater, type BoatSpot, type Water } from "./water.ts";
import { waveHeight } from "./waves.ts";

// A tab that comes back after being hidden must not replay seconds of physics.
Scene.MaxDeltaTime = 100;

interface Craft {
  /** The boat's pose node: the sea or the physics places it; the hull, the rod and the line hang from it. */
  mesh: TransformNode;
  /** The hull's meshes (instances): the code-built boat until the model is loaded, then the model. */
  look: AbstractMesh[];
  palette: number;
  /** Which boat it is (boat-tier.ts, 0 to 3): its model, its rod holder and its hull in the water. */
  tier: number;
  /** How much of the boat is drawn (boat-lod.ts): 0 whole, 1 middle, 2 far. The player's is always 0. */
  level: number;
  rod: RodVisual;
  /** Which rod it holds (rod-plan.ts, 0 to 3): bamboo, fibreglass, carbon fibre or gold. */
  rodTier: number;
  label: HTMLElement;
  /** The player is not online: the boat lies where it was left (a dimmer name, no line, a hard obstacle). */
  offline?: boolean;
  /** A boat nobody owns, sailed by the clock (patrol-routes.ts): no rod, no line, no name arrow. */
  npc?: boolean;
  /** A patrol ship's lights (patrol-lights.ts): made once its own model, with the light-bar lenses, has loaded. */
  lights?: PatrolLights;
  line?: Mesh;
  // Smoothed display pose of a remote boat.
  x: number;
  z: number;
  heading: number;
  seen: boolean;
}

/** How much higher than the first boat's a boat's name floats: its mast is as much taller (boat-tier.ts). */
const labelLift = (tier: number) =>
  Math.max(0, boatTier(tier).shadow.mast.to - boatTier(0).shadow.mast.to);

/** Where a patrol ship's searchlight swings (0..1), from its name, so the ships do not swing together. */
const lightPhase = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % 1000) / 1000;
};
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const blend = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
const NORMALIZED = new Viewport(0, 0, 1, 1);
/** Parked boats within this many metres of the player's own boat are hard obstacles (m). */
const PARKED_SOLID_REACH = 150;
/** `?tiers=0` draws every boat with the first boat's model (a switch for finding what costs frames; also in Settings, probe.ts). */
const tiersOff = () => probe("tiers") === "0";

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
  private readonly rain: Rain;
  private readonly beacons: Beacon[] = [];
  private readonly templates: Mesh[];
  /**
   * The Blender boats, by tier, as each has loaded (the first boat's is awaited by `ready()`, the
   * others load when a boat of that tier is first needed). Until then, and if a load fails, a
   * boat keeps the model of tier 0, or the code-built one when that has not loaded either.
   */
  private readonly boatModels = new Map<number, BoatModels>();
  private readonly boatLoads = new Map<
    number,
    Promise<BoatModels | undefined>
  >();
  private readonly boatLoad: Promise<unknown>;
  /** The tier of the player's boat (applied by `setBoatTier`; what `spawnSelf` builds the body with). */
  private tier = 0;
  /** The tier of each other player's boat (`setRemoteBoatTier`), for boats that are not here yet. */
  private readonly remoteTiers = new Map<string, number>();
  /** The rod the player holds (applied by `setRodTier`) and the rod of each other player (`setRemoteRodTier`). */
  private rodTier = 0;
  /** The bait on the line (upgrades.ts tier 0 to 3), for a gear that is made after it was chosen. */
  private bait = 0;
  private readonly remoteRodTiers = new Map<string, number>();
  private readonly fleet = new Map<string, Craft>();
  private readonly observer: ResizeObserver;
  private self:
    | {
        physics: BoatPhysics;
        craft: Craft;
        uid: string;
      }
    | undefined;
  private clock = 0;
  /** The NPC rowing cats (cat-fleet.ts), once their models have loaded; `sharedClock` is the clock they follow (seconds). */
  private cats: CatFleet | undefined;
  private sharedClock: () => number = () => Date.now() / 1000;
  private viewHeading = 0;
  private viewReady = false;
  private readonly orbit = new OrbitCamera();
  /** What the chase camera keeps clear of: the islands' shores and the piers. */
  private readonly obstacles = seaObstacles();
  /** 0..1: how much of its reach the camera keeps while something is in the way. */
  private clear = 1;
  /** How far the view looks into the boat's turn (rad), and the heading last frame. */
  private lead = 0;
  private lastHeading: number | undefined;
  private readonly markets: Mesh[];
  /** 0..1: how far the camera has moved in for fishing. */
  private focus = 0;
  private readonly governor: ScaleGovernor;
  /** The see-through sea (clear-water.ts): the layer of what lies under the water, and the switch that turns it off when frames are slow. */
  private readonly clearWater: ClearWater | undefined;
  private readonly clearGovernor: ClearWaterGovernor;
  private lost = false;
  private gear: FishingGear | undefined;
  private readonly seaProps: SeaProps;
  /** The sea floor round the islands, seen through the clear water (seabed.ts). */
  private readonly seabed: Seabed;
  private readonly schools: FishSchools;
  private readonly wildlife: Wildlife;
  private readonly propFade: PropBatches;
  /** The three shipyards on the shores (shipyard-visual.ts). */
  private readonly yards: ShipyardVisuals;
  /** The water the boats stir, simulated: the sea draws it and the hulls float on it (ripple-sim.ts). */
  private readonly sim = new RippleSim();
  private readonly simPixels = new Float32Array(SIM_N * SIM_N * 4);
  /** The bow wave of each boat and the path it has just taken, yours under "self". */
  private readonly trails = new Map<
    string,
    { trail: WakeTrail; mesh: WakeMesh }
  >();
  private gearInput: Omit<GearInput, "tip" | "time"> | undefined;
  private readonly canvas: HTMLCanvasElement;
  /** Settles once the island models are in place (or failed and the fallback stays). */
  private readonly islandProps: Promise<void>;
  private readonly vendors: Promise<void>;

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
    // Start sharp (up to 2x the CSS size, 1x on a touch screen: at 1.5x a phone made 23 fps, at 1x 39, where the GPU is the weak part);
    // the governor lowers it further if the phone struggles.
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.governor = new ScaleGovernor({
      sharpest:
        1 /
        (Number(probe("scale")) ||
          Math.min(window.devicePixelRatio || 1, touch ? 1 : 2)),
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
    this.scene.fogColor = HORIZON.clone();
    enableSeaPhysics(this.scene, plugin);
    this.camera = new FreeCamera("camera", new Vector3(0, 10, 16), this.scene);
    this.camera.inputs.clear();
    this.camera.fov = 0.9;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 3200;
    this.scene.activeCamera = this.camera;
    createSeaLights(this.scene);
    this.water = createWater(this.scene);
    this.sky = createSky(this.scene);
    this.rain = createRain(this.scene);
    // The sea mirrors the islands, markets and boats too (a predicate over the whole scene).
    if (probe("reflect") !== "0")
      createSeaReflection(this.scene, this.water, this.sky);
    // The sea is see-through: hulls, piles, rocks, the fish and the line show through it. Slow
    // frames switch it off again (the opaque sea), before the render scale is coarsened.
    this.clearWater = createClearWater(this.scene, this.water);
    this.clearGovernor = new ClearWaterGovernor(this.clearWater !== undefined);
    this.clearWater?.setEnabled(this.clearGovernor.enabled);
    this.templates = boatPalettes.map((palette, i) => {
      const template = createBoatTemplate(this.scene, palette, `boat-${i}`);
      template.isVisible = false;
      return template;
    });
    this.seabed = createSeabed(this.scene);
    const visuals = islands.map((island, index) => {
      const visual = createIsland(this.scene, {
        seed: islandSeed(index),
        radius: island.radius,
        lighthouse: lighthouseIslands.includes(index),
      });
      visual.mesh.position.set(island.x, 0, island.z);
      visual.mesh.freezeWorldMatrix();
      // The lighthouse lamp shines at night.
      if (visual.lamp)
        this.beacons.push(
          createBeacon(this.scene, {
            x: island.x + visual.lamp.x,
            y: visual.lamp.y,
            z: island.z + visual.lamp.z,
          }),
        );
      return visual;
    });
    // The fishing gear is built now, not at the first throw: building it (meshes, textures, shaders)
    // while the button is held made the first throw of a visit hitch, and `ready()` compiles it.
    this.gear = this.newGear();
    // The NPC rowing cats: boats rowing between the islands by the shared clock. `?cats=0` (or the
    // Settings switch) leaves them out.
    if (probe("cats") !== "0")
      void loadRowerAssets(this.scene)
        .then((assets) => {
          if (this.scene.isDisposed) return;
          this.cats = new CatFleet(this.scene, assets, {
            range: touch ? 130 : 220,
            limit: touch ? 3 : 5,
          });
        })
        .catch((error) => console.warn("No rowing cats.", error));
    this.boatLoad = this.ensureBoatModels(0);
    this.islandProps = this.placeIslandModels(visuals);
    // A fish market on the water off each island.
    this.markets = MARKETS.map((market) => createMarket(this.scene, market));
    this.yards = createShipyards(this.scene);
    this.vendors = this.placeVendorCats();
    this.seaProps = new SeaProps(this.scene);
    this.schools = new FishSchools(this.scene);
    if (probe("fish") === "0") this.schools.hide();
    this.wildlife = new Wildlife(this.scene);
    this.propFade = new PropBatches();
    this.observer = new ResizeObserver(() => this.engine.resize());
    this.observer.observe(host);
    this.engine.resize();
  }

  /**
   * Loads the Blender boat of a tier once (a second call gets the same promise) and swaps it in
   * for every boat of that tier drawn so far (and those that follow). Resolves with the models, or
   * undefined when the load failed (a warning is logged and a later call tries again).
   */
  /** Which model a craft is drawn with: its tier's, or the patrol ships' own. */
  private modelKey(craft: Craft): number {
    return craft.npc ? PATROL_MODEL : craft.tier;
  }

  private ensureBoatModels(tier: number): Promise<BoatModels | undefined> {
    // With `?tiers=0` the bigger models are never loaded: every boat is drawn as the first.
    const wanted = tiersOff()
      ? 0
      : tier === PATROL_MODEL
        ? PATROL_MODEL
        : boatTierIndex(tier);
    const known = this.boatModels.get(wanted);
    if (known) return Promise.resolve(known);
    let load = this.boatLoads.get(wanted);
    if (!load) {
      load = (async () => {
        try {
          const models = await loadBoatModels(this.scene, wanted);
          if (this.scene.isDisposed) {
            this.boatLoads.delete(wanted);
            return undefined;
          }
          this.boatModels.set(wanted, models);
          // Every boat of this tier gets its model; when it is the first boat's, so does every
          // boat of a bigger tier whose own model has not arrived (it stands in for it).
          for (const craft of [
            ...(this.self ? [this.self.craft] : []),
            ...this.fleet.values(),
          ])
            if (
              this.modelKey(craft) === wanted ||
              (wanted === 0 && !this.boatModels.has(this.modelKey(craft)))
            )
              this.dress(craft);
          return models;
        } catch (error) {
          this.boatLoads.delete(wanted);
          console.warn(
            wanted === 0
              ? "The boat model did not load; the boat built from code stays."
              : `The model of boat tier ${wanted} did not load; the boat keeps its look.`,
            error,
          );
          return undefined;
        }
      })();
      this.boatLoads.set(wanted, load);
    }
    return load;
  }

  /** Gives a boat its hull: the model of its tier when it is loaded, else the first boat's, else the code-built one. */
  private dress(craft: Craft) {
    for (const mesh of craft.look) mesh.dispose();
    const models =
      this.boatModels.get(this.modelKey(craft)) ?? this.boatModels.get(0);
    // The other players' boats also get coarser copies for when they are far (boat-lod.ts).
    const others = craft !== this.self?.craft;
    craft.look = models
      ? dressBoat(models, craft.palette, craft.mesh, craft.mesh.name, others)
      : this.codeBoat(craft);
    if (others) showBoatLevel(craft.look, craft.level);
    // A patrol ship's lights need its own model (the lenses); until it has loaded there are none.
    craft.lights?.dispose();
    craft.lights = undefined;
    if (craft.npc && models?.lenses)
      craft.lights = createPatrolLights(
        this.scene,
        craft.mesh,
        models.lenses,
        craft.mesh.name,
        lightPhase(craft.mesh.name),
      );
  }

  /** Draws another player's boat as the whole model, a coarser copy or a far copy by how big it looks (boat-lod.ts). */
  private pickLevel(craft: Craft) {
    const level = boatLevelOf(
      craft.tier,
      Math.hypot(
        craft.x - this.camera.position.x,
        craft.z - this.camera.position.z,
      ),
      craft.level,
    );
    if (level === craft.level) return;
    craft.level = level;
    showBoatLevel(craft.look, level);
    craft.rod.setVisible(!craft.npc && level < 2);
  }

  /** A boat of another tier: its model, and its rod at its own holder. */
  private refit(craft: Craft, tier: number) {
    craft.tier = tier;
    this.dress(craft);
    this.newRod(craft);
  }

  /** The craft's rod, built again for its boat's holder and its rod tier (a boat or a rod was changed). */
  private newRod(craft: Craft) {
    craft.rod.dispose();
    craft.rod = new RodVisual(
      this.scene,
      craft.mesh,
      boatPalettes[craft.palette],
      undefined,
      boatTier(craft.tier).rod,
      craft.rodTier,
    );
    if (craft.level >= 2) craft.rod.setVisible(false);
  }

  /** The fishing gear, with the chosen bait already on its line. */
  private newGear(): FishingGear {
    const gear = new FishingGear(this.scene);
    gear.setBait(this.bait);
    return gear;
  }

  /**
   * Puts a bait on the line (upgrades.ts tier 0 to 3): the orange lure for the default bait, the
   * bait's own model for the others (bait-view.ts). An invalid tier is the default bait.
   */
  setBait(tier: number) {
    this.bait = baitTierIndex(tier);
    this.gear?.setBait(this.bait);
  }

  /**
   * Gives the player the rod of a tier (rod-plan.ts, 0 to 3), in their hand at once: a bought rod
   * is on the boat the moment it is chosen. Before `spawnSelf` it only says which rod will be
   * built. What the rod does to a fight is not here (upgrades.ts); this is the picture. An invalid
   * tier is the free bamboo rod.
   */
  setRodTier(tier: number) {
    const wanted = rodTierIndex(tier);
    this.rodTier = wanted;
    const self = this.self;
    if (self && self.craft.rodTier !== wanted) {
      self.craft.rodTier = wanted;
      this.newRod(self.craft);
    }
  }

  /**
   * Says which rod another player holds (rod-plan.ts, 0 to 3): drawn in their boat's hands at
   * once; a boat that is not here yet gets it when it arrives. An invalid tier is tier 0.
   */
  setRemoteRodTier(uid: string, tier: number) {
    const wanted = rodTierIndex(tier);
    this.remoteRodTiers.set(uid, wanted);
    const craft = this.fleet.get(uid);
    if (craft && craft.rodTier !== wanted && !this.scene.isDisposed) {
      craft.rodTier = wanted;
      this.newRod(craft);
    }
  }

  /**
   * Gives the player's boat the model, the body, the rod holder, the hull in the water and the
   * shadow of a boat tier (boat-tier.ts, 0 to 3), all at once. The model of a tier that has not
   * loaded yet is loaded first, so nothing changes until it can all change together; resolves
   * `true` when the player's boat is now that tier, `false` when the model could not be loaded
   * (nothing changed; asking again tries again). The body keeps its place and its velocity
   * (boat-physics.ts `setTier`), so a purchase does not drop the boat. Before `spawnSelf` it only
   * says which tier the body will be built with. Handling does not change with the tier.
   */
  async setBoatTier(tier: number): Promise<boolean> {
    const wanted = boatTierIndex(tier);
    if (wanted > 0 && !(await this.ensureBoatModels(wanted))) return false;
    if (this.scene.isDisposed) return false;
    this.tier = wanted;
    const self = this.self;
    if (self && self.craft.tier !== wanted) {
      self.physics.setTier(wanted);
      this.refit(self.craft, wanted);
    }
    return true;
  }

  /** Loads the model of a tier without using it, so a later `setBoatTier` (or a boat of that tier arriving) is instant. */
  async preloadBoatTier(tier: number): Promise<boolean> {
    return (await this.ensureBoatModels(tier)) !== undefined;
  }

  /**
   * Says which boat another player has (boat-tier.ts, 0 to 3): their boat is drawn with that tier's
   * model, rod holder and hull in the water, as soon as the model has loaded; a boat that is not
   * here yet is made that tier when it arrives. An invalid tier is tier 0.
   */
  async setRemoteBoatTier(uid: string, tier: number): Promise<void> {
    const wanted = boatTierIndex(tier);
    this.remoteTiers.set(uid, wanted);
    if (wanted > 0) await this.ensureBoatModels(wanted);
    const craft = this.fleet.get(uid);
    if (
      craft &&
      this.remoteTiers.get(uid) === wanted &&
      craft.tier !== wanted &&
      !this.scene.isDisposed
    )
      this.refit(craft, wanted);
  }

  private codeBoat(craft: Craft) {
    const hull = this.templates[craft.palette]!.createInstance(
      `${craft.mesh.name}-hull`,
    );
    hull.parent = craft.mesh;
    hull.isPickable = false;
    return [hull];
  }

  private craft(
    uid: string,
    name: string,
    isSelf: boolean,
    tier = 0,
    rodTier = 0,
    npc = false,
  ): Craft {
    const mesh = new TransformNode(`boat-${uid}`, this.scene);
    const palette = paletteIndex(uid);
    const label = document.createElement("span");
    label.className = "ocean-boat-label";
    label.textContent = isSelf ? "Bạn" : name;
    label.dataset.uid = uid;
    if (isSelf) label.classList.add("is-self");
    if (npc) label.classList.add("is-npc");
    this.host.append(label);
    const craft: Craft = {
      mesh,
      look: [],
      palette,
      tier,
      level: 0,
      rod: new RodVisual(
        this.scene,
        mesh,
        boatPalettes[palette],
        undefined,
        boatTier(tier).rod,
        rodTier,
      ),
      rodTier,
      label,
      ...(npc ? { npc: true } : {}),
      x: 0,
      z: 0,
      heading: 0,
      seen: true,
    };
    // A patrol ship holds no rod.
    if (npc) craft.rod.setVisible(false);
    this.dress(craft);
    return craft;
  }

  /** Creates the player's physics boat at the server-assigned start pose. */
  spawnSelf(uid: string, name: string, pose: Pose) {
    if (this.self) return;
    const physics = createBoatPhysics(this.scene, {
      islands: seaObstacles(),
      time: () => this.clock,
      extraHeight: (x, z) => this.sim.sample(x, z).height,
      start: { x: pose.x, z: pose.z, heading: pose.heading },
      tier: this.tier,
    });
    const craft = this.craft(uid, name, true, this.tier, this.rodTier);
    // A boat of a bigger tier is drawn with the first boat's model until its own has loaded.
    if (this.tier > 0) void this.ensureBoatModels(this.tier);
    craft.mesh.parent = physics.view;
    craft.mesh.position.set(0, -0.25, 0);
    this.self = {
      physics,
      craft,
      uid,
    };
    this.viewHeading = pose.heading;
    this.viewReady = false;
  }

  /** The clock the NPC rowing cats follow (seconds): the server's, so every player sees them at the same places. */
  setSharedClock(seconds: () => number) {
    this.sharedClock = seconds;
  }

  /** Where the NPC rowing cats are now, for the minimap. */
  catBoats(): readonly { x: number; z: number; heading: number }[] {
    return this.cats?.all() ?? [];
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
      craft.line = createFishingLine(
        this.scene,
        craft.mesh,
        boatTier(craft.tier).rod,
        rodPlan(craft.rodTier).restBend,
      );
    if (!fishing && craft.line) {
      craft.line.dispose();
      craft.line = undefined;
    }
  }

  /** Orients a boat on the sea surface from the wave slope under it. */
  private rest(
    mesh: TransformNode,
    x: number,
    z: number,
    heading: number,
    t: number,
    tier = 0,
  ) {
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = Math.sin(heading);
    // Where the waves are read follows the hull's size (the first boat: 3.5 m fore and aft, 1.4 m out).
    const size = boxRatio(tier);
    const half = 3.5 * size.length;
    const out = 1.4 * size.width;
    const bow = waveHeight(x + fx * half, z + fz * half, t);
    const stern = waveHeight(x - fx * half, z - fz * half, t);
    const starboard = waveHeight(x + rx * out, z + rz * out, t);
    const port = waveHeight(x - rx * out, z - rz * out, t);
    const pitch = Math.atan2(bow - stern, 7 * size.length);
    const roll = Math.atan2(starboard - port, 2.8 * size.width);
    mesh.position.set(x, (bow + stern + starboard + port) / 4, z);
    mesh.rotationQuaternion = Quaternion.RotationAxis(Axis.Y, -heading)
      .multiply(Quaternion.RotationAxis(Axis.X, pitch))
      .multiply(Quaternion.RotationAxis(Axis.Z, roll));
  }

  /** Records where a boat is and draws the white water it leaves. */
  private leaveTrail(id: string, x: number, z: number, tier: number, wet = 1) {
    let entry = this.trails.get(id);
    if (!entry) {
      entry = {
        trail: new WakeTrail(),
        mesh: new WakeMesh(this.scene),
      };
      this.trails.set(id, entry);
    }
    entry.trail.push(x, z, this.clock);
    entry.mesh.update(entry.trail, this.clock, { x, z }, wet, tier);
  }

  /** How wet your hull is, 0 (lifted clear of the water) to 1, smoothed over about a tenth of a second so a wave that lets go of the hull for one step does not make the foam flicker. */
  private wetness = 1;
  private wetOf(points: readonly { wet: number }[], dt: number) {
    let target = 0;
    for (const point of points) target += point.wet;
    target /= Math.max(1, points.length);
    this.wetness += (target - this.wetness) * Math.min(1, dt * 10);
    return this.wetness;
  }

  /**
   * A boat as the water sees it: where it is, which way it points and how fast it goes. Your own
   * boat also tells how each point of its hull moves (the turn, the slide, the heave), which is
   * what the physics knows; another player's boat only has its pose and speed.
   */
  private hullOf(id: string, x: number, z: number, tier: number): Hull {
    const newest = this.trails.get(id)?.trail.samples.at(-1);
    return {
      x,
      z,
      heading: newest?.heading ?? 0,
      speed: newest?.speed ?? 0,
      points: id === "self" ? this.self?.physics.contacts() : undefined,
      tier,
    };
  }

  private forgetTrail(id: string) {
    this.trails.get(id)?.mesh.dispose();
    this.trails.delete(id);
  }

  /**
   * The Blender palms, rocks and hut replace each island's procedural ones once loaded; until
   * then (and for good if the load fails) the procedural ones are drawn.
   */
  private async placeIslandModels(visuals: IslandVisual[]) {
    try {
      const models = await loadIslandModels(this.scene);
      if (this.scene.isDisposed) return;
      for (const visual of visuals)
        this.propFade.add(placeIslandProps(visual, models, MARKETS, SHIPYARDS));
    } catch (error) {
      if (!this.scene.isDisposed)
        console.warn(
          "Island models did not load; keeping the simple ones.",
          error,
        );
    }
  }

  /** The cat vendors appear on the piers once loaded; a failed load leaves the stalls empty. */
  private async placeVendorCats() {
    try {
      const cats = await loadCats(this.scene);
      if (this.scene.isDisposed) return;
      placeVendors(
        this.scene,
        MARKETS.map((market, i) => ({ market, mesh: this.markets[i]! })),
        cats,
        () => this.clock,
      );
    } catch (error) {
      if (!this.scene.isDisposed)
        console.warn("Vendor cats did not load; the stalls stay empty.", error);
    }
  }

  /**
   * Resolves once the island models and the vendors are placed (or have failed) and every mesh, material and
   * shader has been compiled for the first frame.
   */
  async ready() {
    await Promise.all([
      this.islandProps,
      this.vendors,
      this.boatLoad,
      this.yards.ready,
    ]);
    await this.scene.whenReadyAsync();
    await this.clearWater?.compile();
    // The sea animals' files (about 1.4 MB) come after the first frame, never before it: a fish
    // that bites sooner is drawn from code until its file has arrived (see creature-kit.ts).
    void preloadFishModels();
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

  /** A finger dragged on the sea: turn the camera around the boat (see orbit-camera.ts). */
  orbitBy(dx: number, dy: number) {
    this.orbit.drag(dx, dy);
  }

  /** A finger is down on the sea (true) or lifted (false). */
  orbitHold(on: boolean) {
    this.orbit.hold(on);
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
    this.gear ??= this.newGear();
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
    // The day and the weather: the shared UTC clock (atmosphere.ts), once per frame, before anything reads it.
    stepAtmosphere();
    const step = Math.min(dt, 0.1);
    const lenses = this.boatModels.get(PATROL_MODEL)?.lenses;
    if (lenses) updateLensGlow(lenses, time, reduced);
    const present = new Set<string>();
    const parked: ParkedBoat[] = [];
    const ships: { uid: string; x: number; z: number; heading: number }[] = [];
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
      // What the other player has bought (the server reads it from their account, never from them):
      // their boat's model and their rod. Asked once per change; a boat that is not here yet is
      // made that way below.
      // A patrol ship owns nothing: it takes its hull numbers from `boat.tier` and its own model.
      if (!boat.npc && this.remoteTiers.get(boat.uid) !== boat.tier)
        void this.setRemoteBoatTier(boat.uid, boat.tier);
      if (!boat.npc && this.remoteRodTiers.get(boat.uid) !== boat.rod)
        this.setRemoteRodTier(boat.uid, boat.rod);
      let craft = this.fleet.get(boat.uid);
      if (!craft) {
        craft = this.craft(
          boat.uid,
          boat.name,
          false,
          boat.npc ? boat.tier : (this.remoteTiers.get(boat.uid) ?? 0),
          boat.npc ? 0 : (this.remoteRodTiers.get(boat.uid) ?? 0),
          boat.npc === true,
        );
        // A bigger boat shows the first boat's model until its own has loaded.
        if (this.modelKey(craft) > 0)
          void this.ensureBoatModels(this.modelKey(craft));
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
      this.rest(
        craft.mesh,
        craft.x,
        craft.z,
        craft.heading,
        this.clock,
        craft.tier,
      );
      // A patrol ship (nobody's boat): no rod in its hands, a name of its own colour.
      if ((craft.npc ?? false) !== (boat.npc === true)) {
        craft.npc = boat.npc === true;
        craft.label.classList.toggle("is-npc", craft.npc);
        craft.rod.setVisible(!craft.npc && craft.level < 2);
      }
      // A parked boat (its player is not online) is named so, has no line out and is a hard obstacle.
      const offline = boat.offline === true;
      if ((craft.offline ?? false) !== offline) {
        craft.offline = offline;
        craft.label.textContent = offline
          ? `${boat.name} · ngoại tuyến`
          : boat.name;
        craft.label.classList.toggle("is-offline", offline);
      }
      if (offline)
        parked.push({
          uid: boat.uid,
          x: boat.x,
          z: boat.z,
          heading: boat.heading,
          tier: craft.tier,
        });
      if (craft.npc)
        ships.push({
          uid: boat.uid,
          x: boat.x,
          z: boat.z,
          heading: boat.heading,
        });
      this.setLine(craft, offline ? false : boat.fishing);
      this.pickLevel(craft);
      craft.lights?.update(time, this.camera.position, reduced);
      craft.label.dataset.x = String(boat.x);
      craft.label.dataset.z = String(boat.z);
    }
    // The parked boats near the player's own boat are solid (the farther ones are not worth a body),
    // and so are the patrol ships near it, which move: Havok is told where each one goes.
    if (this.self) {
      const at = this.self.physics.state();
      const near = (boat: { x: number; z: number }) =>
        Math.hypot(boat.x - at.x, boat.z - at.z) < PARKED_SOLID_REACH;
      this.self.physics.setParked(parked.filter(near));
      this.self.physics.setShips(
        ships
          .filter(near)
          .map((ship) => ({ ...ship, speed: PATROL_SPEED, ...PATROL_BOX })),
      );
    }
    for (const [id, craft] of this.fleet)
      if (!present.has(id)) {
        this.forgetTrail(id);
        this.remoteTiers.delete(id);
        this.remoteRodTiers.delete(id);
        craft.lights?.dispose();
        craft.label.remove();
        craft.line?.dispose();
        craft.rod.dispose();
        craft.mesh.dispose();
        this.fleet.delete(id);
      }

    const state = this.self?.physics.state();
    if (this.self && state) {
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
      this.gear ??= this.newGear();
      this.gear.update({ ...this.gearInput, tip, time: this.clock });
    } else if (tip && this.gear?.recoiling)
      this.gear.updateRecoil(tip, this.clock);
    else if (tip && this.gear?.holding) this.gear.updateHeld(tip, this.clock);
    else this.gear?.hide();
    this.seaProps.update(this.clock);
    this.cats?.update(
      this.sharedClock(),
      this.clock,
      this.camera.position,
      (x, z) => waveHeight(x, z, this.clock) + this.sim.sample(x, z).height,
    );
    this.schools.update(this.clock, this.camera.position, [
      ...(this.self ? [this.self.physics.state()] : []),
      ...this.fleet.values(),
    ]);
    this.wildlife.update(this.clock, this.camera.position);
    this.yards.update(this.camera.position.x, this.camera.position.z);
    if (probe("props") !== "0")
      this.propFade.update(
        this.camera.position,
        this.scene.frustumPlanes ?? [],
      );
    // Every boat, yours and the others', pushes on the water (ripple-sim.ts), which then spreads,
    // breaks and fades by itself.
    const hulls: Hull[] = [];
    const spots: BoatSpot[] = [];
    if (this.self && state) {
      const wet = this.wetOf(this.self.physics.contacts(), step);
      const tier = this.self.craft.tier;
      this.leaveTrail("self", state.x, state.z, tier, wet);
      hulls.push(this.hullOf("self", state.x, state.z, tier));
      spots.push({ x: state.x, z: state.z, heading: state.heading, wet, tier });
    }
    for (const [id, craft] of this.fleet) {
      this.leaveTrail(id, craft.x, craft.z, craft.tier);
      hulls.push(this.hullOf(id, craft.x, craft.z, craft.tier));
      spots.push({
        x: craft.x,
        z: craft.z,
        heading: craft.heading,
        tier: craft.tier,
      });
    }
    // The NPC cats' boats push on the water too, as the other players' boats do.
    const catsNear = this.cats?.near() ?? [];
    for (const pose of catsNear) {
      hulls.push({
        x: pose.x,
        z: pose.z,
        heading: pose.heading,
        speed: pose.speed,
      });
      spots.push({ x: pose.x, z: pose.z, heading: pose.heading });
    }
    this.sim.recentre(this.camera.position.x, this.camera.position.z);
    this.sim.step(step, hulls);
    this.sim.pack(this.simPixels);
    this.water.setStirred(this.simPixels, this.sim.centreX, this.sim.centreZ);
    this.water.update(
      this.camera.position.x,
      this.camera.position.z,
      this.clock,
      spots,
    );
    this.rain.update(this.clock);
    for (const beacon of this.beacons) beacon.update(this.clock);
    this.sky.update(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
      this.clock,
    );
    this.clearWater?.update(this.clock, this.camera.position);
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
    // Looking into a turn: the view swings ahead of the bow toward the way it is turning.
    const yawRate =
      this.lastHeading === undefined || dt <= 0
        ? 0
        : wrap(state.heading - this.lastHeading) / dt;
    this.lastHeading = state.heading;
    this.lead = turnLead(this.lead, yawRate, dt);
    // Fishing: the camera comes closer and lower and looks toward where the line goes,
    // so the rod, the line and the water it enters fill the screen.
    const input = this.gearInput;
    // The same close view while a caught fish hangs from the rod, to show it off.
    const holding = !!this.gear?.holding;
    const fishing = (!!input && input.view.phase !== "idle") || holding;
    this.focus += ((fishing ? 1 : 0) - this.focus) * blend(dt, 2.2);
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    // High and far behind, looking well ahead, so the sea, the islands and the horizon stay in
    // view (chase-camera.ts); closer and lower while fishing.
    // A bigger boat is framed from a little farther (boat-tier.ts `cameraScale`).
    const fit = cameraScale(this.self?.craft.tier ?? 0);
    const back = (CHASE.back + (CHASE.fishingBack - CHASE.back) * f) * fit;
    const height =
      (CHASE.height + (CHASE.fishingHeight - CHASE.height) * f) * fit;
    const want = new Vector3(state.x - fx * back, height, state.z - fz * back);
    const ahead = this.viewHeading + this.lead * (1 - f);
    const look = new Vector3(
      state.x + Math.sin(ahead) * CHASE.lookAhead,
      2.2,
      state.z - Math.cos(ahead) * CHASE.lookAhead,
    );
    const aim =
      this.gear?.endPoint() ??
      (holding ? this.rodTip() : undefined) ??
      input?.view.landing ??
      input?.preview;
    if (aim && f > 0) {
      // Halfway to the spot the lure is (or will be) on.
      look.x += (aim.x - look.x) * 0.7 * f;
      look.z += (aim.z - look.z) * 0.7 * f;
      look.y = 2.2 - 1.2 * f;
    }
    this.camera.fov = 0.9 - 0.15 * f;
    // Looking around: the finger's yaw and pitch move the camera on a sphere around the
    // boat, and the view eases back while the boat moves (orbit-camera.ts).
    this.orbit.step(dt, Math.hypot(state.forwardSpeed, state.sideSpeed));
    // While fishing the camera also swings to the boat's left, so the line goes out across
    // the view and is seen from the side, not end-on as a thin streak.
    const yaw = this.orbit.yaw + 0.55 * f;
    if (this.orbit.away || f > 0.01) {
      const pivotY = 1.2;
      const rightX = Math.cos(this.viewHeading);
      const rightZ = Math.sin(this.viewHeading);
      const flat = Math.hypot(want.x - state.x, want.z - state.z);
      const rise = want.y - pivotY;
      const reach = Math.hypot(flat, rise);
      const elevation = Math.min(
        1.4,
        Math.max(0.08, Math.atan2(rise, flat) + this.orbit.pitch),
      );
      const away = Math.cos(elevation) * reach;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      want.set(
        state.x + (-fx * cos - rightX * sin) * away,
        pivotY + Math.sin(elevation) * reach,
        state.z + (-fz * cos - rightZ * sin) * away,
      );
      // From the side or the front the view looks at the boat, not far ahead of it.
      const toBoat = Math.min(
        1,
        Math.abs(this.orbit.yaw) + Math.abs(this.orbit.pitch) * 0.5,
      );
      look.x += (state.x - look.x) * toBoat;
      look.y += (1.6 - look.y) * toBoat;
      look.z += (state.z - look.z) * toBoat;
    }
    // Keep clear of islands and piers: come in toward the boat when one is in the way, quickly,
    // and go back out slowly once it is not.
    const wanted = Math.hypot(want.x - state.x, want.z - state.z);
    if (wanted > 0) {
      const fraction = clearFraction(state, want, this.obstacles);
      this.clear = this.viewReady
        ? easeClear(this.clear, fraction, dt)
        : fraction;
      const reach = reachFor(wanted, this.clear);
      const k = reach / wanted;
      want.x = state.x + (want.x - state.x) * k;
      want.z = state.z + (want.z - state.z) * k;
      want.y = heightFor(want.y, reach, wanted);
    }
    if (!this.viewReady) {
      this.camera.position.copyFrom(want);
      this.viewReady = true;
    } else {
      // Follows the finger closely while it is down, the boat a little slower.
      const follow = blend(dt, this.orbit.holding ? 14 : 4);
      this.camera.position.x += (want.x - this.camera.position.x) * follow;
      this.camera.position.y += (want.y - this.camera.position.y) * follow;
      this.camera.position.z += (want.z - this.camera.position.z) * follow;
    }
    // The camera follows with a little lag, so it can drift into an obstacle on a tight turn
    // round a shore: whatever it does, it ends up outside.
    const outside = pushOut(this.camera.position, this.obstacles);
    this.camera.position.x = outside.x;
    this.camera.position.z = outside.z;
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
      arrow = remote,
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
      // Only players who are online get an arrow at the edge; parked and patrol boats are named
      // when they are in view and near, and otherwise left alone (a hundred arrows would bury the screen).
      if (!arrow) {
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
      place(
        this.self.craft,
        s.x,
        s.y + 4.4 + labelLift(this.self.craft.tier),
        s.z,
        false,
      );
    }
    for (const craft of this.fleet.values())
      place(
        craft,
        craft.mesh.position.x,
        craft.mesh.position.y + 6.2 + labelLift(craft.tier),
        craft.mesh.position.z,
        true,
        !craft.offline && !craft.npc,
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
    // The see-through sea is given up first (it is the newest cost and the look can be done
    // without); the render scale is coarsened only after that.
    const clear = this.clearGovernor.sample(dt);
    if (clear !== undefined) this.setClearWater(clear);
    const next = this.governor.sample(dt, this.clearGovernor.enabled);
    if (next !== undefined) this.engine.setHardwareScalingLevel(next);
  }

  /** Turns the see-through sea on or off (the opaque sea is the fallback); the quality governor does it by itself, unless `pin` holds the state (tests). */
  setClearWater(on: boolean, pin = false) {
    if (pin) this.clearGovernor.lock(on);
    else {
      this.clearGovernor.unlock();
      this.clearGovernor.set(on);
    }
    this.clearWater?.setEnabled(this.clearGovernor.enabled);
  }

  /** Frame cost, for diagnostics and tests. */
  /** The biggest groups of triangles in the frame (by mesh name), for the performance panel: one pass over the active meshes. */
  trianglesByGroup(): [string, number][] {
    const pairs: [string, number][] = [];
    // `data` is the list's backing array: only the first `length` entries are this frame's meshes
    // (the rest are left over from earlier, bigger frames and made the panel count meshes twice).
    const active = this.scene.getActiveMeshes();
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (!mesh) continue;
      // The copy actually drawn (a prop far away is a coarser mesh, or none), not the whole model.
      const drawn = mesh.getLOD(this.camera);
      if (!drawn) continue;
      const source =
        (drawn as { sourceMesh?: AbstractMesh }).sourceMesh ?? drawn;
      pairs.push([mesh.name, source.getTotalIndices() / 3]);
    }
    return topGroups(pairs);
  }

  stats() {
    return {
      meshes: this.scene.getActiveMeshes().length,
      triangles: Math.round(this.scene.getActiveIndices() / 3),
      renderScale: 1 / this.governor.scaling,
      clearWater: this.clearWater?.enabled ?? false,
      clearWaterMeshes: this.clearWater?.drawn() ?? 0,
    };
  }

  dispose() {
    this.observer.disconnect();
    for (const craft of this.fleet.values()) craft.label.remove();
    this.gear?.dispose();
    this.clearWater?.dispose();
    this.seaProps.dispose();
    this.seabed.dispose();
    this.schools.dispose();
    this.wildlife.dispose();
    this.propFade.dispose();
    for (const market of this.markets) market.dispose();
    this.yards.dispose();
    for (const id of [...this.trails.keys()]) this.forgetTrail(id);
    this.self?.craft.label.remove();
    this.self?.physics.dispose();
    this.fleet.clear();
    this.scene.dispose();
    this.engine.dispose();
    this.canvas.remove();
  }
}
