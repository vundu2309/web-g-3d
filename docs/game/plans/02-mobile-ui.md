# Plan 02 — Giao diện mobile

**Trạng thái:** Active, bắt đầu **02A — màn bàn chơi chính** theo yêu cầu chuyển plan của người dùng. Chỉ thiết kế và review, chưa sửa UI runtime hoặc triển khai gameplay.

## Mục tiêu và đầu vào

Thiết kế trải nghiệm Monopoly truyền thống trên điện thoại xoay ngang, giữ tên đất Mỹ và [theme sky/cobalt/yellow đã duyệt](../../design/theme.md). [Baseline Plan 01](01-rules.md) cung cấp danh mục và quy tắc hiện có; số liệu/luật còn thiếu nằm trong checklist bàn giao, không cần tìm đủ từng thẻ mới được vẽ bố cục. Dữ liệu demo trong concept phải ghi rõ là minh họa, không là trạng thái Firebase thật.

Hub hiện có giữ nguyên. Concept bàn chơi là đề xuất mới cần được duyệt; ảnh hub đã duyệt không đồng nghĩa bàn chơi đã được duyệt. Không chọn engine/camera runtime/backend hoặc bật Blaze trong plan này.

## Thứ tự làm từng màn

| Phần | Màn / tác vụ | Trạng thái |
| --- | --- | --- |
| 02A | Bàn chơi chính: xem bàn, biết lượt ai, hành động hiện tại | Active, đang lập brief |
| 02B | Chi tiết tài sản và quyết định mua | Chờ 02A được duyệt |
| 02C | Đấu giá một tài sản | Backlog |
| 02D | Tài sản cá nhân, xây/bán/thế chấp | Backlog |
| 02E | Đề nghị và xác nhận trao đổi | Backlog |
| 02F | Thẻ/nhà tù và xử lý nợ | Backlog |
| 02G | Kết quả ván và trạng thái mất kết nối/vào lại | Backlog |

Đây là danh mục màn, không phải cho phép làm đồng loạt. Mỗi phần: brief → ảnh concept riêng → người dùng review → ghi quyết định → sang màn tiếp theo. Không gen tất cả các màn ghép chung một ảnh. Plan 02 chỉ hoàn thành khi các màn cần thiết được duyệt; implementation thuộc các plan sau.

## 02A — Brief màn bàn chơi chính

### Việc người chơi phải hiểu ngay

1. Mình ở đâu trên bàn, ai đang có lượt và hành động tiếp theo là gì.
2. Tiền của mình và tình hình những người còn lại.
3. Cách xem đất/quân cụ thể mà không cần đọc chữ rất nhỏ trên toàn bàn.

### Bố cục đề xuất để gen ảnh đầu tiên

- Một bàn vuông 40 ô làm trọng tâm, nhìn từ trên xuống hoặc nghiêng rất nhẹ để còn đọc được nhóm màu và quân. Góc nhìn này là đề xuất hình ảnh, chưa chọn renderer/3D engine.
- Vùng thông tin bên cạnh: người đang có lượt, tiền và một nút hành động chính theo trạng thái. Ví dụ ở trạng thái đến lượt là **Tung xúc xắc**; không luôn hiện cả Tung/Mua/Xây/Kết thúc để người chơi đoán nút nào hợp lệ.
- Roster 2–4 người gọn, dùng tên, số tiền và dấu hiệu lượt; không chỉ phân biệt bằng màu. Chưa tự nới giới hạn hub lên 6.
- Lối vào **Tài sản**, **Lịch sử lượt**, **Tùy chọn** là tác vụ phụ. Chi tiết mở riêng khi cần, không trải tất cả bảng quản lý lên bàn.
- Tên đất tiếng Anh. Text thao tác tiếng Việt. Không thay bằng tên địa phương mới hoặc dựng nền biển/thuyền.
- Giữ các màu nhóm đất làm thông tin gameplay, còn chrome/nút/panel dùng palette chung của hub; không tự đổi sang theme casino/neon.

### Khả năng thao tác trên điện thoại

Ưu tiên 844×390 và 932×430, kiểm tra thêm 667×375. Bàn 40 ô trên màn ngang có nhiều ô nhỏ hơn 44 px: không tuyên bố mọi ô đã đạt touch target chỉ vì bàn hiển thị đủ. Cần cơ chế phóng to/chọn vùng hoặc danh sách tài sản để mở chi tiết với vùng chạm đủ lớn; chọn giải pháp sau review concept, không ép mọi thông tin lên chữ nhỏ.

Không đòi đọc rõ toàn bộ tên đất cùng lúc. Tên đầy đủ, chủ sở hữu, giá và rent phải đọc được khi chọn tài sản ở 02B. Màn chính dùng overview, màu nhóm, quân và dấu chọn. Nút chính >=44 px, safe area không che nút/roster. Portrait cần bố cục sử dụng được, không ép fullscreen/xoay màn bằng API.

### Trạng thái cần thiết kế sau khi duyệt bố cục cơ sở

- Đến lượt mình: chỉ rõ quyền tung và hành động đang chờ.
- Đang chờ người khác: giữ xem bàn/tài sản, không đưa nút tung có vẻ bấm được.
- Đang giải quyết ô: focus vị trí quân; chuyển qua tác vụ liên quan thay vì chồng tất cả thao tác.
- Đang reconnect: thông báo trạng thái, không hiển thị kết quả giả hoặc tự kết thúc lượt. Chính sách đồng bộ thuộc Plan 05.

### Checklist duyệt riêng 02A

- [ ] Gen một ảnh màn bàn chính ngang theo brief, không ghép màn mua/đấu giá vào cùng concept.
- [ ] Người dùng duyệt bố cục, mức độ 3D, vị trí panel/roster và độ rõ hành động.
- [ ] Chốt cách mở/phóng to tài sản trên màn nhỏ; nêu rõ giới hạn của ảnh concept.
- [ ] Ghi phiên bản ảnh/thay đổi đã duyệt trước khi mở 02B.

## Ngoài phạm vi

Không sửa code UI, model, Firebase hoặc backend; không gen toàn bộ các màn một lượt; không tự thêm luật/timeout để giải quyết bố cục. Không deploy Pages cho thay đổi tài liệu/concept chưa ảnh hưởng UI/UX đang chạy.

## Tiêu chí hoàn thành Plan 02

Có luồng và ảnh được duyệt cho từng tác vụ chính, trạng thái chờ/lỗi rõ ràng, ghi layout mobile và hành vi tương tác. Không xem ảnh gen là bằng chứng UI đã render, touch targets đã đo hoặc game đã chơi được; kiểm chứng trình duyệt/thiết bị khi implementation được mở.

**Bằng chứng hiện tại:** brief và danh mục màn đã được ghi; chưa có ảnh bàn chơi mới được duyệt, chưa có UI gameplay trong runtime. Bước tiếp theo là gen/review ảnh 02A, không quay lại vòng kiểm tra từng thẻ.
