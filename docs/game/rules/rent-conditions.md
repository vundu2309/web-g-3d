# 01A.3 — Điều kiện tính tiền thuê và chi phí tài sản

**Trạng thái:** Đặc tả nháp đã đối chiếu rulebook S-002 G0009 US 2025, chờ review; chưa implement. Chỉ mở rộng phần tài sản 01A. Không mở gameplay/model/backend hoặc các plan sau.

Nguồn: [S-002](sources.md), trang PDF 2, các mục Owned Properties, Collect color sets!, Railroads, Utilities, Buildings và Mortgaging Property. Giá trị được lấy từ [bảng kinh tế](property-economics.md) theo trạng thái xác minh của từng trường; không biến số nháp thành số đã chốt bằng cách dẫn trang này.

## US-RENT-001 — Khi nào phát sinh yêu cầu trả rent

Khi người chơi dừng ở tài sản có chủ khác, chủ phải yêu cầu tiền thuê. S-002 / Owned Properties quy định nếu chủ không yêu cầu trước khi người tiếp theo tung xúc xắc thì người dừng ở đó không phải trả. Không tự thu từ tài sản không có chủ, tự thu khi đi ngang hoặc thu của chính mình. Ô chưa có chủ đi theo luồng mua/đấu giá của 01B, không được coi giá mua là rent.

**Chính sách số hóa còn mở:** yêu cầu thủ công hay tự động thay người chơi, thứ tự sự kiện tung/yêu cầu và cách xử lý độ trễ mạng. Chưa có quyền tự thêm timer, auto-claim hoặc auto-forfeit. Backend tương lai phải xác định thứ tự hợp lệ; thời điểm nhận snapshot trên máy không tự quyết định quyền yêu cầu rent. Chưa implement vì phải chốt chính sách này riêng.

## US-RENT-002 — Đất màu không có công trình

Nếu chủ chưa đủ nhóm màu, dùng rent trống của thẻ. Nếu chủ sở hữu đầy đủ nhóm, dùng rent nhóm (gấp đôi rent trống theo S-002 / Collect color sets!). Chỉ áp dụng cho tài sản đủ điều kiện thu và không thế chấp.

S-002 / Mortgaging Property cho phép thu rent tăng trên đất không thế chấp trong nhóm ngay cả khi đất khác trong nhóm bị thế chấp. Vì vậy **đủ nhóm** xét quyền sở hữu, không đồng nghĩa mọi đất trong nhóm phải đang giải chấp. Việc có được xây là điều kiện khác, xem US-COST-001.

- CASE-RENT-001: chủ có Kentucky/Indiana/Illinois, đều chưa xây; người khác vào Kentucky → mức nhóm 36 nếu yêu cầu đúng hạn.
- CASE-RENT-002: cùng trạng thái nhưng Indiana thế chấp, Kentucky không thế chấp → Kentucky vẫn có mức nhóm 36.
- CASE-RENT-003: Kentucky bị thế chấp → không được thu rent, dù vẫn đủ nhóm.

Các số Kentucky đã được xác minh S-002; tình huống không cho phép suy mọi số của nhóm Red đều đã được xác minh.

## US-RENT-003 — Đất đã xây

Dùng đúng rent trên thẻ theo số nhà 1/2/3/4 hoặc một khách sạn. Không cộng rent đất trống, không nhân đôi rent có công trình khi đủ nhóm, không coi khách sạn là nhà thứ năm.

- CASE-RENT-004: Kentucky có 3 nhà → 700, không phải 1400 hoặc 700 + 18.
- CASE-RENT-005: St. James có một khách sạn → 950; không dùng rent 4 nhà 750.

## US-RENT-004 — Railroad

S-002 / Railroads: mức thường cho chủ sở hữu 1/2/3/4 railroad là 25/50/100/200. Đếm tài sản đang thuộc chủ, không đếm nhà hoặc số người trong phòng. Không thu trên railroad đích bị thế chấp.

S-002 / Mortgaging Property cho phép rent tăng trên railroad không thế chấp theo cùng cách với đất màu. Railroad khác bị thế chấp vẫn là tài sản đang sở hữu, không bị chuyển về ngân hàng chỉ vì thế chấp.

- CASE-RENT-006: chủ có 3 railroad, trong đó 1 thế chấp; khách vào một railroad không thế chấp → mức thường 100.
- CASE-RENT-007: khách vào railroad đang thế chấp → không thu rent.

Thẻ Chance có thể thay đổi rent. Chưa có đủ bộ thẻ G0009 S-003: không tự mặc định nhân hai cho mọi lệnh di chuyển tới railroad. Khi chưa biết thẻ cụ thể, đánh dấu unresolved thay vì dùng mức thường để che thiếu đặc tả.

## US-RENT-005 — Utility

S-002 / Utilities yêu cầu tung xúc xắc để xác định rent: chủ có 1 utility dùng hệ số 4, có 2 dùng hệ số 10. Số nhân là tổng hai viên xúc xắc của phép tung để xác định rent, không phải số ô, một viên đơn lẻ hoặc ngẫu nhiên do client tự chọn. Không tự dùng lại phép tung di chuyển khi chưa chốt cách số hóa yêu cầu tung.

Áp dụng nguyên tắc thế chấp của S-002: utility đích thế chấp không thu tiền; utility còn lại thế chấp không làm mất quyền sở hữu nhóm.

- CASE-RENT-008: tổng xúc xắc xác định rent là 7, chủ có 1 utility → 28.
- CASE-RENT-009: chủ có cả 2 utility, một thế chấp; khách vào utility còn lại không thế chấp, tổng là 7 → mức thường 70.
- CASE-RENT-010: utility đích thế chấp → không thu tiền, không biến hệ số thành 0 rồi xử lý như một khoản nợ.

Phép tung riêng cho rent là sự kiện phân biệt với tung để di chuyển/đổ đôi/ra tù; không được tự cấp lượt đi thêm từ kết quả này. Cần truy vết đầy đủ trong 01B/01D trước implementation. Thẻ utility có thể quy định phép tung/hệ số riêng; vẫn là phần unresolved cho tới khi có thẻ cùng edition.

## US-COST-001 — Điều kiện áp dụng giá xây

S-002 / Buildings: phải có đủ nhóm màu; không được xây nếu bất kỳ đất nào trong nhóm đang thế chấp. Xây đều, tối đa 4 nhà mỗi đất. Nâng lên khách sạn yêu cầu đã có 4 nhà trên mọi đất trong nhóm, trả khoản nâng ghi trên thẻ và trả lại 4 nhà của đất nâng cho ngân hàng. Mỗi đất chỉ có một khách sạn và không thêm nhà lên đất đó.

Giá một nhà không phải giá tổng của cả nhóm. Khoản nâng khách sạn cũng không phải tổng từ đất trống. Không dùng giá 0 cho railroad/utility vì không có quyền xây trên hai loại này. Ngân hàng chỉ có 32 nhà và 12 khách sạn theo S-002; việc thiếu công trình/đấu giá được đặc tả đầy đủ ở 01C, không cho tạo vô hạn.

- CASE-COST-001: đủ nhóm nhưng có một đất thế chấp → từ chối xây, kể cả xây trên đất khác không thế chấp.
- CASE-COST-002: St. James đã đủ điều kiện nâng khách sạn → trả thêm 100 và trả 4 nhà; không tự trừ lại toàn bộ giá 4 nhà.
- CASE-COST-003: chưa đủ 4 nhà trên mọi đất trong nhóm → chưa được nâng một đất thành khách sạn.

## US-COST-002 — Thế chấp và giải chấp

S-002 / Mortgaging Property: bán lại toàn bộ công trình trong nhóm trước khi thế chấp một đất của nhóm. Đọc mortgage value trên mặt sau thẻ và unmortgage cost trên thẻ khi giải chấp. Số tiền cụ thể của 28 tài sản còn thiếu bằng chứng S-003; không suy ra nửa giá mua hoặc tự thêm lãi 10% từ edition khác.

Phân biệt ba việc: thế chấp tài sản, chuyển tài sản thế chấp, giải chấp. Quy định xử lý chuyển nhượng nằm ở 01C; không tự thu ngay một khoản chưa xác minh chỉ vì người nhận đổi chủ. S-002 / Deals & Trades cho phép người nhận trả unmortgage cost ngay hoặc chờ lượt sau, không ghi công thức phần trăm để ta tự suy mọi chi phí thẻ.

- CASE-COST-004: cố thế chấp đất còn công trình trong nhóm → chưa hợp lệ.
- CASE-COST-005: mortgage value chưa xác minh → không tạo giao dịch giả định và không ghi 0.

## Kiểm tra hoàn thành

- [x] Tách điều kiện thu tiền khỏi bảng giá, có nguồn section và case cho từng loại tài sản.
- [x] Phân biệt sở hữu nhóm, thế chấp và quyền xây; không nhân đôi rent công trình.
- [ ] Đối chiếu đủ S-003 cho giá và hiệu ứng thẻ; không còn giá unresolved khi implement.
- [ ] Chốt chính sách số hóa về yêu cầu rent, thứ tự sự kiện và phép tung utility.
- [ ] Người dùng review 01A; các case trên chưa là test engine, chưa có code gameplay.

## Tiêu chí tương tác đã chốt cho phiên chơi

[Tiêu chí phiên chơi](../shared-session-design.md) giới hạn khởi tạo trade/xây/bán/thế chấp vào lượt/pha cho phép, dù rulebook gốc có quyền hành động ngoài lượt. Đây là yêu cầu sản phẩm được người dùng chốt; không thay đổi giá thuê hoặc tự quyết chính sách yêu cầu rent còn mở ở US-RENT-001. Xem cá nhân và phản hồi do phiên yêu cầu vẫn có thể thực hiện ngoài lượt.
