-- Mridanga Seva — 0030: round 10, follow-up and attendance rules (audit brief 15). Run once, after
-- 0029, in the Supabase SQL editor (TEST first). Why: docs/DECISIONS.md #107-#111. How:
-- docs/DATABASE.md "Round 10 rules (0030)".
--
-- Praveen decided on 6 Oct 2026: when a pause ends the student turns Irregular, the mentor gets a
-- call task, and the days to Inactive count from the pause end; staff may correct only a visit's
-- times, and every correction is kept in the audit log; marking a student Left changes nothing else
-- (the app's confirmation now says so: login, messages and pushes go on until the Guru switches the
-- login off).
--
-- 1. Settings: a bad or missing follow-up number falls back to its default instead of stopping
--    the daily job; Irregular before Inactive is checked at commit however a setting is written (#108).
-- 2. The daily job: an ended pause gets a call task and restarts the Inactive clock; no second
--    open task; only tasks that are due are escalated (#107).
-- 3. log_call: the failed-try count starts again after a visit (#108).
-- 4. Status side doors: an app user inserts New or Active only, and paused_until changes only
--    through a logged call (#109).
-- 5. Visits: only the times may be corrected, every change is audited; a QR scan within 30 seconds
--    of the check-in does not check the student out (#110).
-- 6. my_role(): the comment says both rules again (0029 replaced 0028's comment).

-- ---------------------------------------------------------------- 1. settings
-- 0001's setting_int failed the whole statement on a value like "14 days" or 14.5, and gave null
-- for a missing key (the daily job then moved nobody, log_call failed on a null date). Now a value
-- that is not a whole number counts as missing, and the follow-up numbers fall back to the
-- defaults of 0001. Other keys still give null for their callers' own coalesce.
create or replace function setting_int(k text) returns int
language plpgsql stable set search_path = public as $$
declare
  v_text text;
  v_int  int;
begin
  select value #>> '{}' into v_text from settings where key = k;
  begin
    v_int := v_text::int;
  exception when others then
    v_int := null;
  end;
  return coalesce(v_int, case k
    when 'irregular_days'   then 14
    when 'inactive_days'    then 30
    when 'call_due_days'    then 3
    when 'retry_days'       then 3
    when 'max_retries'      then 3
    when 'new_joiner_weeks' then 4
  end);
end $$;

-- save_settings (0014) checks the order only for the app's G10 screen. This runs for every write,
-- at commit, so save_settings may still change both numbers in one call in any order.
-- Error code irregular_after_inactive.
create or replace function check_setting_order() returns trigger
language plpgsql set search_path = public as $$
begin
  if setting_int('irregular_days') >= setting_int('inactive_days') then
    raise exception 'irregular_after_inactive' using detail = 'Days to Irregular must be fewer than days to Inactive.';
  end if;
  return null;
end $$;

create constraint trigger settings_order after insert or update on settings
  deferrable initially deferred
  for each row when (new.key in ('irregular_days', 'inactive_days'))
  execute function check_setting_order();

-- ---------------------------------------------------------------- 2. the daily job
-- 0014's version, with three changes:
--   * a pause that ended turns Irregular WITH a call task for the mentor (audit D5-01, D12a-10),
--     and the days to Inactive count from the day it ended (status_history), so a long pause does
--     not jump to Inactive the same morning;
--   * a call task is added only when the student has no open one (D5-16: no duplicates);
--   * an Inactive student's open tasks are escalated only once they are due: a future-dated task
--     means somebody called and was given a date (D5-16).
-- student_overview's days_since_visit still counts from the last visit: it is what the screens show.
create or replace function refresh_student_statuses() returns void
language plpgsql security definer set search_path = public as $$
declare
  r          record;
  last_seen  date;
  v_irregular int := setting_int('irregular_days');
  v_inactive  int := setting_int('inactive_days');
  v_call_due  int := setting_int('call_due_days');
begin
  perform set_config('app.via_call_log', 'on', true);

  for r in update students set status = 'irregular', paused_until = null
            where status = 'paused' and paused_until < today_ist()
        returning id, mentor_id loop
    if not exists (select 1 from follow_up_tasks where student_id = r.id and done_at is null) then
      insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
      values (r.id, r.mentor_id, 'call', today_ist() + v_call_due);
    end if;
  end loop;

  for r in select * from students where status in ('new', 'active', 'irregular') loop
    select greatest(
             coalesce(max(v.check_in at time zone 'Asia/Kolkata')::date,
                      greatest(r.joined_on, (r.created_at at time zone 'Asia/Kolkata')::date)),
             (select max(h.changed_at at time zone 'Asia/Kolkata')::date
                from status_history h
               where h.student_id = r.id and h.from_status = 'paused'))
      into last_seen from visits v where v.student_id = r.id;
    if r.status in ('new', 'active') and last_seen <= today_ist() - v_irregular then
      update students set status = 'irregular' where id = r.id;
      if not exists (select 1 from follow_up_tasks where student_id = r.id and done_at is null) then
        insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
        values (r.id, r.mentor_id, 'call', today_ist() + v_call_due);
      end if;
    elsif r.status = 'irregular' and last_seen <= today_ist() - v_inactive then
      update students set status = 'inactive' where id = r.id;
    end if;
  end loop;

  update follow_up_tasks t set escalated = true
    from students s
   where t.student_id = s.id and t.done_at is null and not t.escalated
     and s.status = 'inactive' and t.due_on <= today_ist();
end $$;

-- ---------------------------------------------------------------- 3. log_call
-- 0005's version; one change: the failed tries are counted since the last call that got through
-- OR the last visit, whichever is later, so a new absence starts again at try 1 (audit D5-02).
create or replace function log_call(p_student uuid, p_outcome call_outcome, p_reason text,
                                    p_comment text, p_next_date date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c_id     uuid;
  tries    int;
  s        students;
  v_reason text := nullif(trim(p_reason), '');
  v_next   date := case when p_outcome in ('returning', 'paused') then p_next_date end;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if p_outcome is null then raise exception 'outcome_required'; end if;
  -- Lock the student's row, so two coordinators logging a call at the same moment are handled one
  -- after the other and the retry count below stays right.
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if coalesce(trim(p_comment), '') = '' then raise exception 'comment_required'; end if;
  if p_outcome <> 'not_reachable' and v_reason is null then
    raise exception 'reason_required' using detail = 'Every outcome except not_reachable needs a reason.';
  end if;
  -- The list is read in the select list, after the where, so the other settings (plain numbers,
  -- not lists) never reach jsonb_array_elements_text.
  if v_reason is not null and v_reason not in (
       select jsonb_array_elements_text(value) from settings where key = 'call_reasons') then
    raise exception 'reason_unknown' using detail = format('%s is not in settings.call_reasons.', v_reason);
  end if;
  if p_outcome in ('returning', 'paused') then
    if v_next is null then raise exception 'next_date_required'; end if;
    if v_next < today_ist() then raise exception 'next_date_past'; end if;
  end if;

  insert into call_logs (student_id, outcome, reason, comment, next_date)
  values (p_student, p_outcome, v_reason, trim(p_comment), v_next) returning id into c_id;

  update follow_up_tasks set done_at = now(), call_log_id = c_id
   where student_id = p_student and done_at is null;

  perform set_config('app.via_call_log', 'on', true);
  if p_outcome = 'paused' then
    update students set status = 'paused', paused_until = v_next where id = p_student;
  elsif p_outcome = 'discontinued' then
    update students set status = 'left', paused_until = null where id = p_student;
  elsif p_outcome = 'returning' then
    -- If they have not come by the day after the date they gave, call again.
    insert into follow_up_tasks (student_id, assignee_id, kind, due_on)
    values (p_student, s.mentor_id, 'call', v_next + 1);
  elsif p_outcome = 'not_reachable' then
    -- Failed tries in this absence, this one included: since the last call that got through or
    -- the last visit, whichever came later.
    select count(*) into tries from call_logs
     where student_id = p_student and outcome = 'not_reachable'
       and called_at > greatest(
             coalesce((select max(called_at) from call_logs
                        where student_id = p_student and outcome <> 'not_reachable'), '-infinity'),
             coalesce((select max(check_in) from visits where student_id = p_student), '-infinity'));
    insert into follow_up_tasks (student_id, assignee_id, kind, due_on, attempt, escalated)
    values (p_student, s.mentor_id, 'retry', today_ist() + setting_int('retry_days'),
            tries + 1, tries >= setting_int('max_retries'));
  end if;
  return c_id;
end $$;

-- ---------------------------------------------------------------- 4. status side doors
-- guard_student_update (0001) refuses an UPDATE to Paused or Left without a logged call. Two side
-- doors stayed open for app users (audit D1b-04, D12a-04): an INSERT straight into Paused, Left,
-- Irregular or Inactive, and moving paused_until by hand (a pause made endless without a call).
-- log_call, toggle_visit and the daily job set app.via_call_log and pass; so do the dashboard and
-- the SQL editor (not anon / authenticated). A date in paused_until means nothing outside a pause,
-- so it is cleared when the status leaves Paused. Left -> New by hand stays allowed (#4).
-- Error codes: status_on_insert, student_field_locked (detail paused_until).
create or replace function guard_student_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated')
     or coalesce(current_setting('app.via_call_log', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('new', 'active') then
      raise exception 'status_on_insert' using detail = 'A new record starts as New or Active; Paused and Left come from a logged call.';
    end if;
    new.paused_until := null;
    return new;
  end if;
  if new.status <> 'paused' then
    new.paused_until := null;
  elsif new.paused_until is distinct from old.paused_until then
    raise exception 'student_field_locked' using detail = 'paused_until: a pause is set or moved by logging a call.';
  end if;
  return new;
end $$;

create trigger students_status_guard before insert or update on students
  for each row execute function guard_student_status();

-- ---------------------------------------------------------------- 5. visits
-- The visits UPDATE policy (0001) let any coordinator move a visit to another student or rewrite
-- who marked it, with no trace (audit D1a-06, FR-05). For app users only the times may change; the
-- check constraint keeps check-out after check-in, and a check-in cannot be in the future. Every
-- change and delete is kept in audit_log (a check-in itself is the row: marked_by, method).
-- Error codes: visit_field_locked, visit_time_future.
create or replace function guard_visit_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.student_id is distinct from old.student_id or new.centre_id is distinct from old.centre_id
     or new.method is distinct from old.method or new.marked_by is distinct from old.marked_by
     or new.device_id is distinct from old.device_id then
    raise exception 'visit_field_locked' using detail = 'Only the check-in and check-out times of a visit can be corrected.';
  end if;
  if new.check_in > now() then
    raise exception 'visit_time_future' using detail = 'A check-in cannot be in the future.';
  end if;
  return new;
end $$;

create trigger visits_update_guard before update on visits
  for each row execute function guard_visit_update();

create trigger audit_visits after update or delete on visits
  for each row execute function audit_row();

-- 0025's toggle_visit, with the 30-second rule of the scanner screen moved into the database
-- (audit D5-11): a QR scan within 30 seconds of the check-in answers already_in instead of
-- checking out, so a second phone (or the door tablet) scanning the same student a moment later
-- does not end the visit at 0 minutes. A tap (mark_visit, method manual) still checks out at once.
create or replace function toggle_visit(p_student uuid, p_method visit_method, p_device text default null,
                                        p_location jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; s students; v_check text; v_dist int;
begin
  if not coalesce(my_role() in ('guru', 'coordinator', 'kiosk'), false) then
    raise exception 'not allowed';
  end if;
  select * into s from students where id = p_student;
  if not found then raise exception 'student not found'; end if;

  if p_method = 'qr' and exists (select 1 from visits
                                  where student_id = p_student and check_out is null
                                    and check_in > now() - interval '30 seconds') then
    return jsonb_build_object('action', 'already_in', 'roll_no', s.roll_no, 'full_name', s.full_name,
      'photo_path', s.photo_path);
  end if;

  update visits set check_out = now()
   where student_id = p_student and check_out is null
  returning * into v;

  if found then
    return jsonb_build_object('action', 'out', 'roll_no', s.roll_no, 'full_name', s.full_name,
      'photo_path', s.photo_path, 'at', v.check_out,
      'minutes', round(extract(epoch from v.check_out - v.check_in) / 60));
  end if;

  if p_location is not null then
    select x.location_check, x.location_distance_m into v_check, v_dist
      from visit_location_result(p_location, s.home_centre_id) x;
  end if;

  insert into visits (student_id, centre_id, method, device_id, location_check, location_distance_m)
  values (p_student, s.home_centre_id, p_method, p_device, v_check, v_dist)
  returning * into v;

  -- any visit makes the student active again (a Left student who returns is reactivated)
  if s.status <> 'active' then
    perform set_config('app.via_call_log', 'on', true);
    update students set status = 'active', paused_until = null where id = p_student;
  end if;
  update follow_up_tasks set done_at = now() where student_id = p_student and done_at is null;

  return jsonb_build_object('action', 'in', 'roll_no', s.roll_no, 'full_name', s.full_name,
    'photo_path', s.photo_path, 'at', v.check_in,
    'location_check', v.location_check, 'distance_m', v.location_distance_m);
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14 and #77: trigger functions are internal; create or replace keeps the
-- rights of setting_int, refresh_student_statuses, log_call and toggle_visit (said again here).
revoke execute on function check_setting_order(), guard_student_status(), guard_visit_update()
  from public, anon, authenticated;
revoke execute on function setting_int(text) from public, anon;
revoke execute on function refresh_student_statuses() from public, anon, authenticated;
revoke execute on function log_call(uuid, call_outcome, text, text, date) from public, anon;
revoke execute on function toggle_visit(uuid, visit_method, text, jsonb) from public, anon;

-- ---------------------------------------------------------------- descriptions
comment on function setting_int(text) is
  'A whole-number setting by key. A value that is not a whole number counts as missing; the follow-up numbers (irregular_days, inactive_days, call_due_days, retry_days, max_retries, new_joiner_weeks) then fall back to their defaults, other keys give null (docs/DECISIONS.md #108).';
comment on function check_setting_order() is
  'Constraint trigger, checked at commit: days to Irregular must be fewer than days to Inactive, however the settings are written (error irregular_after_inactive).';
comment on function refresh_student_statuses() is
  'Daily job (06:00 IST): ended pauses turn Irregular with a call task, New/Active turn Irregular after irregular_days (with a call task unless one is open), Irregular turn Inactive after inactive_days counted from the last visit or the pause end; due tasks of Inactive students are escalated (docs/DECISIONS.md #107).';
comment on function log_call(uuid, call_outcome, text, text, date) is
  'Record a follow-up call and apply its outcome. The only way to set status paused or left. Failed tries count since the last reached call or visit. Checks its inputs and raises short error codes (docs/DATABASE.md).';
comment on function guard_student_status() is
  'Trigger: app users insert students as New or Active only, and paused_until changes only through log_call (errors status_on_insert, student_field_locked); cleared when the status leaves Paused.';
comment on function guard_visit_update() is
  'Trigger: app users may correct only a visit''s check-in and check-out times, not in the future (errors visit_field_locked, visit_time_future).';
comment on function toggle_visit(uuid, visit_method, text, jsonb) is
  'Checks a student in, or out if already in. A QR scan within 30 seconds of the check-in answers already_in. Staff and kiosk only; flags a check-in by the phone''s location.';
comment on function my_role() is
  'The role of the person signed in (guru, coordinator, student, kiosk, pending), or null when signed out, without a profile, or switched off (profiles.active = false). A student login that no student record points at counts as pending (docs/DECISIONS.md #96). Security definer so row-level security policies can call it without looping through profiles. The base of is_guru() and is_staff().';
