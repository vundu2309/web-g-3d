-- Progression (decision 0021): daily quests, the weekly board and the hourly event's board.
--
-- Everything here is counted INSIDE record_catch, from the fish the server itself accepted (real
-- species, weight in range, one per 6 s, the ledger cap); no client ever sends a count or a score.
-- A catch is still a client report (docs/work/2026-11-19-server-authoritative-catch.md), so rewards
-- are small and capped (quests: 120 coins a day at most) and the boards pay nothing.
--
-- record_catch is restated ONCE, to call economy_private.on_catch(); later changes replace on_catch
-- only. A failure in on_catch never loses the catch: it runs in its own sub-transaction and a
-- failure returns {} (the fish is already in the ledger).
--
-- The functions economy_record_catch(text, numeric) are REPLACED (dropped, then created with the
-- optional third argument): two functions of one name would be ambiguous for PostgREST (PGRST203).
-- An old client that sends only (species, kg) reaches the new function and works as before.

-- ---------------------------------------------------------------------------------------------
-- Tables

create table economy_private.quest_defs (
  id text primary key,
  slot smallint not null check (slot between 0 and 2),
  species text references economy_private.fish_prices(species),
  min_kg numeric(7,2) check (min_kg is null or min_kg > 0),
  goal integer not null check (goal between 1 and 50),
  reward integer not null check (reward between 1 and 100)
);
alter table economy_private.quest_defs enable row level security;
revoke all on economy_private.quest_defs from public, anon, authenticated;
-- Slot 0: any fish. Slot 1: a gentle species (rarity 1 and 2). Slot 2: something big or rare.
-- (The words are the client's: src/ocean/quests.ts writes them from species, min_kg and goal; a
-- test keeps this list and that file equal.) The three dearest ones sum to 115, under the cap of 120.
insert into economy_private.quest_defs (id, slot, species, min_kg, goal, reward) values
  ('any-5',      0, null,        null, 5,  15),
  ('any-8',      0, null,        null, 8,  20),
  ('any-10',     0, null,        null, 10, 25),
  ('cua-2',      1, 'cua-bien',  null, 2,  25),
  ('sao-3',      1, 'sao-bien',  null, 3,  25),
  ('sua-2',      1, 'sua',       null, 2,  30),
  ('ca-he-2',    1, 'ca-he',     null, 2,  35),
  ('ca-ngua-2',  1, 'ca-ngua',   null, 2,  40),
  ('big-20',     2, null,        20,   1,  40),
  ('tom-hum-1',  2, 'tom-hum',   null, 1,  45),
  ('rua-1',      2, 'rua-bien',  null, 1,  45),
  ('ca-map-1',   2, 'ca-map',    null, 1,  50);

create table economy_private.daily_quests (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  slot smallint not null check (slot between 0 and 2),
  quest_id text not null,
  species text,
  min_kg numeric(7,2),
  goal integer not null,
  reward integer not null,
  progress integer not null default 0 check (progress >= 0),
  claimed_at timestamptz,
  primary key (user_id, day, slot)
);
alter table economy_private.daily_quests enable row level security;
revoke all on economy_private.daily_quests from public, anon, authenticated;

create table economy_private.weekly_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  caught integer not null default 0 check (caught >= 0),
  heaviest numeric(7,2) not null default 0,
  heaviest_species text,
  primary key (user_id, week)
);
create index weekly_stats_caught on economy_private.weekly_stats (week, caught desc);
create index weekly_stats_heaviest on economy_private.weekly_stats (week, heaviest desc);
alter table economy_private.weekly_stats enable row level security;
revoke all on economy_private.weekly_stats from public, anon, authenticated;

create table economy_private.event_results (
  slot bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null,
  species text not null,
  kg numeric(7,2) not null,
  catches smallint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (slot, user_id)
);
create index event_results_score on economy_private.event_results (slot, score desc);
alter table economy_private.event_results enable row level security;
revoke all on economy_private.event_results from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers

-- The hour of the shared clock (the event's slot): the same number as slotOf(ms, HOUR_MS) in the client.
create function economy_private.event_slot(p_at timestamptz default now()) returns bigint
language sql stable set search_path = '' as $$
  select floor(extract(epoch from p_at) / 3600)::bigint
$$;

-- Three quests a day, chosen by the account and the day (a hash, so the same all day, different between players).
create function economy_private.ensure_quests(p_uid uuid, p_day date) returns void
language plpgsql set search_path = '' as $$
declare s smallint;
begin
  for s in 0..2 loop
    insert into economy_private.daily_quests (user_id, day, slot, quest_id, species, min_kg, goal, reward)
      select p_uid, p_day, d.slot, d.id, d.species, d.min_kg, d.goal, d.reward
        from economy_private.quest_defs d
       where d.slot = s
       order by md5(p_uid::text || p_day::text || d.id)
       limit 1
    on conflict do nothing;
  end loop;
end$$;

-- What the server counts for one accepted catch. Never raises: it returns {} when anything fails.
-- p_event is the hour the client says the catch belongs to (null: not an event catch).
create function economy_private.on_catch(p_uid uuid, p_species text, p_kg numeric, p_event bigint, p_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := economy_private.game_day(p_at);
  v_week date := economy_private.game_week(p_at);
  f economy_private.fish_prices;
  secs bigint := floor(extract(epoch from p_at))::bigint % 3600;
  event_out jsonb := null;
  quests jsonb;
  mine economy_private.event_results;
begin
  perform economy_private.ensure_quests(p_uid, v_day);
  update economy_private.daily_quests q set progress = least(q.goal, q.progress + 1)
   where q.user_id = p_uid and q.day = v_day and q.claimed_at is null
     and (q.species is null or q.species = p_species)
     and (q.min_kg is null or p_kg >= q.min_kg);
  insert into economy_private.weekly_stats (user_id, week, caught, heaviest, heaviest_species)
    values (p_uid, v_week, 1, p_kg, p_species)
  on conflict (user_id, week) do update set
    caught = economy_private.weekly_stats.caught + 1,
    heaviest_species = case when excluded.heaviest > economy_private.weekly_stats.heaviest
                            then excluded.heaviest_species else economy_private.weekly_stats.heaviest_species end,
    heaviest = greatest(economy_private.weekly_stats.heaviest, excluded.heaviest);

  -- The event: this hour, within the window and a 20 s grace, one of the three giant species and
  -- weighed like a giant (the top 13 % of its range; the client rolls the top 12 %), at most 3 a player.
  select * into f from economy_private.fish_prices where species = p_species;
  if p_event is not null and p_event = economy_private.event_slot(p_at) and secs <= 1220
     and p_species in ('tom-hum', 'ca-heo', 'ca-map')
     and p_kg >= f.min_kg + 0.87 * (f.max_kg - f.min_kg) then
    insert into economy_private.event_results (slot, user_id, score, species, kg, catches)
      values (p_event, p_uid, economy_private.price(p_species, p_kg), p_species, p_kg, 1)
    on conflict (slot, user_id) do update set
      catches = economy_private.event_results.catches + 1,
      score = greatest(economy_private.event_results.score, excluded.score),
      species = case when excluded.score > economy_private.event_results.score
                     or (excluded.score = economy_private.event_results.score and excluded.kg > economy_private.event_results.kg)
                     then excluded.species else economy_private.event_results.species end,
      kg = case when excluded.score > economy_private.event_results.score
                or (excluded.score = economy_private.event_results.score and excluded.kg > economy_private.event_results.kg)
                then excluded.kg else economy_private.event_results.kg end,
      updated_at = now()
    where economy_private.event_results.catches < 3;
    delete from economy_private.event_results where slot < p_event - 72;
    select * into mine from economy_private.event_results where slot = p_event and user_id = p_uid;
    event_out := jsonb_build_object('score', mine.score, 'catches', mine.catches);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('slot', q.slot, 'progress', q.progress, 'goal', q.goal,
           'done', q.progress >= q.goal) order by q.slot), '[]'::jsonb) into quests
    from economy_private.daily_quests q where q.user_id = p_uid and q.day = v_day;
  return jsonb_build_object('quests', quests, 'event', event_out);
exception when others then
  raise warning 'on_catch failed (the catch is kept): % %', sqlstate, sqlerrm;
  return '{}'::jsonb;
end$$;

-- ---------------------------------------------------------------------------------------------
-- record_catch: the checks of 20261120120000_profile.sql unchanged, plus `discovered` and on_catch.

drop function public.economy_record_catch(text, numeric);
drop function economy_private.record_catch(text, numeric);

create function economy_private.record_catch(p_species text, p_kg numeric, p_event bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  kg numeric(7,2) := round(p_kg, 2);
  f economy_private.fish_prices;
  last timestamptz;
  new_id bigint;
  best numeric;
  is_record boolean;
  discovered boolean;
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
  select coalesce((records->>p_species)::numeric, 0), not (records ? p_species) into best, discovered
    from economy_private.profiles where user_id = uid;
  is_record := kg > best;
  update economy_private.profiles set
    caught = least(caught + 1, 1000000),
    records = case when is_record then records || jsonb_build_object(p_species, kg) else records end,
    updated_at = now()
  where user_id = uid;
  return jsonb_build_object('id', new_id, 'record', is_record, 'discovered', discovered)
    || economy_private.on_catch(uid, p_species, kg, p_event, clock_timestamp());
end$$;

-- ---------------------------------------------------------------------------------------------
-- The quests: what the player sees, and claiming a finished one.

-- {day, resetsAt (ms), capLeft, quests: [{slot, species, minKg, goal, progress, reward, claimed}]}
create function economy_private.quests() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  v_day date := economy_private.game_day();
  taken integer;
begin
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  perform 1 from economy_private.wallets where user_id = uid for update;
  perform economy_private.ensure_quests(uid, v_day);
  select coalesce(sum(reward), 0) into taken from economy_private.daily_quests
   where user_id = uid and day = v_day and claimed_at is not null;
  return jsonb_build_object(
    'day', v_day,
    'resetsAt', floor(extract(epoch from ((v_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint,
    'capLeft', greatest(0, 120 - taken),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('slot', q.slot, 'species', q.species, 'minKg', q.min_kg,
                 'goal', q.goal, 'progress', q.progress, 'reward', q.reward, 'claimed', q.claimed_at is not null)
                 order by q.slot), '[]'::jsonb)
                 from economy_private.daily_quests q where q.user_id = uid and q.day = v_day));
end$$;

-- SQLSTATE EC410: the quest is not finished or was already claimed. A claim pays the reward, or
-- what is left of the day's cap of 120 coins (a finished quest is always marked claimed).
create function economy_private.quest_claim(p_slot smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  v_day date := economy_private.game_day();
  q economy_private.daily_quests;
  taken integer;
  pay integer;
  balance bigint;
begin
  if p_slot is null or p_slot not between 0 and 2 then raise exception 'bad slot' using errcode = '22023'; end if;
  insert into economy_private.wallets(user_id) values (uid) on conflict do nothing;
  perform 1 from economy_private.wallets where user_id = uid for update;
  select * into q from economy_private.daily_quests
   where user_id = uid and daily_quests.day = v_day and slot = p_slot for update;
  if not found or q.claimed_at is not null or q.progress < q.goal then
    raise exception 'quest not claimable' using errcode = 'EC410';
  end if;
  select coalesce(sum(reward), 0) into taken from economy_private.daily_quests
   where user_id = uid and daily_quests.day = v_day and claimed_at is not null;
  pay := greatest(0, least(q.reward, 120 - taken));
  update economy_private.daily_quests set claimed_at = now()
   where user_id = uid and daily_quests.day = v_day and slot = p_slot;
  update economy_private.wallets set coins = coins + pay, updated_at = now()
   where user_id = uid returning coins into balance;
  return jsonb_build_object('earned', pay, 'coins', balance);
end$$;

-- ---------------------------------------------------------------------------------------------
-- The weekly board (the shape of economy_leaderboard, for this Vietnamese week) and the event board.

create function economy_private.weekly_board() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  v_week date := economy_private.game_week();
begin
  return (
    with who as (
      select s.user_id, s.caught, s.heaviest as kg, s.heaviest_species as species,
             coalesce(nullif(left(btrim(u.raw_user_meta_data->>'display_name'), 24), ''), 'Người đi biển') as name
        from economy_private.weekly_stats s
        join auth.users u on u.id = s.user_id
       where s.week = v_week
    ),
    by_caught as (select *, rank() over (order by caught desc) as pos from who where caught > 0),
    by_weight as (select *, rank() over (order by kg desc) as pos from who where kg > 0)
    select jsonb_build_object(
      'week', v_week,
      'endsAt', floor(extract(epoch from ((v_week + 7)::timestamp at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint,
      'caught', jsonb_build_object(
        'players', (select count(*) from by_caught),
        'top', coalesce((select jsonb_agg(jsonb_build_object('rank', t.pos, 'name', t.name, 'value', t.caught, 'you', t.user_id = uid)
                   order by t.pos, t.name, t.user_id)
            from (select * from by_caught order by pos, name, user_id limit 20) t), '[]'::jsonb),
        'me', (select jsonb_build_object('rank', c.pos, 'value', c.caught) from by_caught c where c.user_id = uid)),
      'heaviest', jsonb_build_object(
        'players', (select count(*) from by_weight),
        'top', coalesce((select jsonb_agg(jsonb_build_object('rank', t.pos, 'name', t.name, 'value', t.kg, 'species', t.species, 'you', t.user_id = uid)
                   order by t.pos, t.name, t.user_id)
            from (select * from by_weight order by pos, name, user_id limit 20) t), '[]'::jsonb),
        'me', (select jsonb_build_object('rank', w.pos, 'value', w.kg, 'species', w.species) from by_weight w where w.user_id = uid))));
end$$;

-- The board of one event hour (default: this hour; at most 72 hours back). Best single catch by
-- price first, then weight. `active` is true during the event's 20 minutes.
create function economy_private.event_board(p_slot bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  cur bigint := economy_private.event_slot();
  v_slot bigint := coalesce(p_slot, economy_private.event_slot());
begin
  if v_slot > cur or v_slot < cur - 72 then raise exception 'bad slot' using errcode = '22023'; end if;
  return (
    with who as (
      select e.user_id, e.score, e.species, e.kg, e.updated_at,
             coalesce(nullif(left(btrim(u.raw_user_meta_data->>'display_name'), 24), ''), 'Người đi biển') as name
        from economy_private.event_results e
        join auth.users u on u.id = e.user_id
       where e.slot = v_slot
    ),
    ranked as (select *, rank() over (order by score desc, kg desc) as pos from who)
    select jsonb_build_object(
      'slot', v_slot,
      'active', v_slot = cur and floor(extract(epoch from now()))::bigint % 3600 < 1200,
      'startsAt', v_slot * 3600000,
      'endsAt', v_slot * 3600000 + 1200000,
      'players', (select count(*) from ranked),
      'top', coalesce((select jsonb_agg(jsonb_build_object('rank', t.pos, 'name', t.name, 'species', t.species,
                 'kg', t.kg, 'score', t.score, 'you', t.user_id = uid) order by t.pos, t.updated_at, t.user_id)
            from (select * from ranked order by pos, updated_at, user_id limit 20) t), '[]'::jsonb),
      'me', (select jsonb_build_object('rank', r.pos, 'species', r.species, 'kg', r.kg, 'score', r.score)
               from ranked r where r.user_id = uid)));
end$$;

-- ---------------------------------------------------------------------------------------------
-- Who may call what

revoke all on function economy_private.event_slot(timestamptz) from public, anon, authenticated;
revoke all on function economy_private.ensure_quests(uuid, date) from public, anon, authenticated;
revoke all on function economy_private.on_catch(uuid, text, numeric, bigint, timestamptz) from public, anon, authenticated;
revoke all on function economy_private.record_catch(text, numeric, bigint) from public, anon, authenticated;
revoke all on function economy_private.quests() from public, anon, authenticated;
revoke all on function economy_private.quest_claim(smallint) from public, anon, authenticated;
revoke all on function economy_private.weekly_board() from public, anon, authenticated;
revoke all on function economy_private.event_board(bigint) from public, anon, authenticated;

create function public.economy_record_catch(p_species text, p_kg numeric, p_event bigint default null) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.record_catch(p_species, p_kg, p_event) $$;
create function public.economy_quests() returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.quests() $$;
create function public.economy_quest_claim(p_slot smallint) returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.quest_claim(p_slot) $$;
create function public.economy_weekly_board() returns jsonb
language sql stable security definer set search_path = '' as $$ select economy_private.weekly_board() $$;
create function public.economy_event_board(p_slot bigint default null) returns jsonb
language sql stable security definer set search_path = '' as $$ select economy_private.event_board(p_slot) $$;

revoke all on function public.economy_record_catch(text, numeric, bigint) from public, anon;
revoke all on function public.economy_quests() from public, anon;
revoke all on function public.economy_quest_claim(smallint) from public, anon;
revoke all on function public.economy_weekly_board() from public, anon;
revoke all on function public.economy_event_board(bigint) from public, anon;
grant execute on function public.economy_record_catch(text, numeric, bigint) to authenticated;
grant execute on function public.economy_quests() to authenticated;
grant execute on function public.economy_quest_claim(smallint) to authenticated;
grant execute on function public.economy_weekly_board() to authenticated;
grant execute on function public.economy_event_board(bigint) to authenticated;
