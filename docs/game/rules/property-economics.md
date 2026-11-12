# 01A.2 — Bảng kinh tế tài sản

**Trạng thái: nháp có nguồn, chưa duyệt, không phải config runtime.** Đơn vị là tiền Monopoly (M), số nguyên. `—` nghĩa là **chưa có bằng chứng**, không phải 0/miễn phí. Quyền thu rent và điều kiện áp giá nằm tại [01A.3](rent-conditions.md); đầy đủ lifecycle xây/thế chấp/thẻ thuộc 01C/01D khi được mở.

## Nguồn và mức xác minh

- **S-002:** rulebook G0009 US 2025 chính thức. Đã đọc chữ và phóng to hình trang 2 để đối chiếu các trường được liệt kê bên dưới.
- **S-004:** bảng US/Canada của Wikibooks, revision 4662179; nguồn cộng đồng/khác edition, chỉ cung cấp **ứng viên để review**, không xác nhận toàn bộ bảng là của G0009. [Sổ nguồn](sources.md) ghi URL và giới hạn.
- **S-005:** ảnh thẻ vật lý từ listing ghi Monopoly 2025, xác nhận mặt sau Rhode Island 50/55; chưa có hộp/mã G0009 trong ảnh, xem giới hạn trong sổ nguồn.
- Mọi ô số ở bảng đất màu mặc định là **nháp S-004**, ngoại trừ các trường S-002 được liệt kê rõ. Không dùng nháp để sinh dữ liệu game. Không suy tiền thế chấp bằng nửa giá mua hoặc áp lãi 10% từ edition khác.

**Kiểm tra text theo bảng (2026-11-03):** 21 đất màu × 9 trường = **189 số khớp S-004 revision 4662179**. Đây là xác nhận chép đúng nguồn tham khảo; chưa xác minh toàn bộ edition G0009. Rhode Island không được ánh xạ từ Oriental; các ngoại lệ được gom tại [sổ nguồn](sources.md). Không cần ảnh riêng cho từng hàng để tiếp tục review bảng.

## US-ECON-001 — Giá và rent của 22 đất màu

`Nhóm` là sở hữu cả nhóm nhưng chưa xây. `KS` là một khách sạn. `Xây` là chi phí mỗi nhà hoặc khoản trả thêm để nâng 4 nhà thành khách sạn, không phải tổng chi phí từ đất trống lên khách sạn. Điều kiện được xây vẫn thuộc 01C.

| Ô   | Đất                   | Mua | Trống | Nhóm | 1 nhà | 2 nhà | 3 nhà | 4 nhà | KS   | Xây |
| --- | --------------------- | --- | ----- | ---- | ----- | ----- | ----- | ----- | ---- | --- |
| 1   | Mediterranean Avenue  | 60  | 2     | 4    | 10    | 30    | 90    | 160   | 250  | 50  |
| 3   | Baltic Avenue         | 60  | 4     | 8    | 20    | 60    | 180   | 320   | 450  | 50  |
| 6   | Rhode Island Avenue   | 100 | —     | —    | —     | —     | —     | —     | —    | —   |
| 8   | Vermont Avenue        | 100 | 6     | 12   | 30    | 90    | 270   | 400   | 550  | 50  |
| 9   | Connecticut Avenue    | 120 | 8     | 16   | 40    | 100   | 300   | 450   | 600  | 50  |
| 11  | St. Charles Place     | 140 | 10    | 20   | 50    | 150   | 450   | 625   | 750  | 100 |
| 13  | States Avenue         | 140 | 10    | 20   | 50    | 150   | 450   | 625   | 750  | 100 |
| 14  | Virginia Avenue       | 160 | 12    | 24   | 60    | 180   | 500   | 700   | 900  | 100 |
| 16  | St. James Place       | 180 | 14    | 28   | 70    | 200   | 550   | 750   | 950  | 100 |
| 18  | Tennessee Avenue      | 180 | 14    | 28   | 70    | 200   | 550   | 750   | 950  | 100 |
| 19  | New York Avenue       | 200 | 16    | 32   | 80    | 220   | 600   | 800   | 1000 | 100 |
| 21  | Kentucky Avenue       | 220 | 18    | 36   | 90    | 250   | 700   | 875   | 1050 | 150 |
| 23  | Indiana Avenue        | 220 | 18    | 36   | 90    | 250   | 700   | 875   | 1050 | 150 |
| 24  | Illinois Avenue       | 240 | 20    | 40   | 100   | 300   | 750   | 925   | 1100 | 150 |
| 26  | Atlantic Avenue       | 260 | 22    | 44   | 110   | 330   | 800   | 975   | 1150 | 150 |
| 27  | Ventnor Avenue        | 260 | 22    | 44   | 110   | 330   | 800   | 975   | 1150 | 150 |
| 29  | Marvin Gardens        | 280 | 24    | 48   | 120   | 360   | 850   | 1025  | 1200 | 150 |
| 31  | Pacific Avenue        | 300 | 26    | 52   | 130   | 390   | 900   | 1100  | 1275 | 200 |
| 32  | North Carolina Avenue | 300 | 26    | 52   | 130   | 390   | 900   | 1100  | 1275 | 200 |
| 34  | Pennsylvania Avenue   | 320 | 28    | 56   | 150   | 450   | 1000  | 1200  | 1400 | 200 |
| 37  | Park Place            | 350 | 35    | 70   | 175   | 500   | 1100  | 1300  | 1500 | 200 |
| 39  | Boardwalk             | 400 | 50    | 100  | 200   | 600   | 1400  | 1700  | 2000 | 200 |

### Các trường đã đối chiếu trực tiếp với S-002 trang 2

| Tài sản              | Trường xác minh                                                                    | Vị trí bằng chứng                                                                 |
| -------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mediterranean Avenue | Rent: 2 / 4 / 10 / 30 / 90 / 160 / 250                                             | Hình Title Deed trong Deals & Trades; phần giá xây bị thẻ khác che, chưa xác nhận |
| St. James Place      | Rent: 14 / 28 / 70 / 200 / 550 / 750 / 950; nhà 100; nâng KS thêm 100 + trả 4 nhà  | Hình Title Deed trong Deals & Trades                                              |
| Kentucky Avenue      | Rent: 18 / 36 / 90 / 250 / 700 / 875 / 1050; nhà 150; nâng KS thêm 150 + trả 4 nhà | Hình Title Deed trong Owned Properties / Streets                                  |
| Illinois Avenue      | Giá mua 240                                                                        | Hình minh họa Want to buy it?                                                     |
| Rhode Island Avenue  | Tên và giá mua 100, đứng trước Vermont theo chiều di chuyển                        | Hình light-blue ở Unowned Properties                                              |
| Vermont Avenue       | Giá mua 100                                                                        | Cùng hình light-blue                                                              |
| Connecticut Avenue   | Giá mua 120                                                                        | Cùng hình light-blue                                                              |

### Bằng chứng bổ sung từ ảnh thẻ 2025 (nguồn thứ cấp)

| Nguồn | Tài sản              | Số đọc trực tiếp                       | Giới hạn                                                                             |
| ----- | -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| S-005 | Vermont Avenue       | Rent 6/12/30/90/270/400/550; nhà/KS 50 | Ảnh in copyright 2025; chưa có hộp/mã G0009                                          |
| S-005 | Rhode Island Avenue  | Mortgage 50; unmortgage 55             | Chỉ thấy mặt sau, không xác minh rent/giá xây                                        |
| S-006 | Short Line           | Mortgage 100; unmortgage 110           | Listing ghi 2025, chưa có hộp/mã G0009                                               |
| S-007 | Mediterranean Avenue | Rent 2/4/10/30/90/160/250; nhà/KS 50   | Rent khớp S-002; ảnh in copyright 2025, mã thẻ 4140D1254000020; chưa có hộp/mã G0009 |

Các số này được đọc từ ảnh, không phải suy từ công thức. Mức xác minh là **ảnh thẻ 2025 nguồn thứ cấp**, chưa nâng thành đối chiếu đầy đủ G0009. Các trường khác của các tài sản trên vẫn nháp S-004. Ví dụ xác minh rent của Kentucky không tự xác minh giá mua/mortgage của Kentucky. Không truyền xác minh sang đất cùng nhóm hoặc cùng giá.

**Khác biệt edition cần giữ:** S-004 dùng Oriental Avenue, còn G0009 S-002 minh họa Rhode Island Avenue. Chỉ giữ giá mua 100 đã thấy ở G0009; không sao chép rent/giá xây từ Oriental sang Rhode Island. S-004 cũng cảnh báo Marvin Gardens có rent trống khác giữa các edition; giá 24/48 ở đây chỉ là nháp, không được chốt theo trí nhớ.

## US-ECON-002 — Bốn railroad

| Ô   | Tài sản               | Giá mua ứng viên S-004 | Thế chấp / giải chấp                           |
| --- | --------------------- | ---------------------- | ---------------------------------------------- |
| 5   | Reading Railroad      | 200                    | — / —                                          |
| 15  | Pennsylvania Railroad | 200                    | — / —                                          |
| 25  | B. & O. Railroad      | 200                    | — / —                                          |
| 35  | Short Line            | 200                    | 100 / 110 (ảnh S-006; còn chờ đối chiếu G0009) |

**Đã xác minh S-002 trang 2 / Railroads:** sở hữu 1/2/3/4 railroad → mức thuê lần lượt **25/50/100/200** trong trường hợp thông thường. Giá mua/tên chi tiết/mặt sau từng thẻ vẫn cần S-003. Không xây nhà/khách sạn trên railroad; không ghi giá xây 0 vì đó là hành động không áp dụng. Thẻ di chuyển đến railroad có thể quy định mức thuê khác; chưa mở phần thẻ.

## US-ECON-003 — Hai utility

| Ô   | Tài sản          | Giá mua ứng viên S-004 | Thế chấp / giải chấp |
| --- | ---------------- | ---------------------- | -------------------- |
| 12  | Electric Company | 150                    | — / —                |
| 28  | Water Works      | 150                    | — / —                |

**Đã xác minh S-002 trang 2 / Utilities:** dùng kết quả tung hai xúc xắc để tính rent; chủ có 1 utility → **4 × tổng xúc xắc**, có cả 2 → **10 × tổng xúc xắc**. Cách yêu cầu tung và thẻ ngoại lệ phải theo 01A.3/01D, không tự lấy giá trị lần di chuyển trước. Không xây nhà/KS trên utility. Giá mua và mortgage từng utility còn chờ S-003.

## US-ECON-004 — Thế chấp và giải chấp

**Chưa xác minh đầy đủ toàn bộ 28 tài sản.** Đã tìm thấy ảnh mặt sau Rhode Island Avenue ở nguồn thứ cấp S-005: thế chấp **50**, giải chấp **55**. Đây là số đọc trực tiếp từ ảnh listing ghi 2025; chưa có hộp/mã G0009 để đối chiếu độc lập. S-006 cũng có Short Line 100/110. Các tài sản còn lại và mặt trước Rhode Island vẫn chưa đủ bằng chứng. S-002 / Mortgaging Property yêu cầu đọc mortgage value ở mặt sau thẻ, trả unmortgage cost ghi trên thẻ. Chưa có đủ mặt sau nên để unresolved; không tạo bảng nửa-giá-mua hoặc công thức 10% giả định. Việc không có giá trị là blocker cho implementation kinh tế, không làm hành động thành miễn phí.

## Tình huống kiểm chứng đặc tả

- CASE-ECON-001 (S-002): Kentucky, không xây, đủ nhóm màu và đủ điều kiện thu → 36; có 3 nhà → 700, **không nhân đôi 700**.
- CASE-ECON-002 (S-002): St. James đã có 4 nhà và đủ điều kiện nâng → trả thêm 100, trả lại 4 nhà; không hiểu giá 100 là tổng từ đất trống.
- CASE-ECON-003 (S-002): railroad thông thường, chủ có 3 → 100; không lấy rent nhóm màu.
- CASE-ECON-004 (S-002): utility có 1, tổng xúc xắc 7 → 28; có 2 → 70, với điều kiện không có ngoại lệ từ thẻ.
- CASE-ECON-005: yêu cầu giá mortgage chưa xác minh → phải báo thiếu đặc tả, không tự tính/ghi 0.
- CASE-ECON-006: import bảng Oriental từ S-004 → không được tự coi là thẻ Rhode Island G0009.

Các case là ví dụ tài liệu, chưa có engine hoặc test gameplay. Chưa đánh dấu 01A.2 hoàn thành: còn thiếu S-003, rent/giá xây Rhode Island, mortgage/unmortgage các tài sản khác, đối chiếu edition cho S-005 và việc duyệt bảng.
