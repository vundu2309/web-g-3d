# 01B — Thiết lập và lượt

**Trạng thái:** Backlog, chưa đặc tả/duyệt/implement. Chỉ là danh sách nghiên cứu; không suy thành luật đã xác minh. Nguồn bắt buộc: [S-002/S-003](sources.md).

## Phạm vi phải đặc tả

- [ ] US-TURN-001: Thiết lập: tiền ban đầu, ngân hàng, xáo thẻ, vị trí quân và cách chọn người đi đầu.
- [ ] US-TURN-002: Thứ tự pha: tung, di chuyển, giải quyết ô, mua hoặc đấu giá, xử lý nghĩa vụ, quyền kết thúc lượt.
- [ ] US-TURN-003: Qua/đến GO; các lệnh di chuyển từ thẻ; tránh trả thưởng GO hai lần.
- [ ] US-TURN-004: Đổ đôi, quyền tung tiếp, ba lần đôi liên tiếp, trường hợp đang ở tù.
- [ ] US-TURN-005: Đấu giá: người được tham gia, giá khởi điểm/bước giá nếu rulebook quy định, thanh toán và chốt người thắng.

## Tình huống cần kiểm chứng

Không mua đất chưa có chủ → phải mở đấu giá, không bỏ qua ô để kết thúc lượt.

Khi mở phần này, viết điều kiện, chuyển trạng thái, ngoại lệ và ví dụ cụ thể theo [mẫu luật](README.md), dẫn section nguồn. Không tái sử dụng ID cho một quy tắc có nghĩa khác.
