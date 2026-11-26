---
type: architecture
title: Kinh tế biển và chợ cá
description: Ví xu, sổ cá chưa bán, hồ sơ, thuyền/cần/mồi đã mua và bảng xếp hạng nằm trên server Supabase qua các RPC công khai; chợ và người bán ở client; database quyết định giá, số dư và giới hạn, còn báo cáo cá bắt vẫn do client gửi.
tags:
  - economy
  - supabase
  - rpc
  - market
  - architecture
verified:
  - by: openwiki/0.7.3
    at: 2026-11-26T03:34:41.285Z
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
generated: { by: "claude-code", at: "2026-11-26T03:34:41.285Z" }
---

# Kinh tế biển và chợ cá

Xu (“xu”) là tiền duy nhất của biển. Ví, sổ cá đã bắt nhưng chưa bán, bảng giá, hồ sơ người chơi, thuyền/cần/mồi đã mua và bảng xếp hạng nằm trên PostgreSQL của Supabase, trong schema riêng `economy_private`. Ứng dụng chỉ chạm tới các hàm `public.economy_*`, và database là bên quyết định giá, số dư và các giới hạn. Quyết định nền tảng nằm ở [decision 0010](../../docs/decisions/0010-server-economy.md); thuyền và cần ở [decision 0015](../../docs/decisions/0015-upgrade-shop.md), hồ sơ ở [decision 0016](../../docs/decisions/0016-server-profile.md) và bảng xếp hạng ở [decision 0017](../../docs/decisions/0017-fishing-leaderboard.md).

## Ranh giới

| Phần | File | Vai trò |
| --- | --- | --- |
| Migration đã áp dụng | `supabase/migrations/20261113032223_economy.sql` và các migration `profile`, `upgrades`, `leaderboard`, `parked_boats`, `pose_every_5s` | Bảng, RLS, hàm, quyền và RPC công khai. Đây là lịch sử, không sửa. |
| Quy tắc thuần phía client | `src/ocean/economy.ts` | Công thức giá (`basePrice`, `priceOf`), hằng `CATCH_COOLDOWN_SECONDS = 6`, `LEDGER_CAP = 200`, và `priceTable()` để so với seed của SQL. |
| API kinh tế | `src/ocean/economy-api.ts` | Kiểu `EconomyApi`, `EconomyError`, và `memoryEconomy` (cùng luật, trong bộ nhớ, dùng cho kiểm thử). |
| Adapter Supabase | `src/platform/economy.ts` | `supabaseEconomy()` gọi RPC; ánh xạ mã lỗi PostgreSQL sang `EconomyError`; `economyEnabled()` đọc `VITE_ECONOMY`. |
| Nối với biển | `src/app/ocean.ts` | Chọn kinh tế: `options.economy ?? (economyEnabled() ? supabaseEconomy() : undefined)`. Không có kinh tế thì không có chợ, không có nâng cấp, loadout mặc định và kho cá ở lại trên thiết bị. |
| Giao diện chợ | `src/app/market-ui.ts`, `src/ocean/market.ts`, `src/ocean/market-vendor.ts`, `src/ocean/market-visual.ts` | Nút Bán gần cầu cảng, hộp thoại chợ và người bán ba chiều. |
| Thuyền và cần | `src/ocean/upgrades.ts`, `src/app/market-ui.ts` | Giá nâng cấp, `loadoutOf` và kiểm tra `canBuy`; phía database có `upgrade_prices`. |

`server/` (Render) không có route kinh tế HTTP. Client gọi RPC của Supabase trực tiếp bằng phiên đăng nhập của chính người chơi. Ngoại lệ là API Socket.IO: khi người chơi vào biển, `server/app.mjs` đọc `economy_loadout` và `economy_parked_boats` bằng **token của người chơi đó** (không dùng khóa quản trị) để biết loadout và thuyền đậu.

## Các RPC công khai

Các hàm `public.economy_*` là lớp mỏng gọi hàm nội bộ trong `economy_private`. Client gọi qua `supabase().rpc(...)` trong `src/platform/economy.ts`:

- **Ví và sổ cá**: `economy_state()` trả số xu, sổ cá và loadout; `economy_record_catch(p_species, p_kg)` ghi một con cá client báo đã bắt; `economy_sell(p_fish)` bán các con trong sổ, `p_fish` là null thì bán tất cả; `economy_release(p_species)` trả cá về biển.
- **Hồ sơ**: `economy_profile()` trả số cá đã bắt, kỷ lục theo loài và tư thế (pose) đã lưu; `economy_save_pose(p_x, p_z, p_heading)` lưu vị trí thuyền (xem [thuyền đậu](ocean-parked-boats.md)); `economy_import_local(p_fish, p_caught)` chuyển kho cá trên thiết bị lên server một lần.
- **Thuyền, cần, mồi**: `economy_buy(p_kind, p_tier)` mua tầng kế tiếp (`EC409` nếu đã có, `EC422` nếu chưa mua tầng trước, `EC402` nếu thiếu xu); `economy_set_bait(p_tier)` chọn mồi đang dùng; `economy_loadout()` đọc loadout.
- **Bảng xếp hạng**: `economy_leaderboard()` xếp hạng theo số cá và cá nặng nhất từ hồ sơ.
- **Biển**: `economy_parked_boats()` trả thuyền của người chơi không online, đọc bằng token của chính người đó.

Quyền được siết chặt: các hàm nội bộ bị thu hồi từ `public`, `anon` và `authenticated`; các RPC công khai bị thu hồi từ `public` và `anon`, và chỉ `authenticated` được `execute`. Mọi bảng `economy_private` bật RLS và bị thu hồi quyền trực tiếp.

## Quy tắc trong database

- **Danh tính**: `economy_private.me()` lấy `auth.uid()` và ném lỗi `42501` (chưa đăng nhập) nếu không có.
- **Bảng giá**: `economy_private.fish_prices` có 24 loài: 20 dòng từ `20261113032223_economy.sql` và 4 loài thêm từ `20261118120000_sea_species.sql` (các dòng cũ được giữ nguyên). Mỗi loài có `base`, `min_kg`, `max_kg`. Giá bán do `price(species, kg)` tính: `base` nhân với từ 0,6 (nhẹ nhất) đến 1,5 (nặng nhất) theo vị trí cân nặng trong khoảng của loài. Client không gửi giá.
- **Bắt cá** (`record_catch`): từ chối loài lạ (`22023`), cân nặng ngoài khoảng `[min_kg, max_kg]` (`22023`), lần bắt cách lần trước dưới 6 giây (`55000`, dùng `clock_timestamp()`), và sổ đã có từ 200 con (`54000`). Cân nặng được làm tròn hai chữ số trước khi kiểm tra. Lần bắt được ghi vào `ledger` và cập nhật `last_catch_at` của ví.
- **Bán cá** (`sell`): khóa dòng ví (`for update`), tối đa 200 phần tử trong danh sách; mỗi phần tử phải khớp một con cá còn trong sổ theo loài và cân nặng (`fish not in the ledger`, `22023`), không dùng lại cùng một dòng. Số tiền thu được cộng vào `coins`, và các dòng bị xóa khỏi sổ trong cùng giao dịch.
- **Mua** (`buy`): giá nằm trong `upgrade_prices`; kiểm tra tầng sở hữu theo thứ tự, không mua vượt tầng.

Các lỗi được `failureOf` (`src/platform/economy.ts`) ánh xạ sang `EconomyError`: `42501` thành `signin`, `55000` thành `fast`, `54000` thành `full`, `22023` thành `invalid`, `EC402` thành `poor`, `EC409` thành `owned`, `EC422` thành `order`, và `PGRST202` hoặc `42883` (hàm chưa có trong schema cache, tức migration chưa áp dụng) hoặc HTTP 404 thành `closed`. Lỗi còn lại là `network`.

## Ranh giới tin cậy

Việc câu cá chạy trên thiết bị (xem [câu cá](ocean-fishing.md)), nên mỗi lần bắt vẫn là **báo cáo của client**. Các giới hạn của database chỉ hạn chế mức thu nhập mà một client đã sửa có thể đạt được: giới hạn tốc độ, khoảng cân nặng, sức chứa sổ và giá do server tính. Chúng không ngăn một client sửa đổi tạo ra cá hợp lệ trong các giới hạn đó. Vì vậy trang này không mô tả kinh tế là phần thưởng có thẩm quyền.

Client không gửi giá hay số dư để được chấp nhận; số liệu hiển thị lấy lại từ `economy_state` và `economy_profile`. Kỷ lục cá và số cá bắt được cũng là số do client báo, nên bảng xếp hạng là xếp hạng theo số liệu client báo cáo.

## Đồng bộ với kiểm thử

- `tests/economy.test.mjs` đọc các file migration về bảng giá và so với `priceTable()` của client; lệch giá hay khoảng cân nặng, hoặc một loài được định giá hai lần, làm kiểm thử thất bại. Cùng file kiểm tra các hằng cooldown và sức chứa.
- `tests/economy-client.test.mjs` kiểm tra adapter và ánh xạ lỗi.
- `tests/upgrades.test.mjs`, `tests/upgrade-view.test.mjs`, `tests/leaderboard.test.mjs` và `tests/server-store.test.mjs` kiểm tra luật nâng cấp, giao diện nâng cấp, bảng xếp hạng và kho cá trên server.
- `tests/economy-postgres.sql` và `tests/economy-postgres.sh` chạy các kịch bản SQL trong PostgreSQL dùng một lần, không bao giờ trên production.

Các kiểm thử này chứng minh quy tắc trong file và trong mô phỏng. Chưa có bằng chứng từ repository rằng các migration đã được áp dụng vào dự án Supabase live, hoặc rằng `VITE_ECONOMY=on` đang bật ở production.

## Giới hạn và việc chưa làm

- Không có thưởng, chuyển xu giữa người chơi, hay đối soát với cửa hàng thật.
- Chợ chỉ hiện khi `VITE_ECONOMY=on`; không có backend kinh tế thay thế.
- Cân chỉnh giá, giới hạn và xếp hạng là quyết định sản phẩm, chưa được chơi thử trên điện thoại thật.
