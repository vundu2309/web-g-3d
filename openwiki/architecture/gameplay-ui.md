---
type: architecture
title: HUD ván chơi và adapter preview
description: Route UI 24 trạng thái, quyền hiển thị theo lượt và ranh giới với
  backend Monopoly chưa triển khai.
tags:
  - gameplay
  - ui
  - mobile
  - preview
  - state
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T09:13:08.522Z
sources:
  - id: openwiki-source-63e8f904736888c1397b0a2b
    resource: repo://docs/game/ui-implementation.md
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-e40960a4e3d6b8d6193113c1
    resource: repo://scripts/service-worker.js
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-de5ab1ed905c7bd08fbdce6f
    resource: repo://src/app/play.ts
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
  - id: openwiki-source-dba8152f894fe338575ac7a6
    resource: repo://src/game-ui/model.ts
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-a09d1fc6a11ce8c081c67432
    resource: repo://src/game-ui/style.css
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-77110d1e1f1125ab5211f920
    resource: repo://src/platform/pwa.ts
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
generated: { by: "codex", at: "2026-11-04T07:11:51.775Z" }
---

# HUD ván chơi và adapter preview

## Route và phạm vi

Người dùng đã duyệt 24 trạng thái UI, yêu cầu trạng thái di chuyển không có text riêng. Trang chính và phòng đã bắt đầu có link mở `?view=game`; query `state=5` mở ví dụ đấu giá. Đây là preview với badge dữ liệu minh họa, không phải ván Firebase. Module chỉ lazy-load khi chọn route này, không gọi Auth/Firestore hoặc ghi tiền/tài sản vào cloud.

## Ownership

- `src/game-ui/model.ts`: catalog scenario, action ID, allowed guard và fixed bid steps.
- `src/game-ui/render.ts`: template HUD/roster, deed và các surface tài sản/trade/thẻ/kết quả, escape text payload.
- `src/game-ui/icons.ts`: SVG outline chung, không dùng ảnh gen làm control.
- `src/game-ui/style.css`: landscape-phone layout, portrait fallback, reduced motion.
- `src/app/play.ts`: adapter preview, DOM delegation, dialog chọn trạng thái, local feedback, offline/online, timer và cleanup.

Catalog/guard phục vụ UI; chưa là state machine hoặc quyền bảo mật cho game thật. Backend tương lai phải cấp state, action hợp lệ và kiểm tra mọi command. Không chuyển local fixture dispatcher thành server hoặc kéo Firebase vào renderer.

## Contract hiển thị

Roster căn giữa dưới không nền. Highlight vàng bám người đến lượt, nhãn Bạn độc lập với Cần phản hồi. Action nhỏ gọn giữa phải, icon16px/text14px một hàng, touch target44px. Thẻ tài sản giữ cấu trúc in gốc, khác typography HUD; đủ bảy rent rows, mặt sau riêng. Observer không có action/Tài sản; không có nút Lịch sử, vẫn thấy quyết định/thẻ/giá/offer chung. Respondent có đúng action tác vụ, không khởi tạo trade riêng ngoài lượt.

Auction tăng10/20/50 từ giá cao nhất, không nhập số. Trade điều chỉnh số mẫu bằng nút, không bàn phím. Trạng thái02 không heading/detail/action; schematic board và CSS dice chỉ làm nền preview, chưa có board3D hay animation chuyển quân. Kết quả dùng người cuối chưa phá sản, không thắng theo số dư sau timer.

## Interactions và lifecycle

Các flow UI cục bộ giúp review: roll chuyển moving rồi mua, buy/pay chuyển kết thúc lượt, bid chuyển observer, trade response chuyển chờ, quản lý công trình có feedback. Một số thao tác chỉ báo lựa chọn thay vì giả giao dịch thật. Chọn scenario reset fixture; query giữ ID qua reload nhưng tiền/tài sản mẫu chỉ ở RAM. Dialog và events do controller sở hữu, AbortController/timer cleanup khi dispose. Offline chuyển state23, online đi qua24 rồi trả trạng thái trước đó; không bảo đảm reconnect ván server.

## Kiểm chứng

Unit tests kiểm tra observer/respondent permissions, fixed increments và moving không text. Browser tests chạy dev/production, cả24 scenario ở667×375,844×390,932×430, không overflow/đè roster, touch44px/icon nhỏ; kiểm tra flow, offline và reload. Preview tests chặn request Firebase production. Emulator tests của hub là suite riêng. Chưa có test engine, real-phone ergonomics hoặc production multiplayer gameplay.

Xem [implementation contract](../../docs/game/ui-implementation.md), [hub](hub.md), [workflow](../operations/development.md).

## PWA và vòng đời shell

Test browser chạy thêm tests/pwa-browser.mjs trên build thật tại subpath /web-g-3d/. Kiểm tra icon/manifest, handler cài và hướng dẫn, offline home/lazy HUD, API không cache, worker waiting không ép reload và cleanup khi client đóng. Xem [PWA](../operations/pwa.md); chưa thay test cài OS thực tế.

## Shared mobile safe area

HUD foreground uses one `.game-safe` inset container with shared `--safe-*` tokens mapped to CSS env values; background remains full bleed. Cards size against container units, while landscape action/task regions scroll when height is constrained. Dialogs and the update notice also respect device insets. Do not double-apply insets on HUD children. Browser tests simulate asymmetric cutouts and home indicators over all24 states on dev/production; this is not physical-device verification.

## Confirmed update action

Waiting PWA updates never auto-reload; Cập nhật ngay requires confirmation and the requesting client to be the only window in scope before skipWaiting. Only that requester reloads on controllerchange; another window blocks apply with a visible message. Closing all clients still permits natural activation. Tests cover cancellation, two-window rejection, confirmed reload and notice disappearance. Old installed shells without this button must close all game tabs/windows once to load the new UI. No app removal or data clearing is needed.

## Local 3D board preview

The local ?view=game preview uses one Three.js renderer across HUD redraws, a shared40-space grid with2.2-deep tiles, outward-readable labels and buildings on inner property stripes. Focus follows the active fixture token; Overview supports orbit/pan/zoom. WebGL fallback preserves a flat board. No authoritative economy or multiplayer gameplay is added. Tests/board-layout.test.mjs and tests/board-browser.mjs cover geometry and real WebGL camera/lifecycle/fallback behavior on dev/production. Mobile physical-device verification remains pending.
