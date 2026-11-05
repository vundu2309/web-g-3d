-- Run only against the isolated disposable PostgreSQL test container.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.hub_command('create','ABCDEF','Host','Test room',2);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.hub_command('join','ABCDEF','Guest');
do $$begin
 begin perform public.hub_command('start','ABCDEF');raise exception 'non-host start accepted';exception when insufficient_privilege then null;end;
 begin perform public.hub_command('create','ZZZZZZ','Guest','Invalid',7);raise exception 'invalid capacity accepted';exception when invalid_parameter_value then null;end;
 begin update hub_private.memberships set ready=true;raise exception 'direct write accepted';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$begin
 begin perform public.hub_command('join','ABCDEF','Overflow');raise exception 'overflow accepted';exception when invalid_parameter_value then null;end;
 begin perform public.hub_command('get','ABCDEF');raise exception 'non-member read accepted';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$begin
 begin perform public.hub_command('start','ABCDEF');raise exception 'unready start accepted';exception when invalid_parameter_value then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.hub_command('ready','ABCDEF',p_ready=>true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.hub_command('start','ABCDEF');
do $$declare data jsonb;begin
 data:=public.hub_command('get','ABCDEF');
 if data->'room'->>'status'<>'started' then raise exception 'start not persisted';end if;
end$$;
select public.hub_command('leave','ABCDEF');
do $$begin
 if public.hub_command('get','ABCDEF') is not null then raise exception 'host close failed';end if;
end$$;
reset role;
do $$begin
 if exists(select 1 from hub_private.memberships where room_code='ABCDEF') then raise exception 'orphan memberships';end if;
end$$;
set local role anon;
do $$begin
 begin perform public.hub_command('list');raise exception 'anonymous read accepted';exception when insufficient_privilege then null;end;
end$$;
rollback;
