---
type: operations
title: Pipeline Blender cho người bán và tài nguyên biển
description: Cách tools/blender dựng năm GLB người bán trong public/models từ bảng màu của game, kiểm tra ngân sách tam giác và bù bảng màu; ranh giới với build thường, và ảnh concept không phải bằng chứng render.
tags:
  - blender
  - assets
  - glb
  - palette
  - operations
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
sources:
  - id: openwiki-source-89372b3bc3c28e014fbf67ee
    resource: repo://scripts/export-palette.mjs
  - id: openwiki-source-b74a0148e8da645da45494f8
    resource: repo://src/ocean/market-vendor.ts
  - id: openwiki-source-7e4a998fc02d8f0c2ddb4985
    resource: repo://src/ocean/model-loader.ts
  - id: openwiki-source-1e9fadd0f4cce9ee570e368a
    resource: repo://tests/models.test.mjs
  - id: openwiki-source-e6323877f09e8aa1601235a3
    resource: repo://tools/blender/build.py
  - id: openwiki-source-7cf57e730d079e8b6775cc81
    resource: repo://tools/blender/palette.json
  - id: openwiki-source-fd1644d9b31ac8bb776042a7
    resource: repo://tools/blender/people.py
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
---

# Pipeline Blender cho người bán và tài nguyên biển

## Phạm vi

<!-- openwiki: broken internal link [ocean.md] file "ocean.md" does not exist. Fix the href or restore the target, then delete this comment. -->
Pipeline này tạo các model người bán ở chợ cá (`people-1.glb` đến `people-5.glb`) cho [biển đánh cá](ocean.md). Model được commit sẵn trong `public/models`, nên build thường và CI không cần Blender. Chỉ khi chỉnh sửa hình thể, cần chạy lại pipeline.

## Thành phần

| File | Trách nhiệm |
| --- | --- |
| `tools/blender/build.py` | Điểm vào headless (cần `bpy`): dựng từng người, gộp phần tay vẫy, xuất GLB vào `public/models` |
| `tools/blender/people.py` | Dựng hình người bằng script (1273 dòng): thân, tay, đầu, tóc, giày; quần áo là màu của lớp phủ theo từng vòng |
| `tools/blender/lib.py` | Tiện ích chung: reset cảnh, đếm tam giác, `finish` (ngân sách), vật liệu theo `PAL` |
| `tools/blender/palette.json` | Bảng màu sao chép từ `src/ocean/art/colors.ts`, không phải nguồn độc lập |
| `scripts/export-palette.mjs` | Ghi `palette.json` từ `PAL` bằng resolver TypeScript của unit test |
| `src/ocean/model-loader.ts` | Nạp GLB bằng Babylon `LoadAssetContainerAsync`, bỏ vật liệu gốc và áp màu đỉnh của game |

Mỗi người có hai mesh: `vendor_body` (mọi phần trừ tay phải) và `arm_wave` (trục xoay ở vai phải để vẫy tay). Chiều cao được đặt theo độ cao của quầy hàng; thân người 1,70 m trước khi co giãn.

## Quy trình

1. Đổi màu trong `src/ocean/art/colors.ts`.
2. `npm run assets:palette` ghi `tools/blender/palette.json` từ `PAL`.
3. `npm run assets` (gồm bước trên) chạy `.blender-venv/bin/python tools/blender/build.py`. Có thể truyền danh sách tên như `people-1` để chỉ dựng một người. Môi trường cài một lần bằng `uv venv .blender-venv --python 3.13` và `uv pip install bpy`.
4. Kiểm tra các GLB được commit.
5. Commit cả palette và GLB khi thay đổi hình thể.

Biến môi trường `PEOPLE_STATS` in số tam giác từng phần; `PEOPLE_RAW` bỏ ngân sách để xem mô hình chưa tối ưu.

## Ngân sách và kiểm chứng

`build.py` đặt ngân sách `vendor_body` 4800 tam giác và `vendor_arm` 500. `tests/models.test.mjs` kiểm tra mỗi GLB: đúng header `glTF` phiên bản 2, có màu đỉnh, nằm trong ngân sách của test (4900 thân và 600 tay), có animation tương ứng, và có người cho từng chợ trong `MARKETS`. Ngân sách trong test lỏng hơn một chút so với build; test là chốt kiểm tra đầu vào cho file đã commit.

`tests/art-palette.test.mjs` kiểm tra các file hình đã di chuyển không được thêm mã màu hex riêng; màu phải đến từ `colors.ts` theo vai trò.

Các test này chỉ chứng minh file hợp lệ và trong ngân sách. Chúng không chứng minh model trông đúng trên điện thoại thật hay đủ nhanh trên thiết bị yếu.

## Ranh giới

- Ảnh trong `docs/design/sea-creatures-*.png` và `docs/design/theme.md` là concept đã duyệt, không phải render từ game. Không dùng chúng làm bằng chứng về hình dạng cuối cùng.
- Người bán không có tác dụng luật; chúng chỉ trang trí và chào người chơi khi mở chợ.
- Nếu file không nạp được, quầy hàng vẫn chạy mà không có người bán.
- Pipeline không chạy trong CI; cần máy có Blender khi chỉnh sửa.

Xem thêm [phát triển và kiểm tra](development.md) và [kiến trúc biển](../architecture/ocean.md).
