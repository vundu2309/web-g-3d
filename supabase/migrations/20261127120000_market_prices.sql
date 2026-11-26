-- Market prices that change by market and by day (decision 0022), and the game's calendar.
--
-- 1. The calendar: economy_private.game_day() and game_week() give the DATE in Vietnam (UTC+7, no
--    summer time; the week starts on Monday). The client keeps the same calendar in
--    src/ocean/game-clock.ts. The helpers take a time so tests (which run inside one transaction,
--    where now() stands still) can ask about any moment.
-- 2. market_pct(market, day): the price multiplier of a market on a day, an integer percent from 85
--    to 125 (a narrow band: the market is named by the client, so a modified client can always
--    claim the best one; it can gain at most 25 %). A fixed integer mix that src/ocean/market-prices.ts
--    repeats exactly, so the client and the database always agree; no table of prices per day is
--    kept and nothing has to run at midnight.
-- 3. economy_state(p_market) prices every ledger row with that market's percent today and adds
--    `market: {day, pct, all}` (all: the percent of every market, for "giá hôm nay");
--    economy_sell(p_fish, p_market, p_day) pays the same price. p_day is the day the player was
--    shown (today, or yesterday: the price a player saw just before midnight is honoured).
--
-- The functions economy_state() and economy_sell(jsonb) are REPLACED (dropped, then created with the
-- new optional arguments): two functions of one name with different arguments would make a call
-- with only the old arguments ambiguous for PostgREST (PGRST203). A client that sends only the old
-- arguments reaches the new functions and gets the market percent 100, exactly the old prices.
-- price(species, kg) is NOT changed.

create function economy_private.game_day(p_at timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (p_at at time zone 'Asia/Ho_Chi_Minh')::date
$$;
create function economy_private.game_week(p_at timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', p_at at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create table economy_private.market_ids (
  id text primary key,
  idx integer not null unique check (idx >= 0)
);
alter table economy_private.market_ids enable row level security;
revoke all on economy_private.market_ids from public, anon, authenticated;
-- The same five ids, in the same order, as MARKETS in src/ocean/market.ts (a test compares them).
insert into economy_private.market_ids (id, idx) values
  ('hai-dang', 0), ('doi-xanh', 1), ('bai-co', 2), ('giua-khoi', 3), ('cuoi-troi', 4);

-- 85..125. NULL market: 100. Unknown market: 22023.
create function economy_private.market_pct(p_market text, p_day date) returns integer
language plpgsql stable set search_path = '' as $$
declare
  m constant bigint := 2147483647;
  pos integer;
  x bigint;
begin
  if p_market is null then return 100; end if;
  select idx into pos from economy_private.market_ids where id = p_market;
  if pos is null then raise exception 'unknown market' using errcode = '22023'; end if;
  x := (((p_day - date '2020-01-01')::bigint * 73856093 + pos * 19349663) % m + m) % m;
  for i in 1..3 loop x := (x * 48271) % m; end loop;
  return 85 + (x % 41)::integer;
end$$;

-- What a fish pays in a market that day: price() scaled by the percent, rounded half up, in integers.
create function economy_private.price_at(p_species text, p_kg numeric, p_pct integer) returns integer
language sql stable set search_path = '' as $$
  select ((economy_private.price(p_species, p_kg) * p_pct + 50) / 100)::integer
$$;

-- The percent of every market today, as {"hai-dang": 97, ...}.
create function economy_private.market_pcts(p_day date) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(id, economy_private.market_pct(id, p_day) order by idx), '{}'::jsonb)
    from economy_private.market_ids
$$;

drop function public.economy_state();
drop function public.economy_sell(jsonb);
drop function economy_private.state();
drop function economy_private.sell(jsonb);

create function economy_private.state(p_market text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  today date := economy_private.game_day();
  pct integer := economy_private.market_pct(p_market, today);
begin
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  return jsonb_build_object(
    'coins', (select coins from economy_private.wallets where user_id = uid),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'species', l.species, 'kg', l.kg,
        'price', economy_private.price_at(l.species, l.kg, pct)) order by l.id), '[]'::jsonb)
      from economy_private.ledger l where l.user_id = uid),
    'loadout', economy_private.loadout_of(uid),
    'market', jsonb_build_object('day', today, 'pct', pct, 'all', economy_private.market_pcts(today)));
end$$;

-- Sells fish from the ledger: the listed ones ([{"species": "...", "kg": 1.23}, ...], each must be
-- in the ledger), or everything when the list is null, at the price of p_market on p_day. The price
-- is the database's own (decision 0010); p_day must be today or yesterday in Vietnam (22023).
create function economy_private.sell(p_fish jsonb, p_market text default null, p_day date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  today date := economy_private.game_day();
  day date := coalesce(p_day, today);
  pct integer;
  picked bigint[] := '{}';
  item jsonb;
  row_id bigint;
  earned bigint;
  sold integer;
  balance bigint;
begin
  if day not in (today, today - 1) then raise exception 'stale prices' using errcode = '22023'; end if;
  pct := economy_private.market_pct(p_market, day);
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  perform 1 from economy_private.wallets where user_id = uid for update;
  if p_fish is null then
    select coalesce(array_agg(id), '{}') into picked from economy_private.ledger where user_id = uid;
  else
    if jsonb_typeof(p_fish) <> 'array' or jsonb_array_length(p_fish) > 200 then
      raise exception 'bad fish list' using errcode = '22023';
    end if;
    for item in select * from jsonb_array_elements(p_fish) loop
      select l.id into row_id from economy_private.ledger l
        where l.user_id = uid and l.species = item->>'species'
          and l.kg = round((item->>'kg')::numeric, 2) and not (l.id = any(picked))
        order by l.id limit 1;
      if row_id is null then raise exception 'fish not in the ledger' using errcode = '22023'; end if;
      picked := picked || row_id;
    end loop;
  end if;
  select coalesce(sum(economy_private.price_at(l.species, l.kg, pct)), 0), count(*) into earned, sold
    from economy_private.ledger l where l.id = any(picked) and l.user_id = uid;
  delete from economy_private.ledger where id = any(picked) and user_id = uid;
  update economy_private.wallets set coins = coins + earned, updated_at = now()
    where user_id = uid returning coins into balance;
  return jsonb_build_object('sold', sold, 'earned', earned, 'coins', balance);
end$$;

revoke all on function economy_private.game_day(timestamptz) from public, anon, authenticated;
revoke all on function economy_private.game_week(timestamptz) from public, anon, authenticated;
revoke all on function economy_private.market_pct(text, date) from public, anon, authenticated;
revoke all on function economy_private.price_at(text, numeric, integer) from public, anon, authenticated;
revoke all on function economy_private.market_pcts(date) from public, anon, authenticated;
revoke all on function economy_private.state(text) from public, anon, authenticated;
revoke all on function economy_private.sell(jsonb, text, date) from public, anon, authenticated;

create function public.economy_state(p_market text default null) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.state(p_market) $$;
create function public.economy_sell(p_fish jsonb default null, p_market text default null, p_day date default null)
returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.sell(p_fish, p_market, p_day) $$;
revoke all on function public.economy_state(text) from public, anon;
revoke all on function public.economy_sell(jsonb, text, date) from public, anon;
grant execute on function public.economy_state(text) to authenticated;
grant execute on function public.economy_sell(jsonb, text, date) to authenticated;
