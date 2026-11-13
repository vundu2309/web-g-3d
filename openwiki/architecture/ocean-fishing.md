---
type: architecture
title: Câu cá, cuộc giằng co và vật lý thuyền
description: Luật câu cá thuần (vùng biển, lượt ném, cắn câu, 15 loài), máy trạng thái cuộc giằng co, cần câu và dây như lò xo/Verlet, vật lý thuyền Havok, lưu cá trên thiết bị, và ranh giới client báo cáo cá.
tags:
  - fishing
  - ocean
  - babylon
  - havok
  - physics
  - client-authority
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
sources:
  - id: openwiki-source-d21d117910c861b03d3f6aa2
    resource: repo://src/app/market-ui.ts
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-d9131d826739d3342a0d1da1
    resource: repo://src/ocean/boat-physics.ts
  - id: openwiki-source-acdf49d6890952114fb01275
    resource: repo://src/ocean/fight.ts
  - id: openwiki-source-1b52e9143f6d9410082faea1
    resource: repo://src/ocean/fishing.ts
  - id: openwiki-source-b30da6bbf3782f1926011771
    resource: repo://src/ocean/save.ts
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
---

# Câu cá, cuộc giằng co và vật lý thuyền

## Phạm vi

Câu cá là phần gameplay chính của [biển đánh cá chung](ocean.md). Tách thành ba lớp: luật thuần (không DOM, không render), hiển thị 3D và lớp app điều khiển. Mọi kết quả câu được quyết định trên thiết bị; server chỉ nhận báo cáo cá đã giữ, xem [kinh tế biển](ocean-economy.md).

## Ownership

| File | Trách nhiệm |
| --- | --- |
| `src/ocean/fishing.ts` | Danh sách `SPECIES` (15 loài), vùng `shore`/`open`/`deep`, `rollFish`, lượt ném (`castTarget`, `planRound`) và lớp `Angler` (máy trạng thái câu) |
| `src/ocean/fight.ts` | Lớp `Fight`: cuộc giằng co với ba tâm trạng cá, không có đồng hồ riêng |
| `src/ocean/fight-look.ts`, `fishing-gear.ts`, `creature-kit.ts` | Hình dạng cá và dây câu, không ảnh hưởng luật |
| `src/ocean/rod.ts`, `rod-visual.ts` | `RodSim`: cần câu là lò xo trong hệ trục của thuyền |
| `src/ocean/rope.ts` | `Rope`: dây câu là chuỗi điểm Verlet có độ dài cố định |
| `src/ocean/creatures.ts` | Mô tả hình thể các loài (`CreatureKind`, `Look`) |
| `src/ocean/boat-physics.ts` | `createBoatPhysics`: thân Havok, phao nổi theo sóng, lực cản, đẩy và lái |
| `src/ocean/save.ts` | `encodeSave`/`decodeSave`: vị trí thuyền và kho cá trên thiết bị |
| `src/app/fishing-ui.ts` | Nối `Angler` với nút thả câu, treo cá trên cần, và `onKeep` |

## Vùng biển và loài cá

`zoneAt(x, z)` đo khoảng cách tới mép đảo gần nhất: dưới `SHORE_RANGE` (28 m) là `shore`; trên `DEEP_RANGE` (125 m) là `deep`; còn lại là `open`. Mỗi loài có trọng số theo từng vùng.

`rollFish(zone, rng, sweet)` chọn loài theo trọng số `zones[zone] × RARITY_WEIGHT` (độ hiếm 1, 2, 3 có trọng số 100, 40, 10). Điểm câu "ngọt" (`sweet`) nhân trọng số của loài hiếm (độ 2 và 3) với 1,8. Cân nặng trong khoảng loài được rút theo `low + (high − low) × u^2.4`, nên cá nhỏ phổ biến hơn cá lớn.

## Lượt ném, cắn và giật câu

Ném có năng lượng nạp tối đa 1400 ms, khoảng cách từ `CAST_MIN` 8 đến `CAST_MAX` 40; vùng "ngọt" là power 22 đến 30. Dây tối đa `MAX_LINE` 48. `planRound` lập lịch lượt chờ: cá "ngọt" chờ 1,8–3,8 s, còn lại 2,5–6 s; có 1 đến 3 lần cắn nhẹ (nibble); 80% số lượt có cú cắn chính. Cửa sổ giật (`HOOK_WINDOW_MS` = 1000) quyết định người chơi có móc được cá hay không.

`Angler` giữ một `phase` (kiểu `Phase` trong `fishing.ts`) và tạo một `Fight` khi cá cắn. Các hàm `addCatch`, `releaseOne` và `stockTotal` quản lý `Inventory` theo loài và cân nặng lớn nhất; giao diện treo cá trên cần và gọi `onKeep` khi người chơi giữ cá.

## Cuộc giằng co

`Fight` là máy trạng thái thuần, không có đồng hồ riêng: tâm trạng cá ở một trong ba mức.

- **Bật sức (`surge`)**: cá lao đi và kéo dây; giữ nút quay sẽ làm sức căng tăng vọt tới khi dây đứt.
- **Sung sức (`strong`)**: cá kéo đều, thi thoảng giật mạnh; kéo ngắn thì được ít dây và cá yếu dần; kéo lâu làm căng tăng.
- **Đuối sức (`tired`)**: có thể kéo vào. Nghỉ đủ lâu (sau 3 s) thì cá hồi phục.

Cá tới thuyền khi khoảng cách về 0 (trong `LANDED_WITHIN` 0,6 m). Sau `MAX_FIGHT_S` = 70 s cá tự tuột móc, để không bị kẹt vô hạn. Hiển thị chỉ dùng chuyển động (dây, cần, cá, nút), không dùng chữ.

## Cần câu và dây

`RodSim` mô phỏng cần như lò xo trong hệ trục của thuyền (gốc `ROD_BASE`, dài `ROD_LENGTH` 3,7 m). Lực kéo ở đầu cần làm cần cong, rung nhẹ khi lực dừng, và cá giật mạnh làm rung cần. Vị trí đầu cần là điểm xuất phát của dây, nên dây và cần luôn khớp nhau.

`Rope` mô phỏng dây bằng chuỗi điểm Verlet, bị kéo bởi trọng lực và giữ độ dài cố định giữa đầu cần và cá: dây võng khi chùng và thẳng khi căng.

## Vật lý thuyền

`createBoatPhysics` tạo một thân Havok cứng cho thuyền của người chơi. Module không để Havok tự xử lý hết mà thêm: phao nổi theo hàm sóng dùng chung (`waves.ts`), lực cản nước khác nhau theo hướng, lực đẩy chân vịt và bánh lái. Mọi lực được áp như xung (lực × dt) trước mỗi bước vật lý, nên không phụ thuộc tốc độ khung hình. Trục: mũi thuyền hướng về `-Z` (khớp mô hình di chuyển, heading 0 đi về `-Z`, lái dương là rẽ phải).

Đảo là các hình tròn `IslandBody` để va chạm. Đây là vật lý cục bộ; trạng thái thuyền các người khác đến từ [realtime biển](ocean-realtime.md).

## Lưu trên thiết bị

`src/ocean/save.ts` lưu theo tài khoản (`photyphu:sea:v1:<uid>`) vị trí `x`, `z`, `heading`, số cá đã bắt (`caught`) và kho `fish`. Khi đọc lại, dữ liệu được kiểm tra: thiếu, quá 7 ngày, số không hữu hạn, hoặc vị trí nằm trên đảo/ngoài biên thì vị trí bị bỏ và thuyền về bến. `caught` giới hạn tới 1 000 000. Kho cá và số cá chỉ là bản lưu cục bộ, không phải nguồn tiền.

## Ranh giới tin cậy

- Câu cá, cắn, cuộc giằng co và sức căng đều chạy trên client; server không xác nhận chúng.
- Khi giữ cá, `onKeep` đưa cá vào `marketUi.recordCatch`; chỉ khi kinh tế bật, cá được gửi `economy_record_catch`. Lỗi `network` giữ cá trong hàng đợi, lỗi khác bỏ cá đó (xem `src/app/market-ui.ts`).
- Quyết định 0010 nêu rõ đây là giới hạn đã biết: một client đã sửa vẫn có thể tạo cá trong khoảng server cho phép. Chuyển luật câu sang server là việc riêng, chưa làm.

## Kiểm chứng

Các test đơn vị (`npm run test:unit`): `tests/fishing.test.mjs` (vùng, lượt ném, cắn, kho), `tests/fight.test.mjs` và `tests/fight-look.test.mjs` (cuộc giằng co với bot có seed), `tests/creatures.test.mjs`, `tests/rod-rope.test.mjs`, `tests/boat-physics.test.mjs`. Các test trình duyệt: `tests/ocean-fishing-browser.mjs`, `tests/ocean-stick-browser.mjs`, `tests/ocean-resume-browser.mjs`.

Các test này kiểm tra luật và luồng giao diện trên trình duyệt mô phỏng. Chúng không chứng minh cảm giác điều khiển trên điện thoại thật hoặc hiệu năng Havok trên thiết bị yếu.
