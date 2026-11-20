-- Permanent upgrades bought with coins: a rod, a bait and a boat, four tiers each (0 is the free
-- default everyone owns, 1 to 3 are bought, one after the other, once). The DATABASE is the
-- authority on what is owned and what it costs: a client names a kind and a tier, never a
-- price. The tables are private like the economy's; only these bounded, authenticated RPCs
-- reach them. The EFFECTS of the tiers (line strength, bait odds, store slots) are applied on
-- the device, because a catch is still a client report; see docs/decisions/0010-server-economy.md.
-- Depends on 20261113032223_economy.sql (schema economy_private, wallets, me()).

create table economy_private.upgrade_prices (
  kind text not null check (kind in ('rod', 'bait', 'boat')),
  tier smallint not null check (tier between 0 and 3),
  price integer not null check (price >= 0),
  primary key (kind, tier),
  check ((tier = 0) = (price = 0))
);
-- Written once here and once in src/ocean/upgrades.ts; tests/upgrades.test.mjs keeps them equal.
insert into economy_private.upgrade_prices(kind, tier, price) values
('rod', 0, 0),
('rod', 1, 100),
('rod', 2, 600),
('rod', 3, 3000),
('bait', 0, 0),
('bait', 1, 100),
('bait', 2, 600),
('bait', 3, 3000),
('boat', 0, 0),
('boat', 1, 200),
('boat', 2, 1500),
('boat', 3, 8000);

-- One row per account: the highest tier owned of each kind, and the bait in use (every bought
-- bait is kept; one is chosen, never above the best owned).
create table economy_private.loadouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rod smallint not null default 0 check (rod between 0 and 3),
  bait smallint not null default 0 check (bait between 0 and 3),
  bait_used smallint not null default 0 check (bait_used between 0 and 3),
  boat smallint not null default 0 check (boat between 0 and 3),
  updated_at timestamptz not null default now(),
  check (bait_used <= bait)
);
alter table economy_private.upgrade_prices enable row level security;
alter table economy_private.loadouts enable row level security;
revoke all on all tables in schema economy_private from public, anon, authenticated;

-- The loadout of an account as the app reads it. An account with no row owns only the defaults
-- (and a read never creates a row).
create function economy_private.loadout_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rod', coalesce(l.rod, 0), 'bait', coalesce(l.bait, 0),
    'baitUsed', coalesce(l.bait_used, 0), 'boat', coalesce(l.boat, 0))
  from (select 1) one
  left join economy_private.loadouts l on l.user_id = p_user
$$;

-- economy_state keeps its fields and adds the loadout.
create or replace function economy_private.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := economy_private.me();
begin
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  return jsonb_build_object(
    'coins', (select coins from economy_private.wallets where user_id = uid),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'species', l.species, 'kg', l.kg,
        'price', economy_private.price(l.species, l.kg)) order by l.id), '[]'::jsonb)
      from economy_private.ledger l where l.user_id = uid),
    'loadout', economy_private.loadout_of(uid));
end$$;

-- A LIGHT read: only the four tiers, never the coins or the ledger. A later step lets the API
-- call it with the player's own token to show other players the boat.
create function economy_private.loadout() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return economy_private.loadout_of(economy_private.me());
end$$;

-- Buys the NEXT tier of a kind: it charges the price and records the tier in one transaction.
-- SQLSTATE codes (the client maps them): 22023 not a kind or tier of the table, EC409 that tier
-- is already owned (a double press or a second device charges exactly once, because the wallet
-- row is locked and the second call sees the tier bought), EC422 a tier has been skipped,
-- EC402 not enough coins. Any error changes nothing.
create function economy_private.buy(p_kind text, p_tier integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  cost integer;
  owned integer;
  balance bigint;
begin
  select price into cost from economy_private.upgrade_prices where kind = p_kind and tier = p_tier;
  if cost is null then raise exception 'unknown upgrade' using errcode = '22023'; end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  insert into economy_private.loadouts(user_id) values (uid) on conflict do nothing;
  select coins into balance from economy_private.wallets where user_id = uid for update;
  owned := case p_kind
    when 'rod' then (select rod from economy_private.loadouts where user_id = uid)
    when 'bait' then (select bait from economy_private.loadouts where user_id = uid)
    else (select boat from economy_private.loadouts where user_id = uid) end;
  if p_tier <= owned then raise exception 'already owned' using errcode = 'EC409'; end if;
  if p_tier > owned + 1 then raise exception 'buy the tier before it first' using errcode = 'EC422'; end if;
  if balance < cost then raise exception 'not enough coins' using errcode = 'EC402'; end if;
  update economy_private.wallets set coins = coins - cost, updated_at = now()
    where user_id = uid returning coins into balance;
  -- A newly bought bait is put in use at once; the older ones stay owned.
  if p_kind = 'rod' then
    update economy_private.loadouts set rod = p_tier, updated_at = now() where user_id = uid;
  elsif p_kind = 'bait' then
    update economy_private.loadouts set bait = p_tier, bait_used = p_tier, updated_at = now() where user_id = uid;
  else
    update economy_private.loadouts set boat = p_tier, updated_at = now() where user_id = uid;
  end if;
  return jsonb_build_object('coins', balance, 'loadout', economy_private.loadout_of(uid));
end$$;

-- Chooses the bait to fish with among the ones owned (EC422 when that tier is not owned yet).
create function economy_private.set_bait(p_tier integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  owned integer;
begin
  if p_tier is null or p_tier < 0 or p_tier > 3 then
    raise exception 'unknown bait tier' using errcode = '22023';
  end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  insert into economy_private.loadouts(user_id) values (uid) on conflict do nothing;
  perform 1 from economy_private.wallets where user_id = uid for update;
  select bait into owned from economy_private.loadouts where user_id = uid;
  if p_tier > owned then raise exception 'bait not owned' using errcode = 'EC422'; end if;
  update economy_private.loadouts set bait_used = p_tier, updated_at = now() where user_id = uid;
  return economy_private.loadout_of(uid);
end$$;

revoke all on function economy_private.loadout_of(uuid) from public, anon, authenticated;
revoke all on function economy_private.state() from public, anon, authenticated;
revoke all on function economy_private.loadout() from public, anon, authenticated;
revoke all on function economy_private.buy(text, integer) from public, anon, authenticated;
revoke all on function economy_private.set_bait(integer) from public, anon, authenticated;

-- The public RPCs the app calls: thin wrappers over the private functions.
create function public.economy_loadout() returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.loadout() $$;
create function public.economy_buy(p_kind text, p_tier integer) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.buy(p_kind, p_tier) $$;
create function public.economy_set_bait(p_tier integer) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.set_bait(p_tier) $$;
revoke all on function public.economy_loadout() from public, anon;
revoke all on function public.economy_buy(text, integer) from public, anon;
revoke all on function public.economy_set_bait(integer) from public, anon;
grant execute on function public.economy_loadout() to authenticated;
grant execute on function public.economy_buy(text, integer) to authenticated;
grant execute on function public.economy_set_bait(integer) to authenticated;
