---
type: "Tham khảo"
title: "Biển, bầu trời, đảo, thuyền và nước trong"
openwiki_generated: true
sources:
  - id: openwiki-source-69220ba068a830c8d6971aab
    resource: repo://src/ocean/babylon-scene.ts
  - id: openwiki-source-d9131d826739d3342a0d1da1
    resource: repo://src/ocean/boat-physics.ts
  - id: openwiki-source-8dcaa9ba2e896610a017d745
    resource: repo://src/ocean/boat-visual.ts
  - id: openwiki-source-1b52e9143f6d9410082faea1
    resource: repo://src/ocean/fishing.ts
  - id: openwiki-source-3bbefb7832d13605e3b3aaf4
    resource: repo://src/ocean/frame-pacing.ts
  - id: openwiki-source-0afefe02a6a2455083bd16fe
    resource: repo://src/ocean/render-scale.ts
  - id: openwiki-source-4f39b221df21d7fba353b081
    resource: repo://src/ocean/shore.ts
  - id: openwiki-source-eb96b0ed9ab24df7884e4079
    resource: repo://src/ocean/waves.ts
generated: { by: "claude-code", at: "2026-11-20T02:01:25.414Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T03:06:03.643Z
---


# Biển, bầu trời, đảo, thuyền và nước trong

Biển được vẽ bằng Babylon.js trên một canvas duy nhất. `OceanScene` (`src/ocean/babylon-scene.ts`) sở hữu engine, scene, camera, và toàn bộ mesh; các module khác là hàm dựng mesh hoặc toán thuần. Trang này mô tả ranh giới giữa toán chạy trên CPU và GLSL chạy trên GPU, và thứ tự các phần được dựng. Chi tiết về cuộc câu nằm ở [câu cá](ocean-fishing.md); kết nối và đồng bộ thuyền nằm ở [realtime](ocean-realtime.md).

Không có bằng chứng hiệu năng trên điện thoại thật trong repository. Các ảnh chụp trong `docs/design` là concept hoặc ảnh chụp phần mềm, không phải bằng chứng render trên thiết bị.

## Ranh giới CPU và GPU

Ba thứ phải khớp nhau giữa CPU và GPU, nên được viết một lần:

- **Sóng**: `src/ocean/waves.ts` là hàm chiều cao mặt nước giải tích, dùng chung bởi thuyền Havok trên CPU (`boat-physics.ts`) và bởi GLSL (`glslWaveHeight`) trong shader của mặt biển, lớp nước trong, và cá dưới nước. Sóng gồm ba tầng: lừng (swell), trung bình và gợn (chop); bề mặt là hàm thuần của (x, z, t) nên CPU và GPU cho cùng chiều cao.
- **Bờ**: `src/ocean/shore.ts` đo khoảng cách tới bờ từ đường bao thật của từng đảo (`islandShape` trong `island-shape.ts`). Cùng một bảng được dùng bởi shader nước (sóng vỗ, độ sâu, màu), lớp bãi (`swash.ts`), bản đồ nhỏ và vùng câu cá.
- **Trời và ánh sáng**: `src/ocean/sea-style.ts` giữ màu và hướng mặt trời dùng chung; `sky-model.ts` là mô hình trời dưới dạng GLSL và toán để trời, nước và sương mù khớp nhau.

## Thứ tự dựng scene

Trong constructor của `OceanScene`:

1. Canvas và `Engine`, với `powerPreference: "low-power"`; độ sắc ban đầu là `1 / min(devicePixelRatio, 2)` trên chuột, và `1` trên màn cảm ứng (`pointer: coarse`); `ScaleGovernor` có thể làm thô hơn.
2. Scene với sương mù mũ (`FOGMODE_EXP2`) có màu bằng `HORIZON`, camera tự do không nhận đầu vào (điều khiển do `chase-camera.ts` và `orbit-camera.ts`).
3. `enableSeaPhysics` gắn plugin Havok (`havok.ts` tải WASM từ asset của Vite, không từ CDN).
4. Ánh sáng, nước (`water.ts`), trời (`sky.ts`), phản chiếu (`reflection.ts`, mặt phẳng gương, loại trừ vật liệu nước trong `reflection-model.ts`).
5. Lớp nước trong (`clear-water.ts`, `clear-water-pass.ts`), nếu được phép.
6. Mẫu thuyền từ `palette.ts`, đảo từ `island-visual.ts`, rồi cần câu (`fishing-gear.ts`).
7. Model GLB cho thuyền (`boat-model.ts`) và đảo (`island-models.ts`, `island-layout.ts`) tải bất đồng bộ; nếu tải lỗi, hình dựng bằng code vẫn còn.
8. Chợ (`market.ts`, `market-visual.ts`), mèo người bán (`market-vendor.ts`), và `SeaProps` (`sea-props.ts`, `sea-layout.ts`) cho phao và chim mòng biển.

## Mặt nước và phản chiếu

`water.ts` là `ShaderMaterial` trên một lưới phẳng với đỉnh dời theo `glslWaveHeight`. Màu được trộn giữa nước sâu (`DEEP_WATER`, `DEEP_TEAL`), nước nông (`SHALLOW_WATER`) và đáy cát (`SEA_FLOOR`) theo `shore.ts`; sóng vỗ bờ và gợn (`ripples.ts`) và vệt thuyền (`wake.ts`) thêm vào. Mặt nước vẫn là shader **đục** và ghi độ sâu; lớp nước trong là việc riêng.

Phản chiếu dùng `MirrorTexture`: mọi mesh trong scene được đưa vào, trừ các vật liệu bị loại (`reflectsInWater`). Kích thước phản chiếu do `reflectionSize` quyết định.

## Đảo và bến

- `island-shape.ts` là toán thuần: chiều cao đất, đường bao, và `BEACH`, `SHELF`. Đất, bản đồ nhỏ và vùng câu dùng chung hàm này.
- `island-visual.ts` dựng mesh đảo từ hình dạng này, gộp các phần (cỏ, bụi, đá, cây, nhà) bằng code, mỗi phần thành một mesh đỉnh màu.
- `island-layout.ts` (toán thuần) và `island-models.ts` đặt các prop GLB (cọ, đá, nhà gỗ) theo vị trí cố định; trình kiểm thử đọc cùng layout.
- Đảo được đóng băng ma trận (`freezeWorldMatrix`) sau khi đặt, vì không di chuyển.
- Đảo đèn hải đăng là danh sách cố định trong scene.

Các đảo và bến được định nghĩa trong `src/ocean/model.ts` và `src/ocean/islands.ts`; kiểm thử trong `tests/shore.test.mjs` và `tests/water-extent.test.mjs`.

## Thuyền

Thuyền của người chơi là thân Havok, nhưng hình hiển thị được gộp: `boat-visual.ts` dựng thân bằng code thành **một** mesh đỉnh màu. `boat-model.ts` tạo instance cho thuyền người khác từ mẫu này, nên mỗi thuyền khác chỉ là một lời gọi vẽ rẻ. Khi `boat.glb` tải xong, thân GLB thay thế thân dựng bằng code cho mọi thuyền đang có. Cần câu gắn vào thuyền bằng `rod.ts` và mesh `rod-visual.ts`.

## Lớp nước trong

`clear-water.ts` là phần thuần: nước dày bao nhiêu trên một điểm, màu còn lại, và khi nào tắt. `clear-water-pass.ts` là phần GPU: một lớp màu riêng vẽ những thứ dưới mặt nước (sống thuyền, cọc bến, đá nông, phao, cá đang bị câu và dây), và mặt nước cho thấy lớp này qua nó, càng sâu càng mờ. Lý do chọn lớp riêng, thay vì depth texture hay pass trộn sau cùng, được ghi trong `clear-water.ts` (decision 0011, mục 18).

Lớp này là lớp nặng nhất và là lớp đầu tiên bị tắt khi khung hình chậm: `ClearWaterGovernor` đo khoảng thời gian giữa các khung và tắt lớp trước khi giảm độ phân giải. Khi tắt, mặt nước vẫn đục và cá dưới nước dùng da satin của chính nó (xem [câu cá](ocean-fishing.md)).

## Bộ điều tiết tốc độ vẽ

Có hai bộ điều tiết, theo thứ tự:

1. **Nhịp vẽ** (`frame-pacing.ts`): chế độ `full` vẽ theo khung hình của màn hình, nhưng không nhanh hơn khoảng 100 fps; chế độ `eco` vẽ khoảng 30 fps. Khi `full` không ổn định, nó chuyển sang `eco`, và sau một lúc thử lại `full`.
2. **Độ phân giải** (`render-scale.ts`, `ScaleGovernor`): cửa sổ 2 giây; khoảng thời gian trung bình trên 0,04 giây (khoảng 25 khung hình mỗi giây) là chậm, và phải chậm hai cửa sổ liên tiếp mới hạ một bước 0,25; dưới 0,03 giây là nhanh, và phải nhanh năm cửa sổ liên tiếp mới nâng lại. Mức thô nhất mặc định là 2. Trong bốn giây đầu (`WARMUP`) không quyết định gì, vì biên dịch shader và tải WASM làm số liệu không đại diện.

`ClearWaterGovernor` chạy trước `ScaleGovernor`: khi khung chậm, lớp nước trong tắt trước, và độ phân giải chỉ giảm khi lớp này đã tắt (tham số `hold` của `ScaleGovernor`).

Các bộ điều tiết được kiểm tra bằng toán thuần (`tests/frame-pacing.test.mjs`, `tests/clear-water.test.mjs`); chưa có số liệu đo trên thiết bị thật.

## Trời

`sky.ts` vẽ một vòm gradient theo camera, có mặt trời và mây trôi, bằng `glslSkyModel`. `sky-model.ts` có toán thuần để kiểm thử (`tests/sky-model.test.mjs`).

## Kiểm thử và giới hạn

- `tests/water-extent.test.mjs`, `tests/shore.test.mjs`, `tests/clear-water.test.mjs`, `tests/underwater.test.mjs`, `tests/sky-model.test.mjs`, `tests/waves.test.mjs`, `tests/frame-pacing.test.mjs`: chủ yếu là toán thuần; `tests/underwater.test.mjs` cũng có kiểm tra scene với engine headless.
- `tests/ocean-babylon-browser.mjs`, `tests/ocean-loading-browser.mjs` chạy scene trong trình duyệt.
- Chưa có kiểm chứng độ mượt, nhiệt độ và độ sắc trên điện thoại thật. Trên Safari iPhone, WebGL và Havok WASM cần kiểm tra riêng.
