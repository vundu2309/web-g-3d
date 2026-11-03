# Plan 05 — Multiplayer

**Trạng thái:** Backlog, chưa được mở để thực hiện.

## Mục tiêu

Đồng bộ nhiều thiết bị, resume và xử lý gián đoạn theo backend authoritative.

## Đầu vào

Plan 04 có API và phân quyền; chính sách timeout/forfeit chưa được duyệt.

## Công việc khi được mở

- [ ] Gắn room với game session, listener có owner và cleanup rõ ràng.
- [ ] Thử reconnect, reload, stale state, nhiều request cùng lúc và membership thay đổi.
- [ ] Chốt chính sách bỏ lượt/rời/mất kết nối với người dùng; presence không đồng nghĩa roster hoặc phá sản.

## Ngoài phạm vi

Tự thêm bot thay người, auto-forfeit hoặc thay luật truyền thống.

## Tiêu chí hoàn thành

Hai đến bốn client thấy cùng state; resume không mất lượt hoặc tạo hành động trùng.

**Bằng chứng:** Chưa có; đây là plan, không mô tả tính năng đã tồn tại. Cập nhật trạng thái và bằng chứng khi thực hiện; chỉ tập trung một plan theo yêu cầu hiện hành.
