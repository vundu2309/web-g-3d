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
rollback;
select 'economy ok' as result;
