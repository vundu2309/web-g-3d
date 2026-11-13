---
type: "Tham khảo"
title: "Realtime biển: Socket.IO, Firestore và đồng bộ thuyền"
openwiki_generated: true
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
sources:
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-d9571426a00d5a5ac9f9c54c
    resource: repo://src/platform/ocean-firebase.ts
  - id: openwiki-source-da299de568c1622268f94e39
    resource: repo://src/platform/ocean-socket.ts
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
---


# Realtime biển: Socket.IO, Firestore và đồng bộ thuyền

## Phạm vi

Biển chung cần đồng bộ vị trí thuyền giữa các tài khoản. Trang này mô tả đường đi của một pose: từ thiết bị của người chơi, qua server hoặc Firestore, tới thiết bị khác. Luật câu cá và kinh tế nằm ở [câu cá](ocean-fishing.md) và [kinh tế](ocean-economy.md).

Adapter được chọn bởi `src/platform/ocean.ts`: nếu `useSupabase` đúng thì dùng `ocean-socket.ts`, còn không thì `ocean-firebase.ts`. Cả hai cùng trả về `onBoats(boats, serverTime)`.

## Server Socket.IO (`server/ocean.mjs`)

`attachOcean(io, { authenticate, ready, now })` được gọi từ `server/app.mjs`. Phần server chạy trong bộ nhớ của **một** tiến trình API; trạng thái thuyền (`boats` là một `Map`) mất khi deploy hoặc restart và không được ghi xuống database.

Giao thức 2 (`OCEAN_PROTOCOL = 2`):

- `ocean:command` với `action: "join"`: xác thực token, kiểm tra UID trùng với token, cấp pose bắt đầu và đưa socket vào phòng `ocean:v2`. Số thuyền tối đa là 100; khi một tài khoản mở thuyền ở cửa sổ khác, phiên cũ nhận `ocean:error` và bị rời phòng (phiên mới thắng).
- `ocean:move` với `{x, z, heading, fishing}`: không có ack và không chờ phản hồi. Mỗi socket được nhận tối đa một lần cập nhật trong `minMoveMs` (100 ms); pose phải đủ bốn khóa, số hữu hạn, `|x|, |z| ≤ 180`, `|heading| ≤ π`. Pose lỗi bị bỏ; chỉ lỗi mất phiên mới gửi `ocean:error`.
- `ocean:token`: nhận access token mới cho kết nối đang mở, tối đa một lần mỗi 2 giây và tối đa 8192 ký tự. Nhờ đó phiên không đứt khi token đầu (khoảng một giờ) hết hạn.
- Mỗi phiên được kiểm tra lại với Auth mỗi `authRecheckMs` (60 giây). Lỗi tạm thời của Auth không kết thúc phiên; kết quả không hợp lệ thì gửi `ocean:error` và ngắt kết nối.

Tick: `flush()` chạy mỗi `tickMs` (200 ms) khi có thuyền. Chỉ các thuyền đổi kể từ tick trước được gửi: thuyền mới và rời phòng gửi ngay (`flush()` khi join/leave), còn thay đổi vị trí gửi `ocean:delta` với `{t, add, up, gone}`. Mỗi dòng `up` là bộ giá trị gọn `[uid, x, z, heading, fishing, updatedAt]`, làm tròn 2 chữ số thập phân. Timer dừng khi không còn thuyền.

Giao thức cũ (không khai báo `proto: 2`) vẫn nhận `ocean:state` đầy đủ và lệnh `move` có ack, với khoảng tối thiểu 400 ms, để client cũ đang cache không gãy khi triển khai.

## Client Socket.IO (`src/platform/ocean-socket.ts`)

Client kết nối bằng WebSocket (`transports: ["websocket"]`), không tự reconnect (`reconnection: false`); token được lấy qua hàm `auth` từ phiên Supabase hiện hành và chỉ gửi khi UID khớp. Thuyền của người chơi do Havok mô phỏng trên thiết bị; client publish pose bằng `ocean:move`, và nhận `ocean:state` hoặc `ocean:delta` để cập nhật thuyền khác. Dữ liệu được đọc qua `readBoat` và giới hạn 100 thuyền.

Lỗi và kết nối lại nằm ở `src/app/ocean.ts`: `connectionLost` gọi `reconnect()` cho mọi lỗi trừ khi phiên bị từ chối thật (`fatalConnectionMessage`) và không phải lỗi token có thể làm mới (`renewableSessionMessage`). Khi reconnect, bộ phím, cần lái và câu cá được dừng trước rồi vào lại.

## Adapter Firestore (`src/platform/ocean-firebase.ts`)

Adapter này dùng Cloud Firestore `(default)`, đường dẫn `monopolyHub/v1/oceanBoats`, không dùng Realtime Database. Mỗi tài khoản có một tài liệu thuyền với mã phiên ngẫu nhiên. Client ghi bằng transaction, còn danh sách được theo dõi bằng `onSnapshot` với `orderBy("updatedAt", "desc")` và `limit(100)`, bật `includeMetadataChanges`. Khi tab đóng hoặc mạng rớt đột ngột, mã nguồn ghi chú rằng phiên được xử lý bởi presence lease; `dispose()` cố xóa phiên của chính mình nhưng không dựa vào việc đó.

Transaction không xếp hàng khi offline, nên chuyển động cũ không được gửi sau khi mạng quay lại. Rules và cấu hình riêng của Firebase vẫn cần được kiểm tra trước khi coi đây là đường online đang hoạt động.

## Nội suy thuyền khác (`src/ocean/remote.ts`)

Các thuyền khác đến vài lần mỗi giây. `remote.ts` giữ một lịch sử ngắn cho mỗi thuyền và phát lại trễ một khoảng; server gửi khoảng trễ `delayMs = 2.5 × tickMs` trong ack của lần join, và client nội suy giữa hai mẫu quanh thời điểm đó. Nhờ vậy chuyển động liên tục dù tốc độ gửi khác nhau, và thuyền không bị giật hay trượt quá nhanh.

## Ranh giới và giới hạn

- **Một instance**: sea state chỉ có trong bộ nhớ của một API; scale ngang sẽ tách người chơi thành các biển khác nhau. Không scale cho tới khi có trạng thái mô phỏng dùng chung.
- **Không tin client về luật**: server chỉ kiểm tra pose có đúng dạng, tốc độ gửi và phiên. Nó không kiểm tra thuyền có đi qua đảo hay không.
- **Database không đồng bộ biển**: LISTEN/NOTIFY chỉ phục vụ phòng (`hub:changed`), không gửi dữ liệu thuyền.
- **Bảo mật**: token không được ghi log; origin được giới hạn bằng `ALLOWED_ORIGINS`; payload Socket.IO tối đa 4096 byte cho hub.

## Kiểm chứng

- `npm run test:api` (`tests/ocean-socket.test.mjs`, `tests/socket.test.mjs`): giao thức 2, di chuyển đồng bộ, giới hạn tốc độ, làm mới token và kiểm tra phiên định kỳ.
- `tests/ocean.test.mjs`, `tests/ocean-multiplayer-browser.mjs`: thuyền khác xuất hiện và rời đi trong trình duyệt.
- `tests/ocean-resume-browser.mjs`: khôi phục vị trí khi quay lại biển.

Các test này dùng server và Auth thử nghiệm. Chúng không chứng minh độ trễ trên mạng di động thật hay hành vi của Render trong vận hành.

Xem [kiến trúc biển](ocean.md), [chuyển đổi hạ tầng](infrastructure-transition.md) và [vận hành phát triển](../operations/development.md).
