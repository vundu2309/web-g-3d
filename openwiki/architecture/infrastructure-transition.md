---
type: Tham khảo
title: Target infrastructure transition
description: Ranh giới hạ tầng staging và kiểm chứng runtime của hub.
tags:
  - infrastructure
  - socketio
  - supabase
sources:
  - id: openwiki-source-18fc7b64e66932d83fa70cfc
    resource: repo://docs/ocean.md
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-32d34de3adc601eacf7364ad
    resource: repo://src/app/password-recovery.ts
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
  - id: openwiki-source-33c878cb026122d0ff89d417
    resource: repo://src/platform/ocean.ts
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
---

# Target infrastructure transition

## Selected target, current production unchanged

Lựa chọn đích là Vercel (frontend/PWA), Render (API) và Supabase (Auth/PostgreSQL) theo [quyết định 0006](../../docs/decisions/0006-infrastructure-transition.md). Runtime Supabase chỉ là opt-in qua cấu hình public: facade Auth có trạng thái chờ xác nhận email và màn đặt mật khẩu mới; phòng dùng HTTP mutations kèm Bearer access token và Socket.IO snapshots, còn PostgreSQL LISTEN/NOTIFY nằm ở server. Firebase/Pages vẫn là fallback và tài khoản Supabase mới cần đăng ký lại. Cutover frontend và kiểm chứng API trực tiếp chưa hoàn tất; migration economy nằm trong `supabase/pending` và chưa áp dụng.


## Socket.IO và Supabase ở staging

Client nhận sự kiện qua WebSocket Socket.IO, không polling. Mỗi snapshot và mutation kiểm tra phiên đăng nhập/quyền PostgreSQL. Schema khóa hàng phòng cho join/start/leave; private tables không cấp quyền ghi trực tiếp. Database notification không chứa dữ liệu phòng. `npm run test:api` kiểm tra Auth, hai socket client và reconnect; `npm run test:postgres` kiểm tra quyền, cạnh tranh chỗ và thông báo sau commit trong database dùng một lần. Tham khảo [hướng dẫn hạ tầng](../../docs/infrastructure.md).


## Frontend Auth và kiểm thử full stack

Kiểm thử Docker cô lập (`scripts/test-supabase.mjs`) dùng GoTrue, PostgREST và PostgreSQL thật, SMTP sink và hai browser context để xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Cấu hình email redirect được giới hạn về origin Vercel đã duyệt qua VITE_AUTH_REDIRECT_URL; CA công khai của Supabase được pin cho listener trong khi giữ xác minh TLS/hostname. `npm run test:supabase` chạy stack dùng một lần và CI cũng gọi bài kiểm thử này. Kiểm thử local không tự chứng minh email thật đã đến hộp thư bên ngoài.

## Biển chung được tách khỏi phòng

Game hiện hành là [biển đánh cá](ocean.md), vào thẳng map chung sau xác thực. Adapter chọn cùng provider với tài khoản. Cấu hình Supabase dùng `ocean:command` và `ocean:state` trên Socket.IO, chỉ broadcast cho socket đã vào biển; server kiểm tra lại Auth và một phiên thuyền cho mỗi UID. Trạng thái biển nằm trong RAM của **một API instance**, reset khi deploy/restart; chưa đồng bộ nhiều instance hoặc lưu cá/kinh tế. PostgreSQL LISTEN/NOTIFY tiếp tục thuộc hub phòng cũ, không được mô tả là đồng bộ biển này. Cấu hình Firebase có lease thuyền riêng và cần rules riêng. Kiểm thử local hai browser cho cả hai adapter không chứng minh backend production đã triển khai.

Xem [hợp đồng biển](../../docs/ocean.md), [server](../../server/ocean.mjs) và [quyết định](../../docs/decisions/0007-shared-fishing-sea.md).
