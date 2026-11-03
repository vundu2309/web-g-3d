---
type: architecture
title: Kiến trúc biển và vòng đời render
description: Luồng khởi động Babylon, trường sóng CPU/GPU, vật liệu nước và ownership tài nguyên của Hải trình.
tags: [ocean, rendering, lifecycle, physics]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T08:01:10.530Z
sources:
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-95b5396fb71f03faa192082c
    resource: repo://src/game/ocean/materials.ts
  - id: openwiki-source-f076bde49e0d74deae49ea82
    resource: repo://src/game/ocean/scene.ts
  - id: openwiki-source-2673a718b19a89a210b2732b
    resource: repo://src/game/ocean/surface.ts
  - id: openwiki-source-a70d9dcc089366b083f1e0f9
    resource: repo://src/game/ocean/waves.ts
generated: { by: "codex", at: "2026-11-03T08:01:10.530Z" }
---

# Kiến trúc biển và vòng đời render

## Luồng khởi động và ownership

`src/main.ts` tìm canvas và nút đổi sóng, gọi `start`, hiển thị trạng thái thành công hoặc lỗi. Khi HMR thay module, cờ `active` ngăn kết quả khởi động cũ giữ lại tài nguyên; cleanup trả về muộn cũng được gọi.

`src/app/start.ts` sở hữu Engine và render loop. Hàm ghép scene, đăng ký resize/click rồi bật nút sóng. Cleanup tháo listener, dừng render loop, dispose scene rồi Engine. Nếu tạo scene thất bại, Engine được dispose trước khi ném lại lỗi. Khi thêm listener cấp app, ghép cleanup ở cùng nơi để tránh nhân đôi sau HMR.

## Trường sóng và thuyền nổi

`waves.ts` tạo 14 thành phần với hướng, tần số, pha và vận tốc khác nhau. Envelope làm biên độ thay đổi theo vùng và thời gian; bảng tham số dùng chung cho mã GLSL sinh trong `materials.ts` và hàm `heightAt` phía CPU. GPU dùng dịch chuyển Gerstner theo cả ngang lẫn dọc và đạo hàm envelope để tính pháp tuyến.

CPU lặp bốn lần để đảo dịch chuyển ngang trước khi lấy độ cao. Đây là phép xấp xỉ để thuyền lấy mẫu đúng trường nước, không phải bộ giải thủy động lực học. `scene.ts` lấy độ cao tại vị trí thuyền và các điểm lân cận để cập nhật vị trí Y, pitch và roll. Thời gian tăng mỗi frame với delta được chặn ở 0.05 giây; nút đổi sóng thay mục tiêu cường độ 0.8/1.5 rồi nội suy theo frame.

Khi thay phương trình sóng GPU, phải cập nhật `heightAt` tương ứng. Gợn nhỏ trong fragment shader chỉ ảnh hưởng ánh sáng, không biến dạng mesh hoặc tác động vật lý lên thuyền.

## Bề mặt nước và hình ảnh

`surface.ts` tạo một lưới liên tục, chia 320 đoạn mỗi chiều, giãn tọa độ theo hàm mũ để tập trung đỉnh gần gốc. Cách này tránh đường ghép giữa hai mesh biển. Shader nước kết hợp pháp tuyến sóng lớn, gợn giao thoa, phản xạ Fresnel, tán xạ màu nước, lobe phản sáng và bọt đứt đoạn. Chi tiết được giảm theo khoảng cách. Bầu trời và thuyền được dựng thủ tục; không có ảnh concept làm nền.

Đây là mô hình render xấp xỉ. Bài test render không chứng minh nước chân thực, không đo FPS trên điện thoại thật và không so sánh chất lượng với concept. Đánh giá thay đổi shader bằng ảnh/video game thật ở cùng góc nhìn, cả gần lẫn xa; kiểm tra chuyển động để phát hiện nhịp lặp và nhiễu hạt.

Bọt đỉnh sóng dùng compression chia cho tổng steepness tại chỗ và độ cao chuẩn hóa của nhóm sóng dài (frequency dưới 0.9). Ngưỡng tuyệt đối cũ hiếm khi được kích hoạt; chuẩn hóa giúp đỉnh sóng lớn tạo được bọt. Noise được dịch theo hướng sóng chính để bẻ mảng bọt và tạo chi tiết bong bóng. Sáu thành phần sóng dài được tăng biên độ 25%; shader và CPU vẫn đọc chung tham số. Đây là shading xấp xỉ, không có lưu lượng/chất lỏng thật.

Vòng bọt elip cố định quanh thân tàu đã bị bỏ vì tạo vết ố khi nhìn từ trên xuống; shader hiện chỉ tạo bọt theo compression/đỉnh sóng và noise. Chỉ thêm bọt tiếp xúc hoặc wake khi có mô hình chuyển động hợp lý.

Hợp đồng module và ownership ổn định được ghi ở [tài liệu kiến trúc do người/agent duy trì](../../docs/architecture.md); AGENTS.md là điểm vào cho agent, OpenWiki là ngữ cảnh tra cứu theo câu hỏi.

## Ranh giới Havok

Scene biển không khởi tạo Havok. `platform/physics.ts` nạp Havok WASM qua asset URL của Vite cho scene thử va chạm `game/playground.ts`. Scene thử giới hạn 32 khối, dispose physics aggregate trước mesh, và scene dispose phần còn lại. Muốn thêm lực nổi hoặc va chạm thuyền thật cần thiết kế kết nối physics riêng; không suy ra đã có lực nổi Havok từ chuyển động hiện tại.

## Đi tiếp

[Xem lệnh chạy và kiểm tra](../operations/development.md) hoặc [bản đồ wiki](../quickstart.md).
