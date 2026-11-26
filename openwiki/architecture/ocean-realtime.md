---
type: "Tham khảo"
title: "Biển realtime: Socket.IO, server và đồng bộ"
description: "Biển chung là một Socket.IO server trên API Render, trạng thái trong bộ nhớ của một tiến trình: xác thực token Supabase, vào biển, giao thức 2 (delta mỗi 200 ms) và giao thức 1 cũ, kiểm tra lại phiên, làm mới token, cấp lại tầng thuyền và thuyền đậu, và kết nối lại trong 90 giây."
tags:
  - ocean
  - socket-io
  - realtime
  - render
  - auth
  - architecture
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
sources:
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-da299de568c1622268f94e39
    resource: repo://src/platform/ocean-socket.ts
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---

# Biển realtime: Socket.IO, server và đồng bộ

Biển chung là một Socket.IO server trên API Render. Mỗi người chơi có một thuyền; client mô phỏng thuyền của mình và gửi tư thế (`pose`), server chỉ chuyển tiếp. Trạng thái nằm trong bộ nhớ của **một** tiến trình API, nên khởi động lại hay deploy sẽ xóa biển và người chơi vào lại. Server không giữ trạng thái biển trong cơ sở dữ liệu; nó chỉ đọc Supabase để xác thực, để biết tầng thuyền và cần (`loadoutOf`) và để đọc thuyền đậu (`parkedOf`), luôn bằng token của người chơi.

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Khởi động | `server/index.mjs` | Đọc `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS`, lắng nghe `PORT`, xử lý `SIGTERM`. |
| HTTP và CORS | `server/app.mjs` | `createApi`: `/health`, từ chối origin lạ, gắn `attachSockets` và `attachOcean`; cung cấp `authenticate`, `loadoutOf` và `parkedOf`. |
| Xác thực kết nối | `server/socket.mjs` | Middleware Socket.IO: token bắt buộc, tối đa 8192 ký tự, xác thực qua `authenticate`. |
| Biển | `server/ocean.mjs` | Trạng thái thuyền, tick gửi, giới hạn tốc độ, kiểm tra lại phiên, làm mới token, cấp lại tầng thuyền, thuyền đậu, giao thức 1 và 2. |
| Client | `src/platform/ocean-socket.ts` | Kết nối Socket.IO (`reconnection: false`), lệnh `ocean:command`, gửi `ocean:move`, nhận `ocean:state` và `ocean:delta`. |
| Kết nối và kết nối lại | `src/ocean/connect.ts`, `src/app/ocean.ts` | Phân loại lỗi và thử lại trong tối đa 90 giây. |
| Nội suy thuyền khác | `src/ocean/remote.ts` | Giữ tối đa 12 mẫu mỗi thuyền và phát lại trễ một chút giữa hai mẫu. |

## Xác thực

- `server/socket.mjs` từ chối kết nối nếu token không phải chuỗi hoặc quá 8192 ký tự, hoặc nếu `authenticate` không trả người dùng. Lỗi có mã `AUTH_REQUIRED` (token sai, hết hạn, hoặc người dùng ẩn danh) hoặc `SERVICE_UNAVAILABLE` (API chưa sẵn sàng, hoặc nhà cung cấp Auth lỗi).
- `authenticate` (`server/app.mjs`) gọi `/auth/v1/user` của Supabase và coi người dùng ẩn danh là chưa đăng nhập. `socket.data.uid` lấy từ kết quả xác thực, không lấy từ client.
- Khi đã vào biển, server kiểm tra lại phiên mỗi 60 giây (`authRecheckMs`). Nếu token bị thu hồi, server gửi `ocean:error` rồi ngắt. Lỗi tạm của nhà cung cấp Auth không làm kết thúc trò chơi.
- Token mới được gửi trên kết nối đang mở qua `ocean:token`; server xác thực lại và từ chối nếu người dùng khác `socket.data.uid`. Lệnh này không được gọi quá một lần mỗi 2 giây, để phiên sống quá thời hạn token đầu (khoảng một giờ).

## Vào biển

Client gửi `ocean:command` với `action: "join"` và `proto: 2`. Server:

1. Kiểm tra `ready()`; nếu chưa sẵn sàng thì trả lỗi “đang kết nối lại”.
2. Xác thực lại token một lần khi vào; người dùng khác với `socket.data.uid` bị ngắt.
3. Từ chối khi biển đã đủ `MAX_BOATS` = 100 thuyền và tài khoản chưa có thuyền.
4. Nếu tài khoản đã có thuyền ở cửa sổ khác, thuyền cũ nhận `ocean:error` rồi rời phòng: một tài khoản chỉ có một thuyền.
5. Tạo tư thế bắt đầu bằng `spawn(uid)` (`src/ocean/model.ts`); tên hiển thị được cắt tối đa 24 ký tự.
6. Đọc tầng thuyền và cần (`loadoutOf`) bằng **token của chính người chơi**. Nếu lần đọc lỗi, thuyền vẫn vào biển với tầng mặc định; server không bao giờ loại thuyền chỉ vì việc đọc đó. Tầng không lấy từ client.
7. Gửi `ocean:state` đầy đủ cho giao thức 2, rồi trả về `pose`, `sendMs` (= `tickMs`, 200 ms) và `delayMs` (= 2,5 chu kỳ tick).

Thuyền đậu của những người không online được đọc khi có người vào (xem [thuyền đậu](ocean-parked-boats.md)).

Giao thức 1 (client cũ đã cache) vẫn được hỗ trợ: nhận `ocean:state` đầy đủ và lệnh `move` có xác nhận, với khoảng cách tối thiểu 400 ms. Client không báo giao thức 2 sẽ không nhận `ocean:delta`.

## Gửi và nhận

- Giao thức 2: `ocean:move` không có xác nhận; tư thế đến quá nhanh (dưới `minMoveMs` = 100 ms) bị bỏ mà không báo về client. Tư thế mới hơn sẽ thay.
- Mỗi tick (200 ms) server gửi `ocean:delta` cho phòng `ocean:v2` chỉ gồm thuyền mới (`add`), thuyền đã đổi (`up`, dạng mảng `[uid, x, z, heading, fishing, updatedAt]`), thuyền rời biển (`gone`) và thuyền đậu mới được thêm. Client giữ bản đồ thuyền và gọi `onBoats` với toàn bộ bản đồ.
- Tư thế được kiểm tra: đúng bốn khóa `fishing, heading, x, z`; `x` và `z` là số hữu hạn với `|x|, |z| ≤ SEA_BOUND` (1500); `|heading| ≤ π`; `fishing` là boolean.
- Thay đổi tầng (`ocean:refit`): client gửi khi vừa mua; server đọc lại loadout, nhưng không quá một lần mỗi `minRefitMs` = 2 giây cho mỗi socket. Các client khác nhận `ocean:refit` với tầng mới.
- Phòng `ocean:shared` nhận `ocean:state` đầy đủ cho client giao thức 1.

Tick chạy khi có thuyền và dừng khi biển trống, nên một instance rảnh không chạy vòng lặp gửi.

## Ngắt kết nối và kết nối lại

- `ocean-socket.ts` tắt kết nối tự động của Socket.IO (`reconnection: false`) để việc thử lại được kiểm soát ở đúng một chỗ. Khi mất kết nối, `src/app/ocean.ts` hiện “Mất kết nối biển chung” và thử lại qua `connectWithRetry` (`connect.ts`), tối đa 90 giây (`deadlineMs`). Các lỗi không thể thử lại (đăng xuất, biển đủ người, bị giành chỗ ở cửa sổ khác) hiện ngay với lý do.
- `AUTH_REQUIRED` của handshake và token hết hạn không được thử lại theo cách mù quáng: phiên phải được làm mới trước.
- Khi socket của thuyền ngắt, server không xóa thuyền mà đưa nó vào danh sách đậu (xem [thuyền đậu](ocean-parked-boats.md)).
- Khi client vào lại từ hub, biển mới được tạo; không có trạng thái cũ nào được lưu trên server.

## Giới hạn và rủi ro

- Biển chỉ tồn tại trong một tiến trình. Scale ngang sẽ làm người chơi trên các instance khác không thấy nhau; không được scale khi chưa có trạng thái và phát sóng dùng chung.
- Free instance của Render có thể ngủ và cắt mọi kết nối; xem [hạ tầng](infrastructure-transition.md).
- Biển không có tiền thưởng; kinh tế đi qua RPC riêng (xem [kinh tế biển](ocean-economy.md)).
- Độ trễ và độ mượt trên mạng thật chưa được đo trên điện thoại thật.

## Kiểm thử

- `npm run test:api` chạy `tests/api.test.mjs`, `tests/socket.test.mjs` và `tests/ocean-socket.test.mjs`: kiểm tra `/health`, từ chối origin, cổng xác thực Socket.IO và giao thức biển với Socket.IO client thật.
- `tests/ocean.test.mjs` kiểm tra logic biển thuần. `tests/ocean-parked-browser.mjs` kiểm tra thuyền đậu trong trình duyệt.
- Việc nội suy thuyền khác (`src/ocean/remote.ts`) không có file test riêng trong `tests/`.
