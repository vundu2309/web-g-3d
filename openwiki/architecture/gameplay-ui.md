---
type: architecture
title: HUD ván chơi và adapter preview
description: Route HUD Monopoly 24 trạng thái, quyền hiển thị theo lượt, ranh giới với bàn 3D cục bộ và backend Monopoly chưa triển khai; mô tả theo source hiện tại.
tags:
  - gameplay
  - ui
  - mobile
  - preview
  - state
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
sources:
  - id: openwiki-source-63e8f904736888c1397b0a2b
    resource: repo://docs/game/ui-implementation.md
  - id: openwiki-source-18fc7b64e66932d83fa70cfc
    resource: repo://docs/ocean.md
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-de5ab1ed905c7bd08fbdce6f
    resource: repo://src/app/play.ts
  - id: openwiki-source-49557827443d53e9eeae17f4
    resource: repo://src/board/layout.ts
  - id: openwiki-source-1475654f7d7ee4e91ea6389a
    resource: repo://src/board/scene.ts
  - id: openwiki-source-e10546cfd06c4716552b2c32
    resource: repo://src/board/stage.ts
  - id: openwiki-source-d151d0d577d3bf13071b48d2
    resource: repo://src/game-ui/board-preview.ts
  - id: openwiki-source-dba8152f894fe338575ac7a6
    resource: repo://src/game-ui/model.ts
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-a09d1fc6a11ce8c081c67432
    resource: repo://src/game-ui/style.css
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-554339f52225d7d8edff3ed0
    resource: repo://src/style.css
  - id: openwiki-source-956a523ed721749c7e5f092a
    resource: repo://tests/board-browser.mjs
  - id: openwiki-source-df13702d635f30aac30177fb
    resource: repo://tests/board-layout.test.mjs
  - id: openwiki-source-bcd61b642f291bcc011c6bcd
    resource: repo://tests/game-ui-browser.mjs
  - id: openwiki-source-0753321c1f0f7198373c0847
    resource: repo://tests/game-ui.test.mjs
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
  - id: openwiki-source-489032183ad2ac8548be7b60
    resource: repo://tests/safe-area-browser.mjs
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
---

# HUD ván chơi và adapter preview

## Route và phạm vi

`src/main.ts` chọn route theo query `view`: không có `view` hoặc `view=ocean` vào [biển đánh cá chung](ocean.md) qua harbor; `view=monopoly-hub` mở hub phòng cũ (`src/app/start.ts`); `view=game` lazy-load adapter preview `src/app/play.ts`. Route HUD chỉ dựng giao diện mẫu và bàn 3D cục bộ. `src/app/play.ts` khai báo rõ không import Firebase, không ghi cloud và không xử lý kinh tế; `tests/game-ui-browser.mjs` chặn các request tới `identitytoolkit`, `securetoken` và `firestore.googleapis.com` và fail nếu có request.

Người dùng đã duyệt bộ 24 trạng thái UI. Trang chính và phòng đã bắt đầu có link mở `?view=game`; `state=5` mở ví dụ đấu giá. Badge và dialog ghi rõ đây là dữ liệu minh họa, chỉ thao tác trên máy này. Đây không phải ván Firebase.

## Ownership

- `src/game-ui/model.ts`: catalog 24 scenario, action ID, guard quyền hiển thị và các bước giá cố định.
- `src/game-ui/render.ts`: markup HUD, roster, thẻ tài sản, bề mặt trade/thẻ/kết quả; escape payload text.
- `src/game-ui/icons.ts`: SVG outline dùng chung.
- `src/game-ui/style.css`: layout landscape điện thoại, fallback portrait, reduced motion.
- `src/game-ui/board-preview.ts`: fixture cho bàn 3D cục bộ.
- `src/app/play.ts`: controller preview, delegation sự kiện DOM, dialog chọn trạng thái, phản hồi cục bộ, theo dõi online/offline, timer và cleanup.

Guard trong `model.ts` là contract hiển thị, không phải bảo mật. Backend tương lai phải cấp state, kiểm tra từng command và trả outcome; không chuyển dispatcher cục bộ thành server hay đưa Firebase vào renderer.

## Contract hiển thị

Roster căn giữa dưới, không nền; highlight vàng bám người đến lượt. Nhãn "Bạn" là định danh cục bộ, còn "Cần phản hồi" độc lập với chủ lượt. Action nằm giữa phải, icon SVG 16px, chữ 14px, vùng bấm tối thiểu 44px.

Ngoài lượt không có action, kể cả Tài sản; HUD không có nút Lịch sử. Observer vẫn thấy thẻ, người đang quyết định, giá/đề nghị và kết quả. Người phải phản hồi chỉ có đúng action của yêu cầu đó. Đấu giá tăng 10/20/50 từ giá cao nhất, không nhập số; trade điều chỉnh số mẫu bằng nút, không dùng bàn phím. Thẻ tài sản giữ cấu trúc thẻ in với đủ bảy dòng tiền thuê và mặt sau riêng.

Trạng thái 02 không có heading, detail hoặc action di chuyển. Chuyển quân trên bàn 3D chỉ là minh họa, không quyết định luật. Kết thúc ván mẫu xếp người cuối chưa phá sản, không xếp theo số dư sau timer.

## Interactions và lifecycle

Các flow cục bộ để review: tung chuyển sang trạng thái di chuyển rồi mua; mua/thanh toán kết thúc lượt; bid chuyển observer; phản hồi trade chuyển sang chờ; quản lý công trình có phản hồi cục bộ. Một số thao tác chỉ báo lựa chọn thay vì giả lập giao dịch cloud.

Chọn scenario reset fixture. Query `state` giữ ID qua reload, nhưng tiền và tài sản mẫu chỉ nằm trong RAM. Dialog, sự kiện và timer do controller sở hữu và được hủy khi dispose qua `AbortController`. Khi mất mạng, HUD hiện heading "Mất kết nối" với một action; khi có mạng lại, HUD trở về trạng thái trước đó. Không có reconnect ván server vì ván server chưa tồn tại.

## Kiểm chứng

- `tests/game-ui.test.mjs` (unit): quyền observer/respondent, bước giá cố định, trạng thái 02 không có text hay action.
- `tests/game-ui-browser.mjs`: chạy 24 scenario ở 667×375, 844×390 và 932×430, kiểm tra overflow, chồng lấn, kích thước action, flow mẫu, portrait, offline/online và reload; test fail nếu có request Firebase.
- `scripts/test-browser.mjs` chạy các suite này trên dev server và production preview.
- `tests/safe-area-browser.mjs`: mô phỏng cutout trái/phải và home indicator trên 24 trạng thái, dev và production.

Các test này là bằng chứng trình duyệt mô phỏng. Chúng không chứng minh ergonomics hoặc hiệu năng trên điện thoại thật, cũng không chứng minh gameplay đa người.

## PWA và vòng đời shell

`tests/pwa-browser.mjs` chạy trên build thật tại subpath `/web-g-3d/` (script `test:browser` trong `package.json`) và kiểm tra manifest/icon, handler cài đặt và hướng dẫn, offline home cùng lazy HUD, API không vào cache và update tự kích hoạt. Chi tiết nằm ở [PWA](../operations/pwa.md). Cài đặt trên Android/iOS vẫn cần kiểm chứng trên thiết bị thật.

Cập nhật service worker được mô tả trong mục "Cập nhật không phá phiên" của trang PWA; mục này chỉ nêu phần liên quan HUD.

## Shared mobile safe area

Phần HUD foreground dùng một container `.game-safe` và các token `--safe-*` ánh xạ sang `env(safe-area-inset-*)`; nền vẫn tràn màn hình. Thẻ co theo kích thước của container; vùng task và action ngang cuộn khi thiếu chiều cao. Không áp inset lần thứ hai lên từng phần tử con của HUD. Test mô phỏng inset, không phải bằng chứng trên thiết bị thật.

## Bàn 3D cục bộ

Bàn 3D trong `?view=game` là bản xem trước cục bộ dùng Three.js, dữ liệu lấy từ fixture `src/game-ui/board-preview.ts`. Nó không ghi Firestore, không gửi lệnh gameplay và không thay đổi quyền thao tác. Camera là công cụ xem, không phải action, nên observer cũng dùng được. Chi tiết hình học và camera nằm ở [bàn 3D và camera](board-3d.md).

## Giới hạn

Chưa có engine luật, ngân hàng, thẻ đầy đủ, xử lý đấu giá/trade nhiều máy, reconnect ván server hay đồng bộ đa người. Không trình bày các scene này là một ván hoàn chỉnh đúng luật. Xem [implementation contract](../../docs/game/ui-implementation.md), [hub](hub.md) và [workflow](../operations/development.md).
