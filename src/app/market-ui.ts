import { heldSpecies, releaseOne, type Inventory } from "../ocean/fishing";
import { marketAt, type Market } from "../ocean/market";
import {
  EconomyError,
  type EconomyApi,
  type EconomyState,
  type LedgerFish,
  type SoldFish,
} from "../platform/economy";
import { fishThumb } from "./fish-thumb";

/**
 * The fish market on the screen: a Bán button that appears when the boat is near a pier, and
 * the market hub it opens (a full-screen list of the fish the player has caught, with what
 * each pays, a way to sell one kind or everything, and the wallet). The money and the prices
 * are the server's (platform/economy.ts); this only shows them and asks to sell. Without an
 * economy (no server economy configured) nothing appears at all.
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
}

const coins = (value: number) => value.toLocaleString("vi-VN");
const kgText = (value: number) =>
  `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} kg`;

const FAILURES: Record<string, string> = {
  closed: "Chợ chưa mở cửa. Hãy quay lại sau nhé!",
  signin: "Bạn cần đăng nhập để bán cá.",
  network: "Chưa kết nối được chợ. Kiểm tra mạng rồi thử lại.",
  invalid: "Có con cá chưa được chợ ghi nhận. Thử lại sau nhé.",
  fast: "Bạn bán nhanh quá, đợi một chút nhé.",
  full: "Kho của chợ đã đầy, hãy bán bớt cá.",
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

export function createMarketUi(options: MarketUiOptions) {
  const { button, dialog, economy } = options;
  let near: Market | undefined;
  let open: Market | undefined;
  /** Catches that could not be told to the server (no network): retried when the hub opens. */
  const pending: SoldFish[] = [];
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

  function shell(market: Market) {
    dialog.replaceChildren();
    dialog.classList.add("is-stock", "is-market");
    dialog.removeAttribute("aria-labelledby");
    dialog.setAttribute("aria-label", market.name);
    const head = el("header", "fish-store-head");
    const title = el("h2", undefined, market.name);
    const wallet = el("span", "market-wallet");
    wallet.setAttribute("aria-live", "polite");
    const close = el("button", "fish-store-close");
    close.type = "button";
    close.setAttribute("aria-label", "Đóng");
    close.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener("click", () => dialog.close());
    head.append(title, wallet, close);
    const body = el("div", "fish-store-body");
    const foot = el("footer", "market-foot");
    dialog.append(head, body, foot);
    return { wallet, body, foot };
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
      await render(`+${coins(result.earned)} xu`);
    } catch (error) {
      await render(undefined, failureText(error));
    } finally {
      busy = false;
    }
  }

  let ledgerNow: LedgerFish[] = [];

  /** Draws the hub for the current market; fetches the ledger from the server. */
  async function render(flash?: string, problem?: string) {
    if (!open || !economy) return;
    const { wallet, body, foot } = shell(open);
    showWallet(wallet);
    body.append(el("p", "fish-empty", "Đang mở chợ…"));
    let state: EconomyState;
    try {
      state = await economy.state();
    } catch (error) {
      body.replaceChildren();
      body.append(el("p", "fish-empty market-error", failureText(error)));
      const retry = el("button", "button primary", "Thử lại");
      retry.type = "button";
      retry.addEventListener("click", () => void render());
      body.append(retry);
      return;
    }
    balance = state.coins;
    ledgerNow = state.ledger;
    showWallet(wallet);
    body.replaceChildren();
    if (problem) body.append(el("p", "market-error", problem));
    if (flash) {
      const note = el("p", "market-flash", flash);
      note.setAttribute("role", "status");
      body.append(note);
    }
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
      picture.src = fishThumb(species, 130);
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

  return {
    /** Called every frame with the boat's position: shows the Bán button near a pier. */
    update(x: number, z: number, canOpen: boolean) {
      const here =
        economy && canOpen && !dialog.open ? marketAt(x, z) : undefined;
      if (here?.id === near?.id && button.hidden === !here) return;
      near = here;
      button.hidden = !here;
      if (here) button.setAttribute("aria-label", `Bán cá ở ${here.name}`);
    },
    /** The Bán button was pressed. */
    async openNearest() {
      if (!economy || !near) return;
      open = near;
      options.beforeOpen();
      dialog.addEventListener(
        "close",
        () => {
          dialog.classList.remove("is-stock", "is-market");
          open = undefined;
        },
        { once: true },
      );
      if (!dialog.open) dialog.showModal();
      const { wallet } = shell(open);
      showWallet(wallet);
      await flushPending();
      await render();
    },
    /** A fish was landed and kept: tell the server (retried later if the network fails). */
    recordCatch(fish: SoldFish) {
      if (!economy) return;
      void economy.recordCatch(fish).catch((error) => {
        if (error instanceof EconomyError && error.failure === "network")
          pending.push(fish);
      });
    },
    get enabled() {
      return !!economy;
    },
  };
}
