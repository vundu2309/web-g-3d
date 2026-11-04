# Plan 02 — Giao diện mobile

**Trạng thái:** Active, bắt đầu **02B — chi tiết tài sản và mua đất** theo yêu cầu chuyển plan của người dùng. Chỉ thiết kế và review, chưa sửa UI runtime hoặc triển khai gameplay.

## Mục tiêu và đầu vào

Thiết kế trải nghiệm Monopoly truyền thống trên điện thoại xoay ngang, giữ tên đất Mỹ và [theme sky/cobalt/yellow đã duyệt](../../design/theme.md). [Baseline Plan 01](01-rules.md) cung cấp danh mục và quy tắc hiện có; số liệu/luật còn thiếu nằm trong checklist bàn giao, không cần tìm đủ từng thẻ mới được vẽ bố cục. Dữ liệu demo trong concept phải ghi rõ là minh họa, không là trạng thái Firebase thật.

Hub hiện có giữ nguyên. Concept bàn chơi là đề xuất mới cần được duyệt; ảnh hub đã duyệt không đồng nghĩa bàn chơi đã được duyệt. Không chọn engine/camera runtime/backend hoặc bật Blaze trong plan này.

## Thứ tự làm từng màn

| Phần | Màn / tác vụ | Trạng thái |
| --- | --- | --- |
| 02A | Bàn chơi chính: xem bàn, biết lượt ai, hành động hiện tại | HUD đã được duyệt; bàn cờ chi tiết chưa được duyệt |
| 02B | Chi tiết tài sản và quyết định mua | Active: concept mua đất đầu tiên chờ review |
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

### HUD đã duyệt

Nguồn: [ảnh HUD đã chốt](../../design/game-hud-approved.png). Người dùng đã duyệt bố cục HUD, không đồng nghĩa duyệt tên/thứ tự ô bị sai trong ảnh gen hoặc đồ họa bàn chi tiết.

- Thông tin 2–4 người chơi ở cạnh dưới, cả nhóm căn giữa màn hình; avatar/tên/tiền không có background panel hoặc thanh nền.
- Không hiển thị tên game trong màn chơi, kể cả logo giữa bàn.
- Người đến lượt có viền vàng quanh avatar, mũi tên và nhãn **ĐẾN LƯỢT**. Dấu này chuyển theo lượt, độc lập nhãn **Bạn**; không highlight cố định người dùng local.
- Nút hành động chính nổi ở khoảng giữa cạnh phải, chừa khoảng cách với mép và bàn cờ; không đặt sát góc dưới. Nội dung thay theo trạng thái, không luôn hiện Tung xúc xắc.
- Tài sản/Lịch sử là lối vào phụ gọn bên trái, settings nhỏ góc trên. Không thêm sidebar lớn hoặc đổi theme đã duyệt.
- Bàn cờ dùng làm ngữ cảnh, chưa chốt rendering 3D/engine; tên và thứ tự phải lấy dữ liệu source, không chép lỗi của ảnh.

### Khả năng thao tác trên điện thoại

Ưu tiên 844×390 và 932×430, kiểm tra thêm 667×375. Bàn 40 ô trên màn ngang có nhiều ô nhỏ hơn 44 px: không tuyên bố mọi ô đã đạt touch target chỉ vì bàn hiển thị đủ. Cần cơ chế phóng to/chọn vùng hoặc danh sách tài sản để mở chi tiết với vùng chạm đủ lớn; chọn giải pháp sau review concept, không ép mọi thông tin lên chữ nhỏ.

Không đòi đọc rõ toàn bộ tên đất cùng lúc. Tên đầy đủ, chủ sở hữu, giá và rent phải đọc được khi chọn tài sản ở 02B. Màn chính dùng overview, màu nhóm, quân và dấu chọn. Nút chính >=44 px, safe area không che nút/roster. Portrait cần bố cục sử dụng được, không ép fullscreen/xoay màn bằng API.

### Trạng thái cần thiết kế sau khi duyệt bố cục cơ sở

- Đến lượt mình: chỉ rõ quyền tung và hành động đang chờ.
- Đang chờ người khác: giữ xem bàn/tài sản, không đưa nút tung có vẻ bấm được.
- Đang giải quyết ô: focus vị trí quân; chuyển qua tác vụ liên quan thay vì chồng tất cả thao tác.
- Đang reconnect: thông báo trạng thái, không hiển thị kết quả giả hoặc tự kết thúc lượt. Chính sách đồng bộ thuộc Plan 05.

### Checklist duyệt riêng 02A

- [x] Gen/revise màn bàn chính và HUD riêng.
- [x] Người dùng duyệt HUD: roster dưới căn giữa không nền, không tên game, action giữa phải, highlight theo lượt. Bàn 3D chi tiết vẫn chưa chốt.
- [ ] Chốt cách mở/phóng to tài sản trên màn nhỏ; nêu rõ giới hạn của ảnh concept.
- [x] Lưu ảnh và quyết định HUD, mở 02B theo yêu cầu người dùng.

## 02B — Chi tiết tài sản và quyết định mua

**Active, chưa duyệt.** [Concept mua đất v1](../../design/property-purchase-draft.png) kế thừa HUD đã chốt; không tự chuyển sang đấu giá hoặc gen nhiều màn đồng thời.

Tác vụ: người đang dừng trên tài sản chưa có chủ xem tên/nhóm, giá mua, tiền đang có và số dư sau mua. Hai lựa chọn là **Mua** và **Đưa ra đấu giá**; không có bỏ qua để tránh đấu giá. Giá/rent trong concept Illinois Avenue là ví dụ từ baseline tài liệu, không chứng minh runtime hoặc mọi trường G0009 đã xác minh.

- Surface tác vụ tập trung ở giữa, tách với roster không nền. Bàn có thể làm mờ để tập trung quyết định; modal nền trắng là surface tác vụ, không phục hồi sidebar HUD cũ.
- Thẻ tài sản có tên tiếng Anh, trạng thái chủ sở hữu và preview rent; xem đủ rent là chi tiết phụ. Hình ngôi nhà trên thẻ là minh họa tài sản, không có nghĩa đất đã xây.
- Hành động mua phải cho thấy giá và số dư sau mua. Tương lai thiếu tiền thì giải thích và không cho mua giả định.
- Trong tác vụ này nút tung xúc xắc của nền phải ẩn hoặc vô hiệu hóa, không cho thực hiện hai hành động đồng thời. Ảnh v1 vẫn có nút mờ phía nền; đây là điểm cần sửa/kiểm chứng khi hiện thực, không là cho phép bấm.
- Concept này chỉ là trạng thái mua. Trạng thái xem tài sản đã có chủ, thiếu tiền và bảng rent đầy đủ cần review riêng khi cần; chưa thêm nút xây/thế chấp ngoài phạm vi.
- [x] Gen concept v1 riêng.
- [ ] Người dùng review bố cục, vùng bấm và nội dung mua/đấu giá.
- [ ] Chốt 02B trước khi mở concept 02C đấu giá.

## Ngoài phạm vi

Không sửa code UI, model, Firebase hoặc backend; không gen toàn bộ các màn một lượt; không tự thêm luật/timeout để giải quyết bố cục. Không deploy Pages cho thay đổi tài liệu/concept chưa ảnh hưởng UI/UX đang chạy.

## Tiêu chí hoàn thành Plan 02

Có luồng và ảnh được duyệt cho từng tác vụ chính, trạng thái chờ/lỗi rõ ràng, ghi layout mobile và hành vi tương tác. Không xem ảnh gen là bằng chứng UI đã render, touch targets đã đo hoặc game đã chơi được; kiểm chứng trình duyệt/thiết bị khi implementation được mở.

**Bằng chứng hiện tại:** HUD 02A đã duyệt và lưu ảnh; 02B có concept mua đất v1 chờ review. Chưa có UI gameplay trong runtime, chưa chọn engine hoặc sửa Firebase. Khả năng chạm/phóng to bàn phải kiểm chứng khi implementation được mở.
