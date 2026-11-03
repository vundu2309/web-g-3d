---
type: architecture
title: Kiến trúc hub và đồng bộ phòng
description: Luồng giao diện mobile, luật phòng thuần, adapter bản thử và Firebase, quyền truy cập và giới hạn trước khi có bàn chơi.
tags: [hub, rooms, mobile, firebase, architecture]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-03T16:08:25.086Z
sources:
  - id: openwiki-source-1207dc6dc9df1cc76b6da2de
    resource: repo://docs/diagnostics.md
  - id: openwiki-source-8acf8e92f9f7b465d02fa04b
    resource: repo://firestore.indexes.json
  - id: openwiki-source-60b51f83565a4de6497fc329
    resource: repo://firestore.rules
  - id: openwiki-source-3cc44dcb42d14ad2fffb83f2
    resource: repo://src/app/account.ts
  - id: openwiki-source-2d276ab0949853064e1a4208
    resource: repo://src/app/diagnostics.ts
  - id: openwiki-source-fc82ffca2def259f088b8cf9
    resource: repo://src/app/start.ts
  - id: openwiki-source-435a4eb0dedae12246227bd4
    resource: repo://src/hub/diagnostics.ts
  - id: openwiki-source-32927955437a252a5e197780
    resource: repo://src/hub/model.ts
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-073cd1426719ad5862d4f152
    resource: repo://src/platform/demo.ts
  - id: openwiki-source-0eacf94e25ae0c7320c6f741
    resource: repo://src/platform/firebase.ts
  - id: openwiki-source-a2b90583a7b340fe72510d57
    resource: repo://src/platform/firestore-client.ts
  - id: openwiki-source-6475f92dc7ed4bc9b5b6546c
    resource: repo://src/platform/profile.ts
  - id: openwiki-source-be28d8122fde564d35ddd891
    resource: repo://tests/rules.test.mjs
generated: { by: "codex", at: "2026-11-03T16:08:25.086Z" }
---

# Kiến trúc hub và đồng bộ phòng

## Phạm vi và chủ sở hữu

Phố Tỷ Phú hiện là hub, chưa có bàn chơi hay kinh tế bất động sản. Entry `src/main.ts` nạp font/CSS và khởi động app. `src/app/start.ts` sở hữu DOM, form, chuyển màn, kết nối store và đăng ký theo dõi phòng. SVG nằm trong `src/ui/art.ts`; theme dùng CSS chung. Cảnh biển, Babylon và Havok đã được bỏ khỏi runtime.

Model `src/hub/model.ts` không phụ thuộc Firebase hay DOM: định nghĩa Room/Player, chuẩn hóa tên/mã, tạo phòng và xử lý lệnh trên bản sao dữ liệu. `src/hub/store.ts` chỉ định contract tạo, tham gia, cập nhật, theo dõi và dispose. Adapter hạ tầng không nhập ngược app; lint kiểm tra ranh giới này.

## Luồng vào phòng và trạng thái

Trang chính có danh tính player và hai lựa chọn tạo/tham gia. Online yêu cầu Firebase Email/Password: dialog riêng cung cấp đăng ký, đăng nhập, hiện/ẩn mật khẩu và reset. `src/app/account.ts` sở hữu dialog; `src/platform/account.ts` dùng SDK, còn `firebase-client.ts` khởi tạo app/config chung. Mật khẩu không lưu trong app database hoặc bảng local. Tên online lấy từ hồ sơ đã xác thực, không tin tên truyền từ form. Bản thử vẫn có tên cục bộ riêng. Sau khi store hoàn tất, app lưu mode/mã theo tab trong sessionStorage và theo dõi phòng. Reload khôi phục listener; phòng đóng hoặc mất tư cách thành viên đưa người dùng về trang chính kèm thông báo. Nội dung tên được escape trước khi ghép HTML.

Phòng có tên (title) và host bất biến, thời điểm tạo, sức chứa tối đa 2–4, status và players theo UID. Chỉ mục seats 0–3 ánh xạ ngược về UID để rules kiểm tra giới hạn chỗ và tư cách thành viên. Ghế/màu của người còn lại không bị đổi khi có người rời đi.

Host luôn sẵn sàng. Khách chỉ bật/tắt trạng thái của chính mình. Chỉ host bắt đầu; cần ít nhất hai người và mọi người hiện diện đã sẵn sàng, không cần lấp đầy tất cả chỗ trống. Host rời sẽ đóng phòng; khách chỉ xóa bản thân. Bắt đầu đổi status thành `started` và hiển thị rằng bàn chơi chưa được phát triển, không chạy một ván game giả.

## Đồng bộ và cạnh tranh

Online là mặc định; app khôi phục danh tính qua Firebase Auth Email/Password, không dùng anonymous. Hồ sơ chỉ chứa displayName/createdAt ở `monopolyHub/v1/profiles/<UID>` và chỉ chủ tài khoản đọc/ghi. Cloud Firestore `(default)` lưu profile và room documents. `onSnapshot` nhận cập nhật phòng; `runTransaction` đọc trạng thái rồi áp dụng command nguyên tử, thử lại contention tối đa năm lần. Hai lượt lấy chỗ cuối không cùng commit. Storage dùng server Timestamp, adapter đổi sang milliseconds cho model và giữ Timestamp gốc khi update. Transaction không xếp hàng offline như một setDoc tùy ý. `src/platform/profile.ts` đồng bộ own profile; `firestore-client.ts` khởi tạo database. Auth restore không kéo Firestore SDK vào màn home.

Bản thử là lựa chọn riêng có nhãn, chỉ dùng cùng browser origin. localStorage lưu phòng; Web Locks tuần tự hóa thay đổi, storage event thông báo các tab khác. Nó không kết nối điện thoại khác và không tự thay thế online khi lỗi. Phòng thử quá một ngày không cho tham gia mới.

## Quyền, vòng đời và giới hạn

Rules mặc định từ chối root và yêu cầu password-provider identity để đọc phòng/profile. Danh sách phòng cho phép truy vấn `where(status == waiting)`, `orderBy(createdAt, desc)`, `limit(50)` với composite index trong firestore.indexes.json; đọc không giới hạn bị từ chối. Màn Chọn phòng hiển thị title, host displayName, số chỗ và nút vào, giữ nhập mã như đường phụ. Lobby được hiển thị cho các player đã đăng nhập, không bảo đảm riêng tư như phòng bí mật. Schema/seat index, thông tin host bất biến, readiness và quyền bắt đầu được kiểm tra phía Firestore. `tests/rules.test.mjs` dùng emulator để thử cả ghi trực tiếp status nhằm vượt readiness, xóa người khác và tranh chỗ cuối bằng transaction.

Đổi UID đăng nhập hủy room store cũ; app dispose hủy DOM listeners, Auth observer, directory và room subscriptions; adapter bản thử gỡ storage listener. Đóng tab không tự rời phòng: chưa có presence, chuyển host hay dọn phòng bỏ quên. Người lưu trong roster không được coi là chắc chắn đang online. Trước gameplay cần thiết kế quyền lượt/tiền/xúc xắc phía server riêng.

Public Firebase config không có quyền quản trị. Backend hiện cần được kích hoạt/cấu hình riêng; [hướng dẫn vận hành](../operations/development.md) phân biệt Pages, emulator và Firebase thật.


## Kiểm chứng tài khoản

DEV-only emulator mode yêu cầu `import.meta.env.DEV` và cờ riêng; production không kích hoạt được nó. Runner mở Auth/Firestore emulators và Vite riêng. Hai browser contexts đăng ký/đăng nhập bằng SDK thật, đồng bộ own profile, tạo/tìm/tham gia phòng theo tên và kiểm tra reload/logout. Các test chặn request đến production Firebase. Build Pages không áp dụng Firestore rules/index và public app config không cấp quyền quản trị.


## Bảo toàn quyền ngoài hub

Rules triển khai bảo vệ riêng monopolyHub. Project trước đó có Test-mode wildcard hết hạn 2026-12-03; phần ngoài hub giữ đúng allowance cũ, nhưng wildcard mới loại trừ monopolyHub để không vượt các điều kiện Auth/schema. Không được chép lại wildcard toàn cục vì Firestore ghép các allow theo OR. Rules hiện là prototype đã qua kiểm tra emulator, không thay thế review trước phát hành rộng.


## Tách độ trễ hồ sơ khỏi danh sách phòng

Khởi tạo store chỉ xác nhận tài khoản, không đợi đồng bộ profile. Directory và room-resume listeners có thể bắt đầu ngay. Tạo/tham gia phòng đọc profile và room song song trước khi ghi, rồi commit cả hai trong một transaction. Không có commit profile riêng đứng trước commit room. Rules dùng getAfter để đối chiếu tên với profile sau commit. Store chỉ cache tên profile sau commit thành công; thao tác thất bại có thể thử lại. Dispose chặn việc khởi động lệnh phòng mới. Không coi thay đổi này là số đo latency trên điện thoại thật.

## Chẩn đoán độ trễ có chủ đích

Cờ URL `?diagnostics=1` bật dialog đo tạo/vào phòng. Trace thuần trong src/hub/diagnostics.ts giới hạn 100 samples mỗi thao tác; UI giữ năm báo cáo trong bộ nhớ, không tự upload. Các span SDK, session/token, đọc phòng/profile, transaction/commit, snapshot đầu và khung hình có thể chồng lấn. Adapter kiểm tra token riêng khi bật đo; việc này có thể làm ấm token nên không coi đây là timing thụ động hoàn toàn. Cached snapshot không chứng minh round trip server. Số callback transaction không phải mọi transport retry; commit gồm chờ SDK/mạng/backoff. Xem [hướng dẫn đo](../../docs/diagnostics.md) và [kiểm tra](../operations/development.md).
