---
type: architecture
title: Câu cá, cuộc giằng co và vật lý thuyền
description: Luật câu cá thuần (vùng biển, lượt ném, nibble và cắn câu, 10 loài, kho cá), máy trạng thái cuộc giằng co, cần câu và dây, vật lý thuyền Havok, lưu cá trên thiết bị và ranh giới client báo cáo cá.
tags:
  - fishing
  - ocean
  - havok
  - architecture
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
generated: { by: "claude-code", at: "2026-11-20T02:01:25.414Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T03:06:03.643Z
---

# Câu cá, cuộc giằng co và vật lý thuyền

Câu cá là một trò chơi phía client. Luật nằm trong các module thuần, không có DOM hay render, nên kiểm thử được bằng bộ sinh số ngẫu nhiên có hạt giống và bot. Màn hình chỉ vẽ trạng thái này. Không có authority phía server đối với cá đã bắt; phần thưởng xu đi qua RPC kinh tế và bị giới hạn bởi database (xem [kinh tế biển](ocean-economy.md)).

## Ranh giới file

| Phần | File | Vai trò |
| --- | --- | --- |
| Luật câu | `src/ocean/fishing.ts` | Loài (`SPECIES`), vùng (`zoneAt`), lượt ném, nibble, cắn câu, kho cá, `rollFish`. |
| Quyết định nhấn nút | `src/ocean/cast-rules.ts` | `pressAction` và `castLook`: nhấn lại khi đang giữ cá vừa bắt sẽ giữ cá rồi ném luôn. |
| Cuộc giằng co | `src/ocean/fight.ts`, `src/ocean/fight-look.ts` | Máy trạng thái thuần và các số đo hình ảnh tương ứng. |
| Màn hình câu | `src/app/fishing-ui.ts` | Nút câu, dây thời gian, kho cá, hộp thoại; không tự quyết luật. |
| Cần, dây, cá | `src/ocean/rod.ts`, `rod-plan.ts`, `rod-visual.ts`, `rope.ts`, `ribbon.ts`, `fishing-gear.ts` | Lò xo cần, dây Verlet, dải dây hướng về camera, cá treo và vòng nước. |
| Cá dưới nước | `src/ocean/underwater.ts`, `underwater-material.ts` | Toán và GLSL để cá trong cuộc giằng co hiện dưới mặt nước. |
| Rung | `src/app/haptics.ts` | Mẫu rung của thiết bị theo trạng thái cá. |
| Vật lý thuyền | `src/ocean/boat-physics.ts`, `hull-handling.ts`, `hull-water.ts` | Thuyền Havok của người chơi. |
| Lưu trên thiết bị | `src/ocean/save.ts` | Vị trí và kho cá theo tài khoản, trong localStorage. |

## Vùng biển và loài

`zoneAt(x, z)` đo khoảng cách tới bờ gần nhất bằng `coastDistance` (`src/ocean/shore.ts`):

- dưới `SHORE_RANGE` = 30 m: vùng **shore**;
- trên `DEEP_RANGE` = 128 m và cũng xa bến cảng hơn 128 m: vùng **deep**;
- còn lại: **open**.

Mỗi loài có `zones` (trọng số `shore`, `open`, `deep`) và `rarity` (1, 2 hoặc 3). `rollFish` nhân trọng số vùng với trọng số hiếm (100, 40, 10); với điểm câu ngọt (xem dưới), loài hiếm 2 và 3 được nhân thêm 1,8. Cân nặng rút theo đường cong lũy thừa 2,4 trong khoảng của loài, nên cá nhỏ phổ biến hơn. Bảng `SPECIES` có 10 loài, từ mô hình cộng đồng ([decision 0013](../../docs/decisions/0013-community-sea-models.md)). Mỗi loài có dòng giá trong các migration kinh tế (`20261113032223_economy.sql` và `20261118120000_sea_species.sql`), và `tests/economy.test.mjs` kiểm tra điều này.

## Ném, nibble và cắn câu

1. **Nạp và ném**: giữ nút 1,4 s (`CHARGE_MS`). Khoảng ném từ 8 m (`CAST_MIN`) đến 40 m (`CAST_MAX`); điểm ngọt là 22 đến 30 m (`SWEET_FROM`, `SWEET_TO`). Lượt ném rơi vào đảo hoặc ngoài biển không thành công; `castLook` trả `blocked` để hiện màu đỏ và dây không bị bỏ qua trong im lặng.
2. **Nibble**: dây treo chùng; một round có 1 đến 3 lần nibble, mỗi lần có thể là một dấu hiệu “!”. Khoảng 80% round có cắn; round còn lại cá bỏ đi và một con khác có thể đến sau.
3. **Cắn**: dây căng và rung, nút chuyển thành lệnh giật. Người chơi có **1 giây** (`HOOK_WINDOW_MS`) để giật; quá thời gian cá bỏ đi.
4. **Bắt**: cá treo ở đầu cần với thẻ (sao hiếm, cân nặng, ✦ với kỷ lục loài). Giữ cá đưa vào kho; thả cá trả lại biển. Cá chỉ vào kho khi được giữ.

`pressAction` xử lý nhấn lại: khi đang có cá vừa bắt, một lần nhấn vừa giữ cá vừa bắt đầu lượt ném kế tiếp, nên lượt ném đầu sau mỗi lần bắt không bị nuốt.

Không có tiền tệ hay phần thưởng trong màn hình câu. Kho cá (`stockTotal`, `heldSpecies`) chỉ đếm cá đã giữ.

## Cuộc giằng co

`src/ocean/fight.ts` là máy trạng thái thuần với ba tâm trạng cá: **surge** (bật sức, kéo dây ra), **strong** (sung sức, kéo đều và thỉnh thoảng bứt), **tired** (đuối sức, có thể kéo vào). Người chơi giữ nút để kéo về và thả để nhả dây.

- Cá đuối sức phục hồi sau khi nghỉ quá `REST_BEFORE_RECOVERY` = 3 giây.
- Cá được kéo vào khi khoảng cách còn dưới `LANDED_WITHIN` = 0,6 m.
- Dây đứt khi lực căng vượt ngưỡng; cá tuột móc sau `MAX_FIGHT_S` = 70 giây.
- Một khung hình không tiến cuộc giằng co quá 0,1 giây.

Các hằng số trong `fight.ts` là **ước lượng chưa được tinh chỉnh bằng chơi thật**. Bot trong `tests/fight.test.mjs` cho thấy người chơi cẩn thận thường bắt được cá trong vài chục giây và giữ nút liên tục luôn làm đứt dây, nhưng đó không thay cho cảm nhận trên điện thoại thật.

`fight-look.ts` biến các số này thành chuyển động: màu dây đổi theo lực căng, cá bơi dưới nước theo tâm trạng (`underwater.ts`), và dây cá tuột quay về cần khi đứt. Không có chữ hiện trong cuộc giằng co.

## Cần, dây và cá dưới nước

- Cần (`rod.ts`) là lò xo tắt dần, dài 4 m, cong theo lực kéo của dây và rung khi cá giật. Đầu cần là nơi dây bắt đầu, nên dây và cần luôn khớp nhau.
- Dây (`rope.ts`) là Verlet giữa đầu cần và lưỡi hoặc miệng cá; khi chờ thì chùng và nằm trên mặt nước, khi cá kéo thì thẳng.
- Dải dây (`ribbon.ts`) luôn quay mặt về camera, dày khoảng 2 đến 3 px.
- Cá trong cuộc giằng co bơi dưới mặt nước. `underwater.ts` tính độ sâu theo tâm trạng và dùng cùng hàm sóng như mặt biển, cắt mọi phần trên mặt nước và làm mờ theo độ sâu. Không có pass render riêng.

Các hình ảnh này được kiểm tra bằng ảnh chụp phần mềm và kiểm thử trong `tests/underwater.test.mjs`; chưa được kiểm tra trên điện thoại thật.

## Vật lý thuyền

`createBoatPhysics` (`src/ocean/boat-physics.ts`) là thân Havok cho thuyền của người chơi. Hàm này cộng thêm những gì Havok không biết: phao nổi theo hàm sóng dùng chung (`waveHeight`), lực cản nước, lực đẩy và lái. Mọi lực được áp dưới dạng xung lực (lực × dt) trước mỗi bước Havok, nên không phụ thuộc tốc độ khung hình. Mũi thuyền hướng về -Z, khớp mô hình di chuyển của `model.ts`. Các thuyền người khác không chạy Havok; chúng được vẽ từ trạng thái server.

Vật lý thuyền được kiểm tra bằng `tests/boat-physics.test.mjs` và `tests/hull-handling.test.mjs`.

## Lưu trên thiết bị

`save.ts` lưu vị trí thuyền, kho cá và số cá đã bắt (`caught`) trong localStorage, theo tài khoản (khóa `photyphu:sea:v1:<uid>` như ghi trong [biển chung](ocean.md)). Dữ liệu đọc lại được kiểm tra: vị trí không hợp lệ, quá cũ hoặc nằm trong đảo thì rơi về bến, nhưng kho cá được giữ. Đây là trạng thái của thiết bị, không phải tài sản của tài khoản.

## Ranh giới tin cậy

Việc bắt cá là báo cáo của client. Khi người chơi giữ cá, `src/app/ocean.ts` truyền sự kiện vào `marketUi.recordCatch` (`src/app/market-ui.ts`). Chỉ lỗi `network` mới đưa cá vào hàng đợi thử lại; các lỗi khác bỏ cá đó. Server chỉ giới hạn tốc độ, khoảng cân nặng và sức chứa sổ; nó không chứng minh cá là thật.

## Kiểm thử

- `tests/fishing.test.mjs`: vùng, `rollFish`, kho cá.
- `tests/cast-rules.test.mjs`: nhấn nút, khoảng ném, trạng thái ném bị chặn.
- `tests/fight.test.mjs` và `tests/fight-look.test.mjs`: máy trạng thái và số đo hình ảnh.
- `tests/rod-rope.test.mjs`, `tests/rod-plan.test.mjs`, `tests/underwater.test.mjs`: cần, dây và cá dưới nước.
- `tests/ocean-fishing-browser.mjs` và `tests/ocean-cast-browser.mjs`: luồng câu trong trình duyệt.

Chưa có bằng chứng từ điện thoại thật cho độ dễ chạm, rung, hay hiệu năng của cuộc giằng co.
