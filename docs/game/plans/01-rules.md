# Plan 01 — Luật chơi

**Trạng thái:** Baseline tài liệu hiện có đã chốt để chuyển sang [Plan 02](02-mobile-ui.md) theo yêu cầu người dùng. Nghiên cứu tạm dừng; không đồng nghĩa hoàn thành xác minh toàn bộ luật/edition. **Đầu ra:** đặc tả tài liệu; chưa code gameplay.

## Mục tiêu

Ghi đủ luật Monopoly Classic US thành tài liệu có nguồn, ID và tình huống kiểm chứng. Giữ tên đất Mỹ, đấu giá/trao đổi/thế chấp, không house rules hoặc rút ngắn ván.

## Các phần làm lần lượt

| Phần | Đầu ra | Trạng thái |
| --- | --- | --- |
| 01A | [Bàn cờ, nhóm tài sản, bảng kinh tế](../rules/board-and-properties.md) | Baseline bàn giao cho thiết kế, ngoại lệ lưu lại trước gameplay |
| 01B | [Thiết lập, lượt và đấu giá](../rules/turns.md) | Backlog |
| 01C | [Thuê, xây, trao đổi, thế chấp](../rules/assets.md) | Backlog |
| 01D | [Thẻ, thuế, nhà tù](../rules/cards-and-jail.md) | Backlog |
| 01E | [Nợ, phá sản và kết thúc](../rules/bankruptcy.md) | Backlog |

## Các bước riêng của 01A

- **01A.1 — Nguồn:** Đã chọn G0009 US, rulebook 2025; S-002 có URL/PDF/hash và giới hạn bằng chứng.
- **01A.2 — Bảng tài sản:** Đã lập [bảng nháp có nguồn](../rules/property-economics.md) đủ 28 tài sản; một số trường xác minh từ S-002, phần còn lại S-004 chỉ để review. Chưa xong: cần S-003, mortgage/unmortgage và rent/giá xây Rhode Island.
- **01A.3 — Điều kiện tính tiền:** Đã viết [đặc tả có nguồn và tình huống kiểm chứng](../rules/rent-conditions.md) cho rent, nhóm màu, thế chấp và điều kiện áp giá xây. Chờ review; hiệu ứng thẻ và chính sách số hóa vẫn unresolved.

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

## Tiến độ nghiên cứu tiếp theo

Đã kiểm tra thêm nguồn công khai ngày 2026-11-03: trang shop Hasbro được thử chuyển về trang where-to-buy, chưa cung cấp bộ Title Deed; các hình S-002 không có mặt sau. Chưa xác minh được giá còn thiếu; không coi việc tìm không thấy là bằng chứng số liệu không tồn tại. Trong lúc 01A.2 còn thiếu S-003, chỉ tiếp tục các điều kiện 01A.3 có bằng chứng độc lập, chưa mở 01B/01C hoặc implementation.

## Bổ sung nguồn ảnh 2025

S-005 có ảnh mặt sau Rhode Island Avenue: mortgage 50, unmortgage 55. Chưa có mặt trước và hộp/mã G0009 nên vẫn cần đối chiếu edition; không suy rent từ Vermont trong cùng ảnh. Đây là tiến triển bằng chứng của 01A.2, chưa hoàn thành toàn bảng.

## Bổ sung ảnh thẻ 2025 lần tiếp theo

S-006 bổ sung mặt sau Short Line 100/110; S-007 bổ sung giá nhà/KS Mediterranean 50 và rent khớp S-002. Đã đưa các trường đọc được ở S-005/S-006/S-007 vào ma trận nguồn thay vì để lẫn số nháp Wikibooks. Mặt trước Rhode Island chưa thấy; trang item eBay trả kiểm tra tự động, endpoint mô tả trả HTTP 410, nên không tuyên bố đã xem được gallery đầy đủ. Các ảnh công khai được lưu hash trong sổ nguồn.

## Quy trình tiếp tục đã điều chỉnh

Ưu tiên nguồn text, so bảng hàng loạt thay cho tìm ảnh từng thẻ. Đã so 189 số của 21 đất màu với S-004 revision 4662179 và khớp; chưa thay đổi trạng thái xác minh đúng edition hoặc phê duyệt. Gom Rhode Island, mortgage còn thiếu và khác biệt Marvin Gardens trong sổ nguồn để xử lý theo đợt. Chỉ quay lại ảnh cho một ngoại lệ có nguồn mới; không lặp các gallery đã bị chặn. Tiếp tục review các phần có bằng chứng trong 01A, chưa mở implementation/plan sau.

## Bàn giao sang Plan 02

Người dùng yêu cầu chốt tài liệu hiện tại và sang plan tiếp theo. Dùng tên/thứ tự bàn, nhóm tài sản, bảng số liệu và điều kiện rent hiện có để thiết kế; ví dụ tiền chưa chốt phải ghi là dữ liệu minh họa, không khẳng định là số liệu G0009 đã xác minh.

Checklist này không chặn concept UI nhưng phải giải quyết trước implementation chức năng tương ứng:

- [ ] Chốt các số còn thiếu của Rhode Island và mortgage/unmortgage, không lấy `—` làm 0.
- [ ] Hoàn thiện 01B–01E cho vòng lượt, đấu giá, trao đổi, nhà tù/thẻ, nợ và kết thúc. Hiện các phần này mới có phạm vi nghiên cứu, không phải luật đầy đủ đã viết xong.
- [ ] Chốt chính sách số hóa: yêu cầu rent, utility roll, thứ tự sự kiện mạng; không tự thêm timer/house rules.
- [ ] Kiểm tra các khác biệt edition đã ghi ở sổ nguồn khi đưa số liệu vào runtime.

Từ đây không tiếp tục tìm nguồn hoặc bổ sung ảnh thẻ trừ khi công việc implementation được giao cần mục đó hoặc người dùng yêu cầu quay lại Plan 01. Ưu tiên hiện hành là thiết kế màn 02A.
