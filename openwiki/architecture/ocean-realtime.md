---
type: "Tham khảo"
title: "Biển realtime: Socket.IO, server và đồng bộ"
openwiki_generated: true
sources:
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-da299de568c1622268f94e39
    resource: repo://src/platform/ocean-socket.ts
generated: { by: "claude-code", at: "2026-11-17T08:18:15.877Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T02:01:25.414Z
---


# Biển realtime: Socket.IO, server và đồng bộ

Biển chung là một Socket.IO server trên API Render. Mỗi người chơi có một thuyền; client mô phỏng thuyền của mình và gửi tư thế (`pose`), server chỉ chuyển tiếp. Trạng thái nằm trong bộ nhớ của **một** tiến trình API, nên khởi động lại hay deploy sẽ xóa biển và người chơi vào lại. Không có PostgreSQL hay Firebase nào tham gia vào biển.

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Khởi động | `server/index.mjs` | Đọc `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS`, lắng nghe `PORT`, xử lý `SIGTERM`. |
| HTTP và CORS | `server/app.mjs` | `createApi`: `/health`, từ chối origin lạ, gắn `attachSockets` và `attachOcean`. |
| Xác thực kết nối | `server/socket.mjs` | Middleware Socket.IO: token bắt buộc, tối đa 8192 ký tự, xác thực qua Supabase. |
| Biển | `server/ocean.mjs` | Trạng thái thuyền, tick gửi, giới hạn tốc độ, kiểm tra lại phiên, giao thức 1 và 2. |
| Client | `src/platform/ocean-socket.ts` | Kết nối WebSocket, lệnh `join`, gửi tư thế, nhận snapshot và delta. |
| Kết nối và kết nối lại | `src/ocean/connect.ts`, `src/app/ocean.ts` | Phân loại lỗi, thử lại trong tối đa 90 giây. |
| Nội suy thuyền khác | `src/ocean/remote.ts` | Lưu tối đa 12 mẫu mỗi thuyền và phát lại trễ một chút. |

## Xác thực

- `server/socket.mjs` từ chối kết nối nếu token không phải chuỗi, quá 8192 ký tự, hoặc Supabase không xác nhận. Lỗi có mã `AUTH_REQUIRED` (token sai hoặc hết hạn) hoặc `SERVICE_UNAVAILABLE` (API chưa sẵn sàng, hoặc nhà cung cấp Auth lỗi).
- `server/app.mjs` gọi `/auth/v1/user` và coi người dùng ẩn danh là chưa đăng nhập. `socket.data.uid` lấy từ kết quả xác thực, không lấy từ client.
- Khi đã vào biển, server kiểm tra lại phiên mỗi 60 giây (`authRecheckMs`). Nếu token bị thu hồi, server gửi `ocean:error` rồi ngắt. Lỗi tạm của nhà cung cấp Auth không làm kết thúc trò chơi.
- Token mới được gửi trên kết nối đang mở qua `ocean:token`, giới hạn một lần mỗi 2 giây, để phiên sống quá thời hạn token đầu (khoảng một giờ).

## Vào biển

Client gửi `ocean:command` với `action: "join"` và `proto: 2`. Server:

1. Kiểm tra `ready()`; nếu chưa sẵn sàng thì trả lỗi “đang kết nối lại”.
2. Xác thực lại token một lần khi vào; người dùng khác với `socket.data.uid` bị ngắt.
3. Từ chối khi biển đã đủ `MAX_BOATS` = 100 thuyền và tài khoản chưa có thuyền.
4. Nếu tài khoản đã có thuyền ở cửa sổ khác, thuyền cũ nhận `ocean:error` rồi rời phòng: một tài khoản chỉ có một thuyền.
5. Tạo tư thế bắt đầu bằng `spawn(uid)` (`src/ocean/model.ts`), tên hiển thị được cắt tối đa 24 ký tự.
6. Gửi `ocean:state` đầy đủ cho giao thức 2, rồi trả về `pose`, `sendMs` (= `tickMs`, 200 ms) và `delayMs` (= 2,5 chu kỳ tick).

Giao thức 1 (client cũ đã cache) vẫn được hỗ trợ: nhận `ocean:state` đầy đủ và lệnh `move` có xác nhận, với khoảng cách tối thiểu 400 ms. Client không báo giao thức 2 sẽ không nhận `ocean:delta`.

## Gửi và nhận

- Giao thức 2: `ocean:move` không có xác nhận; tư thế đến quá nhanh bị bỏ, tư thế mới hơn sẽ thay. Khoảng cách tối thiểu giữa hai lần chấp nhận là 100 ms (`minMoveMs`).
- Mỗi tick (200 ms) server gửi `ocean:delta` cho phòng `ocean:v2` chỉ gồm thuyền mới (`add`), thuyền đã đổi (`up`, dạng mảng `[uid, x, z, heading, fishing, updatedAt]`) và thuyền rời biển (`gone`). Client giữ bản đồ thuyền và gọi `onBoats` với toàn bộ bản đồ.
- Tư thế được kiểm tra: đúng bốn khóa `fishing, heading, x, z`; `x` và `z` là số hữu hạn với `|x|, |z| ≤ SEA_BOUND` (1500); `|heading| ≤ π`; `fishing` là boolean. Vị trí không hợp lệ bị bỏ hoặc trả lỗi.
- Phòng `ocean:shared` nhận `ocean:state` đầy đủ cho client giao thức 1.

Tick chạy khi có thuyền và dừng khi biển trống, nên một instance rảnh không chạy vòng lặp gửi.

## Ngắt kết nối và kết nối lại

- `connect.ts` và `ocean-socket.ts` tắt kết nối tự động của Socket.IO (`reconnection: false`) để việc thử lại được kiểm soát ở đúng một chỗ. Khi mất kết nối, `ocean-socket.ts` báo “Mất kết nối biển chung” và trả lỗi qua `onError`.
- `src/app/ocean.ts` tự kết nối lại khi rớt giữa chừng, cùng một thuyền và vị trí, trong tối đa 90 giây (`deadlineMs`). Các lỗi không thể thử lại (đăng xuất, biển đủ người, bị giành chỗ ở cửa sổ khác) hiện ngay với lý do.
- `AUTH_REQUIRED` của handshake và token hết hạn không được thử lại theo cách mù quáng: phiên phải được làm mới trước.
- Khi client vào lại từ hub, `reconnecting` được đặt lại và biển mới được tạo; không có trạng thái cũ nào được lưu trên server.

## Giới hạn và rủi ro

- Biển chỉ tồn tại trong một tiến trình. Scale ngang sẽ làm người chơi trên các instance khác không thấy nhau; không được scale khi chưa có trạng thái và phát sóng dùng chung.
- Free instance của Render có thể ngủ và cắt mọi kết nối; xem [hạ tầng](infrastructure-transition.md).
- Không có tiền thưởng hay trạng thái bền vững trong biển: kinh tế đi qua RPC riêng (xem [kinh tế biển](ocean-economy.md)).
- Độ trễ và độ mượt trên mạng thật chưa được đo trên điện thoại thật.

## Kiểm thử

- `npm run test:api` chạy `tests/api.test.mjs`, `tests/socket.test.mjs` và `tests/ocean-socket.test.mjs`: kiểm tra `/health`, từ chối origin, cổng xác thực Socket.IO và giao thức biển với Socket.IO client thật.
- `tests/ocean.test.mjs` kiểm tra logic biển thuần; việc nội suy thuyền khác (`src/ocean/remote.ts`) không có file test riêng trong `tests/`.
- Browser test của biển dùng Supabase giả (`scripts/test-browser.mjs` đặt `VITE_SUPABASE_URL` giả).
