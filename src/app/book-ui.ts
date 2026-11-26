import {
  collectionProgress,
  collectionView,
  hotSpotText,
  seaText,
} from "../ocean/collection";
import { seaAt } from "../ocean/fishing-conditions";
import { SPECIES, type Inventory } from "../ocean/fishing";
import { hotSpotsAt } from "../ocean/hot-spots";
import { showFishThumb } from "./fish-thumb";
import { createHubShell, type HubNav } from "./hub-shell";

/**
 * The "Sổ" hub (decision 0020): the book of species (which the player has met, their best weight,
 * and where and when each is found) and a line about the sea right now with the hot spots.
 * Everything it says comes from the pure modules (collection.ts, fishing-conditions.ts,
 * hot-spots.ts), so the words and the odds cannot differ. Text goes in with textContent only.
 */
export interface BookUiOptions {
  dialog: HTMLDialogElement;
  /** The fish store: its record weights say which species have been met. */
  inventory: () => Inventory;
  hubs: HubNav;
  /** Called before the hub opens: let go of the stick and the line. */
  beforeOpen: () => void;
  /** The shared server clock (ms). */
  worldMs: () => number;
}
export interface BookUi {
  show(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The sea and the hot spots change slowly: the page refreshes its words this often while open. */
const REFRESH_MS = 20_000;

export function createBookUi(options: BookUiOptions): BookUi {
  const { dialog, hubs } = options;
  let timer: number | undefined;

  function show() {
    options.beforeOpen();
    if (timer !== undefined) window.clearInterval(timer);
    const page = createHubShell(dialog, hubs, "book");
    dialog.setAttribute("aria-label", "Sổ");
    const head = el("header", "fish-store-head");
    head.append(el("h2", undefined, "Sổ"));
    const progress = el("span", "book-progress");
    head.append(progress);
    const body = el("div", "fish-store-body book-body");
    page.append(head, body);

    function draw() {
      const now = options.worldMs();
      const entries = collectionView(options.inventory());
      const { found, total } = collectionProgress(entries);
      progress.textContent = `${found}/${total} loài`;
      progress.setAttribute(
        "aria-label",
        `Đã gặp ${found} trong ${total} loài`,
      );
      body.replaceChildren();

      const text = seaText(seaAt(now));
      const sea = el("section", "book-sea");
      sea.append(el("strong", undefined, `Biển bây giờ: ${text.title}`));
      sea.append(
        el("span", undefined, text.easy),
        el("span", undefined, text.pace),
      );
      const spots = el("section", "book-spots");
      spots.setAttribute("aria-label", "Điểm câu nóng");
      for (const spot of hotSpotsAt(now)) {
        const row = el("div", "book-spot");
        const picture = document.createElement("img");
        picture.alt = "";
        const species = SPECIES.find((s) => s.id === spot.species);
        if (species) showFishThumb(picture, species, 44);
        row.append(picture, el("span", undefined, hotSpotText(spot, now)));
        spots.append(row);
      }
      body.append(el("div", "book-top"));
      body.lastElementChild!.append(sea, spots);

      const grid = el("div", "fish-grid book-grid");
      for (const entry of entries) {
        const cell = el(
          "div",
          `fish-cell book-cell${entry.state === "unknown" ? " is-unknown" : ""}`,
        );
        const art = el("div", "fish-cell-art");
        const picture = document.createElement("img");
        picture.alt = "";
        const species = SPECIES.find((s) => s.id === entry.id)!;
        showFishThumb(picture, species, 96);
        art.append(picture);
        const name = el(
          "div",
          "fish-cell-name",
          entry.state === "found" ? entry.name : "???",
        );
        const stars = el(
          "div",
          `fish-cell-record rarity-${entry.rarity}`,
          `${"★".repeat(entry.rarity)}${entry.state === "found" ? ` ${entry.bestKg.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg` : ""}`,
        );
        cell.append(art, name, stars);
        if (entry.state === "unknown")
          cell.append(el("div", "book-where", entry.where));
        grid.append(cell);
      }
      body.append(grid);
    }

    draw();
    timer = window.setInterval(() => {
      if (dialog.dataset.hub !== "book" || !dialog.open) {
        window.clearInterval(timer);
        timer = undefined;
        return;
      }
      draw();
    }, REFRESH_MS);
    if (!dialog.open) dialog.showModal();
  }

  return { show };
}
