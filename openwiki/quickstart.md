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
  - id: openwiki-source-e357e023868ea4db450d34ad
    resource: repo://docs/game/plans/02-mobile-ui.md
  - id: openwiki-source-03d3729a6d1fb321fab7b6df
    resource: repo://docs/game/README.md
  - id: openwiki-source-c932588d9fa043f7688a8026
    resource: repo://docs/game/rules/property-economics.md
  - id: openwiki-source-ded398e81c989f91c49f987f
    resource: repo://docs/game/rules/rent-conditions.md
  - id: openwiki-source-9be48765f38483590a0034ef
    resource: repo://docs/game/rules/sources.md
  - id: openwiki-source-e337f5bab9183e3a12f77158
    resource: repo://docs/game/shared-session-design.md
  - id: openwiki-source-63e8f904736888c1397b0a2b
    resource: repo://docs/game/ui-implementation.md
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
  - id: openwiki-source-8acf8e92f9f7b465d02fa04b
    resource: repo://firestore.indexes.json
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-2d276ab0949853064e1a4208
    resource: repo://src/app/diagnostics.ts
  - id: openwiki-source-de5ab1ed905c7bd08fbdce6f
    resource: repo://src/app/play.ts
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-dba8152f894fe338575ac7a6
    resource: repo://src/game-ui/model.ts
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
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
generated: { by: "codex", at: "2026-11-04T05:05:06.149Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T05:05:06.149Z
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

`src/main.ts` nạp font/CSS, chọn hub hoặc lazy HUD preview theo query và đăng ký cleanup HMR. App sở hữu DOM, navigation và subscription phòng. Model thuần không nhập Firebase; store contract tách các adapter. Màu cobalt/sky/yellow và các màn riêng là hướng đã duyệt, không phải chỗ tự đổi style tùy ý.

## Chạy và xác nhận đúng phạm vi

Dùng Node 24/npm 11; `npm ci`, `npm run dev`. Java 21 phục vụ rules emulator. `npm run check` kiểm tra transitions, browser dev/production và Firestore rules. Ưu tiên 844×390, 932×430 và 667×375; portrait/desktop là kiểm tra bổ sung. Đối chiếu ảnh render thật, không chỉ concept.

Online dùng Firebase Email/Password Auth + Cloud Firestore `(default)`; bản thử chỉ là nhiều tab cùng browser origin, luôn có nhãn riêng. Backend Firebase cần kích hoạt/cấu hình riêng; Pages chỉ deploy frontend. Không xem emulator xanh hoặc bản thử là online hai thiết bị đã thành công.

## Vai trò wiki

OpenWiki là devDependency pin 0.7.3 với `wiki`, `wiki:serve`, `wiki:export`; không nhập vào client. Nó là chỉ mục bằng chứng, không thay source/test và authored docs. Dùng lifecycle để cập nhật, không sửa Claims/index/provenance bằng tay. Cấu hình .codex dùng dependency cục bộ, không tự tiêu token model qua CI.

## Khi tạo/vào phòng chậm

Dùng [hướng dẫn đo thời gian](../docs/diagnostics.md) và [vận hành](operations/development.md): cờ `?diagnostics=1` cung cấp bảng theo từng chặng ngay trên điện thoại. Kết quả chỉ ở bộ nhớ, không tự upload. Chưa có phép đo production thì không khẳng định nguyên nhân là vùng database hay gói billing.

## Đặc tả gameplay theo từng phần

[Game contract](../docs/game/README.md) giữ baseline Monopoly Classic US truyền thống, không tự thêm house rules; tiêu chí phiên chơi đã duyệt giới hạn hành động chủ động ngoài lượt. Người dùng yêu cầu chốt tài liệu hiện có và sang [Plan 02 mobile UI](../docs/game/plans/02-mobile-ui.md): bộ 24 trạng thái HUD đã duyệt, UI preview đã được implement. Plan 01 tạm dừng nghiên cứu, chưa đồng nghĩa mọi số liệu/luật đã xác minh hoặc có gameplay. Các mục còn thiếu giữ backlog trước implementation; không tiếp tục dò từng thẻ. Thiết kế từng màn với ảnh review riêng trước code.

## Giá tài sản và đối chiếu edition

[Bảng kinh tế 01A.2](../docs/game/rules/property-economics.md) liệt kê 28 tài sản, nhưng chưa là config runtime hoặc bảng đã duyệt. Từng trường xác minh trực tiếp từ G0009 S-002 được phân biệt với số nháp từ Wikibooks S-004. Hình rulebook G0009 ghi Rhode Island Avenue, khác Oriental Avenue trong nguồn tham khảo; không tự sao chép rent giữa hai tên. Ảnh nguồn thứ cấp S-005 đã cho mặt sau Rhode Island ghi mortgage 50, unmortgage 55; chưa có hộp/mã G0009 để xác minh edition độc lập. S-006 bổ sung Short Line 100/110, S-007 bổ sung giá nhà/KS Mediterranean 50 và rent khớp S-002. Mortgage còn lại và rent/giá xây Rhode Island vẫn thiếu. Các ảnh bán lại chưa chứng minh mã G0009; sổ nguồn ghi hash ảnh. Không coi đủ 28 hàng là đã hoàn thành Plan 01A.

## Điều kiện áp dụng giá và tiền thuê

[01A.3](../docs/game/rules/rent-conditions.md) có bảy quy tắc và 15 case tài liệu đối chiếu S-002: quyền yêu cầu rent, đất đủ nhóm, công trình, railroad/utility, thế chấp và điều kiện xây. Chưa có engine/test gameplay. Giá còn thiếu S-003 và chính sách số hóa (yêu cầu rent, phép tung utility, thứ tự mạng) vẫn unresolved; Các khoảng trống 01A chưa được coi là xác minh xong; theo yêu cầu người dùng, chuyển sang Plan 02 thiết kế và xử lý các thiếu sót trước gameplay.

## Đối chiếu số liệu ưu tiên text

Quy ước đã được người dùng đồng ý: dùng rulebook Hasbro cho luật, bảng text có revision cho giá và so hàng loạt. Đã kiểm tra 21 đất màu × 9 trường = 189 số trong bảng nháp khớp S-004. Không ánh xạ Oriental sang Rhode Island; không coi khớp text là bằng chứng cả bộ G0009 hoặc phê duyệt. Ngoại lệ được gom trong [sổ nguồn](../docs/game/rules/sources.md); ảnh chỉ dùng cho mục thiếu/mâu thuẫn cụ thể, không dò từng thẻ.

## HUD được duyệt và tác vụ hiện hành

[Plan02]( ../docs/game/plans/02-mobile-ui.md ) lưu ảnh HUD được duyệt: roster dưới căn giữa không nền, không tên game, action nổi giữa cạnh phải, highlight đổi theo người đến lượt. Bộ 24 trạng thái đã duyệt và UI preview đã implement; v1 bị bác bỏ không là chuẩn. Board3D/backend gameplay còn để bước sau.

## Tiêu chí thiết kế phiên chơi đã chốt

[Một diễn biến chung](../docs/game/shared-session-design.md) quy định: ngoài lượt chỉ quan sát diễn biến chung, không action/Tài sản hoặc Lịch sử; khởi tạo trade/xây/bán/thế chấp trong lượt/pha; người được chỉ định vẫn phản hồi trade/đấu giá hoặc nghĩa vụ chung ngoài lượt. Giao dịch xử lý lần lượt và thông báo kết quả chung. Đây là điều chỉnh tương tác được user chốt, khác quyền ngoài lượt trong rulebook; không thay kinh tế, không tự thêm timer/auto-forfeit hoặc quyết định topology thiết bị. Plan02B v1 đã bị bác bỏ; thẻ phải giữ design gốc và action gọn theo các chỉnh sửa, bộ trạng thái đã được chốt để implement UI preview.

## Mở HUD ván chơi

Chọn Xem trước HUD ván chơi ở home hoặc ?view=game; bánh răng chọn 24 trạng thái, query state giữ scenario khi reload. [Kiến trúc HUD](architecture/gameplay-ui.md) và [implementation contract](../docs/game/ui-implementation.md) ghi scope UI/local fixture, không Firebase hoặc engine, không movement text ở02. Các concept đã duyệt trong docs/design/game-states-*.png không thay test browser/điện thoại thật.

## Cài game như app

Home có Cài game/Cài lên điện thoại, native prompt hoặc hướng dẫn Android Chrome/iOS Safari. [PWA](operations/pwa.md) ghi manifest, scoped static cache, offline home/HUD và update chờ đóng tab. Tài khoản/phòng vẫn cần mạng; app install không thay backend. Main khởi tạo/dispose installer cùng app.
