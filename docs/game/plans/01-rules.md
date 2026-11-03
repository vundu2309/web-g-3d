# Plan 01 — Luật chơi

**Trạng thái:** Active, chỉ phần 01A. **Đầu ra:** đặc tả tài liệu; chưa code gameplay.

## Mục tiêu

Ghi đủ luật Monopoly Classic US thành tài liệu có nguồn, ID và tình huống kiểm chứng. Giữ tên đất Mỹ, đấu giá/trao đổi/thế chấp, không house rules hoặc rút ngắn ván.

## Các phần làm lần lượt

| Phần | Đầu ra | Trạng thái |
| --- | --- | --- |
| 01A | [Bàn cờ, nhóm tài sản, bảng kinh tế](../rules/board-and-properties.md) | Active: nháp chờ đối chiếu edition |
| 01B | [Thiết lập, lượt và đấu giá](../rules/turns.md) | Backlog |
| 01C | [Thuê, xây, trao đổi, thế chấp](../rules/assets.md) | Backlog |
| 01D | [Thẻ, thuế, nhà tù](../rules/cards-and-jail.md) | Backlog |
| 01E | [Nợ, phá sản và kết thúc](../rules/bankruptcy.md) | Backlog |

## Việc tiếp theo trong 01A

1. Chọn và ghi chính xác rulebook/edition Classic US tại [sổ nguồn](../rules/sources.md).
2. Đối chiếu danh mục 40 ô và tên, đủ 28 tài sản.
3. Ghi giá mua/rent/mortgage/giá xây từ Title Deed, phân biệt railroad/utility.
4. Viết ví dụ phát hiện sai thứ tự, sai nhóm, sai rent; liệt kê chỗ chưa xác minh.
5. Trình người dùng duyệt riêng 01A, sau đó mới mở 01B.

## Ngoài phạm vi

Giao diện game, ảnh mới, thay hub/Firebase, model runtime, backend, server authority, thời gian tự động cho đấu giá hoặc người mất kết nối. Không chọn Blaze hoặc database mới thay người dùng.

## Hoàn thành

- [ ] Mỗi phần có nguồn cùng edition, ID không trùng và ví dụ mong đợi.
- [ ] Không còn bảng giá/thẻ dùng số đoán hoặc trộn edition.
- [ ] Tách rõ luật gốc khỏi chính sách số hóa còn mở.
- [ ] Từng phần được duyệt; ghi trạng thái ở trang luật và plan.

**Bằng chứng hiện tại:** mới có hướng sản phẩm và bộ khung tài liệu; chưa xác minh rulebook, chưa hoàn thành 01A.
