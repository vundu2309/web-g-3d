---
type: "Tham khảo"
title: "Biển chung: tổng quan và ranh giới"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-17T08:18:15.877Z
sources:
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-10f3f3e9db8fffece78a1ca6
    resource: repo://src/app/harbor.ts
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-69220ba068a830c8d6971aab
    resource: repo://src/ocean/babylon-scene.ts
  - id: openwiki-source-415ab528c104eb4374a5e47b
    resource: repo://src/ocean/model.ts
  - id: openwiki-source-da299de568c1622268f94e39
    resource: repo://src/platform/ocean-socket.ts
  - id: openwiki-source-739950034b62004a0096c757
    resource: repo://tests/ocean-socket.test.mjs
generated: { by: "claude-code", at: "2026-11-17T08:18:15.877Z" }
---


# Biển chung: tổng quan và ranh giới

Biển chung là màn hình chính sau khi người chơi ra khơi. Mỗi tài khoản có đúng một thuyền; mọi thuyền cùng ở một biển chung trên server. Không có phòng, lời mời, sảnh chờ hay trạng thái sẵn sàng. Quyết định nền tảng nằm ở [decision 0007](../../docs/decisions/0007-shared-fishing-sea.md), còn việc dùng Babylon.js và Havok cho thuyền nằm ở [decision 0008](../../docs/decisions/0008-babylon-havok-boat-physics.md).

## Vào và ra

- Hub (`src/app/harbor.ts`, xem [hub](hub.md)) gọi `startOcean(root, back)` sau khi `requirePlayer()` trả về người chơi. Biển thay thế hub trong `#app`; URL đổi thành `?view=ocean`.
- `?view=ocean` tự vào biển khi tải trang nếu còn phiên đăng nhập.
- Quay lại hub, mất phiên, hoặc `pagehide` gọi `dispose()`. Khi phiên mất, hub dừng biển và đưa người chơi về `./`.
- Thoát biển không xóa tiến trình trên thiết bị: vị trí và kho cá được lưu trước khi rời đi.

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Điều phối | `src/app/ocean.ts` | Đăng ký và dọn dẹp mọi listener, vòng đời tải, kết nối, vòng lặp khung hình, HUD, hộp thoại, lưu tiến trình, ngắt khi ẩn tab. |
| Cảnh 3D | `src/ocean/babylon-scene.ts` | `OceanScene`: một engine, một scene, Havok cho thuyền người chơi, thuyền khác là instance, nhãn tên, cần câu, camera đuổi. |
| Luật thuần | `src/ocean/model.ts` | `spawn(uid)` xác định theo UID, giới hạn di chuyển `SEA_BOUND = 1500`, va chạm đảo, `readBoat` kiểm tra payload từ xa. |
| Điều khiển | `src/ocean/boat-control.ts`, `stick.ts`, `input-layer.ts` | Phím, cần ảo và một lớp trong suốt nhận mọi cảm ứng. |
| Thuyền | `src/ocean/boat-physics.ts` | Havok, phao nổi, lực cản, lái (xem [render](ocean-rendering.md) và [câu cá](ocean-fishing.md)). |
| Kết nối | `src/platform/ocean.ts`, `src/platform/ocean-socket.ts`, `src/ocean/connect.ts`, `src/ocean/remote.ts` | Socket.IO và nội suy thuyền khác (xem [realtime](ocean-realtime.md)). |
| Tiến trình | `src/ocean/save.ts` | Lưu trên thiết bị. |
| Tải Havok | `src/ocean/havok.ts` | Nạp WASM từ asset của Vite, không từ CDN. |

Platform không import app; `src/app/ocean.ts` là nơi duy nhất nối kết nối với scene.

## Vòng đời

`startOcean` tạo ba bộ điều khiển với `AbortController` riêng (`abort` cho giao diện, `network` cho kết nối):

1. Vẽ màn hình tải với ba bước: đồ họa biển, kết nối map chung, vào biển. Biển được vẽ cả khi đang kết nối; thuyền xuất hiện khi kết nối xong.
2. `OceanScene.create()` nạp Havok và dựng cảnh. Nếu không tạo được cảnh trong thời gian chờ, màn hình báo lỗi kèm nút thử lại.
3. `connectOcean` xác thực và vào biển; mọi kết nối tạm thời bị hủy nếu người chơi đã rời trước khi kết nối xong.
4. Vòng lặp khung hình dùng `FramePacer` (xem [render](ocean-rendering.md)). Trong mỗi khung, vị trí được đọc từ thuyền, gửi lên server theo `sendMs`, và lưu tiến trình khi đã quá 5 giây kể từ lần lưu trước.
5. Khi rớt kết nối giữa chừng, `reconnect()` tự thử lại trong tối đa 90 giây; các lỗi không sửa được được hiện ngay.
6. `dispose()` dọn dẹp: hủy listener, ngắt kết nối, giải phóng cảnh, gọi `fishingUi.dispose()`, và lưu lần cuối.

## Điều khiển

- **Cần ảo** (`stick.ts`): kéo lên để tiến, xuống để lùi, sang trái hoặc phải để lái. Hướng chéo chạy và rẽ cùng lúc. Vùng chết nhỏ bỏ qua ngón tay đặt yên.
- **Bàn phím**: WASD hoặc phím mũi tên tương đương lệch tối đa; cần ảo được ưu tiên khi đang giữ.
- **Lớp đầu vào** (`input-layer.ts`): một lớp trong suốt nhận mọi cảm ứng, tìm nút dưới ngón tay theo vị trí, giữ một đường đi cho mỗi ngón tay, và chặn menu nhấn giữ, chọn văn bản và kéo ảnh. Các nút vẫn là `<button>` thật để bàn phím và trợ năng hoạt động.
- **Hộp thoại** (danh sách thuyền, kho cá, chợ) là HTML và chỉ dùng chạm.

Khi trang không thể chơi (tab ẩn, hộp thoại đang mở, đang câu), điều khiển thuyền bị bỏ qua. Khi tab ẩn, mọi phím và cảm ứng được nhả và cá đang câu được thu lại.

## Lưu trên thiết bị

`src/ocean/save.ts` lưu vị trí, hướng, kho cá và số cá theo khóa `photyphu:sea:v1:<uid>` trong localStorage. Dữ liệu đọc lại được kiểm tra: lưu cũ hơn 7 ngày, ngoài biển, nằm trong đảo, hoặc hỏng thì vị trí rơi về bến; kho cá được giữ. Đây là trạng thái của thiết bị, không phải tài sản của tài khoản, không phải phần thưởng, và không có kiểm tra chống gian lận.

Xu và kinh tế nằm trên server (xem [kinh tế biển](ocean-economy.md)), không nằm trong `save.ts`.

## Luật thuần và kiểm thử

`src/ocean/model.ts` không có Babylon hay DOM. `spawn(uid)` cho mỗi tài khoản một điểm bắt đầu xác định; `readBoat` từ chối tư thế có khóa thiếu, không hữu hạn, hoặc vượt `SEA_BOUND`. Kiểm thử chính:

- `tests/ocean.test.mjs`, `tests/ocean-socket.test.mjs`, `tests/socket.test.mjs`: luật biển, giao thức và Socket.IO.
- `tests/boat-control.test.mjs`, `tests/boat-physics.test.mjs`, `tests/hull-handling.test.mjs`: điều khiển và thuyền.
- `tests/ocean-browser.mjs`, `tests/ocean-steer-browser.mjs`, `tests/ocean-input-browser.mjs`, `tests/ocean-stick-browser.mjs`, `tests/ocean-resume-browser.mjs`, `tests/ocean-loading-browser.mjs`, `tests/ocean-multiplayer-browser.mjs`: luồng biển trong trình duyệt với Supabase và API giả.

Các kiểm tra này chứng minh luật trong mã và trong trình duyệt mô phỏng. Chưa có bằng chứng từ điện thoại thật, từ Supabase thật hay từ API Render đã triển khai.

## Giới hạn

- Biển chỉ có một instance API; xem [realtime](ocean-realtime.md).
- Cá bắt được là báo cáo của client; xem [câu cá](ocean-fishing.md).
- Trải nghiệm xoay ngang trên điện thoại cần kiểm tra thiết bị thật, đặc biệt cảm ứng, rung và Safari.
