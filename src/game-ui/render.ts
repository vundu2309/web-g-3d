import { allowed, money, type ActionId, type Scenario } from "./model";
import type { CameraMode } from "../board/camera-math";
import { escape, glyph } from "./icons";
export interface Presentation {
  scenario: Scenario;
  highest: number;
  leader: string;
  balances: number[];
  houses: number[];
  offer: number[];
  selected: number;
  mortgage: boolean;
  notice: string;
  camera: CameraMode;
}
const propertyNames = ["Kentucky Avenue", "Indiana Avenue", "Illinois Avenue"];
const rents = [18, 36, 90, 250, 700, 875, 1050];
const illinois = [20, 40, 100, 300, 750, 925, 1100];
export function deed(property = 2, reverse = false): string {
  if (reverse)
    return `<article class="title-deed deed-reverse" aria-label="Mặt sau thẻ Short Line"><h2>SHORT LINE</h2><div><p>MORTGAGE VALUE</p><strong>M100</strong><p>TO UNMORTGAGE, PAY</p><strong>M110</strong></div><small>Card must be turned this side up<br>if property is mortgaged.</small></article>`;
  const name = propertyNames[property] || propertyNames[2];
  // Only the Illinois and Kentucky rows are used as documented presentation examples.
  const values = property === 2 ? illinois : rents;
  return `<article class="title-deed" aria-label="Thẻ đất ${name}"><small class="deed-caption">TITLE DEED</small><h2>${name}</h2><table aria-label="Tiền thuê ${name}"><tbody>${values.map((v, i) => `<tr><th scope="row">${i === 0 ? "Rent" : i === 1 ? "Rent with color set" : i === 6 ? 'Rent with <span class="printed-hotel" aria-label="hotel">▥</span>' : `Rent with <span class="printed-house" aria-label="${i - 1} house">${i - 1}</span>`}</th><td>${money(v)}</td></tr>`).join("")}</tbody></table><footer>Houses cost M150 each<br>Hotels cost M150 each<br><small>(plus 4 houses)</small></footer></article>`;
}
export function avatar(index: number): string {
  const hair = ["#49352e", "#6d362a", "#252b32", "#e8794d"][index];
  return `<svg aria-hidden="true" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="${["#f8d16f", "#ffd5c6", "#b7e2ca", "#ffc5aa"][index]}"/><path d="M8 64c0-19 48-19 48 0" fill="${["#3384d5", "#f48782", "#4ca77f", "#e9683c"][index]}"/><path d="M13 31c-3-30 42-30 39 0v16H13" fill="${hair}"/><ellipse cx="32" cy="31" rx="17" ry="20" fill="#ffd4ae"/><path d="M14 25c2-25 35-24 38 0-13-1-16-12-17-13-3 9-13 12-21 13" fill="${hair}"/><g fill="#303146"><circle cx="25" cy="30" r="2"/><circle cx="39" cy="30" r="2"/></g><path d="M26 41q6 6 12 0" fill="none" stroke="#a3493b" stroke-width="2" stroke-linecap="round"/>${index === 2 ? '<g fill="none" stroke="#303146" stroke-width="2"><rect x="18" y="25" width="12" height="10" rx="4"/><rect x="34" y="25" width="12" height="10" rx="4"/><path d="M30 29h4"/></g>' : ""}</svg>`;
}
const cameraIcons: Record<CameraMode, string> = {
  focus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  overview:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const cameraLabels: Record<CameraMode, string> = {
  focus: "Theo dõi lượt",
  overview: "Toàn cảnh bàn",
};
/** 3D board host. play.ts mounts the single WebGL canvas here after every HUD redraw. */
export function board(): string {
  return `<div class="board-host" data-board-host tabindex="0" role="group" aria-label="Bàn cờ 3D minh họa. Ở chế độ toàn cảnh: kéo để xoay, chụm hoặc tách hai ngón để phóng to, phím mũi tên để xoay và dấu cộng hoặc trừ để phóng."></div>`;
}
/** Camera-only controls: viewing affordances for everyone, not gameplay actions. */
export function cameraControls(p: Presentation): string {
  const modes: CameraMode[] = ["focus", "overview"];
  return `<div class="board-camera" role="group" aria-label="Chế độ xem bàn cờ">${modes
    .map(
      (mode) =>
        `<button type="button" data-board-camera="${mode}" aria-pressed="${p.camera === mode}" aria-label="${cameraLabels[mode]}" title="${cameraLabels[mode]}">${cameraIcons[mode]}</button>`,
    )
    .join("")}</div>`;
}
const labels: Record<ActionId, [string, string]> = {
  roll: ["Tung xúc xắc", "dice"],
  assets: ["Tài sản", "assets"],
  trade: ["Trao đổi", "trade"],
  buy: ["Mua · M240", "buy"],
  auction: ["Đấu giá", "auction"],
  bid10: ["+10", "auction"],
  bid20: ["+20", "auction"],
  bid50: ["+50", "auction"],
  pass: ["Không nâng", "close"],
  build: ["Xây 1 nhà", "house"],
  sell: ["Bán 1 nhà", "house"],
  mortgage: ["Thế chấp", "wallet"],
  unmortgage: ["Giải chấp · M110", "wallet"],
  back: ["Quay lại", "back"],
  send: ["Gửi đề nghị", "trade"],
  cancel: ["Hủy", "close"],
  accept: ["Chấp nhận", "check"],
  reject: ["Từ chối", "close"],
  pay: ["Thanh toán · M40", "wallet"],
  jailpay: ["Trả phí · M50", "wallet"],
  jailcard: ["Dùng thẻ ra tù", "wallet"],
  continue: ["Tiếp tục", "next"],
  end: ["Kết thúc lượt", "check"],
  home: ["Về phòng chờ", "back"],
  bankrupt: ["Xác nhận phá sản", "auction"],
  reconnect: ["Kết nối lại", "wifi"],
};
function actionButton(id: ActionId, p: Presentation, index: number): string {
  const s = p.scenario;
  let [label, icon] = labels[id];
  if (id === "roll" && s.id === 20) label = "Tung tiếp";
  if (id === "pay" && s.id === 14) label = "Thanh toán";
  if (id === "assets" && [13, 14].includes(s.id)) label = "Quản lý tài sản";
  if (id === "mortgage" && p.mortgage) {
    label = "Giải chấp";
    icon = "wallet";
  }
  const increment = Number(id.slice(3));
  const isBid = id.startsWith("bid");
  if (isBid) label = `+${increment} → ${money(p.highest + increment)}`;
  const disabled =
    (s.id === 14 && id === "pay") ||
    (isBid && p.highest + increment > p.balances[0]!) ||
    (id === "sell" && p.houses.every((v) => v === 0));
  const primary = isBid || index === 0;
  return `<button type="button" class="game-action ${primary ? "action-primary" : ""}" data-game-action="${id}" ${disabled ? 'disabled aria-describedby="action-explanation"' : ""}>${glyph(icon)}<span>${label}</span></button>`;
}
function assetList(p: Presentation, building = false): string {
  return `<section class="asset-collection" aria-label="${building ? "Công trình trong nhóm đỏ" : "Tài sản mẫu"}"><h2>${building ? "Nhóm đỏ của bạn" : "Chọn tài sản"}</h2><div class="asset-items">${propertyNames.map((name, i) => `<button class="asset-item ${p.selected === i ? "is-selected" : ""}" data-property="${i}" aria-pressed="${p.selected === i}"><i></i><span>${name}</span>${building ? `<small>${"⌂".repeat(p.houses[i]!) || "Chưa xây"}</small>` : ""}</button>`).join("")}</div><small>Tài sản minh họa</small></section>`;
}
function trade(p: Presentation): string {
  const editing = p.scenario.surface === "offer";
  const observer = p.scenario.id === 11;
  const parties = editing
    ? ["Bạn đưa", "Bạn nhận"]
    : observer
      ? ["Lan đưa", "Lan nhận"]
      : ["Lan đưa", "Bạn đưa"];
  return `<section class="trade-sheet" aria-label="Nội dung trao đổi"><h2>${escape(p.scenario.title)}</h2><div class="trade-columns">${parties.map((name, i) => `<div><h3>${name}</h3><button type="button" class="trade-property" ${editing ? `data-offer-property="${i}"` : "disabled"}><i class="property-swatch ${i ? "swatch-pink" : ""}"></i><span>${editing && p.selected === 1 && i === 0 ? "Kentucky Avenue" : i ? "Virginia Avenue" : "Illinois Avenue"}</span>${editing ? "<small>Chọn đổi</small>" : ""}</button><strong class="offer-money">${money(p.offer[i]!)}</strong>${editing ? `<div class="offer-steps" aria-label="Điều chỉnh tiền ${name}">${[-10, 10, 50, 100].map((step) => `<button type="button" data-offer-side="${i}" data-offer-step="${step}" aria-label="${step > 0 ? "Thêm" : "Bớt"} ${Math.abs(step)} ${name}">${step > 0 ? "+" : ""}${step}</button>`).join("")}</div>` : ""}</div>`).join("")}</div>${editing ? "<p>Chọn tài sản hoặc tăng/giảm tiền, không cần bàn phím.</p>" : ""}</section>`;
}
export function surface(p: Presentation): string {
  switch (p.scenario.surface) {
    case "deed":
      return deed();
    case "assets":
    case "build":
      return `<div class="assets-surface">${assetList(p, p.scenario.surface === "build")}${deed(p.selected)}</div>`;
    case "offer":
    case "trade":
      return trade(p);
    case "mortgage":
      return deed(2, true);
    case "chance":
      return `<article class="event-card"><header>CHANCE</header><div><strong>?</strong><p>Advance to GO.</p></div><small>Thẻ sự kiện minh họa</small></article>`;
    case "jail":
      return `<article class="jail-card"><small>Chance</small><h2>GET OUT OF<br>JAIL FREE</h2><div aria-hidden="true">${glyph("jail")}</div><p>This card may be kept until needed, or traded.</p></article>`;
    case "results":
      return `<section class="results-sheet"><div class="result-trophy">${glyph("trophy")}</div><h2>Lan chiến thắng</h2><p>Người chơi cuối cùng chưa phá sản</p><dl>${["Lan", "Minh (Bạn)", "Nam", "Linh"].map((n, i) => `<div><dt>${n}</dt><dd>${i ? "Đã phá sản" : "Người chơi còn lại"}</dd></div>`).join("")}</dl></section>`;
    default:
      return "";
  }
}
export function renderGame(p: Presentation): string {
  const s = p.scenario;
  const hasSurface = s.surface !== "none";
  const players = ["Minh", "Lan", "Nam", "Linh"];
  const title = s.id === 5 || s.id === 6 ? "ĐẤU GIÁ" : s.title;
  const explanation =
    s.id === 14
      ? "Chưa đủ tiền"
      : s.id === 5 && p.highest + 10 > p.balances[0]!
        ? "Không đủ tiền để nâng giá"
        : "";
  return `<main class="game-screen ${hasSurface ? "has-task" : ""} ${s.id === 23 ? "connection-lost" : ""} ${s.id === 2 ? "moving-state" : ""}" aria-label="HUD ván chơi — bản xem trước"><div class="game-safe"><div class="game-preview-label">Bản xem trước · Dữ liệu minh họa</div><button class="game-settings" data-game-settings type="button" aria-label="Tùy chọn bản xem trước">${glyph("settings")}</button><div class="game-scene">${board()}</div>${cameraControls(p)}${hasSurface ? `<div class="game-task">${surface(p)}</div>` : ""}<section class="game-actions" aria-label="${s.observer ? "Diễn biến chung" : "Thao tác hiện tại"}">${title ? `<h1>${escape(title)}</h1>` : ""}${[5, 6].includes(s.id) ? `<p>Giá cao nhất: <strong>${money(p.highest)}</strong><br>${escape(p.leader)} đang dẫn</p>` : ""}${s.detail ? `<p>${escape(s.detail)}</p>` : ""}${s.actions
    .filter((a) => allowed(s, a))
    .map((a, i) => actionButton(a, p, i))
    .join(
      "",
    )}${explanation ? `<p id="action-explanation" class="action-explanation">${explanation}</p>` : ""}</section><footer class="game-roster" aria-label="Người chơi">${players
    .map((name, i) => {
      const bankrupt = s.id === 18 ? i !== 1 : s.id === 22 && i === 0;
      const active = s.active === i && !bankrupt;
      const response = s.responder === i;
      return `<article class="game-player ${active ? "turn-active" : ""} ${bankrupt ? "player-bankrupt" : ""}" ${active ? 'aria-current="step"' : ""}><span class="player-avatar">${avatar(i)}</span><div>${active ? '<small class="turn-label">ĐẾN LƯỢT</small>' : response ? '<small class="response-label">CẦN PHẢN HỒI</small>' : ""}<strong>${name}${i === 0 ? " <span>(Bạn)</span>" : ""}</strong><span class="player-cash">${bankrupt ? "Đã phá sản" : money(s.id === 14 && i === 0 ? 100 : s.id === 21 && i === 0 ? 0 : s.id === 18 ? 2780 : p.balances[i]!)}</span></div></article>`;
    })
    .join(
      "",
    )}</footer><p class="game-feedback" role="status" aria-live="polite">${escape(p.notice)}</p></div></main>`;
}
