import { createMinimap, type MapBoat } from "./minimap";
import { distanceText, mapPlaces } from "../ocean/minimap-math";

/**
 * The big map: the whole sea on a full-screen page that a tap on the minimap opens. A modal dialog of
 * its own (not a page of the hub): the rest of the screen is inert while it is open, Escape or the close
 * button shuts it, and focus goes back to what opened it. The map is the minimap's own drawing at the
 * size the screen allows (`createMinimap` with number badges), square and as big as fits; beside it (under
 * it on a portrait phone) the named places, nearest first, each with the number of its badge and its
 * distance from the player's boat. It only draws while it is open.
 */
export interface BigMap {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Redraws with the boats (the loop calls it a few times a second; it does nothing while closed). */
  update(
    self: MapBoat | undefined,
    others: readonly MapBoat[],
    seconds: number,
    from: { x: number; z: number },
  ): void;
  dispose(): void;
}

/** The padding round the page (px, as in the CSS), the narrowest list (px) and the gap between map and list. */
const PAD = 12;
const LIST_MIN = 270;
const GAP = 14;

const KIND = {
  harbor: "Nơi xuất phát",
  market: "Chợ cá",
  yard: "Xưởng tàu",
} as const;

export function createBigMap(host: HTMLElement = document.body): BigMap {
  const dialog = document.createElement("dialog");
  dialog.className = "ocean-map";
  dialog.setAttribute("aria-label", "Bản đồ");
  dialog.innerHTML =
    '<div class="map-screen"><canvas class="map-canvas" role="img" aria-label="Bản đồ cả vùng biển, bắc ở trên: các đảo, bến cảng, chợ và xưởng tàu theo số trong danh sách, thuyền của bạn và các thuyền khác"></canvas><aside class="map-panel"><header class="map-head"><h2>Bản đồ</h2><button type="button" class="map-close" autofocus aria-label="Đóng bản đồ"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg><span>Đóng</span></button></header><ol class="map-places" aria-label="Địa điểm, gần nhất trước"></ol></aside></div>';
  host.append(dialog);
  const screen = dialog.querySelector<HTMLElement>(".map-screen")!;
  const canvas = dialog.querySelector<HTMLCanvasElement>(".map-canvas")!;
  const list = dialog.querySelector<HTMLOListElement>(".map-places")!;
  const closeButton = dialog.querySelector<HTMLButtonElement>(".map-close")!;
  const map = createMinimap(canvas, { badges: true });
  let opener: Element | null = null;
  let listedAt = -1e9;
  let drawn = "";
  /** The boats of the last update (even while closed), so the map is drawn the moment it opens. */
  let last:
    | {
        self: MapBoat | undefined;
        others: readonly MapBoat[];
        seconds: number;
        from: { x: number; z: number };
      }
    | undefined;
  function draw() {
    if (!last) {
      map.update(undefined, [], 0);
      return;
    }
    map.update(last.self, last.others, last.seconds);
    if (last.seconds - listedAt >= 0.5 || last.seconds < listedAt) {
      listedAt = last.seconds;
      relist(last.from);
    }
  }

  /** The map as big as the page allows, and square: beside the list on a wide screen, over it on a tall one. */
  function size() {
    const width = screen.clientWidth - 2 * PAD;
    const height = screen.clientHeight - 2 * PAD;
    const tall = screen.clientHeight > screen.clientWidth;
    const side = tall
      ? Math.min(width, height * 0.58)
      : Math.min(height, width - LIST_MIN - GAP);
    const px = `${Math.max(120, Math.floor(side))}px`;
    canvas.style.width = px;
    canvas.style.height = px;
  }
  const watch =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => {
          if (dialog.open) size();
        });
  watch?.observe(screen);

  function relist(from: { x: number; z: number }) {
    const places = mapPlaces(from);
    // Rebuilt only when the order or a distance changed.
    const key = places.map((p) => `${p.number}:${p.meters}`).join(",");
    if (key === drawn) return;
    drawn = key;
    list.replaceChildren(
      ...places.map((place) => {
        const li = document.createElement("li");
        li.className = "map-place";
        const no = document.createElement("span");
        no.className = "map-place-no";
        no.textContent = String(place.number);
        no.setAttribute("aria-hidden", "true");
        const info = document.createElement("span");
        info.className = "map-place-info";
        const name = document.createElement("strong");
        name.textContent = place.name;
        const kind = document.createElement("small");
        kind.textContent = KIND[place.kind];
        info.append(name, kind);
        const far = document.createElement("span");
        far.className = "map-place-far";
        far.textContent = distanceText(place.meters);
        li.append(no, info, far);
        return li;
      }),
    );
  }

  const onClose = () => {
    const back = opener;
    opener = null;
    if (back instanceof HTMLElement && back.isConnected) back.focus();
  };
  dialog.addEventListener("close", onClose);
  closeButton.addEventListener("click", () => dialog.close());
  // A tap on the dark margin round the page (the dialog itself) closes it too.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  return {
    get isOpen() {
      return dialog.open;
    },
    open() {
      if (dialog.open) return;
      opener = document.activeElement;
      drawn = "";
      dialog.showModal();
      size();
      listedAt = -1e9;
      draw();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    update(self, others, seconds, from) {
      last = { self, others, seconds, from };
      if (!dialog.open) return;
      size();
      draw();
    },
    dispose() {
      watch?.disconnect();
      dialog.close();
      dialog.remove();
    },
  };
}
