import { fishLength } from "../ocean/fight-look";
import { createHaptics } from "./haptics";
import { fishThumb } from "./fish-thumb";
import {
  Angler,
  CHARGE_MS,
  MAX_LINE,
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
  /** Test only: runs the tug of war faster (1 is real time). */
  fightSpeed?: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const kg = (value: number) =>
  `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg`;

export function createFishingUi(options: FishingUiOptions) {
  const { root, button, dialog } = options;
  const screen = root.querySelector<HTMLElement>(".ocean-screen") ?? root;
  // The button says what it does with an icon; the words are only its accessible name.
  const labels = {
    idle: "Thả câu",
    charging: "Thả ra!",
    out: "Thu cần",
    biting: "Giật!",
  };
  const svg = (inner: string) =>
    `<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const icons: Record<keyof typeof labels, string> = {
    // A hook on its line: cast.
    idle: svg(
      '<circle cx="12" cy="4" r="1.6"/><path d="M12 5.6V15a4.5 4.5 0 0 1-9 0"/><path d="m1.5 13 1.5 2.5L5 13"/>',
    ),
    // An arrow thrown out: let go.
    charging: svg('<path d="M6 18 18 6M9 6h9v9"/>'),
    // A reel turning: haul in.
    out: svg('<path d="M20 12a8 8 0 1 1-2.8-6.1"/><path d="M20 4v5h-5"/>'),
    // A jolt: pull now.
    biting: svg('<path d="m13 2-8 12h6l-1 8 8-12h-6Z" fill="currentColor"/>'),
  };
  let look: keyof typeof labels | undefined;
  function setLook(next: keyof typeof labels) {
    if (look === next) return;
    look = next;
    button.setAttribute("aria-label", labels[next]);
    button.innerHTML = icons[next];
  }

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
  // A landed fish hangs from the rod: how much it weighs, and two icon buttons.
  const hang = document.createElement("div");
  hang.className = "fish-hang";
  hang.hidden = true;
  hang.innerHTML =
    '<div class="fish-hang-info"><span class="fish-hang-stars"></span><strong class="fish-hang-kg"></strong><span class="fish-hang-record" hidden>✦</span></div>' +
    '<div class="fish-hang-actions">' +
    '<button type="button" class="fish-hang-drop" aria-label="Thả cá về biển"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M8.5 9 12 12.5 15.5 9"/><path d="M3 17c3-3 6 3 9 0s6 3 9 0"/></svg></button>' +
    '<button type="button" class="fish-hang-keep" aria-label="Lấy cá cất vào kho"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>' +
    "</div>";
  const hangStars = hang.querySelector<HTMLElement>(".fish-hang-stars")!;
  const hangKg = hang.querySelector<HTMLElement>(".fish-hang-kg")!;
  const hangRecord = hang.querySelector<HTMLElement>(".fish-hang-record")!;
  const hangDrop = hang.querySelector<HTMLButtonElement>(".fish-hang-drop")!;
  const hangKeep = hang.querySelector<HTMLButtonElement>(".fish-hang-keep")!;
  screen.append(power, badge, vignette, ring, hang);
  /** The landed fish still on the rod. */
  let held: Catch | undefined;

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* Not every browser or device can vibrate. */
    }
  };
  const haptics = createHaptics(vibrate);
  const place = (target: SVGElement | HTMLElement, rectOf: DOMRect) => {
    const base = screen.getBoundingClientRect();
    target.style.left = `${rectOf.left - base.left}px`;
    target.style.top = `${rectOf.top - base.top}px`;
    target.style.width = `${rectOf.width}px`;
    target.style.height = `${rectOf.height}px`;
  };

  const angler = new Angler(
    (event) => handle(event),
    Math.random,
    options.fightSpeed ?? 1,
  );

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
      case "hooked":
        // The fish is on: the hook window's ring is done, the tug of war begins.
        ring.style.display = "none";
        vibrate([40, 30, 40]);
        break;
      case "mood":
        // The surge itself is felt through haptics.tick (a steady buzz).
        break;
      case "lost":
        if (event.reason !== "cancel") options.scene()?.gearSnap();
        hideSignals();
        shake();
        haptics.stop();
        vibrate([90, 40, 90]);
        break;
      case "retrieved":
        break;
      case "caught":
        hideSignals();
        haptics.stop();
        vibrate(30);
        holdFish(event.fish);
        break;
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
    // A new throw keeps the fish still on the rod.
    if (held) {
      settle(true);
      return;
    }
    const now = performance.now();
    if (angler.busy) {
      // How far the fish is when it takes the hook: the boat to the bobber.
      const landing = angler.view(now).landing;
      const boat = options.boat();
      angler.pull(
        now,
        landing
          ? Math.hypot(boat.x - landing.x, boat.z - landing.z)
          : undefined,
      );
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
    const phase = angler.view(performance.now()).phase;
    // Letting go while a fish is on gives it line instead of throwing.
    if (phase === "fighting") {
      angler.letGo();
      return;
    }
    if (phase !== "charging") return;
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
    if (held) {
      settle(true);
      return;
    }
    if (angler.busy) {
      press();
      // No held press to end it (a keyboard or assistive click): a short pull.
      if (angler.view(performance.now()).phase === "fighting")
        window.setTimeout(release, 400);
      return;
    }
    if (!options.scene()?.rodTip()) return;
    // As if the button had been held just long enough for the sweet spot.
    const middle = (SWEET_POWER[0] + SWEET_POWER[1]) / 2;
    angler.startCharge(performance.now() - middle * CHARGE_MS);
    release();
  }

  function cancel() {
    // Never lose a landed fish: leaving or opening the store keeps it.
    settle(true);
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
    setLook("idle");
  }

  /** Called every frame while in the sea. */
  function tick(now: number) {
    const scene = options.scene();
    if (!scene) return;
    angler.update(now);
    if (!options.enabled() && angler.busy) cancel();
    const view = angler.view(now);
    // The fight in the hand: a steady buzz while the fish surges.
    haptics.tick(now, view.fight);
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
    // What the button looks like by what it does now.
    setLook(
      view.phase === "idle"
        ? "idle"
        : view.phase === "charging"
          ? "charging"
          : view.phase === "biting"
            ? "biting"
            : "out",
    );
    // State for styling and for tests: never shown as text.
    button.dataset.phase = view.phase;
    if (view.fight) {
      button.dataset.mood = view.fight.mood;
      button.dataset.tension = view.fight.tension.toFixed(2);
      button.dataset.distance = view.fight.distance.toFixed(1);
    } else {
      delete button.dataset.mood;
      delete button.dataset.tension;
      delete button.dataset.distance;
    }
    button.classList.toggle("is-fighting", view.phase === "fighting");
    // Power bar while charging.
    power.hidden = view.phase !== "charging";
    if (view.phase === "charging") {
      fill.style.width = `${view.power * 100}%`;
      const inSweet =
        view.power >= SWEET_POWER[0] && view.power <= SWEET_POWER[1];
      power.classList.toggle("is-sweet", inSweet);
    }
    // A blinking "!" above the bobber while a fish is nibbling: it is about to bite.
    const top = scene.entryTop();
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

  /** The fish hangs from the rod until the player keeps it or lets it go. */
  function holdFish(fish: Catch) {
    const species = speciesById(fish.species);
    if (!species) return;
    held = fish;
    const [low, high] = species.kg;
    const weight = high > low ? (fish.kg - low) / (high - low) : 0;
    hangStars.textContent = "★".repeat(species.rarity);
    hangStars.className = `fish-hang-stars rarity-${species.rarity}`;
    hangKg.textContent = kg(fish.kg);
    hangRecord.hidden = !addCatch(options.stock(), fish).record;
    hang.hidden = false;
    options.scene()?.holdFish({
      id: species.id,
      scale: fishLength(weight),
    });
  }

  /** Keeps the hanging fish in the store, or puts it back in the sea. */
  function settle(keep: boolean) {
    const fish = held;
    if (!fish) return;
    held = undefined;
    hang.hidden = true;
    const scene = options.scene();
    if (keep) {
      options.setStock(addCatch(options.stock(), fish).inventory, true);
      vibrate(20);
      scene?.leaveFish("keep");
    } else scene?.leaveFish("drop");
  }

  function openDialog() {
    dialog.addEventListener(
      "close",
      () => dialog.classList.remove("is-stock"),
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
    dialog.replaceChildren();
    dialog.removeAttribute("aria-labelledby");
    dialog.setAttribute("aria-label", "Kho cá");
    const stock = options.stock();
    const held = heldSpecies(stock);
    // Header: the title, how many are held, and the X that closes the store.
    const head = document.createElement("header");
    head.className = "fish-store-head";
    const title = document.createElement("h2");
    title.textContent = "Kho cá";
    const total = document.createElement("span");
    total.className = "fish-total";
    total.textContent = `Trong kho: ${stockTotal(stock)} con`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "fish-store-close";
    close.setAttribute("aria-label", "Đóng");
    close.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener("click", () => dialog.close());
    head.append(title, total, close);
    const body = document.createElement("div");
    body.className = "fish-store-body";
    if (!held.length) {
      const empty = document.createElement("p");
      empty.className = "fish-empty";
      empty.textContent = "Kho cá trống. Ra khơi và thả câu nhé!";
      body.append(empty);
    }
    const grid = document.createElement("div");
    grid.className = "fish-grid";
    for (const species of held) {
      const count = stock[species.id]?.n ?? 0;
      const cell = document.createElement("div");
      cell.className = "fish-cell";
      const art = document.createElement("div");
      art.className = "fish-cell-art";
      const picture = document.createElement("img");
      picture.src = fishThumb(species, 130);
      picture.alt = "";
      picture.draggable = false;
      art.append(picture);
      const name = document.createElement("span");
      name.className = "fish-cell-name";
      name.textContent = species.name;
      const record = document.createElement("span");
      record.className = `fish-cell-record rarity-${species.rarity}`;
      record.textContent = `${"★".repeat(species.rarity)} ${kg(stock[species.id]?.best ?? 0)}`;
      const badgeCount = document.createElement("span");
      badgeCount.className = "fish-count";
      badgeCount.textContent = `×${count}`;
      const free = document.createElement("button");
      free.type = "button";
      free.className = "fish-release";
      free.setAttribute("aria-label", `Thả một con ${species.name} về biển`);
      free.innerHTML =
        '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M8.5 9 12 12.5 15.5 9"/><path d="M3 17c3-3 6 3 9 0s6 3 9 0"/></svg>';
      free.addEventListener("click", () => {
        options.setStock(releaseOne(options.stock(), species.id), false);
        renderStock();
        dialog.querySelector<HTMLButtonElement>(".fish-release")?.focus();
      });
      cell.append(art, name, record, badgeCount, free);
      grid.append(cell);
    }
    if (held.length) body.append(grid);
    dialog.append(head, body);
  }

  return {
    /** The drawn buttons of the landed fish; the input layer takes the touches. */
    hangTargets() {
      return held
        ? [
            { element: hangKeep, tap: () => settle(true) },
            { element: hangDrop, tap: () => settle(false) },
          ]
        : [];
    },
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
      haptics.stop();
      power.remove();
      badge.remove();
      vignette.remove();
      ring.remove();
      hang.remove();
    },
  };
}
