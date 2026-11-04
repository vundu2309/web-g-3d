# HUD ván chơi — triển khai UI

## Phạm vi đã triển khai

Người dùng duyệt bộ 24 concept ngày 2026-11-04, yêu cầu trạng thái di chuyển không có dòng text; board và hiệu ứng di chuyển để bước sau. Lượt này triển khai **HUD và các tác vụ UI**. Không mở rộng thành engine Monopoly, backend kinh tế hoặc tự triển khai multiplayer gameplay.

Mở `?view=game` từ link **Xem trước HUD ván chơi** ở trang chính, hoặc **Xem trước HUD** ở phòng đã bắt đầu. Badge luôn ghi **Bản xem trước · Dữ liệu minh họa**. Nút bánh răng mở danh sách 24 trạng thái; chọn một trạng thái sẽ reset dữ liệu mẫu. `?view=game&state=5` mở thẳng ví dụ đấu giá. Các thao tác chỉ ở RAM; không ghi Firestore, không đọc tài khoản hoặc gửi lệnh cho người chơi thật.

Phòng Auth/Firestore cũ tiếp tục hoạt động. Bắt đầu phòng chưa tự tạo ván backend; link preview không thay đổi membership hoặc trạng thái kinh tế. Rời preview về phòng chờ/trang chính sẽ khôi phục luồng phòng theo sessionStorage hiện có.

## Thiết kế và quyền thao tác đã chốt

- Roster ở dưới căn giữa, không nền; highlight vàng theo người đến lượt. Nhãn **Bạn** là local identity; **Cần phản hồi** độc lập với chủ lượt.
- Action nổi giữa phải, nút hàng ngang đồng nhất; icon SVG 16px với text 14px, không dùng minh họa icon lớn. Vùng bấm tối thiểu 44px. Icon SVG authored cùng viewBox/nét, không phải icon do imagegen ở runtime hoặc một dependency Lucide đã được cài.
- Ngoài lượt không có action, kể cả xem Tài sản. Bỏ Lịch sử khỏi HUD. Người được phiên yêu cầu phản hồi trade/đấu giá có đúng action của yêu cầu đó.
- Observer vẫn thấy thẻ, người đang quyết định, mức giá/đề nghị và kết quả. Không phải màn trống chỉ ghi “chờ”. Không triển khai mọi người tự mở task riêng song song.
- Thẻ đất giữ cấu trúc thẻ in: dải màu/tên, full rent ladder, giá xây, mặt sau riêng. Font đen Arial/Helvetica và góc vuông, không áp font/bo góc của HUD lên thẻ. Đây là template HTML/CSS, không tuyên bố là file artwork Hasbro gốc đã được xác minh.
- Mua/đấu giá ở cạnh thẻ; không hiển thị bảng “Tiền của bạn / Sau khi mua”. Không mở bàn phím để đấu giá: nút +10/+20/+50 cộng vào giá cao nhất, ghi rõ tổng mới. Đây là quy tắc tương tác do người dùng chọn, không khẳng định là quy định duy nhất của Monopoly gốc.
- Trạng thái 02 không có heading/detail hoặc action. CSS dice animation chỉ là minh họa preview; chuyển quân và board 3D chưa được xây dựng.
- Kết thúc ván theo người cuối chưa phá sản; không xếp người có số dư dương thành thắng/thua kiểu ván tính giờ.

## Ownership và đường nối backend sau này

| File | Trách nhiệm |
| --- | --- |
| `src/main.ts` | Chọn route preview theo query, lazy-load module UI |
| `src/game-ui/model.ts` | Catalog 24 scenario, contract action và presentation permission guard, fixed bid increments |
| `src/game-ui/render.ts` | Markup HUD, deed, inventory/trade/event/result surfaces; escape payload text |
| `src/game-ui/icons.ts` | SVG outline nhất quán và escape helper |
| `src/game-ui/style.css` | Layout mobile landscape, portrait fallback, reduced-motion |
| `src/app/play.ts` | Controller preview, local scripted transitions, dialog scenario selector, event/timer cleanup |

`Scenario` và dispatch guard là contract hiển thị, **không phải authorization bảo mật**. Adapter thật sau này phải nhận state authoritative, command hợp lệ, outcome và errors từ backend. Không đưa Firebase vào renderer/model UI. Mọi lệnh thay đổi tiền/quyền sở hữu cần backend kiểm tra; không tái sử dụng local preview dispatcher làm server.

Các thao tác mẫu: tung → trạng thái 02 → quyết định mua; mua/thanh toán → kết thúc lượt; bid → observer chờ phản hồi; accept/reject trade → chờ lượt; quản lý công trình có phản hồi cục bộ và kiểm tra xây/bán đều. Một số thao tác chỉ thông báo lựa chọn để review thay vì giả vờ thực hiện giao dịch cloud. Scenario picker cho phép xem tất cả 24 trạng thái dù chưa có engine sinh chúng. Các scene không phải bằng chứng một ván hoàn chỉnh chạy đúng luật.

## Kiểm chứng và giới hạn

`tests/game-ui.test.mjs` kiểm tra observer/response permissions, bid dựa giá cao nhất, trạng thái 02 không text/action, tung tiếp không có end-turn. `tests/game-ui-browser.mjs` kiểm tra flow mẫu, chính xác marker chủ lượt/respondent, không bàn phím trade/auction, đủ 7 rent rows, icon nhỏ, touch target, overflow/overlap trên 667×375, 844×390, 932×430; portrait, offline/online và reload. Test preview chặn Firebase production; không ghi dữ liệu thật. Auth integration cũng làm chậm room-listener transport sau khi directory đã cache roster cũ để kiểm tra join không bị kết luận rời phòng từ cache.

Sơ đồ bàn chỉ là placeholder HTML/CSS với 40 ô, chưa phải board 3D, chưa có animation di chuyển quân. Tài sản, tiền, giá và kết quả là fixture; thiếu sót nguồn ở Plan 01 vẫn cần xử lý trước engine. Ngân hàng, thẻ đầy đủ, auction resolution, trade acceptance qua nhiều máy và reconnect server chưa implement. Trình duyệt mô phỏng không chứng minh ergonomics/hiệu năng trên điện thoại thật.

## Mobile safe area

HUD foreground shares one `.game-safe` coordinate system inset by the four `--safe-*` tokens mapped to CSS `env(safe-area-inset-*)`. Background remains full bleed. Size responsive cards against the safe container (cqw/cqh), not the glass viewport. Landscape task cards and action trays scroll independently when vertical space is limited; preserve 44px actions and keep the bottom roster clear. Do not apply a second inset to individual HUD children.

`tests/safe-area-browser.mjs` checks all 24 states with asymmetric left/right cutouts and bottom home-indicator insets, reachable actions and portrait modal bounds against dev/production. These are CSS inset simulations, not physical-device verification.
