---
type: quickstart
title: Bắt đầu với hub Phố Tỷ Phú
description: Bản đồ tác vụ cho hub board game mobile, theme đã duyệt, kiểm tra
  và phát hành Pages với Firebase riêng.
tags:
  - quickstart
  - hub
  - mobile
  - context
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
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
  - id: openwiki-source-18fc7b64e66932d83fa70cfc
    resource: repo://docs/ocean.md
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
  - id: openwiki-source-8acf8e92f9f7b465d02fa04b
    resource: repo://firestore.indexes.json
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-2d276ab0949853064e1a4208
    resource: repo://src/app/diagnostics.ts
  - id: openwiki-source-10f3f3e9db8fffece78a1ca6
    resource: repo://src/app/harbor.ts
  - id: openwiki-source-32d34de3adc601eacf7364ad
    resource: repo://src/app/password-recovery.ts
  - id: openwiki-source-de5ab1ed905c7bd08fbdce6f
    resource: repo://src/app/play.ts
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
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
  - id: openwiki-source-435a4eb0dedae12246227bd4
    resource: repo://src/hub/diagnostics.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-b30da6bbf3782f1926011771
    resource: repo://src/ocean/save.ts
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
  - id: openwiki-source-0eacf94e25ae0c7320c6f741
    resource: repo://src/platform/firebase.ts
  - id: openwiki-source-a2b90583a7b340fe72510d57
    resource: repo://src/platform/firestore-client.ts
  - id: openwiki-source-33c878cb026122d0ff89d417
    resource: repo://src/platform/ocean.ts
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

# Bắt đầu với hub Phố Tỷ Phú

Game hiện hành là **biển đánh cá online dùng chung**, ưu tiên điện thoại xoay ngang. Mỗi tài khoản điều khiển một thuyền riêng. Hub → Vào game → đăng nhập nếu cần → vào thẳng map chung; không tạo/join phòng hoặc sẵn sàng. Authenticator theo provider và toàn bộ code/resource Monopoly được bảo toàn: hub phòng cũ tại `?view=monopoly-hub`, HUD/board preview tại `?view=game`.

Đọc [kiến trúc biển](architecture/ocean.md), [hợp đồng authored](../docs/ocean.md) và [quyết định](../docs/decisions/0007-shared-fishing-sea.md) cho tác vụ hiện hành. Các phần luật/phòng Monopoly bên dưới là ngữ cảnh được bảo toàn, không áp luật lượt Monopoly lên việc lái thuyền.

## Đọc theo tác vụ

| Tác vụ | Nguồn nên đọc |
| --- | --- |
| Bắt đầu sửa source bằng AI | [AGENTS](../AGENTS.md), rồi source liên quan |
| Chỉnh giao diện hoặc mobile | [Theme và bốn ảnh duyệt](../docs/design/theme.md), `src/style.css`, `src/ui/art.ts` |
| Đổi luồng hoặc luật phòng | [Kiến trúc hub](architecture/hub.md), `src/app/start.ts`, `src/hub/model.ts` |
| Sửa Firebase hoặc bản thử | [Kiến trúc hub](architecture/hub.md), [Firebase setup](../docs/firebase.md), adapter, `firestore.rules`, `firestore.indexes.json` và tests |
| Chạy test, setup và deploy | [Phát triển](operations/development.md), [workflow authored](../docs/workflow.md) |

`src/main.ts` nạp font/CSS, mặc định mở hub biển, chọn lazy HUD hoặc hub Monopoly legacy theo query và đăng ký cleanup HMR. App sở hữu DOM, navigation và subscription phòng. Model thuần không nhập Firebase; store contract tách các adapter. Màu cobalt/sky/yellow và các màn riêng là hướng đã duyệt, không phải chỗ tự đổi style tùy ý.

## Chạy và xác nhận đúng phạm vi

Dùng Node 24/npm 11; `npm ci`, `npm run dev`. Java 21 phục vụ rules emulator. `npm run check` kiểm tra transitions, browser dev/production và Firestore rules. Ưu tiên 844×390, 932×430 và 667×375; portrait/desktop là kiểm tra bổ sung. Đối chiếu ảnh render thật, không chỉ concept.

Online theo cấu hình Supabase Auth/Socket.IO hoặc Firebase Email/Password/Firestore; trong hub Monopoly legacy, bản thử chỉ là nhiều tab cùng browser origin, luôn có nhãn riêng. Backend Firebase cần kích hoạt/cấu hình riêng; Pages chỉ deploy frontend. Không xem emulator xanh hoặc bản thử là online hai thiết bị đã thành công.

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

[Plan02]( ../docs/game/plans/02-mobile-ui.md ) lưu ảnh HUD được duyệt: roster dưới căn giữa không nền, không tên game, action nổi giữa cạnh phải, highlight đổi theo người đến lượt. Bộ 24 trạng thái đã duyệt và UI preview đã implement; v1 bị bác bỏ không là chuẩn. Board 3D local đã có; backend gameplay Monopoly vẫn để bước sau.

## Tiêu chí thiết kế phiên chơi đã chốt

[Một diễn biến chung](../docs/game/shared-session-design.md) quy định: ngoài lượt chỉ quan sát diễn biến chung, không action/Tài sản hoặc Lịch sử; khởi tạo trade/xây/bán/thế chấp trong lượt/pha; người được chỉ định vẫn phản hồi trade/đấu giá hoặc nghĩa vụ chung ngoài lượt. Giao dịch xử lý lần lượt và thông báo kết quả chung. Đây là điều chỉnh tương tác được user chốt, khác quyền ngoài lượt trong rulebook; không thay kinh tế, không tự thêm timer/auto-forfeit hoặc quyết định topology thiết bị. Plan02B v1 đã bị bác bỏ; thẻ phải giữ design gốc và action gọn theo các chỉnh sửa, bộ trạng thái đã được chốt để implement UI preview.

## Mở HUD ván chơi

Chọn Xem trước HUD ván chơi ở home hoặc ?view=game; bánh răng chọn 24 trạng thái, query state giữ scenario khi reload. [Kiến trúc HUD](architecture/gameplay-ui.md) và [implementation contract](../docs/game/ui-implementation.md) ghi scope UI/local fixture, không gọi Firebase hoặc xử lý kinh tế có thẩm quyền, có board Three.js local và không movement text ở02. Các concept đã duyệt trong docs/design/game-states-*.png không thay test browser/điện thoại thật.

## Cài game như app

Home có Cài game/Cài lên điện thoại, native prompt hoặc hướng dẫn Android Chrome/iOS Safari. [PWA](operations/pwa.md) ghi manifest, scoped static cache, offline home/HUD và cập nhật tự kích hoạt; trang chỉ tự tải lại ở màn chính. Tài khoản/phòng vẫn cần mạng; app install không thay backend. Main khởi tạo/dispose installer cùng app.

## Shared mobile safe area

HUD foreground uses one `.game-safe` inset container with shared `--safe-*` tokens mapped to CSS env values; background remains full bleed. Cards size against container units, while landscape action/task regions scroll when height is constrained. Do not double-apply insets on HUD children. Browser tests simulate asymmetric cutouts and home indicators over all 24 states on dev/production; this is not physical-device verification.

## Local 3D board preview

The local ?view=game preview uses one Three.js renderer across HUD redraws, a shared40-space grid with2.2-deep tiles, outward-readable labels and buildings on inner property stripes. Focus follows the active fixture token; Overview supports orbit/pan/zoom. WebGL fallback preserves a flat board. No authoritative economy or multiplayer gameplay is added. Tests/board-layout.test.mjs and tests/board-browser.mjs cover geometry and real WebGL camera/lifecycle/fallback behavior on dev/production. Mobile physical-device verification remains pending.

## Selected target, current production unchanged

Lựa chọn đích là Vercel, Render và Supabase; Pages/Firebase vẫn là bản dự phòng. Runtime Supabase là opt-in qua cấu hình public; cutover frontend và kiểm chứng API trực tiếp chưa hoàn tất. Chi tiết nằm ở [hạ tầng](architecture/infrastructure-transition.md).


## Socket.IO và Supabase ở staging

Client nhận sự kiện qua WebSocket Socket.IO, không polling. Mỗi snapshot và mutation kiểm tra phiên đăng nhập/quyền PostgreSQL. Schema khóa hàng phòng cho join/start/leave; private tables không cấp quyền ghi trực tiếp. Database notification không chứa dữ liệu phòng. `npm run test:api` kiểm tra Auth, hai socket client và reconnect; `npm run test:postgres` kiểm tra quyền, cạnh tranh chỗ và thông báo sau commit trong database dùng một lần. Tham khảo [hướng dẫn hạ tầng](../docs/infrastructure.md).


## Frontend Auth và kiểm thử full stack

Kiểm thử Docker cô lập (`scripts/test-supabase.mjs`) dùng GoTrue, PostgREST và PostgreSQL thật, SMTP sink và hai browser context để xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production.

Cấu hình email redirect được giới hạn về origin Vercel đã duyệt qua VITE_AUTH_REDIRECT_URL; CA công khai của Supabase được pin cho listener trong khi giữ xác minh TLS/hostname. `npm run test:supabase` chạy stack dùng một lần và CI cũng gọi bài kiểm thử này. Kiểm thử local không tự chứng minh email thật đã đến hộp thư bên ngoài.

## Giới hạn biển và kiểm chứng

Supabase/Socket.IO giữ thế giới biển tạm thời trên **một API instance**, một phiên mỗi UID, tối đa 100 thuyền và push chỉ tới người đã vào biển. Restart/deploy xóa trạng thái thuyền; chưa scale nhiều instance. Firebase dùng tài liệu thuyền theo UID trong `monopolyHub/v1/oceanBoats` với rules chỉ cho chủ tài khoản ghi. Vị trí thuyền và kho cá lưu trên thiết bị; ví xu và bán cá chỉ có khi migration economy trong `supabase/pending` được áp dụng và `VITE_ECONOMY=on`. Kiểm thử hai browser local xác minh direct entry, chuyển động, câu cá, duplicate/leave/offline; API/rules production và điện thoại thật phải kiểm chứng riêng.
