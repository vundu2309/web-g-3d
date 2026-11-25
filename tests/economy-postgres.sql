-- Run only against a disposable PostgreSQL that has the Supabase Auth fixtures (auth.users,
-- auth.uid(), the anon and authenticated roles) and the economy, sea species and upgrades
-- migrations applied (and the leaderboard one).
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

-- ---------------------------------------------------------------------------------------------
-- Upgrades (supabase/migrations/20261120130000_upgrades.sql). A fresh player a3 with 700 coins
-- (given by a superuser step: coins only come from selling fish).
reset role;
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a5'), ('00000000-0000-0000-0000-0000000000a6');
insert into economy_private.wallets(user_id, coins) values ('00000000-0000-0000-0000-0000000000a5', 700);
insert into economy_private.ledger(user_id, species, kg) values ('00000000-0000-0000-0000-0000000000a5', 'ca-com', 0.1);

-- Nobody signed in: the new RPCs need an account too.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$begin
  begin perform public.economy_buy('rod', 1); raise exception 'anonymous buy accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_set_bait(0); raise exception 'anonymous bait choice accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.economy_loadout(); raise exception 'anonymous loadout accepted';
  exception when insufficient_privilege then null; end;
end$$;

-- The new tables are private, and the price table matches the TypeScript table's seed.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
do $$begin
  begin perform * from economy_private.loadouts; raise exception 'loadouts read accepted';
  exception when insufficient_privilege then null; end;
  begin update economy_private.loadouts set rod = 3; raise exception 'loadouts write accepted';
  exception when insufficient_privilege then null; end;
  begin insert into economy_private.loadouts(user_id, rod) values ('00000000-0000-0000-0000-0000000000a5', 3); raise exception 'loadouts insert accepted';
  exception when insufficient_privilege then null; end;
  begin perform * from economy_private.upgrade_prices; raise exception 'price table read accepted';
  exception when insufficient_privilege then null; end;
  begin update economy_private.upgrade_prices set price = 0; raise exception 'price table write accepted';
  exception when insufficient_privilege then null; end;
  -- No private function is callable directly either.
  begin perform economy_private.buy('rod', 1); raise exception 'private buy accepted';
  exception when insufficient_privilege then null; end;
end$$;

-- A new account owns only the defaults; economy_state carries them next to the old fields.
do $$declare s jsonb; begin
  s := public.economy_state();
  if s->'loadout' is distinct from '{"rod":0,"bait":0,"baitUsed":0,"boat":0}'::jsonb then raise exception 'new loadout %', s->'loadout'; end if;
  if (s->>'coins')::bigint <> 700 or jsonb_array_length(s->'ledger') <> 1 then raise exception 'state fields changed: %', s; end if;
end$$;

-- Buying at the right price: wallet and loadout come back, and the state agrees.
do $$declare r jsonb; begin
  r := public.economy_buy('rod', 1);
  if (r->>'coins')::bigint <> 600 or (r->'loadout'->>'rod')::int <> 1 then raise exception 'rod 1 result %', r; end if;
  r := public.economy_buy('bait', 1);
  if (r->>'coins')::bigint <> 500 or (r->'loadout'->>'bait')::int <> 1 or (r->'loadout'->>'baitUsed')::int <> 1 then raise exception 'bait 1 result %', r; end if;
  if (public.economy_state()->>'coins')::bigint <> 500 then raise exception 'state coins after buying'; end if;
end$$;

-- The same tier twice (a double press, or a second device) charges once.
do $$begin
  begin perform public.economy_buy('rod', 1); raise exception 'second buy of the same tier accepted';
  exception when sqlstate 'EC409' then null; end;
  begin perform public.economy_buy('rod', 0); raise exception 'buying the free tier accepted';
  exception when sqlstate 'EC409' then null; end;
  if (public.economy_state()->>'coins')::bigint <> 500 then raise exception 'a refused buy charged coins'; end if;
end$$;

-- Skipping a tier is rejected and changes nothing; so is an unknown kind or tier.
do $$declare before jsonb; begin
  before := public.economy_state();
  begin perform public.economy_buy('boat', 2); raise exception 'skipped boat tier accepted';
  exception when sqlstate 'EC422' then null; end;
  begin perform public.economy_buy('rod', 3); raise exception 'skipped rod tier accepted';
  exception when sqlstate 'EC422' then null; end;
  begin perform public.economy_buy('sail', 1); raise exception 'unknown kind accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_buy('rod', 4); raise exception 'tier 4 accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_buy('rod', -1); raise exception 'tier -1 accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_buy(null, 1); raise exception 'null kind accepted';
  exception when invalid_parameter_value then null; end;
  if public.economy_state() <> before then raise exception 'a refused buy changed the state: % vs %', before, public.economy_state(); end if;
end$$;

-- Too poor: rejected, and the wallet, the ledger and the tiers stay as they were.
do $$declare before jsonb; begin
  before := public.economy_state();
  begin perform public.economy_buy('rod', 2); raise exception 'unaffordable rod accepted';   -- 600 coins, 500 held
  exception when sqlstate 'EC402' then null; end;
  if public.economy_state() <> before then raise exception 'a refused buy changed the state'; end if;
  if (public.economy_loadout()->>'rod')::int <> 1 then raise exception 'tier recorded without paying'; end if;
end$$;

-- A purchase pays with coins only to the cent: exactly the price, no more.
do $$declare r jsonb; begin
  r := public.economy_buy('boat', 1);   -- 200 coins
  if (r->>'coins')::bigint <> 300 or (r->'loadout'->>'boat')::int <> 1 then raise exception 'boat 1 result %', r; end if;
end$$;

-- Bait: every bought bait is kept; one is in use; only an owned one can be chosen.
reset role;
update economy_private.wallets set coins = coins + 1000 where user_id = '00000000-0000-0000-0000-0000000000a5';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
do $$declare r jsonb; begin
  r := public.economy_buy('bait', 2);   -- 600 coins: 1300 - 600 = 700
  if (r->>'coins')::bigint <> 700 or (r->'loadout'->>'bait')::int <> 2 or (r->'loadout'->>'baitUsed')::int <> 2 then raise exception 'bait 2 result %', r; end if;
  r := public.economy_set_bait(1);
  if r is distinct from '{"rod":1,"bait":2,"baitUsed":1,"boat":1}'::jsonb then raise exception 'bait 1 chosen: %', r; end if;
  r := public.economy_set_bait(0);
  if (r->>'baitUsed')::int <> 0 or (r->>'bait')::int <> 2 then raise exception 'default bait chosen: %', r; end if;
  begin perform public.economy_set_bait(3); raise exception 'bait not owned accepted';
  exception when sqlstate 'EC422' then null; end;
  begin perform public.economy_set_bait(4); raise exception 'bait tier 4 accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_set_bait(-1); raise exception 'bait tier -1 accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.economy_set_bait(null); raise exception 'null bait tier accepted';
  exception when invalid_parameter_value then null; end;
  if (public.economy_loadout()->>'baitUsed')::int <> 0 then raise exception 'a refused choice changed the bait in use'; end if;
end$$;
do $$declare r jsonb; begin
  -- Choosing a lower bait again, then buying the next one (too poor) leaves the choice alone.
  r := public.economy_set_bait(2);
  if (r->>'baitUsed')::int <> 2 then raise exception 'bait 2 not chosen: %', r; end if;
  begin perform public.economy_buy('bait', 3); raise exception 'unaffordable bait accepted';   -- 3000 coins, 700 held
  exception when sqlstate 'EC402' then null; end;
  if (public.economy_loadout()->>'baitUsed')::int <> 2 or (public.economy_state()->>'coins')::bigint <> 700 then
    raise exception 'a refused bait purchase changed something';
  end if;
  r := public.economy_set_bait(0);   -- back to the default bait for the checks below
end$$;

-- One player's upgrades are not another's.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a6', true);
do $$begin
  if public.economy_loadout() is distinct from '{"rod":0,"bait":0,"baitUsed":0,"boat":0}'::jsonb then raise exception 'loadout leaked between accounts'; end if;
  begin perform public.economy_set_bait(1); raise exception 'someone else''s bait could be chosen';
  exception when sqlstate 'EC422' then null; end;
  begin perform public.economy_buy('rod', 1); raise exception 'buying with an empty wallet accepted';
  exception when sqlstate 'EC402' then null; end;
end$$;

-- economy_loadout is a LIGHT read: only the four tiers, never the coins or the ledger.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
do $$declare l jsonb; begin
  l := public.economy_loadout();
  if (select array_agg(k order by k) from jsonb_object_keys(l) k) <> array['bait', 'baitUsed', 'boat', 'rod'] then
    raise exception 'loadout keys: %', l;
  end if;
  if l ? 'coins' or l ? 'ledger' then raise exception 'loadout leaks the wallet'; end if;
  if l is distinct from '{"rod":1,"bait":2,"baitUsed":0,"boat":1}'::jsonb then raise exception 'loadout %', l; end if;
end$$;

-- A read does not create rows: a never-seen account reading its loadout leaves nothing behind.
reset role;
do $$begin
  if exists (select 1 from economy_private.loadouts where user_id = '00000000-0000-0000-0000-0000000000a6') then
    raise exception 'a refused call or a read created a loadout row';
  end if;
end$$;

-- Privileges: anon and authenticated have no table grants; only authenticated runs the new RPCs.
do $$declare fn text; begin
  if exists (select 1 from information_schema.role_table_grants
      where table_schema = 'economy_private' and grantee in ('anon', 'authenticated', 'public')) then
    raise exception 'a table of economy_private is granted to anon or authenticated';
  end if;
  foreach fn in array array['public.economy_buy(text,integer)', 'public.economy_set_bait(integer)', 'public.economy_loadout()'] loop
    if not has_function_privilege('authenticated', fn, 'execute') then raise exception '% not executable by authenticated', fn; end if;
    if has_function_privilege('anon', fn, 'execute') then raise exception '% executable by anon', fn; end if;
  end loop;
  foreach fn in array array['economy_private.buy(text,integer)', 'economy_private.set_bait(integer)', 'economy_private.loadout()',
      'economy_private.loadout_of(uuid)', 'economy_private.state()'] loop
    if has_function_privilege('authenticated', fn, 'execute') or has_function_privilege('anon', fn, 'execute') then
      raise exception '% is executable by a client role', fn;
    end if;
  end loop;
end$$;

-- A price table the database owns: an unaffordable or skipped buy leaves exactly what was seeded.
do $$begin
  if (select count(*) from economy_private.upgrade_prices) <> 12 then raise exception 'price table rows'; end if;
  if (select price from economy_private.upgrade_prices where kind = 'boat' and tier = 3) <> 8000 then raise exception 'boat 3 price'; end if;
end$$;
-- ---------------------------------------------------------------------------------------------
-- Leaderboard (supabase/migrations/20261121120000_leaderboard.sql). Starts from empty profiles
-- (this is a rolled-back transaction) so the ranks below are the whole table's.
reset role;
delete from economy_private.profiles;
insert into auth.users(id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', '{"display_name": "Bình"}'),
  ('00000000-0000-0000-0000-0000000000b2', '{"display_name": "An"}'),
  ('00000000-0000-0000-0000-0000000000b3', '{"display_name": "Cường"}'),
  ('00000000-0000-0000-0000-0000000000b4', '{"display_name": "   "}'),
  ('00000000-0000-0000-0000-0000000000b5', '{"display_name": "Một cái tên rất rất rất dài hơn hai mươi bốn ký tự"}'),
  ('00000000-0000-0000-0000-0000000000b6', null);
insert into economy_private.profiles(user_id, caught, records) values
  ('00000000-0000-0000-0000-0000000000b1', 50, '{"ca-ngu": 30.5, "ca-thu": 8}'),
  ('00000000-0000-0000-0000-0000000000b2', 50, '{"ca-ngu": 41.25}'),
  ('00000000-0000-0000-0000-0000000000b3', 7, '{}'),
  ('00000000-0000-0000-0000-0000000000b4', 0, '{"ca-com": 0.1}'),
  ('00000000-0000-0000-0000-0000000000b5', 12, '{"ca-thu": 8}'),
  ('00000000-0000-0000-0000-0000000000b6', 0, '{}');

-- Nobody signed in: no board. The private function and the tables are not reachable either.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$begin
  begin perform public.economy_leaderboard(); raise exception 'anonymous leaderboard accepted';
  exception when insufficient_privilege then null; end;
end$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
do $$begin
  begin perform economy_private.leaderboard(); raise exception 'private leaderboard accepted';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon', 'public.economy_leaderboard()', 'execute') then raise exception 'anon can read the leaderboard'; end if;
end$$;

-- The two boards: equal values share a rank, nothing-yet players are not ranked, names are cut
-- and filled in, `you` marks the caller, and the caller's own place comes back even off the top.
do $$declare b jsonb; begin
  b := public.economy_leaderboard();
  -- caught: b1 and b2 tie at 50 (rank 1, by name An then Bình), b5 12 is 3rd, b3 7 is 4th.
  if (b->'caught'->>'players')::int <> 3 + 1 then raise exception 'caught players %', b->'caught'; end if;
  if jsonb_array_length(b->'caught'->'top') <> 4 then raise exception 'caught top %', b->'caught'->'top'; end if;
  if b->'caught'->'top'->0->>'name' <> 'An' or (b->'caught'->'top'->0->>'rank')::int <> 1
     or b->'caught'->'top'->1->>'name' <> 'Bình' or (b->'caught'->'top'->1->>'rank')::int <> 1
     or (b->'caught'->'top'->2->>'rank')::int <> 3 or (b->'caught'->'top'->3->>'rank')::int <> 4 then
    raise exception 'caught order %', b->'caught'->'top';
  end if;
  if char_length(b->'caught'->'top'->2->>'name') <> 24 then raise exception 'name not cut to 24: %', b->'caught'->'top'->2; end if;
  if (b->'caught'->'top'->3->>'you')::boolean is not true or (b->'caught'->'top'->0->>'you')::boolean is not false then
    raise exception 'you flag %', b->'caught'->'top';
  end if;
  if (b->'caught'->'me'->>'rank')::int <> 4 or (b->'caught'->'me'->>'value')::int <> 7 then raise exception 'caught me %', b->'caught'->'me'; end if;
  -- heaviest: a species' best counts (b1 30.5 not 8), b2 41.25 first, b1 30.5, then b5 8 and b4 0.1.
  if (b->'heaviest'->>'players')::int <> 4 then raise exception 'heaviest players %', b->'heaviest'; end if;
  if b->'heaviest'->'top'->0->>'name' <> 'An' or (b->'heaviest'->'top'->0->>'value')::numeric <> 41.25
     or b->'heaviest'->'top'->0->>'species' <> 'ca-ngu'
     or b->'heaviest'->'top'->1->>'name' <> 'Bình' or (b->'heaviest'->'top'->1->>'value')::numeric <> 30.5
     or (b->'heaviest'->'top'->2->>'value')::numeric <> 8 or (b->'heaviest'->'top'->3->>'value')::numeric <> 0.1 then
    raise exception 'heaviest order %', b->'heaviest'->'top';
  end if;
  -- A blank or missing display name reads as the default one; a player with nothing has no place.
  if b->'heaviest'->'top'->3->>'name' <> 'Người đi biển' then raise exception 'blank name %', b->'heaviest'->'top'->3; end if;
  if b->'heaviest'->'me' <> 'null'::jsonb then raise exception 'heaviest me for a player with no record: %', b->'heaviest'->'me'; end if;
end$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b6', true);
do $$declare b jsonb; begin
  b := public.economy_leaderboard();
  if b->'caught'->'me' <> 'null'::jsonb or b->'heaviest'->'me' <> 'null'::jsonb then raise exception 'a player with nothing is ranked: %', b; end if;
end$$;

-- Only the top 20 come back; the caller below them still gets their rank.
reset role;
insert into auth.users(id, raw_user_meta_data)
  select ('00000000-0000-0000-0000-00000000c' || lpad(i::text, 3, '0'))::uuid, jsonb_build_object('display_name', 'Cá thủ ' || i)
    from generate_series(1, 25) i;
insert into economy_private.profiles(user_id, caught, records)
  select ('00000000-0000-0000-0000-00000000c' || lpad(i::text, 3, '0'))::uuid, 100 + i, jsonb_build_object('ca-ngu', 10 + i)
    from generate_series(1, 25) i;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
do $$declare b jsonb; begin
  b := public.economy_leaderboard();
  if jsonb_array_length(b->'caught'->'top') <> 20 or jsonb_array_length(b->'heaviest'->'top') <> 20 then raise exception 'top is not 20'; end if;
  if (b->'caught'->'top'->0->>'value')::int <> 125 or (b->'caught'->'top'->19->>'value')::int <> 106 then raise exception 'top 20 is not the best 20: %', b->'caught'->'top'; end if;
  if (b->'caught'->>'players')::int <> 3 + 1 + 25 then raise exception 'players %', b->'caught'->>'players'; end if;
  -- b3 (7 fish) is behind the 25 new players, 2 tied leaders and b5: rank 29.
  if (b->'caught'->'me'->>'rank')::int <> 29 then raise exception 'rank off the top %', b->'caught'->'me'; end if;
end$$;

-- ---------------------------------------------------------------------------------------------
-- Parked boats (supabase/migrations/20261121130000_parked_boats.sql): the last positions of the
-- OTHER accounts seen within 7 days. b1 is recent and has a boat of tier 2, b2 was last seen 8 days
-- ago, b3 never saved a position, b4 is the player asking.
reset role;
delete from economy_private.profiles; -- the earlier checks left others behind; this block counts exactly
insert into auth.users(id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '{"display_name": "  Thuyền Lan  "}'),
  ('00000000-0000-0000-0000-0000000000c2', '{"display_name": "Cũ"}'),
  ('00000000-0000-0000-0000-0000000000c3', null),
  ('00000000-0000-0000-0000-0000000000c4', null);
insert into economy_private.profiles(user_id, x, z, heading, pose_at) values
  ('00000000-0000-0000-0000-0000000000c1', 120.5, -40.25, 1.5, clock_timestamp() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000c2', 5, 5, 0, clock_timestamp() - interval '8 days'),
  ('00000000-0000-0000-0000-0000000000c4', -7, 9, 0.5, clock_timestamp());
insert into economy_private.profiles(user_id) values ('00000000-0000-0000-0000-0000000000c3');
insert into economy_private.loadouts(user_id, boat) values ('00000000-0000-0000-0000-0000000000c1', 2);

-- Nobody signed in: refused, and the private function is not reachable by a client role.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$begin
  begin perform public.economy_parked_boats(); raise exception 'anonymous parked boats accepted';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$begin
  if has_function_privilege('anon', 'economy_private.parked_boats()', 'execute')
     or has_function_privilege('authenticated', 'economy_private.parked_boats()', 'execute')
     or has_function_privilege('anon', 'public.economy_parked_boats()', 'execute') then
    raise exception 'parked boats reachable by the wrong role';
  end if;
end$$;

set local role authenticated;
-- b4 sees b1 only: not itself, not the boat last seen 8 days ago, not the account with no position.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c4', true);
do $$declare r jsonb; begin
  r := public.economy_parked_boats();
  if jsonb_array_length(r) <> 1 then raise exception 'parked boats %', r; end if;
  if r->0->>'uid' <> '00000000-0000-0000-0000-0000000000c1' then raise exception 'wrong boat %', r; end if;
  if r->0->>'name' <> 'Thuyền Lan' then raise exception 'name is trimmed: %', r->0->>'name'; end if;
  if (r->0->>'x')::numeric <> 120.5 or (r->0->>'z')::numeric <> -40.25 or (r->0->>'heading')::numeric <> 1.5 then
    raise exception 'position %', r; end if;
  if (r->0->>'tier')::int <> 2 or (r->0->>'rod')::int <> 0 then raise exception 'tiers %', r; end if;
  if (r->0->>'age')::bigint not between 7190 and 7300 then raise exception 'age %', r->0->>'age'; end if;
end$$;
-- b1 asking sees b4 (recent) and no one else; a player with no boat saved still sees the others.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$declare r jsonb; begin
  r := public.economy_parked_boats();
  if jsonb_array_length(r) <> 1 or r->0->>'uid' <> '00000000-0000-0000-0000-0000000000c4' then
    raise exception 'b1 sees %', r; end if;
  if r->0->>'name' <> 'Người đi biển' then raise exception 'default name: %', r->0->>'name'; end if;
end$$;
rollback;
select 'economy ok' as result;
