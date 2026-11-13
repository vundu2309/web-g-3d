---
type: "Tham khảo"
title: "Biển đánh cá chung: tổng quan và ranh giới"
openwiki_generated: true
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
sources:
  - id: openwiki-source-18fc7b64e66932d83fa70cfc
    resource: repo://docs/ocean.md
  - id: openwiki-source-60b51f83565a4de6497fc329
    resource: repo://firestore.rules
  - id: openwiki-source-9d81102c99fa0be75f0562d6
    resource: repo://scripts/test-supabase.mjs
  - id: openwiki-source-944d53aebcc6e3bbdfcd09de
    resource: repo://server/ocean.mjs
  - id: openwiki-source-10f3f3e9db8fffece78a1ca6
    resource: repo://src/app/harbor.ts
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-69220ba068a830c8d6971aab
    resource: repo://src/ocean/babylon-scene.ts
  - id: openwiki-source-415ab528c104eb4374a5e47b
    resource: repo://src/ocean/model.ts
  - id: openwiki-source-d9571426a00d5a5ac9f9c54c
    resource: repo://src/platform/ocean-firebase.ts
  - id: openwiki-source-da299de568c1622268f94e39
    resource: repo://src/platform/ocean-socket.ts
  - id: openwiki-source-9fce44ed27844f7179f12e69
    resource: repo://tests/ocean-browser.mjs
  - id: openwiki-source-739950034b62004a0096c757
    resource: repo://tests/ocean-socket.test.mjs
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
---


# Biển đánh cá chung: tổng quan và ranh giới

## Phạm vi

[Hợp đồng biển](../../docs/ocean.md) và [quyết định 0007](../../docs/decisions/0007-shared-fishing-sea.md) đã chốt: mỗi người chơi là một thuyền riêng trên một biển chung; không có phòng, lời mời, sảnh chờ hay sẵn sàng. Người chơi vào từ nút "Ra khơi" của hub, đăng nhập bằng dialog hiện có rồi vào biển ngay. `?view=ocean` mở lại luồng này sau khi tải lại; rời về hub sẽ rời biển.

Biển là route mặc định của `src/main.ts`: không có `view`, hoặc `view=ocean`, đều vào [hub](hub.md) qua `startHarbor`. Hai route Monopoly cũ (`?view=monopoly-hub`, `?view=game`) được giữ nguyên.

## Ownership

| File | Trách nhiệm |
| --- | --- |
| `src/app/harbor.ts` | Hub "Ra khơi", theo dõi tài khoản, vào và thoát biển |
| `src/app/ocean.ts` | Điều khiển, HUD, hộp thoại, vòng đời và dọn dẹp; nối câu cá, chợ và kết nối lại |
| `src/ocean/model.ts` | Spawn xác định theo UID, giới hạn di chuyển, va đảo, kiểm tra payload từ xa |
| `src/ocean/babylon-scene.ts` | Scene Babylon.js: một engine, thuyền người chơi có Havok, camera đuổi theo, thuyền khác và nhãn |
| `src/ocean/havok.ts`, `boat-physics.ts` | Nạp WASM Havok và thân thuyền vật lý ([quyết định 0008](../../docs/decisions/0008-babylon-havok-boat-physics.md)) |
| `src/ocean/water.ts`, `sky.ts`, `waves.ts`, `island-visual.ts`, `boat-visual.ts` | Nước, bầu trời, sóng và mô hình thủ tục |
| `src/platform/ocean.ts` | Chọn adapter: `ocean-socket.ts` khi dùng Supabase, `ocean-firebase.ts` khi không |
| `src/ocean/save.ts` | Lưu vị trí và kho cá trên thiết bị theo UID |

`src/hub` không thuộc biển. Adapter platform không import app.

## Vòng đời

1. Hub gọi `requirePlayer` (Auth hiện có). Khi đăng nhập xong, hub import `src/app/ocean.ts` và bật màn loading ba bước: đồ họa, kết nối, vào biển.
2. `connectOcean` mở adapter. Với Socket.IO, client gửi `ocean:command` `join`; với Firestore, client ghi tài liệu thuyền rồi theo dõi danh sách.
3. Vị trí thuyền được khôi phục từ `save.ts`; nếu vị trí cũ không hợp lệ hoặc nằm trên đảo, thuyền về bến.
4. Người chơi điều khiển bằng cần lái, bật câu cá và bán cá ở chợ gần pier (xem [câu cá](ocean-fishing.md), [kinh tế](ocean-economy.md)).
5. Rời biển hoặc tải lại trang: trạng thái được lưu trên thiết bị. Khi mất kết nối giữa chừng, `connectionLost` tự kết nối lại; chỉ dừng khi phiên bị từ chối thật.

## Dữ liệu và persistence

- Vị trí thuyền và kho cá: localStorage, khóa `photyphu:sea:v1:<uid>`, không đồng bộ giữa thiết bị.
- Trạng thái đang chơi trên server: chỉ có danh sách thuyền trong RAM của một API instance (Socket.IO) hoặc tài liệu Firestore (adapter Firebase). Không có lưu trữ kinh tế hay vị trí ở PostgreSQL.
- Số dư xu và sổ cá chưa bán nằm trên server chỉ khi migration `supabase/pending/20261112090000_economy.sql` được áp dụng và `VITE_ECONOMY=on`. Chưa áp dụng thì không có chợ.

## Giới hạn

- Socket.IO sea state nằm trong bộ nhớ của **một** instance API và mất khi deploy. Không scale ngang cho tới khi có trạng thái mô phỏng dùng chung. Chi tiết nằm ở [realtime biển](ocean-realtime.md).
- Câu cá và cắn cá do client quyết định; server chỉ giới hạn tốc độ và khoảng giá trị trong kinh tế.
- Mô hình thuyền và người bán đến từ pipeline Blender (`public/models/people-*.glb`, xem [pipeline tài nguyên](../operations/art-pipeline.md)).
- Ảnh trong `docs/design/sea-creatures-*.png` là concept, không phải bằng chứng render.

## Kiểm chứng

- Unit: `tests/ocean.test.mjs`, `tests/ocean-socket.test.mjs` (Socket.IO thật, giao thức 2), `tests/fishing.test.mjs`, `tests/fight.test.mjs`, `tests/boat-physics.test.mjs`, `tests/creatures.test.mjs`, `tests/economy.test.mjs`, `tests/market.test.mjs`.
- Trình duyệt: `tests/ocean-*-browser.mjs` (loading, resume, input, fishing, market, multiplayer, Babylon) chạy qua `scripts/test-browser.mjs`; `tests/ocean-browser.mjs` dùng Firebase emulator.
- Full-stack Supabase: `scripts/test-supabase.mjs` có kiểm tra biển chung.

Kiểm chứng local không thay thế việc triển khai API và rules thật, cũng không thay thế kiểm tra trên điện thoại thật. Mục tiêu hiệu năng trên thiết bị yếu vẫn chưa được đo.

Xem thêm [hub](hub.md), [chuyển đổi hạ tầng](infrastructure-transition.md) và [phát triển và kiểm tra](../operations/development.md).
