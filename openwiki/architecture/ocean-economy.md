---
type: architecture
title: Kinh tế biển và chợ cá
description: Ví xu, sổ cá chưa bán và bảng giá trên server qua ba RPC công khai của Supabase; chợ cá và người bán ở phía client; ranh giới giữa báo cáo của client và quyền quyết định của database.
tags:
  - economy
  - supabase
  - rpc
  - market
  - architecture
sources:
  - id: openwiki-source-8fa3dc9f08f4cf4f5eb0bca9
    resource: repo://docs/decisions/0010-server-economy.md
  - id: openwiki-source-dab8aa5276e2d1b695c803a7
    resource: repo://src/app/ocean.ts
  - id: openwiki-source-9ac76f9c8cd209f28d961fb6
    resource: repo://src/ocean/economy.ts
  - id: openwiki-source-16ec70f90c57ae45d86eff47
    resource: repo://src/platform/economy.ts
  - id: openwiki-source-00f8ef8b12a88c41e2cb46b0
    resource: repo://supabase/migrations/20261113032223_economy.sql
generated: { by: "claude-code", at: "2026-11-20T02:01:25.414Z" }
verified:
  - by: openwiki/0.7.3
    at: 2026-11-20T03:06:03.643Z
---

# Kinh tế biển và chợ cá

Xu (“xu”) là tiền duy nhất của biển. Ví, sổ cá đã bắt nhưng chưa bán và bảng giá nằm trên PostgreSQL của Supabase, trong schema riêng `economy_private`. Ứng dụng chỉ chạm tới ba hàm công khai, và database là bên quyết định giá, số dư và các giới hạn. Quyết định nền tảng nằm ở [decision 0010](../../docs/decisions/0010-server-economy.md).

## Ranh giới

| Phần | File | Vai trò |
| --- | --- | --- |
| Migration đã áp dụng | `supabase/migrations/20261113032223_economy.sql` | Bảng, RLS, hàm, quyền và RPC công khai. Đây là lịch sử, không sửa. |
| Bảng giá phía client | `src/ocean/economy.ts` | Công thức giá thuần (`basePrice`, `priceOf`), hằng `CATCH_COOLDOWN_SECONDS = 6`, `LEDGER_CAP = 200`, và `priceTable()` để so với seed của SQL. |
| API kinh tế | `src/ocean/economy-api.ts` | Kiểu `EconomyApi`, `EconomyError`, và `memoryEconomy` (cùng luật, trong bộ nhớ, dùng cho kiểm thử). |
| Adapter Supabase | `src/platform/economy.ts` | `supabaseEconomy()` gọi RPC; ánh xạ mã lỗi PostgreSQL sang `EconomyError`; `economyEnabled()` đọc `VITE_ECONOMY`. |
| Nối với biển | `src/app/ocean.ts` | Truyền `supabaseEconomy()` vào chợ khi `economyEnabled()`; nếu không, chợ không có kinh tế. |
| Giao diện chợ | `src/app/market-ui.ts`, `src/ocean/market.ts`, `src/ocean/market-vendor.ts`, `src/ocean/market-visual.ts` | Nút Bán gần cầu cảng, hộp thoại chợ và người bán ba chiều. |

Server Node (`server/app.mjs`) không có route kinh tế nào. Client gọi RPC của Supabase trực tiếp bằng phiên đăng nhập, không qua API Render.

## Ba RPC công khai

Các hàm `public.*` là lớp mỏng gọi hàm nội bộ trong `economy_private`:

- `economy_state()`: trả số xu và sổ cá hiện có (`economy_private.state`).
- `economy_record_catch(p_species, p_kg)`: ghi một con cá client báo đã bắt (`record_catch`).
- `economy_sell(p_fish)`: bán các con cá trong sổ; `p_fish` là null thì bán tất cả (`sell`).

Quyền được siết chặt: các hàm nội bộ bị thu hồi từ `public`, `anon` và `authenticated`; các RPC công khai bị thu hồi từ `public` và `anon`, và chỉ `authenticated` được `execute`. Mọi bảng `economy_private` bật RLS và bị thu hồi quyền.

## Quy tắc trong database

- **Danh tính**: `economy_private.me()` lấy `auth.uid()` và ném lỗi `42501` (chưa đăng nhập) nếu không có.
- **Bảng giá**: `economy_private.fish_prices` có 24 loài: 20 dòng từ `20261113032223_economy.sql` và 4 loài thêm từ `20261118120000_sea_species.sql` (các dòng cũ được giữ nguyên). Mỗi loài có `base`, `min_kg`, `max_kg`. Giá bán do `price(species, kg)` tính: `base` nhân với từ 0,6 (nhẹ nhất) đến 1,5 (nặng nhất) theo vị trí cân nặng trong khoảng của loài. Client không gửi giá.
- **Bắt cá** (`record_catch`): từ chối loài lạ (`22023`), cân nặng ngoài khoảng `[min_kg, max_kg]` (`22023`), lần bắt cách lần trước dưới 6 giây (`55000`, dùng `clock_timestamp()`), và sổ đã có từ 200 con (`54000`). Cân nặng được làm tròn hai chữ số trước khi kiểm tra. Lần bắt được ghi vào `ledger` và cập nhật `last_catch_at` của ví.
- **Bán cá** (`sell`): khóa dòng ví (`for update`), tối đa 200 phần tử trong danh sách; mỗi phần tử phải khớp một con cá còn trong sổ theo loài và cân nặng (`fish not in the ledger`, `22023`), không dùng lại cùng một dòng. Số tiền thu được cộng vào `coins`, và các dòng bị xóa khỏi sổ trong cùng giao dịch.

Các lỗi trên được `failureOf` ánh xạ sang `EconomyError`: `42501` thành `signin`, `55000` thành `fast`, `54000` thành `full`, `22023` thành `invalid`, và `PGRST202` hoặc `42883` (hàm chưa có trong schema cache, tức migration chưa áp dụng) hoặc HTTP 404 thành `closed`. Lỗi còn lại là `network`.

## Ranh giới tin cậy

Việc câu cá chạy trên thiết bị (xem [câu cá](ocean-fishing.md)), nên mỗi lần bắt vẫn là **báo cáo của client**. Các giới hạn của database chỉ hạn chế mức thu nhập mà một client đã sửa có thể đạt được: giới hạn tốc độ, khoảng cân nặng, sức chứa sổ và giá do server tính. Chúng không ngăn một client sửa đổi tạo ra cá hợp lệ trong các giới hạn đó. Vì vậy trang này không mô tả kinh tế là phần thưởng có thẩm quyền.

Client không gửi giá hay số dư để được chấp nhận; số liệu hiển thị lấy lại từ `economy_state`.

## Đồng bộ với kiểm thử

- `tests/economy.test.mjs` đọc hai file migration (`20261113032223_economy.sql` và `20261118120000_sea_species.sql`) và so với `priceTable()` của client; lệch giá hay khoảng cân nặng, hoặc một loài được định giá hai lần, làm kiểm thử thất bại. Cùng file kiểm tra các hằng cooldown và sức chứa.
- `tests/economy-client.test.mjs` kiểm tra adapter và ánh xạ lỗi.
- `tests/economy-postgres.sql` và `tests/economy-postgres.sh` chạy các kịch bản SQL trong PostgreSQL dùng một lần, không bao giờ trên production.

Các kiểm thử này chứng minh quy tắc trong file và trong mô phỏng. Chưa có bằng chứng từ repository rằng migration đã được áp dụng vào dự án Supabase live, hoặc rằng `VITE_ECONOMY=on` đang bật ở production.

## Giới hạn và việc chưa làm

- Không có thưởng, chuyển xu giữa người chơi, hay đối soát với cửa hàng thật.
- Chợ chỉ hiện khi `VITE_ECONOMY=on`; không có backend kinh tế thay thế.
- Cân chỉnh giá và giới hạn là quyết định sản phẩm, chưa được chơi thử trên điện thoại thật.
