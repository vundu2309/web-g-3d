# Hồ sơ thiết kế gameplay

## Quyết định đã chốt

- **D-001 — Đã duyệt:** Monopoly Classic bản Mỹ, luật truyền thống, không rút gọn.
- **D-002 — Đã duyệt:** Giữ tên tiếng Anh và thứ tự khu đất của bản Mỹ, gồm Boardwalk/Park Place, bốn railroad và hai utility. Không đổi thành tên Việt hoặc tên tự sáng tác.
- **D-003 — Đã duyệt:** Không thêm house rules; phải có đấu giá, trao đổi và thế chấp trong phạm vi bản luật đầy đủ. Free Parking không phát tiền thưởng.
- **D-004 — Đã duyệt:** Chia plan riêng, làm từng phần; ưu tiên mobile landscape. Thiết kế hình ảnh phải được review trước implementation.
- **D-005 — Phạm vi hiện tại:** Giữ hub/Firebase/diagnostics đang chạy. Công việc hiện tại chỉ thiết lập tài liệu luật và plan; chưa cho phép bắt đầu gameplay hoặc đổi database/gói billing.

**D-006 — Nguồn cơ sở:** Sau khi người dùng đồng ý Classic US tiêu chuẩn hiện đại, chọn **G0009 US**, rulebook copyright **2025**, đã đọc từ Hasbro; xem [S-002](rules/sources.md). Không đồng nghĩa bảng giá, bộ thẻ hoặc toàn bộ chi tiết luật đã được xác minh/duyệt. Không ghép các bộ thẻ khác thời kỳ.

**D-007 — Quy trình đối chiếu đã duyệt:** Ưu tiên text và kiểm tra theo bảng. Hasbro là chuẩn luật; nguồn text cộng đồng được dùng cho bảng số có ghi mức xác minh. Ảnh chỉ dùng xử lý ngoại lệ, không dò tuần tự từng thẻ hoặc lặp tìm ảnh mỗi lượt nếu không có nguồn mới.

## Cách AI làm việc

1. Đọc trang này, [plan hiện hành](plans/01-rules.md), rồi đúng trang luật liên quan.
2. Chỉ thực hiện phần đang active và được giao. Hiện **Plan 01 / phần 01A — bàn cờ và tài sản** đang mở để nghiên cứu/duyệt tài liệu; các phần khác là backlog, không tự implement.
3. Phân biệt **đã duyệt**, **nháp cần xác minh**, **chưa xác định**, **đã implement** và **đã kiểm chứng**. Không suy từ đề xuất trong plan thành phê duyệt của người dùng.
4. Luật dùng rulebook Hasbro làm chuẩn. Số liệu tài sản ưu tiên bảng text có nguồn/version, đối chiếu hàng loạt; không bắt buộc tìm ảnh từng thẻ. Mỗi luật/dữ liệu cần ID, nguồn và ví dụ; ghi rõ khác biệt edition. Chỉ xem ảnh khi có mục thiếu/mâu thuẫn cụ thể và ghi câu hỏi đó trước khi xem. Chưa đủ bằng chứng thì gom vào [sổ câu hỏi](rules/sources.md), tiếp tục phần độc lập; không đoán số hoặc coi nguồn cộng đồng là xác minh G0009 chính thức.
5. Khi implementation được giao, ánh xạ test tới mã luật. Source thực thi thể hiện hiện trạng, không tự sửa đặc tả đã duyệt để hợp thức hóa bug. Báo sai lệch và sửa phần sai theo yêu cầu được giao.
6. Thay đổi hướng đã duyệt cần người dùng quyết định; các lựa chọn implementation thông thường trong phạm vi được giao không cần hỏi lại. Tài liệu này không tạo thêm bước xin phép cho sửa lỗi hoặc deploy đã được cho phép.
7. Hoàn thành một phần thì cập nhật checklist, bằng chứng và giới hạn; không đánh dấu xong chỉ vì đã tạo file.

## Bản đồ tài liệu

| Plan độc lập | Trạng thái |
| --- | --- |
| [01 — Luật chơi](plans/01-rules.md) | Active: chỉ 01A |
| [02 — Giao diện mobile](plans/02-mobile-ui.md) | Backlog |
| [03 — Model và luật thuần](plans/03-domain-model.md) | Backlog |
| [04 — Backend gameplay](plans/04-game-backend.md) | Backlog |
| [05 — Multiplayer](plans/05-multiplayer.md) | Backlog |
| [06 — Bàn chơi và đồ họa](plans/06-board-graphics.md) | Backlog |
| [07 — Kiểm thử và phát hành](plans/07-release.md) | Backlog |

Luật nằm trong [rules](rules/README.md). Tài liệu này là đặc tả dự kiến, không phải mô tả gameplay đã tồn tại. Xem [kiến trúc hiện tại](../architecture.md) cho hub đang chạy.
