---
type: operations
title: Phát triển mobile, kiểm tra và publish
description: Setup Node/Java, kiểm tra hub trên trình duyệt và emulator, publish Pages và kích hoạt Firebase riêng.
tags: [development, testing, deployment, mobile, firebase, openwiki]
sources:
  - id: openwiki-source-ab585d88aca3958f2aa6a541
    resource: repo://.codex/config.toml
  - id: openwiki-source-5f219f204b3e870beec929d9
    resource: repo://.github/workflows/pages.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-9b9ee78b093d5cd6376d5a80
    resource: repo://docs/game/plans/01-rules.md
  - id: openwiki-source-03d3729a6d1fb321fab7b6df
    resource: repo://docs/game/README.md
  - id: openwiki-source-9be48765f38483590a0034ef
    resource: repo://docs/game/rules/sources.md
  - id: openwiki-source-cc7175a0c3a0d5f1359efcc1
    resource: repo://docs/workflow.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-4c36e1d79dd002cc49e886f0
    resource: repo://scripts/test-rules.mjs
  - id: openwiki-source-554339f52225d7d8edff3ed0
    resource: repo://src/style.css
  - id: openwiki-source-d6f301bba4bff3a816376dbe
    resource: repo://tests/auth-browser.mjs
  - id: openwiki-source-23d81adb7ef7cfcf251d7e3a
    resource: repo://tests/diagnostics.test.mjs
  - id: openwiki-source-692b548971d3dc99c2c806f0
    resource: repo://tests/hub-browser.mjs
  - id: openwiki-source-be28d8122fde564d35ddd891
    resource: repo://tests/rules.test.mjs
generated: { by: "codex", at: "2026-11-03T16:50:23.899Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T16:55:28.050Z
---

# Phát triển mobile, kiểm tra và publish

## Setup và chạy

Dùng Node 24, npm 11 và Java 21. `npm ci` dùng lockfile; `npm run dev` chạy Vite. `npm run build` kiểm tra TypeScript trước đóng gói; `npm run preview` phục vụ bản dist hiện hành. Trong cloud home bị giới hạn ghi, dùng npm cache `/workspace/.npm-cache`; cache emulator có thể đặt qua `FIREBASE_EMULATORS_PATH=/workspace/.firebase-emulators` và config CLI qua `XDG_CONFIG_HOME=/workspace/.firebase-config`.

Browser helper ưu tiên `CHROMIUM_PATH`, Chromium hệ thống, rồi Playwright-managed Chromium. Cài browser nếu thiếu với `npx --no-install playwright-core install --with-deps chromium`. Các process dev/preview/emulator phải do runner sở hữu, không giả định còn sống sau khi publish môi trường.

## Kiểm chứng hub

`npm run check` gồm lint, format, unit transitions, typecheck/build, browser và Firestore rules tests. Runner browser mở dev/preview ở cổng trống rồi đóng đúng server do mình tạo. Test chủ yếu bắt đầu từ điện thoại ngang: tạo/tham gia, mã sai/phòng không tồn tại, hai tab, escape tên, reload, ready/unready, bắt đầu/đóng phòng và Auth lỗi có kiểm soát. Nó kiểm tra thêm 667×375, 844×390, 932×430, portrait 390×844 và desktop 1440×900; ảnh nằm dưới `test-results/` được ignore.

`npm run test:rules` dùng bộ tải chính thức Firebase để lấy JAR và kiểm tra size/checksum rồi mở Java emulator ở loopback/cổng trống. Rules tests dùng SDK với danh tính giả chỉ hợp lệ cho emulator; không ghi database thật. Các trường hợp gồm đổi host/capacity, thêm quá chỗ, xóa người khác, ghi status trực tiếp để vượt readiness, quyền host-only và hai transaction tranh chỗ cuối. Runner tránh lỗi proxy localhost của CLI/Node WebSocket SDK, vẫn giữ proxy/CA cho tải remote.

`tests/auth-browser.mjs` được runner rules chạy với Auth/Firestore emulators và Vite DEV-only. Hai browser contexts dùng Firebase SDK thật để đăng ký, lưu own profiles, tạo/tìm/tham gia phòng có tên, đăng xuất/đăng nhập sai/đúng và khôi phục phiên. Test chặn production requests.

Test xanh không chứng minh keyboard Safari, FPS hay trải nghiệm điện thoại thật. [Theme](../../docs/design/theme.md) yêu cầu kiểm tra ảnh render thực, vùng chạm 44px và safe areas. Các test biển/Havok không còn thuộc sản phẩm này.

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

AGENTS dẫn tới [game contract](../../docs/game/README.md), plan hiện hành và trang luật liên quan. Chỉ 01A của Plan 01 đang active cho tài liệu; phần khác giữ backlog. Không coi plan là cho phép implementation hoặc tự chọn renderer/backend/Blaze. Luật truyền thống Mỹ giữ tên đất, phải có đấu giá/trao đổi/thế chấp; không thêm house rules. Nguồn rulebook đã chốt G0009 US copyright 2025 theo S-002; số liệu và thẻ chưa đủ bằng chứng S-003 vẫn ghi unresolved. Đặc tả đã duyệt xác định hành vi mong đợi, source/test mô tả hiện trạng; sai lệch cần được xử lý chứ không sửa đặc tả để che bug.
