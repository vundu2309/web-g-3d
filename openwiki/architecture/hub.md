---
type: architecture
title: Kiến trúc hub và đồng bộ phòng
description: Luồng giao diện mobile, luật phòng thuần, adapter bản thử và
  Firebase, quyền truy cập và giới hạn trước khi có bàn chơi.
tags:
  - hub
  - rooms
  - mobile
  - firebase
  - architecture
sources:
  - id: openwiki-source-1207dc6dc9df1cc76b6da2de
    resource: repo://docs/diagnostics.md
  - id: openwiki-source-b26fdac5f2b9ba8a19fdd0f6
    resource: repo://docs/infrastructure.md
  - id: openwiki-source-701123ef063b2b49fc5126ba
    resource: repo://docs/pwa.md
  - id: openwiki-source-8acf8e92f9f7b465d02fa04b
    resource: repo://firestore.indexes.json
  - id: openwiki-source-60b51f83565a4de6497fc329
    resource: repo://firestore.rules
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-e40960a4e3d6b8d6193113c1
    resource: repo://scripts/service-worker.js
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-3cc44dcb42d14ad2fffb83f2
    resource: repo://src/app/account.ts
  - id: openwiki-source-2d276ab0949853064e1a4208
    resource: repo://src/app/diagnostics.ts
  - id: openwiki-source-32d34de3adc601eacf7364ad
    resource: repo://src/app/password-recovery.ts
  - id: openwiki-source-fdc97d585e693e9f422ad7ae
    resource: repo://src/app/pwa.ts
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
  - id: openwiki-source-25f090f2d86f09b560443170
    resource: repo://src/game-ui/render.ts
  - id: openwiki-source-a09d1fc6a11ce8c081c67432
    resource: repo://src/game-ui/style.css
  - id: openwiki-source-435a4eb0dedae12246227bd4
    resource: repo://src/hub/diagnostics.ts
  - id: openwiki-source-32927955437a252a5e197780
    resource: repo://src/hub/model.ts
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
  - id: openwiki-source-073cd1426719ad5862d4f152
    resource: repo://src/platform/demo.ts
  - id: openwiki-source-0eacf94e25ae0c7320c6f741
    resource: repo://src/platform/firebase.ts
  - id: openwiki-source-a2b90583a7b340fe72510d57
    resource: repo://src/platform/firestore-client.ts
  - id: openwiki-source-6475f92dc7ed4bc9b5b6546c
    resource: repo://src/platform/profile.ts
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
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
  - id: openwiki-source-be28d8122fde564d35ddd891
    resource: repo://tests/rules.test.mjs
  - id: openwiki-source-489032183ad2ac8548be7b60
    resource: repo://tests/safe-area-browser.mjs
generated: { by: "codex", at: "2026-11-04T09:34:07.893Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T09:38:50.588Z
---

# Kiến trúc hub và đồng bộ phòng

## Phạm vi và chủ sở hữu

Phố Tỷ Phú hiện là hub, chưa có bàn chơi hay kinh tế bất động sản. Entry `src/main.ts` nạp font/CSS và khởi động app. `src/app/start.ts` sở hữu DOM, form, chuyển màn, kết nối store và đăng ký theo dõi phòng. SVG nằm trong `src/ui/art.ts`; theme dùng CSS chung. Cảnh biển, Babylon và Havok đã được bỏ khỏi runtime.

Model `src/hub/model.ts` không phụ thuộc Firebase hay DOM: định nghĩa Room/Player, chuẩn hóa tên/mã, tạo phòng và xử lý lệnh trên bản sao dữ liệu. `src/hub/store.ts` chỉ định contract tạo, tham gia, cập nhật, theo dõi và dispose. Adapter hạ tầng không nhập ngược app; lint kiểm tra ranh giới này.

## Luồng vào phòng và trạng thái

Trang chính có danh tính player và hai lựa chọn tạo/tham gia. Online yêu cầu Firebase Email/Password: dialog riêng cung cấp đăng ký, đăng nhập, hiện/ẩn mật khẩu và reset. `src/app/account.ts` sở hữu dialog; `src/platform/account.ts` dùng SDK, còn `firebase-client.ts` khởi tạo app/config chung. Mật khẩu không lưu trong app database hoặc bảng local. Tên online lấy từ hồ sơ đã xác thực, không tin tên truyền từ form. Bản thử vẫn có tên cục bộ riêng. Sau khi store hoàn tất, app lưu mode/mã theo tab trong sessionStorage và theo dõi phòng. Reload khôi phục listener; phòng đóng hoặc mất tư cách thành viên đưa người dùng về trang chính kèm thông báo. Nội dung tên được escape trước khi ghép HTML.

Phòng có tên (title) và host bất biến, thời điểm tạo, sức chứa tối đa 2–4, status và players theo UID. Chỉ mục seats 0–3 ánh xạ ngược về UID để rules kiểm tra giới hạn chỗ và tư cách thành viên. Ghế/màu của người còn lại không bị đổi khi có người rời đi.

Host luôn sẵn sàng. Khách chỉ bật/tắt trạng thái của chính mình. Chỉ host bắt đầu; cần ít nhất hai người và mọi người hiện diện đã sẵn sàng, không cần lấp đầy tất cả chỗ trống. Host rời sẽ đóng phòng; khách chỉ xóa bản thân. Bắt đầu đổi status thành `started` và hiển thị rằng bàn chơi chưa được phát triển, không chạy một ván game giả.

## Đồng bộ và cạnh tranh

Online là mặc định; app khôi phục danh tính qua Firebase Auth Email/Password, không dùng anonymous. Hồ sơ chỉ chứa displayName/createdAt ở `monopolyHub/v1/profiles/<UID>` và chỉ chủ tài khoản đọc/ghi. Cloud Firestore `(default)` lưu profile và room documents. `onSnapshot` nhận cập nhật phòng; `runTransaction` đọc trạng thái rồi áp dụng command nguyên tử, thử lại contention tối đa năm lần. Hai lượt lấy chỗ cuối không cùng commit. Storage dùng server Timestamp, adapter đổi sang milliseconds cho model và giữ Timestamp gốc khi update. Transaction không xếp hàng offline như một setDoc tùy ý. `src/platform/profile.ts` đồng bộ own profile; `firestore-client.ts` khởi tạo database. Auth restore không kéo Firestore SDK vào màn home.

Bản thử là lựa chọn riêng có nhãn, chỉ dùng cùng browser origin. localStorage lưu phòng; Web Locks tuần tự hóa thay đổi, storage event thông báo các tab khác. Nó không kết nối điện thoại khác và không tự thay thế online khi lỗi. Phòng thử quá một ngày không cho tham gia mới.

## Quyền, vòng đời và giới hạn

Rules mặc định từ chối root và yêu cầu password-provider identity để đọc phòng/profile. Danh sách phòng cho phép truy vấn `where(status == waiting)`, `orderBy(createdAt, desc)`, `limit(50)` với composite index trong firestore.indexes.json; đọc không giới hạn bị từ chối. Màn Chọn phòng hiển thị title, host displayName, số chỗ và nút vào, giữ nhập mã như đường phụ. Lobby được hiển thị cho các player đã đăng nhập, không bảo đảm riêng tư như phòng bí mật. Schema/seat index, thông tin host bất biến, readiness và quyền bắt đầu được kiểm tra phía Firestore. `tests/rules.test.mjs` dùng emulator để thử cả ghi trực tiếp status nhằm vượt readiness, xóa người khác và tranh chỗ cuối bằng transaction.

Đổi UID đăng nhập hủy room store cũ; app dispose hủy DOM listeners, Auth observer, directory và room subscriptions; adapter bản thử gỡ storage listener. Đóng tab không tự rời phòng: chưa có presence, chuyển host hay dọn phòng bỏ quên. Người lưu trong roster không được coi là chắc chắn đang online. Trước gameplay cần thiết kế quyền lượt/tiền/xúc xắc phía server riêng.

Public Firebase config không có quyền quản trị. Backend hiện cần được kích hoạt/cấu hình riêng; [hướng dẫn vận hành](../operations/development.md) phân biệt Pages, emulator và Firebase thật.


## Kiểm chứng tài khoản

DEV-only emulator mode yêu cầu `import.meta.env.DEV` và cờ riêng; production không kích hoạt được nó. Runner mở Auth/Firestore emulators và Vite riêng. Hai browser contexts đăng ký/đăng nhập bằng SDK thật, đồng bộ own profile, tạo/tìm/tham gia phòng theo tên và kiểm tra reload/logout. Các test chặn request đến production Firebase. Build Pages không áp dụng Firestore rules/index và public app config không cấp quyền quản trị.


## Bảo toàn quyền ngoài hub

Rules triển khai bảo vệ riêng monopolyHub. Project trước đó có Test-mode wildcard hết hạn 2026-12-03; phần ngoài hub giữ đúng allowance cũ, nhưng wildcard mới loại trừ monopolyHub để không vượt các điều kiện Auth/schema. Không được chép lại wildcard toàn cục vì Firestore ghép các allow theo OR. Rules hiện là prototype đã qua kiểm tra emulator, không thay thế review trước phát hành rộng.


## Tách độ trễ hồ sơ khỏi danh sách phòng

Khởi tạo store chỉ xác nhận tài khoản, không đợi đồng bộ profile. Directory và room-resume listeners có thể bắt đầu ngay. Tạo/tham gia phòng đọc profile và room song song trước khi ghi, rồi commit cả hai trong một transaction. Không có commit profile riêng đứng trước commit room. Rules dùng getAfter để đối chiếu tên với profile sau commit. Store chỉ cache tên profile sau commit thành công; thao tác thất bại có thể thử lại. Dispose chặn việc khởi động lệnh phòng mới. Không coi thay đổi này là số đo latency trên điện thoại thật.

## Chẩn đoán độ trễ có chủ đích

Cờ URL `?diagnostics=1` bật dialog đo tạo/vào phòng. Trace thuần trong src/hub/diagnostics.ts giới hạn 100 samples mỗi thao tác; UI giữ năm báo cáo trong bộ nhớ, không tự upload. Các span SDK, session/token, đọc phòng/profile, transaction/commit, snapshot đầu và khung hình có thể chồng lấn. Adapter kiểm tra token riêng khi bật đo; việc này có thể làm ấm token nên không coi đây là timing thụ động hoàn toàn. Cached snapshot không chứng minh round trip server. Số callback transaction không phải mọi transport retry; commit gồm chờ SDK/mạng/backoff. Xem [hướng dẫn đo](../../docs/diagnostics.md) và [kiểm tra](../operations/development.md).

## HUD preview và cached roster

Trang chính/phòng started có lối vào [HUD preview](gameplay-ui.md), dữ liệu fixture local chứ không tự tạo ván cloud. Room watch dùng includeMetadataChanges; cached first room thiếu membership không đủ để trả người vừa join về home. Listener chờ server xác nhận absence, còn cached membership hợp lệ có thể hiển thị ngay. Suite Auth/Firestore emulator làm chậm listener sau directory cache để kiểm tra đường này.

## PWA và vòng đời shell

Test browser chạy thêm tests/pwa-browser.mjs trên build thật tại subpath /web-g-3d/. Kiểm tra icon/manifest, handler cài và hướng dẫn, offline home/lazy HUD, API không cache, worker waiting không ép reload và cleanup khi client đóng. Xem [PWA](../operations/pwa.md); chưa thay test cài OS thực tế.

## Shared mobile safe area

HUD foreground uses one `.game-safe` inset container with shared `--safe-*` tokens mapped to CSS env values; background remains full bleed. Cards size against container units, while landscape action/task regions scroll when height is constrained. Dialogs and the update notice also respect device insets. Do not double-apply insets on HUD children. Browser tests simulate asymmetric cutouts and home indicators over all24 states on dev/production; this is not physical-device verification.

## Confirmed update action

Waiting PWA updates never auto-reload; Cập nhật ngay requires confirmation and the requesting client to be the only window in scope before skipWaiting. Only that requester reloads on controllerchange; another window blocks apply with a visible message. Closing all clients still permits natural activation. Tests cover cancellation, two-window rejection, confirmed reload and notice disappearance. Old installed shells without this button must close all game tabs/windows once to load the new UI. No app removal or data clearing is needed.

## Local 3D board preview

The local ?view=game preview uses one Three.js renderer across HUD redraws, a shared40-space grid with2.2-deep tiles, outward-readable labels and buildings on inner property stripes. Focus follows the active fixture token; Overview supports orbit/pan/zoom. WebGL fallback preserves a flat board. No authoritative economy or multiplayer gameplay is added. Tests/board-layout.test.mjs and tests/board-browser.mjs cover geometry and real WebGL camera/lifecycle/fallback behavior on dev/production. Mobile physical-device verification remains pending.


## Socket.IO và Supabase ở staging

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Client nhận sự kiện qua WebSocket Socket.IO, không polling. Mỗi snapshot và mutation kiểm tra phiên đăng nhập/quyền PostgreSQL. Schema khóa hàng phòng cho join/start/leave; private tables không cấp quyền ghi trực tiếp. Database notification không chứa dữ liệu phòng. `npm run test:api` kiểm tra Auth, hai socket client và reconnect; `npm run test:postgres` kiểm tra quyền, cạnh tranh chỗ và thông báo sau commit trong database dùng một lần. Tham khảo [hướng dẫn hạ tầng](../../docs/infrastructure.md).


## Frontend Auth và kiểm thử full stack

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Cấu hình email redirect được giới hạn về origin Vercel đã duyệt qua VITE_AUTH_REDIRECT_URL; CA công khai của Supabase được pin cho listener trong khi giữ xác minh TLS/hostname. `npm run test:supabase` chạy stack dùng một lần và CI cũng gọi bài kiểm thử này. Kiểm thử local không tự chứng minh email thật đã đến hộp thư bên ngoài.
