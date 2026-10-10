-- Mridanga Seva — 0044: parent emails only for a check-out recorded in the app. Run it after
-- 0043, in the Supabase SQL editor (TEST first). No Edge Function change: notify-parents sends
-- whatever kind is queued.
-- Why: docs/DECISIONS.md #246-#247 (the team's answers to #231). How: docs/DATABASE.md "Parent notices (0043)".
--
-- 1. Two new yes/no settings, both off: parent_notices_check_in (an email at check-in) and
--    parent_notices_no_checkout (the night's "no check-out was recorded" email after the hourly job
--    closes a visit). parent_notices_check_out stays on. The team can tick them back on G10 without
--    a code change.
-- 2. guard_setting knows the two new keys (true / false only).
-- 3. queue_parent_notices queues 'in' only with parent_notices_check_in, 'no_checkout' only with
--    parent_notices_no_checkout (no longer tied to the check-out switch), 'out' as before. The kinds
--    stay in parent_notices' check, so rows of 0043 stay valid.
-- Old app builds keep working: they save only the keys they know.
-- Safe to run twice.

-- ---------------------------------------------------------------- 1. settings
insert into settings (key, value) values
  ('parent_notices_check_in', 'false'),
  ('parent_notices_no_checkout', 'false')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2. guard_setting
-- 0043's with the two new keys; a later migration that replaces it must keep them.
create or replace function guard_setting() returns trigger
language plpgsql set search_path = public as $$
declare
  v_int int;
  v_range int4range;
begin
  if tg_op = 'DELETE' then
    if current_user in ('anon', 'authenticated') then raise exception 'setting_required'; end if;
    return old;
  end if;
  v_range := case new.key
    when 'irregular_days'        then int4range(3, 90, '[]')
    when 'inactive_days'         then int4range(7, 365, '[]')
    when 'call_due_days'         then int4range(1, 14, '[]')
    when 'retry_days'            then int4range(1, 14, '[]')
    when 'max_retries'           then int4range(1, 10, '[]')
    when 'new_joiner_weeks'      then int4range(1, 12, '[]')
    when 'promotion_syllabus_percent' then int4range(0, 100, '[]')
    when 'promotion_min_visits'  then int4range(0, 100, '[]')
    when 'promotion_visit_weeks' then int4range(1, 52, '[]')
    when 'promotion_min_feedback' then int4range(1, 10, '[]')
    when 'fund_approval_rupees'  then int4range(0, 1000000, '[]')
    when 'fund_bill_rupees'      then int4range(0, 1000000, '[]')
  end;
  if v_range is not null then
    begin
      v_int := (new.value #>> '{}')::int;
    exception when others then
      v_int := null;
    end;
    if jsonb_typeof(new.value) <> 'number' or v_int is null or not v_range @> v_int then
      raise exception 'setting_invalid' using detail = format('%s is a whole number in %s.', new.key, v_range);
    end if;
    new.value := to_jsonb(v_int);
  elsif new.key = 'week_starts' then
    if new.value #>> '{}' not in ('monday', 'rolling7') or jsonb_typeof(new.value) <> 'string' then
      raise exception 'setting_invalid' using detail = 'week_starts is "monday" or "rolling7".';
    end if;
  elsif new.key in ('promotion_needs_level_up', 'parent_notices_enabled', 'parent_notices_check_out',
                    'parent_notices_check_in', 'parent_notices_no_checkout') then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'setting_invalid' using detail = format('%s is true or false.', new.key);
    end if;
  elsif new.key = 'call_reasons' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'setting_invalid' using detail = 'call_reasons is a list of codes.';
    end if;
  elsif new.key in ('ig_translator', 'parent_notice_contact') then
    if jsonb_typeof(new.value) <> 'string' or char_length(btrim(new.value #>> '{}')) > 100 then
      raise exception 'setting_invalid' using detail = format('%s is a text of at most 100 characters.', new.key);
    end if;
    new.value := to_jsonb(btrim(new.value #>> '{}'));
  elsif current_user in ('anon', 'authenticated') then
    raise exception 'setting_unknown' using detail = format('%s is not a setting the app knows.', new.key);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 3. the trigger
-- 0043's, each kind behind its own switch. A check-in queues 'in' (parent_notices_check_in, off);
-- a check-out set to about now 'out' (parent_notices_check_out, on); the hourly close of a visit
-- nobody checked out (no app user signed in, at the closing time) 'no_checkout'
-- (parent_notices_no_checkout, off). Every check-out the app records (QR, door tablet, coordinator
-- tap, Check out all for today's visits) is set to now, so the "not news" rule below never holds one
-- back. Not news, so nothing: a visit typed in later (check-in over 10 minutes ago), a time corrected
-- afterwards, an old day's visit closed by the next check-in. Guardians sharing one email get one
-- email, on the row of the guardian who gave the consent if that is one of them. A repeated scan
-- (0038's 30 seconds) writes no visit, so it queues nothing.
create or replace function queue_parent_notices() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
  v_at   timestamptz;
begin
  if not coalesce(setting_flag('parent_notices_enabled'), false) then return null; end if;
  if tg_op = 'INSERT' then
    if not coalesce(setting_flag('parent_notices_check_in'), false)
       or new.check_out is not null or new.check_in < now() - interval '10 minutes' or new.check_in > now() + interval '1 minute' then
      return null;
    end if;
    v_kind := 'in';
    v_at := new.check_in;
  else
    if old.check_out is not null or new.check_out is null then
      return null;
    end if;
    if new.check_out > now() - interval '10 minutes' and new.check_out <= now() + interval '1 minute' then
      if not coalesce(setting_flag('parent_notices_check_out'), true) then return null; end if;
      v_kind := 'out';
    elsif auth.uid() is null and new.check_out > now() - interval '6 hours' then
      if not coalesce(setting_flag('parent_notices_no_checkout'), false) then return null; end if;
      v_kind := 'no_checkout';
    else
      return null;
    end if;
    v_at := new.check_out;
  end if;

  insert into parent_notices (visit_id, guardian_id, kind, event_at)
  select distinct on (lower(btrim(g.email))) new.id, g.id, v_kind, v_at
    from guardians g
   where g.student_id = new.student_id
     and parent_notice_block(new.student_id, g.id) is null
   order by lower(btrim(g.email)),
            exists (select 1 from consents c where c.guardian_id = g.id) desc, g.id
  on conflict (visit_id, guardian_id, kind) do nothing;
  return null;
end $$;

-- create or replace keeps 0043's revoke (no app role may run the trigger function).
revoke execute on function queue_parent_notices() from public, anon, authenticated, service_role;

comment on function queue_parent_notices() is 'Trigger on visits: queues the emails to a minor''s guardians when notices are on: check-out (parent_notices_check_out, on), check-in (parent_notices_check_in, off) and the night''s no-check-out email (parent_notices_no_checkout, off) (0043, 0044).';
