# 0005 — Bàn 3D xem trước bằng Three.js

**Trạng thái:** Chấp nhận cho bản xem trước cục bộ (không phải gameplay).

## Bối cảnh

Người dùng duyệt bàn 3D WebGL trong `?view=game` thay sơ đồ HTML, với hai chế độ camera và điều khiển xem cho mọi người, kể cả observer.

## Quyết định

- Dùng `three` (runtime) và `@types/three` (dev). Không thêm engine hay framework khác.
- Hình học tách thành module thuần (`spaces`, `layout`, `camera-math`) có test Node; renderer chỉ là lớp mỏng trên đó.
- Một renderer cho suốt game view; HUD vẽ lại chỉ di chuyển canvas.
- Ô sâu 2.2 so với frontage 1, góc vuông bằng chiều sâu ô; chữ đọc từ phía ngoài từng cạnh: đỉnh chữ hướng về tâm bàn (`LABEL_UP_SIGN = -1`), không billboard xoay theo camera.
- Toàn cảnh dùng phép chiếu thật để fit; theo dõi đặt camera về phía ô của quân.
- Dữ liệu quân và nhà chỉ là fixture preview, không phải trạng thái ván.

## Hệ quả

- Chunk `play` tăng khoảng 150 KB gzip, chỉ tải trên `?view=game`.
- Texture 3072 px có chi phí GPU; cần đo trên thiết bị thật trước khi kết luận về hiệu năng.
- Bản dự phòng 2D bảo đảm bàn không trống khi không có WebGL hoặc mất context.
