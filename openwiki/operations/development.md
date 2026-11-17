---
type: operations
title: Phát triển, kiểm tra và phát hành
description: Node 24 và lockfile, các npm script (typecheck, lint, format:check, test:unit, test:browser, test:api, check), scripts/qa.mjs chạy từng kiểm tra trình duyệt, worktree cho agent song song, và quy tắc phát hành qua Vercel và workflow Pages.
tags:
  - development
  - testing
  - release
  - operations
verified:
  - by: openwiki/0.7.3
    at: 2026-11-17T08:18:15.877Z
sources:
  - id: openwiki-source-5f219f204b3e870beec929d9
    resource: repo://.github/workflows/pages.yml
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-53a7956f9c70e8affa248a45
    resource: repo://scripts/qa.mjs
  - id: openwiki-source-3515d68bed1b916f693296ec
    resource: repo://scripts/test-browser.mjs
  - id: openwiki-source-88bb7eecf8ef2feb0c12f2e5
    resource: repo://scripts/wt.mjs
  - id: openwiki-source-a875da0e301868b8784bbae3
    resource: repo://tests/pwa-browser.mjs
generated: { by: "claude-code", at: "2026-11-17T08:18:15.877Z" }
---

# Phát triển, kiểm tra và phát hành

Repository là một trò chơi thuyền câu cá trên trình duyệt. Dùng Node 24 (`engines` trong `package.json`) và npm 11 với lockfile. `npm ci` cài dependency; `npm run dev` chạy Vite; `npm run build` kiểm tra TypeScript rồi đóng gói.

## Script trong package.json

| Lệnh | Kiểm tra |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint trên `src`. |
| `npm run format:check` | Prettier trên `src`, `tests`, `scripts`, `server`, cấu hình. |
| `npm run test:unit` | Danh sách cố định các file `tests/*.test.mjs` của biển, thuyền, câu cá, kinh tế, render và cấu hình. |
| `npm run build` | `typecheck` rồi `vite build`. |
| `npm run test:browser` | `scripts/test-browser.mjs` (dev và preview), rồi `tests/pwa-browser.mjs`. |
| `npm run test:api` | `tests/api.test.mjs`, `tests/socket.test.mjs`, `tests/ocean-socket.test.mjs`. |
| `npm test` | `test:unit`, `build`, `test:browser`. |
| `npm run check` | `lint`, `format:check`, `npm test`, `test:api`. |

Yêu cầu của dự án là kiểm tra gọn: format, typecheck, lint, unit, và các browser test của phần đã thay đổi. `npm run check` là bộ đầy đủ.

## Browser test

`scripts/test-browser.mjs` tạo server Vite dev và preview trên cổng tự chọn của `127.0.0.1`. Nó đặt `VITE_SUPABASE_URL` và khóa công khai giả, vì biển từ chối khởi động khi thiếu cấu hình; test chạy với Supabase giả và API giả (`tests/support/supabase-dev.mjs`). Chỉ các server do script tạo mới bị đóng.

Các test được gọi theo tên qua `scripts/qa.mjs`:

```
node scripts/qa.mjs ocean-fishing ocean-cast
node scripts/qa.mjs ocean                 # nhóm biển
node scripts/qa.mjs --cwd <worktree> ocean-babylon
```

`qa.mjs` dùng Chrome của hệ thống, có giới hạn thời gian cho mỗi test, và chạy lại **riêng** test bị lỗi một lần để phân biệt lỗi thời gian với lỗi thật (các kiểm tra thời gian của câu cá và Babylon dễ dao động khi WebGL chạy bằng phần mềm). Tùy chọn gồm `--port`, `--timeout` (mặc định 600 giây) và `--no-rerun`.

Trình duyệt: `CHROMIUM_PATH` hoặc Chromium do Playwright quản lý; cài bằng `npx --no-install playwright-core install --with-deps chromium`.

## Worktree cho agent song song

`scripts/wt.mjs` tạo một worktree cho mỗi tác vụ tại `../web-g-3d-wt/<name>` với nhánh `wt/<name>`. `node_modules` là symlink tới checkout chính, nên không cài lại. Mỗi worktree có cache Vite riêng qua `VITE_CACHE_DIR`. Các lệnh là `new`, `preview`, `stop`, `list`, `sync` và `remove`.

## Kiểm tra trên trình duyệt có giới hạn

Trình duyệt mô phỏng không đảm bảo trải nghiệm trên điện thoại thật: cảm ứng, rung, Safari, FPS và cài đặt PWA cần thiết bị thật. Ảnh chụp phần mềm là bằng chứng có điều kiện, không phải bằng chứng hiệu năng. Trong các ghi chú về kiểm tra, cần nói rõ những gì chưa được xác minh.

## Phát hành

Repository có hai đường phát hành:

- **Vercel**: `AGENTS.md` quy định mọi push lên `main` là deploy production, và các thay đổi UI/UX cần theo dõi build đến khi deploy xong; `vercel.json` cấu hình build Vite và cache của `sw.js`, `index.html`.
- **GitHub Pages**: workflow `.github/workflows/pages.yml` chạy lint, format, typecheck và unit cho PR, `main` và dispatch thủ công; chỉ publish khi push có trailer chính xác `Pages-Deploy: true` hoặc khi dispatch thủ công. PR không deploy. Tài liệu `docs/workflow.md` vẫn mô tả quy trình Pages cũ, nên cần đối chiếu với `AGENTS.md` khi phát hành.

Thay đổi không có tác động UI/UX (tài liệu, test, công cụ, nội bộ) không cần trailer và không được ghi là đã lên production.

<!-- openwiki: broken internal link [infrastructure-transition.md] file "infrastructure-transition.md" does not exist. Fix the href or restore the target, then delete this comment. -->
Workflow `keep-api-awake.yml` gọi `/health` của API Render mỗi 5 phút; xem [hạ tầng](infrastructure-transition.md).

## Tài liệu và wiki

Tài liệu được viết tay nằm trong `docs/`; quyết định nằm trong `docs/decisions/`. Thư mục `openwiki/` là wiki được sinh tự động, không sửa tay. `package.json` có script `wiki` nhưng việc cập nhật wiki theo vòng đời của OpenWiki, không chạy tự động.

## Giới hạn

- Chưa có kiểm chứng trong repository về deploy hiện tại trên Vercel, workflow Pages gần nhất hay cấu hình Render thực tế.
- Chưa có kiểm tra trên thiết bị thật cho PWA, cảm ứng và hiệu năng.
