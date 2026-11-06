-- Tables are private; only bounded, authenticated RPCs can access them.
create schema if not exists hub_private;
revoke all on schema hub_private from public, anon, authenticated;
create table hub_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 24),
  created_at timestamptz not null default now()
);
create table hub_private.rooms (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 24),
  capacity integer not null check (capacity between 2 and 4),
  status text not null default 'waiting' check (status in ('waiting', 'started')),
  created_at timestamptz not null default now(),
  version bigint not null default 1
);
create index rooms_directory on hub_private.rooms(created_at desc) where status = 'waiting';
create index rooms_host on hub_private.rooms(host_id);
create table hub_private.memberships (
  room_code text not null references hub_private.rooms(code) on delete cascade,
  user_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 24),
  ready boolean not null default false,
  seat integer not null check (seat between 0 and 3),
  primary key(room_code, user_id),
  unique(room_code, seat)
);
create index memberships_user on hub_private.memberships(user_id);
alter table hub_private.profiles enable row level security;
alter table hub_private.rooms enable row level security;
alter table hub_private.memberships enable row level security;
revoke all on all tables in schema hub_private from public, anon, authenticated;

create function hub_private.snapshot(p_code text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('code', r.code, 'version', r.version, 'room', jsonb_build_object(
    'title',r.title,'hostId',r.host_id,'capacity',r.capacity,'status',r.status,
    'createdAt', floor(extract(epoch from r.created_at)*1000),
    'players',(select coalesce(jsonb_object_agg(m.user_id::text,jsonb_build_object('name',m.name,'ready',m.ready,'seat',m.seat)), '{}'::jsonb) from hub_private.memberships m where m.room_code=r.code),
    'seats',(select coalesce(jsonb_object_agg(m.seat::text,m.user_id::text), '{}'::jsonb) from hub_private.memberships m where m.room_code=r.code)
  )) from hub_private.rooms r where r.code=p_code;
$$;
revoke all on function hub_private.snapshot(text) from public, anon, authenticated;

create function hub_private.command(p_action text, p_code text default null, p_name text default null,
 p_title text default null, p_capacity integer default null, p_ready boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid(); r hub_private.rooms%rowtype; member hub_private.memberships%rowtype;
 clean_name text; clean_title text; target text; next_seat integer; result jsonb;
begin
 if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception 'Hãy đăng nhập để chơi online.' using errcode='28000';
 end if;
 if p_action not in ('create','join','ready','leave','start','get','list') or p_action is null then
   raise exception 'Thao tác không hợp lệ.' using errcode='22023';
 end if;
 if p_action='list' then
   select coalesce(jsonb_agg(s.data order by s.created_at desc), '[]'::jsonb) into result
   from (select hub_private.snapshot(code) data, created_at from hub_private.rooms where status='waiting' order by created_at desc limit 50) s;
   return result;
 end if;
 target := upper(trim(p_code));
 if target is null or target !~ '^[A-HJ-NP-Z2-9]{6}$' then
   raise exception 'Mã phòng gồm 6 chữ hoặc số, không có I, O, 0, 1.' using errcode='22023';
 end if;
 if p_action in ('create','join') then
   clean_name := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
   if length(clean_name) not between 1 and 24 or clean_name ~ '[[:cntrl:]]' then
     raise exception 'Tên cần có từ 1 đến 24 ký tự.' using errcode='22023';
   end if;
   insert into hub_private.profiles(user_id,display_name) values(actor,clean_name)
   on conflict(user_id) do update set display_name=excluded.display_name;
 end if;
 if p_action='create' then
   clean_title := regexp_replace(trim(coalesce(p_title,'Phòng bạn bè')), '\s+', ' ', 'g');
   if p_capacity is null or p_capacity not between 2 and 4 or length(clean_title) not between 1 and 24 or clean_title ~ '[[:cntrl:]]' then
     raise exception 'Tên phòng hoặc số người chơi không hợp lệ.' using errcode='22023';
   end if;
   insert into hub_private.rooms(code,host_id,title,capacity) values(target,actor,clean_title,p_capacity);
   insert into hub_private.memberships(room_code,user_id,name,ready,seat) values(target,actor,clean_name,true,0);
   return hub_private.snapshot(target);
 end if;
 -- Every mutation locks the room first, including host close and concurrent join/start.
 select * into r from hub_private.rooms where code=target for update;
 if not found then
   if p_action='get' then return null; end if;
   raise exception 'Không tìm thấy phòng. Kiểm tra lại mã hoặc nhờ chủ phòng tạo phòng mới.' using errcode='22023';
 end if;
 select * into member from hub_private.memberships where room_code=target and user_id=actor;
 if p_action='get' then
   if member.user_id is null then raise exception 'Bạn không còn trong phòng này.' using errcode='42501'; end if;
   return hub_private.snapshot(target);
 end if;
 if p_action='join' then
   if member.user_id is not null then return hub_private.snapshot(target); end if;
   if r.status <> 'waiting' then raise exception 'Phòng đã bắt đầu, hãy tham gia phòng khác.' using errcode='22023'; end if;
   select s into next_seat from generate_series(0,r.capacity-1) s
   where not exists(select 1 from hub_private.memberships m where m.room_code=target and m.seat=s) order by s limit 1;
   if next_seat is null then raise exception 'Phòng đã đủ người chơi.' using errcode='22023'; end if;
   insert into hub_private.memberships(room_code,user_id,name,seat) values(target,actor,clean_name,next_seat);
 else
   if member.user_id is null then raise exception 'Bạn không còn trong phòng này.' using errcode='42501'; end if;
   if p_action='leave' then
     if r.host_id=actor then delete from hub_private.rooms where code=target; return null; end if;
     delete from hub_private.memberships where room_code=target and user_id=actor;
   elsif p_action='ready' then
     if r.status <> 'waiting' then raise exception 'Phòng đã bắt đầu.' using errcode='22023'; end if;
     if r.host_id=actor then raise exception 'Chủ phòng luôn sẵn sàng.' using errcode='22023'; end if;
     if p_ready is null then raise exception 'Trạng thái không hợp lệ.' using errcode='22023'; end if;
     update hub_private.memberships set ready=p_ready where room_code=target and user_id=actor;
   elsif p_action='start' then
     if r.host_id<>actor then raise exception 'Chỉ chủ phòng có thể bắt đầu.' using errcode='42501'; end if;
     if r.status<>'waiting' or (select count(*) from hub_private.memberships where room_code=target)<2
       or exists(select 1 from hub_private.memberships where room_code=target and not ready) then
       raise exception 'Cần ít nhất 2 người và tất cả đã sẵn sàng.' using errcode='22023';
     end if;
     update hub_private.rooms set status='started' where code=target;
   end if;
 end if;
 update hub_private.rooms set version=version+1 where code=target;
 return hub_private.snapshot(target);
end;
$$;
revoke all on function hub_private.command(text,text,text,text,integer,boolean) from public, anon, authenticated;
-- The public invoker wrapper forwards the caller JWT. Direct RPC calls have exactly
-- the same database authorization as API calls; no table writes are granted.
grant usage on schema hub_private to authenticated;
grant execute on function hub_private.command(text,text,text,text,integer,boolean) to authenticated;
create function public.hub_command(p_action text, p_code text default null, p_name text default null,
 p_title text default null, p_capacity integer default null, p_ready boolean default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select hub_private.command(p_action,p_code,p_name,p_title,p_capacity,p_ready);
$$;
revoke all on function public.hub_command(text,text,text,text,integer,boolean) from public, anon;
grant execute on function public.hub_command(text,text,text,text,integer,boolean) to authenticated;

-- Emitted only at transaction commit. PostgreSQL fans out to every API instance.
create function hub_private.notify_change() returns trigger
language plpgsql set search_path = '' as $$
begin
 perform pg_catalog.pg_notify('hub_changes','changed');
 return null;
end;
$$;
revoke all on function hub_private.notify_change() from public,anon,authenticated;
create trigger rooms_changed after insert or update or delete on hub_private.rooms
for each statement execute function hub_private.notify_change();
create trigger memberships_changed after insert or update or delete on hub_private.memberships
for each statement execute function hub_private.notify_change();
