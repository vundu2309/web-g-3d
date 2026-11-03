---
type: operations
title: Phát triển, kiểm tra và deploy
description: Cài đặt bằng lockfile, kiểm tra trình duyệt, deploy GitHub Pages và vận hành tích hợp OpenWiki cho Codex.
tags: [development, testing, deployment, openwiki]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T07:23:24.494Z
sources:
  - id: openwiki-source-ab585d88aca3958f2aa6a541
    resource: repo://.codex/config.toml
  - id: openwiki-source-5f219f204b3e870beec929d9
    resource: repo://.github/workflows/pages.yml
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-cccb7301733cfb64159c8c2f
    resource: repo://tests/ocean-smoke.mjs
generated: { by: "codex", at: "2026-11-03T07:23:24.494Z" }
---

# Phát triển, kiểm tra và deploy

## Cài đặt và chạy

Dùng Node.js 24 và npm 11 như README và workflow. Từ repo root, chạy `npm ci`, rồi `npm run dev`. Vite phục vụ dev server, mặc định cổng 5173; nếu bận Vite có thể chọn cổng khác. Đối chiếu log server rồi đặt `TEST_BASE_URL` khi chạy test với cổng khác.

`npm run build` chạy kiểm tra TypeScript trước Vite build. `npm run preview` phục vụ thư mục `dist`; lệnh này cần bản build hiện hành. Chạy `npm ci` khi đồng bộ lockfile thay vì tự cập nhật phiên bản dependency.

## Kiểm tra có ý nghĩa

`npm run test:ocean` dùng Chromium kiểm tra hai viewport 1440×900 và 390×844: khởi động, nút đổi sóng, ảnh canvas thay đổi, kích thước canvas và lỗi JavaScript/shader/HTTP. Mặc định trình duyệt ở `/usr/bin/chromium`, có thể đổi bằng `CHROMIUM_PATH`. Để kiểm tra production đang chạy, đặt `TEST_BASE_URL` đến preview server.

`npm run test:smoke` kiểm tra Havok trong scene thử riêng: 8 khối rơi, mô phỏng 600 bước, kiểm tra không xuyên nền, giới hạn 32 body và scene dispose. Test này import source qua Vite nên cần dev server. Nó không chứng minh thuyền có va chạm hoặc lực nổi thật.

Hai ảnh khác nhau chỉ chứng minh có thay đổi pixel, không chứng minh mặt nước tự nhiên. Đánh giá shader bằng ảnh/video thực, cùng góc nhìn và thời điểm, kiểm tra gợn gần camera, nhịp lặp, đường chân trời và nhiễu ở xa. Hai kích thước viewport không thay thế kiểm tra GPU/điện thoại thật.

## GitHub Pages

`.github/workflows/pages.yml` chạy khi push `main` hoặc được dispatch thủ công. Job build checkout, dùng Node 24, chạy `npm ci`, `npm run build` rồi upload `dist`. Job deploy chờ build và gọi `actions/deploy-pages` với quyền `pages: write`, `id-token: write`. GitHub Pages cần chọn Source là GitHub Actions.

Workflow hiện không chạy `test:ocean`, `test:smoke` hoặc sinh wiki. Không suy ra đã có test trình duyệt trong CI từ dấu build xanh. Vite dùng `base: './'` để asset hoạt động dưới `/web-g-3d/`. URL mặc định: https://vundu2309.github.io/web-g-3d/.

## OpenWiki trong Codex

`openwiki` là devDependency pin 0.7.3. `.codex/config.toml` dùng `npx --no-install openwiki mcp --host codex`; cần cài dependencies và mở Codex từ repo. `.agents/skills/openwiki` chứa hướng dẫn tích hợp. Sau lần cài đầu, mở lại Codex để nạp MCP; phiên đang chạy không tự có thêm công cụ trong danh sách tool.

Yêu cầu Codex cập nhật wiki từ source/test. Coding agent đọc repo và gửi từng trang qua lifecycle OpenWiki, còn OpenWiki quản lý Claims, evidence, index và metadata. Không sửa tay các file quản lý đó. Phạm vi biên soạn nằm trong `openwiki/INSTRUCTIONS.md`.

`npm run wiki:serve` phục vụ đồ thị/trình đọc local; `npm run wiki:export` xuất reader tĩnh vào `.openwiki-export/`, được Git ignore. Xuất reader không tự publish hoặc đổi game trên Pages. CLI standalone `--init`/`--update` cần provider riêng; không chép API key vào source, wiki hoặc game. `.env` và local state được ignore.

## Đi tiếp

[Kiến trúc và vòng đời](../architecture/ocean.md) · [Bắt đầu](../quickstart.md).
