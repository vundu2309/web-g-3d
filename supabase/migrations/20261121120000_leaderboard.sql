-- The fishing leaderboard: two boards read from the profiles of 20261120120000_profile.sql.
--   caught   : fish caught in all, most first;
--   heaviest : the heaviest single fish (the best record weight of any species), heaviest first.
-- It only READS: no table, no column and no existing function changes. Players with nothing yet
-- (0 caught, no record) are not ranked. Equal values share a rank. Names are the account's display
-- name (the same one a boat shows to the others in the sea), at most 24 characters.
-- The tables stay private; one bounded, authenticated RPC reads them, as in the economy migration.
-- Like every catch, the numbers are what clients reported within the server's checks (real species,
-- weight in range, one catch per 6 s): this is a game board, not an authoritative award.
create function economy_private.leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
begin
  return (
    with who as (
      select p.user_id,
             p.caught,
             coalesce(nullif(left(btrim(u.raw_user_meta_data->>'display_name'), 24), ''), 'Người đi biển') as name,
             b.species,
             b.kg
        from economy_private.profiles p
        join auth.users u on u.id = p.user_id
        left join lateral (
          select r.key as species, r.value::numeric as kg
            from jsonb_each_text(p.records) r
           order by r.value::numeric desc, r.key
           limit 1
        ) b on true
    ),
    by_caught as (
      select *, rank() over (order by caught desc) as pos from who where caught > 0
    ),
    by_weight as (
      select *, rank() over (order by kg desc) as pos from who where kg > 0
    )
    select jsonb_build_object(
      'caught', jsonb_build_object(
        'players', (select count(*) from by_caught),
        'top', coalesce((
          select jsonb_agg(
                   jsonb_build_object('rank', t.pos, 'name', t.name, 'value', t.caught, 'you', t.user_id = uid)
                   order by t.pos, t.name, t.user_id)
            from (select * from by_caught order by pos, name, user_id limit 20) t
        ), '[]'::jsonb),
        'me', (select jsonb_build_object('rank', c.pos, 'value', c.caught) from by_caught c where c.user_id = uid)
      ),
      'heaviest', jsonb_build_object(
        'players', (select count(*) from by_weight),
        'top', coalesce((
          select jsonb_agg(
                   jsonb_build_object('rank', t.pos, 'name', t.name, 'value', t.kg, 'species', t.species, 'you', t.user_id = uid)
                   order by t.pos, t.name, t.user_id)
            from (select * from by_weight order by pos, name, user_id limit 20) t
        ), '[]'::jsonb),
        'me', (select jsonb_build_object('rank', w.pos, 'value', w.kg, 'species', w.species) from by_weight w where w.user_id = uid)
      )
    )
  );
end$$;

revoke all on function economy_private.leaderboard() from public, anon, authenticated;

create function public.economy_leaderboard() returns jsonb
language sql stable security definer set search_path = '' as $$ select economy_private.leaderboard() $$;
revoke all on function public.economy_leaderboard() from public, anon;
grant execute on function public.economy_leaderboard() to authenticated;
