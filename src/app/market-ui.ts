import { CATCH_COOLDOWN_SECONDS } from "../ocean/economy";
import { heldSpecies, releaseOne, type Inventory } from "../ocean/fishing";
import { marketAt } from "../ocean/market";
import { shipyardAt } from "../ocean/shipyard";
import {
  EconomyError,
  type EconomyApi,
  type EconomyFailure,
  type EconomyState,
  type LedgerFish,
  type SoldFish,
} from "../platform/economy";
import { showFishThumb } from "./fish-thumb";
import { showItemThumb } from "./item-thumb";
import { createHubShell, type HubId, type HubNav } from "./hub-shell";
import {
  upgradeView,
  type Bar,
  type RowView,
  type ShopKind,
  type TierView,
} from "../ocean/upgrade-view";
import type { Loadout } from "../ocean/upgrades";
import type { Cue } from "../ocean/audio-cues";

/**
 * The fish market on the screen: a Bán button that appears when the boat is near a pier, and
 * the market hub it opens (a full-screen list of the fish the player has caught, with what
 * each pays, a way to sell one kind or everything, and the wallet). The money and the prices
 * are the server's (platform/economy.ts); this only shows them and asks to sell. Without an
 * economy (no server economy configured) nothing appears at all.
 *
 * The same hub serves the shipyards (ocean/shipyard.ts): near a yard the button says Tàu and the
 * page is the one row of boats (the best boat owned is the one the player sails); rods and baits
 * are sold at the markets only.
 */
export interface MarketUiOptions {
  button: HTMLButtonElement;
  dialog: HTMLDialogElement;
  economy: EconomyApi | undefined;
  stock: () => Inventory;
  /** The fish store on this device changed (fish sold leave it). */
  setStock: (next: Inventory, caughtOne: boolean) => void;
  /** Called before the hub opens: let go of the stick and the line. */
  beforeOpen: () => void;
  /** The tabs of the hub shell: the way to the fish store, crew and settings pages. */
  hubs: HubNav;
  /**
   * The server refused a kept fish for good (the ledger is full, or the fish is not valid): the
   * store must not show it. Not called for a network failure (retried) or "too fast" (retried).
   */
  onRejected?: (fish: SoldFish, failure: EconomyFailure) => void;
  /** Plays a short sound (a cue); absent in tests. */
  sound?: (cue: Cue) => void;
  /** What the player owns, as the server last said (on opening the market and after a purchase). */
  onLoadout?: (loadout: Loadout) => void;
}

const coins = (value: number) => value.toLocaleString("vi-VN");
const kgText = (value: number) =>
  `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg`;

const FAILURES: Record<string, string> = {
  closed: "Chợ chưa mở cửa. Hãy quay lại sau nhé!",
  signin: "Bạn cần đăng nhập để dùng chợ.",
  network: "Chưa kết nối được chợ. Kiểm tra mạng rồi thử lại.",
  invalid: "Có con cá chưa được chợ ghi nhận. Thử lại sau nhé.",
  fast: "Bạn bán nhanh quá, đợi một chút nhé.",
  full: "Kho của chợ đã đầy, hãy bán bớt cá.",
  poor: "Chưa đủ xu. Bán thêm cá rồi quay lại nhé!",
  owned: "Bạn đã có món này rồi.",
  order: "Hãy mua cấp thấp hơn trước nhé.",
};
const failureText = (error: unknown) =>
  FAILURES[error instanceof EconomyError ? error.failure : "network"]!;

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

const COIN =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="#ffd35a" stroke="currentColor" stroke-width="2.4"/><path d="M6.5 12c1.6-2.6 4.6-3 7-1.4l3-1.6v6l-3-1.6c-2.4 1.6-5.4 1.2-7-1.4Z" fill="currentColor"/></svg>';

const svg = (inner: string, size = 24, extra = "") =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"${extra}>${inner}</svg>`;
const CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 22);
const LOCK = svg(
  '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  20,
);
/** The rod, and a fish-shaped lure on its hook: the pictures of the two rows. */
const ICONS: Record<ShopKind, string> = {
  rod: svg(
    '<path d="M3.5 21 17 4.5"/><path d="M17 4.5c3.5.3 4.2 4 3.5 8"/><path d="M20.5 12.5v3.2a1.9 1.9 0 0 1-3.8 0"/><circle cx="7.2" cy="16.6" r="1.4" fill="currentColor"/>',
    32,
  ),
  bait: svg(
    '<path d="M3.5 17.5c2.5-6 5.5 3 8.5-3s5.5 1 7.5-5" stroke-width="3.6"/><circle cx="19.8" cy="8.6" r="2.3" fill="currentColor" stroke-width="1"/>',
    32,
  ),
  boat: svg(
    '<path d="M2.5 15h19l-3.2 5H5.7Z"/><path d="M12 15V4l6 6.5H12"/><path d="M7 9l-.1 6"/>',
    32,
  ),
};
const ROW_TITLE: Record<ShopKind, string> = {
  rod: "CẦN CÂU",
  bait: "MỒI",
  boat: "THUYỀN",
};
const KIND_NAME: Record<ShopKind, string> = {
  rod: "Cần câu",
  bait: "Mồi",
  boat: "Thuyền",
};
/** The corner mark of a card, by what the player can do with it. */
const MARKS: Record<TierView["state"], string> = {
  owned: CHECK,
  next: svg('<path d="M12 19V6M6 11.5 12 5.5l6 6"/>', 22),
  poor: svg('<path d="M12 19V6M6 11.5 12 5.5l6 6"/>', 22),
  locked: LOCK,
};
const FISH_GLYPH = svg(
  '<path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3Z"/>',
  18,
);
const LINE_GLYPH = svg('<path d="M2.5 14c3-7 6 7 9 0s6 7 9 0"/>', 18);
const BAR_LABEL: Record<Bar["id"], (bar: Bar) => string> = {
  line: (bar) => `Dây bền ${Math.round(bar.fill * 100)} phần trăm`,
  rare2: (bar) =>
    `Cá quý hai sao, gấp ${bar.value.toLocaleString("vi-VN")} lần`,
  rare3: (bar) => `Cá quý ba sao, gấp ${bar.value.toLocaleString("vi-VN")} lần`,
  slots: (bar) => `Kho chứa ${bar.value.toLocaleString("vi-VN")} con cá`,
};

/** A place the player can open: a market (sell fish, buy rods and baits) or a shipyard (buy boats). */
interface Spot {
  id: string;
  name: string;
  yard: boolean;
}
const hubOf = (spot: Spot): HubId => (spot.yard ? "yard" : "market");
const spotAt = (x: number, z: number): Spot | undefined => {
  const market = marketAt(x, z);
  if (market) return { id: market.id, name: market.name, yard: false };
  const yard = shipyardAt(x, z);
  return yard ? { id: yard.id, name: yard.name, yard: true } : undefined;
};
const YARD_FACE =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="#ffd35a" stroke="currentColor" stroke-width="2.4"/><path d="M5.5 13.5h13l-2.3 3.5H7.8Z" fill="currentColor"/><path d="M12 13.5V6.5l4 4.5H12" fill="currentColor"/></svg><strong>Tàu</strong>';

export function createMarketUi(options: MarketUiOptions) {
  const { button, dialog, economy } = options;
  /** The button's own face (a coin with a fish, "Bán"), which the yard's face replaces near a yard. */
  const marketFace = button.innerHTML;
  let near: Spot | undefined;
  let open: Spot | undefined;
  /** Catches that could not be told to the server (no network): retried when the hub opens. */
  const pending: SoldFish[] = [];
  /** Timers of catches waiting out the six second rule. */
  const retries = new Set<number>();
  let busy = false;
  let balance: number | undefined;

  button.hidden = true;

  async function flushPending() {
    while (pending.length && economy) {
      try {
        await economy.recordCatch(pending[0]!);
        pending.shift();
      } catch (error) {
        // Too soon after another catch: stop here, the rest waits for the next time.
        if (error instanceof EconomyError && error.failure === "invalid")
          pending.shift();
        else break;
      }
    }
  }

  /** The page being shown: selling fish, the rod and bait, or (at a yard) the boats. A market opens on selling, a yard on the boats. */
  let page: "sell" | "upgrade" | "boat" = "sell";
  /** What the server last said: the wallet, the ledger and what the player owns. */
  let current: EconomyState | undefined;
  /** The parts of the hub on screen now (replaced whenever the shell is redrawn). */
  let view:
    | {
        wallet: HTMLElement;
        body: HTMLElement;
        foot: HTMLElement;
        tabs: HTMLElement;
      }
    | undefined;
  /** Counts fresh openings of the market: an answer that comes back to an older one is dropped. */
  let session = 0;
  /** The card that was just bought: it pops once. */
  let fresh: { kind: ShopKind; tier: number } | undefined;

  function shell(spot: Spot) {
    const hub = createHubShell(dialog, options.hubs, hubOf(spot));
    dialog.setAttribute("aria-label", spot.name);
    const head = el("header", "fish-store-head");
    const title = el("h2", undefined, spot.name);
    const tabs = el("div", "market-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Chọn mục");
    tabs.hidden = true;
    for (const [id, label] of [
      ["sell", "Bán cá"],
      ["upgrade", "Cần & mồi"],
    ] as const) {
      const tab = el("button", "market-tab", label);
      tab.type = "button";
      tab.dataset.page = id;
      tab.addEventListener("click", () => show(id));
      tabs.append(tab);
    }
    const wallet = el("span", "market-wallet");
    wallet.setAttribute("aria-live", "polite");
    head.append(title, tabs, wallet);
    const body = el("div", "fish-store-body");
    const foot = el("footer", "market-foot");
    hub.append(head, body, foot);
    return { wallet, body, foot, tabs };
  }

  function showWallet(wallet: HTMLElement) {
    wallet.replaceChildren();
    const icon = el("span", "market-coin");
    icon.innerHTML = COIN;
    wallet.append(
      icon,
      el(
        "strong",
        undefined,
        balance === undefined ? "…" : `${coins(balance)} xu`,
      ),
    );
  }

  /** Tells the game what the player owns, so the next fish uses it. */
  function takeState(state: EconomyState) {
    current = state;
    balance = state.coins;
    options.onLoadout?.(state.loadout);
  }

  async function sell(rows: readonly LedgerFish[] | null) {
    if (busy || !economy) return;
    busy = true;
    try {
      const result = await economy.sell(
        rows ? rows.map(({ species, kg }) => ({ species, kg })) : null,
      );
      // The fish that were sold leave the store on this device too.
      let stock = options.stock();
      const gone = rows ?? ledgerNow;
      for (const row of gone) stock = releaseOne(stock, row.species);
      options.setStock(stock, false);
      balance = result.coins;
      options.sound?.("coin");
      await render(`+${coins(result.earned)} xu`);
    } catch (error) {
      options.sound?.("error");
      await render(undefined, failureText(error));
    } finally {
      busy = false;
    }
  }

  let ledgerNow: LedgerFish[] = [];

  /** Draws the hub for the current market; fetches the ledger from the server. */
  async function render(flash?: string, problem?: string) {
    if (!open || !economy || dialog.dataset.hub !== hubOf(open)) return;
    const hub = hubOf(open);
    const mine = shell(open);
    view = mine;
    showWallet(mine.wallet);
    mine.body.append(
      el("p", "fish-empty", open.yard ? "Đang mở xưởng tàu…" : "Đang mở chợ…"),
    );
    let state: EconomyState;
    try {
      state = await economy.state();
    } catch (error) {
      if (dialog.dataset.hub !== hub || view !== mine) return;
      mine.body.replaceChildren();
      mine.body.append(el("p", "fish-empty market-error", failureText(error)));
      const retry = el("button", "button primary", "Thử lại");
      retry.type = "button";
      retry.addEventListener("click", () => void render());
      mine.body.append(retry);
      return;
    }
    // The player went to another tab while the ledger loaded: leave that page alone.
    if (dialog.dataset.hub !== hub || view !== mine) return;
    takeState(state);
    ledgerNow = state.ledger;
    draw(flash, problem);
  }

  /** Switches between selling and the rod and bait without asking the server again. */
  function show(next: "sell" | "upgrade" | "boat") {
    if (next === page || !current || busy) return;
    page = next;
    draw();
    view?.tabs.querySelector<HTMLElement>(`[data-page="${next}"]`)?.focus();
  }

  /** Draws the page chosen from what the server last said. */
  function draw(flash?: string, problem?: string) {
    if (!view || !current || !open || dialog.dataset.hub !== hubOf(open))
      return;
    const { wallet, body, foot, tabs } = view;
    showWallet(wallet);
    // A yard has the one page; the tabs are for choosing between the market's two.
    tabs.hidden = open.yard;
    for (const tab of tabs.querySelectorAll<HTMLElement>(".market-tab"))
      tab.setAttribute("aria-pressed", String(tab.dataset.page === page));
    body.replaceChildren();
    foot.replaceChildren();
    if (problem) {
      const note = el("p", "market-error", problem);
      note.setAttribute("role", "alert");
      body.append(note);
    }
    if (flash) {
      const note = el("p", "market-flash", flash);
      note.setAttribute("role", "status");
      body.append(note);
    }
    if (page === "boat") drawBoats(body, current);
    else if (page === "upgrade") drawUpgrades(body, current);
    else drawSell(body, foot, current);
  }

  function drawSell(body: HTMLElement, foot: HTMLElement, state: EconomyState) {
    if (!state.ledger.length) {
      body.append(
        el(
          "p",
          "fish-empty",
          "Chưa có cá để bán. Ra khơi, câu vài con rồi quay lại nhé!",
        ),
      );
      return;
    }
    const groups = new Map<string, LedgerFish[]>();
    for (const row of state.ledger)
      groups.set(row.species, [...(groups.get(row.species) ?? []), row]);
    const grid = el("div", "fish-grid");
    for (const species of heldSpecies(
      Object.fromEntries(
        [...groups].map(([id, rows]) => [id, { n: rows.length, best: 0 }]),
      ),
    )) {
      const rows = groups.get(species.id) ?? [];
      const total = rows.reduce((sum, row) => sum + row.price, 0);
      const cell = el("div", "fish-cell");
      const art = el("div", "fish-cell-art");
      const picture = document.createElement("img");
      showFishThumb(picture, species, 130);
      picture.alt = "";
      picture.draggable = false;
      art.append(picture);
      const heaviest = Math.max(...rows.map((row) => row.kg));
      const sellOne = el("button", "market-sell");
      sellOne.type = "button";
      sellOne.setAttribute(
        "aria-label",
        `Bán ${rows.length} con ${species.name}, được ${coins(total)} xu`,
      );
      sellOne.innerHTML = `${COIN}<span>${coins(total)}</span>`;
      sellOne.addEventListener("click", () => void sell(rows));
      cell.append(
        art,
        el("span", "fish-cell-name", species.name),
        el(
          "span",
          `fish-cell-record rarity-${species.rarity}`,
          `${"★".repeat(species.rarity)} ${kgText(heaviest)}`,
        ),
        el("span", "fish-count", `×${rows.length}`),
        sellOne,
      );
      grid.append(cell);
    }
    body.append(grid);
    const all = state.ledger.reduce((sum, row) => sum + row.price, 0);
    const sellAll = el("button", "button primary market-sell-all");
    sellAll.type = "button";
    sellAll.textContent = `Bán tất cả (${state.ledger.length} con) · ${coins(all)} xu`;
    sellAll.addEventListener("click", () => void sell(null));
    foot.append(sellAll);
  }

  /** A purchase failed because what the page showed was out of date: ask the server again. */
  async function resync(at: number) {
    if (!economy) return;
    try {
      const state = await economy.state();
      options.onLoadout?.(state.loadout);
      if (session !== at) return;
      takeState(state);
      ledgerNow = state.ledger;
    } catch {
      /* The message of the failed call is already shown. */
    }
  }

  /** Keeps the keyboard on a card after a redraw: its button, or the card itself when it has none. */
  function focusCard(kind: ShopKind, tier: number) {
    const card = view?.body.querySelector<HTMLElement>(
      `[data-kind="${kind}"] [data-tier="${tier}"]`,
    );
    (card?.querySelector<HTMLElement>("button:not(:disabled)") ?? card)?.focus({
      preventScroll: true,
    });
  }

  /** Buys the next tier of a rod or a bait. A second tap while the call runs does nothing. */
  async function buy(kind: ShopKind, tier: number) {
    if (busy || !economy || !current) return;
    busy = true;
    const at = session;
    const before = current;
    lockUpgrades();
    let flash: string | undefined;
    let problem: string | undefined;
    try {
      const result = await economy.buy(kind, tier);
      // What the player owns is true whatever page is up now.
      options.onLoadout?.(result.loadout);
      if (session === at) {
        takeState({
          ...before,
          coins: result.coins,
          loadout: result.loadout,
        });
        fresh = { kind, tier };
        flash = "Đã mua!";
        options.sound?.("buy");
      }
    } catch (error) {
      problem = failureText(error);
      // Owned, skipped or too poor: the wallet or the tiers shown were stale.
      if (
        error instanceof EconomyError &&
        ["poor", "owned", "order"].includes(error.failure)
      )
        await resync(at);
    } finally {
      busy = false;
    }
    // The market was closed and opened again meanwhile: that new opening draws itself.
    if (session !== at) return;
    draw(flash, problem);
    // The page was redrawn: keep the keyboard on the card the player was using.
    focusCard(kind, tier);
  }

  /** Puts an owned bait in use. */
  async function useBait(tier: number) {
    if (busy || !economy || !current) return;
    busy = true;
    const at = session;
    const before = current;
    lockUpgrades();
    let problem: string | undefined;
    try {
      const loadout = await economy.setBait(tier);
      options.onLoadout?.(loadout);
      if (session === at) takeState({ ...before, loadout });
    } catch (error) {
      problem = failureText(error);
      if (error instanceof EconomyError && error.failure === "order")
        await resync(at);
    } finally {
      busy = false;
    }
    if (session !== at) return;
    draw(undefined, problem);
    focusCard("bait", tier);
  }

  /** While a call runs every button of the page is off, so nothing is asked twice. */
  function lockUpgrades() {
    for (const control of view?.body.querySelectorAll<HTMLButtonElement>(
      ".upgrade-card button",
    ) ?? [])
      control.disabled = true;
    view?.body.classList.add("is-busy");
  }

  function drawUpgrades(body: HTMLElement, state: EconomyState) {
    const model = upgradeView(state.loadout, state.coins);
    const rows = el("div", "upgrade-page");
    for (const row of [model.rod, model.bait]) rows.append(upgradeRow(row));
    body.append(rows);
  }

  function drawBoats(body: HTMLElement, state: EconomyState) {
    const model = upgradeView(state.loadout, state.coins);
    const rows = el("div", "upgrade-page");
    rows.append(upgradeRow(model.boat));
    body.append(rows);
  }

  function upgradeRow(row: RowView) {
    const section = el("section", "upgrade-row");
    section.dataset.kind = row.kind;
    const head = el("header", "upgrade-row-head");
    const glyph = el("span", "upgrade-row-icon");
    glyph.innerHTML = ICONS[row.kind];
    const title = el("h3", undefined, ROW_TITLE[row.kind]);
    head.append(glyph, title);
    const tiers = el("div", "upgrade-tiers");
    for (const tier of row.tiers) tiers.append(upgradeCard(row, tier));
    section.append(head, tiers);
    return section;
  }

  function upgradeCard(row: RowView, tier: TierView) {
    const kindName = KIND_NAME[row.kind];
    const name =
      tier.tier === 0 ? `${kindName} gốc` : `${kindName} cấp ${tier.tier}`;
    const card = el(
      "article",
      `upgrade-card is-${tier.state}${tier.inUse ? " is-using" : ""}`,
    );
    card.dataset.tier = String(tier.tier);
    // Focusable by script only: a card without a button (an owned rod) can still hold the keyboard.
    card.tabIndex = -1;
    if (fresh && fresh.kind === row.kind && fresh.tier === tier.tier) {
      card.classList.add("is-fresh");
      fresh = undefined;
    }
    const top = el("div", "upgrade-top");
    const icon = el("span", "upgrade-icon");
    icon.innerHTML = ICONS[row.kind];
    // The real thing, drawn from its own model; the glyph stays until (or unless) it is ready.
    showItemThumb(icon, row.kind, tier.tier);
    const mark = el("span", "upgrade-mark");
    mark.innerHTML = MARKS[tier.state];
    top.append(icon, tierPips(tier.tier), mark);
    const bars = el("div", "upgrade-bars");
    for (const bar of tier.bars) bars.append(barRow(bar));
    card.append(top, bars, upgradeAction(row, tier, name));
    const label = el("span", "sr-only", `${name}.`);
    card.prepend(label);
    return card;
  }

  /** Three pips; as many as the tier are filled (the free tier says Gốc). */
  function tierPips(tier: number) {
    const pips = el("span", "upgrade-pips");
    if (tier === 0) {
      pips.classList.add("is-base");
      pips.textContent = "Gốc";
      pips.setAttribute("aria-hidden", "true");
      return pips;
    }
    pips.setAttribute("aria-hidden", "true");
    for (let at = 1; at <= 3; at++)
      pips.append(el("i", at <= tier ? "is-on" : ""));
    return pips;
  }

  function barRow(bar: Bar) {
    const line = el("span", `upgrade-bar bar-${bar.id}`);
    line.setAttribute("role", "img");
    line.setAttribute("aria-label", BAR_LABEL[bar.id](bar));
    const tag = el("span", "upgrade-bar-tag");
    if (bar.id === "line") tag.innerHTML = LINE_GLYPH;
    else if (bar.id === "slots") tag.innerHTML = FISH_GLYPH;
    else tag.textContent = bar.id === "rare2" ? "★★" : "★★★";
    tag.setAttribute("aria-hidden", "true");
    const track = el("span", "upgrade-track");
    track.style.setProperty("--fill", String(bar.fill));
    track.style.setProperty("--base", String(bar.base));
    track.append(el("i", "upgrade-fill"), el("i", "upgrade-tick"));
    line.append(tag, track);
    // The number the bar stands for, where a bar alone does not say it (the store's slots).
    if (bar.id === "slots") {
      const count = el("b", "upgrade-bar-value", String(bar.value));
      count.setAttribute("aria-hidden", "true");
      line.append(count);
    }
    return line;
  }

  /** The one control of a card: buy, choose a bait, or a plain signal. */
  function upgradeAction(row: RowView, tier: TierView, name: string) {
    const price = `${COIN}<span>${coins(tier.price)}</span>`;
    if (tier.state === "owned") {
      if (row.kind === "bait") {
        const pick = el("button", "upgrade-use");
        pick.type = "button";
        pick.setAttribute("aria-pressed", String(tier.inUse));
        pick.setAttribute(
          "aria-label",
          tier.inUse ? `${name}, đang dùng` : `Dùng ${name}`,
        );
        pick.innerHTML = tier.inUse
          ? `${CHECK}<span>Đang dùng</span>`
          : "<span>Dùng</span>";
        if (tier.inUse) pick.setAttribute("aria-disabled", "true");
        else pick.addEventListener("click", () => void useBait(tier.tier));
        return pick;
      }
      const have = el("span", "upgrade-have");
      have.innerHTML = `${CHECK}<span>${tier.inUse ? "Đang dùng" : "Đã có"}</span>`;
      return have;
    }
    const button = el("button", "upgrade-buy");
    button.type = "button";
    button.innerHTML = price;
    button.setAttribute(
      "aria-label",
      `Mua ${name}, ${coins(tier.price)} xu${tier.state === "poor" ? `, còn thiếu ${coins(tier.missing)} xu` : ""}`,
    );
    if (tier.state === "next") {
      button.addEventListener("click", () => void buy(row.kind, tier.tier));
    } else if (tier.state === "poor") {
      // Still pressable: it says what is missing instead of doing nothing.
      button.setAttribute("aria-disabled", "true");
      button.style.setProperty("--have", String(tier.progress));
      button.addEventListener("click", () => {
        if (busy) return;
        draw(undefined, FAILURES.poor);
        focusCard(row.kind, tier.tier);
      });
    } else {
      button.disabled = true;
      button.innerHTML = `${LOCK}${price}`;
      button.setAttribute(
        "aria-label",
        `${name}, ${coins(tier.price)} xu, mua cấp trước đó trước`,
      );
    }
    return button;
  }

  return {
    /** Called every frame with the boat's position: shows the Bán button near a pier, the Tàu button near a yard. */
    update(x: number, z: number, canOpen: boolean) {
      // `near` stays while a hub is open (the rail's tab needs it); only the button hides.
      const here = economy && canOpen ? spotAt(x, z) : undefined;
      const hidden = !here || dialog.open;
      if (here?.id === near?.id && button.hidden === hidden) return;
      const changed = here?.yard !== near?.yard;
      near = here;
      button.hidden = hidden;
      if (here) {
        button.setAttribute(
          "aria-label",
          here.yard ? `Mua thuyền ở ${here.name}` : `Bán cá ở ${here.name}`,
        );
        if (changed) button.innerHTML = here.yard ? YARD_FACE : marketFace;
      }
    },
    /** The Bán button was pressed. */
    async openNearest() {
      if (!economy || !near) return;
      open = near;
      // Pressed again while the market is already up: keep the page the player is on.
      const already = dialog.open;
      options.beforeOpen();
      dialog.addEventListener("close", () => (open = undefined), {
        once: true,
      });
      if (!dialog.open) dialog.showModal();
      if (!already) {
        page = open.yard ? "boat" : "sell";
        current = undefined;
        session++;
      } else if (open.yard !== (page === "boat")) {
        // Arrived from another hub with the other kind of place's page left over.
        page = open.yard ? "boat" : "sell";
      }
      const mine = shell(open);
      view = mine;
      showWallet(mine.wallet);
      await flushPending();
      await render();
    },
    /** A fish was landed and kept: tell the server (retried later if the network fails). */
    recordCatch(fish: SoldFish, attempt = 0) {
      if (!economy) return;
      void economy.recordCatch(fish).catch((error) => {
        if (!(error instanceof EconomyError)) return;
        if (error.failure === "network") pending.push(fish);
        // Two catches in under six seconds: the second is told again once the wait is over.
        else if (error.failure === "fast" && attempt < 3)
          retries.add(
            window.setTimeout(
              () => this.recordCatch(fish, attempt + 1),
              (CATCH_COOLDOWN_SECONDS + 0.5) * 1000,
            ),
          );
        else if (error.failure !== "closed" && error.failure !== "signin")
          options.onRejected?.(fish, error.failure);
      });
    },
    dispose() {
      for (const id of retries) window.clearTimeout(id);
      retries.clear();
    },
    get enabled() {
      return !!economy;
    },
    /** A pier is in reach: the rail may offer the market tab. */
    get nearMarket() {
      return !!economy && !!near && !near.yard;
    },
    /** A shipyard is in reach: the rail may offer the yard tab. */
    get nearYard() {
      return !!economy && !!near && near.yard;
    },
  };
}
