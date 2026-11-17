---
type: "Tham khảo"
title: "PWA: cài đặt, offline shell và cập nhật"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-17T08:18:15.877Z
sources:
  - id: openwiki-source-e21de4e070e82eb7a1025ce0
    resource: repo://public/manifest.webmanifest
  - id: openwiki-source-e40960a4e3d6b8d6193113c1
    resource: repo://scripts/service-worker.js
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-fdc97d585e693e9f422ad7ae
    resource: repo://src/app/pwa.ts
  - id: openwiki-source-77110d1e1f1125ab5211f920
    resource: repo://src/platform/pwa.ts
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
generated: { by: "claude-code", at: "2026-11-17T08:18:15.877Z" }
---


# PWA: cài đặt, offline shell và cập nhật

Game là một PWA với `display: standalone`, `orientation: landscape` và `start_url` là `./`. Service worker chỉ giữ phần **shell tĩnh** để trang chính mở được khi mạng chập chờn. Biển chung, đăng nhập và mọi dữ liệu của người chơi luôn đi qua mạng.

## Manifest và icon

`public/manifest.webmanifest` khai báo tên “Ra khơi cùng bạn”, tên ngắn “Ra khơi”, `lang: vi`, màu chủ đề `#4b3a8f`, và ba icon: `icon-192.png`, `icon-512.png`, và `maskable-512.png` (purpose `maskable`). `index.html` cũng có `apple-touch-icon`, `apple-mobile-web-app-capable`, và `manifest` link. Icon và manifest được kiểm tra trong `tests/pwa-browser.mjs` trên bản build production.

## Nút cài đặt

`src/app/pwa.ts` gắn một nút cài trên hub:

- Khi trình duyệt phát `beforeinstallprompt`, nút giữ sự kiện và gọi `prompt()` khi người chơi bấm. Nhãn là “Cài game”.
- Khi chưa có sự kiện đó (ví dụ iOS Safari), nút mở hướng dẫn và nhãn là “Cài lên điện thoại”.
- Ở chế độ standalone (`display-mode: standalone` hoặc `navigator.standalone`) hoặc sau `appinstalled`, nút bị ẩn.

Một sự kiện tổng hợp trong trình duyệt không chứng minh việc cài đặt thật trên hệ điều hành. Cài đặt trên Android và iOS cần kiểm tra trên thiết bị thật; chưa có bằng chứng như vậy trong repository.

## Service worker

`scripts/service-worker.js` là file được build thay hai hằng số: `VERSION` và `FILES`. Phạm vi là `registration.scope` của ứng dụng.

- **install**: mở cache có tên `photyphu-shell:<scope>:<version>` và nạp mọi file trong `FILES` với `cache: "reload"`. Nếu nạp lỗi thì xóa cache đó và ném lỗi, nên không có shell dở dang. Sau khi đủ, worker gọi `skipWaiting()`.
- **activate**: xóa các cache cũ có cùng tiền tố nhưng khác phiên bản, rồi `clients.claim()`.
- **fetch**: chỉ xử lý `GET` cùng origin. Điều hướng tới trang chính được trả về `index.html` đã cache. Các request khác chỉ được phục vụ từ cache khi URL nằm trong danh sách tĩnh và không có query. Mọi thứ khác (API, Supabase, URL ngoài, POST, URL có query) đi thẳng tới mạng.
- **message**: `VERSION` trả phiên bản cho màn hình cài đặt; `APPLY_UPDATE` cho phép kích hoạt worker đang chờ, nhưng chỉ dành cho bản cũ.

Vì vậy service worker không cache dữ liệu biển, phiên đăng nhập hay phản hồi từ API. `docs/pwa.md` và trang này dùng cùng quy tắc đó.

## Cập nhật không tự reload

`src/platform/pwa.ts` và `src/platform/update-check.ts` cung cấp `shellUpdates()`: `check()` chỉ báo kết quả (`latest`, `ready`), và `apply()` chỉ được gọi khi người chơi bấm “Cập nhật ngay”. Không có lệnh reload nào tự chạy khi phiên đang diễn ra; `registerShell` chỉ hiển thị trạng thái cập nhật chờ. Đây là yêu cầu của dự án: không ép reload phiên đang hoạt động.

`tests/update-check.test.mjs` kiểm tra logic kiểm tra cập nhật thuần; `tests/pwa-browser.mjs` kiểm tra cài đặt, offline reload và cập nhật chờ trên bản build.

## Ranh giới

- Service worker không lưu auth, API, Socket.IO hay dữ liệu cá. Dữ liệu biển được giữ trên thiết bị bởi `localStorage` (xem [biển chung](../architecture/ocean.md)), không bởi cache của worker.
- Kết nối lại của biển là việc của `src/app/ocean.ts` và `src/ocean/connect.ts`, không phải của service worker (xem [realtime](../architecture/ocean-realtime.md)).
- Chuyển origin làm mất trạng thái PWA cũ; xem [hạ tầng](../architecture/infrastructure-transition.md).

## Giới hạn

- Cài đặt, rung và hành vi offline thật trên Android và iOS: chưa xác minh trong repository.
- Hành vi của service worker phụ thuộc trình duyệt; trình duyệt mô phỏng không phải thiết bị thật.
