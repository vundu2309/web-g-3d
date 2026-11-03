---
type: quickstart
title: Bắt đầu với hub Phố Tỷ Phú
description: Bản đồ tác vụ cho hub board game mobile, theme đã duyệt, kiểm tra và phát hành Pages với Firebase riêng.
tags: [quickstart, hub, mobile, context]
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-de23c649f29de7b7defa1fe3
    resource: repo://docs/decisions/0002-mobile-board-game-hub.md
  - id: openwiki-source-523a2ee371c511874cedf68c
    resource: repo://docs/design/theme.md
  - id: openwiki-source-1207dc6dc9df1cc76b6da2de
    resource: repo://docs/diagnostics.md
  - id: openwiki-source-9b9ee78b093d5cd6376d5a80
    resource: repo://docs/game/plans/01-rules.md
  - id: openwiki-source-03d3729a6d1fb321fab7b6df
    resource: repo://docs/game/README.md
  - id: openwiki-source-9be48765f38483590a0034ef
    resource: repo://docs/game/rules/sources.md
  - id: openwiki-source-8acf8e92f9f7b465d02fa04b
    resource: repo://firestore.indexes.json
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-2d276ab0949853064e1a4208
    resource: repo://src/app/diagnostics.ts
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-435a4eb0dedae12246227bd4
    resource: repo://src/hub/diagnostics.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-0eacf94e25ae0c7320c6f741
    resource: repo://src/platform/firebase.ts
  - id: openwiki-source-a2b90583a7b340fe72510d57
    resource: repo://src/platform/firestore-client.ts
generated: { by: "codex", at: "2026-11-03T16:50:23.899Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T16:50:23.899Z
---

# Bắt đầu với hub Phố Tỷ Phú

Phố Tỷ Phú là hub cho board game giao dịch bất động sản, ưu tiên điện thoại xoay ngang. Có đăng ký/đăng nhập/reset, hồ sơ player, danh sách phòng theo tên và chủ phòng, màn chính, form tạo/tham gia và phòng chờ với mã, readiness, reload và rời/đóng phòng. Bàn chơi, xúc xắc, tiền và 3D gameplay chưa được triển khai; trải nghiệm biển/thuyền cũ đã được thay thế.

## Đọc theo tác vụ

| Tác vụ | Nguồn nên đọc |
| --- | --- |
| Bắt đầu sửa source bằng AI | [AGENTS](../AGENTS.md), rồi source liên quan |
| Chỉnh giao diện hoặc mobile | [Theme và bốn ảnh duyệt](../docs/design/theme.md), `src/style.css`, `src/ui/art.ts` |
| Đổi luồng hoặc luật phòng | [Kiến trúc hub](architecture/hub.md), `src/app/start.ts`, `src/hub/model.ts` |
| Sửa Firebase hoặc bản thử | [Kiến trúc hub](architecture/hub.md), [Firebase setup](../docs/firebase.md), adapter, `firestore.rules`, `firestore.indexes.json` và tests |
| Chạy test, setup và deploy | [Phát triển](operations/development.md), [workflow authored](../docs/workflow.md) |

`src/main.ts` nạp font/CSS và gọi app `start`, đăng ký cleanup HMR. App sở hữu DOM, navigation và subscription phòng. Model thuần không nhập Firebase; store contract tách các adapter. Màu cobalt/sky/yellow và các màn riêng là hướng đã duyệt, không phải chỗ tự đổi style tùy ý.

## Chạy và xác nhận đúng phạm vi

Dùng Node 24/npm 11; `npm ci`, `npm run dev`. Java 21 phục vụ rules emulator. `npm run check` kiểm tra transitions, browser dev/production và Firestore rules. Ưu tiên 844×390, 932×430 và 667×375; portrait/desktop là kiểm tra bổ sung. Đối chiếu ảnh render thật, không chỉ concept.

Online dùng Firebase Email/Password Auth + Cloud Firestore `(default)`; bản thử chỉ là nhiều tab cùng browser origin, luôn có nhãn riêng. Backend Firebase cần kích hoạt/cấu hình riêng; Pages chỉ deploy frontend. Không xem emulator xanh hoặc bản thử là online hai thiết bị đã thành công.

## Vai trò wiki

OpenWiki là devDependency pin 0.7.3 với `wiki`, `wiki:serve`, `wiki:export`; không nhập vào client. Nó là chỉ mục bằng chứng, không thay source/test và authored docs. Dùng lifecycle để cập nhật, không sửa Claims/index/provenance bằng tay. Cấu hình .codex dùng dependency cục bộ, không tự tiêu token model qua CI.

## Khi tạo/vào phòng chậm

Dùng [hướng dẫn đo thời gian](../docs/diagnostics.md) và [vận hành](operations/development.md): cờ `?diagnostics=1` cung cấp bảng theo từng chặng ngay trên điện thoại. Kết quả chỉ ở bộ nhớ, không tự upload. Chưa có phép đo production thì không khẳng định nguyên nhân là vùng database hay gói billing.

## Đặc tả gameplay theo từng phần

[Game contract](../docs/game/README.md) ghi quyết định dùng Monopoly Classic US truyền thống, giữ tên đất Mỹ, không house rules. [Plan 01](../docs/game/plans/01-rules.md) hiện chỉ mở phần 01A bàn cờ/tài sản để nghiên cứu và duyệt tài liệu. Sáu plan tiếp theo giữ backlog. Nguồn đã chọn là Hasbro G0009 US, rulebook copyright 2025, có URL/PDF/SHA tại sources.md. Toàn bộ bảng số liệu/thẻ vẫn chưa được xác minh; bảng 40 ô là nháp tham chiếu, không phải dữ liệu runtime. Hub/Firebase hiện tại không đổi và gameplay chưa implement. Mỗi luật cần ID, nguồn cùng edition, tình huống kiểm chứng và trạng thái duyệt.
