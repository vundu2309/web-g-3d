# Plan 04 — Backend gameplay

**Trạng thái:** Backlog, chưa được mở để thực hiện.

## Mục tiêu

Thiết kế và triển khai nơi xác thực hành động, sinh xúc xắc và ghi trạng thái ván.

## Đầu vào

Plan 03 có contract/test ổn định; Firebase Functions/Blaze là đề xuất, chưa được chọn hoặc triển khai.

## Công việc khi được mở

- [ ] Chốt server authority, runtime, chi phí và quyền triển khai trước khi chọn dịch vụ.
- [ ] Kiểm tra danh tính/thành viên/lượt, version, idempotency và command trùng; commit nguyên tử.
- [ ] Đặc tả schema, rules, API lỗi và randomness không do client quyết định; test emulator trước production.

## Ngoài phạm vi

Đổi database/region/billing khi chưa được giao; coi rules hub là đủ cho kinh tế.

## Tiêu chí hoàn thành

Yêu cầu sai bị từ chối; cùng command không thanh toán hai lần; backend kiểm chứng state nhất quán.

**Bằng chứng:** Chưa có; đây là plan, không mô tả tính năng đã tồn tại. Cập nhật trạng thái và bằng chứng khi thực hiện; chỉ tập trung một plan theo yêu cầu hiện hành.
