# 0004 — Một diễn biến chung, hành động theo lượt

Trạng thái: Đã được người dùng chốt ngày 2026-11-04.

Game cần mọi người theo dõi chung diễn biến, tránh giao dịch ngoài lượt khiến người khác bỏ lỡ thông tin. [Tiêu chí phiên chơi](../game/shared-session-design.md) là contract xuyên suốt: ngoài lượt chỉ quan sát diễn biến chung, không có action mở Tài sản, chủ động thay đổi ván trong lượt/pha, ngoài lượt chỉ phản hồi tác vụ được phiên chỉ định. Giao dịch xử lý lần lượt, kết quả chung rõ ràng và có cơ chế bắt kịp sự kiện khi đồng bộ; người dùng đã bỏ nút Lịch sử khỏi giao diện.

Đây là điều chỉnh tương tác so với quyền trao đổi/xây ngoài lượt trong Monopoly gốc, đã được user yêu cầu; không cho phép tự sửa kinh tế hoặc thêm house rules khác. Không tự chọn mô hình thiết bị, timer/auto-forfeit, hay yêu cầu mọi người xác nhận mọi sự kiện. Chi tiết thực thi thuộc plan tương ứng; chưa sửa runtime hoặc Firebase.
