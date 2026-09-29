-- Mridanga Seva — 0005: student list, student profile and follow-up calls (screens C7, C8, C10, C11).
-- Run once, after 0004_attendance.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #19 and #20. How: docs/DATABASE.md "Student overview" and "Follow-up calls".
--
-- 1. student_overview: one row per student with the date of their last visit and how many days ago
--    that was. The list (C7) and the follow-up queue (C10) filter and sort by it. The app cannot
--    work it out itself without downloading every visit, because Supabase does not allow max() in
--    app queries by default.
-- 2. Reasons for a call are stored as short codes ('studies', 'health' ...) that the app translates,
--    instead of English sentences, so the Telugu and Hindi screens show them in their own language.
-- 3. log_call() checks its inputs and answers with short error codes the app can translate, and
--    refuses a reason that is not in the settings list.

-- ---------------------------------------------------------------- student_overview
-- security_invoker = true: the view reads the tables as the person asking, so the row-level
-- security of students and visits still applies (staff see everyone, a student only themselves).
-- Without it a view runs as its owner and would show every student to anyone.
create view student_overview with (security_invoker = true) as
select s.id,
       s.roll_no,
       s.full_name,
       s.level_id,
       s.status,
       s.paused_until,
       s.mentor_id,
       s.home_centre_id,
       s.joined_on,
       lv.last_visit_at,
       -- Days since the last visit, or since joining if they have never come. The daily job
       -- (refresh_student_statuses) counts the same way, so the list agrees with the status.
       today_ist() - coalesce((lv.last_visit_at at time zone 'Asia/Kolkata')::date, s.joined_on)
         as days_since_visit,
       lv.here_now
  from students s
  left join lateral (
    select max(v.check_in) as last_visit_at,
           coalesce(bool_or(v.check_out is null), false) as here_now
      from visits v
     where v.student_id = s.id
  ) lv on true;

-- Supabase gives new tables and views to anon and authenticated by default; this view is only for
-- signed-in people, and only for reading.
revoke all on student_overview from public, anon, authenticated;
grant select on student_overview to authenticated;

comment on view student_overview is 'One row per student with last visit and days since then, for the student list (C7) and follow-up queue (C10). Follows the row-level security of students and visits.';
comment on column student_overview.last_visit_at is 'Check-in time of the most recent visit; empty if the student has never come.';
comment on column student_overview.days_since_visit is 'Whole days (India time) since the last visit, or since joining when there is none.';
comment on column student_overview.here_now is 'True while the student has an open visit (checked in, not yet out).';

-- ---------------------------------------------------------------- call reasons as codes
-- The app shows each code in the chosen language (callReasons.<code> in app/src/i18n/locales).
-- A reason the Guru adds later without a translation is shown as it is written.
update settings
   set value = '["studies","work_timing","moved","health","family","lost_interest","joined_elsewhere","travel","other"]'
 where key = 'call_reasons';

-- Any call logged before this migration used the English wording; move it to the codes.
update call_logs set reason = case reason
    when 'Studies/exams'     then 'studies'
    when 'Work/timing clash' then 'work_timing'
    when 'Moved/distance'    then 'moved'
    when 'Health'            then 'health'
    when 'Family'            then 'family'
    when 'Lost interest'     then 'lost_interest'
    when 'Joined elsewhere'  then 'joined_elsewhere'
    when 'Travel'            then 'travel'
    when 'Other'             then 'other'
    else reason end
 where reason is not null;

-- ---------------------------------------------------------------- log_call
-- Same inputs, result and outcomes as in 0001 (docs/DATABASE.md "Follow-up calls"); what is new is
-- that every input is checked first, with an error code the app turns into a message:
--   not_allowed         caller is not a coordinator or the Guru
--   student_not_found   no such student
--   outcome_required    no outcome given
--   comment_required    the comment is empty (a call without a note tells the next person nothing)
--   reason_required     outcome needs a reason (all except not_reachable)
--   reason_unknown      reason is not in settings.call_reasons
--   next_date_required  'returning' needs the expected date, 'paused' the pause-until date
--   next_date_past      that date is before today
-- Still the ONLY way a status becomes paused or left (docs/DECISIONS.md #4).
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
    -- Failed tries since the last call that got through, this one included.
    select count(*) into tries from call_logs
     where student_id = p_student and outcome = 'not_reachable'
       and called_at > coalesce((select max(called_at) from call_logs
                                  where student_id = p_student and outcome <> 'not_reachable'),
                                '-infinity');
    insert into follow_up_tasks (student_id, assignee_id, kind, due_on, attempt, escalated)
    values (p_student, s.mentor_id, 'retry', today_ist() + setting_int('retry_days'),
            tries + 1, tries >= setting_int('max_retries'));
  end if;
  return c_id;
end $$;

-- docs/DECISIONS.md #14: signed-in people only; the function checks the role inside.
revoke execute on function log_call(uuid, call_outcome, text, text, date) from public, anon, authenticated;
grant execute on function log_call(uuid, call_outcome, text, text, date) to authenticated;

comment on function log_call is 'Record a follow-up call and apply its outcome. The only way to set status paused or left. Checks its inputs and raises short error codes (docs/DATABASE.md).';
comment on column call_logs.reason is 'Code from settings.call_reasons (studies, health ...), translated by the app. Empty only for not_reachable.';
comment on column call_logs.next_date is 'returning: the date the student said they would come; paused: the pause-until date. Empty for other outcomes.';
