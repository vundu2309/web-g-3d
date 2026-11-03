# Plan 01 — Luật chơi

**Trạng thái:** Active, chỉ phần 01A. **Đầu ra:** đặc tả tài liệu; chưa code gameplay.

## Mục tiêu

Ghi đủ luật Monopoly Classic US thành tài liệu có nguồn, ID và tình huống kiểm chứng. Giữ tên đất Mỹ, đấu giá/trao đổi/thế chấp, không house rules hoặc rút ngắn ván.

## Các phần làm lần lượt

| Phần | Đầu ra | Trạng thái |
| --- | --- | --- |
| 01A | [Bàn cờ, nhóm tài sản, bảng kinh tế](../rules/board-and-properties.md) | Active: 01A.1 đã chọn nguồn; 01A.2/01A.3 chưa xong |
| 01B | [Thiết lập, lượt và đấu giá](../rules/turns.md) | Backlog |
| 01C | [Thuê, xây, trao đổi, thế chấp](../rules/assets.md) | Backlog |
| 01D | [Thẻ, thuế, nhà tù](../rules/cards-and-jail.md) | Backlog |
| 01E | [Nợ, phá sản và kết thúc](../rules/bankruptcy.md) | Backlog |

## Các bước riêng của 01A

- **01A.1 — Nguồn:** Đã chọn G0009 US, rulebook 2025; S-002 có URL/PDF/hash và giới hạn bằng chứng.
- **01A.2 — Bảng tài sản:** Đã lập [bảng nháp có nguồn](../rules/property-economics.md) đủ 28 tài sản; một số trường xác minh từ S-002, phần còn lại S-004 chỉ để review. Chưa xong: cần S-003, mortgage/unmortgage và rent/giá xây Rhode Island.
- **01A.3 — Điều kiện tính tiền:** Chưa xong; phân biệt đất màu, railroad/utility, thẻ và thế chấp.

## Việc tiếp theo trong 01A

1. [x] Chọn và ghi chính xác rulebook Classic US tại [sổ nguồn](../rules/sources.md): G0009 US, copyright 2025.
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

**Bằng chứng hiện tại:** đã có bảng giá/rent nháp và ma trận trường được xác minh ở S-002; phát hiện tên G0009 là Rhode Island Avenue. S-003 còn thiếu, chưa hoàn thành 01A và chưa có implementation.
