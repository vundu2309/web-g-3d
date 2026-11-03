import { Trace } from "../hub/diagnostics";
import type { Report, Stage } from "../hub/diagnostics";
const labels: Record<Stage, string> = {
  sdk: "Tải/khởi tạo SDK",
  session: "Khôi phục đăng nhập",
  token: "Sẵn sàng token",
  room_read: "Đọc phòng",
  profile_read: "Đọc player",
  prepare: "Chuẩn bị thay đổi",
  transaction: "Tổng giao dịch SDK",
  commit_wait: "Commit / chờ thử lại",
  first_snapshot: "Nhận phòng lần đầu",
  render: "Chờ khung hình",
};
export function diagnosticsView(): {
  begin(action: Report["action"], mode: Report["mode"]): Trace | undefined;
  dispose(): void;
} {
  if (new URLSearchParams(location.search).get("diagnostics") !== "1")
    return {
      begin: () => undefined,
      dispose() {},
    };
  const container = document.createElement("aside"),
    dialog = document.createElement("dialog");
  container.className = "diagnostics-launcher";
  container.innerHTML =
    '<button class="text-button" type="button">Chẩn đoán thời gian</button>';
  dialog.className = "diagnostics-dialog";
  dialog.setAttribute("aria-label", "Chẩn đoán thời gian");
  const reports: { value: Report }[] = [];
  let disposed = false;
  function render() {
    if (disposed) return;
    dialog.innerHTML = `<h2>Thời gian tạo / vào phòng</h2><p>Chỉ lưu trong bộ nhớ trên máy này, không gửi lên server. Các bước đọc có thể chạy song song, không cộng các dòng thành tổng.</p>${reports.map(({ value: report }, index) => `<section><h3>${index + 1}. ${report.action === "create" ? "Tạo phòng" : "Vào phòng"}: ${report.totalMs} ms ${report.finished ? (report.outcome === "error" ? "(lỗi)" : "") : "(đang đo)"} · ${report.mode === "online" ? "Online" : "Bản thử cùng máy"}</h3><p>Số callback giao dịch SDK: ${report.attempts}${report.code ? ` · Mã lỗi: ${report.code}` : ""}</p><table><thead><tr><th>Chặng</th><th>Thời gian</th><th>Lượt</th><th>Kết quả</th></tr></thead><tbody>${report.samples.map((sample) => `<tr><td>${labels[sample.stage]}</td><td>${sample.ms} ms</td><td>${sample.attempt || "—"}</td><td>${sample.code || sample.outcome}</td></tr>`).join("")}</tbody></table></section>`).join("") || "<p>Chưa có phép đo. Đóng bảng và thử tạo hoặc vào phòng.</p>"}<p>Commit gồm chờ SDK/xác thực mạng/backoff; không phải số đo riêng thời gian xử lý server. Token đo độ sẵn sàng của token, không đo nội bộ SDK. Khung hình là cơ hội trình duyệt vẽ, không đảm bảo GPU đã hoàn tất.</p><button class="text-button" data-copy type="button">Sao chép kết quả</button><button class="text-button" data-close type="button">Đóng</button><span role="status"></span>`;
  }
  const abort = new AbortController();
  container.querySelector("button")!.addEventListener(
    "click",
    () => {
      render();
      dialog.showModal();
    },
    { signal: abort.signal },
  );
  dialog.addEventListener(
    "click",
    (event) => {
      const button = (event.target as HTMLElement).closest("button");
      if (button?.hasAttribute("data-close")) dialog.close();
      if (button?.hasAttribute("data-copy"))
        void navigator.clipboard
          .writeText(
            JSON.stringify(
              reports.map((entry) => entry.value),
              null,
              2,
            ),
          )
          .then(
            () => {
              if (!disposed)
                dialog.querySelector('[role="status"]')!.textContent =
                  "Đã sao chép";
            },
            () => {
              if (!disposed)
                dialog.querySelector('[role="status"]')!.textContent =
                  "Không sao chép được; bạn có thể đọc các số trong bảng.";
            },
          );
    },
    { signal: abort.signal },
  );
  document.body.append(container, dialog);
  render();
  return {
    begin(action: Report["action"], mode: Report["mode"]) {
      let entry: { value: Report } | undefined;
      return new Trace(action, mode, (report) => {
        if (disposed) return;
        if (!entry) {
          entry = { value: report };
          reports.push(entry);
          if (reports.length > 5) reports.shift();
        } else entry.value = report;
        if (dialog.open) render();
      });
    },
    dispose() {
      disposed = true;
      abort.abort();
      dialog.remove();
      container.remove();
    },
  };
}
