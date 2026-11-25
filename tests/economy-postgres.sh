#!/bin/bash
# Applies the economy migrations (economy, sea species, profile, upgrades, leaderboard) to a DISPOSABLE PostgreSQL (given as PGHOST/PGPORT/PGUSER with a
# superuser) and runs tests/economy-postgres.sql against it. It creates a throwaway database
# with the Supabase Auth fixtures (auth.users, auth.uid(), the anon and authenticated roles)
# and drops it afterwards. Never point it at a production database.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="economy_test_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;
SQL
# Every migration the sea's economy has, in order: the economy, the species added later, the
# profile (fish store, records, boat position), the upgrades, the leaderboard, the parked boats, the 4 s pose limit.
for migration in 20261113032223_economy 20261118120000_sea_species 20261120120000_profile 20261120130000_upgrades 20261121120000_leaderboard 20261121130000_parked_boats 20261125091258_pose_every_5s; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "supabase/migrations/$migration.sql"
done
psql -v ON_ERROR_STOP=1 -q -t -d "$DB" -f tests/economy-postgres.sql | grep -v '^$' | tail -2
