# 01E — Nợ, phá sản và kết thúc

**Trạng thái:** Backlog, chưa đặc tả/duyệt/implement. Chỉ là danh sách nghiên cứu; không suy thành luật đã xác minh. Nguồn bắt buộc: [S-002/S-003](sources.md).

## Phạm vi phải đặc tả

- [ ] US-DEBT-001: Nghĩa vụ trả tiền: số tiền, người nhận, cách huy động tiền hợp lệ trước khi phá sản.
- [ ] US-DEBT-002: Phá sản với người chơi khác so với ngân hàng: xử lý tiền, đất, công trình, tài sản thế chấp và thẻ giữ lại.
- [ ] US-DEBT-003: Thứ tự xử lý khoản nợ nhiều người nhận; không tự cho vay từ ngân hàng hoặc xóa nợ.
- [ ] US-DEBT-004: Loại người chơi khỏi lượt, xử lý nghĩa vụ còn treo và xác định người cuối chưa phá sản.
- [ ] US-DEBT-005: Không thêm thắng theo thời gian, giới hạn lượt hoặc thắng theo tài sản như bản rút gọn.

## Tình huống cần kiểm chứng

Thiếu tiền mặt nhưng còn khả năng bán/thế chấp hợp lệ → không tự động tuyên phá sản chỉ vì số dư thấp.

Khi mở phần này, viết điều kiện, chuyển trạng thái, ngoại lệ và ví dụ cụ thể theo [mẫu luật](README.md), dẫn section nguồn. Không tái sử dụng ID cho một quy tắc có nghĩa khác.
