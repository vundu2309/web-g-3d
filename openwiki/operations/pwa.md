---
type: operations
title: Cài PWA, offline shell và cập nhật
description: Cách cài game trên điện thoại, scope/cache PWA và kiểm chứng cập nhật không reload phiên.
tags: [pwa, install, offline, caching, mobile]
sources:
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
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
  - id: openwiki-source-fdc97d585e693e9f422ad7ae
    resource: repo://src/app/pwa.ts
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-a09d1fc6a11ce8c081c67432
    resource: repo://src/game-ui/style.css
  - id: openwiki-source-77110d1e1f1125ab5211f920
    resource: repo://src/platform/pwa.ts
  - id: openwiki-source-554339f52225d7d8edff3ed0
    resource: repo://src/style.css
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
  - id: openwiki-source-489032183ad2ac8548be7b60
    resource: repo://tests/safe-area-browser.mjs
generated: { by: "codex", at: "2026-11-04T05:40:12.093Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T05:40:12.093Z
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

Không tự skipWaiting hoặc ép reload. Nút Cập nhật ngay yêu cầu xác nhận tải lại và worker kiểm tra chỉ còn cửa sổ yêu cầu trong scope; nếu có tab khác thì từ chối. Chỉ requester reload khi controllerchange. Đóng toàn bộ client vẫn kích hoạt tự nhiên. Khi activation, dọn cache cũ cùng prefix/scope và claim clients. Không xóa localStorage/IndexedDB hay cache repo khác. Kiểm tra update khi foreground được throttle60giây; browser cũng quản lý update lifecycle. Precache lỗi xóa cache chưa đủ và không activate phiên bản hỏng.

## Kiểm chứng

Tests/pwa-browser.mjs dùng build thật trên server loopback có subpath /web-g-3d/: manifest start/scope, PNG dimensions, synthetic install handler và guide, offline cold navigation vào home/HUD lazy route và reload, API cache exclusion, waiting update không reload và cleanup sau đóng client. Suite thuộc npm run test:browser và npm run check. Synthetic event không là test cài ở cấp OS; cần người dùng xác nhận Android/iOS thực tế.

Xem [hướng dẫn authored](../../docs/pwa.md), [workflow](development.md), [HUD](../architecture/gameplay-ui.md).

## Shared mobile safe area

HUD foreground uses one `.game-safe` inset container with shared `--safe-*` tokens mapped to CSS env values; background remains full bleed. Cards size against container units, while landscape action/task regions scroll when height is constrained. Dialogs and the update notice also respect device insets. Do not double-apply insets on HUD children. Browser tests simulate asymmetric cutouts and home indicators over all24 states on dev/production; this is not physical-device verification.

## Confirmed update action

Waiting PWA updates never auto-reload; Cập nhật ngay requires confirmation and the requesting client to be the only window in scope before skipWaiting. Only that requester reloads on controllerchange; another window blocks apply with a visible message. Closing all clients still permits natural activation. Tests cover cancellation, two-window rejection, confirmed reload and notice disappearance. Old installed shells without this button must close all game tabs/windows once to load the new UI. No app removal or data clearing is needed.
