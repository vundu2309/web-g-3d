---
type: "Tham khảo"
title: "Chuyển hạ tầng: Supabase, Render, Vercel"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-17T08:18:15.877Z
sources:
  - id: openwiki-source-cb7a7ad14d0c42d3210d6e68
    resource: repo://.github/workflows/keep-api-awake.yml
  - id: openwiki-source-5fac766e13b3ef2b068894f7
    resource: repo://docs/decisions/0012-remove-firebase-and-monopoly.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-9e31e90300dccb65ecd460a0
    resource: repo://server/app.mjs
  - id: openwiki-source-68b2a3cf06e874a3bab2726b
    resource: repo://server/index.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-16ec70f90c57ae45d86eff47
    resource: repo://src/platform/economy.ts
  - id: openwiki-source-1c74d332bf7cf8b890868f54
    resource: repo://src/platform/supabase-client.ts
  - id: openwiki-source-dddda1d819c05adab55e9ba6
    resource: repo://src/platform/wake.ts
  - id: openwiki-source-55831e92f29f8b3e9d43f58b
    resource: repo://vercel.json
generated: { by: "claude-code", at: "2026-11-17T08:18:15.877Z" }
---


# Chuyển hạ tầng: Supabase, Render, Vercel

Game dùng ba dịch vụ, theo [decision 0006](../../docs/decisions/0006-infrastructure-transition.md). Firebase và game cờ tỷ phú đã bị gỡ khỏi repository theo [decision 0012](../../docs/decisions/0012-remove-firebase-and-monopoly.md) (2026-11-16). Trang này mô tả trạng thái trong source; việc dịch vụ live đang chạy đúng cấu hình chưa được kiểm chứng từ repository.

## Phân vai

| Dịch vụ | Việc thực tế trong source |
| --- | --- |
| Vercel | Build Vite (`npm run build` ra `dist`), PWA, và `vercel.json` đặt `Cache-Control: no-cache` cho `/sw.js`, `/index.html` và `/`. |
| Supabase | Email/Password Auth (xác nhận email, đặt lại mật khẩu) và PostgreSQL cho kinh tế qua RPC trong `supabase/migrations/20261113032223_economy.sql` (xem [kinh tế server](ocean-economy.md)). |
| Render | Dịch vụ `web-g-3d-api`: `npm run start:api` (`server/index.mjs`), lắng nghe `0.0.0.0:$PORT`, phục vụ `/health` và Socket.IO. |

Repository không chứa bảng phòng, RPC phòng hay listener PostgreSQL nào của API; `server/` không đọc cơ sở dữ liệu và không dùng `DATABASE_URL`.

## API trên Render

- `server/index.mjs` tạo API bằng `createApi` với `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` và `ALLOWED_ORIGINS` (danh sách origin, cách nhau bằng dấu phẩy). Thiếu `url`, `key` hoặc origin thì `createApi` ném lỗi `Missing API configuration`.
- `server/app.mjs` trả `/health` (200 khi sẵn sàng, 503 khi chưa), từ chối request có `Origin` không nằm trong danh sách với 403, và trả 404 cho mọi đường dẫn khác. CORS chỉ là phản hồi trình duyệt, không phải cơ chế phân quyền.
- Mọi token Socket.IO được xác thực bằng `/auth/v1/user` của Supabase (xem [hub](hub.md)). Tín hiệu từ chối là `AUTH_REQUIRED`; lỗi nhà cung cấp là `SERVICE_UNAVAILABLE`.
- `SIGTERM` đóng socket và HTTP, rồi thoát sau 25 giây nếu còn treo.
- Biển chung là trạng thái trong bộ nhớ của **một** instance (`server/ocean.mjs`). Khởi động lại sẽ xóa trạng thái; người chơi quay về hub và vào lại. Không scale ngang khi chưa có trạng thái mô phỏng dùng chung.

Free instance của Render có thể ngủ, và không có cam kết độ trễ. `.github/workflows/keep-api-awake.yml` gọi `/health` mỗi 5 phút theo lịch (biến `API_HEALTH_URL` ghi đè URL mặc định). GitHub có thể trễ hoặc tắt lịch sau 60 ngày không hoạt động, nên đây chỉ là biện pháp nỗ lực tốt nhất. Client gọi `wakeApi()` (`src/platform/wake.ts`) khi người chơi bấm vào hub.

## Cấu hình công khai

Frontend chỉ đọc các biến công khai sau (xem `.env.example`):

- `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`: thiếu thì hub báo dịch vụ đăng nhập chưa cấu hình (`src/platform/supabase-client.ts`).
- `VITE_API_URL`: thiếu thì biển báo chưa cấu hình kết nối; `wake.ts` và `ocean-socket.ts` đều phụ thuộc biến này.
- `VITE_AUTH_REDIRECT_URL`: đích của liên kết xác nhận email và đặt lại mật khẩu; mặc định là origin và đường dẫn hiện tại.
- `VITE_ECONOMY=on`: bật thị trường kinh tế (`src/platform/economy.ts`).

Render nhận `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` và `ALLOWED_ORIGINS`. Không đặt khóa quản trị hay service key vào biến `VITE_*`, source hay tài liệu. Không có provider nào được thay thế khi thiếu cấu hình.

## Xác nhận email

Bật hay tắt xác nhận email là cài đặt của dự án Supabase Auth, không nằm trong code. Client xử lý cả hai trường hợp (xem [hub](hub.md)). Trình gửi email mặc định của Supabase có giới hạn tốc độ, và giới hạn này cũng chặn đăng ký khi xác nhận đang bật. Tắt xác nhận làm mất bằng chứng địa chỉ email thuộc về người đăng ký; khi đó việc đặt lại mật khẩu gửi tới địa chỉ chưa được xác minh.

## Kiểm chứng

- `npm run test:api` chạy `tests/api.test.mjs`, `tests/socket.test.mjs` và `tests/ocean-socket.test.mjs`: kiểm tra `/health`, từ chối origin, cổng xác thực Socket.IO và giao thức biển với Socket.IO client thật.
- `tests/economy-postgres.sh` chạy kịch bản SQL kinh tế trong PostgreSQL dùng một lần; cần kết nối superuser tới server tạm, không bao giờ tới production.
- Browser test trả lời Supabase bằng bản giả (`tests/support/supabase-dev.mjs`).

Chưa có trong repository: kiểm chứng API đã triển khai trên Render, kiểm chứng từ chối Auth thật, và việc email xác nhận đến hộp thư thật. Các mục này cần chạy từ dịch vụ thật.

Supabase advisor chỉ báo cáo mức thông tin cho các schema riêng tư: các bảng riêng có RLS và không có policy, vì mọi quyền bảng đã bị thu hồi và các RPC đã xác thực thực thi phân quyền. Không thêm policy mở chỉ để tắt cảnh báo.

## Thay đổi lịch sử

Decision 0006 từng mô tả hướng chuyển phòng và membership sang PostgreSQL. Phần đó đã bị thay thế một phần bởi 0012: mã phòng và Firebase đã gỡ, và Supabase chỉ phục vụ Auth và kinh tế. Tài khoản Firebase cũ không đăng nhập được trong app; người chơi đăng ký mới trên Supabase.
