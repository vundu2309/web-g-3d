# 0024: Boat paint shop (shipyard)

Status: published on `main` (`1376983`, 2026-11-27); Vercel production deployment verified.

## Decision

Players can buy and switch hull+trim boat paints at any shipyard (`Xưởng` -> tab `Sơn tàu`), completing Phase 5 of the six-phase gameplay plan ([`docs/work/2026-11-26-gameplay.md`](../work/2026-11-26-gameplay.md)).

- **Eight palettes (0..7)** in `src/ocean/palette.ts` and `src/ocean/paint.ts`:
  - `0..3` are the four classic palettes (`Xanh Đại Dương`, `Đỏ San Hô`, `Xanh Ngọc Bích`, `Tím Hoàng Hôn`, 150 xu each). Every account owns its UID-hash default (`paletteIndex(uid)`, `0..3`) for free so existing players keep their colour.
  - `4..7` are four new palettes (`Vàng Nắng Mai` 400 xu, `Xanh Rừng Tràm` 400 xu, `Hồng Hải Đường` 800 xu, `Đen Huyền Thoại` 2.000 xu).
  - None collide with the Vietnam flag (`PAL.flag`) or the patrol ship palette (`PATROL_PALETTE = 8`).
  - Paints can be bought in **any order** and switched freely once owned; buying a paint equips it immediately.
- **Models & thumbnails**: uses the existing four Blender boat GLBs (`boat.glb`, `boat-2.glb`, `boat-3.glb`, `boat-4.glb`) painted via `paintBoat` (`boat-model.ts`, `boat-picture.ts`, `item-thumb.ts`). No new GLB files.
- **Server authority** (`supabase/migrations/20261129120000_boat_paint.sql`):
  - `economy_private.paint_prices` holds authoritative prices; `economy_private.loadouts` gains `paint` (nullable `smallint 0..7`) and `paints` (`smallint[]`).
  - `economy_private.default_paint(uuid)` computes the exact same 32-bit unsigned hash mod 4 as JS `paletteIndex(uid)`.
  - Authenticated RPCs `public.economy_buy_paint(integer)` and `public.economy_set_paint(integer)` lock the wallet row and return `EC409` (already owned, including free UID default), `EC402` (poor), `EC422` (not owned), or `22023` (invalid).
  - `economy_private.loadout_of` and `economy_private.parked_boats` include `paint` (and `paints` in `loadout_of`).
- **Multiplayer sync** (`server/ocean.mjs`, `src/platform/ocean-socket.ts`, `src/ocean/babylon-scene.ts`, `src/app/minimap.ts`, `src/app/ocean.ts`):
  - `server/ocean.mjs` reads `paint` from `economy_loadout` and `economy_parked_boats` with the player's own token (never trusting client payloads) and relays it in `ocean:state`, `ocean:delta` (`add`), and `ocean:refit`.
  - When `paint` is `null` / absent, the key is omitted on the wire for full backwards compatibility with older clients and existing servers.

## Performance

- Adding 4 palettes adds 4 hidden vertex-coloured source mesh copies per loaded boat tier (`boat-model.ts`), costing vertex-colour buffer memory only and **0 extra draw calls per frame** (each boat still renders one instance of its active palette). Not measured on a real phone.
