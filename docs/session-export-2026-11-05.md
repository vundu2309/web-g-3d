# Phiên làm việc 2026-11-05 — game thuyền câu cá (Phố Tỷ Phú)

Nhánh: `hbg/trusting-einstein-7mau58` · Repo: `vundu2309/web-g-3d`

## Đã làm và đã triển khai

| Commit | Nội dung |
|---|---|
| `c91cc6b` | Biển Babylon.js + Havok thay biển Three.js (vật lý thuyền, đảo, sóng) |
| `e1e0997` | Màn hình loading, tự thử lại khi kết nối, đánh thức Render sớm |
| `f53aa27` | Người chơi thấy nhau (cảng xuất phát + mũi tên), form đăng ký có bước xác nhận rõ ràng |
| `1d51a71` | Tự kết nối lại giữa game, lưu vị trí thuyền + số cá trên thiết bị (localStorage) |
| `00f173d` | Refactor multiplayer: giao thức 2 (move đồng bộ, delta theo tick 200 ms, kiểm tra phiên định kỳ, nội suy phía client) |

Triển khai:
- Vercel production: `dpl_4B7h8v2RcbnM8h77ar8ZBd2Rxw3v` (commit `00f173d`), READY, domain `web-g-3d.vercel.app`.
- Render `web-g-3d-api`: `dep-dbm4u3jm8hqs73eo6q50` (commit `00f173d`) đã live. Nhánh Render `codex/socketio-supabase` đã được đẩy fast-forward theo sự cho phép của bạn.

## Số đo (50 thuyền giả lập, trên máy chủ cũ so với mới)

- Dữ liệu nhận mỗi client: 350 KB/s → 6,6 KB/s
- Gọi Supabase: 44 lần/giây → 0 khi di chuyển (kiểm tra phiên khoảng 0,8 lần/giây)
- Cập nhật mỗi thuyền: 1 → 5 lần/giây

## Việc còn dang dở

1. **Chuyển động người chơi khác vẫn giật** (bạn báo sau khi triển khai giao thức 2). Chưa xác định nguyên nhân bằng số đo; phép đo độ mượt (mô phỏng 60 fps qua máy chủ thật) bị bạn dừng giữa chừng và đã được xoá.
   Giả thuyết cần kiểm tra:
   - Mẫu vị trí được đóng dấu bằng thời điểm *tick* thay vì thời điểm thuyền thực sự di chuyển, nên khoảng cách thời gian giữa các mẫu không đều khi nhịp gửi và nhịp tick lệch pha.
   - Độ trễ mạng thật (Render ở Singapore, Vercel ở iad1) vượt vùng đệm 300 ms.
   - Vòng vẽ bị chặn ở 30 khung/giây (`now - lastDraw >= 33`).
   - Điện thoại có thể còn giữ bản app cũ trong bộ nhớ.
2. **Gameplay câu cá** còn tạm bợ: cần bạn duyệt đề xuất (loài cá, độ hiếm, ném cần, cá cắn, mini-game kéo cá, nhật ký) và chọn lưu theo thiết bị hay theo tài khoản (Supabase, cần migration production). Chưa code.
3. **Bỏ xác thực email:** cần bạn tắt "Confirm email" trong Supabase Dashboard → Authentication → Sign In / Providers → Email → Save. Tôi không tự làm được.
4. Chưa đo trên điện thoại thật (FPS, độ nét, độ trễ Render, hai người chơi thật).
5. `npm run check` dừng ở bước "Auth browser tests" (cần Firebase emulator, môi trường này không chạy được). Các bước còn lại đạt.

## Quy ước dự án cần nhớ

- Dùng tài khoản git đã kết nối qua Claude, qua HTTPS, không SSH.
- Không tạo PR nếu không được yêu cầu; không thêm trailer `Pages-Deploy` cho frontend Supabase.
- Đẩy lên Vercel production sau khi kiểm thử; Render cần xin phép trước vì là triển khai production.
- Không đụng tới phần đồ hoạ khi chỉ sửa multiplayer.

## Tài liệu liên quan

`docs/ocean.md` (hợp đồng biển chung, phần "Transport (protocol 2)"), `docs/decisions/0007-shared-fishing-sea.md`, `docs/decisions/0008-babylon-havok-boat-physics.md`, `docs/infrastructure.md`.
