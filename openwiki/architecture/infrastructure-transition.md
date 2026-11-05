---
type: Tham khảo
title: Target infrastructure transition
description: Ranh giới hạ tầng staging và kiểm chứng runtime của hub.
tags:
  - infrastructure
  - socketio
  - supabase
sources:
  - id: openwiki-source-b26fdac5f2b9ba8a19fdd0f6
    resource: repo://docs/infrastructure.md
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-32d34de3adc601eacf7364ad
    resource: repo://src/app/password-recovery.ts
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
generated: { by: "codex", at: "2026-11-04T09:34:07.893Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T09:38:50.588Z
---

# Target infrastructure transition

## Selected target, current production unchanged

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.


## Socket.IO và Supabase ở staging

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Client nhận sự kiện qua WebSocket Socket.IO, không polling. Mỗi snapshot và mutation kiểm tra phiên đăng nhập/quyền PostgreSQL. Schema khóa hàng phòng cho join/start/leave; private tables không cấp quyền ghi trực tiếp. Database notification không chứa dữ liệu phòng. `npm run test:api` kiểm tra Auth, hai socket client và reconnect; `npm run test:postgres` kiểm tra quyền, cạnh tranh chỗ và thông báo sau commit trong database dùng một lần. Tham khảo [hướng dẫn hạ tầng](../../docs/infrastructure.md).


## Frontend Auth và kiểm thử full stack

Runtime Supabase opt-in đã hoàn tất facade Auth, trạng thái chờ xác nhận email và màn đặt mật khẩu mới. Phòng dùng HTTP mutations có xác thực và Socket.IO WebSocket snapshots, PostgreSQL LISTEN/NOTIFY sau commit, tải lại khi reconnect và sessionStorage riêng theo provider. Firebase/Pages được giữ làm fallback, tài khoản Supabase mới cần đăng ký lại. Kiểm thử Docker cô lập dùng GoTrue/PostgREST/PostgreSQL thật, SMTP sink và hai browser xác minh email signup/recovery, vòng đời phòng, đổi mật khẩu, từ chối mật khẩu cũ và persistence; không gửi email hay ghi fixture lên production. Cấu hình và kiểm chứng deployment được ghi riêng, không đồng nhất source với cutover.

Cấu hình email redirect được giới hạn về origin Vercel đã duyệt qua VITE_AUTH_REDIRECT_URL; CA công khai của Supabase được pin cho listener trong khi giữ xác minh TLS/hostname. `npm run test:supabase` chạy stack dùng một lần và CI cũng gọi bài kiểm thử này. Kiểm thử local không tự chứng minh email thật đã đến hộp thư bên ngoài.
