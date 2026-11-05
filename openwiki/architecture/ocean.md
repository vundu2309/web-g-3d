---
type: architecture
title: Biển đánh cá online dùng chung
description: Một thuyền mỗi tài khoản, vào thẳng biển qua Auth hiện có, hai adapter online và giới hạn phiên tạm thời.
tags: [ocean, gameplay, multiplayer, auth, socketio, firebase]
sources:
  - id: openwiki-source-18fc7b64e66932d83fa70cfc
    resource: repo://docs/ocean.md
  - id: openwiki-source-60b51f83565a4de6497fc329
    resource: repo://firestore.rules
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-10f3f3e9db8fffece78a1ca6
    resource: repo://src/app/harbor.ts
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-415ab528c104eb4374a5e47b
    resource: repo://src/ocean/model.ts
  - id: openwiki-source-c4772bad9ebddbcdb376b988
    resource: repo://src/ocean/scene.ts
  - id: openwiki-source-d9571426a00d5a5ac9f9c54c
    resource: repo://src/platform/ocean-firebase.ts
  - id: openwiki-source-da299de568c1622268f94e39
    resource: repo://src/platform/ocean-socket.ts
  - id: openwiki-source-9fce44ed27844f7179f12e69
    resource: repo://tests/ocean-browser.mjs
  - id: openwiki-source-739950034b62004a0096c757
    resource: repo://tests/ocean-socket.test.mjs
  - id: openwiki-source-c8244a27b2e0d506bb9d0910
    resource: repo://tests/ocean.test.mjs
generated: { by: "codex", at: "2026-11-05T03:32:21.077Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-05T03:59:28.286Z
---

# Biển đánh cá online dùng chung

## Luồng và quyền sở hữu

`src/main.ts` mặc định mở `src/app/harbor.ts`. Bấm **Vào game**, đăng nhập/đăng ký bằng dialog hiện có nếu cần, rồi vào thẳng biển. Mỗi tài khoản điều khiển một thuyền riêng trên một map chung; không tạo/join phòng, mã mời, host hay readiness. `?view=ocean` khôi phục lối vào sau reload. Auth và password recovery chọn provider đã cấu hình. Hub Monopoly cũ ở `?view=monopoly-hub`; HUD/bàn preview vẫn ở `?view=game`, code/resource được bảo toàn.

`src/app/ocean.ts` sở hữu input, vòng animation, HUD/dialog và cleanup. `src/ocean/model.ts` định nghĩa pose, spawn ổn định theo UID, góc chuẩn hóa, di chuyển giới hạn và tránh đảo; payload từ mạng được kiểm tra trước render. `src/ocean/scene.ts` giữ một renderer Three.js, thuyền/đảo thủ tục, shader mặt biển, camera theo thuyền và label qua textContent. Không thêm engine hay framework.

## Điều khiển và câu cá

WASD/phím mũi tên hoặc pad cảm ứng điều khiển tiến/lùi/rẽ. Thả câu dừng thuyền; chờ tín hiệu cá cắn rồi bấm kéo trong 2,5 giây. Thu sớm hoặc bỏ lỡ không có cá. Kho cá chỉ tính trong chuyến hiện tại, reset khi rời/reload; chưa là inventory lưu lâu, tiền, giao dịch hay phần thưởng có thẩm quyền. Người khác thấy trạng thái đang câu. HUD dùng một vùng safe area, target ít nhất 44px và reduced motion; ảnh browser không thay kiểm tra điện thoại thật.

## Đồng bộ theo provider

`src/platform/ocean.ts` chọn cùng provider với Auth. Cấu hình Supabase dùng `ocean-socket.ts` và `server/ocean.mjs`: server xác thực lại command, lấy UID từ phiên, giới hạn pose/payload/rate, tối đa 100 thuyền và chỉ gửi `ocean:state` cho socket đã vào kênh. Một UID chỉ có một phiên; tab mới thay tab cũ; disconnect chỉ xóa đúng phiên đang sở hữu.

Biển Socket.IO nằm trong RAM của **một API process/instance**, reset khi deploy/restart. Không có schema Supabase mới hoặc polling. Không scale nhiều instance trước khi có world state/broadcast chung. PostgreSQL LISTEN/NOTIFY của phòng Monopoly vẫn giữ nguyên và không đồng bộ thế giới biển này.

Cấu hình Firebase dùng `ocean-firebase.ts`, collection `monopolyHub/v1/oceanBoats`, document theo UID, transaction và session lease. Query theo updatedAt giảm dần, limit 100. Rules chỉ cho own-UID ghi schema hợp lệ với server timestamp; user đã đăng nhập đọc danh sách giới hạn. Chuyển động tối đa một lần ghi/giây, heartbeat 10 giây khi tab hiện, thuyền từ xa quá 30 giây không cập nhật bị ẩn. Transaction không xếp hàng chuyển động offline. Mất mạng/lỗi hiển thị và yêu cầu về hub vào lại, không tự thay bằng demo.

## Kiểm chứng và triển khai

`tests/ocean.test.mjs` kiểm tra di chuyển, biên/đảo, 1.000 góc spawn và payload lỗi. `tests/ocean-socket.test.mjs` dùng Socket.IO client thật kiểm tra hai thuyền, push, UID, pose lỗi, thay phiên và không rò snapshot cho socket chưa vào biển. `tests/ocean-browser.mjs` dùng hai tài khoản Auth/Firestore emulator thực để kiểm tra vào trực tiếp, chuyển động xuất hiện ở trình duyệt khác, câu cá, layout, reload, duplicate session, rời và offline. Chặn request Firebase production.

`npm run test:supabase` giữ kiểm tra account/phòng/recovery bằng GoTrue/PostgREST/PostgreSQL/SMTP local và thêm hai browser vào biển, đồng bộ vị trí và rời game. `npm run check` chạy hồi quy Monopoly, browser dev/production, PWA, rules và API. Rules Firebase và API Render cần triển khai riêng; frontend build hoặc test local không tự chứng minh online production/hai điện thoại thật.

Nguồn hợp đồng: [docs/ocean.md](../../docs/ocean.md), [quyết định](../../docs/decisions/0007-shared-fishing-sea.md), [hạ tầng](infrastructure-transition.md).
