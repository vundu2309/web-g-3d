# Tiêu chí thiết kế — cùng theo dõi một diễn biến

**Trạng thái: đã được người dùng chốt và cập nhật ngày 2026-11-04.** Đây là tiêu chí của game, áp dụng xuyên suốt UI, model, backend và multiplayer khi các phần đó được triển khai. Đã có HUD preview, chưa có gameplay/backend authoritative. Không suy từ “chung màn hình/diễn biến” thành yêu cầu mọi người dùng chung một thiết bị; topology thiết bị không được quyết định ở đây.

## SESSION-001 — Một luồng hành động chung

Mọi thay đổi của ván phải đi theo một trình tự có người thực hiện và kết quả rõ ràng, để những người khác không bỏ lỡ thông tin. Không cho mỗi người tự mở một giao dịch làm thay đổi ván song song ngoài lượt.

## SESSION-002 — Ngoài lượt chỉ quan sát diễn biến chung, không có action

| Thao tác                                          | Ngoài lượt                                                                      | Đến lượt                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| Xem diễn biến bàn chung                           | Tự hiển thị quyết định, thẻ, kết quả của người đang chơi; không có nút thao tác | Được xem                                    |
| Mở tài sản/kho đồ                                 | Không                                                                           | Được khi không có tác vụ bắt buộc xung đột  |
| Chủ động đề nghị trade                            | Không                                                                           | Được nếu không có tác vụ bắt buộc đang treo |
| Chủ động xây/bán nhà, thế chấp/giải chấp          | Không                                                                           | Được khi đúng pha và đủ điều kiện luật      |
| Tung xúc xắc, mua đất, kết thúc lượt              | Không                                                                           | Chỉ đúng người/pha đang được yêu cầu        |
| Phản hồi trade/đấu giá hoặc yêu cầu bắt buộc khác | Chỉ người được phiên yêu cầu phản hồi, đúng bước                                | Cùng điều kiện đó                           |

Ngoài lượt không mở kho đồ. Người dùng đã bỏ nút Lịch sử khỏi giao diện. “Bạn” là danh tính local; highlight “Đến lượt” và dấu “Cần phản hồi” phải phân biệt được.

## SESSION-003 — Phản hồi có chủ đích, không khóa nhầm

Đấu giá có thể cần nhiều người trả giá; trade cần bên nhận chấp nhận/từ chối; nghĩa vụ thanh toán cần đúng người xử lý. Đây là các bước phản hồi thuộc tác vụ chung hiện tại, không phải cho phép mở một tác vụ độc lập ngoài lượt. Chỉ rõ người đang cần phản hồi, yêu cầu và trạng thái đã trả lời/chưa trả lời. Không tự thêm đồng hồ, tự động bỏ lượt hoặc yêu cầu tất cả người chơi bấm xác nhận mọi sự kiện.

Khi có tác vụ bắt buộc chưa xong, khóa các hành động xung đột, giữ diễn biến chung hiển thị và nêu lý do. Không giữ hai giao dịch cạnh tranh cùng một tài sản hoặc cho kết thúc lượt trong lúc nghĩa vụ còn treo. Chi tiết hàng đợi/pha phản hồi thuộc các plan model/backend, chưa chọn cơ chế thực thi ở đây.

## SESSION-004 — Thông tin và HUD

- Cụm action nổi giữa phải giữ vị trí và kiểu nút; thay nội dung/quyền thao tác theo trạng thái. Icon nhỏ cùng cỡ chữ, icon + text trên một dòng, không phình thành panel.
- Ngoài lượt không có lối mở tài sản hoặc action độc lập; không hiển thị nút Lịch sử. Trade không phải action luôn có quyền bấm chỉ vì nút tồn tại; khi khóa phải giải thích “Chờ đến lượt” hoặc tác vụ đang giải quyết.
- Màn quản lý cá nhân chỉ mở trong lượt/pha hợp lệ và không kéo cả nhóm khỏi diễn biến chung. Những người khác tiếp tục thấy tác vụ/lượt hiện tại.
- Kết quả thay đổi tiền, chủ tài sản, công trình và giao dịch phải được thông báo cho tất cả và giữ trình tự sự kiện để đồng bộ. Mất kết nối/vào lại phải có cách xem lại kết quả còn thiếu; không coi snapshot mới nhất tự nó là đảm bảo người chơi đã thấy mọi thông báo.
- Có thể cần nhấn mạnh kết quả chung, nhưng chưa chốt bắt buộc mọi người xác nhận mới tiếp tục. Không tự suy tiêu chí này thành modal hoặc timer ở mọi bước.

## Phân biệt với Monopoly gốc

Rulebook Hasbro cho phép một số việc như trao đổi/xây ngoài lượt. Game này chủ động giới hạn **khởi tạo các thao tác làm thay đổi ván** vào lượt/pha cho phép để duy trì diễn biến chung. Đây là điều chỉnh tương tác đã được người dùng yêu cầu, không được mô tả là nguyên văn luật Monopoly gốc. Các quy tắc kinh tế và điều kiện hợp lệ khác vẫn theo baseline; không tự thay tiền thuê, giá hoặc thêm house rules khác.

## Case thiết kế cho các plan sau

- CASE-SESSION-001: đang lượt Lan, Minh chỉ quan sát → không có action mở Tài sản/Lịch sử; vẫn thấy Lan đang quyết định gì.
- CASE-SESSION-002: đang lượt Lan, Minh muốn gửi trade/xây/thế chấp → chưa được khởi tạo; có lý do dễ hiểu.
- CASE-SESSION-003: Lan gửi trade cho Minh theo đúng pha → Minh được phản hồi dù chưa là lượt Minh; Nam không được chấp nhận thay Minh.
- CASE-SESSION-004: phiên đang đấu giá → người tham gia được phản hồi theo pha đấu giá, không ai mở thêm trade độc lập.
- CASE-SESSION-005: đang xử lý mua/đấu giá/nợ → không cho kết thúc lượt hoặc tung tiếp trái pha.
- CASE-SESSION-006: giao dịch hoàn tất → mọi người thấy kết quả và bắt kịp được khi đồng bộ lại, không thêm nút Lịch sử; HUD trở về action hợp lệ tiếp theo.

Các case là yêu cầu tương lai, chưa phải test engine đã chạy hoặc tính năng đã có.
