# Ra khơi cùng bạn

Game online nhập vai thuyền đánh cá, ưu tiên **điện thoại xoay ngang**. Mỗi tài khoản điều khiển một thuyền riêng trên **một map biển chung**.

Luồng chính: bến cảng → **Ra khơi** → đăng nhập hoặc đăng ký nếu cần → vào thẳng biển, không tạo/join phòng hay sẵn sàng. Có lái thuyền bằng WASD/phím mũi tên hoặc nút cảm ứng, thả câu/đợi cá cắn/kéo cá, kho cá, chợ bán cá lấy xu và danh sách thuyền trong kênh. Vị trí thuyền và kho cá lưu trên thiết bị. Xem [hợp đồng biển chung](docs/ocean.md).

Dự án từng có game Monopoly (Phố Tỷ Phú) và Firebase; cả hai đã được gỡ ngày 2026-11-16, xem [quyết định 0012](docs/decisions/0012-remove-firebase-and-monopoly.md). Tài khoản Firebase cũ không còn dùng được trong app; đăng ký mới trên Supabase.

## Chạy và kiểm tra

Node 24, npm 11:

```sh
npm ci
npm run dev
npm run check
```

`npm run dev` cần biến công khai `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` (và `VITE_API_URL` cho biển chung), xem `.env.example`; thiếu thì app báo chưa cấu hình, không chuyển sang dịch vụ khác. `npm run build` tạo `dist`; `npm run preview` phục vụ bản production. Chromium hệ thống được tự nhận diện; hoặc cài bằng `npx --no-install playwright-core install --with-deps chromium`.

## Tài liệu

- [Quy tắc cho AI](AGENTS.md)
- [Hợp đồng biển chung](docs/ocean.md)
- [Theme đã duyệt](docs/design/theme.md)
- [Kiến trúc và ranh giới module](docs/architecture.md)
- [Hạ tầng Vercel, Render, Supabase](docs/infrastructure.md)
- [Kiểm tra và deploy](docs/workflow.md)

## Triển khai

Frontend chạy trên Vercel (push lên `main` tự deploy), API Socket.IO trên Render, tài khoản và xu trên Supabase. GitHub Pages (`https://vundu2309.github.io/web-g-3d/`) chỉ deploy khi commit có trailer `Pages-Deploy: true` hoặc chạy tay workflow. Không có secret quản trị trong client.

## OpenWiki

OpenWiki được pin trong devDependencies, không tải vào ứng dụng. `npm run wiki -- integrations list --project .` kiểm tra tích hợp; `npm run wiki:serve` mở trình đọc local; `npm run wiki:export` xuất vào `.openwiki-export/`. Wiki bắt đầu tại [openwiki/quickstart.md](openwiki/quickstart.md). Dùng lifecycle của skill `.agents/skills/openwiki` để cập nhật sau khi source ổn định; không sửa tay Claims/metadata/index. Không tự gọi paid provider hoặc chạy lịch AI trong CI.
