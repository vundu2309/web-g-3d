# Hải trình — 3D Ocean

Cảnh biển 3D tương tác bằng Babylon.js, TypeScript strict và Vite: sóng shader, ánh nắng, bầu trời thủ tục và thuyền buồm nhấp nhô. Kéo để xoay, cuộn/chụm để zoom, nút Sóng êm/Sóng mạnh để đổi cường độ. Đây là môi trường khởi đầu cho game; chưa có nhiệm vụ hoặc điều khiển lái thuyền.

## Phát triển

Node.js 24, npm 11. `npm ci`, sau đó `npm run dev`. `npm run build` kiểm tra kiểu và build production. `npm run preview` phục vụ dist. Không cần backend, secret, texture tải ngoài hay CDN.

## Kiến trúc

- `src/main.ts`: DOM, trạng thái khởi động và HMR.
- `src/app/start.ts`: engine, render loop, listener và cleanup.
- `src/game/ocean/scene.ts`: ghép scene, camera và cập nhật thời gian.
- `src/game/ocean/waves.ts`: trường sóng dùng chung giữa shader và thuyền.
- `src/game/ocean/materials.ts`: shader nước, phản xạ bầu trời xấp xỉ, nắng và mây thủ tục.
- `src/game/ocean/boat.ts`: model thuyền thủ tục, tài nguyên do scene sở hữu.
- `src/platform/physics.ts` và `src/game/playground.ts`: nền Havok và scene va chạm được giữ để phát triển gameplay sau này; scene biển không cần tải WASM vật lý.

Sóng Gerstner dịch chuyển đỉnh lưới theo cả chiều ngang và chiều cao. Pháp tuyến giải tích kết hợp gợn giao thoa biến dạng; phản xạ Fresnel, tán xạ nước, bọt ở đỉnh sóng và giới hạn phơi sáng. Một lưới liên tục với mật độ giảm theo khoảng cách thay cho hai mặt biển có đường nối. CPU đảo dịch chuyển ngang để lấy độ cao nổi của thuyền. Thuyền lấy độ cao và độ nghiêng từ cùng hàm sóng; đây là chuyển động nổi mô phỏng bằng toán, chưa phải lực nổi thủy động lực học Havok. Scene.dispose dọn mesh/material; app dọn loop, listener và engine. Không thêm singleton, event bus hay ECS trước khi có nhu cầu thực tế.

## Kiểm tra

Khi dev server chạy: `npm run test:ocean` kiểm tra desktop/mobile, tải asset, lỗi shader, chuyển động và nút đổi sóng. `npm run test:smoke` giữ kiểm tra Havok: khối rơi, va chạm nền, giới hạn body và dispose. Cần Chromium tại `/usr/bin/chromium` hoặc đặt `CHROMIUM_PATH`. `TEST_BASE_URL` chọn URL cho bài kiểm tra biển, bao gồm bản production/Pages; kiểm tra Havok cần Vite dev server để import module.

Kiểm tra trình duyệt dùng software WebGL không đại diện FPS điện thoại thật. Giới hạn độ phân giải render trên thiết bị DPI cao; vẫn cần đo trên thiết bị mục tiêu. Engine còn tạo cảnh báo bundle lớn.

## Deploy GitHub Pages

Settings → Pages → Source: GitHub Actions. Push `main` tự build và deploy `dist`; có thể chạy workflow thủ công. Vite dùng base tương đối để asset hoạt động dưới project path.

URL: https://vundu2309.github.io/web-g-3d/
