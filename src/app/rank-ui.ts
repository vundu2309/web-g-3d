import { speciesById } from "../ocean/fishing";
import {
  boardValue,
  ownPlace,
  type Board,
  type BoardKind,
  type Leaderboard,
  type WeeklyLeaderboard,
} from "../ocean/leaderboard";
import { timeLeftText } from "../ocean/game-clock";
import { EconomyError, type EconomyApi } from "../platform/economy";
import { createHubShell, type HubNav } from "./hub-shell";

/**
 * The Xếp hạng hub: two boards read from the server (decision 0017), "Câu nhiều nhất" (fish caught
 * in all) and "Cá nặng nhất" (the heaviest single fish). It only shows the server's answer; the
 * ranking, the names and the limit of 20 rows are the database's. Names go in as text, never HTML.
 * The tab is there only with a server economy.
 */
export interface RankUiOptions {
  dialog: HTMLDialogElement;
  economy: EconomyApi | undefined;
  /** The tabs of the hub shell. */
  hubs: HubNav;
  /** Called before the hub opens: let go of the stick and the line. */
  beforeOpen: () => void;
  /** The shared server clock (ms): the weekly board says how long it has left. */
  worldMs?: () => number;
}
export interface RankUi {
  show(): void;
}

const BOARDS: readonly { kind: BoardKind; label: string; empty: string }[] = [
  {
    kind: "caught",
    label: "Câu nhiều nhất",
    empty: "Chưa ai câu được cá. Con cá đầu tiên là của bạn!",
  },
  {
    kind: "heaviest",
    label: "Cá nặng nhất",
    empty: "Chưa có kỷ lục nào. Hãy câu một con cá lớn!",
  },
];

const FAILURES: Partial<Record<string, string>> = {
  closed: "Bảng xếp hạng chưa mở. Hãy quay lại sau nhé!",
  signin: "Hãy đăng nhập lại để xem bảng xếp hạng.",
};

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

function rowOf(
  kind: BoardKind,
  row: Board["top"][number],
  place: number,
): HTMLLIElement {
  const li = el("li", `rank-row${row.you ? " is-you" : ""}`);
  const badge = el("span", `rank-badge${row.rank <= 3 ? " is-podium" : ""}`);
  badge.textContent = String(row.rank);
  badge.dataset.rank = String(row.rank);
  badge.setAttribute("aria-label", `Hạng ${row.rank}`);
  const info = el("span", "rank-info");
  const name = el("strong", undefined, row.name);
  info.append(name);
  const species = row.species ? speciesById(row.species) : undefined;
  if (kind === "heaviest" && species)
    info.append(el("small", undefined, species.name));
  li.append(badge, info);
  if (row.you) li.append(el("span", "crew-you", "Bạn"));
  li.append(el("span", "rank-value", boardValue(kind, row.value)));
  li.dataset.place = String(place);
  return li;
}

export function createRankUi(options: RankUiOptions): RankUi {
  const { dialog, economy, hubs } = options;
  let kind: BoardKind = "caught";
  /** All time, or this Vietnamese week (decision 0021). */
  let period: "all" | "week" = "all";
  /** Each opening draws its own page; a late answer for an older one is dropped. */
  let opening = 0;

  function show() {
    options.beforeOpen();
    const mine = ++opening;
    const page = createHubShell(dialog, hubs, "rank");
    dialog.setAttribute("aria-label", "Xếp hạng");
    const head = el("header", "fish-store-head");
    head.append(el("h2", undefined, "Xếp hạng"));
    const tabs = el("div", "rank-tabs");
    tabs.setAttribute("role", "tablist");
    const periods = el("div", "rank-tabs rank-periods");
    periods.setAttribute("role", "tablist");
    periods.setAttribute("aria-label", "Khoảng thời gian");
    const body = el("div", "fish-store-body rank-body");
    const foot = el("footer", "rank-foot");
    let data: Leaderboard | undefined;
    let week: WeeklyLeaderboard | undefined;
    /** Why this week's board could not be shown (a server without it, or a failed call). */
    let weekProblem: string | undefined;

    const stale = () => dialog.dataset.hub !== "rank" || mine !== opening;

    function draw() {
      for (const button of tabs.querySelectorAll("button"))
        button.setAttribute(
          "aria-selected",
          String(button.dataset.kind === kind),
        );
      for (const button of periods.querySelectorAll("button"))
        button.setAttribute(
          "aria-selected",
          String(button.dataset.period === period),
        );
      body.replaceChildren();
      foot.replaceChildren();
      foot.hidden = true;
      const source = period === "week" ? week : data;
      if (!source) {
        body.append(
          el(
            "p",
            period === "week" && weekProblem
              ? "fish-empty market-error"
              : "fish-empty",
            period === "week" && weekProblem
              ? weekProblem
              : "Đang tải bảng xếp hạng…",
          ),
        );
        return;
      }
      const board = source[kind];
      if (!board.top.length) {
        body.append(
          el("p", "fish-empty", BOARDS.find((b) => b.kind === kind)!.empty),
        );
        return;
      }
      const list = el("ol", "rank-list");
      board.top.forEach((row, index) =>
        list.append(rowOf(kind, row, index + 1)),
      );
      if (period === "week" && week && options.worldMs)
        body.append(
          el(
            "p",
            "rank-week-note",
            `Bảng tuần này, ${timeLeftText(week.endsAt - options.worldMs())}. Chỉ để vui, không có thưởng.`,
          ),
        );
      body.append(list);
      // The player below the top 20 still sees where they stand.
      if (ownPlace(board) === "below" && board.me) {
        foot.hidden = false;
        foot.append(
          el("span", "rank-me-label", `Bạn đứng hạng ${board.me.rank}`),
          el("span", "rank-value", boardValue(kind, board.me.value)),
          el("span", "rank-of", `trong ${board.players} người`),
        );
      } else if (ownPlace(board) === "none") {
        foot.hidden = false;
        foot.append(
          el("span", "rank-me-label", "Bạn chưa có tên trên bảng này"),
        );
      }
    }

    for (const board of BOARDS) {
      const tab = el("button", "rank-tab", board.label);
      tab.type = "button";
      tab.dataset.kind = board.kind;
      tab.setAttribute("role", "tab");
      tab.addEventListener("click", () => {
        kind = board.kind;
        draw();
      });
      tabs.append(tab);
    }
    if (economy)
      for (const [id, label] of [
        ["all", "Mọi thời đại"],
        ["week", "Tuần này"],
      ] as const) {
        const tab = el("button", "rank-tab", label);
        tab.type = "button";
        tab.dataset.period = id;
        tab.setAttribute("role", "tab");
        tab.addEventListener("click", () => {
          period = id;
          draw();
        });
        periods.append(tab);
      }
    head.append(periods, tabs);
    page.append(head, body, foot);
    draw();
    if (!dialog.open) dialog.showModal();

    if (!economy) return;
    void economy
      .weeklyBoard()
      .then((board) => {
        if (stale()) return;
        week = board;
        weekProblem = undefined;
        draw();
      })
      .catch((error: unknown) => {
        if (stale()) return;
        const failure = error instanceof EconomyError ? error.failure : "";
        weekProblem =
          failure === "closed"
            ? "Bảng tuần chưa mở. Hãy quay lại sau nhé!"
            : "Chưa tải được bảng tuần.";
        draw();
      });
    void economy
      .leaderboard()
      .then((board) => {
        if (stale()) return;
        data = board;
        draw();
      })
      .catch((error: unknown) => {
        if (stale()) return;
        const failure = error instanceof EconomyError ? error.failure : "";
        data = undefined;
        body.replaceChildren(
          el(
            "p",
            "fish-empty market-error",
            FAILURES[failure] ?? "Chưa tải được bảng xếp hạng.",
          ),
        );
        if (failure !== "closed" && failure !== "signin") {
          const retry = el("button", "button rank-retry", "Thử lại");
          retry.type = "button";
          retry.addEventListener("click", show);
          body.append(retry);
        }
      });
  }

  return { show };
}
