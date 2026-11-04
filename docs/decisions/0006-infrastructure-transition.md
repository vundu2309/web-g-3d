# 0006 — Chuyển sang Vercel, Render và Supabase

**Trạng thái:** Người dùng chọn stack; chuẩn bị chuyển đổi. Chưa provision/deploy dịch vụ mới, chưa thay runtime Firebase hay tắt GitHub Pages.

## Phân vai

| Dịch vụ | Trách nhiệm đích |
| --- | --- |
| Vercel | Frontend Vite, asset 3D, PWA và HTTPS; không giữ trạng thái phòng trong memory của function |
| Render | API Node cho tạo/vào phòng, readiness, bắt đầu/rời phòng; xác thực token và thực thi kiểm tra server |
| Supabase | Email/password Auth và PostgreSQL lưu profile, room, membership; dữ liệu bền vững qua restart API |

Một repository tiếp tục chứa frontend, backend và migrations. Không di chuyển engine gameplay chưa tồn tại hoặc tự thêm luật ở bước đổi hạ tầng. Bàn 3D/HUD vẫn là preview độc lập.

## Điểm thay trong source hiện có

- `src/platform/account.ts`: thay Firebase bằng Supabase Auth, chuẩn hóa identity của app để UI không phụ thuộc kiểu `firebase/auth.User`. Giữ form và thông báo lỗi hiện có; bổ sung callback đổi/reset mật khẩu theo URL mới.
- `src/platform/firebase.ts`: thay bằng adapter HTTP/subscription tuân thủ `src/hub/store.ts`; giữ `src/platform/demo.ts` làm preview local có nhãn rõ ràng.
- `src/hub/model.ts`: giữ contract và kiểm tra thuần để tái dùng phía server. Identity của command phải lấy từ token đã xác thực, không tin UID/name do client gửi.
- Backend trong `server/`; migrations và kiểm tra quyền PostgreSQL trong `supabase/`; deployment config Vercel/Render tại root. Chưa tạo các thư mục này như thể migration đã được implement.
- GitHub Actions giữ CI. Chỉ bỏ job Pages sau khi Vercel đã được kiểm chứng và có URL thay thế. Không để auto-deploy theo mọi commit vô tình phá quy ước chỉ publish khi UI/UX thay đổi; cấu hình release gate phù hợp cho provider mới.

## Transaction và quyền truy cập

Room và membership nên có schema rõ ràng: mã phòng duy nhất, host, tiêu đề, capacity, status, server timestamps; membership có khóa `(room_id, user_id)` và seat duy nhất theo phòng. Create/join phải atomic; lock hàng phòng khi join/start/leave để không vượt capacity hoặc start bằng roster cũ. Profile cập nhật và room command không được tạo chuỗi đọc/ghi dư thừa như lỗi latency trước.

Client dùng publishable/anon key cho Auth; không nhận service-role key, DB password hoặc Render/Vercel admin token. Render xác minh JWT của đúng Supabase project, áp quyền host/member, validate input và origin, giới hạn yêu cầu. CORS không thay authorization. DB dùng RLS/grants theo mô hình truy cập được kiểm chứng; nếu chỉ server được ghi thì client không có quyền gọi tắt mutation trực tiếp. Không dùng policies mở để vượt lỗi cấu hình.

Chốt transport realtime cùng adapter: cần cập nhật directory/room, reconnect và snapshot nhất quán. Không broadcast chỉ trong RAM của một Render instance rồi coi đó là bền vững hoặc an toàn khi scale. Dùng event/version bền vững và snapshot phục hồi; chưa có cam kết chọn WebSocket hay SSE trước khi implement transport. Render và DB nên gần nhau; chọn region sau khi xem project thực tế. Gói miễn phí có thể sleep/cold-start, không cam kết nhanh hơn Firebase chỉ vì đổi provider.

## Dữ liệu và tài khoản hiện tại

Giữ nguyên Firebase/Auth/Firestore và Pages trong giai đoạn chuẩn bị. Không xóa dữ liệu hoặc tài khoản cũ. Trước cutover, cần quyết định người dùng cũ được migrate hay đăng ký/reset lại; không giả định có thể copy mật khẩu plaintext hoặc map UID giữa hai hệ thống. Migrations phải kiểm chứng trên staging trước production và có phương án rollback.

Chuyển origin từ Pages sang Vercel không chuyển localStorage, session đăng nhập, Cache Storage hoặc bản PWA đã cài. PWA ở origin cũ cũng không tự biến thành app origin mới; cần hướng dẫn người dùng mở/cài URL mới sau khi xác minh. Email callback/redirect allowlist, CORS và service worker scope cần cấu hình đúng từng môi trường. SW chỉ cache shell tĩnh, không cache Auth/API/room data.

## Thứ tự triển khai và kiểm chứng

1. Xác nhận project/service, quyền kết nối và region; lấy cấu hình public qua provider. Chưa có tools/credentials không được mô tả là đã truy cập dịch vụ.
2. Tạo schema/migrations và backend command contract, kiểm tra auth/permission/concurrent join/start/host close trên môi trường test.
3. Thay Auth và RoomStore adapters, giữ UI/preview; kiểm tra hai tài khoản/hai browser, lỗi password, reset callback, join đầy phòng, reconnect và readiness.
4. Deploy staging Render + Supabase; frontend preview Vercel trỏ staging. Kiểm tra build, health, logs không lộ secrets, realtime/restart và latency đo thật.
5. Kiểm chứng UI/PWA dưới root origin Vercel, offline shell, scope và nút update. Luồng online vẫn cần mạng.
6. Khi provider setup và phương án dữ liệu sẵn sàng, publish frontend, xác minh SHA/assets/health và thông báo URL mới. Giữ đường rollback; chỉ retire stack cũ sau cutover được kiểm chứng.

## Tình trạng kết nối ở phiên chuẩn bị

Tool discovery không thấy tool Vercel/Render/Supabase trong phiên này. CLI của ba dịch vụ cũng chưa có, và không có các biến quản trị tương ứng được cấu hình. Việc người dùng đã connect trong ChatGPT không tự chứng minh tools/quyền đã được cấp cho phiên Codex hiện tại. Cần project/service được xác định và quyền truy cập khả dụng trước khi provision/deploy; không yêu cầu đưa token hoặc khóa bí mật vào chat.
