---
type: Tham khảo
title: Target infrastructure transition
description: Ranh giới hạ tầng staging và kiểm chứng runtime của hub.
tags:
  - infrastructure
  - socketio
  - supabase
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T08:51:23.933Z
sources:
  - id: openwiki-source-b26fdac5f2b9ba8a19fdd0f6
    resource: repo://docs/infrastructure.md
  - id: openwiki-source-815fd09a9443c0dae46b118a
    resource: repo://server/notifications.mjs
  - id: openwiki-source-2c932c82640807a2da8d8358
    resource: repo://server/socket.mjs
  - id: openwiki-source-2a80fab523f1197e079cba62
    resource: repo://src/platform/api.ts
  - id: openwiki-source-251f2e8a88e22f47e29d5975
    resource: repo://src/platform/online-config.ts
generated: { by: "codex", at: "2026-11-04T08:51:23.933Z" }
---

# Target infrastructure transition

## Selected target, current production unchanged

Hạ tầng đích đã có API Socket.IO, schema PostgreSQL private và adapter Supabase opt-in trong source. PostgreSQL LISTEN/NOTIFY đẩy invalidation sau commit tới từng API instance; reconnect tải lại snapshot có xác thực. Đây là staging: cần DATABASE_URL trên Render và kiểm chứng Auth/callbacks trước cutover; mặc định frontend vẫn dùng Firebase và người dùng chọn đăng ký tài khoản Supabase mới.


## Socket.IO và Supabase ở staging

Hạ tầng đích đã có API Socket.IO, schema PostgreSQL private và adapter Supabase opt-in trong source. PostgreSQL LISTEN/NOTIFY đẩy invalidation sau commit tới từng API instance; reconnect tải lại snapshot có xác thực. Đây là staging: cần DATABASE_URL trên Render và kiểm chứng Auth/callbacks trước cutover; mặc định frontend vẫn dùng Firebase và người dùng chọn đăng ký tài khoản Supabase mới.

Client nhận sự kiện qua WebSocket Socket.IO, không polling. Mỗi snapshot và mutation kiểm tra phiên đăng nhập/quyền PostgreSQL. Schema khóa hàng phòng cho join/start/leave; private tables không cấp quyền ghi trực tiếp. Database notification không chứa dữ liệu phòng. `npm run test:api` kiểm tra Auth, hai socket client và reconnect; `npm run test:postgres` kiểm tra quyền, cạnh tranh chỗ và thông báo sau commit trong database dùng một lần. Tham khảo [hướng dẫn hạ tầng](../../docs/infrastructure.md).
