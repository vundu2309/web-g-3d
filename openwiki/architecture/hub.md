---
type: architecture
title: Kiến trúc hub và đồng bộ phòng
description: Luồng giao diện mobile, luật phòng thuần, adapter bản thử và Firebase, quyền truy cập và giới hạn trước khi có bàn chơi.
tags: [hub, rooms, mobile, firebase, architecture]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T10:52:40.016Z
sources:
  - id: openwiki-source-d9d9f9fb3a623858cabf7f70
    resource: repo://database.rules.json
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-32927955437a252a5e197780
    resource: repo://src/hub/model.ts
  - id: openwiki-source-073cd1426719ad5862d4f152
    resource: repo://src/platform/demo.ts
  - id: openwiki-source-0eacf94e25ae0c7320c6f741
    resource: repo://src/platform/firebase.ts
  - id: openwiki-source-be28d8122fde564d35ddd891
    resource: repo://tests/rules.test.mjs
generated: { by: "codex", at: "2026-11-03T10:48:14.207Z" }
---

# Kiến trúc hub và đồng bộ phòng

## Phạm vi và chủ sở hữu

Phố Tỷ Phú hiện là hub, chưa có bàn chơi hay kinh tế bất động sản. Entry `src/main.ts` nạp font/CSS và khởi động app. `src/app/start.ts` sở hữu DOM, form, chuyển màn, kết nối store và đăng ký theo dõi phòng. SVG nằm trong `src/ui/art.ts`; theme dùng CSS chung. Cảnh biển, Babylon và Havok đã được bỏ khỏi runtime.

Model `src/hub/model.ts` không phụ thuộc Firebase hay DOM: định nghĩa Room/Player, chuẩn hóa tên/mã, tạo phòng và xử lý lệnh trên bản sao dữ liệu. `src/hub/store.ts` chỉ định contract tạo, tham gia, cập nhật, theo dõi và dispose. Adapter hạ tầng không nhập ngược app; lint kiểm tra ranh giới này.

## Luồng vào phòng và trạng thái

Trang chính chỉ chọn tạo hoặc tham gia. Form tương ứng lấy tên và dung lượng/mã; tên được nhớ trong localStorage. Sau khi store hoàn tất, app lưu mode/mã theo tab trong sessionStorage và theo dõi phòng. Reload khôi phục listener; phòng đóng hoặc mất tư cách thành viên đưa người dùng về trang chính kèm thông báo. Nội dung tên được escape trước khi ghép HTML.

Phòng có host bất biến, thời điểm tạo, sức chứa tối đa 2–4, status và players theo UID. Chỉ mục seats 0–3 ánh xạ ngược về UID để rules kiểm tra giới hạn chỗ và tư cách thành viên. Ghế/màu của người còn lại không bị đổi khi có người rời đi.

Host luôn sẵn sàng. Khách chỉ bật/tắt trạng thái của chính mình. Chỉ host bắt đầu; cần ít nhất hai người và mọi người hiện diện đã sẵn sàng, không cần lấp đầy tất cả chỗ trống. Host rời sẽ đóng phòng; khách chỉ xóa bản thân. Bắt đầu đổi status thành `started` và hiển thị rằng bàn chơi chưa được phát triển, không chạy một ván game giả.

## Đồng bộ và cạnh tranh

Online là mặc định, chỉ tải Firebase khi kết nối. SDK Anonymous Auth cung cấp UID; listener Realtime Database nhận cập nhật ở `monopolyHub/v1/rooms/<CODE>`. Ghi dùng REST với ID token và ETag/if-match. HTTP 412 đọc lại trạng thái và thử lại tối đa năm lần, tránh hai lượt tham gia cùng lấy chỗ cuối. Yêu cầu có timeout; không xếp hàng ghi offline. Timeout có thể có kết quả commit không xác định, không phải bảo đảm exactly-once.

Bản thử là lựa chọn riêng có nhãn, chỉ dùng cùng browser origin. localStorage lưu phòng; Web Locks tuần tự hóa thay đổi, storage event thông báo các tab khác. Nó không kết nối điện thoại khác và không tự thay thế online khi lỗi. Phòng thử quá một ngày không cho tham gia mới.

## Quyền, vòng đời và giới hạn

Rules mặc định từ chối root, cho người đã đăng nhập đọc một phòng khi biết mã, không cho liệt kê tất cả phòng. Schema/seat index, thông tin host bất biến, readiness và quyền bắt đầu được kiểm tra phía RTDB. `tests/rules.test.mjs` dùng emulator để thử cả ghi trực tiếp status nhằm vượt readiness, xóa người khác và ETag cũ.

App dispose hủy DOM listeners và subscription; adapter bản thử gỡ storage listener. Đóng tab không tự rời phòng: chưa có presence, chuyển host hay dọn phòng bỏ quên. Người lưu trong roster không được coi là chắc chắn đang online. Trước gameplay cần thiết kế quyền lượt/tiền/xúc xắc phía server riêng.

Public Firebase config không có quyền quản trị. Backend hiện cần được kích hoạt/cấu hình riêng; [hướng dẫn vận hành](../operations/development.md) phân biệt Pages, emulator và Firebase thật.
