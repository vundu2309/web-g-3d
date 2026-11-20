/**
 * The shell every in-game hub shares: a rail of tabs on the left (Kho cá, Chợ, Thủy thủ,
 * Cài đặt, Đóng) and one page beside it. The four hubs (fish store, market, crew, settings) each
 * draw their own page into it, so changing hub is one tap on the rail, not close and open again.
 * It owns the dialog's hub classes: a hub only fills the page it is given.
 */
export type HubId = "stock" | "market" | "yard" | "rank" | "crew" | "settings";

export interface HubNav {
  /** Whether the tab shows: the market only near a pier, the shipyard only near a yard, the ranking anywhere (all with a server economy). */
  available(id: HubId): boolean;
  /** Opens another hub in the same dialog. */
  go(id: HubId): void;
}

const ICONS: Record<HubId | "close", string> = {
  stock:
    '<path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3Z"/><circle cx="8" cy="11" r=".6" fill="currentColor"/>',
  market:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4.5a1.8 1.8 0 0 1 0 3.5H9.5"/>',
  yard: '<path d="M3 15h18l-3 5H6Z"/><path d="M12 15V4l5 5.5H12"/><path d="M12 4v-1"/>',
  rank: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
  crew: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5.5a3 3 0 0 1 0 5.6M18 14.5c2 .8 3.4 2.6 3.4 5.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};

const TABS: readonly { id: HubId; label: string }[] = [
  { id: "stock", label: "Kho cá" },
  { id: "market", label: "Chợ" },
  { id: "yard", label: "Xưởng" },
  { id: "rank", label: "Xếp hạng" },
  { id: "crew", label: "Thủy thủ" },
  { id: "settings", label: "Cài đặt" },
];

const HUB_CLASSES = [
  "is-stock",
  "is-market",
  "is-yard",
  "is-rank",
  "is-crew-hub",
  "is-settings",
];
/** The classes of a hub; the shipyard's page is laid out like the market's, so it has the market's too. */
const classOf = (id: HubId) =>
  id === "crew"
    ? ["is-crew-hub"]
    : id === "yard"
      ? ["is-market", "is-yard"]
      : [`is-${id}`];

const icon = (id: HubId | "close") =>
  `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>`;

/**
 * Draws the rail and an empty page into the dialog and opens the hub styling. Returns the page:
 * the caller appends its header, body and foot to it. Safe to call again to change hub.
 */
export function createHubShell(
  dialog: HTMLDialogElement,
  nav: HubNav,
  active: HubId,
): HTMLElement {
  const already = dialog.dataset.hub !== undefined;
  dialog.classList.remove(...HUB_CLASSES);
  dialog.classList.add("is-stock", ...classOf(active));
  dialog.dataset.hub = active;
  if (!already)
    dialog.addEventListener(
      "close",
      () => {
        dialog.classList.remove(...HUB_CLASSES);
        delete dialog.dataset.hub;
      },
      { once: true },
    );
  dialog.removeAttribute("aria-labelledby");

  const shell = document.createElement("div");
  shell.className = "hub-shell";
  const rail = document.createElement("nav");
  rail.className = "hub-rail";
  rail.setAttribute("aria-label", "Chọn màn hình");
  for (const { id, label } of TABS) {
    if (id !== active && !nav.available(id)) continue;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "hub-tab";
    tab.dataset.hub = id;
    tab.innerHTML = `${icon(id)}<span>${label}</span>`;
    if (id === active) {
      tab.setAttribute("aria-current", "page");
      // The dialog puts focus here when it opens, not on whichever tab comes first.
      tab.autofocus = true;
    } else tab.addEventListener("click", () => nav.go(id));
    rail.append(tab);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "hub-tab is-close fish-store-close";
  close.setAttribute("aria-label", "Đóng");
  close.innerHTML = `${icon("close")}<span>Đóng</span>`;
  close.addEventListener("click", () => dialog.close());
  rail.append(close);

  const page = document.createElement("section");
  page.className = "hub-page";
  shell.append(rail, page);
  dialog.replaceChildren(shell);
  return page;
}
