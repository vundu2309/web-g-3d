---
type: operations
title: Quy trình mô hình 3D, bảng màu và kiểm tra tài sản
description: Mô hình GLB trong public/models được dựng từ script trong tools/blender (không có file .blend trong repository), danh mục assets.json là nguồn kiểm tra, bảng màu PAL được xuất sang Blender, lệnh dựng lại trong Blender riêng, và render harness chỉ để xem trước bằng phần mềm.
tags:
  - blender
  - glb
  - assets
  - palette
  - manifest
  - operations
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-07aadd4ccd73b3c93abdbe2f
    resource: repo://scripts/check-asset-rebuild.mjs
  - id: openwiki-source-89372b3bc3c28e014fbf67ee
    resource: repo://scripts/export-palette.mjs
  - id: openwiki-source-5a3dfce016106efb1ef48a0d
    resource: repo://src/ocean/art/colors.ts
  - id: openwiki-source-7e4a998fc02d8f0c2ddb4985
    resource: repo://src/ocean/model-loader.ts
  - id: openwiki-source-4c18cc0c5cfb8d8f648ea790
    resource: repo://tests/assets-manifest.test.mjs
  - id: openwiki-source-1e9fadd0f4cce9ee570e368a
    resource: repo://tests/models.test.mjs
  - id: openwiki-source-c6364306a16e761e99147b5c
    resource: repo://tools/blender/assets.json
  - id: openwiki-source-e6323877f09e8aa1601235a3
    resource: repo://tools/blender/build.py
  - id: openwiki-source-fd1644d9b31ac8bb776042a7
    resource: repo://tools/blender/people.py
  - id: openwiki-source-01f419fecad824831d78571b
    resource: repo://tools/blender/rebuild.py
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---

# Quy trình mô hình 3D, bảng màu và kiểm tra tài sản

Mô hình 3D của biển được dựng bằng Blender từ script trong `tools/blender/`, rồi commit thành GLB trong `public/models/`. Build thường và CI không cần Blender: các GLB đã nằm trong repository. Blender chỉ cần khi dựng lại tài nguyên. Nguồn của một mô hình là script của nó (hoặc một tệp tải về cho các loài vật biển), còn GLB là kết quả dựng. Chi tiết và quy tắc đầy đủ nằm trong [docs/assets.md](../../docs/assets.md).

## Các thành phần

| Phần | File | Vai trò |
| --- | --- | --- |
| Danh mục | `tools/blender/assets.json` | Mọi GLB: nhóm, script nguồn, cách chạy, tên node mà game tra cứu, và trần số tam giác (đo lúc viết, cộng 2 %). Phần `scripts` liệt kê các script không tự xuất GLB. |
| Dựng lại | `tools/blender/rebuild.py` | Đọc danh mục và chạy từng script trong một Blender **riêng** (cài đặt gốc, không lưu gì, không dùng phiên đang mở). |
| Script theo nhóm | `baits.py`, `boat.py`, `upgrade_boats.py`, `patrol_boat.py`, `props.py`, `vendors.py`, `rowers.py`, `people.py`, `build.py` | Mỗi nhóm một script hoặc nhiều script; `lib.py` là thư viện dùng chung (màu đỉnh, ngân sách, xuất GLB); `sea_import.py` ghi các loài vật biển tải về theo đúng bố cục của game. |
| Cần câu | `tools/blender/rods.py` | Cảnh `Rods`, chưa xuất GLB; ghi là “đang chờ” trong danh mục. |
| Bảng màu nguồn | `src/ocean/art/colors.ts` (`PAL`) | Một nơi duy nhất cho màu theo vai trò. |
| Xuất bảng màu | `scripts/export-palette.mjs` → `tools/blender/palette.json` | Sao chép `PAL` để Blender dùng đúng màu, không có bảng hex thứ hai. |
| Kiểm tra dựng lại | `scripts/check-asset-rebuild.mjs` | So các GLB dựng lại với các GLB đã commit: tam giác, node và màu đỉnh; không so từng byte. |
| Tệp GLB | `public/models/*.glb` | Thư mục hiện có 44 tệp GLB tại lần chạy này (thuyền, thuyền tuần tra, bến, đảo và prop, mồi, cá, mèo người bán, người, thuyền chèo, cửa hàng). |
| Nạp trong trình duyệt | `src/ocean/model-loader.ts`, `src/ocean/glb-parts.ts` | Nạp GLB, gộp mesh tĩnh, giữ tách các phần có hoạt hình. |
| Ảnh xem trước | `tools/render-harness/` (`preview.html`, `shoot.mjs`) | Chụp ảnh biển từ các góc cố định, dùng WebGL phần mềm (SwiftShader) trong Chrome, để so trước và sau. |

## Lệnh

- `npm run assets:palette`: ghi `tools/blender/palette.json` từ `PAL`. Chạy trước khi dựng lại.
- `npm run assets:rebuild -- --out <thư mục> [nhóm | tệp.glb ...]`: chạy `tools/blender/rebuild.py` trong Blender riêng (đường dẫn Blender lấy từ biến `BLENDER`, mặc định là cài đặt macOS) và ghi GLB vào thư mục đã chọn; không ghi đè `public/models`.
- `node scripts/check-asset-rebuild.mjs <thư mục>`: so thư mục vừa dựng với GLB đã commit.
- `npm run assets`: chạy `assets:palette` rồi `tools/blender/build.py` bằng `.blender-venv`. Đây là đường dựng cũ, phụ thuộc môi trường Python cục bộ; không nằm trong CI.

Kết quả đo ngày 2026-11-20 (Blender 5.x), theo `docs/assets.md`: 27 mô hình tự dựng (trừ 10 loài vật biển tải về) dựng lại có cùng số tam giác, node và màu đỉnh. Chưa so byte. Chưa có kiểm chứng trong repository rằng môi trường Blender của máy phát triển đang hoạt động.

## Danh mục và kiểm tra

`tests/assets-manifest.test.mjs` đọc `assets.json` và báo lỗi khi:

- một GLB trong `public/models/` không có mục trong danh mục, hoặc có mục mà không có tệp;
- một script nguồn không tồn tại;
- một node mà game tra cứu bị thiếu (ví dụ `body` và `hook` của mồi, đọc bởi `parseFishGlb`);
- một mesh không có `COLOR_0` (cần chạy `lib.bake_colors` trước khi xuất);
- một tệp vượt trần tam giác.

Các kiểm thử theo nhóm vẫn ghim số liệu và bố cục riêng của từng nhóm: `tests/models.test.mjs` (người bán và người), `tests/boat-models.test.mjs`, `tests/bait-models.test.mjs`, `tests/fish-models.test.mjs`, `tests/props-models.test.mjs`. `tests/cats.test.mjs` kiểm tra mỗi chợ có một mèo người bán (`vendor.look`). `tests/art-palette.test.mjs` kiểm tra mã nguồn lấy màu từ bảng dùng chung, không có màu trùng dưới hai tên. `tests/assets-manifest.test.mjs` là danh mục bao phủ tất cả.

Ngân sách tam giác của người bán trong `build.py`: thân `vendor_body` không quá 4800, tay `vendor_arm` không quá 500.

## Nạp trong trình duyệt

`src/ocean/model-loader.ts` nạp GLB bằng `LoadAssetContainerAsync` của Babylon. Với mỗi tệp:

- Mesh nhận chất liệu satin dùng chung và màu đỉnh đã được nướng từ bảng màu.
- Vật liệu gốc của GLB bị bỏ, nên màu chỉ đến từ bảng màu của game.
- Mesh tĩnh được gộp thành một (`loadMergedModel`) để giảm số lời gọi vẽ; mô hình có hoạt hình (như người vẫy tay) được tách từng phần.

Pipeline xuất glTF theo trục Y hướng lên, còn scene của biển dùng hệ tay phải.

## Quy tắc

1. Sửa mô hình trong script, dựng lại, rồi commit script và GLB cùng lúc. Không sửa trong Blender rồi xuất mà không đưa thay đổi về script.
2. GLB mới: thêm mục vào `assets.json` trong cùng commit (nhóm, nguồn, node, trần). Nâng trần là một quyết định phải nêu trong commit, không phải cách làm test qua.
3. Màu lấy từ bảng màu (`palette.json`, làm mới bằng `npm run assets:palette`), không hex riêng trong script.
4. Mô hình tải về (`"source": "community"`) giữ tác giả và giấy phép trong `docs/ocean.md`.
5. Thư mục tạm, ảnh chụp và nhật ký không đặt trong thư mục gốc repository; dùng `test-results/` (đã bỏ qua khi commit).

## Ranh giới

- Ảnh concept trong `docs/design` là đề xuất thị giác, không phải bằng chứng render.
- Ảnh từ `tools/render-harness` là ảnh phần mềm, không phải số liệu trên thiết bị.
- Số liệu GPU, bộ nhớ và tốc độ khung hình trên điện thoại thật không có trong repository.
- Đường dẫn Blender và cấu hình máy phát triển không được ghi vào tài liệu hay mã nguồn.
