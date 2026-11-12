# Plan 02 — Giao diện mobile / HUD

**Trạng thái:** Thiết kế 24 trạng thái đã được người dùng chốt ngày 2026-11-04, UI preview đã triển khai. Phần board/hiệu ứng di chuyển và backend ván chưa được triển khai. Đây không phải hoàn thành một game Monopoly hoạt động.

## Quyết định cuối cùng

- Dùng [theme đã duyệt](../../design/theme.md), mobile landscape ưu tiên 844×390, 932×430 và 667×375.
- Người chơi căn giữa ở dưới không nền; highlight theo người đến lượt. Nhãn Bạn độc lập Cần phản hồi.
- Không có tên game trong màn chơi. Action nổi giữa phải, icon nhỏ và text một dòng, cùng kiểu và vùng chạm tối thiểu 44px.
- Thẻ đất giữ cấu trúc in gốc, font đen/English/cạnh vuông, sát cụm action; không thay bảng rent bằng hình nhà trang trí. Không có bảng Tiền của bạn/Sau khi mua.
- Đấu giá dùng nút +10/+20/+50 dựa giá cao nhất; trade chọn tài sản và tăng/giảm tiền bằng nút, tránh bật bàn phím.
- Ngoài lượt không có action/Tài sản. Bỏ Lịch sử. Observer vẫn thấy các quyết định chung; người được chỉ định phản hồi có đúng action của tác vụ.
- Trạng thái 02 không có text di chuyển. Board/animation chuyển quân là phần sau; CSS dice trong preview chỉ minh họa.

[Contract implementation](../ui-implementation.md) là tài liệu đầy đủ cho route, 24 trạng thái, quyền tương tác, tests và giới hạn. [Tiêu chí phiên](../shared-session-design.md) áp dụng xuyên suốt.

## Ảnh concept được duyệt

- [01–06: lượt, mua/đấu giá và quan sát](../../design/game-states-01-06.png).
- [07–12: tài sản và trao đổi](../../design/game-states-07-12.png).
- [13–18: nghĩa vụ, nhà tù/thẻ, kết quả](../../design/game-states-13-18.png).
- [19–24: chờ, tung tiếp, phá sản, kết nối](../../design/game-states-19-24.png).

Ngoại lệ đã chốt: bỏ text di chuyển ở 02. Nội dung minh họa/tên ô trong ảnh gen không thay thế dữ liệu source hay bằng chứng luật.

## Tiến độ theo màn

| Phần | Phạm vi                                     | Trạng thái                    |
| ---- | ------------------------------------------- | ----------------------------- |
| 02A  | HUD chính, đầu lượt/chờ/di chuyển/tung tiếp | Thiết kế duyệt, UI preview có |
| 02B  | Thẻ tài sản và mua, observer mua            | Thiết kế duyệt, UI preview có |
| 02C  | Đấu giá và observer                         | Thiết kế duyệt, UI preview có |
| 02D  | Tài sản, xây/bán, mortgage/unmortgage       | Thiết kế duyệt, UI preview có |
| 02E  | Đề nghị/phản hồi/quan sát trade             | Thiết kế duyệt, UI preview có |
| 02F  | Thanh toán/nợ, nhà tù/thẻ, phá sản          | Thiết kế duyệt, UI preview có |
| 02G  | Kết quả, mất kết nối và khôi phục           | Thiết kế duyệt, UI preview có |

## Tiêu chí implementation trong phạm vi HUD

- [x] Tách presentation model, render và preview controller khỏi Firebase/luật room.
- [x] Có lối vào preview rõ ràng; dữ liệu mẫu không được gọi là ván online.
- [x] Có selector cho 24 trạng thái và kiểm tra đúng action/người phản hồi.
- [x] Kiểm tra layout, vùng bấm và icons trên các viewport điện thoại bằng browser.
- [ ] Kiểm tra ergonomics trên điện thoại thật với người dùng.
- [ ] Nối engine/backend authoritative khi các plan tương ứng được mở.

## Bằng chứng và giới hạn

Các concept đã duyệt trong chat là hướng visual. Các ảnh v1 lưu trước đây là lịch sử bị bác bỏ; không copy thiết kế panel/số dư cũ trở lại UI. Screenshot render mới thuộc test-results/ và không commit. Renderer hiện dùng schematic board CSS làm nền; không tuyên bố board đó là đồ họa 3D cuối cùng hoặc engine đã di chuyển quân.

Tài sản/tiền, auction resolution và trade thật còn thuộc plan model/backend. Giá chưa xác minh ở Plan01 không được tự lấp để triển khai kinh tế. UI preview không mở các plan gameplay đó.
