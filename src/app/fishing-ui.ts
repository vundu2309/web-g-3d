import { fishSvg } from "../ocean/fish-art";
import {
  Angler,
  CHARGE_MS,
  MAX_LINE,
  RARITY_NAMES,
  SWEET_POWER,
  addCatch,
  castDirection,
  castTarget,
  heldSpecies,
  releaseOne,
  speciesById,
  stockTotal,
  type Catch,
  type FishingEvent,
  type Inventory,
} from "../ocean/fishing";
import type { Pose } from "../ocean/model";
import type { OceanScene } from "../ocean/babylon-scene";

/**
 * Fishing on screen. Everything the fish does is shown as motion, not text: the
 * bobber jerks and a blinking "!" appears above it when a fish is about to bite,
 * the line goes taut and the bobber disappears when it has, and a ring around the
 * button drains in the one second there is to pull. The rules live in
 * ocean/fishing.ts and the 3D bobber in ocean/fishing-gear.ts; this connects them to
 * the button, the keyboard and the dialogs.
 */
export interface FishingUiOptions {
  root: HTMLElement;
  button: HTMLButtonElement;
  dialog: HTMLDialogElement;
  scene: () => OceanScene | undefined;
  boat: () => Pose;
  /** False while a dialog is open or the boat is not in the sea. */
  enabled: () => boolean;
  stock: () => Inventory;
  /** The store changed (a catch, a release): save it and update the counters. */
  setStock: (next: Inventory, caughtOne: boolean) => void;
  reduced: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const kg = (value: number) =>
  `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg`;

export function createFishingUi(options: FishingUiOptions) {
  const { root, button, dialog } = options;
  const screen = root.querySelector<HTMLElement>(".ocean-screen") ?? root;
  const labels = {
    idle: "Thả câu",
    charging: "Thả ra!",
    out: "Thu cần",
    biting: "Giật!",
  };

  // Overlays, created once.
  const power = document.createElement("div");
  power.className = "fish-power";
  power.hidden = true;
  power.innerHTML =
    '<span class="fish-power-sweet"></span><span class="fish-power-fill"></span>';
  const sweet = power.querySelector<HTMLElement>(".fish-power-sweet")!;
  sweet.style.left = `${SWEET_POWER[0] * 100}%`;
  sweet.style.width = `${(SWEET_POWER[1] - SWEET_POWER[0]) * 100}%`;
  const fill = power.querySelector<HTMLElement>(".fish-power-fill")!;
  const badge = document.createElement("div");
  badge.className = "fish-badge";
  badge.hidden = true;
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = "!";
  const vignette = document.createElement("div");
  vignette.className = "fish-vignette";
  vignette.setAttribute("aria-hidden", "true");
  const ring = document.createElementNS(SVG_NS, "svg");
  ring.setAttribute("class", "fish-ring");
  ring.setAttribute("aria-hidden", "true");
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("pathLength", "1");
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke-linecap", "round");
  ring.append(rect);
  ring.style.display = "none";
  screen.append(power, badge, vignette, ring);

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* Not every browser or device can vibrate. */
    }
  };
  const place = (target: SVGElement | HTMLElement, rectOf: DOMRect) => {
    const base = screen.getBoundingClientRect();
    target.style.left = `${rectOf.left - base.left}px`;
    target.style.top = `${rectOf.top - base.top}px`;
    target.style.width = `${rectOf.width}px`;
    target.style.height = `${rectOf.height}px`;
  };

  const angler = new Angler((event) => handle(event));

  function handle(event: FishingEvent) {
    const scene = options.scene();
    switch (event.type) {
      case "fizzle":
        shake();
        vibrate(25);
        break;
      case "splash":
        scene?.gearRipple();
        break;
      case "nibble":
        scene?.gearRipple();
        vibrate(18);
        break;
      case "bite":
        scene?.gearRipple();
        place(ring, button.getBoundingClientRect());
        vibrate([70, 40, 70]);
        break;
      case "escaped":
        shake();
        vibrate(40);
        break;
      case "retrieved":
        break;
      case "caught": {
        hideSignals();
        const { inventory, record } = addCatch(options.stock(), event.fish);
        options.setStock(inventory, true);
        vibrate(30);
        showCatch(event.fish, record);
        break;
      }
    }
  }

  function shake() {
    button.classList.remove("is-shake");
    // Restart the animation.
    void button.offsetWidth;
    button.classList.add("is-shake");
  }

  /** The player presses the button (or Space). */
  function press() {
    if (!options.enabled()) return;
    const now = performance.now();
    if (angler.busy) {
      angler.pull(now);
      return;
    }
    if (options.scene()?.rodTip()) {
      angler.startCharge(now);
      const at = button.getBoundingClientRect();
      // The power bar sits just above the button, right-aligned with it.
      place(power, new DOMRect(at.right - 220, at.top - 38, 220, 24));
    }
  }

  /** The player lets go: a charged throw leaves the rod. */
  function release() {
    if (angler.view(performance.now()).phase !== "charging") return;
    const tip = options.scene()?.rodTip();
    if (!tip || !options.enabled()) {
      angler.cancel();
      return;
    }
    angler.release(
      performance.now(),
      { x: tip.x, z: tip.z },
      castDirection(options.boat().heading),
    );
  }

  /** Keyboard or assistive activation without a held press: a medium throw. */
  function click() {
    if (!options.enabled()) return;
    if (angler.busy) {
      press();
      return;
    }
    if (!options.scene()?.rodTip()) return;
    // As if the button had been held just long enough for the sweet spot.
    const middle = (SWEET_POWER[0] + SWEET_POWER[1]) / 2;
    angler.startCharge(performance.now() - middle * CHARGE_MS);
    release();
  }

  function cancel() {
    angler.cancel();
    hideSignals();
  }

  function hideSignals() {
    power.hidden = true;
    badge.hidden = true;
    ring.style.display = "none";
    vignette.style.opacity = "0";
    button.classList.remove("is-biting");
    button.style.removeProperty("--pulse");
    button.textContent = labels.idle;
  }

  /** Called every frame while in the sea. */
  function tick(now: number) {
    const scene = options.scene();
    if (!scene) return;
    angler.update(now);
    if (!options.enabled() && angler.busy) cancel();
    const view = angler.view(now);
    const boat = options.boat();
    // A boat that drifts too far from its bobber reels the line in.
    if (
      view.landing &&
      Math.hypot(boat.x - view.landing.x, boat.z - view.landing.z) > MAX_LINE
    )
      angler.cancel();
    const tip = scene.rodTip();
    let preview;
    if (view.phase === "charging" && tip)
      preview = castTarget(
        { x: tip.x, z: tip.z },
        castDirection(boat.heading),
        view.power,
      );
    scene.setGear(
      view.phase === "idle"
        ? undefined
        : { view, preview: preview ?? undefined },
    );
    // Button label by what the button does now.
    const label =
      view.phase === "idle"
        ? labels.idle
        : view.phase === "charging"
          ? labels.charging
          : view.phase === "biting"
            ? labels.biting
            : labels.out;
    if (button.textContent !== label) button.textContent = label;
    // Power bar while charging.
    power.hidden = view.phase !== "charging";
    if (view.phase === "charging") {
      fill.style.width = `${view.power * 100}%`;
      const inSweet =
        view.power >= SWEET_POWER[0] && view.power <= SWEET_POWER[1];
      power.classList.toggle("is-sweet", inSweet);
    }
    // A blinking "!" above the bobber while a fish is nibbling: it is about to bite.
    const top = scene.bobberTop();
    const nibbling = view.phase === "nibbling" && !!top;
    if (nibbling && top) {
      const at = scene.project(top.x, top.y, top.z);
      const blinkOn = options.reduced || Math.floor(now / 170) % 2 === 0;
      badge.hidden = !(at.visible && blinkOn);
      badge.style.left = `${at.x * 100}%`;
      badge.style.top = `${at.y * 100}%`;
    } else badge.hidden = true;
    // The one second: a ring drains around the button and the screen edge reddens.
    const biting = view.phase === "biting";
    button.classList.toggle("is-biting", biting);
    if (biting) {
      const left = 1 - view.hurry;
      ring.style.display = "block";
      const inset = 4;
      rect.setAttribute("x", String(inset));
      rect.setAttribute("y", String(inset));
      rect.setAttribute("rx", "30");
      const w = ring.clientWidth;
      const h = ring.clientHeight;
      rect.setAttribute("width", String(Math.max(0, w - inset * 2)));
      rect.setAttribute("height", String(Math.max(0, h - inset * 2)));
      rect.setAttribute("stroke-dasharray", `${left.toFixed(3)} 1.01`);
      rect.setAttribute(
        "stroke",
        left > 0.5 ? "#ffd35a" : left > 0.25 ? "#ff9d3d" : "#ff4b3a",
      );
      vignette.style.opacity = options.reduced
        ? "0.5"
        : String(
            Math.min(1, 0.25 + view.hurry * 0.9) *
              (0.65 + 0.35 * Math.sin(now / 55)),
          );
      button.style.setProperty(
        "--pulse",
        options.reduced ? "1" : String(1 + 0.045 * Math.sin(now / 40)),
      );
    } else {
      ring.style.display = "none";
      vignette.style.opacity = "0";
      button.style.removeProperty("--pulse");
    }
  }

  // ----- Dialogs -----

  function finish(title: string) {
    dialog.replaceChildren();
    const heading = document.createElement("h2");
    heading.id = "ocean-dialog-title";
    heading.textContent = title;
    dialog.setAttribute("aria-labelledby", heading.id);
    dialog.append(heading);
    return heading;
  }

  function showCatch(fish: Catch, record: boolean) {
    const species = speciesById(fish.species);
    if (!species) return;
    finish("Cá lên thuyền!");
    dialog.classList.add("is-catch");
    const card = document.createElement("div");
    card.className = "fish-card";
    const art = document.createElement("div");
    art.className = "fish-card-art";
    art.innerHTML = fishSvg(species, 190);
    const info = document.createElement("div");
    info.className = "fish-card-info";
    const rarity = document.createElement("span");
    rarity.className = `fish-tag rarity-${species.rarity}`;
    rarity.textContent = `${"★".repeat(species.rarity)} ${RARITY_NAMES[species.rarity]}`;
    const name = document.createElement("strong");
    name.className = "fish-card-name";
    name.textContent = species.name;
    const stats = document.createElement("div");
    stats.className = "fish-card-stats";
    for (const text of [kg(fish.kg), `${fish.cm} cm`]) {
      const tag = document.createElement("span");
      tag.className = "fish-tag";
      tag.textContent = text;
      stats.append(tag);
    }
    info.append(rarity, name, stats);
    if (record) {
      const badgeRecord = document.createElement("span");
      badgeRecord.className = "fish-tag is-record";
      badgeRecord.textContent = "Kỷ lục mới!";
      info.append(badgeRecord);
    }
    card.append(art, info);
    const close = document.createElement("button");
    close.className = "button primary";
    close.textContent = "Cất vào kho";
    close.addEventListener(
      "click",
      () => {
        dialog.close();
      },
      { once: true },
    );
    dialog.append(card, close);
    openDialog();
  }

  function openDialog() {
    dialog.addEventListener(
      "close",
      () => dialog.classList.remove("is-catch", "is-stock"),
      { once: true },
    );
    if (!dialog.open) dialog.showModal();
  }

  /** The fish store: only fish held now, with a way to put one back. */
  function showStock() {
    cancel();
    renderStock();
    dialog.classList.add("is-stock");
    openDialog();
  }

  function renderStock() {
    finish("Kho cá");
    const stock = options.stock();
    const held = heldSpecies(stock);
    const grid = document.createElement("div");
    grid.className = "fish-grid";
    if (!held.length) {
      const empty = document.createElement("p");
      empty.className = "fish-empty";
      empty.textContent = "Kho cá trống. Ra khơi và thả câu nhé!";
      dialog.append(empty);
    }
    for (const species of held) {
      const count = stock[species.id]?.n ?? 0;
      const cell = document.createElement("div");
      cell.className = "fish-cell";
      const art = document.createElement("div");
      art.className = "fish-cell-art";
      art.innerHTML = fishSvg(species, 96);
      const name = document.createElement("span");
      name.className = "fish-cell-name";
      name.textContent = species.name;
      const badgeCount = document.createElement("span");
      badgeCount.className = "fish-count";
      badgeCount.textContent = `×${count}`;
      const free = document.createElement("button");
      free.type = "button";
      free.className = "fish-release";
      free.textContent = "Thả";
      free.setAttribute("aria-label", `Thả một con ${species.name} về biển`);
      free.addEventListener("click", () => {
        options.setStock(releaseOne(options.stock(), species.id), false);
        renderStock();
        dialog.querySelector<HTMLButtonElement>(".fish-release")?.focus();
      });
      cell.append(art, name, badgeCount, free);
      grid.append(cell);
    }
    if (held.length) dialog.append(grid);
    const total = document.createElement("p");
    total.className = "fish-total";
    total.textContent = `Trong kho: ${stockTotal(stock)} con`;
    dialog.append(total);
    const close = document.createElement("button");
    close.className = "button primary";
    close.textContent = "Đóng";
    close.addEventListener("click", () => dialog.close(), { once: true });
    dialog.append(close);
  }

  return {
    press,
    release,
    click,
    cancel,
    tick,
    showStock,
    /** The line is out: the boat does not drive and others see it fishing. */
    get fishing() {
      return angler.fishing;
    },
    dispose() {
      angler.cancel();
      power.remove();
      badge.remove();
      vignette.remove();
      ring.remove();
    },
  };
}
