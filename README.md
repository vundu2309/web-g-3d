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

`npm run check` là lệnh kiểm chứng chung: lint ranh giới module, format, hai unit test trường sóng, build TypeScript/Vite, kiểm tra browser trên dev và production. Runner tự mở/đóng server ở cổng trống. Chromium hệ thống được dùng nếu có; nếu không, cài bằng `npx --no-install playwright-core install --with-deps chromium`. Có thể đặt `CHROMIUM_PATH` để chọn trình duyệt khác.

Các lệnh `test:ocean`/`test:smoke` vẫn dùng được với server thủ công và `TEST_BASE_URL`. Xem [quy trình đầy đủ](docs/workflow.md), [ranh giới kiến trúc](docs/architecture.md), [quy tắc agent](AGENTS.md) và [quyết định thiết kế](docs/decisions/0001-context-and-validation.md).

Kiểm tra trình duyệt dùng software WebGL không đại diện FPS điện thoại thật. Giới hạn độ phân giải render trên thiết bị DPI cao; vẫn cần đo trên thiết bị mục tiêu. Engine còn tạo cảnh báo bundle lớn.

## Deploy GitHub Pages

Settings → Pages → Source: GitHub Actions. Pull request chạy toàn bộ `npm run check`; push `main` hoặc chạy thủ công chỉ deploy `dist` sau khi các kiểm tra qua. Vite dùng base tương đối để asset hoạt động dưới project path.

URL: https://vundu2309.github.io/web-g-3d/

## OpenWiki (công cụ phát triển)

OpenWiki 0.7.3 được pin trong devDependencies, không được import vào game. Sau `npm ci`, mở lại Codex tại repo để nạp `.agents/skills/openwiki` và MCP `.codex/config.toml`; cấu hình dùng `npx --no-install` nên không cần cài global hoặc tải bản mới khi khởi động. Chỉ tin cậy MCP của repo mà bạn đã kiểm tra.

- `npm run wiki -- integrations list --project .`: kiểm tra tích hợp.
- Trong Codex: “Update this repository's OpenWiki from current source and tests.” Dùng phiên model của coding agent; không cần thêm API key riêng cho cách này.
- `npm run wiki:serve`: mở trình đọc/đồ thị local.
- `npm run wiki:export`: xuất trình đọc tĩnh vào `.openwiki-export/`; không tự publish ra Pages.

Wiki tiếng Việt bắt đầu tại [openwiki/quickstart.md](openwiki/quickstart.md). Quy tắc phạm vi trong `openwiki/INSTRUCTIONS.md`. Metadata, Claims và index do OpenWiki quản lý. CLI standalone `--init`/`--update` cần cấu hình provider riêng; không đặt API key vào source hoặc GitHub Pages. Workflow Pages chạy lint, unit test, build và test trình duyệt trước deploy; không tự sinh wiki.
