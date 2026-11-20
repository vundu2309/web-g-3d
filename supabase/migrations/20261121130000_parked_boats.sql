-- Boats of players who are not online: the others still see them where they were left.
-- The profile already keeps where each boat last was (20261120120000_profile.sql, `save_pose`);
-- this adds ONE read: the last positions of the OTHER accounts seen in the past 7 days (at most
-- 100, the newest first), with the name the player chose, their boat and rod tiers and how many
-- seconds ago the boat was saved. The API calls it with a signed-in player's own token (no admin
-- key) and decides which of them are online. Additive: nothing is changed or dropped; it comes
-- after the profile and the upgrades migrations.
create function economy_private.parked_boats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := economy_private.me();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', t.user_id, 'name', t.name, 'x', t.x, 'z', t.z, 'heading', t.heading,
      'tier', t.boat, 'rod', t.rod, 'age', t.age) order by t.pose_at desc)
    from (
      select p.user_id, p.x, p.z, p.heading, p.pose_at,
        coalesce(nullif(left(trim(u.raw_user_meta_data ->> 'display_name'), 24), ''), 'Người đi biển') as name,
        coalesce(l.boat, 0) as boat, coalesce(l.rod, 0) as rod,
        extract(epoch from (clock_timestamp() - p.pose_at))::bigint as age
      from economy_private.profiles p
      join auth.users u on u.id = p.user_id
      left join economy_private.loadouts l on l.user_id = p.user_id
      where p.pose_at is not null and p.user_id <> uid
        and p.pose_at > clock_timestamp() - interval '7 days'
      order by p.pose_at desc
      limit 100
    ) t), '[]'::jsonb);
end$$;

revoke all on function economy_private.parked_boats() from public, anon, authenticated;

create function public.economy_parked_boats() returns jsonb
language sql security definer set search_path = '' as $$ select economy_private.parked_boats() $$;
revoke all on function public.economy_parked_boats() from public, anon;
grant execute on function public.economy_parked_boats() to authenticated;
