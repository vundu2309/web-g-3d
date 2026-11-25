-- The boat position can be saved every 5 seconds (the client now sends one that often, so a reload
-- or a closed tab loses at most a few seconds of sailing). The server used to refuse a save that came
-- less than 10 s after the last one, which would have dropped every second call; the limit is now
-- 4 s, so a call every 5 s is always kept and a client that floods the function is still cut.
-- Only `save_pose` is replaced (same signature, same checks, same grants); nothing else changes.
create or replace function economy_private.save_pose(p_x numeric, p_z numeric, p_heading numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := economy_private.me();
  last timestamptz;
begin
  if p_x is null or p_z is null or p_heading is null
     or abs(p_x) > 1500 or abs(p_z) > 1500 or abs(p_heading) > 3.2 then
    raise exception 'bad position' using errcode = '22023';
  end if;
  perform economy_private.ensure_profile(uid);
  select pose_at into last from economy_private.profiles where user_id = uid for update;
  if last is not null and clock_timestamp() - last < interval '4 seconds' then
    return jsonb_build_object('saved', false);
  end if;
  update economy_private.profiles set x = round(p_x, 2), z = round(p_z, 2),
    heading = round(p_heading, 3), pose_at = clock_timestamp(), updated_at = now()
  where user_id = uid;
  return jsonb_build_object('saved', true);
end$$;
