# Tập tin

- [Quy trình mô hình 3D, bảng màu và kiểm tra tài sản](art-pipeline.md) - Mô hình GLB trong public/models được dựng từ script trong tools/blender (không có file .blend trong repository), danh mục assets.json là nguồn kiểm tra, bảng màu PAL được xuất sang Blender, lệnh dựng lại trong Blender riêng, và render harness chỉ để xem trước bằng phần mềm.
- [Phát triển, kiểm tra và phát hành](development.md) - Node 24 và lockfile, các npm script (typecheck, lint, format:check, test:unit, test:browser, test:api, check), scripts/qa.mjs chạy từng kiểm tra trình duyệt, worktree cho agent song song, và quy tắc phát hành qua Vercel và workflow Pages.
- [Hiệu năng: ngân sách, mẫu và cách báo cáo chi phí](performance.md) - Ngân sách khung hình, giới hạn pixel và tam giác, các mẫu đã dùng trong biển, và cách một thay đổi báo cáo chi phí. Nguồn chính là docs/performance.md; số liệu từ điện thoại thật chỉ có một bản đo.
- [PWA: cài đặt, offline shell và cập nhật](pwa.md)
