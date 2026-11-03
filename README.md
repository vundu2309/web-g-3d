# Phố Tỷ Phú

Hub cho board game giao dịch bất động sản, ưu tiên **điện thoại xoay ngang**. Theme giấy xanh nhạt, chữ cobalt và nút vàng theo mẫu đã duyệt. Đã bỏ cảnh biển, thuyền và engine 3D cũ.

Luồng hiện tại: trang chính → tạo/tham gia phòng → phòng chờ → trạng thái hoàn tất hub. Có tên người chơi, mã mời, tối đa 2–4 người, sẵn sàng, khôi phục phòng sau reload và rời/đóng phòng. Chưa có bàn chơi, xúc xắc, mua đất hoặc gameplay Monopoly.

## Chạy và kiểm tra

Node 24, npm 11, Java 21 cho Firebase emulator:

```sh
npm ci
npm run dev
npm run check
```

`npm run build` tạo `dist`; `npm run preview` phục vụ bản production. Chromium hệ thống được tự nhận diện; hoặc cài bằng `npx --no-install playwright-core install --with-deps chromium`.

## Online và bản thử

Online dùng Firebase Anonymous Auth + Realtime Database của project `movieapp-fa2d4`. Backend hiện cần bật lại database và cấu hình quyền; deploy Pages không tự làm bước đó. Xem [hướng dẫn Firebase](docs/firebase.md).

Chọn **Thử trên thiết bị này** để kiểm tra hub mà không ghi Firebase. Mở thêm tab cùng trình duyệt, chuyển tab đó sang bản thử rồi tham gia bằng mã. Chế độ này chỉ đồng bộ trên cùng thiết bị/trình duyệt, không phải multiplayer qua Internet. Giao diện luôn ghi “Bản thử”.

## Tài liệu

- [Quy tắc cho AI](AGENTS.md)
- [Theme đã duyệt, mobile và ảnh tham chiếu](docs/design/theme.md)
- [Kiến trúc và ranh giới module](docs/architecture.md)
- [Kiểm tra và deploy](docs/workflow.md)
- [Quyết định chuyển sang hub](docs/decisions/0002-mobile-board-game-hub.md)

## GitHub Pages

https://vundu2309.github.io/web-g-3d/

Settings → Pages → Source: GitHub Actions. Workflow chạy kiểm tra trước khi publish `dist`; main tự deploy. Firebase backend/rules là bước riêng, không có secret quản trị trong client.

## OpenWiki

OpenWiki được pin trong devDependencies, không tải vào ứng dụng. `npm run wiki -- integrations list --project .` kiểm tra tích hợp; `npm run wiki:serve` mở trình đọc local; `npm run wiki:export` xuất vào `.openwiki-export/`. Wiki bắt đầu tại [openwiki/quickstart.md](openwiki/quickstart.md). Dùng lifecycle của skill `.agents/skills/openwiki` để cập nhật sau khi source ổn định; không sửa tay Claims/metadata/index. Không tự gọi paid provider hoặc chạy lịch AI trong CI.
