import "../game-ui/style.css";
import {
  allowed,
  bidTotal,
  money,
  scenarioById,
  scenarios,
  type ActionId,
} from "../game-ui/model";
import { escape } from "../game-ui/icons";
import { renderGame, type Presentation } from "../game-ui/render";
import { BoardStage } from "../board/stage";
import { previewBoardState } from "../game-ui/board-preview";

/** UI review adapter only. No Firebase import, cloud writes, or production economy. */
export function startPlay(root: HTMLElement): () => void {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let origin = 1;
  let previousNetworkState = 1;
  const p: Presentation = {
    scenario: scenarioById(
      Number(new URLSearchParams(location.search).get("state") || 1),
    ),
    highest: 120,
    leader: "Nam",
    balances: [1500, 1500, 1500, 1500],
    houses: [0, 0, 0],
    offer: [50, 100],
    selected: 2,
    mortgage: false,
    notice: "",
    camera: "overview",
  };
  const board = new BoardStage();
  const dialog = document.createElement("dialog");
  dialog.className = "game-preview-dialog";
  dialog.setAttribute("aria-labelledby", "preview-settings-title");
  document.body.append(dialog);
  root.classList.add("game-root");
  function draw() {
    if (disposed) return;
    const previous = (document.activeElement as HTMLElement)?.dataset
      .gameAction;
    root.innerHTML = renderGame(p);
    board.setState(previewBoardState(p));
    board.mount(root.querySelector<HTMLElement>("[data-board-host]"));
    if (previous)
      root
        .querySelector<HTMLButtonElement>(`[data-game-action="${previous}"]`)
        ?.focus({ preventScroll: true });
  }
  function setScenario(id: number, reset = false) {
    if (timer) clearTimeout(timer);
    p.scenario = scenarioById(id);
    if (reset) {
      p.highest = 120;
      p.leader = "Nam";
      p.balances = [1500, 1500, 1500, 1500];
      p.houses = [0, 0, 0];
      p.offer = [50, 100];
      p.selected = 2;
      p.mortgage = false;
      p.notice = "";
      p.camera = "overview";
      board.setMode("overview");
      origin = 1;
    }
    const url = new URL(location.href);
    url.searchParams.set("view", "game");
    url.searchParams.set("state", String(p.scenario.id));
    history.replaceState(null, "", url);
    draw();
    const focus = root.querySelector<HTMLElement>(
      ".game-actions button:not(:disabled), .game-actions h1, .game-screen",
    );
    if (focus) {
      if (focus.tagName !== "BUTTON") focus.tabIndex = -1;
      focus.focus({ preventScroll: true });
    }
  }
  function feedback(text: string) {
    p.notice = `Bản mẫu: ${text}`;
    draw();
  }
  function showSettings() {
    dialog.innerHTML = `<h2 id="preview-settings-title">Xem trước HUD ván chơi</h2><p>24 trạng thái giao diện mẫu. Thao tác chỉ diễn ra trên máy này, chưa xử lý luật hoặc đồng bộ ván qua Firebase. Bàn 3D chỉ là minh họa cục bộ: Theo dõi bám theo quân đang có lượt; Toàn cảnh cho phép kéo, chụm hoặc dùng phím mũi tên và dấu +/− để xem.</p><div class="scenario-grid">${scenarios.map((s) => `<button type="button" data-scenario="${s.id}" aria-current="${p.scenario.id === s.id}">${String(s.id).padStart(2, "0")} · ${escape(s.name)}</button>`).join("")}</div><div class="preview-dialog-footer"><a href="./#lobby">Về phòng chờ / trang chính</a><button class="text-button" type="button" data-close-preview>Đóng</button></div>`;
    dialog.showModal();
  }
  function dispatch(action: ActionId) {
    if (!allowed(p.scenario, action)) return;
    const id = p.scenario.id;
    if (action === "home") {
      location.assign("./#lobby");
      return;
    }
    if (action === "reconnect") {
      setScenario(24);
      timer = setTimeout(
        () =>
          setScenario(previousNetworkState === 23 ? 1 : previousNetworkState),
        1000,
      );
      return;
    }
    if (action.startsWith("bid")) {
      const total = bidTotal(p.highest, action);
      if (total === null || total > p.balances[0]!) return;
      p.highest = total;
      p.leader = "Minh";
      p.notice = `Bản mẫu: Minh đã ra giá ${money(total)}. Chờ người khác phản hồi.`;
      setScenario(6);
      return;
    }
    switch (action) {
      case "roll":
        setScenario(2);
        timer = setTimeout(() => setScenario(3), 900);
        break;
      case "buy":
        p.balances[0] = p.balances[0]! - 240;
        p.notice = "Bản mẫu: Minh đã mua Illinois Avenue · M240.";
        setScenario(17);
        break;
      case "auction":
        setScenario(5);
        break;
      case "assets":
        origin = id;
        setScenario(7);
        break;
      case "trade":
        origin = id;
        setScenario(9);
        break;
      case "build":
        if (id === 7) {
          setScenario(8);
          break;
        }
        if (
          p.houses[p.selected] !== Math.min(...p.houses) ||
          p.houses[p.selected]! >= 4
        ) {
          feedback("Cần xây đều trong nhóm, tối đa 4 nhà ở bản mẫu này.");
          break;
        }
        p.houses[p.selected] = p.houses[p.selected]! + 1;
        feedback("Đã thêm 1 nhà trong giao diện minh họa.");
        break;
      case "sell":
        if (
          p.houses[p.selected] !== Math.max(...p.houses) ||
          !p.houses[p.selected]
        ) {
          feedback("Cần bán đều trong nhóm và chọn đất đang có nhà.");
          break;
        }
        p.houses[p.selected] = p.houses[p.selected]! - 1;
        feedback("Đã bớt 1 nhà trong giao diện minh họa.");
        break;
      case "mortgage":
        if (p.houses.some((v) => v > 0)) {
          feedback("Cần bán hết công trình trong nhóm trước khi thế chấp.");
          break;
        }
        p.notice =
          "Bản mẫu mặt sau thẻ Short Line; chưa có giao dịch ngân hàng.";
        setScenario(12);
        break;
      case "unmortgage":
        feedback(
          "Đã chọn giải chấp Short Line · M110. Giao dịch thật cần backend gameplay.",
        );
        break;
      case "back":
        setScenario(origin);
        break;
      case "cancel":
        setScenario(origin);
        break;
      case "send":
        feedback(
          `Đề nghị gửi Lan: bạn đưa ${money(p.offer[0]!)}, nhận ${money(p.offer[1]!)} cùng tài sản đang chọn. Chưa gửi cho tài khoản thật.`,
        );
        break;
      case "accept":
      case "reject":
        p.notice = `Bản mẫu: Minh ${action === "accept" ? "chấp nhận" : "từ chối"} đề nghị của Lan.`;
        setScenario(19);
        break;
      case "pass":
        p.notice = "Bản mẫu: Minh không nâng giá. Đang chờ phản hồi tiếp theo.";
        setScenario(6);
        break;
      case "pay":
        if (id !== 14) {
          p.balances[0] = p.balances[0]! - 40;
          p.balances[1] = p.balances[1]! + 40;
          p.notice = "Bản mẫu: Minh trả Lan M40.";
          setScenario(17);
        }
        break;
      case "jailpay":
      case "jailcard":
        p.notice = `Bản mẫu: ${action === "jailpay" ? "đã chọn trả phí" : "đã chọn dùng thẻ"} ra tù.`;
        setScenario(1);
        break;
      case "continue":
        p.notice =
          "Bản mẫu: Minh rút Advance to GO. Quân cờ 3D chỉ minh họa; luật và đồng bộ ván sẽ xử lý ở bước gameplay.";
        setScenario(17);
        break;
      case "end":
        setScenario(19);
        break;
      case "bankrupt":
        setScenario(22);
        break;
    }
  }
  root.addEventListener(
    "click",
    (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "button",
      );
      if (!target || target.hasAttribute("disabled")) return;
      if (target.hasAttribute("data-game-settings")) {
        showSettings();
        return;
      }
      const action = target.dataset.gameAction;
      if (action) {
        dispatch(action as ActionId);
        return;
      }
      const camera = target.dataset.boardCamera;
      if (camera === "focus" || camera === "overview") {
        p.camera = camera;
        board.setMode(camera);
        root
          .querySelectorAll<HTMLElement>("[data-board-camera]")
          .forEach((button) =>
            button.setAttribute(
              "aria-pressed",
              String(button.dataset.boardCamera === camera),
            ),
          );
        return;
      }
      if (p.scenario.active !== 0) return;
      if (target.dataset.property !== undefined) {
        p.selected = Number(target.dataset.property);
        draw();
      }
      if (
        target.dataset.offerProperty !== undefined &&
        p.scenario.surface === "offer"
      ) {
        p.selected = p.selected === 1 ? 2 : 1;
        draw();
      }
      if (
        target.dataset.offerStep !== undefined &&
        p.scenario.surface === "offer"
      ) {
        const side = Number(target.dataset.offerSide),
          value = p.offer[side]! + Number(target.dataset.offerStep);
        if (value >= 0 && value <= 1500) {
          p.offer[side] = value;
          draw();
        }
      }
    },
    { signal: abort.signal },
  );
  dialog.addEventListener(
    "click",
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      );
      if (button?.hasAttribute("data-close-preview")) {
        dialog.close();
        return;
      }
      if (button?.dataset.scenario) {
        dialog.close();
        setScenario(Number(button.dataset.scenario), true);
        root.querySelector<HTMLButtonElement>(".game-settings")?.focus();
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "offline",
    () => {
      previousNetworkState = p.scenario.id;
      p.notice = "";
      setScenario(23);
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "online",
    () => {
      if (p.scenario.id === 23) {
        setScenario(24);
        timer = setTimeout(() => setScenario(previousNetworkState), 1000);
      }
    },
    { signal: abort.signal },
  );
  draw();
  return () => {
    disposed = true;
    abort.abort();
    if (timer) clearTimeout(timer);
    board.dispose();
    dialog.remove();
    root.classList.remove("game-root");
    root.innerHTML = "";
  };
}
