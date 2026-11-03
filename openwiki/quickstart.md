---
type: quickstart
title: Bắt đầu với Hải trình
description: Bản đồ tác vụ để chạy, sửa sóng, hiểu vòng đời, kiểm tra và deploy web game 3D Hải trình.
tags: [quickstart, navigation, game]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T07:23:24.494Z
sources:
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-f076bde49e0d74deae49ea82
    resource: repo://src/game/ocean/scene.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-d68353aa5a7b304d05de84d2
    resource: repo://src/platform/physics.ts
generated: { by: "codex", at: "2026-11-03T07:23:24.494Z" }
---

# Bắt đầu với Hải trình

Hải trình hiện là cảnh biển 3D tương tác bằng Babylon.js và TypeScript, build tĩnh bằng Vite. Người dùng xoay/zoom camera và đổi cường độ sóng. App chưa có nhiệm vụ hoặc hệ lái thuyền. OpenWiki hỗ trợ đọc hiểu source; nó là công cụ phát triển trong devDependencies, không được app import vào game.

## Chọn tác vụ

| Bạn cần làm gì? | Đọc ở đâu? | Điểm vào source |
| --- | --- | --- |
| Chạy source, build, kiểm tra | [Phát triển và deploy](operations/development.md#cài-đặt-và-chạy) | `package.json` |
| Sửa hình dạng hoặc nhịp sóng | [Trường sóng](architecture/ocean.md#trường-sóng-và-thuyền-nổi) | `src/game/ocean/waves.ts`, `materials.ts` |
| Sửa phản xạ, gợn hoặc bọt nước | [Bề mặt nước](architecture/ocean.md#bề-mặt-nước-và-hình-ảnh) | `src/game/ocean/materials.ts` |
| Sửa mô hình thuyền | [Kiến trúc](architecture/ocean.md) | `src/game/ocean/boat.ts` |
| Xử lý leak/HMR, listener, vòng render | [Ownership](architecture/ocean.md#luồng-khởi-động-và-ownership) | `src/main.ts`, `src/app/start.ts` |
| Thêm vật lý va chạm thật | [Ranh giới Havok](architecture/ocean.md#ranh-giới-havok) | `src/platform/physics.ts`, `src/game/playground.ts` |
| Kiểm tra bản deploy hoặc sửa CI | [GitHub Pages](operations/development.md#github-pages) | `.github/workflows/pages.yml` |
| Cập nhật/tra cứu wiki qua Codex | [OpenWiki](operations/development.md#openwiki-trong-codex) | `.codex/config.toml`, `openwiki/INSTRUCTIONS.md` |

## Chạy nhanh

Từ repo root: `npm ci`, `npm run dev`. Giữ dev server chạy rồi dùng `npm run test:ocean`. Chạy `npm run build` để kiểm tra kiểu và tạo `dist`; `npm run preview` xem bản production. Kiểm tra console và xem ảnh/video thực để đánh giá sóng, không coi test xanh là bảo đảm chất lượng hình ảnh.

## Ranh giới cần nhớ

Thuyền nổi bằng lấy mẫu trường sóng trên CPU, chưa có lực nổi Havok. Scene thử Havok vẫn tồn tại để kiểm tra va chạm riêng. Render loop, listener và Engine thuộc app; scene sở hữu mesh/material. Khi đổi phương trình GPU cần giữ CPU sampling tương ứng.

Push `main` kích hoạt build/deploy Pages. Workflow hiện không tự sinh wiki và không chạy test trình duyệt. Xem [hướng dẫn vận hành](operations/development.md) để biết khác biệt giữa kiểm tra local/cloud và CI.

## Độ tin cậy của tài liệu

Trang wiki có nguồn và Claims do OpenWiki quản lý. Kiểm tra code hiện tại trước thay đổi quan trọng; tài liệu có thể cũ sau lần sửa source. Không sửa tay Claims/index/metadata. Yêu cầu coding agent cập nhật wiki theo `openwiki/INSTRUCTIONS.md` khi hành vi thay đổi.
