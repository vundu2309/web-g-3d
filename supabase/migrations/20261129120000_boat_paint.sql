-- Boat paint shop (decision 0024): eight hull+trim palettes (0..7), bought once with coins in
-- any order and switched freely. Every player owns their account-id default (0..3, matching
-- paletteIndex(uid) on the client) for free. The DATABASE is the authority on what is owned and
-- what it costs: a client names a paint index, never a price.
-- Depends on 20261120130000_upgrades.sql (economy_private.loadouts, loadout_of) and
-- 20261121130000_parked_boats.sql (economy_private.parked_boats).

create table economy_private.paint_prices (
  paint smallint primary key check (paint between 0 and 7),
  price integer not null check (price >= 0)
);
-- Written once here and once in src/ocean/paint.ts; tests/boat-paint.test.mjs keeps them equal.
insert into economy_private.paint_prices(paint, price) values
  (0, 150),
  (1, 150),
  (2, 150),
  (3, 150),
  (4, 400),
  (5, 400),
  (6, 800),
  (7, 2000);

alter table economy_private.paint_prices enable row level security;
revoke all on economy_private.paint_prices from public, anon, authenticated;

alter table economy_private.loadouts
  add column paint smallint check (paint between 0 and 7),
  add column paints smallint[] not null default '{}';

-- Matches src/ocean/palette.ts `paletteIndex(uid)`: unsigned 32-bit hash * 31 + charCode mod 4.
create function economy_private.default_paint(p_user uuid) returns smallint
language plpgsql immutable set search_path = '' as $$
declare
  s text := p_user::text;
  h bigint := 0;
  i integer;
begin
  for i in 1..length(s) loop
    h := (h * 31 + ascii(substr(s, i, 1))) & 4294967295;
  end loop;
  return (h % 4)::smallint;
end$$;

-- Include paint (null until chosen) and owned paints array in loadout_of.
create or replace function economy_private.loadout_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rod', coalesce(l.rod, 0),
    'bait', coalesce(l.bait, 0),
    'baitUsed', coalesce(l.bait_used, 0),
    'boat', coalesce(l.boat, 0),
    'paint', l.paint,
    'paints', coalesce(to_jsonb(l.paints), '[]'::jsonb))
  from (select 1) one
  left join economy_private.loadouts l on l.user_id = p_user
$$;

-- Include chosen paint in parked_boats so offline boats keep their painted hull.
create or replace function economy_private.parked_boats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := economy_private.me();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', t.user_id, 'name', t.name, 'x', t.x, 'z', t.z, 'heading', t.heading,
      'tier', t.boat, 'rod', t.rod, 'paint', t.paint, 'age', t.age) order by t.pose_at desc)
    from (
      select p.user_id, p.x, p.z, p.heading, p.pose_at,
        coalesce(nullif(left(trim(u.raw_user_meta_data ->> 'display_name'), 24), ''), 'Người đi biển') as name,
        coalesce(l.boat, 0) as boat, coalesce(l.rod, 0) as rod, l.paint,
        extract(epoch from (clock_timestamp() - p.pose_at))::bigint as age
      from economy_private.profiles p
      join auth.users u on u.id = p.user_id
      left join economy_private.loadouts l on l.user_id = p.user_id
      where p.pose_at is not null and p.user_id <> uid
        and p.pose_at > clock_timestamp() - interval '7 days'
      order by p.pose_at desc
      limit 100
    ) t), '[]'::jsonb);
end$$;

-- Buys a boat paint (any order) and equips it immediately.
-- SQLSTATE: 22023 invalid paint, EC409 already owned (including free UID default), EC402 poor.
create function economy_private.buy_paint(p_paint integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  cost integer;
  owned smallint[];
  balance bigint;
begin
  select price into cost from economy_private.paint_prices where paint = p_paint;
  if cost is null then raise exception 'unknown paint' using errcode = '22023'; end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  insert into economy_private.loadouts(user_id) values (uid) on conflict do nothing;
  select coins into balance from economy_private.wallets where user_id = uid for update;
  select paints into owned from economy_private.loadouts where user_id = uid;
  if p_paint = economy_private.default_paint(uid) or p_paint::smallint = any(owned) then
    raise exception 'already owned' using errcode = 'EC409';
  end if;
  if balance < cost then raise exception 'not enough coins' using errcode = 'EC402'; end if;
  update economy_private.wallets set coins = coins - cost, updated_at = now()
    where user_id = uid returning coins into balance;
  update economy_private.loadouts
    set paint = p_paint::smallint,
        paints = array(select distinct unnest(array_append(paints, p_paint::smallint)) order by 1),
        updated_at = now()
    where user_id = uid;
  return jsonb_build_object('coins', balance, 'loadout', economy_private.loadout_of(uid));
end$$;

-- Equips an owned paint (or the player's free UID default). EC422 when not owned.
create function economy_private.set_paint(p_paint integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  owned smallint[];
begin
  if p_paint is null or p_paint < 0 or p_paint > 7 then
    raise exception 'unknown paint' using errcode = '22023';
  end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  insert into economy_private.loadouts(user_id) values (uid) on conflict do nothing;
  perform 1 from economy_private.wallets where user_id = uid for update;
  select paints into owned from economy_private.loadouts where user_id = uid;
  if p_paint <> economy_private.default_paint(uid) and not (p_paint::smallint = any(owned)) then
    raise exception 'paint not owned' using errcode = 'EC422';
  end if;
  update economy_private.loadouts set paint = p_paint::smallint, updated_at = now()
    where user_id = uid;
  return economy_private.loadout_of(uid);
end$$;

revoke all on function economy_private.default_paint(uuid) from public, anon, authenticated;
revoke all on function economy_private.loadout_of(uuid) from public, anon, authenticated;
revoke all on function economy_private.parked_boats() from public, anon, authenticated;
revoke all on function economy_private.buy_paint(integer) from public, anon, authenticated;
revoke all on function economy_private.set_paint(integer) from public, anon, authenticated;

create function public.economy_buy_paint(p_paint integer) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.buy_paint(p_paint) $$;
create function public.economy_set_paint(p_paint integer) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.set_paint(p_paint) $$;

revoke all on function public.economy_buy_paint(integer) from public, anon;
revoke all on function public.economy_set_paint(integer) from public, anon;
grant execute on function public.economy_buy_paint(integer) to authenticated;
grant execute on function public.economy_set_paint(integer) to authenticated;
