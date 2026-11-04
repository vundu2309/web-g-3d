# Cài Phố Tỷ Phú như ứng dụng

## Người chơi

Mở trang chính trên GitHub Pages và chọn **Cài game** nếu trình duyệt cung cấp lời mời cài, hoặc **Cài lên điện thoại** để xem hướng dẫn.

- Android / Chrome: menu ⋮ → Cài đặt ứng dụng hoặc Thêm vào màn hình chính (tên mục tùy trình duyệt).
- iPhone / iPad: mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính → Thêm.
- Nếu đang mở trong ứng dụng chat, mở liên kết bằng Chrome/Safari trước.

App cài lên màn hình chính dùng icon riêng và chế độ standalone. Manifest ưu tiên landscape; khả năng thực thi orientation phụ thuộc hệ điều hành, không thay thế portrait fallback. Không có quy trình publish lên App Store/Play Store trong thay đổi này.

Giao diện home/HUD có thể mở lại offline sau khi cache shell hoàn tất. Tài khoản và phòng/multiplayer vẫn cần mạng; PWA không bổ sung engine hoặc backend gameplay và không tự chuyển online sang dữ liệu mẫu. Dữ liệu HUD preview vẫn chỉ là minh họa local.

## Ownership

- `public/manifest.webmanifest`: id/start_url/scope tương đối `./`, phù hợp project Pages `/web-g-3d/`, standalone, theme và icon any/maskable.
- `public/icons/`: icon SVG authored theo house/dice hiện có, PNG192/512, maskable512 và apple-touch180. Maskable dùng padding để artwork nằm trong safe zone.
- `index.html`: manifest/apple-touch links, metadata app iOS và theme color.
- `src/platform/pwa.ts`: đăng ký SW chỉ ở production, theo dõi waiting worker và kiểm tra update khi quay lại foreground.
- `src/app/pwa.ts`: capture install prompt, hướng dẫn thủ công, nhận appinstalled/standalone, thông báo update. Controller sở hữu dialog, observer/listeners và dispose khi HMR; không tự gọi native prompt khi người dùng chưa bấm.
- `scripts/pwa-build.mjs`: Vite build-only plugin sinh `dist/sw.js` từ template và version hash của shell assets, gồm lazy chunks/fonts/icons/manifest/index. Không cần dependency PWA mới.
- `scripts/service-worker.js`: template worker, scope theo `self.registration.scope`. Không chạy trực tiếp template có placeholder.

## Cache và cập nhật

SW precache đúng allowlist file build tĩnh, dùng cache riêng theo scope URL và version. GET navigation chỉ fallback index cho root/index trong scope; query như `?view=game&state=5` vẫn mở được shell offline. Các URL khác ngoài allowlist, POST, query asset không nhận diện và cross-origin đều đi thẳng network. Không cache Firebase API, tài khoản/token, dữ liệu phòng hoặc origin/repository khác.

App shell dùng version cache nhất quán thay vì ghép HTML mới với chunk cũ. Worker mới cài xong **chờ** khi vẫn còn cửa sổ/tab dùng worker cũ; không gọi skipWaiting, không tự reload giữa phiên. Thông báo hướng dẫn đóng các cửa sổ game rồi mở lại. Khi worker mới được activate, xóa cache cũ chỉ trong prefix/scope của app, không xóa dữ liệu localStorage/IndexedDB hay cache ứng dụng khác. App kiểm tra update theo lifecycle trình duyệt và khi trở lại foreground, throttle 60 giây, không polling liên tục.

Nếu precache lỗi, không activate bộ cache chưa đầy đủ. Đăng ký SW thất bại không làm hỏng game hoặc lời hướng dẫn cài. Không tuyên bố offline sẵn sàng chỉ vì có icon trên màn hình chính.

## Kiểm chứng

`tests/pwa-browser.mjs` phục vụ build thật dưới `/web-g-3d/` bằng server do test sở hữu. Test kiểm tra manifest scope/start URL, kích thước PNG, install dialog và synthetic beforeinstallprompt gesture, offline home + lazy HUD chưa từng mở + reload, API không vào cache, update waiting không ép reload và cleanup cache sau đóng client.

Test chạy sau browser dev/production trong `npm run test:browser`, và thuộc `npm run check`. Synthetic install event chỉ kiểm tra handler, không chứng minh thao tác cài ở cấp hệ điều hành. Cần người dùng thử cài thực tế trên Android/iOS; browser emulation không thay thế kiểm chứng đó.

## Safe area trên điện thoại

Các token `--safe-top/right/bottom/left` lấy từ CSS env. HUD dùng một vùng tọa độ an toàn chung; dialog cài đặt/tài khoản và thông báo cập nhật cũng tránh cutout/home indicator. Nền vẫn phủ màn hình. Khi thiếu chiều cao, tác vụ và nút cho phép cuộn thay vì thu nhỏ vùng bấm. Kiểm tra browser mô phỏng inset không thay kiểm chứng Safari/Chrome và standalone trên máy thật.
