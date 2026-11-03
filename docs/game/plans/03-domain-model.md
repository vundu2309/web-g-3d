# Plan 03 — Model và luật thuần

**Trạng thái:** Backlog, chưa được mở để thực hiện.

## Mục tiêu

Xây bộ luật thuần có thể mô phỏng ván, độc lập DOM và Firebase.

## Đầu vào

Plan 01 được duyệt; API state chỉ là đề xuất đến khi được mở plan.

## Công việc khi được mở

- [ ] Thiết kế state, command/result, ID ổn định và pha lượt dựa trên mã luật.
- [ ] Tách randomness thành đầu vào kiểm soát được; ghi test tình huống và bảo toàn tiền/tài sản.
- [ ] Kiểm tra command sai lượt, đấu giá/trao đổi/nợ, chuyển người và kết thúc; chưa tin client là authority.

## Ngoài phạm vi

Đồ họa hoặc deploy backend sản xuất.

## Tiêu chí hoàn thành

Test theo ID luật và mô phỏng được một ván; không có SDK/DOM trong model.

**Bằng chứng:** Chưa có; đây là plan, không mô tả tính năng đã tồn tại. Cập nhật trạng thái và bằng chứng khi thực hiện; chỉ tập trung một plan theo yêu cầu hiện hành.
