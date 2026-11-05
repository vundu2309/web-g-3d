# Phố Tỷ Phú

Game online nhập vai thuyền đánh cá, ưu tiên **điện thoại xoay ngang**. Mỗi tài khoản điều khiển một thuyền riêng trên **một map biển chung**.

Luồng chính: hub → **Vào game** → đăng nhập nếu cần → vào thẳng biển, không tạo/join phòng hay sẵn sàng. Có lái thuyền bằng WASD/phím mũi tên hoặc nút cảm ứng, thả câu/đợi cá cắn/kéo cá và danh sách thuyền trong kênh. Cá chỉ tính trong chuyến hiện tại, chưa lưu hoặc quy đổi tiền.

Code/resource Monopoly giữ nguyên: bản xem trước tại `?view=game`, hub phòng cũ tại `?view=monopoly-hub`. Authenticator Email/Password hiện có được tái sử dụng theo cấu hình Supabase hoặc Firebase. Xem [hợp đồng biển chung](docs/ocean.md).

## Chạy và kiểm tra

Node 24, npm 11, Java 21 cho Firebase emulator:

```sh
npm ci
npm run dev
npm run check
```

`npm run build` tạo `dist`; `npm run preview` phục vụ bản production. Chromium hệ thống được tự nhận diện; hoặc cài bằng `npx --no-install playwright-core install --with-deps chromium`.

## Online và bản thử

Online dùng Firebase Email/Password Auth + Cloud Firestore `(default)` của project `movieapp-fa2d4`. Firestore `(default)` đã được tạo và rules/index của hub được triển khai riêng qua CLI; deploy Pages không tự làm bước đó. Biển chung dùng Socket.IO trên cấu hình Supabase (một API instance, trạng thái thuyền tạm thời), hoặc Firestore trên cấu hình Firebase. Cần triển khai API mới / rules tương ứng trước khi chơi thật; chưa có quyền quản trị Firebase trong môi trường này. Xem [hướng dẫn Firebase](docs/firebase.md).

Trong hub Monopoly cũ (`?view=monopoly-hub`), chọn **Thử trên thiết bị này** để kiểm tra hub mà không ghi Firebase. Mở thêm tab cùng trình duyệt, chuyển tab đó sang bản thử rồi tham gia bằng mã. Chế độ này chỉ đồng bộ trên cùng thiết bị/trình duyệt, không phải multiplayer qua Internet. Giao diện luôn ghi “Bản thử”.

## Tài liệu

- [Quy tắc cho AI](AGENTS.md)
- [Theme đã duyệt, mobile và ảnh tham chiếu](docs/design/theme.md)
- [Kiến trúc và ranh giới module](docs/architecture.md)
- [Kiểm tra và deploy](docs/workflow.md)
- [Quyết định chuyển sang hub](docs/decisions/0002-mobile-board-game-hub.md)

## GitHub Pages

https://vundu2309.github.io/web-g-3d/

Settings → Pages → Source: GitHub Actions. Workflow chạy kiểm tra trước khi publish `dist`; push có trailer `Pages-Deploy: true` mới deploy. Firebase backend/rules là bước riêng, không có secret quản trị trong client.

## OpenWiki

OpenWiki được pin trong devDependencies, không tải vào ứng dụng. `npm run wiki -- integrations list --project .` kiểm tra tích hợp; `npm run wiki:serve` mở trình đọc local; `npm run wiki:export` xuất vào `.openwiki-export/`. Wiki bắt đầu tại [openwiki/quickstart.md](openwiki/quickstart.md). Dùng lifecycle của skill `.agents/skills/openwiki` để cập nhật sau khi source ổn định; không sửa tay Claims/metadata/index. Không tự gọi paid provider hoặc chạy lịch AI trong CI.


## Hạ tầng mới

Frontend mới dùng Vercel, Supabase Email/Password Auth/PostgreSQL và API Render với Socket.IO qua WebSocket. Người chơi đăng ký tài khoản mới; dữ liệu Firebase cũ được giữ lại. Xem [cấu hình và kiểm thử](docs/infrastructure.md). `npm run test:supabase` chạy luồng hai browser với Supabase Auth/PostgREST/PostgreSQL thật và SMTP local trong stack Docker dùng một lần; không ghi vào hệ thống thật. Bản build không đặt VITE_ONLINE_BACKEND=supabase vẫn dùng adapter Firebase để rollback.
