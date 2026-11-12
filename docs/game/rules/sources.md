# Nguồn tham chiếu và câu hỏi mở

## Quy trình đối chiếu ưu tiên text

Đã được người dùng đồng ý: đọc rulebook Hasbro dạng text cho luật; lấy bảng text có URL/revision cho giá và kiểm tra toàn bảng một lượt. Chỉ dùng ảnh khi một trường cụ thể bị thiếu hoặc xung đột, không dùng ảnh làm điều kiện bắt buộc cho mọi giá trị. Dữ liệu ảnh đã có giữ lại làm bằng chứng, không cần xem lại.

Phân biệt ba việc: **khớp nguồn text**, **xác minh đúng edition G0009**, **người dùng duyệt đặc tả**. Việc thứ nhất không tự hoàn thành hai việc sau. Khi nguồn text dùng tên/luật khác, ghi khác biệt, ưu tiên rulebook chính thức và không tự ghép các giá trị. Tập hợp vấn đề còn mở để review một lần, không yêu cầu người dùng xác nhận từng con số.

## Sổ nguồn

| ID    | Nguồn                                                                                                                                                                                                    | Trạng thái                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| S-001 | Các quyết định người dùng được ghi lại tại [game README](../README.md), D-001 đến D-005                                                                                                                  | Xác nhận hướng sản phẩm, không thay thế rulebook                                                                       |
| S-002 | [Hasbro G0009, Classic với storage tray](https://instructions.hasbro.com/en-us/instruction/monopoly-board-game-classic-game-with-storage-tray-and-larger-tokens-family-games-8), PDF chính thức bên dưới | Đã đọc rulebook tiếng Anh Mỹ, copyright 2025; chọn làm nguồn cơ sở sau khi người dùng đồng ý hướng Classic US hiện đại |
| S-003 | Title Deed cards, mặt bàn và hai bộ thẻ của G0009 US                                                                                                                                                     | Chưa thu thập đủ; hình mẫu trong S-002 chỉ xác minh các trường được ghi trong property-economics.md                    |
| S-004 | [Wikibooks Properties reference, revision 4662179](https://en.wikibooks.org/w/index.php?title=Monopoly/Properties_reference&oldid=4662179), bảng US/Canada                                               | Nguồn cộng đồng, không chứng minh G0009; dùng lập nháp có nhãn, không quyết định luật khi mâu thuẫn nguồn chính thức   |

Khi xác minh S-002/S-003, ghi URL trực tiếp, tên sản phẩm, mã bộ, năm/edition, ngày truy cập và trang/section/card ID. Trang tìm kiếm chung không đủ chứng minh một con số. Ưu tiên nguồn Hasbro chính thức; không dùng wiki/fan rules làm nguồn quyết định khi có khác biệt.

## Câu hỏi mở

| ID    | Cần giải quyết                                                                                           | Ảnh hưởng                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Q-001 | Đã chọn G0009 US, rulebook copyright 2025 (S-002); chốt hướng nguồn, không đồng nghĩa duyệt toàn bộ luật | Đóng phần chọn rulebook; bảng kinh tế/thẻ vẫn chờ S-003                                   |
| Q-002 | Đối chiếu bảng giá, rent tiers, mortgage và giá xây trên Title Deed                                      | 01A                                                                                       |
| Q-003 | Chốt bộ thẻ của cùng edition, tránh trộn thẻ Community Chest cũ/mới                                      | 01D                                                                                       |
| Q-004 | S-002 bìa và trang sản phẩm ghi 2–6 người, 8+; hub hiện chỉ 2–4                                          | Đã xác minh số người của bộ gốc; hỗ trợ thêm người cần quyết định riêng, không tự nới hub |
| Q-005 | Cách diễn đạt/giới hạn thời gian để yêu cầu rent, đấu giá, giao dịch trong online                        | Tách chính sách số hóa khỏi luật gốc, không tự thêm timeout hoặc auto-forfeit             |

Không có câu trả lời mặc định cho các mục này. Có thể nghiên cứu/xác minh phần độc lập; chỉ cần hỏi người dùng khi quyết định edition/chính sách ảnh hưởng kết quả không thể suy ra từ hướng đã chốt.

## S-002 — Bản được chọn và bằng chứng

- Tên Hasbro: **Monopoly Board Game, Classic Game with Storage Tray and Larger Tokens, Family Games, 8+**.
- Mã sản phẩm: **G0009**; tài liệu: **G0009GA01_INST_MONOPOLY_CLASSIC_REFRESH_FAR.pdf**.
- [PDF do trang Hasbro liên kết](https://assets-us-01.kc-usercontent.com/500e0a65-283d-00ef-33b2-7f1f20488fe2/12890f7d-e57c-47f5-9d25-288b2fa5c397/G0009GA01_INST_MONOPOLY_CLASSIC_REFRESH_FAR.pdf).
- Copyright in trên rulebook: **1935, 2025 Hasbro**. Đây là mốc tài liệu được dùng, không khẳng định bản này bán chạy nhất hoặc là bản mới nhất mọi thị trường.
- Truy cập và đọc ngày **2026-11-03**; 2 trang PDF (mỗi trang là một mặt tờ gấp).
- SHA-256 PDF đã đọc: `91e4e4548cda68d1d58b4f813605c3821dc75a5e3e679502d4fded6039fb5ca5`.
- Trang 1: bìa G0009, 8+/2–6, CONTENTS, SET IT UP!, PLAY!, cảnh báo không dùng house rules.
- Trang 2: Properties, Action Spaces, Buildings, Deals & Trades, Help! I Can't Pay!, gồm ví dụ **Illinois Avenue**, thuật ngữ **railroads** và **color sets** của tài liệu US.
- CONTENTS ghi 28 Title Deed, 16 Chance, 16 Community Chest, 32 Houses và 12 Hotels. Rulebook không cung cấp toàn bộ 28 Title Deed hoặc đủ 32 mặt thẻ; chưa thể coi Q-002/Q-003 hoàn thành.

### Cảnh báo nguồn khác vùng

Trang Hasbro en-us cho mã **C1009** hiện liên kết `C1009780B_INST_MN_CLASSIC_F22_FAR.pdf` dùng các thuật ngữ `colour`, `stations`, `Super Tax`. Vì vậy đường dẫn en-us hoặc mã SKU chung không tự chứng minh PDF là US. Không dùng PDF đó để điền dữ liệu cho G0009 US. Khi link Hasbro thay đổi, so SHA/edition/ngôn ngữ trước khi thay nguồn; không ghép dữ liệu của hai bộ chỉ vì đều mang tên Classic.

## S-004 — Bảng kinh tế tham khảo, không phải nguồn quyết định G0009

Đọc ngày 2026-11-03 tại [Properties reference](https://en.wikibooks.org/wiki/Monopoly/Properties_reference), revision 4662179, trang ghi sửa lần cuối 2026-08-19. Cột US/Canada cung cấp giá mua, giá xây và rent của bộ tiêu chuẩn, không chỉ rõ mã G0009. Trang ghi Oriental Avenue và có ghi chú khác biệt rent Marvin Gardens theo edition. Vì thế chỉ dùng làm bảng nháp, không suy ra tương thích G0009. Bảng tổng hợp tại [property-economics](property-economics.md) giữ nguồn cho từng trường và không dùng cột UK/International làm tên hiển thị.

## Bằng chứng bổ sung S-002 cho 01A.2

Đã xem hình trang 2 ở độ phóng đại đủ đọc: Kentucky Avenue (rent/giá xây), Mediterranean Avenue (rent; giá xây bị che), St. James Place (rent/giá xây), Illinois Avenue (mua 240), cụm Connecticut/Vermont/**Rhode Island Avenue** (mua 120/100/100). Bảng tên tham khảo cũ được sửa vị trí 6 theo G0009, không tự đưa rent Oriental vào Rhode Island. Railroads và Utilities trên cùng trang xác nhận công thức rent thông thường. Chưa có mặt sau để chốt mortgage/unmortgage. Danh mục 40 ô còn phải đối chiếu toàn bàn, không được gọi là đã xác minh hết.

## Điều kiện giá đã đối chiếu từ S-002

[01A.3](rent-conditions.md) dẫn cụ thể Owned Properties, Collect color sets!, Railroads, Utilities, Buildings, Mortgaging Property và Deals & Trades ở trang PDF 2. Các mục này xác định quyền thu, điều kiện thế chấp/xây và công thức rent thông thường; không xác minh các số tiền mặt sau thẻ còn thiếu. Phép tung utility, yêu cầu rent trước lượt tiếp theo và cách xử lý trên online cần tách chính sách số hóa, không tự mặc định auto-claim hoặc timeout.

## S-005 — Ảnh thẻ vật lý từ nguồn bán lại Monopoly 2025

Đọc ngày 2026-11-03, nguồn thứ cấp, không phải Hasbro xuất bản. [Listing eBay 267501640627](https://www.ebay.com/itm/267501640627), tiêu đề từ trang kết quả tìm kiếm: “MONOPOLY 2025 Replacement Property Title Deed Cards NEW - YOU PICK”. [Ảnh thẻ gốc đọc được](https://i.ebayimg.com/images/g/lb8AAeSwFSxpMoyf/s-l1600.jpg).

Ảnh cho thấy mặt sau **RHODE ISLAND AVENUE**, ghi **MORTGAGE VALUE 50**, **TO UNMORTGAGE, PAY 55**. Đây là số đọc trực tiếp, không suy công thức từ giá mua. Mặt trước Vermont Avenue trong cùng ảnh ghi copyright 1935, 2025 HASBRO, rent 6/12/30/90/270/400/550 và giá nhà/khách sạn 50. Không nhầm rent Vermont với Rhode Island bị che mặt trước.

Giới hạn: chưa thấy hộp/mã G0009 trong ảnh, nên chỉ xác minh nội dung ảnh của listing ghi 2025, không coi toàn bộ listing là xác nhận edition độc lập. Trang chi tiết hiện trả trang kiểm tra tự động; ảnh public và kết quả tìm kiếm đọc được. Chưa xem được ảnh mặt trước Rhode Island. Không dùng ảnh này để chốt mọi mortgage khác hoặc suy quy tắc lãi chung.

## S-006 — Ảnh mặt sau Short Line, listing ghi 2025

[Listing eBay 267483185422](https://www.ebay.com/itm/267483185422), tiêu đề từ trang kết quả: “Monopoly Game Complete Set Property Title Deed Cards - New Sealed - 2025”. [Ảnh gốc](https://i.ebayimg.com/images/g/WnoAAeSwULxpH2nX/s-l1600.jpg), đọc 2026-11-03.

Mặt sau **SHORT LINE** ghi rõ mortgage value **100**, unmortgage **110**. Không suy tiền cho ba railroad còn lại. Đây là nguồn bán lại, chưa thấy hộp/mã G0009 trong ảnh; xác minh nội dung ảnh, chưa xác minh độc lập toàn bộ edition.

## S-007 — Ảnh mặt trước Mediterranean Avenue, copyright 2025

[Listing eBay 257232447514](https://www.ebay.com/itm/257232447514), tiêu đề từ trang kết quả: “2025 Monopoly Property Title Deed Cards Complete Set - Game Replacement Parts”. [Ảnh gốc](https://i.ebayimg.com/images/g/ncMAAeSwMIJpKL00/s-l1600.jpg), đọc 2026-11-03.

Mặt trước **MEDITERRANEAN AVENUE** đọc được rent **2/4/10/30/90/160/250**, houses cost **50 each**, hotels cost **50 each (plus 4 houses)**. Thẻ in **©1935, 2025 HASBRO**, mã **4140D1254000020**. Tiền thuê khớp hình trong S-002; phần giá xây mà S-002 bị che nay có ảnh đọc được từ nguồn thứ cấp. Chưa thấy hộp/mã G0009, không tự xác minh phần thẻ bị chồng hoặc mặt sau.

### Hash ảnh đã đọc

Hash giúp nhận diện đúng ảnh nếu nội dung URL đổi; không biến nguồn bán lại thành nguồn Hasbro chính thức.

- S-005, SHA-256: `01f98c2d2e6ce3eddbbe87ec4b26470c433782f2b181f56905e35325b5b7c49b`.
- S-006, SHA-256: `5031e43c427626ebb912db8014a8ed73cd96781e3946549038d2a4c6096cc35f`.
- S-007, SHA-256: `456313580a87ed2110402e7906efb0411b5e00ed6de565428348db494e454b21`.

## Kết quả đối chiếu text theo bảng — 2026-11-03

Đã tải S-004 tại URL revision cố định `oldid=4662179`, đọc bảng HTML và so với Markdown property-economics theo tên tài sản, không so theo số thứ tự hàng của hai nguồn.

- **21 đất màu × 9 trường = 189 giá trị khớp**: giá mua, 7 mức rent (trống/nhóm/1–4 nhà/KS) và giá xây.
- Bỏ ký hiệu chú thích `[1]` ở Marvin Gardens khi đọc số; vẫn giữ cảnh báo khác edition, không bỏ qua nội dung chú thích.
- Không ánh xạ Oriental Avenue sang Rhode Island Avenue. Giá mua Rhode Island 100 đã có S-002; 7 mức rent và giá xây còn thiếu.
- S-004 không cung cấp bảng mortgage/unmortgage, nên phép so này không chốt được các trường đó. Hai giá trị đã đọc từ ảnh Rhode Island/Short Line vẫn có nguồn riêng.
- Kết quả chứng minh bảng nháp chép đúng nguồn text, không chứng minh cả 189 giá trị là thẻ G0009 đã xác minh hoặc đã được người dùng duyệt.

### Danh sách ngoại lệ cần xử lý cùng đợt

| Mục                            | Trạng thái / cách tiếp tục                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Rhode Island: 7 rent + giá xây | Không có trong S-004; cần text ghi đúng tên/edition hoặc bằng chứng thẻ cụ thể, không copy Oriental |
| Mortgage/unmortgage chưa có số | Chỉ dùng text có nguồn phù hợp; không suy nửa giá mua/10% thành số xác minh từ hai ảnh mẫu          |
| Marvin Gardens 24/48           | Đã khớp S-004; còn cảnh báo khác edition cần đối chiếu trước khi chốt                               |
| Bộ thẻ sự kiện                 | Thuộc 01D, chưa mở; không tiếp tục tìm ảnh ngoài phần 01A                                           |

Không lặp tìm gallery eBay bị chặn hoặc render lại các thẻ đã đọc ở lượt tiếp theo nếu không có URL/bằng chứng mới. Không để một ngoại lệ ngăn việc so phần bảng còn lại.
