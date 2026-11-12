-- Economy of the fishing sea: one wallet per account, a ledger of the fish it has caught and
-- not yet sold, and a price table. The DATABASE is the authority: it prices every sale itself
-- and rejects a catch that is too fast, out of the species' weight range or over the ledger's
-- cap. Tables are private; only these bounded, authenticated RPCs reach them.
-- Catches are still reported by the client (fishing is simulated on the device), so the checks
-- bound what a cheater can earn but do not make a fabricated catch impossible; see
-- docs/decisions/0010-server-economy.md.
create schema if not exists economy_private;
revoke all on schema economy_private from public, anon, authenticated;

create table economy_private.fish_prices (
  species text primary key,
  base integer not null check (base > 0),
  min_kg numeric(7,2) not null check (min_kg > 0),
  max_kg numeric(7,2) not null check (max_kg >= min_kg)
);
-- Written once here and once in src/ocean/economy.ts; tests/economy.test.mjs keeps them equal.
insert into economy_private.fish_prices(species, base, min_kg, max_kg) values
('ca-com', 6, 0.05, 0.2),
('ca-bong', 6, 0.1, 0.5),
('ca-chim', 8, 0.4, 2.5),
('ca-noc', 24, 0.3, 1.8),
('ca-mu', 46, 1, 12),
('ca-thu', 42, 1, 9),
('ca-hong', 36, 0.8, 6),
('ca-ngu', 213, 5, 45),
('ca-duoi', 196, 3, 35),
('ca-kiem', 296, 20, 120),
('ca-nuc', 6, 0.1, 0.6),
('cua-bien', 8, 0.2, 2),
('sao-bien', 6, 0.05, 0.5),
('ca-he', 20, 0.03, 0.25),
('ca-bon', 36, 0.5, 6),
('ca-ngua', 20, 0.02, 0.12),
('muc-ong', 32, 0.3, 4),
('bach-tuoc', 43, 1, 10),
('tom-hum', 103, 0.5, 5),
('ca-map', 442, 60, 400);

create table economy_private.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins bigint not null default 0 check (coins >= 0),
  last_catch_at timestamptz,
  updated_at timestamptz not null default now()
);
create table economy_private.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  species text not null references economy_private.fish_prices(species),
  kg numeric(7,2) not null check (kg > 0),
  caught_at timestamptz not null default now()
);
create index ledger_user on economy_private.ledger(user_id, species, kg);
alter table economy_private.fish_prices enable row level security;
alter table economy_private.wallets enable row level security;
alter table economy_private.ledger enable row level security;
revoke all on all tables in schema economy_private from public, anon, authenticated;

-- Coins for a fish: the base price, 0.6 times at the lightest weight up to 1.5 times at the heaviest.
create function economy_private.price(p_species text, p_kg numeric) returns integer
language sql stable set search_path = '' as $$
  select round(f.base * (0.6 + 0.9 * case when f.max_kg > f.min_kg
    then least(1, greatest(0, (p_kg - f.min_kg) / (f.max_kg - f.min_kg))) else 0 end))::integer
  from economy_private.fish_prices f where f.species = p_species
$$;

create function economy_private.me() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in required' using errcode = '42501'; end if;
  return uid;
end$$;

create function economy_private.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := economy_private.me();
begin
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  return jsonb_build_object(
    'coins', (select coins from economy_private.wallets where user_id = uid),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'species', l.species, 'kg', l.kg,
        'price', economy_private.price(l.species, l.kg)) order by l.id), '[]'::jsonb)
      from economy_private.ledger l where l.user_id = uid));
end$$;

-- A fish the client says it landed. Accepted at most once every 6 seconds (a real catch takes
-- longer than that: cast, wait, bite, fight), only for a real species within its weight range,
-- and while fewer than 200 caught fish wait to be sold.
create function economy_private.record_catch(p_species text, p_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  kg numeric(7,2) := round(p_kg, 2);
  f economy_private.fish_prices;
  last timestamptz;
  new_id bigint;
begin
  select * into f from economy_private.fish_prices where species = p_species;
  if not found then raise exception 'unknown species' using errcode = '22023'; end if;
  if kg is null or kg < f.min_kg or kg > f.max_kg then
    raise exception 'weight out of range' using errcode = '22023';
  end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  select last_catch_at into last from economy_private.wallets where user_id = uid for update;
  if last is not null and clock_timestamp() - last < interval '6 seconds' then
    raise exception 'catch too fast' using errcode = '55000';
  end if;
  if (select count(*) from economy_private.ledger where user_id = uid) >= 200 then
    raise exception 'too many unsold fish' using errcode = '54000';
  end if;
  insert into economy_private.ledger(user_id, species, kg) values (uid, p_species, kg) returning id into new_id;
  update economy_private.wallets set last_catch_at = clock_timestamp(), updated_at = now() where user_id = uid;
  return jsonb_build_object('id', new_id);
end$$;

-- Sells fish from the ledger: the listed ones ([{"species": "...", "kg": 1.23}, ...], each must
-- be in the ledger), or everything when the list is null. The price is the database's own.
create function economy_private.sell(p_fish jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  picked bigint[] := '{}';
  item jsonb;
  row_id bigint;
  earned bigint;
  sold integer;
  balance bigint;
begin
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
  select coalesce(sum(economy_private.price(l.species, l.kg)), 0), count(*) into earned, sold
    from economy_private.ledger l where l.id = any(picked) and l.user_id = uid;
  delete from economy_private.ledger where id = any(picked) and user_id = uid;
  update economy_private.wallets set coins = coins + earned, updated_at = now()
    where user_id = uid returning coins into balance;
  return jsonb_build_object('sold', sold, 'earned', earned, 'coins', balance);
end$$;

revoke all on function economy_private.price(text, numeric) from public, anon, authenticated;
revoke all on function economy_private.me() from public, anon, authenticated;
revoke all on function economy_private.state() from public, anon, authenticated;
revoke all on function economy_private.record_catch(text, numeric) from public, anon, authenticated;
revoke all on function economy_private.sell(jsonb) from public, anon, authenticated;

-- The public RPCs the app calls: thin wrappers over the private functions.
create function public.economy_state() returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.state() $$;
create function public.economy_record_catch(p_species text, p_kg numeric) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.record_catch(p_species, p_kg) $$;
create function public.economy_sell(p_fish jsonb default null) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.sell(p_fish) $$;
revoke all on function public.economy_state() from public, anon;
revoke all on function public.economy_record_catch(text, numeric) from public, anon;
revoke all on function public.economy_sell(jsonb) from public, anon;
grant execute on function public.economy_state() to authenticated;
grant execute on function public.economy_record_catch(text, numeric) to authenticated;
grant execute on function public.economy_sell(jsonb) to authenticated;
