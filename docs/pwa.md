# Cài Ra khơi cùng bạn như ứng dụng

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

App shell dùng version cache nhất quán thay vì ghép HTML mới với chunk cũ. Worker mới chỉ `skipWaiting` sau khi precache hoàn tất, nên người chơi **không phải bấm cập nhật**: bản mới tự thành bản đang chạy và cache cũ trong prefix/scope của app bị xóa. Trang chỉ tự tải lại khi thực sự an toàn: đang ở màn chính (URL không có `view=`), không có dialog mở và không đang nhập form. Trong game (`?view=ocean`, `?view=game`, hub phòng cũ) trang không bị tải lại giữa phiên; lần điều hướng kế tiếp dùng bản mới. Nếu bản mới đến lúc chưa an toàn, trang tải lại khi chuyển sang nền và hết điều kiện chặn. Lần claim đầu của trang chưa được kiểm soát không gây reload. Worker cũ vẫn xử lý `APPLY_UPDATE` từ trang cũ để tương thích. Nút/thông báo cập nhật cũ chỉ còn xuất hiện khi trình duyệt giữ một worker đang chờ. App kiểm tra update theo lifecycle trình duyệt và khi trở lại foreground, throttle 60 giây, không polling liên tục. Không xóa localStorage/IndexedDB hay cache ứng dụng khác.

Nếu precache lỗi, không activate bộ cache chưa đầy đủ. Đăng ký SW thất bại không làm hỏng game hoặc lời hướng dẫn cài. Không tuyên bố offline sẵn sàng chỉ vì có icon trên màn hình chính.

## Kiểm chứng

`tests/pwa-browser.mjs` phục vụ build thật dưới `/web-g-3d/` bằng server do test sở hữu. Test kiểm tra manifest scope/start URL, kích thước PNG, install dialog và synthetic beforeinstallprompt gesture, offline home + lazy HUD chưa từng mở + reload, API không vào cache, update waiting không ép reload, cleanup cache sau đóng client, hủy xác nhận cập nhật, chặn khi có tab khác và áp dụng sau xác nhận chỉ còn một cửa sổ.

Test chạy sau browser dev/production trong `npm run test:browser`, và thuộc `npm run check`. Synthetic install event chỉ kiểm tra handler, không chứng minh thao tác cài ở cấp hệ điều hành. Cần người dùng thử cài thực tế trên Android/iOS; browser emulation không thay thế kiểm chứng đó.

## Safe area trên điện thoại

Các token `--safe-top/right/bottom/left` lấy từ CSS env. HUD dùng một vùng tọa độ an toàn chung; dialog cài đặt/tài khoản và thông báo cập nhật cũng tránh cutout/home indicator. Nền vẫn phủ màn hình. Khi thiếu chiều cao, tác vụ và nút cho phép cuộn thay vì thu nhỏ vùng bấm. Kiểm tra browser mô phỏng inset không thay kiểm chứng Safari/Chrome và standalone trên máy thật.

**Thanh trạng thái trong suốt (Android và iOS).** Màn hình hub và biển phủ kín cả vùng safe area (`position: fixed; inset: 0`, không dùng `100dvh`); chỉ các nút và chữ lùi vào trong. Thanh hệ thống không tự trong suốt, nên: iOS dùng `apple-mobile-web-app-status-bar-style: black-translucent` (nội dung vẽ dưới thanh trạng thái), còn Android/Chrome tô thanh bằng `theme-color`. Vì vậy `theme-color` được đặt theo màu ở mép trên của màn hình đang hiện (`src/app/chrome-color.ts`: hub `#4b3a8f`, trời biển `#9cc6ee`) và trả lại khi rời biển; `theme_color` và `background_color` trong manifest là `#4b3a8f` để không lóe trắng khi mở app. Kiểm tra trong Chromium bằng cách ghi đè `--safe-*`: khung hub, canvas biển đều phủ đúng cả màn hình (0,0 tới hết) còn HUD lùi đúng inset, và màu `theme-color` đổi/ trả đúng. **Chưa kiểm tra trên iOS hay Android thật**: Android không cho thanh trạng thái trong suốt hẳn trong mọi chế độ hiển thị, nên ở đó đây là cách làm thanh hòa vào ảnh chứ không bảo đảm trong suốt; ở màn hình khác (màn cũ của Monopoly) màu thanh vẫn theo giá trị gần nhất đã đặt.

**Toàn màn hình trên Android.** Ở chế độ standalone, Android tự vẽ thanh trạng thái và thanh điều hướng (thanh đáy lấy màu `theme_color` của manifest lúc cài, nên `theme-color` động không đổi được) và chừa vùng cutout (camera) bên trái khi xoay ngang đen, dù trang đã có `viewport-fit=cover`. Vì vậy manifest có `display_override: ["fullscreen", "standalone"]`: Android dùng fullscreen, cảnh biển phủ kín cả cutout và thanh đáy, thanh hệ thống ẩn (vuốt từ mép để hiện lại); HUD vẫn lùi theo `--safe-*`. `display` vẫn là `standalone` làm phương án dự phòng cho trình duyệt không hỗ trợ `display_override` (iOS không đổi). `tests/pwa-browser.mjs` kiểm tra khai báo này; **chưa kiểm tra trên Android thật**. Máy đã cài app có thể cần cập nhật WebAPK hoặc gỡ rồi cài lại mới nhận chế độ mới.

**Kiểm tra cập nhật trong Cài đặt.** Hub Cài đặt của biển có thẻ "Phiên bản" (`src/app/settings-update.ts`): hiện mã phiên bản đang chạy (8 ký tự đầu của hash nội dung do bản build đóng vào service worker, nên commit chỉ sửa tài liệu không đổi số này; worker trả lời tin nhắn `VERSION`) và nút "Kiểm tra cập nhật". Nút hỏi server có worker mới không (`src/platform/update-check.ts`: `latest` / `ready` / `failed`, chờ tối đa 20 giây cho bản mới tải xong). Có bản mới thì nút thành "Cập nhật ngay"; chỉ khi người chơi bấm, app lưu vị trí thuyền rồi tải lại. Không bao giờ tự tải lại giữa ván. Phần này chỉ cập nhật phần web (mã, hình, mô hình); vỏ app Android (manifest, icon, chế độ toàn màn hình) do Chrome tự cập nhật WebAPK, thường trong khoảng một ngày, trang web không ép được. Bản dev không đăng ký service worker nên thẻ báo chưa hỗ trợ. `tests/update-check.test.mjs` kiểm tra logic; **chưa kiểm tra trên điện thoại thật**.

Bản PWA cũ (trước thay đổi này) vẫn chờ worker mới và cần đóng toàn bộ cửa sổ/tab game cùng origin một lần, hoặc xóa dữ liệu trang. Sau khi nhận bản này, các bản sau tự cập nhật. Không cần gỡ app.
