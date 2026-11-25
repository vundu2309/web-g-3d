---
type: "Tham khảo"
title: "Hub, đăng nhập và vào biển"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T03:06:03.643Z
sources:
  - id: openwiki-source-5fac766e13b3ef2b068894f7
    resource: repo://docs/decisions/0012-remove-firebase-and-monopoly.md
  - id: openwiki-source-9e31e90300dccb65ecd460a0
    resource: repo://server/app.mjs
  - id: openwiki-source-2c932c82640807a2da8d8358
    resource: repo://server/socket.mjs
  - id: openwiki-source-3cc44dcb42d14ad2fffb83f2
    resource: repo://src/app/account.ts
  - id: openwiki-source-10f3f3e9db8fffece78a1ca6
    resource: repo://src/app/harbor.ts
  - id: openwiki-source-32d34de3adc601eacf7364ad
    resource: repo://src/app/password-recovery.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-a516dc77b4f57ace3d032e8c
    resource: repo://src/platform/account.ts
  - id: openwiki-source-1c74d332bf7cf8b890868f54
    resource: repo://src/platform/supabase-client.ts
  - id: openwiki-source-dddda1d819c05adab55e9ba6
    resource: repo://src/platform/wake.ts
  - id: openwiki-source-1f43633b4b89ad34853d5d5c
    resource: repo://tests/account-signup-browser.mjs
generated: { by: "claude-code", at: "2026-11-17T08:18:15.877Z" }
---


# Hub, đăng nhập và vào biển

Hub là màn hình đầu tiên của game. Nó chỉ làm ba việc: hiển thị thuyền trưởng đang đăng nhập (hoặc mời đăng nhập), mở hộp thoại tài khoản, và đưa người chơi vào biển chung khi bấm **Ra khơi**. Hub không tải động cơ 3D của biển; động cơ chỉ tải khi người chơi ra khơi (xem [biển chung](ocean.md)).

Các phòng, lobby, sẵn sàng và Firebase đã bị gỡ bỏ cùng với game cờ tỷ phú (xem [decision 0012](../../docs/decisions/0012-remove-firebase-and-monopoly.md)). Không còn đường dẫn `?view=monopoly-hub` hay `?view=game`.

## Ranh giới file

| Phần | File | Trách nhiệm |
| --- | --- | --- |
| Điểm vào | `src/main.ts` | Nạp font, `style.css`, rồi gọi `startHarbor` và `startPwa` vào `#app`. |
| Hub | `src/app/harbor.ts` | Vẽ hub, theo dõi phiên, xử lý nút, chuyển sang biển và quay lại. |
| Hộp thoại tài khoản | `src/app/account.ts` | Đăng nhập, đăng ký, quên mật khẩu, màn chờ xác nhận email; `requirePlayer` chia sẻ một lần mở. |
| Khôi phục mật khẩu | `src/app/password-recovery.ts` | Hộp thoại “Đặt mật khẩu mới” sau liên kết trong email. |
| Facade tài khoản | `src/platform/account.ts` | Gọi Supabase Auth, dịch lỗi, quan sát phiên (`observePlayer`). |
| Client Supabase | `src/platform/supabase-client.ts` | Một client duy nhất; thiếu cấu hình thì báo lỗi, không có fallback. |
| Lỗi hiển thị | `src/platform/errors.ts` | `HubError` (thông báo viết sẵn cho người chơi) và kiểm tra tên người chơi. |
| Tranh nền | `src/ui/hub-canvas.ts` | Vẽ cảnh biển tĩnh phía sau hub và hộp thoại (`mountHubArt`, `hubArtUrl`). |
| Đánh thức API | `src/platform/wake.ts` | Gửi một yêu cầu `no-cors` tới `/health` khi người chơi bấm vào hub. |

## Luồng màn hình

1. `startHarbor` vẽ hub ngay: logo “Ra khơi”, nút cài đặt PWA, nút đăng nhập (chỉ khi chưa có tên) và nút **Ra khơi** lớn.
2. Khi chưa đăng nhập, thẻ thuyền trưởng ghi “Mỗi người một thuyền, một biển chung” và nút chính ghi “Đăng nhập để vào biển chung”. Khi đã đăng nhập, thẻ hiện “Thuyền trưởng <tên>”, số cá trong kho trên thiết bị và nút **Đăng xuất**.
3. `observePlayer` (qua `onAuthStateChange`) cập nhật tên và uid. Nếu đang ở biển mà phiên mất, biển bị dừng và URL về `./`.
4. Bấm **Ra khơi** gọi `enter()`: `requirePlayer()` mở hộp thoại nếu chưa có phiên; khi có người chơi, `startOcean` được import, URL đổi thành `?view=ocean` và biển thay thế hub trong `#app`.
5. Khi biển kết thúc (người chơi quay lại, hoặc `onLeave`), URL về `./` và hub vẽ lại.
6. Mở trực tiếp `?view=ocean` tự chạy `enter()`, nên tải lại trang vẫn vào thẳng biển khi còn phiên đăng nhập.

Trạng thái bận (`busy`) khóa nút trong lúc đang đăng nhập hoặc tải biển. Lỗi hiển thị trong vùng `role="alert"` của hub, không dùng hộp thoại thứ hai.

## Hộp thoại tài khoản

`openAccount` dựng một `<dialog>` modal bằng DOM, không dùng template chung. Các chế độ là `login`, `register`, `reset` và `confirm`:

- **Đăng ký** cần tên người chơi (1 đến 24 ký tự, kiểm tra bởi `playerName`) và mật khẩu tối thiểu 6 ký tự. `signUp` gửi tên qua `user_metadata.display_name` và `emailRedirectTo` lấy từ `VITE_AUTH_REDIRECT_URL` hoặc địa chỉ trang hiện tại.
- Nếu Supabase trả về phiên ngay (tắt xác nhận email), hộp thoại đóng và người chơi vào hub đã đăng nhập.
- Nếu chưa có phiên (bật xác nhận email), hộp thoại chuyển sang chế độ `confirm`: hướng dẫn ba bước, nút “Tôi đã xác nhận, đăng nhập”, “Gửi lại email” và “Đổi email”. Email được đặt bằng `textContent`, không phải HTML.
- **Mật khẩu chỉ nằm trong bộ nhớ** của hộp thoại (biến `waiting`) trong lúc chờ xác nhận, để nút “Tôi đã xác nhận” đăng nhập lại; không ghi vào localStorage, sessionStorage hay cơ sở dữ liệu.
- Đăng nhập thành công là bằng chứng đã xác nhận email, vì Supabase từ chối `signInWithPassword` cho tới khi liên kết được dùng.
- “Quên mật khẩu?” gọi `resetPasswordForEmail` và luôn báo cùng một thông điệp, để không lộ email có tài khoản hay không.
- Phím Esc (sự kiện `cancel`) và nút Đóng đều đóng hộp thoại, trừ khi đang có thao tác dở dang.

Lỗi Supabase được dịch bằng `accountError` sang thông điệp tiếng Việt cho các mã như `invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password` và các mã giới hạn tần suất. Mã không biết được thay bằng thông điệp chung “Không hoàn tất được thao tác”.

`requirePlayer` giữ một lời hứa đang chạy: nhiều lần bấm liên tiếp chia sẻ cùng một hộp thoại và cùng kết quả.

## Khôi phục mật khẩu

`observePlayer` phát sự kiện `PASSWORD_RECOVERY` của Supabase thành `window` event `account-password-recovery`. Hub nghe sự kiện này và tải động `openPasswordRecovery`. Hộp thoại yêu cầu nhập hai lần mật khẩu mới (ít nhất 6 ký tự), kiểm tra hai ô trùng nhau trước khi gọi `updatePassword`, và xóa ô nhập sau khi lưu thành công. Hộp thoại có một lần mở duy nhất (`active`).

## Thiếu cấu hình và đăng nhập không thành

- `supabase()` ném `HubError` nếu thiếu `VITE_SUPABASE_URL` hoặc `VITE_SUPABASE_PUBLISHABLE_KEY`. Thông báo hiển thị nguyên văn cho người chơi; không có chế độ thử nghiệm hay tài khoản giả.
- `observePlayer` lỗi khi tải client, `harbor.ts` hiện “Chưa kết nối được đăng nhập. Kiểm tra mạng rồi thử lại.”
- Biển cũng dùng `VITE_API_URL` và từ chối khởi động nếu thiếu (xem [biển chung](ocean.md)).

Không có đường đăng nhập ẩn danh. `server/app.mjs` và `server/socket.mjs` xác thực mọi token qua `/auth/v1/user` của Supabase và từ chối người dùng `is_anonymous`; client không được tin danh tính tự khai.

## Kiểm tra

- `tests/account-signup-browser.mjs` chạy với Supabase giả (`tests/support/supabase-dev.mjs`, cổng 18999) và kiểm tra cả hai thiết lập: xác nhận email bật (bước “kiểm tra email”, đăng nhập sau khi xác nhận, gửi lại) và tắt (đăng nhập ngay). Nó cũng kiểm tra email được đặt như văn bản.
- `scripts/test-browser.mjs` đặt sẵn `VITE_SUPABASE_URL` và khóa công khai giả để biển có thể khởi động trong kiểm tra.
- Chưa có kiểm tra tự động cho đăng nhập với Supabase thật, cho email xác nhận thật, hay cho liên kết khôi phục thật. Các mục này cần xác minh trên dịch vụ thật và trên điện thoại.

## Giới hạn

- Hub tối ưu cho điện thoại xoay ngang; các cỡ 844×390, 932×430 và 667×375 được kiểm tra trong trình duyệt mô phỏng, chưa phải trên thiết bị thật.
- Cấu hình công khai (`VITE_*`) không phải quyền quản trị; không đặt khóa bí mật vào mã nguồn hay tài liệu.
