-- Run only against a disposable PostgreSQL that has the Supabase Auth fixtures (auth.users,
-- auth.uid(), the anon and authenticated roles) and the economy migration applied.
-- tests/economy-postgres.sh builds exactly that and runs this file.
begin;
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

-- Prices: the lightest fish pays 0.6 times the base, the heaviest 1.5 times.
do $$begin
  if economy_private.price('ca-ngu', 5) <> 128 or economy_private.price('ca-ngu', 45) <> 320 then
    raise exception 'ca-ngu prices: % %', economy_private.price('ca-ngu', 5), economy_private.price('ca-ngu', 45);
  end if;
  if economy_private.price('ca-ngu', 1) <> 128 or economy_private.price('ca-ngu', 99) <> 320 then raise exception 'price is not clamped'; end if;
  if economy_private.price('ca-com', 0.05) <> 4 or economy_private.price('ca-com', 0.2) <> 9 then raise exception 'ca-com prices'; end if;
  if economy_private.price('no-such-fish', 1) is not null then raise exception 'unknown species priced'; end if;
end$$;

-- (Superuser) The expected prices, read from the database's own function.
select set_config('t.ngu', economy_private.price('ca-ngu', 12.34)::text, false);
select set_config('t.thu', economy_private.price('ca-thu', 3.5)::text, false);
select set_config('t.com', economy_private.price('ca-com', 0.1)::text, false);

-- Nobody signed in: nothing works.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$begin
  begin perform public.economy_state(); raise exception 'anonymous state accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_record_catch('ca-ngu', 10); raise exception 'anonymous catch accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_sell(null); raise exception 'anonymous sale accepted';
  exception when insufficient_privilege then null; end;
end$$;

-- A new player starts with an empty wallet.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$declare s jsonb; begin
  s := public.economy_state();
  if (s->>'coins')::bigint <> 0 or jsonb_array_length(s->'ledger') <> 0 then raise exception 'new wallet not empty: %', s; end if;
end$$;

-- Tables are private.
do $$begin
  begin perform * from economy_private.wallets; raise exception 'wallet read accepted';
  exception when insufficient_privilege then null; end;
  begin update economy_private.wallets set coins = 999999; raise exception 'wallet write accepted';
  exception when insufficient_privilege then null; end;
  begin insert into economy_private.ledger(user_id, species, kg) values ('00000000-0000-0000-0000-0000000000a1', 'ca-map', 100); raise exception 'ledger write accepted';
  exception when insufficient_privilege then null; end;
end$$;

-- A catch: real species, weight in range, one every 6 seconds.
do $$declare r jsonb; begin
  r := public.economy_record_catch('ca-ngu', 12.34);
  if (r->>'id') is null then raise exception 'no id'; end if;
  begin perform public.economy_record_catch('ca-thu', 3); raise exception 'fast catch accepted';
  exception when object_not_in_prerequisite_state then null; end;
  begin perform public.economy_record_catch('ca-unknown', 3); raise exception 'unknown species accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_record_catch('ca-thu', 99); raise exception 'overweight accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_record_catch('ca-thu', 0.1); raise exception 'underweight accepted';
  exception when invalid_parameter_value then null; end;
end$$;

-- Time passes (a superuser step), then more catches.
reset role;
update economy_private.wallets set last_catch_at = clock_timestamp() - interval '7 seconds';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.economy_record_catch('ca-thu', 3.5);
reset role;
update economy_private.wallets set last_catch_at = clock_timestamp() - interval '7 seconds';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.economy_record_catch('ca-com', 0.1);

do $$declare s jsonb; begin
  s := public.economy_state();
  if jsonb_array_length(s->'ledger') <> 3 then raise exception 'ledger should hold 3: %', s; end if;
end$$;

-- Another player cannot sell this player's fish.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$begin
  begin perform public.economy_sell('[{"species":"ca-ngu","kg":12.34}]'::jsonb); raise exception 'sold someone else''s fish';
  exception when invalid_parameter_value then null; end;
  if (public.economy_state()->>'coins')::bigint <> 0 then raise exception 'thief got coins'; end if;
end$$;

-- Selling named fish: the price is the database's, the fish leaves the ledger, coins arrive.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$declare r jsonb; expected integer; begin
  expected := current_setting('t.ngu')::int;
  r := public.economy_sell('[{"species":"ca-ngu","kg":12.34}]'::jsonb);
  if (r->>'sold')::int <> 1 or (r->>'earned')::int <> expected or (r->>'coins')::int <> expected then raise exception 'sale result %', r; end if;
  -- The same fish cannot be sold twice, nor one that was never caught, nor a bad list.
  begin perform public.economy_sell('[{"species":"ca-ngu","kg":12.34}]'::jsonb); raise exception 'double sale accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_sell('[{"species":"ca-map","kg":100}]'::jsonb); raise exception 'sold a fish never caught';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_sell('{"species":"ca-com"}'::jsonb); raise exception 'object list accepted';
  exception when invalid_parameter_value then null; end;
  -- One failing entry cancels the whole sale.
  begin perform public.economy_sell('[{"species":"ca-thu","kg":3.5},{"species":"ca-map","kg":100}]'::jsonb); raise exception 'partial sale accepted';
  exception when invalid_parameter_value then null; end;
  if jsonb_array_length(public.economy_state()->'ledger') <> 2 then raise exception 'failed sale changed the ledger'; end if;
  -- Selling everything.
  r := public.economy_sell(null);
  if (r->>'sold')::int <> 2 then raise exception 'sell all sold %', r; end if;
  if (r->>'coins')::int <> expected + current_setting('t.thu')::int + current_setting('t.com')::int then raise exception 'sell all coins %', r; end if;
  if jsonb_array_length(public.economy_state()->'ledger') <> 0 then raise exception 'ledger not empty after selling all'; end if;
  -- Selling nothing is fine and pays nothing.
  r := public.economy_sell(null);
  if (r->>'sold')::int <> 0 or (r->>'earned')::int <> 0 then raise exception 'empty sale %', r; end if;
end$$;

-- The ledger holds at most 200 unsold fish.
reset role;
insert into economy_private.ledger(user_id, species, kg)
  select '00000000-0000-0000-0000-0000000000a1', 'ca-com', 0.1 from generate_series(1, 200);
update economy_private.wallets set last_catch_at = clock_timestamp() - interval '7 seconds';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$begin
  begin perform public.economy_record_catch('ca-com', 0.1); raise exception 'ledger cap not enforced';
  exception when program_limit_exceeded then null; end;
end$$;

-- ===== Profile (20261120120000_profile.sql) =====
reset role;
delete from economy_private.ledger;
update economy_private.wallets set last_catch_at = null;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);

-- Nobody signed in: the new calls are refused too.
select set_config('request.jwt.claim.sub', '', true);
do $$begin
  begin perform public.economy_profile(); raise exception 'anonymous profile accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_save_pose(1, 1, 0); raise exception 'anonymous pose accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_release('ca-ngu'); raise exception 'anonymous release accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_import_local('{}'::jsonb, 0); raise exception 'anonymous import accepted';
  exception when insufficient_privilege then null; end;
end$$;
do $$begin
  begin perform * from economy_private.profiles; raise exception 'profile read accepted';
  exception when insufficient_privilege then null; end;
end$$;

-- A new profile is empty; catches count and set records, a lighter fish does not.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$declare p jsonb; r jsonb; begin
  p := public.economy_profile();
  if (p->>'caught')::int <> 0 or p->'records' <> '{}'::jsonb or p->'pose' <> 'null'::jsonb or (p->>'imported')::boolean then
    raise exception 'new profile %', p;
  end if;
  r := public.economy_record_catch('ca-ngu', 12.34);
  if not (r->>'record')::boolean then raise exception 'first catch is a record'; end if;
end$$;
reset role;
update economy_private.wallets set last_catch_at = clock_timestamp() - interval '7 seconds';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$declare r jsonb; p jsonb; begin
  r := public.economy_record_catch('ca-ngu', 8.5);
  if (r->>'record')::boolean then raise exception 'a lighter fish set a record'; end if;
  p := public.economy_profile();
  if (p->>'caught')::int <> 2 or (p->'records'->>'ca-ngu')::numeric <> 12.34 then raise exception 'profile after catches %', p; end if;
end$$;

-- Putting a fish back removes the LIGHTEST of that species and pays nothing; none held is refused.
do $$declare s jsonb; begin
  perform public.economy_release('ca-ngu');
  s := public.economy_state();
  if jsonb_array_length(s->'ledger') <> 1 or (s->'ledger'->0->>'kg')::numeric <> 12.34 or (s->>'coins')::bigint <> 0 then
    raise exception 'release removed the wrong fish or paid: %', s;
  end if;
  begin perform public.economy_release('ca-map'); raise exception 'released a fish never held';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_release('no-such'); raise exception 'released an unknown species';
  exception when invalid_parameter_value then null; end;
  -- The record stays after the fish is gone.
  if (public.economy_profile()->'records'->>'ca-ngu')::numeric <> 12.34 then raise exception 'record lost'; end if;
end$$;

-- The boat's position: validated, one write per 10 s (the next is ignored, not an error).
do $$declare r jsonb; p jsonb; begin
  begin perform public.economy_save_pose(99999, 0, 0); raise exception 'far position accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_save_pose(0, 0, 9); raise exception 'bad heading accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_save_pose(null, 0, 0); raise exception 'null position accepted';
  exception when invalid_parameter_value then null; end;
  r := public.economy_save_pose(10.5, -20.25, 1.5);
  if not (r->>'saved')::boolean then raise exception 'first pose not saved'; end if;
  r := public.economy_save_pose(500, 500, 0);
  if (r->>'saved')::boolean then raise exception 'second pose within 10 s was saved'; end if;
  p := public.economy_profile()->'pose';
  if (p->>'x')::numeric <> 10.5 or (p->>'z')::numeric <> -20.25 or (p->>'heading')::numeric <> 1.5 then raise exception 'pose %', p; end if;
end$$;

-- Importing the device's old store: once, bounded, lightest weights, records from "best".
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
reset role;
delete from economy_private.ledger where user_id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$declare r jsonb; s jsonb; p jsonb; begin
  r := public.economy_import_local(
    '{"ca-ngu": {"n": 3, "best": 20.5}, "ca-com": {"n": 2, "best": 99}, "no-such": {"n": 5, "best": 1}, "ca-thu": "x", "ca-map": {"n": "many"}}'::jsonb, 40);
  if (r->>'imported')::int <> 5 or (r->>'already')::boolean then raise exception 'import result %', r; end if;
  s := public.economy_state();
  if jsonb_array_length(s->'ledger') <> 5 then raise exception 'ledger after import %', s; end if;
  -- Every moved fish has the species' lightest weight (ca-ngu 5 kg, ca-com 0.05 kg).
  if exists (select 1 from jsonb_array_elements(s->'ledger') e
    where not ((e->>'species' = 'ca-ngu' and (e->>'kg')::numeric = 5) or (e->>'species' = 'ca-com' and (e->>'kg')::numeric = 0.05))) then
    raise exception 'imported weights %', s;
  end if;
  p := public.economy_profile();
  -- A record above the species' heaviest fish is clamped to it (ca-com tops out at 0.2).
  if (p->'records'->>'ca-ngu')::numeric <> 20.5 or (p->'records'->>'ca-com')::numeric <> 0.2 then raise exception 'records %', p->'records'; end if;
  if p->'records' ? 'no-such' then raise exception 'unknown species got a record'; end if;
  if (p->>'caught')::int <> 40 or not (p->>'imported')::boolean then raise exception 'caught/imported %', p; end if;
  -- A second import changes nothing.
  r := public.economy_import_local('{"ca-ngu": {"n": 50, "best": 40}}'::jsonb, 9999);
  if (r->>'imported')::int <> 0 or not (r->>'already')::boolean then raise exception 'second import %', r; end if;
  if jsonb_array_length(public.economy_state()->'ledger') <> 5 or (public.economy_profile()->>'caught')::int <> 40 then raise exception 'second import changed the profile'; end if;
end$$;

-- A huge import is capped at 100 fish (and the ledger's 200), and the caught count at one million.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
reset role;
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a3');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
do $$declare r jsonb; begin
  r := public.economy_import_local('{"ca-map": {"n": 9999, "best": 400}, "ca-ngu": {"n": 9999, "best": 45}}'::jsonb, 2000000000);
  if (r->>'imported')::int <> 100 then raise exception 'import not capped: %', r; end if;
  if jsonb_array_length(public.economy_state()->'ledger') <> 100 then raise exception 'ledger not capped'; end if;
  if (select count(*) from jsonb_array_elements(public.economy_state()->'ledger') e where e->>'species' = 'ca-map') <> 50 then raise exception 'species not cut by the same ratio'; end if;
  if (public.economy_profile()->>'caught')::int <> 1000000 then raise exception 'caught not capped'; end if;
end$$;
rollback;
select 'economy ok' as result;
