---
type: "Tham khảo"
title: "Bắt đầu với biển chung Ra khơi"
openwiki_generated: true
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5fac766e13b3ef2b068894f7
    resource: repo://docs/decisions/0012-remove-firebase-and-monopoly.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-53a7956f9c70e8affa248a45
    resource: repo://scripts/qa.mjs
  - id: openwiki-source-10f3f3e9db8fffece78a1ca6
    resource: repo://src/app/harbor.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
generated: { by: "claude-code", at: "2026-11-20T02:01:25.414Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T02:01:25.414Z
---


# Bắt đầu với biển chung Ra khơi

Repository hiện chứa một trò chơi: thuyền câu cá trên một biển chung, mỗi tài khoản một thuyền. Board game Phố Tỷ Phú, phòng, sảnh chờ và Firebase đã được gỡ bỏ theo [decision 0012](../docs/decisions/0012-remove-firebase-and-monopoly.md). Không có fallback provider: thiếu cấu hình thì ứng dụng báo lỗi.

Quyết định nền: [biển chung](../docs/decisions/0007-shared-fishing-sea.md), [Babylon.js và Havok](../docs/decisions/0008-babylon-havok-boat-physics.md), [kinh tế server](../docs/decisions/0010-server-economy.md), [hạ tầng](../docs/decisions/0006-infrastructure-transition.md).

## Cần đọc theo tác vụ

| Tác vụ | Đọc trước | Ghi chú |
| --- | --- | --- |
| Hub, đăng nhập, cổng vào biển | [hub](architecture/hub.md) | `src/app/harbor.ts`, `src/app/account.ts`, `src/platform/account.ts` |
| Biển, thuyền, điều khiển | [biển chung](architecture/ocean.md) | `src/app/ocean.ts`, `src/ocean/babylon-scene.ts`, `src/ocean/model.ts` |
| Hình ảnh biển, đảo, nước | [render biển](architecture/ocean-rendering.md) | Ranh giới CPU và GPU, bộ điều tiết tốc độ vẽ |
| Câu cá, cuộc giằng co, cần và dây | [câu cá](architecture/ocean-fishing.md) | `src/ocean/fishing.ts`, `src/ocean/fight.ts` |
| Socket.IO, server, kết nối lại | [realtime](architecture/ocean-realtime.md) | `server/ocean.mjs`, `src/platform/ocean-socket.ts` |
| Xu, chợ cá, RPC | [kinh tế biển](architecture/ocean-economy.md) | Migration đã áp dụng là lịch sử |
| Vercel, Render, Supabase, biến môi trường | [hạ tầng](architecture/infrastructure-transition.md) | Chỉ biến `VITE_*` công khai ở frontend |
| Mô hình 3D và bảng màu | [mô hình 3D](operations/art-pipeline.md) | `tools/blender`, `public/models` |
| Cài PWA, offline, cập nhật | [PWA](operations/pwa.md) | Không ép reload phiên đang chơi |
| Thêm việc mỗi khung hình, đo hiệu năng | [hiệu năng](operations/performance.md) | Ngân sách, công tắc `?…=0`, cách báo cáo chi phí |
| Kiểm tra, worktree, phát hành | [phát triển](operations/development.md) | Node 24, `npm run check`, `scripts/qa.mjs` |

## Chạy và kiểm tra

- Cài đặt: `npm ci` với Node 24. Chạy: `npm run dev`. Build: `npm run build`.
- Kiểm tra cơ bản đã được yêu cầu trong dự án: `npm run format:check`, `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, và các browser test của phần đã đổi bằng `node scripts/qa.mjs <tên>`. `npm run check` là bộ đầy đủ.
- Cấu hình công khai để chạy biển: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`; tùy chọn `VITE_AUTH_REDIRECT_URL` và `VITE_ECONOMY=on`.

## Ranh giới cần nhớ

- Biển, thuyền và cá là phía client; cá bắt được là báo cáo của client, không phải phần thưởng có thẩm quyền. Xu và chợ đi qua RPC của Supabase với giới hạn trong database.
- Trạng thái biển chỉ tồn tại trên một instance API; không scale khi chưa có trạng thái dùng chung.
- Vị trí, kho cá và số cá lưu trên thiết bị (localStorage), không phải trên tài khoản.
- Mọi kiểm tra trong repository là test đơn vị, Socket.IO thật, và trình duyệt với Supabase và API giả. Chưa có kiểm chứng trên điện thoại thật, trên Supabase hay Render đã triển khai, hay cài đặt PWA thật.

## Phát hành

Mọi push lên `main` deploy production qua Vercel theo `AGENTS.md`; thay đổi UI/UX cần theo dõi build cho đúng commit đến khi deploy xong. Workflow `.github/workflows/pages.yml` vẫn còn và chỉ publish khi push có trailer `Pages-Deploy: true` hoặc dispatch thủ công. Thay đổi không ảnh hưởng UI không được coi là đã lên production.
