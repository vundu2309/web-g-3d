---
type: architecture
title: Thuyền đậu khi ngoại tuyến
description: Thuyền của người chơi không online vẫn nằm ở vị trí cuối cùng trên biển chung; vị trí đọc từ hồ sơ Supabase bằng token của chính người chơi, giữ tối đa 7 ngày, TTL đọc 60 giây; khi người chơi trở lại thì thuyền không còn đậu nữa.
tags:
  - parked-boats
  - ocean
  - socket-io
  - supabase
  - rpc
  - architecture
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
sources:
  - id: openwiki-source-9e31e90300dccb65ecd460a0
    resource: repo://server/app.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-69220ba068a830c8d6971aab
    resource: repo://src/ocean/babylon-scene.ts
  - id: openwiki-source-7ba302b3699451bd2e311575
    resource: repo://supabase/migrations/20261121130000_parked_boats.sql
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---

# Thuyền đậu khi ngoại tuyến

Khi người chơi rời biển, thuyền của họ không biến mất: nó **đậu** tại vị trí cuối cùng để những người khác vẫn thấy (quyết định [0018](../../docs/decisions/0018-parked-boats.md)). Trạng thái đậu chỉ là hiển thị và chướng ngại vật; thuyền đậu không câu cá, không được tính vào số người đang online, và không có ai điều khiển nó.

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Hàm đọc cơ sở dữ liệu | `supabase/migrations/20261121130000_parked_boats.sql` | `economy_private.parked_boats()` và RPC công khai `economy_parked_boats()`: thuyền của tài khoản khác được thấy trong 7 ngày gần nhất. |
| Vị trí đã lưu | `economy_private.profiles` (migration `20261120120000_profile.sql`, `economy_save_pose`) | Vị trí thuyền người chơi, mỗi lần lưu tối thiểu cách 4 giây. |
| Đọc từ API | `server/ocean.mjs` (`parkedOf`, `readParked`, `mergeParked`) | Gọi RPC bằng token của người chơi vừa vào biển; giữ kết quả, có TTL. |
| Nối API | `server/app.mjs` | Truyền `parkedOf(token)` gọi `/rest/v1/rpc/economy_parked_boats` với token người chơi. |
| Vẽ và va chạm | `src/ocean/babylon-scene.ts` (`PARKED_SOLID_REACH`), `src/ocean/boat-physics.ts` (`setParked`) | Tên “ngoại tuyến”, không có dây câu, và các hộp cứng gần thuyền người chơi. |

Khóa quản trị không được dùng ở bất kỳ bước nào. Hàm SQL bị thu hồi quyền khỏi `anon`; chỉ người dùng đã đăng nhập được gọi, và hàm loại chính người gọi (`p.user_id <> uid`).

## Dữ liệu đọc từ database

`economy_parked_boats()` trả tối đa 100 tài khoản khác có vị trí lưu trong 7 ngày gần nhất, mới nhất trước, mỗi dòng gồm:

- `uid`, `name` (tên người chơi đã chọn, cắt 24 ký tự; mặc định “Người đi biển”), `x`, `z`, `heading`;
- `tier` và `rod` (từ `economy_private.loadouts`, mặc định 0);
- `age` (số giây kể từ lần lưu).

Đây là một lần đọc bổ sung; không đổi hay xóa bảng nào.

## Luồng trên API

1. Khi một người chơi vào biển, `server/ocean.mjs` gọi `readParked(token)`. Lần đọc bị bỏ qua nếu lần trước chưa quá `parkedTtlMs` = 60 giây (trong mã, `parkedKeepMs` là 7 ngày).
2. Lời gọi được giới hạn bởi `fitWaitMs` (2,5 giây). Nếu không có kết quả, hoặc cơ sở dữ liệu là bản cũ không có RPC, `parkedReadAt` được đặt lại để người vào sau thử lại.
3. `mergeParked` áp dụng danh sách, với các quy tắc sau:
   - thuyền đang online (`boats`) không bao giờ bị ghi đè thành đậu;
   - thuyền vừa rời biển trên cùng API (`source: "live"`) được giữ vị trí sống cuối cùng, mới hơn vị trí đã lưu tối đa khoảng 5 giây;
   - thuyền có trong bộ nhớ nhưng không còn trong danh sách database (`source: "db"`) bị gỡ;
   - thuyền quá `parkedKeepMs` bị gỡ.
4. Khi socket của một người chơi rời đi (`disconnect`), thuyền của họ được đưa vào `parked` ở vị trí cuối (`source: "live"`), thay vì gửi `gone`. Phiên bản giao thức cũ (`ocean:state`) không thấy thuyền đậu; phiên bản mới nhận nó với `off: 1`.
5. Khi người chơi quay lại (kết nối socket đã xác thực), thuyền đó bị xóa khỏi `parked` và được gửi như thuyền online.

Thuyền đậu chỉ được gửi tới các client giao thức 2 (`ocean:v2`); các đợt cập nhật được gộp theo nhịp `tickMs` như phần còn lại của biển (xem [biển chung qua Socket.IO](ocean-realtime.md)).

## Hiển thị và va chạm trên client

- Thuyền đậu có mô hình và hạng thuyền như thuyền thường, đứng trên sóng, nhưng tên có chữ “· ngoại tuyến” (`babylon-scene.ts`).
- Thuyền đậu không có dây câu (`fishing` luôn false, `src/app/ocean.ts` ghi chú không dùng trạng thái câu cũ).
- Thuyền đậu không nằm trong số người đang online, không xuất hiện trong danh sách thủy thủ, và không có mũi tên ở mép màn hình (chỉ người online mới có).
- Thuyền đậu cách thuyền người chơi dưới `PARKED_SOLID_REACH` = 150 m là **chướng ngại cứng**: `setParked` đặt một hộp Havok theo kích thước hạng thuyền, và thuyền người chơi bị dừng hoặc đẩy ra. Thuyền đậu xa hơn không tạo hộp (không đáng để tính).
- Bản đồ (minimap và bản đồ lớn) vẫn hiện thuyền đậu, như mọi người chơi khác (xem [bản đồ](ocean-map.md)).

## Ngoại lệ và hệ quả

- Tối đa 100 thuyền thêm vào biển, cộng với giới hạn 200 thuyền ở client. Chi phí của các hộp va chạm chưa được đo trên điện thoại.
- Tên và vị trí cuối cùng của người chơi nhìn thấy được với mọi người đăng nhập trong 7 ngày sau khi họ rời đi.
- Một thuyền đậu có thể chắn cầu cảng chợ hoặc lối vào bến; không có cơ chế thu hồi nào ngoài 7 ngày.
- Cần áp dụng migration lên dự án Supabase **trước** khi triển khai API đọc nó. Nếu chưa có, lời gọi thất bại và biển hoạt động như cũ (không có thuyền đậu), rồi thử lại khi có người khác vào. Việc migration đã áp dụng hay chưa trên dự án live không được kiểm chứng từ repository.

## Kiểm thử

- `tests/ocean-parked-browser.mjs` chạy trình duyệt thật với một kết nối giả đưa một thuyền đậu cách 14 m phía trước thuyền người chơi, và kiểm tra: tên “ngoại tuyến”, không câu, không được tính là người online, và là chướng ngại.
- `tests/ocean-socket.test.mjs` và `tests/socket.test.mjs` (`npm run test:api`) kiểm tra giao thức Socket.IO và xác thực, nơi `parkedOf` được truyền vào.

Chưa có kiểm thử tự động với Supabase thật, và chưa có đo lường trên điện thoại thật.
