---
type: architecture
title: Kinh tế biển và chợ cá
description: Ví xu, sổ cá chưa bán và bảng giá trên server qua ba RPC; chợ cá và người bán ở phía client; ranh giới client báo cáo và trạng thái migration còn pending.
tags:
  - economy
  - market
  - supabase
  - server-authority
  - ocean
verified:
  - by: openwiki/0.8.0
    at: 2026-11-13T03:02:54.827Z
sources:
  - id: openwiki-source-8fa3dc9f08f4cf4f5eb0bca9
    resource: repo://docs/decisions/0010-server-economy.md
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-9ac76f9c8cd209f28d961fb6
    resource: repo://src/ocean/economy.ts
  - id: openwiki-source-16ec70f90c57ae45d86eff47
    resource: repo://src/platform/economy.ts
  - id: openwiki-source-f8fe78dcd8d1757c6a667e26
    resource: repo://supabase/pending/20261112090000_economy.sql
generated: { by: "claude-code", at: "2026-11-13T03:02:54.827Z" }
---

# Kinh tế biển và chợ cá

## Phạm vi và trạng thái

Kinh tế biển gồm xu ("xu"), một ví mỗi tài khoản, sổ cá đã bắt nhưng chưa bán và bảng giá. Theo [quyết định 0010](../../docs/decisions/0010-server-economy.md) (chấp nhận ngày 2026-11-12), tiền nằm trên cơ sở dữ liệu Supabase, không chỉ trên thiết bị.

Migration nằm ở `supabase/pending/20261112090000_economy.sql`, **chưa được áp dụng** vào project thật. Quyết định yêu cầu chuyển sang `supabase/migrations/` và đặt `VITE_ECONOMY=on` chỉ sau khi người dùng xác nhận. Vì vậy trong source hiện tại, mục kinh tế chỉ bật khi cả hai điều kiện đúng: backend là Supabase (`useSupabase`) và `VITE_ECONOMY === "on"`. Nếu RPC chưa có, client báo lỗi `closed`. Không mô tả chợ như đã chạy trên production.

Cửa hàng nâng cấp đã được nhắc trong quyết định nhưng không có trong source hiện tại; không có màn mua sắm nào trong `src/app/market-ui.ts`.

## Ownership

| File | Trách nhiệm |
| --- | --- |
| `src/ocean/economy.ts` | Hàm giá thuần: `basePrice`, `priceOf`, `priceTable`, các hằng cooldown 6 giây và trần sổ 200 con |
| `src/ocean/economy-api.ts` | Kiểu `LedgerFish`, `EconomyState`, `SellResult`, `EconomyError` và `memoryEconomy` cùng luật cho test |
| `src/platform/economy.ts` | `economyEnabled()` và `supabaseEconomy()`; ánh xạ mã lỗi PostgreSQL sang `EconomyFailure` |
| `src/ocean/market.ts` | Dữ liệu ba chợ (Hải Đăng, Đồi Xanh, Bãi Cọ), tầm `MARKET_RANGE` = 17 m, vùng va chạm |
| `src/ocean/market-vendor.ts`, `market-visual.ts` | Người bán và pier 3D (trang trí, không ảnh hưởng luật) |
| `src/app/market-ui.ts` | Nút Bán khi thuyền gần pier, hộp bán theo loại hoặc tất cả, hiển thị ví |
| `src/app/ocean.ts` | Gắn `marketUi` với `economy` (mặc định `supabaseEconomy()` khi bật) và nối `onKeep` vào `recordCatch` |

Giá và số dư do server quyết định. Client chỉ hiển thị và yêu cầu bán; nó không gửi giá, số dư hay danh sách cá mà sổ không có.

## Ba RPC và bảng private

Schema `economy_private` bật RLS, thu hồi quyền từ `public`, `anon` và `authenticated`. Client chỉ gọi ba hàm công khai, được cấp `execute` cho `authenticated`:

- `economy_state()`: trả `coins` và danh sách `ledger` của người gọi.
- `economy_record_catch(p_species, p_kg)`: ghi một con cá vào sổ.
- `economy_sell(p_fish jsonb default null)`: bán các con được chỉ định, hoặc tất cả khi `null`.

Các hàm nội bộ `economy_private.me()`, `price()`, `state()`, `record_catch()` và `sell()` bị thu hồi quyền truy cập trực tiếp. Hàm `me()` lấy `auth.uid()` của người gọi, nên người chơi không thể chọn người khác.

Bảng `economy_private.fish_prices` lưu giá gốc, `min_kg` và `max_kg` cho từng loài, được seed trong migration và được `tests/economy.test.mjs` so với `priceTable()` ở client.

## Luật phía server

- **Bắt cá (`record_catch`)**: loài phải có trong bảng giá; `kg` phải nằm trong khoảng cân nặng của loài; lần bắt trước của cùng người chơi phải cách ít nhất 6 giây (mã lỗi `55000` → `fast`); sổ phải dưới 200 con (mã `54000` → `full`).
- **Bán (`sell`)**: tiêu thụ đúng các dòng sổ theo loài và cân nặng; giá do server tính theo cùng công thức `priceOf`; số dư tăng trong cùng giao dịch. Một người không thể bán cá của người khác (có test trong `tests/economy-postgres.sql`); gọi `economy_sell(null)` ẩn danh bị từ chối.
- Mã lỗi `42501` → `signin`; `22023` → `invalid`; `PGRST202`, `42883` hoặc HTTP 404 → `closed`; các lỗi khác → `network`.

Công thức giá: giá gốc = `RARITY_BASE[độ hiếm] × max(1, cbrt(kg_tối_đa_loài))` làm tròn; giá bán = giá gốc × (0,6 + 0,9 × vị trí cân nặng trong khoảng loài), làm tròn.

## Giới hạn trung thực

Việc câu cá chạy trên thiết bị, nên một lần bắt là **báo cáo của client**. Các kiểm tra (cooldown, khoảng cân, trần sổ) chỉ giới hạn mức thu nhập có thể gian lận, không ngăn một client đã sửa tạo cá trong giới hạn đó. Muốn chặn hẳn cần chuyển luật câu cá và cắn câu sang server; đó là công việc riêng và chưa có trong source.

Việc thiếu sổ cá hoặc ví trên thiết bị không ảnh hưởng dữ liệu server. Ngược lại, trạng thái cá giữ trên máy trong [save.ts](../../src/ocean/save.ts) chỉ là bản lưu cục bộ và không phải nguồn tiền.

## Kiểm chứng

- `tests/economy.test.mjs`: giá khớp giữa `economy.ts` và seed SQL.
- `tests/economy-client.test.mjs` và `tests/market.test.mjs`: client, `memoryEconomy` và hình học chợ.
- `tests/economy-postgres.sql` (chạy qua `tests/economy-postgres.sh` hoặc `npm run test:postgres`): quyền truy cập, từ chối bán ẩn danh, từ chối bán cá người khác và các giới hạn bắt cá.
- `tests/ocean-market-browser.mjs`: luồng chợ trong trình duyệt.

Các test trên là kiểm tra cục bộ và trên database dùng một lần; chúng không chứng minh migration đã có trên Supabase production.

Xem thêm [kiến trúc biển](ocean.md), [câu cá và cuộc giằng co](ocean-fishing.md), [realtime biển](ocean-realtime.md) và [chuyển đổi hạ tầng](infrastructure-transition.md).
