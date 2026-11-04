---
type: architecture
title: HUD ván chơi và adapter preview
description: Route UI 24 trạng thái, quyền hiển thị theo lượt và ranh giới với backend Monopoly chưa triển khai.
tags: [gameplay, ui, mobile, preview, state]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T04:42:03.835Z
sources:
  - id: openwiki-source-63e8f904736888c1397b0a2b
    resource: repo://docs/game/ui-implementation.md
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-de5ab1ed905c7bd08fbdce6f
    resource: repo://src/app/play.ts
  - id: openwiki-source-dba8152f894fe338575ac7a6
    resource: repo://src/game-ui/model.ts
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-bcd61b642f291bcc011c6bcd
    resource: repo://tests/game-ui-browser.mjs
  - id: openwiki-source-0753321c1f0f7198373c0847
    resource: repo://tests/game-ui.test.mjs
generated: { by: "codex", at: "2026-11-04T04:42:03.835Z" }
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
