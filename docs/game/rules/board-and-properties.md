# 01A — Bàn cờ và tài sản

**Trạng thái:** Nháp cần xác minh, chưa implement. Hướng Classic US và tên đất đã được chọn qua S-001; đã chọn rulebook G0009 US copyright 2025 (S-002). Bảng dưới vẫn cần đối chiếu mặt bàn/Title Deed của bộ đó (S-003); rulebook không chứng minh mọi ô/giá.

## US-BOARD-001 — Danh mục tham chiếu

Chỉ số 0 là GO, tăng theo chiều di chuyển. Đây là chỉ số đặc tả dự kiến, không phải schema đã tồn tại trong source. Tên hiển thị tiếng Anh không được tự Việt hóa. Khác biệt dấu câu/cách viết phải đối chiếu đúng edition, đặc biệt railroad.

| Vị trí | Tên                   | Loại / nhóm |
| ------ | --------------------- | ----------- |
| 0      | GO                    | Special     |
| 1      | Mediterranean Avenue  | Brown       |
| 2      | Community Chest       | Card        |
| 3      | Baltic Avenue         | Brown       |
| 4      | Income Tax            | Special     |
| 5      | Reading Railroad      | Railroad    |
| 6      | Rhode Island Avenue   | Light blue  |
| 7      | Chance                | Card        |
| 8      | Vermont Avenue        | Light blue  |
| 9      | Connecticut Avenue    | Light blue  |
| 10     | Jail / Just Visiting  | Special     |
| 11     | St. Charles Place     | Pink        |
| 12     | Electric Company      | Utility     |
| 13     | States Avenue         | Pink        |
| 14     | Virginia Avenue       | Pink        |
| 15     | Pennsylvania Railroad | Railroad    |
| 16     | St. James Place       | Orange      |
| 17     | Community Chest       | Card        |
| 18     | Tennessee Avenue      | Orange      |
| 19     | New York Avenue       | Orange      |
| 20     | Free Parking          | Special     |
| 21     | Kentucky Avenue       | Red         |
| 22     | Chance                | Card        |
| 23     | Indiana Avenue        | Red         |
| 24     | Illinois Avenue       | Red         |
| 25     | B. & O. Railroad      | Railroad    |
| 26     | Atlantic Avenue       | Yellow      |
| 27     | Ventnor Avenue        | Yellow      |
| 28     | Water Works           | Utility     |
| 29     | Marvin Gardens        | Yellow      |
| 30     | Go To Jail            | Special     |
| 31     | Pacific Avenue        | Green       |
| 32     | North Carolina Avenue | Green       |
| 33     | Community Chest       | Card        |
| 34     | Pennsylvania Avenue   | Green       |
| 35     | Short Line            | Railroad    |
| 36     | Chance                | Card        |
| 37     | Park Place            | Dark blue   |
| 38     | Luxury Tax            | Special     |
| 39     | Boardwalk             | Dark blue   |

## US-ASSET-001 — Dữ liệu phải hoàn thiện

Mỗi đất màu cần giá mua, rent trống, rent khi sở hữu nhóm đầy đủ, rent 1/2/3/4 nhà và khách sạn, giá xây, tiền thế chấp và điều kiện tính tiền thuê. Railroad/utility có công thức riêng, không ép vào công thức rent đất màu. Không dùng 0 làm placeholder cho giá chưa biết; để trạng thái unresolved và không sinh config runtime.

- [x] Chọn và đọc S-002: G0009 US, rulebook 2025.
- [ ] Thu thập S-003 và đối chiếu spelling/thứ tự cả 40 ô.
- [ ] Đối chiếu 22 đất màu, 4 railroad, 2 utility và 12 ô còn lại.
- [ ] Lập bảng kinh tế đầy đủ với nguồn trên từng nhóm dữ liệu.
- [ ] Phân biệt số liệu thẻ đất với quy tắc thế chấp/xây/thuê ở 01C.
- [ ] Người dùng duyệt phần 01A trước khi chuyển sang phần tiếp theo.

## Ví dụ kiểm chứng dự kiến

- CASE-BOARD-001: đi từ vị trí 39 thêm một bước → vị trí 0; tiền qua GO thuộc luật 01B, không suy từ phép modulo.
- CASE-BOARD-002: hai ô Community Chest/Chance khác vị trí phải có ID ô riêng dù cùng tên.
- CASE-ASSET-001: đủ nhóm màu nhưng có đất thế chấp → kiểm tra điều kiện tiền thuê/xây theo 01C, không tự cho phép xây.

Bảng kinh tế nháp và nguồn theo từng trường nằm tại [01A.2 — giá tài sản](property-economics.md). Đối chiếu S-002 trang 2 đã sửa vị trí 6 từ tên tham khảo cũ Oriental Avenue sang **Rhode Island Avenue** của G0009; không coi hai bộ là cùng dữ liệu thẻ.

Các ví dụ chưa có test vì gameplay chưa được triển khai. Hoàn thành 01A khi bảng và số liệu đã đối chiếu nguồn, mọi mâu thuẫn được xử lý và người dùng duyệt.
