# Plan 06 — Bàn chơi và đồ họa

**Trạng thái:** Đã triển khai bản xem trước 3D cục bộ (`src/board`, Three.js) trong `?view=game`; chưa phải gameplay, chưa có chuyển quân thật hay đồng bộ. Xem [HUD và bàn 3D](../ui-implementation.md#bàn-3d-xem-trước). Các mục dưới vẫn cần xác minh trên điện thoại thật trước khi coi là hoàn tất.

## Mục tiêu

Hiện thực thiết kế đã duyệt, ưu tiên đọc bàn và thao tác trên điện thoại.

## Đầu vào

Plan 02 đã duyệt hình ảnh; model/backend/multiplayer có contract để tích hợp.

## Công việc khi được mở

- [x] Chọn renderer và asset budget dựa trên thiết kế/thiết bị mục tiêu; không tự thêm engine.
- [ ] Hiển thị đủ bàn và tên đất Mỹ; quân, xúc xắc, chuyển động và camera không che thao tác.
- [ ] Tách animation khỏi kết quả authoritative; xử lý reduced motion, nền tab và thiết bị yếu.

## Ngoài phạm vi

Thêm mechanics ngoài luật hoặc gọi ảnh gen là bằng chứng runtime.

## Tiêu chí hoàn thành

Review ảnh render thật ở các viewport mục tiêu; đo hiệu năng thực, chơi được không phụ thuộc animation.

**Bằng chứng runtime:** `tests/board-layout.test.mjs` kiểm tra lưới, vạch ô góc, hướng chữ và vùng công trình; `tests/board-browser.mjs` kiểm tra WebGL thật, hai camera, tương tác, redraw, resize và fallback. Ảnh review dưới `test-results/board/` là render thật; chưa đo hiệu năng trên điện thoại vật lý.

## Hướng hình ảnh đã chốt

[Concept bàn](../../design/board-reference.png) dùng để tham chiếu chất liệu và lưới căn thẳng. Các lỗi tên ô/hướng chữ trong ảnh gen không thay dữ liệu nguồn. Bàn thật dùng tọa độ chung cho bốn cạnh/góc, chữ đọc từ ngoài từng cạnh, công trình trên dải màu sát lòng bàn. Camera Focus bám quân đang có lượt; Overview cho phép xoay, kéo và zoom tự do trong giới hạn. Không thêm HUD panel mới hay luật chơi ở bước này.
