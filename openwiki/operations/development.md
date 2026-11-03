---
type: operations
title: Phát triển, kiểm tra và deploy
description: Cài đặt bằng lockfile, kiểm tra trình duyệt, deploy GitHub Pages và vận hành tích hợp OpenWiki cho Codex.
tags: [development, testing, deployment, openwiki]
sources:
  - id: openwiki-source-ab585d88aca3958f2aa6a541
    resource: repo://.codex/config.toml
  - id: openwiki-source-5f219f204b3e870beec929d9
    resource: repo://.github/workflows/pages.yml
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-cccb7301733cfb64159c8c2f
    resource: repo://tests/ocean-smoke.mjs
generated: { by: "codex", at: "2026-11-03T08:01:10.530Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T08:01:10.530Z
---

# Phát triển, kiểm tra và deploy

## Cài đặt và chạy

Dùng Node.js 24 và npm 11 như README và workflow. Từ repo root, chạy `npm ci`, rồi `npm run dev`. Vite phục vụ dev server, mặc định cổng 5173; nếu bận Vite có thể chọn cổng khác. Đối chiếu log server rồi đặt `TEST_BASE_URL` khi chạy test với cổng khác.

`npm run build` chạy kiểm tra TypeScript trước Vite build. `npm run preview` phục vụ thư mục `dist`; lệnh này cần bản build hiện hành. Chạy `npm ci` khi đồng bộ lockfile thay vì tự cập nhật phiên bản dependency.

## Kiểm tra có ý nghĩa

`npm run test:ocean` dùng Chromium kiểm tra hai viewport 1440×900 và 390×844: khởi động, nút đổi sóng, ảnh canvas thay đổi, kích thước canvas và lỗi JavaScript/shader/HTTP. Browser helper dùng `CHROMIUM_PATH`, nếu không có thì dùng Chromium hệ thống khi được cài, cuối cùng là browser do Playwright quản lý. Cài browser bằng `npx --no-install playwright-core install --with-deps chromium`. Để kiểm tra production đang chạy, đặt `TEST_BASE_URL` đến preview server.

`npm run test:smoke` kiểm tra Havok trong scene thử riêng: 8 khối rơi, mô phỏng 600 bước, kiểm tra không xuyên nền, giới hạn 32 body và scene dispose. Test này import source qua Vite nên cần dev server. Nó không chứng minh thuyền có va chạm hoặc lực nổi thật.

Trên desktop, test còn giải mã ảnh canvas và kiểm tra một dải nước tiền cảnh dưới thuyền/trên HUD: cần có pixel trắng thưa, không biến mất toàn bộ và không phủ trắng mặt biển. Đây là kiểm tra regression cho whitecaps; khoảng coverage rộng không xác nhận bọt nằm đúng mọi đỉnh sóng hoặc có tính vật lý.

Hai ảnh khác nhau chỉ chứng minh có thay đổi pixel, không chứng minh mặt nước tự nhiên. Đánh giá shader bằng ảnh/video thực, cùng góc nhìn và thời điểm, kiểm tra gợn gần camera, nhịp lặp, đường chân trời và nhiễu ở xa. Hai kích thước viewport không thay thế kiểm tra GPU/điện thoại thật.

## Kiểm chứng tự động và ngữ cảnh agent

`npm run check` chạy lint, format, unit test, build và browser tests. ESLint kiểm tra import game/platform không ngược lên app/main, và giữ `waves.ts` dependency-free. Unit test kiểm tra đảo dịch chuyển sóng tại nhiều vị trí/thời điểm/cường độ và trường phẳng khi strength bằng 0.

`scripts/test-browser.mjs` tự mở Vite ở cổng trống, chạy ocean/physics trên dev, đóng dev rồi mở preview và kiểm tra ocean trên production. Runner truyền exit code lỗi qua process và đóng server do chính nó tạo. `test:browser` cần build sẵn; `npm test` tự build trước.

`AGENTS.md` dẫn đến `docs/architecture.md`, `docs/workflow.md` và quyết định trong `docs/decisions/`. Agent nạp ngữ cảnh theo tác vụ, giữ code/test làm nguồn sự thật và kiểm tra ảnh/motion thật với thay đổi đồ họa. OpenWiki là chỉ mục tra cứu, không thay thế hợp đồng authored hoặc kiểm chứng thực thi.

## GitHub Pages

`.github/workflows/pages.yml` chạy trên pull request, push `main` và dispatch thủ công. Job build cài Node 24, npm dependencies và Chromium rồi chạy `npm run check`. PR chỉ kiểm chứng; main/dispatch upload `dist` và deploy sau khi check qua. Workflow không tự sinh wiki. Branch protection là cấu hình GitHub riêng, không được đảm bảo chỉ bởi file workflow.

Vite dùng `base: './'` để asset hoạt động dưới `/web-g-3d/`. URL mặc định: https://vundu2309.github.io/web-g-3d/.

## OpenWiki trong Codex

`openwiki` là devDependency pin 0.7.3. `.codex/config.toml` dùng `npx --no-install openwiki mcp --host codex`; cần cài dependencies và mở Codex từ repo. `.agents/skills/openwiki` chứa hướng dẫn tích hợp. Sau lần cài đầu, mở lại Codex để nạp MCP; phiên đang chạy không tự có thêm công cụ trong danh sách tool.

Yêu cầu Codex cập nhật wiki từ source/test. Coding agent đọc repo và gửi từng trang qua lifecycle OpenWiki, còn OpenWiki quản lý Claims, evidence, index và metadata. Không sửa tay các file quản lý đó. Phạm vi biên soạn nằm trong `openwiki/INSTRUCTIONS.md`.

`npm run wiki:serve` phục vụ đồ thị/trình đọc local; `npm run wiki:export` xuất reader tĩnh vào `.openwiki-export/`, được Git ignore. Xuất reader không tự publish hoặc đổi game trên Pages. CLI standalone `--init`/`--update` cần provider riêng; không chép API key vào source, wiki hoặc game. `.env` và local state được ignore.

## Đi tiếp

[Kiến trúc và vòng đời](../architecture/ocean.md) · [Bắt đầu](../quickstart.md).
