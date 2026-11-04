/** Presentation-only scenarios. These are not authoritative game states. */
export type ActionId =
  | "roll"
  | "assets"
  | "trade"
  | "buy"
  | "auction"
  | "bid10"
  | "bid20"
  | "bid50"
  | "pass"
  | "build"
  | "sell"
  | "mortgage"
  | "unmortgage"
  | "back"
  | "send"
  | "cancel"
  | "accept"
  | "reject"
  | "pay"
  | "jailpay"
  | "jailcard"
  | "continue"
  | "end"
  | "home"
  | "bankrupt"
  | "reconnect";
export type Surface =
  | "none"
  | "deed"
  | "assets"
  | "build"
  | "offer"
  | "trade"
  | "mortgage"
  | "chance"
  | "jail"
  | "results";
export interface Scenario {
  id: number;
  name: string;
  active: number | null;
  responder?: number;
  title: string;
  detail?: string;
  actions: ActionId[];
  surface: Surface;
  observer?: boolean;
}
export const scenarios: Scenario[] = [
  {
    id: 1,
    name: "Đầu lượt của bạn",
    active: 0,
    title: "Lượt của bạn",
    actions: ["roll", "assets", "trade"],
    surface: "none",
  },
  {
    id: 2,
    name: "Đang tung / di chuyển",
    active: 0,
    title: "",
    actions: [],
    surface: "none",
  },
  {
    id: 3,
    name: "Bạn chọn mua đất",
    active: 0,
    title: "Chọn hành động",
    actions: ["buy", "auction"],
    surface: "deed",
  },
  {
    id: 4,
    name: "Quan sát người khác mua",
    active: 1,
    title: "Lan đang quyết định",
    detail: "Lan đang chọn mua Illinois Avenue hoặc đưa ra đấu giá · M240",
    actions: [],
    surface: "deed",
    observer: true,
  },
  {
    id: 5,
    name: "Bạn phản hồi đấu giá",
    active: 1,
    responder: 0,
    title: "Đấu giá",
    detail: "Chọn mức tăng",
    actions: ["bid10", "bid20", "bid50", "pass"],
    surface: "deed",
  },
  {
    id: 6,
    name: "Quan sát đấu giá",
    active: 1,
    title: "Đấu giá",
    detail: "Đang chờ phản hồi",
    actions: [],
    surface: "deed",
    observer: true,
  },
  {
    id: 7,
    name: "Tài sản trong lượt",
    active: 0,
    title: "Tài sản của bạn",
    actions: ["build", "mortgage", "back"],
    surface: "assets",
  },
  {
    id: 8,
    name: "Xây / bán công trình",
    active: 0,
    title: "Nhóm đỏ của bạn",
    detail: "Mỗi công trình M150 · Xây và bán đều trong nhóm",
    actions: ["build", "sell", "back"],
    surface: "build",
  },
  {
    id: 9,
    name: "Đề nghị trao đổi",
    active: 0,
    title: "Trao đổi với Lan",
    actions: ["send", "cancel"],
    surface: "offer",
  },
  {
    id: 10,
    name: "Phản hồi trao đổi",
    active: 1,
    responder: 0,
    title: "Lan đề nghị trao đổi",
    actions: ["accept", "reject"],
    surface: "trade",
  },
  {
    id: 11,
    name: "Quan sát trao đổi",
    active: 1,
    title: "Lan đang trao đổi với Nam",
    detail: "Đang chờ Nam phản hồi",
    actions: [],
    surface: "trade",
    observer: true,
  },
  {
    id: 12,
    name: "Thế chấp / giải chấp",
    active: 0,
    title: "Tài sản đang thế chấp",
    actions: ["unmortgage", "back"],
    surface: "mortgage",
  },
  {
    id: 13,
    name: "Thanh toán nghĩa vụ",
    active: 0,
    title: "Trả tiền thuê cho Lan",
    detail: "Khoản cần trả: M40",
    actions: ["pay", "assets"],
    surface: "deed",
  },
  {
    id: 14,
    name: "Thiếu tiền / xử lý nợ",
    active: 0,
    title: "Chưa đủ tiền thanh toán",
    detail: "Cần trả M200 · Đang có M100",
    actions: ["assets", "trade", "pay"],
    surface: "none",
  },
  {
    id: 15,
    name: "Đầu lượt trong tù",
    active: 0,
    title: "Bạn đang ở tù",
    actions: ["jailpay", "jailcard", "roll"],
    surface: "jail",
  },
  {
    id: 16,
    name: "Rút thẻ sự kiện",
    active: 0,
    title: "Minh rút thẻ Chance",
    actions: ["continue"],
    surface: "chance",
  },
  {
    id: 17,
    name: "Kết thúc lượt",
    active: 0,
    title: "Đã xử lý xong lượt",
    actions: ["end", "assets", "trade"],
    surface: "none",
  },
  {
    id: 18,
    name: "Kết quả ván",
    active: null,
    title: "Lan chiến thắng",
    detail: "Người chơi cuối cùng chưa phá sản",
    actions: ["home"],
    surface: "results",
  },
  {
    id: 19,
    name: "Chờ lượt / chỉ quan sát",
    active: 1,
    title: "Lượt của Lan",
    detail: "Đang chờ Lan hành động",
    actions: [],
    surface: "none",
    observer: true,
  },
  {
    id: 20,
    name: "Đổ đôi / tung tiếp",
    active: 0,
    title: "Bạn được tung tiếp",
    actions: ["roll", "assets", "trade"],
    surface: "none",
  },
  {
    id: 21,
    name: "Xác nhận phá sản",
    active: 0,
    title: "Không còn khả năng trả nợ",
    detail:
      "Các phương án thanh toán hợp lệ đã được xử lý trong tình huống mẫu này.",
    actions: ["bankrupt"],
    surface: "none",
  },
  {
    id: 22,
    name: "Đã phá sản / theo dõi",
    active: 1,
    title: "Bạn đang theo dõi ván",
    actions: [],
    surface: "none",
    observer: true,
  },
  {
    id: 23,
    name: "Mất kết nối",
    active: null,
    title: "Mất kết nối",
    detail:
      "Trạng thái cập nhật lần cuối · Tạm dừng thao tác trên thiết bị này",
    actions: ["reconnect"],
    surface: "none",
  },
  {
    id: 24,
    name: "Khôi phục / bắt kịp diễn biến",
    active: 2,
    title: "Đang đồng bộ ván",
    detail: "Lan đã mua Illinois Avenue · Nam đang có lượt",
    actions: [],
    surface: "none",
    observer: true,
  },
];
export const money = (value: number) => `M${value.toLocaleString("vi-VN")}`;
export function scenarioById(id: number): Scenario {
  return scenarios.find((s) => s.id === id) || scenarios[0]!;
}
/** A second guard at dispatch, not only hidden controls. Real authorization belongs to the server. */
export function allowed(s: Scenario, action: ActionId): boolean {
  if (!s.actions.includes(action)) return false;
  if (action === "home" || action === "reconnect") return true;
  return s.active === 0 || s.responder === 0;
}
export function bidTotal(highest: number, action: ActionId): number | null {
  const steps: Partial<Record<ActionId, number>> = {
    bid10: 10,
    bid20: 20,
    bid50: 50,
  };
  const increment = steps[action];
  return increment &&
    Number.isSafeInteger(highest) &&
    highest >= 0 &&
    Number.isSafeInteger(highest + increment)
    ? highest + increment
    : null;
}
