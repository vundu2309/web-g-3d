---
type: "Tham khảo"
title: "Bản đồ: minimap và bản đồ toàn màn hình"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
sources:
  - id: openwiki-source-58f8b04d95302eb37c1c9d52
    resource: repo://src/app/big-map.ts
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-fb19e39bceb2ccd04cf0d737
    resource: repo://src/ocean/minimap-math.ts
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---


# Bản đồ: minimap và bản đồ toàn màn hình

Biển chung có hai bản đồ cùng vẽ từ một nguồn: **minimap** nhỏ ở góc trên bên phải, ngang hàng với nút cài đặt ở góc trên bên trái, và **bản đồ lớn** toàn màn hình mở khi người chơi chạm vào minimap. Bản đồ chỉ vẽ và hiển thị; không có chạm nào đi qua minimap để điều khiển thuyền. Hình học (tỷ lệ, bờ đảo, địa điểm, khoảng cách) nằm trong module thuần để kiểm thử không cần canvas.

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Hình học thuần | `src/ocean/minimap-math.ts` | `toMap`, `mapScale`, `islandsOnMap`, `coastPoints`, `PLACES` (địa điểm đánh số), `mapPlaces` (sắp theo khoảng cách), `distanceText`, `playersOnMap`. |
| Minimap | `src/app/minimap.ts` | `createMinimap(canvas, options)`: vẽ nền tĩnh một lần vào lớp ngoài màn hình, rồi mỗi lần cập nhật chỉ sao chép lớp đó và vẽ thuyền. |
| Bản đồ lớn | `src/app/big-map.ts` | `createBigMap(host)`: hộp thoại `<dialog>` modal, chứa một minimap có số thứ tự và danh sách địa điểm. |
| Nối với biển | `src/app/ocean.ts` | Tạo cả hai, cập nhật 10 lần mỗi giây, mở bản đồ lớn khi chạm minimap. |
| Kiểu hiển thị | `src/ocean/style.css` (quanh `.ocean-minimap`) | Vị trí góc trên bên phải, khung kính, trạng thái khi đang câu. |

## Minimap

`createMinimap` vẽ bản đồ **biển, đảo, bờ, tường biên và bến** một lần cho mỗi kích thước canvas (`fit`, theo `devicePixelRatio`, tối đa 3) vào một canvas ngoài màn hình. Mỗi lần `update(self, others, seconds)` chỉ sao chép lớp đó rồi vẽ thuyền: thuyền của người chơi là mũi tên vàng chỉ hướng mũi thuyền, các thuyền khác có màu thân thuyền (`hullCss`), và thuyền đang câu có dấu hiệu riêng. Với `badges: true` (dùng ở bản đồ lớn), mỗi địa điểm có một huy hiệu số khớp với danh sách bên cạnh.

Bản đồ quay với bắc ở trên (heading 0 là -Z, tức lên trên; +X sang phải). `MAP_RANGE` là `SEA_BOUND + 12` mét từ tâm tới mép bản đồ. Bờ mỗi đảo đi theo `coastPoints`, lấy từ cùng bảng bờ (`shore.ts`) mà mô hình 3D dùng, nên bản đồ có cùng vịnh và mũi đất với biển.

`src/app/ocean.ts` gọi `minimap.update` khoảng mỗi 100 ms, không phải mỗi khung hình. Khi người chơi đang câu, minimap mờ đi và không mở được bản đồ lớn; lý do được ghi trong mã là một chạm nhầm không được đưa người chơi ra khỏi biển giữa lúc bắt cá.

## Bản đồ lớn

`createBigMap` tạo một `<dialog>` modal riêng, không phải một trang của hub:

- Khi mở, phần còn lại của màn hình bị khóa (modal); Escape hoặc nút đóng hoặc chạm vùng lề tối đều đóng.
- Khi đóng, tiêu điểm trở về phần tử đã mở bản đồ.
- Bản đồ vuông và lớn nhất có thể trong màn hình: trên màn hình rộng, cạnh danh sách; trên màn hình đứng, nằm trên danh sách (`tall`). `ResizeObserver` đo lại khi cỡ màn hình đổi.
- Danh sách địa điểm sắp theo khoảng cách từ thuyền người chơi, gần nhất trước, mỗi dòng có số huy hiệu, tên, loại (“Nơi xuất phát”, “Chợ cá”, “Xưởng tàu”) và khoảng cách (`distanceText`: mét đến 999 m, sau đó km với dấu phẩy thập phân).
- Số thứ tự địa điểm cố định (`PLACES`, đánh số theo thứ tự danh sách gốc), không đổi khi thuyền di chuyển; chỉ thứ tự và khoảng cách trong danh sách đổi.
- Danh sách chỉ dựng lại khi thứ tự hoặc một khoảng cách đổi, và tối đa mỗi nửa giây.
- Khi đóng, bản đồ không vẽ; `update` vẫn lưu lần cập nhật gần nhất để mở ra là vẽ ngay.

## Ai hiện trên bản đồ

`playersOnMap(boats, selfUid)` trả về các thuyền khác người chơi hiện tại, và **loại** hai nhóm:

- thuyền không có chủ (tàu tuần tra, `npc: true`, xem [thuyền NPC](ocean-traffic.md)).

Thuyền mèo chèo không nằm trong danh sách thuyền đưa lên bản đồ: `src/app/ocean.ts` không dùng `catBoats()` cho bản đồ, và `tests/minimap.test.mjs` kiểm tra điều đó bằng cách đọc mã nguồn.

Thuyền người chơi khác được giữ cả khi đang online lẫn khi đang đậu ngoại tuyến (xem [thuyền đậu](ocean-parked-boats.md)). `tests/minimap.test.mjs` kiểm tra rằng bản đồ chỉ hiện người chơi, và `src/app/ocean.ts` truyền danh sách này cho cả minimap lẫn bản đồ lớn.

## Kiểm thử

- `tests/minimap.test.mjs` kiểm tra: bản đồ có bắc ở trên và đông ở bên phải; mọi đảo đúng vị trí và tỷ lệ; mũi tên thuyền chỉ đúng hướng; màu người chơi cố định và thuộc bảng màu thân thuyền; bờ đảo là vòng kín; bản đồ lớn đánh số đủ bến, chợ và xưởng tàu; địa điểm sắp theo khoảng cách; định dạng khoảng cách; và `playersOnMap` chỉ giữ người chơi, kể cả khi màn hình biển truyền vào các thuyền NPC.
- `tests/ocean-map-browser.mjs` kiểm tra minimap và bản đồ lớn trong trình duyệt.

Chưa có bằng chứng từ điện thoại thật về độ rõ của chữ, huy hiệu và vị trí minimap ở các cỡ 844×390, 932×430 và 667×375. Đó là kiểm tra thiết bị cần làm.
