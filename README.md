# Web G 3D

Nền tảng web game 3D: TypeScript strict, Vite, Babylon.js và Havok Physics (WASM tự phục vụ, không dùng CDN khi chạy).

## Chạy

Yêu cầu Node.js 22.12+ (đã kiểm tra trên Node 24), npm 11.

```sh
npm ci
npm run dev
```

`npm run typecheck` kiểm tra kiểu; `npm run build` kiểm tra kiểu và đóng gói production; `npm run preview` chạy bản build. Không cần backend hay biến bí mật.

## Ranh giới mã nguồn

- `src/main.ts`: kết nối DOM, trạng thái tải/lỗi, HMR.
- `src/app/start.ts`: sở hữu engine, khởi động và dọn dẹp vòng đời ứng dụng.
- `src/platform/physics.ts`: nạp Havok/WASM; cấu hình phụ thuộc nền tảng.
- `src/game/playground.ts`: scene mẫu, camera, đối tượng và luật vật lý.

Gameplay không truy cập DOM. Thêm feature theo chức năng khi có nhu cầu thực tế; không tạo global singleton, event bus tổng quát hay ECS sớm. Khi scene lớn lên, tách factory thực thể và controller trong `game/`, giữ ownership rõ ràng. Một tài nguyên có một nơi chịu trách nhiệm dispose; vật thể phải dọn physics body trước mesh. Các mesh dùng chung material do scene sở hữu. Scene mẫu giới hạn 32 khối để tránh tích tụ body/mesh.

Vật lý dùng timestep của HavokPlugin và trọng lực theo đơn vị mét/giây. Khi thêm điều khiển nhân vật, đưa lực/vận tốc vào bước vật lý; không tự dịch chuyển dynamic body theo render frame. Tách simulation khỏi input và rendering khi có gameplay thực tế. Không tối ưu bằng framework trừu tượng trước khi đo.

## Kiểm tra thủ công

Mở game bằng trình duyệt hỗ trợ WebGL: 8 khối rơi, va chạm nhau và nằm trên nền. Nút thả khối tạo thêm body; kéo để xoay camera, cuộn để zoom. Kiểm tra console không lỗi, resize canvas đúng, HMR không nhân đôi vòng render. Bản mẫu chưa có nhân vật, luật thắng/thua, multiplayer hoặc điều khiển nhân vật trên mobile.

Build phát cảnh báo chunk lớn do engine 3D; WASM và engine tải một lần khi khởi động. Đo bundle và thời gian tải trên thiết bị mục tiêu trước khi quyết định chia chunk, nén asset hay chọn tính năng engine.

## Kiểm tra tự động

Khi `npm run dev` đang chạy, chạy `npm run test:smoke`. Yêu cầu Chromium tại `/usr/bin/chromium` hoặc đặt `CHROMIUM_PATH` đến trình duyệt đã cài. Bài kiểm tra dùng Chromium để nạp WebGL/WASM, thả khối qua UI, chạy 600 bước mô phỏng để xác nhận trọng lực và va chạm nền, kiểm tra giới hạn 32 khối và dispose scene. Không dùng trình duyệt tải từ CDN. Kiểm tra này chưa thay thế kiểm thử gameplay và thiết bị mobile thực tế.

## GitHub Pages

Trong repository GitHub, vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**. Đưa source lên nhánh `main`; workflow `.github/workflows/pages.yml` sẽ cài dependency từ lockfile, build và deploy thư mục `dist`. Có thể chạy lại từ tab Actions bằng workflow_dispatch.

URL mặc định sau khi deploy thành công: `https://vundu2309.github.io/web-g-3d/`. Vite dùng đường dẫn asset tương đối để JS và Havok WASM tải được dưới đường dẫn project. Không cần API key hay backend. Publish cloud environment không thay thế bước push source và deploy GitHub Pages.
