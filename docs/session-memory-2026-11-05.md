# Ghi nhớ cho các phiên sau (dự án Phố Tỷ Phú / game thuyền câu cá)

## Người dùng
- Nói tiếng Việt; muốn trả lời bằng tiếng Việt.
- Muốn triển khai nhanh lên production, không muốn phải "cập nhật thủ công" ở máy người chơi.
- Muốn game thuyền là game chính; game Monopoly cũ được giữ nguyên mã nhưng ẩn khỏi màn hình chính.
- Duyệt hình ảnh/ý tưởng trước khi code phần giao diện hoặc gameplay mới.
- Yêu cầu hiện tại chưa xong: chuyển động người chơi khác phải "thật sự mượt".

## Hạ tầng
- Frontend: Vercel `web-g-3d` (project `prj_6OSLQwVjIC9TGxFExn7xS6joNPUo`), domain `https://web-g-3d.vercel.app`, triển khai từ nhánh `hbg/trusting-einstein-7mau58` bằng `create_deployment` với `gitSource` (org `vundu2309`, repo `web-g-3d`, ref, sha).
- API: Render `web-g-3d-api` (`srv-dblf5l3m8hqs7394iijg`, Singapore, gói miễn phí, 1 instance, autoDeploy tắt) chạy nhánh `codex/socketio-supabase`; để triển khai: đẩy fast-forward `HEAD:codex/socketio-supabase` rồi `trigger_deploy`. Cần xin phép người dùng trước (đây là production).
- Auth: Supabase Email/Password. "Confirm email" vẫn BẬT; người dùng phải tự tắt trong Dashboard.
- Môi trường phiên này không gọi được `onrender.com` (proxy từ chối): kiểm tra Render qua công cụ Render (deploy, logs), không qua curl.

## Kỹ thuật
- Hướng toạ độ: Babylon hệ tay phải, heading 0 = -Z; dữ liệu vị trí `{x, z, heading, fishing}`.
- Giao thức biển chung v2 (docs/ocean.md): `ocean:move` không ack, `ocean:delta` mỗi tick 200 ms, `ocean:token`, kiểm tra phiên mỗi 60 s; tương thích ngược hai chiều.
- Playback người chơi khác: `src/ocean/remote.ts` (RemoteTracks + ServerClock), vẽ trễ ~300 ms. Lớp đồ hoạ `babylon-scene.ts` còn tự làm mượt thêm (`blend(dt, 6)`) và vòng vẽ bị chặn ở 30 khung/giây.
- Lưu trạng thái người chơi: chỉ localStorage (`photyphu:sea:v1:<uid>`), theo thiết bị.
- Node chạy test không hỗ trợ tham số thuộc tính của constructor TypeScript.
- Chạy test trình duyệt cần `CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `npm run check` dừng ở "Auth browser tests" vì thiếu Firebase emulator (không liên quan thay đổi).

## Quy ước
- Git: tài khoản đã kết nối qua Claude, HTTPS, không SSH; trailer `Co-Authored-By: Claude Sonnet 5.5` và `Claude-Session`; không tạo PR nếu không được yêu cầu; không thêm `Pages-Deploy`.
- Phản hồi đúng sự thật: nói rõ những gì chưa kiểm chứng trên điện thoại thật.
