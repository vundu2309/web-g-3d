import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PAL } from "./art/colors.ts";
import { useSolid } from "./art/materials.ts";
import { Parts, SIDES } from "./art/shapes.ts";
import type { Vendor } from "./market.ts";

/**
 * The person behind a fish stall, built like the fisherman on the boat (round and friendly,
 * from coloured primitives) but with their own apron, skin, hair and headwear so each market
 * has someone different. Two meshes in the market's local space (the pier faces -Z): the body,
 * which sways a little as they breathe, and the right arm, which waves now and then.
 */
const DECK = 0.8;
/**
 * Where the vendor stands: out in front of the counter at its right-hand end, on the open deck
 * facing the sea, so the player sees them from the boat (behind the counter the ice boxes and
 * hanging fish hide all but the head).
 */
const SPOT = { x: 1.9, y: DECK, z: -0.75 } as const;
const SCALE = 1.1;

function body(parts: Parts, vendor: Vendor) {
  const skin = PAL.vendor.skin[vendor.skin]!;
  const apron = PAL.vendor.apron[vendor.apron]!;
  const hair = PAL.vendor.hair[vendor.hair]!;
  const F = PAL.fit;
  const feet = (x: number) =>
    parts.tube(
      { top: 0.16, bottom: 0.18, height: 0.14, sides: SIDES.round },
      F.boots,
      [x, 0.07, 0],
    );
  feet(-0.14);
  feet(0.14);
  parts.tube(
    { top: 0.3, bottom: 0.34, height: 0.7, sides: SIDES.round },
    PAL.crew.trousers,
    [0, 0.45, 0],
  );
  // A shirt in the apron's colour with a lighter bib in front.
  parts.tube(
    { top: 0.5, bottom: 0.58, height: 0.66, sides: SIDES.round },
    apron,
    [0, 1.12, 0],
  );
  parts.box([0.44, 0.5, 0.06], PAL.paint.cream, [0, 1.06, -0.27]);
  parts.sphere(0.42, skin, [0, 1.7, 0], undefined, undefined, SIDES.round);
  for (const dx of [-0.085, 0.085])
    parts.sphere(0.05, F.boots, [dx, 1.73, -0.18]);
  parts.sphere(0.07, skin, [0, 1.68, -0.21]);
  // A smile: a small dark arc of three beads.
  for (const [dx, dy] of [
    [-0.06, 0],
    [0, -0.02],
    [0.06, 0],
  ] as const)
    parts.sphere(0.03, F.boots, [dx, 1.6 + dy, -0.19]);
  // Hair at the back and sides.
  parts.sphere(0.44, hair, [0, 1.74, 0.07], undefined, [1, 0.9, 0.9]);
  // The headwear.
  if (vendor.hat === "straw") {
    parts.tube(
      { top: 0, bottom: 1.0, height: 0.34, sides: SIDES.round },
      PAL.vendor.hat.straw,
      [0, 2.06, 0],
    );
  } else if (vendor.hat === "cap") {
    parts.tube(
      { top: 0.46, bottom: 0.5, height: 0.18, sides: SIDES.round },
      PAL.vendor.hat.cap,
      [0, 1.98, 0],
    );
    parts.box([0.44, 0.04, 0.3], PAL.vendor.hat.cap, [0, 1.9, -0.36]);
  } else {
    parts.sphere(
      0.5,
      PAL.vendor.hat.scarf,
      [0, 1.86, 0.04],
      undefined,
      [1, 0.7, 1],
    );
    parts.sphere(0.16, PAL.vendor.hat.scarf, [0.22, 1.82, -0.18]);
  }
  // The left arm rests on the counter.
  parts.tube(
    { top: 0.13, bottom: 0.15, height: 0.62 },
    apron,
    [-0.3, 1.18, -0.14],
    [Math.PI / 2.6, 0, 0.18],
  );
  parts.sphere(0.14, skin, [-0.34, 1.0, -0.4]);
}

/** The waving arm, built hanging from the shoulder (the origin) so it can turn about it. */
function arm(parts: Parts, vendor: Vendor) {
  const skin = PAL.vendor.skin[vendor.skin]!;
  const apron = PAL.vendor.apron[vendor.apron]!;
  parts.tube({ top: 0.13, bottom: 0.15, height: 0.6 }, apron, [0, -0.28, 0]);
  parts.sphere(0.15, skin, [0, -0.62, 0]);
}

export interface VendorFigure {
  meshes: Mesh[];
}

/**
 * Builds the vendor into `parent` (the market's mesh) and animates them: a slow breath, and
 * every few seconds a wave. The phase differs per market so they are not in step.
 */
export function createVendor(
  scene: Scene,
  parent: Mesh,
  id: string,
  vendor: Vendor,
  phase: number,
): VendorFigure {
  const person = useSolid(
    (() => {
      const parts = new Parts(scene);
      body(parts, vendor);
      return parts.merge(`vendor-${id}`);
    })(),
    "satin",
  );
  const wave = useSolid(
    (() => {
      const parts = new Parts(scene);
      arm(parts, vendor);
      return parts.merge(`vendor-arm-${id}`);
    })(),
    "satin",
  );
  for (const mesh of [person, wave]) {
    mesh.parent = parent;
    mesh.isPickable = false;
  }
  person.position.set(SPOT.x, SPOT.y, SPOT.z);
  // Turn the vendor to face the sea (-Z is already the front), slightly toward the middle.
  person.rotation.y = 0.12;
  person.scaling.setAll(SCALE);
  wave.scaling.setAll(SCALE);
  wave.position.set(
    SPOT.x + 0.3 * SCALE,
    SPOT.y + 1.2 * SCALE,
    SPOT.z - 0.1 * SCALE,
  );
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() / 1000 + phase;
    person.position.y = SPOT.y + Math.sin(t * 1.6) * 0.012;
    person.rotation.z = Math.sin(t * 0.9) * 0.012;
    // A wave lasts about two seconds out of every eight: the arm goes up and swings.
    const cycle = t % 8;
    const raised = cycle < 2.2 ? Math.sin((cycle / 2.2) * Math.PI) : 0;
    wave.rotation.x = Math.PI * 0.08 - raised * 2.4;
    wave.rotation.z = -0.25 - raised * (0.5 + Math.sin(t * 9) * 0.35);
    wave.position.y = person.position.y + 1.2 * SCALE;
  });
  return { meshes: [person, wave] };
}
