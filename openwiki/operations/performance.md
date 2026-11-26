---
type: operations
title: "Hiệu năng: ngân sách, mẫu và cách báo cáo chi phí"
description: "Ngân sách khung hình, giới hạn pixel và tam giác, các mẫu đã dùng trong biển, và cách một thay đổi báo cáo chi phí. Nguồn chính là docs/performance.md; số liệu từ điện thoại thật chỉ có một bản đo."
tags:
  - performance
  - ocean
  - budget
  - operations
sources:
  - id: openwiki-source-31c19986b3dccb7e5f94f641
    resource: repo://src/ocean/clear-water.ts
  - id: openwiki-source-3bbefb7832d13605e3b3aaf4
    resource: repo://src/ocean/frame-pacing.ts
  - id: openwiki-source-5a32cee2477c163681902453
    resource: repo://src/ocean/perf-meter.ts
  - id: openwiki-source-9f8d223fef339cb1b921902a
    resource: repo://src/ocean/probe.ts
  - id: openwiki-source-bb95ce7cbb173b2e53b25ce5
    resource: repo://src/ocean/wildlife.ts
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
---

# Hiệu năng: ngân sách, mẫu và cách báo cáo chi phí

Trang này tóm tắt [docs/performance.md](../../docs/performance.md), tài liệu viết tay là nguồn chính. Khi hai bên lệch nhau, mã nguồn và test là căn cứ, và tài liệu cần được sửa cùng commit.

Nguyên tắc của chủ dự án vẫn đúng: **làm đẹp trước, tối ưu sau** ([quy trình agent](../../docs/agent-workflow.md)). Một chi phí được thêm khi giao diện cần, được ghi lại, và có công tắc để tắt trên máy yếu. Model cộng đồng không bị giảm tam giác bằng tay.

## Ngân sách khung hình

- Mục tiêu trên điện thoại: khoảng 30 fps trở lên ở render scale ban đầu. Một lần đo thật trên điện thoại cho khoảng 39 fps ở scale 1 và khoảng 23 fps ở scale 1,5.
- Bảng đo chuyển đỏ (“! SLOW”) khi dưới 24 fps, hoặc 5% khoảng cách khung lớn nhất trên 60 ms, hoặc chi phí luồng chính trung bình trên 28 ms, hoặc có 3 lần giật (khoảng cách trên 50 ms) trong 2 giây. Ngưỡng nằm trong `POOR` và `HITCH` của `src/ocean/perf-meter.ts`.
- Vẽ tối đa khoảng 100 fps (`MIN_INTERVAL = 10` ms, `src/ocean/frame-pacing.ts`). Khi không kịp, bộ pacer chuyển từ `full` sang `eco` (khoảng 30 fps).

Thay đổi làm bảng chuyển đỏ trên điện thoại vốn không đỏ là vượt ngân sách, dù số tam giác bao nhiêu.

## Giới hạn pixel và lớp

| Mục | Giới hạn | Nơi quy định |
| --- | --- | --- |
| Render scale trên màn cảm ứng | Bắt đầu ở 1; hạ sau hai cửa sổ chậm 2 giây liên tiếp (bỏ qua 4 giây đầu), nâng lại sau năm cửa sổ nhanh | `src/ocean/render-scale.ts`, `babylon-scene.ts` |
| Lớp nước trong | Bật lúc đầu; tầm 70 m trên màn cảm ứng (`TOUCH_REACH`), 170 m nơi khác; tắt sau hai cửa sổ chậm, bật lại sau tám cửa sổ nhanh, tối đa hai lần. Bị bỏ trước khi render scale bị hạ | `src/ocean/clear-water.ts` |
| Props đảo trên màn cảm ứng | Vẽ tới 750 m (1.400 m nơi khác) | `FOG_CUT_TOUCH`, `FOG_CUT` trong `src/ocean/prop-lod.ts` |

Lớp nước trong là chi phí đo được lớn nhất trên điện thoại (khoảng một nửa khung hình). Tính năng mới toàn màn hình hoặc render target phải tắt được bằng bộ điều tiết hoặc công tắc địa chỉ trang.

## Tam giác và mesh

Repository không có trần tam giác toàn cảnh đo trên điện thoại. Các giới hạn đang được code và test áp dụng:

- Một đảo kèm chi tiết: 9.000 đến 26.000 tam giác (không tính lưới địa hình); đảo phông dưới 6.500 (`tests/map-detail.test.mjs`).
- Thuyền người chơi kèm cần: dưới khoảng 6.000 (`tests/boat-model.test.mjs`).
- Một người bán: thân tối đa 4.900 và tay tối đa 600 (`tests/models.test.mjs`).
- Động vật được vẽ cùng lúc: 200.000 tam giác, gần nhất trước (`TRIANGLE_BUDGET` trong `src/ocean/wildlife.ts`).

Các con số về số tam giác đang hoạt động ở bến cảng và đảo lấy từ trình duyệt phần mềm, không phải điện thoại; xem `docs/performance.md`.

## Bộ nhớ và tải xuống

Chunk Babylon (1,73 MB, 409 KB nén) và WASM của Havok (2,09 MB, 658 KB nén) chỉ tải khi vào biển và không nằm trong precache của service worker. Render target được tính khi thêm; lớp nước trong khoảng 7 MB cho máy 2x cộng bộ đệm multisample. Không thêm render target nếu chưa ghi kích thước.

## Mẫu đang dùng

Dùng một mẫu có sẵn trước khi tự nghĩ ra mẫu mới:

1. **Chọn mức chi tiết theo kích thước hiển thị**: bản đầy đủ, bản thô, bản xa, rồi không vẽ (`wildlife.ts`, `prop-lod.ts`, `prop-batches.ts`).
2. **Bản thô được tạo lúc nạp** bằng `simplify.ts` từ chính tam giác của model; model gốc không bị đổi.
3. **Biến mất bằng dither**, không bật tắt đột ngột (`DitheredTileFadeMaterialPlugin` cho động vật).
4. **Một mesh, nhiều instance** (thin instance), kèm kiểm tra frustum riêng cho prop (`prop-batches.ts`).
5. **Đặt chi phí sau một điều kiện**: shader rẽ nhánh theo uniform, CPU thoát sớm.
6. **Bộ điều tiết** là số thuần trong file riêng có test: khởi động trước, hai cửa sổ chậm liên tiếp mới hạ, quay lại chậm hơn, không phản ứng với giới hạn 30 fps.
<!-- openwiki: broken internal link [ocean-rendering.md] file "ocean-rendering.md" does not exist. Fix the href or restore the target, then delete this comment. -->
7. **Công tắc trên địa chỉ trang** cho mọi chi phí lớn: `?reflect=0`, `?fish=0`, `?props=0`, `?tiers=0`, `?yards=0`, `?cats=0` (mèo chèo), `?planes=0` (thủy phi cơ), `?scale=1` (`src/ocean/probe.ts`); Theo `probe.ts`, chỉ `waves` được đọc từ dữ liệu đã lưu trên thiết bị; các công tắc khác chỉ đến từ địa chỉ trang. Xem [biển, bầu trời và nước](ocean-rendering.md).
8. **Toán thuần trước**: phần không cần Babylon hay GPU nằm trong file không import engine và có test thuần.
9. **Một nguồn cho CPU và shader**: `waves.ts` dùng chung cho thuyền và shader nước.

## Cách một thay đổi báo cáo chi phí

1. Ghi chi phí mới vào `docs/ocean.md`, mục “Performance pass”: chạy mỗi khung gì (lượt vẽ, tam giác, kích thước texture, công việc shader, số ô CPU) và trong điều kiện nào. Ghi “chưa đo trên điện thoại” nếu chưa đo.
2. Làm cho nó tắt được (điều kiện, bộ điều tiết hoặc công tắc).
3. Đếm những gì test đếm được: tam giác, số instance, số ô, số lượt vẽ. Không trình bày thời gian khung từ trình duyệt phần mềm như fps điện thoại.
4. Có giới hạn trong code thì cần test làm hỏng khi giới hạn bị vi phạm.
5. Đo trên điện thoại khi có thể: mở game với `?perf` (hoặc thẻ “Khung đo hiệu năng” trong Cài đặt), ghi fps, khoảng cách khung p95, chi phí luồng chính, số giật, render scale, trạng thái lớp nước trong, số tam giác và mesh đang hoạt động. Ghi rõ số lần đo.

## Chưa biết

- Chưa có số đo điện thoại sau các thay đổi: props gộp, gương “lean”, chế độ nước trong dạng depth và hull-to-water. Mục “Not measured” trong `docs/ocean.md` vẫn mở.
- Chưa có trần tam giác hoặc draw call toàn cảnh đo trên điện thoại.
- Trình duyệt không cung cấp thời gian GPU, nên việc nghẽn GPU và nghẽn CPU trông giống nhau cho đến khi thử tắt một công tắc.
- Không có kiểm tra tự động nào báo lỗi khi cả khung vượt ngân sách; các test hiện chỉ bảo vệ từng mục.
