---
type: operations
title: Cài PWA, offline shell và cập nhật
description: Cách cài game trên điện thoại, scope/cache PWA và kiểm chứng cập
  nhật không reload phiên.
tags:
  - pwa
  - install
  - offline
  - caching
  - mobile
sources:
  - id: openwiki-source-f8d10828394c4129061d5b0e
    resource: repo://index.html
  - id: openwiki-source-e21de4e070e82eb7a1025ce0
    resource: repo://public/manifest.webmanifest
  - id: openwiki-source-f80c1cea1464f35b86fec884
    resource: repo://scripts/pwa-build.mjs
  - id: openwiki-source-e40960a4e3d6b8d6193113c1
    resource: repo://scripts/service-worker.js
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-32d34de3adc601eacf7364ad
    resource: repo://src/app/password-recovery.ts
  - id: openwiki-source-fdc97d585e693e9f422ad7ae
    resource: repo://src/app/pwa.ts
  - id: openwiki-source-49557827443d53e9eeae17f4
    resource: repo://src/board/layout.ts
  - id: openwiki-source-1475654f7d7ee4e91ea6389a
    resource: repo://src/board/scene.ts
  - id: openwiki-source-e10546cfd06c4716552b2c32
    resource: repo://src/board/stage.ts
  - id: openwiki-source-d151d0d577d3bf13071b48d2
    resource: repo://src/game-ui/board-preview.ts
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-a09d1fc6a11ce8c081c67432
    resource: repo://src/game-ui/style.css
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
  - id: openwiki-source-77110d1e1f1125ab5211f920
    resource: repo://src/platform/pwa.ts
  - id: openwiki-source-554339f52225d7d8edff3ed0
    resource: repo://src/style.css
  - id: openwiki-source-956a523ed721749c7e5f092a
    resource: repo://tests/board-browser.mjs
  - id: openwiki-source-df13702d635f30aac30177fb
    resource: repo://tests/board-layout.test.mjs
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
  - id: openwiki-source-489032183ad2ac8548be7b60
    resource: repo://tests/safe-area-browser.mjs
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
---

# PWA của Phố Tỷ Phú

## Cài trên điện thoại

Home có nút cài: khi có beforeinstallprompt, click gọi native prompt; khi không có thì mở hướng dẫn Chrome Android/Safari iOS. Không tự gọi prompt trước thao tác của user, không coi dismiss/accepted promise là xác minh đã cài OS. Appinstalled/standalone ẩn nút. Trong browser của ứng dụng chat cần mở Chrome/Safari trước. Manifest dùng name/id/scope/start_url tương đối, standalone và orientation landscape; OS có thể bỏ qua orientation hint.

## Ownership

public/manifest.webmanifest và icons cung cấp192/512 any,512 maskable có padding và apple-touch180. index.html liên kết manifest và metadata iOS. src/app/pwa.ts sở hữu UI, event prompt, dialog/listeners/observer; src/platform/pwa.ts đăng ký worker production và theo dõi update, không xây DOM. Main dispose cả app lẫn installer khi HMR. Không có dependency PWA mới.

## Cache tĩnh và privacy

Build-only plugin scripts/pwa-build.mjs băm nội dung shell rồi sinh dist/sw.js từ scripts/service-worker.js. Precache gồm index, manifest, icons, font và lazy chunks, không cần user đã mở HUD mới cache HUD. Worker scope là registration scope của repo Pages; cache prefix bao gồm scope URL và version.

Chỉ GET của allowlist tĩnh chính xác và navigation root/index trong scope được phục vụ từ cache. Navigation query view=game/state vẫn dùng cached index. Cross-origin, API, POST, asset query không nhận diện và URL/repo khác không bị cache. Không lưu token/account/profile/room API response trong Cache Storage. Có thể mở home/HUD offline sau shell đã tải, nhưng Auth/phòng/multiplayer cần mạng; không thêm game engine hoặc fallback online sang demo.

## Cập nhật không phá phiên

Worker mới tự `skipWaiting` sau khi precache xong; khi activation, worker dọn cache cũ cùng prefix/scope rồi claim clients. Precache lỗi thì xóa cache đang làm dở và không activate phiên bản hỏng. Trang chỉ tự tải lại khi ở màn chính (không có `view=`), không có dialog mở và không đang nhập form; trong `?view=ocean`, `?view=game` hoặc hub phòng cũ, trang không bị tải lại giữa phiên. Nút Cập nhật ngay chỉ hiện khi trình duyệt giữ một worker đang chờ, và yêu cầu xác nhận trước khi tải lại. Không xóa localStorage/IndexedDB hay cache repo khác. Kiểm tra update khi foreground được throttle 60 giây; browser cũng quản lý vòng đời update.

## Kiểm chứng

Tests/pwa-browser.mjs dùng build thật trên server loopback có subpath /web-g-3d/: manifest start/scope, PNG dimensions, synthetic install handler và guide, offline cold navigation vào home/HUD lazy route và reload, API cache exclusion, waiting update không reload và cleanup sau đóng client. Suite thuộc npm run test:browser và npm run check. Synthetic event không là test cài ở cấp OS; cần người dùng xác nhận Android/iOS thực tế.

Xem [hướng dẫn authored](../../docs/pwa.md), [workflow](development.md), [HUD](../architecture/gameplay-ui.md).

## Shared mobile safe area

HUD foreground uses one `.game-safe` inset container with shared `--safe-*` tokens mapped to CSS env values; background remains full bleed. Cards size against container units, while landscape action/task regions scroll when height is constrained. Do not double-apply insets on HUD children. Browser tests simulate asymmetric cutouts and home indicators over all 24 states on dev/production; this is not physical-device verification.

## Local 3D board preview

The local ?view=game preview uses one Three.js renderer across HUD redraws, a shared40-space grid with2.2-deep tiles, outward-readable labels and buildings on inner property stripes. Focus follows the active fixture token; Overview supports orbit/pan/zoom. WebGL fallback preserves a flat board. No authoritative economy or multiplayer gameplay is added. Tests/board-layout.test.mjs and tests/board-browser.mjs cover geometry and real WebGL camera/lifecycle/fallback behavior on dev/production. Mobile physical-device verification remains pending.


## Frontend Auth và kiểm thử full stack

Runtime Supabase là opt-in: facade Auth có xác nhận email và đặt mật khẩu mới; phòng dùng HTTP mutations kèm Bearer token và Socket.IO snapshots; Firebase/Pages vẫn là fallback. Kiểm thử Docker cô lập (`scripts/test-supabase.mjs`) dùng GoTrue, PostgREST và PostgreSQL thật với hai browser context; không gửi email hay ghi fixture lên production.

Cấu hình email redirect được giới hạn về origin Vercel đã duyệt qua VITE_AUTH_REDIRECT_URL; CA công khai của Supabase được pin cho listener trong khi giữ xác minh TLS/hostname. `npm run test:supabase` chạy stack dùng một lần và CI cũng gọi bài kiểm thử này. Kiểm thử local không tự chứng minh email thật đã đến hộp thư bên ngoài.

## Biển online và shell offline

Home hiện mở [biển chung](../architecture/ocean.md) sau Auth theo provider; PWA vẫn dùng cùng installer và shell tĩnh. Khi mất mạng, biển tự thử kết nối lại và báo lỗi nếu không được; không có thuyền mẫu. Không lưu cá/phiên multiplayer vào cache. Màn Monopoly local vẫn giữ tại `?view=game`; trạng thái API/triển khai được kiểm chứng riêng với cache frontend.
