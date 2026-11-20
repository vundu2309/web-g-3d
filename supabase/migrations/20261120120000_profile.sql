-- The player's profile on the server: how many fish they caught, their best weight per species,
-- where the boat last was, and a ONE-TIME import of the fish store that used to live only on the
-- device (localStorage). With this the unsold-fish ledger of 20261113032223_economy.sql is the one
-- fish store: the Kho cá, the records and the market all read the same rows.
-- Tables stay private; only bounded, authenticated RPCs reach them, as in the economy migration.
create table economy_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  caught integer not null default 0 check (caught >= 0),
  -- {"ca-ngu": 21.5, ...}: the heaviest fish of each species, in kg.
  records jsonb not null default '{}'::jsonb,
  x numeric(8,2),
  z numeric(8,2),
  heading numeric(6,3),
  pose_at timestamptz,
  imported_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table economy_private.profiles enable row level security;
revoke all on economy_private.profiles from public, anon, authenticated;

create function economy_private.ensure_profile(uid uuid) returns void
language sql set search_path = '' as $$
  insert into economy_private.profiles(user_id) values (uid) on conflict do nothing
$$;

-- What the app needs on entering the sea. `pose` is null until the boat has been saved once.
create function economy_private.profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  p economy_private.profiles;
begin
  perform economy_private.ensure_profile(uid);
  select * into p from economy_private.profiles where user_id = uid;
  return jsonb_build_object(
    'caught', p.caught,
    'records', p.records,
    'imported', p.imported_at is not null,
    'pose', case when p.pose_at is null then null else jsonb_build_object(
      'x', p.x, 'z', p.z, 'heading', p.heading,
      'age', extract(epoch from (clock_timestamp() - p.pose_at))::bigint) end);
end$$;

-- Same checks as before (real species, weight in range, one per 6 s, 200 unsold at most), and
-- now the catch also counts and may set a record. Replaces the function of the economy migration.
create or replace function economy_private.record_catch(p_species text, p_kg numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  kg numeric(7,2) := round(p_kg, 2);
  f economy_private.fish_prices;
  last timestamptz;
  new_id bigint;
  best numeric;
  is_record boolean;
begin
  select * into f from economy_private.fish_prices where species = p_species;
  if not found then raise exception 'unknown species' using errcode = '22023'; end if;
  if kg is null or kg < f.min_kg or kg > f.max_kg then
    raise exception 'weight out of range' using errcode = '22023';
  end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  perform economy_private.ensure_profile(uid);
  select last_catch_at into last from economy_private.wallets where user_id = uid for update;
  if last is not null and clock_timestamp() - last < interval '6 seconds' then
    raise exception 'catch too fast' using errcode = '55000';
  end if;
  if (select count(*) from economy_private.ledger where user_id = uid) >= 200 then
    raise exception 'too many unsold fish' using errcode = '54000';
  end if;
  insert into economy_private.ledger(user_id, species, kg) values (uid, p_species, kg) returning id into new_id;
  update economy_private.wallets set last_catch_at = clock_timestamp(), updated_at = now() where user_id = uid;
  select coalesce((records->>p_species)::numeric, 0) into best from economy_private.profiles where user_id = uid;
  is_record := kg > best;
  update economy_private.profiles set
    caught = least(caught + 1, 1000000),
    records = case when is_record then records || jsonb_build_object(p_species, kg) else records end,
    updated_at = now()
  where user_id = uid;
  return jsonb_build_object('id', new_id, 'record', is_record);
end$$;

-- Puts the lightest fish of a species back in the sea: it leaves the ledger and pays nothing.
create function economy_private.release_fish(p_species text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  gone bigint;
begin
  delete from economy_private.ledger where id = (
    select l.id from economy_private.ledger l
      where l.user_id = uid and l.species = p_species order by l.kg, l.id limit 1)
  returning id into gone;
  if gone is null then raise exception 'no such fish held' using errcode = '22023'; end if;
  return jsonb_build_object('released', gone);
end$$;

-- Where the boat is. Inside the sea only, and at most one write per 10 s (others are ignored).
create function economy_private.save_pose(p_x numeric, p_z numeric, p_heading numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  last timestamptz;
begin
  if p_x is null or p_z is null or p_heading is null
     or abs(p_x) > 1500 or abs(p_z) > 1500 or abs(p_heading) > 3.2 then
    raise exception 'bad position' using errcode = '22023';
  end if;
  perform economy_private.ensure_profile(uid);
  select pose_at into last from economy_private.profiles where user_id = uid for update;
  if last is not null and clock_timestamp() - last < interval '10 seconds' then
    return jsonb_build_object('saved', false);
  end if;
  update economy_private.profiles set x = round(p_x, 2), z = round(p_z, 2),
    heading = round(p_heading, 3), pose_at = clock_timestamp(), updated_at = now()
  where user_id = uid;
  return jsonb_build_object('saved', true);
end$$;

-- One time per account: moves the fish store kept on the device to the server. The device only
-- knows how many of each species it held and the best weight, not each fish, so every moved fish
-- is given the species' LIGHTEST weight (the least it can be worth); the best weights become
-- records. At most 100 fish are moved, never past the ledger's 200 (when the device holds more,
-- every species is cut by the same ratio), and the count of fish caught is raised to the device's
-- count. A second call does nothing.
-- p_fish: {"ca-ngu": {"n": 3, "best": 20.5}, ...}
create function economy_private.import_local(p_fish jsonb, p_caught integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  p economy_private.profiles;
  entry record;
  f economy_private.fish_prices;
  held integer;
  room integer;
  total integer := 0;
  factor numeric := 1;
  moved integer := 0;
  n integer;
  best numeric;
begin
  perform economy_private.ensure_profile(uid);
  select * into p from economy_private.profiles where user_id = uid for update;
  if p.imported_at is not null then
    return jsonb_build_object('imported', 0, 'already', true);
  end if;
  if p_fish is not null and jsonb_typeof(p_fish) = 'object' then
    select count(*) into held from economy_private.ledger where user_id = uid;
    insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
    -- First pass: how many valid fish the device claims; then the ratio that fits the room.
    for entry in select key, value from jsonb_each(p_fish) loop
      continue when not exists (select 1 from economy_private.fish_prices where species = entry.key)
        or jsonb_typeof(entry.value) <> 'object';
      begin
        n := least(100, greatest(0, floor((entry.value->>'n')::numeric)::integer));
      exception when others then n := 0; end;
      total := total + n;
    end loop;
    room := greatest(0, least(100, 200 - held));
    if total > room then factor := room::numeric / total; end if;
    for entry in select key, value from jsonb_each(p_fish) order by key loop
      select * into f from economy_private.fish_prices where species = entry.key;
      continue when not found or jsonb_typeof(entry.value) <> 'object';
      begin
        n := floor(least(100, greatest(0, floor((entry.value->>'n')::numeric)::integer)) * factor)::integer;
      exception when others then n := 0; end;
      if n > 0 then
        insert into economy_private.ledger(user_id, species, kg)
          select uid, f.species, f.min_kg from generate_series(1, n);
        moved := moved + n;
      end if;
      begin
        best := (entry.value->>'best')::numeric;
      exception when others then best := null; end;
      if best is not null and best >= f.min_kg then
        best := round(least(best, f.max_kg), 2);
        update economy_private.profiles set records = records ||
          jsonb_build_object(f.species, greatest(coalesce((records->>f.species)::numeric, 0), best))
        where user_id = uid;
      end if;
    end loop;
  end if;
  update economy_private.profiles set
    caught = greatest(caught, least(greatest(coalesce(p_caught, 0), 0), 1000000)),
    imported_at = clock_timestamp(), updated_at = now()
  where user_id = uid;
  return jsonb_build_object('imported', moved, 'already', false);
end$$;

revoke all on function economy_private.ensure_profile(uuid) from public, anon, authenticated;
revoke all on function economy_private.profile() from public, anon, authenticated;
revoke all on function economy_private.release_fish(text) from public, anon, authenticated;
revoke all on function economy_private.save_pose(numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function economy_private.import_local(jsonb, integer) from public, anon, authenticated;

create function public.economy_profile() returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.profile() $$;
create function public.economy_release(p_species text) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.release_fish(p_species) $$;
create function public.economy_save_pose(p_x numeric, p_z numeric, p_heading numeric) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.save_pose(p_x, p_z, p_heading) $$;
create function public.economy_import_local(p_fish jsonb, p_caught integer) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.import_local(p_fish, p_caught) $$;
revoke all on function public.economy_profile() from public, anon;
revoke all on function public.economy_release(text) from public, anon;
revoke all on function public.economy_save_pose(numeric, numeric, numeric) from public, anon;
revoke all on function public.economy_import_local(jsonb, integer) from public, anon;
grant execute on function public.economy_profile() to authenticated;
grant execute on function public.economy_release(text) to authenticated;
grant execute on function public.economy_save_pose(numeric, numeric, numeric) to authenticated;
grant execute on function public.economy_import_local(jsonb, integer) to authenticated;
