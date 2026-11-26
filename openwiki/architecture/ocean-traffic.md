---
type: "Tham khảo"
title: "Thuyền NPC: tàu tuần tra, thủy phi cơ và thuyền mèo"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
sources:
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-69220ba068a830c8d6971aab
    resource: repo://src/ocean/babylon-scene.ts
  - id: openwiki-source-89336f733bc58830022abe65
    resource: repo://src/ocean/patrol-routes.ts
  - id: openwiki-source-d495eff23663ea7aae2912d1
    resource: repo://src/ocean/plane-fleet.ts
  - id: openwiki-source-c1dd170ae81d3f741790b6dd
    resource: repo://src/ocean/plane-plan.ts
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---


# Thuyền NPC: tàu tuần tra, thủy phi cơ và thuyền mèo

Biển chung có ba nhóm thuyền và máy bay không do người chơi nào điều khiển: **tàu tuần tra** (`npc: true`, đi vòng quanh đảo), **thủy phi cơ** kéo biển quảng cáo trên bầu trời, và **thuyền mèo chèo** đi giữa các đảo. Vị trí của cả ba là hàm của **đồng hồ chung** (thời gian của server mà app đã theo), nên mọi máy đều thấy cùng một cảnh tại cùng thời điểm và không có gì được gửi qua mạng. Đây là hình ảnh: không phải người chơi, không va chạm với thuyền người chơi, và không có phần nào của trò chơi phụ thuộc vào chúng.

## Ranh giới file

| Nhóm | File | Vai trò |
| --- | --- | --- |
| Tàu tuần tra: đường đi | `src/ocean/patrol-routes.ts` | `patrolRoutes()` (dựng một lần), `patrolPose(route, seconds)`, `patrolBoats(serverMs)` trả các `Boat` với `npc: true`. |
| Tàu tuần tra: đèn | `src/ocean/patrol-light-plan.ts`, `src/ocean/patrol-lights.ts` | Kế hoạch nhấp nháy và các quầng sáng; phần vẽ. |
| Tàu tuần tra: thân tàu | `public/models/boat-patrol.glb` (`tools/blender/patrol_boat.py`), `src/ocean/boat-tier.ts` (`PATROL_HULL_TIER`) | Mô hình riêng, sơn trắng với viền xanh đậm. |
| Thủy phi cơ: kế hoạch | `src/ocean/plane-plan.ts`, `src/ocean/plane-flight.ts` | 12 máy bay (`PLANES`), chuyến bay theo hạt giống, bước cố định `STEP` = 0,25 s. |
| Thủy phi cơ: vẽ | `src/ocean/plane-fleet.ts`, `plane-fade.ts`, `plane-glow.ts`, `plane-lights.ts` | Mô hình dùng chung, biển quảng cáo, mờ dần khi xuất hiện và biến mất, đèn ban đêm. |
| Thuyền mèo | `src/ocean/cat-boat.ts`, `cat-fleet.ts`, `cat-routes.ts`, `cat-lantern.ts` | Thuyền mèo chèo giữa các đảo theo đồng hồ chung; đèn lồng. |
| Nối với biển | `src/app/ocean.ts`, `src/ocean/babylon-scene.ts` | Thêm tàu tuần tra vào danh sách thuyền của scene; dựng `CatFleet` và `PlaneFleet` sau khi scene có sẵn. |

## Đồng hồ chung

Mọi nhóm NPC đọc cùng một thời gian: `serverMs`, thời gian mà app đã theo từ server. Một máy vào biển giữa chừng vẫn thấy đúng vị trí:

- Tàu tuần tra: `patrolPose(route, seconds)` là hàm thuần của thời gian; không có trạng thái để đồng bộ.
- Thủy phi cơ: mỗi chuyến bay được xác định bởi hạt giống (theo máy bay và số thứ tự chuyến). Một máy mới tham gia sẽ **phát lại** chuyến đang bay từ đầu theo các bước cố định `STEP` và nội suy giữa hai bước, rồi đi theo các bước mà đồng hồ chỉ định. Vị trí tại một thời điểm chung là như nhau trên mọi máy.
- Thuyền mèo: dùng cùng đồng hồ (`plane-plan.ts` ghi chú điều này).

## Tàu tuần tra

- Có sáu tàu, một cho mỗi đảo trong `PATROL_ISLANDS` (các đảo chỉ số 0, 2, 3, 4, 6, 7), mỗi tàu đi một vòng kín quanh đảo đó. Uid là `npc:patrol-<n>`, tên “Tàu tuần tra”.
- Vòng đi được dựng một lần (`loopAround`): với mỗi hướng quanh đảo, lấy bán kính nhỏ nhất trong `OFFSETS` (70 đến 220 m từ vòng va chạm của đảo) mà không đâu gần vật cản nào dưới `PATROL_CLEARANCE` = 40 m (vật cản gồm bến, chợ, xưởng tàu và các đảo khác). Sau đó bán kính được làm mịn để tàu quay đều (`SMOOTH`), và vòng được chia 144 điểm.
- Nếu một hướng không có bán kính nào thỏa mãn, việc dựng vòng ném lỗi; `tests/patrol-routes.test.mjs` kiểm tra khoảng cách an toàn của mọi vòng.
- Tốc độ hành trình là 6 m/s, khoảng một phần ba tốc độ tối đa của người chơi. Hướng mũi tàu đi theo tiếp tuyến của vòng.
- Tàu được gửi tới scene như `Boat` với `npc: true`, nên bản đồ và danh sách người chơi bỏ qua chúng (xem [bản đồ](ocean-map.md)). Tàu không va chạm với bất kỳ thuyền nào.

## Thủy phi cơ

- Có 12 máy bay. Mỗi máy có một **nhà** (bến cảng hoặc một trong các đảo gần nhất, có ưu tiên bến có nhiều máy bay hơn), và bay lượn trong vài trăm mét quanh nhà, để người chơi luôn thấy vài chiếc.
- Một chuyến bay bắt đầu từ một vòng xa ngoài khơi, hướng về nhà, và kết thúc khi bay ra khỏi mép biển; chỗ chuyển từ chuyến này sang chuyến kế tiếp nằm ngoài tầm nhìn của thuyền.
- Mỗi máy bay kéo một biển quảng cáo có dòng chữ `RA KHƠI CÙNG BẠN` (`BANNER_TEXT`). Dây kéo được vẽ bằng `TowTrail` (`banner.ts`).
- `PlaneFleet` mô phỏng tất cả máy bay (vài phép tính mỗi chiếc), nhưng chỉ vẽ tối đa `limit` chiếc gần nhất trong phạm vi `range`: 450 m và 3 chiếc trên điện thoại cảm ứng, 600 m và 4 chiếc trên máy tính (`babylon-scene.ts`). Mô hình thân và cánh quạt là hai mẫu dùng chung, vẽ bằng instance.
- Máy bay xuất hiện và biến mất bằng mờ dần theo kiểu dither (`plane-fade.ts`), không bật tắt trong một khung hình.
- Ban đêm, đèn của máy bay là một lớp sáng riêng (`plane-glow.ts`, `plane-lights.ts`).
- Thủy phi cơ không có va chạm. Âm thanh máy bay trong kế hoạch âm thanh chỉ phụ thuộc khoảng cách tới máy bay gần nhất (xem [âm thanh](ocean-sound.md)).

## Thuyền mèo chèo

Thuyền mèo chèo đi giữa các đảo theo đồng hồ chung, do `CatFleet` dựng sau khi mô hình chèo tải xong (`loadRowerAssets`). Số lượng và phạm vi hiển thị khác nhau theo thiết bị cảm ứng (3 chiếc trong 130 m) và máy tính (5 chiếc trong 220 m). Thuyền mèo không được đưa lên bản đồ và không nằm trong danh sách người chơi.

## Bật và tắt

- `?planes=0` bỏ qua thủy phi cơ.
- `?cats=0` (hoặc công tắc trong Cài đặt) bỏ qua thuyền mèo.
- Tàu tuần tra không có công tắc riêng: chúng được thêm vào danh sách thuyền của scene cùng các thuyền người chơi.

Các giá trị này là cấu hình hiển thị của thiết bị; không ảnh hưởng đến trạng thái trên server.

## Kiểm thử

- `tests/patrol-routes.test.mjs`: khoảng cách an toàn của mọi vòng tàu tuần tra; `tests/patrol-boat.test.mjs`: mô hình và thông số tàu.
- `tests/patrol-lights.test.mjs`: kế hoạch đèn tàu.
- `tests/plane-plan.test.mjs`, `tests/plane-flight.test.mjs`, `tests/plane-fade.test.mjs`, `tests/plane-lights.test.mjs`: kế hoạch, bước bay, mờ dần và đèn.
- `tests/cat-boat.test.mjs`, `tests/cat-routes.test.mjs`: thuyền mèo.
- `tests/ocean-patrol-browser.mjs`, `tests/ocean-patrol-collision-browser.mjs`, `tests/ocean-planes-browser.mjs`: trong trình duyệt (cần máy chủ phát triển).

Chưa có bằng chứng về độ mượt khi có nhiều NPC trên điện thoại thật; chi phí chưa được đo trên thiết bị.
