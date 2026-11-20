---
type: operations
title: Quy trình mô hình 3D và bảng màu
description: Cách tools/blender dựng các GLB trong public/models (thuyền, đảo, cá, mèo người bán, người), bảng màu của game được xuất sang Blender, cách model-loader nạp GLB, các kiểm tra ngân sách và ranh giới với build thường.
tags:
  - blender
  - glb
  - assets
  - palette
  - operations
sources:
  - id: openwiki-source-89372b3bc3c28e014fbf67ee
    resource: repo://scripts/export-palette.mjs
  - id: openwiki-source-5a3dfce016106efb1ef48a0d
    resource: repo://src/ocean/art/colors.ts
  - id: openwiki-source-7e4a998fc02d8f0c2ddb4985
    resource: repo://src/ocean/model-loader.ts
  - id: openwiki-source-1e9fadd0f4cce9ee570e368a
    resource: repo://tests/models.test.mjs
  - id: openwiki-source-e6323877f09e8aa1601235a3
    resource: repo://tools/blender/build.py
  - id: openwiki-source-fd1644d9b31ac8bb776042a7
    resource: repo://tools/blender/people.py
generated: { by: "claude-code", at: "2026-11-20T02:01:25.414Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T03:06:03.643Z
---

# Quy trình mô hình 3D và bảng màu

Mô hình 3D của biển được làm bằng Blender và commit thành GLB trong `public/models`. Build thường và CI không cần Blender: các GLB đã nằm trong repository. Blender chỉ cần khi dựng lại tài nguyên.

## Các thành phần

| Phần | File | Vai trò |
| --- | --- | --- |
| Bảng màu nguồn | `src/ocean/art/colors.ts` (`PAL`) | Một nơi duy nhất cho màu theo vai trò; thuyền, đảo, prop, cần câu lấy màu từ đây. |
| Xuất bảng màu | `scripts/export-palette.mjs` → `tools/blender/palette.json` | Sao chép `PAL` để Blender dùng đúng màu của game, không có bảng hex thứ hai. Chạy qua `npm run assets:palette`. |
| Dựng tài nguyên | `tools/blender/build.py` cùng `lib.py` và `people.py` | Script headless bằng `bpy`, chỉ xuất `people-N.glb` vào `public/models`. `boat.py`, `props.py`, `vendors.py` và `sea_import.py` có trong thư mục nhưng `build.py` không gọi. |
| Tệp GLB | `public/models/*.glb` (29 tệp) | Thuyền `boat.glb`; đảo `bush-*` (3), `palm-*` (3), `rock-*` (3), `hut.glb`; cá `fish-*.glb` (10 tệp); mèo người bán `cat-*.glb` (3 tệp); người `people-1..5.glb` (5 tệp). Đây là 29 tệp được commit trong repository; GLB khác đang nằm trên máy phát triển nhưng chưa commit (bait, thuyền `boat-2..4`, `shipyard.glb`) và không được mô tả như một phần của repository. |
| Nạp trong trình duyệt | `src/ocean/model-loader.ts`, `src/ocean/glb-parts.ts` | `loadMergedModel` gộp mesh thành một; phần GLB có thể hoạt hình được giữ tách. |
| Ảnh thử | `tools/render-harness/` (`preview.html`, `shoot.mjs`) | Trang xem trước và script chụp ảnh để kiểm tra bằng mắt. |

## Lệnh

- `npm run assets:palette`: ghi `tools/blender/palette.json` từ `PAL`. Chạy trước khi dựng lại.
- `npm run assets`: chạy `assets:palette` rồi `.blender-venv/bin/python tools/blender/build.py`. Môi trường `.blender-venv` phải được tạo trước bằng Python 3.13 và gói `bpy`. Đây là bước thủ công của người dựng tài nguyên, không nằm trong CI.
- `build.py` nhận danh sách tùy chọn (ví dụ `people-1`) để chỉ dựng một phần.

Chưa có kiểm chứng trong repository rằng môi trường Blender cục bộ đang hoạt động; các lệnh trên được ghi theo script.

## Ngân sách và kiểm tra

- `build.py` định nghĩa ngân sách tam giác cho người bán: thân `vendor_body` ≤ 4800, tay `vendor_arm` ≤ 500.
- `tests/models.test.mjs` đọc các tệp `people-N.glb` và kiểm tra: header glTF phiên bản 2, độ dài khai báo khớp, mỗi người có nút `vendor_body` và `arm_wave`, mọi primitive có `COLOR_0`, và số tam giác nằm trong ngân sách. Kiểm tra này không đọc các tệp mèo hay thuyền.
- `tests/cats.test.mjs` kiểm tra mỗi chợ trong `MARKETS` có một mèo người bán (`vendor.look`); người bán của chợ là mèo, không phải người trong `people-*.glb`.
- `tests/models.test.mjs` cũng kiểm tra “palette Blender là palette của game”. `tests/art-palette.test.mjs` kiểm tra các file hình ảnh lấy màu từ bảng dùng chung, không có màu trùng dưới hai tên, và vật liệu, hình khối, ánh sáng đi qua các helper dùng chung.
- `tests/props-models.test.mjs` và `tests/fish-models.test.mjs` kiểm tra prop và cá.

## Nạp trong trình duyệt

`src/ocean/model-loader.ts` nạp GLB bằng `LoadAssetContainerAsync` (phần loader Babylon). Với mỗi tệp:

- Mesh nhận chất liệu satin dùng chung (`useSolid(mesh, "satin")`) và màu đỉnh đã được nướng từ bảng màu.
- Vật liệu gốc của GLB bị hủy, nên màu chỉ đến từ bảng màu của game.
- `loadMergedModel` gộp các mesh thành một mesh để giảm số lời gọi vẽ (dùng cho đảo và prop). Các mô hình cần hoạt hình, như người vẫy tay, được tách thành từng phần.

Quy ước hệ tọa độ: pipeline xuất glTF Y-up, còn scene của biển dùng hệ tay phải (`useRightHandedSystem`, ghi trong `model-loader.ts`).

## Ranh giới

- Ảnh concept trong `docs/design` là đề xuất thị giác, không phải bằng chứng render; ảnh chụp từ `tools/render-harness` là ảnh phần mềm, không phải số liệu trên thiết bị.
- Số liệu GPU, bộ nhớ và tốc độ khung hình trên điện thoại thật không có trong repository.
- Đường dẫn Blender cục bộ và cấu hình máy phát triển không được ghi vào tài liệu hay mã nguồn.
