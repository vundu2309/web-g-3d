create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
