import {
  collectionProgress,
  collectionView,
  hotSpotText,
  seaText,
} from "../ocean/collection";
import { seaAt } from "../ocean/fishing-conditions";
import { SPECIES, type Inventory } from "../ocean/fishing";
import { hotSpotsAt } from "../ocean/hot-spots";
import { GIANT_QUOTA, eventAt, eventText } from "../ocean/world-event";
import type { EventBoard } from "../ocean/event-board";
import { timeLeftText } from "../ocean/game-clock";
import {
  DAILY_CAP,
  questReady,
  questText,
  type Quest,
  type QuestsState,
} from "../ocean/quests";
import type { Cue } from "../ocean/audio-cues";
import { EconomyError, type EconomyApi } from "../platform/economy";
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
  /** Where the player's boat is (the event page says how far and which way the ring is). */
  from: () => { x: number; z: number };
  /** The server economy: without it the quests and the event board are not offered. */
  economy?: EconomyApi;
  /** A sound cue for claiming a quest. */
  sound?: (cue: Cue) => void;
  /** The hourly event on this device: giants still allowed in a slot, and the best one landed. */
  event: {
    left: (slot: number) => number;
    best: (slot: number) => { species: string; kg: number } | undefined;
  };
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
  /** The page the player was on (kept while the hub is closed and opened again). */
  let view: "book" | "quests" | "event" = "book";
  /** The last answers of the server (drawn at once on the next visit, then refreshed). */
  let questsData: QuestsState | undefined;
  let boardData: EventBoard | undefined;
  /** Why a page could not load or a claim failed (one per page, so one does not show on the other). */
  let questsProblem: string | undefined;
  let boardProblem: string | undefined;
  /** A claim is on its way: its button stays off, also when the page is drawn again. */
  let claiming = false;
  let claimNote: string | undefined;
  /** Each opening of the hub draws its own page; a late answer for an older one is dropped. */
  let opening = 0;

  function show() {
    options.beforeOpen();
    const mine = ++opening;
    claimNote = undefined;
    if (timer !== undefined) window.clearInterval(timer);
    const page = createHubShell(dialog, hubs, "book");
    dialog.setAttribute("aria-label", "Sổ");
    const head = el("header", "fish-store-head");
    head.append(el("h2", undefined, "Sổ"));
    const tabs = el("div", "rank-tabs");
    tabs.setAttribute("role", "tablist");
    const pages = [
      ["book", "Sổ cá"],
      ...(options.economy ? ([["quests", "Nhiệm vụ"]] as const) : []),
      ["event", "Sự kiện"],
    ] as const;
    if (!pages.some(([id]) => id === view)) view = "book";
    for (const [id, label] of pages) {
      const tab = el("button", "rank-tab", label);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.dataset.page = id;
      tab.addEventListener("click", () => {
        view = id;
        claimNote = undefined;
        draw();
        load();
      });
      tabs.append(tab);
    }
    const progress = el("span", "book-progress");
    head.append(tabs, progress);
    const body = el("div", "fish-store-body book-body");
    page.append(head, body);

    function drawEvent(now: number) {
      const ev = eventAt(now);
      const text = eventText(ev, now, options.from());
      const card = el("section", "book-event");
      card.append(el("span", `book-event-ring${ev.active ? " is-on" : ""}`));
      const words = el("div", "book-event-words");
      words.append(
        el("h3", undefined, text.title),
        el("p", undefined, text.where),
      );
      const left = options.event.left(ev.slot);
      words.append(
        el(
          "p",
          undefined,
          ev.active
            ? `Câu trong vòng sáng sẽ ra cá gần mức nặng nhất. Bạn còn ${left}/${GIANT_QUOTA} lượt cá khổng lồ.`
            : "Mỗi giờ có một sự kiện kéo dài 20 phút.",
        ),
      );
      const best = options.event.best(ev.slot);
      const species = best
        ? SPECIES.find((s) => s.id === best.species)
        : undefined;
      if (best && species)
        words.append(
          el(
            "p",
            "book-event-best",
            `Tốt nhất của bạn: ${species.name} ${best.kg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg.`,
          ),
        );
      card.append(words);
      body.append(card);
      if (options.economy) drawBoard(now);
    }

    function drawBoard(now: number) {
      const section = el("section", "event-board");
      section.append(el("h3", undefined, "Bảng xếp hạng sự kiện"));
      if (!boardData) {
        section.append(
          el(
            "p",
            boardProblem ? "fish-empty market-error" : "fish-empty",
            boardProblem ?? "Đang tải bảng xếp hạng…",
          ),
        );
        body.append(section);
        return;
      }
      const data = boardData;
      section.append(
        el(
          "p",
          "event-board-note",
          data.active
            ? `Đang diễn ra, ${timeLeftText(data.endsAt - now)}. Xếp theo giá trị con cá khổng lồ tốt nhất.`
            : "Kết quả của sự kiện vừa rồi. Xếp theo giá trị con cá khổng lồ tốt nhất.",
        ),
      );
      if (!data.top.length)
        section.append(
          el(
            "p",
            "fish-empty",
            "Chưa ai có điểm. Vào vòng sáng và câu thử nhé!",
          ),
        );
      else {
        const list = el("ol", "rank-list");
        for (const row of data.top) {
          const li = el("li", `rank-row${row.you ? " is-you" : ""}`);
          const badge = el(
            "span",
            `rank-badge${row.rank <= 3 ? " is-podium" : ""}`,
            String(row.rank),
          );
          badge.setAttribute("aria-label", `Hạng ${row.rank}`);
          const info = el("span", "rank-info");
          info.append(el("strong", undefined, row.name));
          const species = SPECIES.find((s) => s.id === row.species);
          info.append(
            el(
              "small",
              undefined,
              `${species?.name ?? ""} ${row.kg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg`.trim(),
            ),
          );
          li.append(badge, info);
          if (row.you) li.append(el("span", "crew-you", "Bạn"));
          li.append(
            el("span", "rank-value", `${row.score.toLocaleString("vi-VN")} xu`),
          );
          list.append(li);
        }
        section.append(list);
        if (data.me && !data.top.some((r) => r.you))
          section.append(
            el(
              "p",
              "event-board-note",
              `Bạn đứng hạng ${data.me.rank} với ${data.me.score.toLocaleString("vi-VN")} xu.`,
            ),
          );
      }
      body.append(section);
    }

    async function claim(quest: Quest, button: HTMLButtonElement) {
      if (!options.economy || claiming) return;
      claiming = true;
      button.disabled = true;
      claimNote = undefined;
      try {
        const result = await options.economy.claimQuest(quest.slot);
        options.sound?.("coin");
        claimNote =
          result.earned > 0
            ? `+${result.earned.toLocaleString("vi-VN")} xu`
            : `Hôm nay đã đủ ${DAILY_CAP} xu thưởng nhiệm vụ.`;
        questsProblem = undefined;
      } catch (error) {
        options.sound?.("error");
        questsProblem = failureText(error);
      }
      // Whatever happened, ask again: the card must show what the server says now.
      try {
        questsData = await options.economy.quests();
      } catch {
        /* the next refresh will try again */
      }
      claiming = false;
      if (mine === opening && view === "quests") draw();
    }

    function drawQuests(now: number) {
      if (!questsData) {
        body.append(
          el(
            "p",
            questsProblem ? "fish-empty market-error" : "fish-empty",
            questsProblem ?? "Đang tải nhiệm vụ…",
          ),
        );
        return;
      }
      const data = questsData;
      const list = el("div", "quest-list");
      for (const quest of data.quests) {
        const card = el(
          "article",
          `quest-card${quest.claimed ? " is-claimed" : questReady(quest) ? " is-ready" : ""}`,
        );
        const species = quest.species
          ? SPECIES.find((s) => s.id === quest.species)
          : undefined;
        const art = el("div", "quest-art");
        if (species) {
          const picture = document.createElement("img");
          picture.alt = "";
          showFishThumb(picture, species, 56);
          art.append(picture);
        } else
          art.append(
            el(
              "span",
              undefined,
              quest.minKg ? `${quest.minKg}+ kg` : "Mọi loài",
            ),
          );
        const words = el("div", "quest-words");
        words.append(el("strong", undefined, questText(quest)));
        const bar = el("div", "quest-bar");
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", String(quest.goal));
        bar.setAttribute("aria-valuenow", String(quest.progress));
        const fill = el("i");
        fill.style.width = `${Math.round((100 * quest.progress) / quest.goal)}%`;
        bar.append(fill);
        words.append(
          bar,
          el("small", undefined, `${quest.progress}/${quest.goal}`),
        );
        const reward = el("div", "quest-reward");
        reward.append(el("span", undefined, `+${quest.reward} xu`));
        if (quest.claimed) reward.append(el("em", undefined, "Đã nhận"));
        else if (questReady(quest)) {
          const take = el("button", "upgrade-buy quest-claim", "Nhận");
          take.type = "button";
          take.disabled = claiming;
          take.addEventListener("click", () => void claim(quest, take));
          reward.append(take);
        }
        card.append(art, words, reward);
        list.append(card);
      }
      body.append(list);
      const foot = el("p", "quest-foot");
      foot.textContent = `Nhiệm vụ mới ${timeLeftText(data.resetsAt - now).replace("còn", "sau")}. Hôm nay còn tối đa ${data.capLeft} xu thưởng.`;
      body.append(foot);
      if (claimNote)
        body.append(el("p", "market-flash quest-flash", claimNote));
      else if (questsProblem)
        body.append(el("p", "market-error quest-flash", questsProblem));
    }

    const failureText = (error: unknown) => {
      const failure = error instanceof EconomyError ? error.failure : "network";
      return failure === "closed"
        ? "Mục này chưa mở. Hãy quay lại sau nhé!"
        : failure === "signin"
          ? "Hãy đăng nhập lại để xem mục này."
          : failure === "quest"
            ? "Nhiệm vụ chưa xong hoặc đã nhận rồi."
            : "Chưa kết nối được. Kiểm tra mạng rồi thử lại.";
    };

    /** Asks the server for what the page in view needs, then draws it again. */
    function load() {
      const economy = options.economy;
      if (!economy || view === "book") return;
      const wanted = view;
      // A claim in flight refreshes the quests itself: an older answer must not overwrite it.
      if (wanted === "quests" && claiming) return;
      const answer: Promise<void> =
        wanted === "quests"
          ? economy.quests().then((data) => {
              if (!claiming) {
                questsData = data;
                questsProblem = undefined;
              }
            })
          : economy.eventBoard().then((data) => {
              boardData = data;
              boardProblem = undefined;
            });
      void answer
        .catch((error: unknown) => {
          if (wanted === "quests") questsProblem = failureText(error);
          else boardProblem = failureText(error);
        })
        .finally(() => {
          if (
            mine === opening &&
            dialog.dataset.hub === "book" &&
            view === wanted
          )
            draw();
        });
    }

    function draw() {
      const now = options.worldMs();
      for (const tab of tabs.querySelectorAll("button"))
        tab.setAttribute("aria-selected", String(tab.dataset.page === view));
      const entries = collectionView(options.inventory());
      const { found, total } = collectionProgress(entries);
      progress.textContent = `${found}/${total} loài`;
      progress.setAttribute(
        "aria-label",
        `Đã gặp ${found} trong ${total} loài`,
      );
      body.replaceChildren();
      progress.hidden = view !== "book";
      if (view === "event") {
        drawEvent(now);
        return;
      }
      if (view === "quests") {
        drawQuests(now);
        return;
      }

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
    load();
    timer = window.setInterval(() => {
      if (dialog.dataset.hub !== "book" || !dialog.open) {
        window.clearInterval(timer);
        timer = undefined;
        return;
      }
      draw();
      load();
    }, REFRESH_MS);
    if (!dialog.open) dialog.showModal();
  }

  return { show };
}
