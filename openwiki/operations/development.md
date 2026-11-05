---
type: operations
title: Phát triển mobile, kiểm tra và publish
description: Setup Node/Java, kiểm tra hub trên trình duyệt và emulator, publish
  Pages và kích hoạt Firebase riêng.
tags:
  - development
  - testing
  - deployment
  - mobile
  - firebase
  - openwiki
sources:
  - id: openwiki-source-ab585d88aca3958f2aa6a541
    resource: repo://.codex/config.toml
  - id: openwiki-source-5f219f204b3e870beec929d9
    resource: repo://.github/workflows/pages.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-e357e023868ea4db450d34ad
    resource: repo://docs/game/plans/02-mobile-ui.md
  - id: openwiki-source-03d3729a6d1fb321fab7b6df
    resource: repo://docs/game/README.md
  - id: openwiki-source-c932588d9fa043f7688a8026
    resource: repo://docs/game/rules/property-economics.md
  - id: openwiki-source-9be48765f38483590a0034ef
    resource: repo://docs/game/rules/sources.md
  - id: openwiki-source-e337f5bab9183e3a12f77158
    resource: repo://docs/game/shared-session-design.md
  - id: openwiki-source-63e8f904736888c1397b0a2b
    resource: repo://docs/game/ui-implementation.md
  - id: openwiki-source-b26fdac5f2b9ba8a19fdd0f6
    resource: repo://docs/infrastructure.md
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
  - id: openwiki-source-cc7175a0c3a0d5f1359efcc1
    resource: repo://docs/workflow.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-e40960a4e3d6b8d6193113c1
    resource: repo://scripts/service-worker.js
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-4c36e1d79dd002cc49e886f0
    resource: repo://scripts/test-rules.mjs
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
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
  - id: openwiki-source-dba8152f894fe338575ac7a6
    resource: repo://src/game-ui/model.ts
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-a09d1fc6a11ce8c081c67432
    resource: repo://src/game-ui/style.css
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
  - id: openwiki-source-77110d1e1f1125ab5211f920
    resource: repo://src/platform/pwa.ts
  - id: openwiki-source-554339f52225d7d8edff3ed0
    resource: repo://src/style.css
  - id: openwiki-source-d6f301bba4bff3a816376dbe
    resource: repo://tests/auth-browser.mjs
  - id: openwiki-source-956a523ed721749c7e5f092a
    resource: repo://tests/board-browser.mjs
  - id: openwiki-source-df13702d635f30aac30177fb
    resource: repo://tests/board-layout.test.mjs
  - id: openwiki-source-23d81adb7ef7cfcf251d7e3a
    resource: repo://tests/diagnostics.test.mjs
  - id: openwiki-source-bcd61b642f291bcc011c6bcd
    resource: repo://tests/game-ui-browser.mjs
  - id: openwiki-source-692b548971d3dc99c2c806f0
    resource: repo://tests/hub-browser.mjs
  - id: openwiki-source-9fce44ed27844f7179f12e69
    resource: repo://tests/ocean-browser.mjs
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
  - id: openwiki-source-be28d8122fde564d35ddd891
    resource: repo://tests/rules.test.mjs
  - id: openwiki-source-489032183ad2ac8548be7b60
    resource: repo://tests/safe-area-browser.mjs
generated: { by: "codex", at: "2026-11-05T03:32:21.077Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-05T03:59:28.286Z
---

# Phát triển mobile, kiểm tra và publish

## Setup và chạy

Dùng Node 24, npm 11 và Java 21. `npm ci` dùng lockfile; `npm run dev` chạy Vite. `npm run build` kiểm tra TypeScript trước đóng gói; `npm run preview` phục vụ bản dist hiện hành. Trong cloud home bị giới hạn ghi, dùng npm cache `/workspace/.npm-cache`; cache emulator có thể đặt qua `FIREBASE_EMULATORS_PATH=/workspace/.firebase-emulators` và config CLI qua `XDG_CONFIG_HOME=/workspace/.firebase-config`.

Browser helper ưu tiên `CHROMIUM_PATH`, Chromium hệ thống, rồi Playwright-managed Chromium. Cài browser nếu thiếu với `npx --no-install playwright-core install --with-deps chromium`. Các process dev/preview/emulator phải do runner sở hữu, không giả định còn sống sau khi publish môi trường.

## Kiểm chứng hub

`npm run check` gồm lint, format, unit, typecheck/build, browser, Firestore rules và API/Socket.IO tests. Các bài phòng cũ mở rõ `?view=monopoly-hub`; game mặc định là biển chung. Runner browser mở dev/preview ở cổng trống rồi đóng đúng server do mình tạo. Test chủ yếu bắt đầu từ điện thoại ngang: tạo/tham gia, mã sai/phòng không tồn tại, hai tab, escape tên, reload, ready/unready, bắt đầu/đóng phòng và Auth lỗi có kiểm soát. Nó kiểm tra thêm 667×375, 844×390, 932×430, portrait 390×844 và desktop 1440×900; ảnh nằm dưới `test-results/` được ignore.

`npm run test:rules` dùng bộ tải chính thức Firebase để lấy JAR và kiểm tra size/checksum rồi mở Java emulator ở loopback/cổng trống. Rules tests dùng SDK với danh tính giả chỉ hợp lệ cho emulator; không ghi database thật. Các trường hợp gồm đổi host/capacity, thêm quá chỗ, xóa người khác, ghi status trực tiếp để vượt readiness, quyền host-only và hai transaction tranh chỗ cuối. Runner tránh lỗi proxy localhost của CLI/Node WebSocket SDK, vẫn giữ proxy/CA cho tải remote.

`tests/auth-browser.mjs` được runner rules chạy với Auth/Firestore emulators và Vite DEV-only. Hai browser contexts dùng Firebase SDK thật để đăng ký, lưu own profiles, tạo/tìm/tham gia phòng có tên, đăng xuất/đăng nhập sai/đúng và khôi phục phiên. Test chặn production requests.

Test xanh không chứng minh keyboard Safari, FPS hay trải nghiệm điện thoại thật. [Theme](../../docs/design/theme.md) yêu cầu kiểm tra ảnh render thực, vùng chạm 44px và safe areas. Test biển mới tách riêng; Babylon/Havok cũ không được khôi phục.

## Publish Pages và Firebase

Workflow Pages chạy `npm run check` với Chromium trên PR/main/dispatch; PR không deploy; push chỉ upload dist và deploy khi commit range có trailer `Pages-Deploy: true`, manual dispatch là yêu cầu publish rõ ràng. CI cài Node 24 và Java 21. Workflow không tự sinh wiki. Vite dùng base tương đối, hỗ trợ đường dẫn `/web-g-3d/`.

Chỉ thay đổi có ảnh hưởng UI/UX mới cần deploy Pages. Agent đánh giá tác động quan sát được rồi thêm trailer `Pages-Deploy: true` khi cần; docs/plan/test/tooling hoặc sửa nội bộ không ảnh hưởng UI/UX vẫn commit/push và kiểm tra nhưng không đánh dấu deploy. Với bản cần deploy, theo dõi đúng SHA và đối chiếu asset public trước khi báo hoàn tất. Với bản không cần deploy, báo SHA đã push và Pages được giữ nguyên, không mô tả SHA đó là bản live. Branch protection là setting ngoài workflow.

Pages chỉ publish frontend. Firebase backend cần Email/Password Auth, Firestore `(default)`, rules namespace hub và composite index danh sách phòng. Public config không cho quyền quản trị; [Firebase setup](../../docs/firebase.md) ghi cụ thể cách áp dụng rules/index và ranh giới quyền quản trị. Khi áp dụng rules phải bảo toàn dữ liệu/quyền Movieapp khác. Bản thử nhiều tab và emulator không phải chứng cứ online hai thiết bị đã hoạt động.

## Ngữ cảnh cho AI và OpenWiki

`AGENTS.md` là entrypoint: nạp context theo tác vụ, ưu tiên điện thoại ngang và thiết kế đã duyệt, dẫn tới theme, architecture, workflow và Firebase. Giữ source/test thực thi làm nguồn sự thật; không coi wiki hoặc ảnh concept là quyền tự đổi sản phẩm.

MCP OpenWiki chạy qua `npx --no-install` trong `.codex/config.toml`; công cụ và dependency thuộc dev, không được nhập vào game. Cập nhật wiki qua lifecycle sau khi source ổn định; OpenWiki quản lý Claims/index/provenance. Không hand-edit các metadata đó hay tự gọi paid model. `npm run wiki:serve` mở reader local; `npm run wiki:export` xuất reader ignored, không tự deploy lên Pages.

[Kiến trúc hub](../architecture/hub.md) · [Bắt đầu](../quickstart.md).


Trước deploy backend phải đọc rules đang release và index hiện có. File hiện tại giữ allowance cũ ngoài monopolyHub và loại trừ hub khỏi wildcard; test regression xác nhận phần này. CLI phải có danh tính đã xác thực, không suy ra quyền admin từ public app config. Đối chiếu remote rules với file đã test và chờ index READY trước khi kết luận backend đã sẵn sàng.


Form tài khoản trên điện thoại ngang dùng bố cục compact; test Auth browser xác nhận nút đăng ký nằm trong khung dialog khi chưa mở bàn phím. Dialog vẫn cho cuộn khi viewport bị thu nhỏ bởi bàn phím.


Test Auth browser chặn RPC documents:batchGet trước khi mở directory. Danh sách phòng vẫn phải xuất hiện mà không có document batch read; sau khi chọn phòng, test mở lại đường đọc và xác nhận interceptor thực sự nhận RPC trước khi join thành công. Đây là kiểm tra phụ thuộc API, không phải benchmark mạng production.


Luồng create/join đầu tiên gộp profile với room trong một commit; rules dùng getAfter cho profile mới trong cùng giao dịch. Test browser đếm RPC commit khi tạo phòng lần đầu và xác nhận đúng một commit chứa cả hai document. Giữ kiểm tra này khi tối ưu latency, không thay bằng một timeout ngắn hơn hay bỏ kiểm tra quyền.

## Đo tạo/vào phòng trên máy gặp chậm

Mở Pages với `?diagnostics=1`, tạo hoặc tham gia phòng, rồi chọn **Chẩn đoán thời gian → Sao chép kết quả**. Bảng lưu tối đa năm thao tác trong RAM, không tự gửi dữ liệu và không ghi danh tính hay mã phòng. Reload xóa kết quả. Đo bắt đầu sau validation/chọn phòng, kết thúc sau snapshot đầu và hai animation frames; login ban đầu nằm ngoài phạm vi. Không cộng các dòng song song, không gán toàn bộ commit wait cho server hoặc kết luận vùng/billing là nguyên nhân khi chưa có phép đo. Token readiness có thêm getIdToken khi bật chẩn đoán.

Unit tests kiểm tra thời gian chồng lấn, mã lỗi an toàn, retry, giới hạn samples và kết thúc bất biến. Browser Auth/Firestore emulator cố ý trì hoãn commit 200 ms và kiểm tra bảng nhận được độ trễ đó, đồng thời guest không bật cờ không có nút chẩn đoán. Đây là kiểm tra công cụ đo, không đo latency production. Xem [hướng dẫn đầy đủ](../../docs/diagnostics.md).

## Quy ước đặc tả luật cho AI

AGENTS dẫn tới [game contract](../../docs/game/README.md), [Plan 02 hiện hành](../../docs/game/plans/02-mobile-ui.md) và trang luật liên quan. Bộ 24 trạng thái HUD đã được duyệt và implement thành preview; chưa mở engine/backend. Plan 01 đã bàn giao baseline và tạm dừng nghiên cứu, các khoảng trống luật/số liệu giữ lại trước gameplay. Không coi plan là cho phép implementation hoặc tự chọn renderer/backend/Blaze. Luật truyền thống Mỹ giữ tên đất, phải có đấu giá/trao đổi/thế chấp; không tự thêm house rules; điều chỉnh tương tác theo lượt đã được người dùng chốt. Nguồn rulebook đã chốt G0009 US copyright 2025 theo S-002; số liệu và thẻ chưa đủ bằng chứng S-003 vẫn ghi unresolved. Đặc tả đã duyệt xác định hành vi mong đợi, source/test mô tả hiện trạng; sai lệch cần được xử lý chứ không sửa đặc tả để che bug.

## Giảm chi phí đối chiếu luật và bảng giá

[Game contract](../../docs/game/README.md) và AGENTS yêu cầu ưu tiên nguồn text, kiểm tra theo bảng có revision. Luật theo Hasbro; bảng cộng đồng được dùng có ghi giới hạn edition. Chỉ xem ảnh khi có câu hỏi cụ thể mà text thiếu/mâu thuẫn; giữ bằng chứng đã có, không render lại thẻ hoặc lặp gallery bị chặn khi chưa có nguồn mới. Gom unresolved thành một danh sách và tiếp tục phần độc lập; không biến dữ liệu tham khảo thành số G0009 đã xác minh.

## HUD được duyệt và tác vụ hiện hành

[Plan02]( ../../docs/game/plans/02-mobile-ui.md ) lưu ảnh HUD được duyệt: roster dưới căn giữa không nền, không tên game, action nổi giữa cạnh phải, highlight đổi theo người đến lượt. Bộ 24 trạng thái đã duyệt và UI preview đã implement; v1 bị bác bỏ không là chuẩn. Board3D/backend gameplay còn để bước sau.

## Tiêu chí thiết kế phiên chơi đã chốt

[Một diễn biến chung](../../docs/game/shared-session-design.md) quy định: ngoài lượt chỉ quan sát diễn biến chung, không action/Tài sản hoặc Lịch sử; khởi tạo trade/xây/bán/thế chấp trong lượt/pha; người được chỉ định vẫn phản hồi trade/đấu giá hoặc nghĩa vụ chung ngoài lượt. Giao dịch xử lý lần lượt và thông báo kết quả chung. Đây là điều chỉnh tương tác được user chốt, khác quyền ngoài lượt trong rulebook; không thay kinh tế, không tự thêm timer/auto-forfeit hoặc quyết định topology thiết bị. Plan02B v1 đã bị bác bỏ; thẻ phải giữ design gốc và action gọn theo các chỉnh sửa, bộ trạng thái đã được chốt để implement UI preview.

## Kiểm chứng UI preview 24 trạng thái

Runner browser chạy thêm tests/game-ui-browser.mjs trên dev và production:24 scenario ở667×375,844×390,932×430, touch44px/icon<=18px, không đè roster, observer/response, fixed bid và trade không input, offline/reload. Unit tests game-ui kiểm tra permissions, increments và moving không text. Đây là UI preview không gọi Firebase; không phải engine hoặc multiplayer ván thật. Xem [kiến trúc HUD](../architecture/gameplay-ui.md).

## PWA production checks

Test browser chạy thêm tests/pwa-browser.mjs trên build thật tại subpath /web-g-3d/. Kiểm tra icon/manifest, handler cài và hướng dẫn, offline home/lazy HUD, API không cache, worker waiting không ép reload và cleanup khi client đóng. Xem [PWA](pwa.md); chưa thay test cài OS thực tế.

## Shared mobile safe area

HUD foreground uses one `.game-safe` inset container with shared `--safe-*` tokens mapped to CSS env values; background remains full bleed. Cards size against container units, while landscape action/task regions scroll when height is constrained. Dialogs and the update notice also respect device insets. Do not double-apply insets on HUD children. Browser tests simulate asymmetric cutouts and home indicators over all24 states on dev/production; this is not physical-device verification.

## Confirmed update action

Waiting PWA updates never auto-reload; Cập nhật ngay requires confirmation and the requesting client to be the only window in scope before skipWaiting. Only that requester reloads on controllerchange; another window blocks apply with a visible message. Closing all clients still permits natural activation. Tests cover cancellation, two-window rejection, confirmed reload and notice disappearance. Old installed shells without this button must close all game tabs/windows once to load the new UI. No app removal or data clearing is needed.

## Local 3D board preview

The local ?view=game preview uses one Three.js renderer across HUD redraws, a shared40-space grid with2.2-deep tiles, outward-readable labels and buildings on inner property stripes. Focus follows the active fixture token; Overview supports orbit/pan/zoom. WebGL fallback preserves a flat board. No authoritative economy or multiplayer gameplay is added. Tests/board-layout.test.mjs and tests/board-browser.mjs cover geometry and real WebGL camera/lifecycle/fallback behavior on dev/production. Mobile physical-device verification remains pending.

## Selected target, current production unchanged

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.


## Socket.IO và Supabase ở staging

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Client nhận sự kiện qua WebSocket Socket.IO, không polling. Mỗi snapshot và mutation kiểm tra phiên đăng nhập/quyền PostgreSQL. Schema khóa hàng phòng cho join/start/leave; private tables không cấp quyền ghi trực tiếp. Database notification không chứa dữ liệu phòng. `npm run test:api` kiểm tra Auth, hai socket client và reconnect; `npm run test:postgres` kiểm tra quyền, cạnh tranh chỗ và thông báo sau commit trong database dùng một lần. Tham khảo [hướng dẫn hạ tầng](../../docs/infrastructure.md).


## Frontend Auth và kiểm thử full stack

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Cấu hình email redirect được giới hạn về origin Vercel đã duyệt qua VITE_AUTH_REDIRECT_URL; CA công khai của Supabase được pin cho listener trong khi giữ xác minh TLS/hostname. `npm run test:supabase` chạy stack dùng một lần và CI cũng gọi bài kiểm thử này. Kiểm thử local không tự chứng minh email thật đã đến hộp thư bên ngoài.

## Hồi quy biển chung

[Biển chung](../architecture/ocean.md) có unit cho di chuyển/spawn/payload, Socket.IO client thật cho push/ownership/duplicate và hai tài khoản Firebase emulator cho direct entry, chuyển động, câu cá, viewport mobile, reload, rời và offline. `npm run test:supabase` thêm hai browser vào map qua Supabase Auth/Socket.IO sau khi giữ nguyên kiểm tra account/phòng/recovery. Ảnh render dưới `test-results/ocean-*.png` và `supabase-ocean.png`; không dùng ảnh concept làm bằng chứng. Backend Render cần có handler biển và một instance; Firebase cần rules mới riêng. Check local không chứng minh cross-device production.
