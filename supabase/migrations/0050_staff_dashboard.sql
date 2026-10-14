-- 0050 "Today" and "Waiting for you" on the staff homes in one request (audit phase 5 of 13-10-2026:
-- U1-01, U1-08, U4-01; docs/DECISIONS.md #340; docs/DATABASE.md "Staff home: today and waiting (0050)").
-- PLACEHOLDER NUMBER: branch after-launch-design; the lead renumbers it at the merge.
-- staff_dashboard(): what the coordinator and Guru homes show above their circles. Counts only,
-- read-only, security invoker (row-level security of the person asking, like coordinator_dashboard):
-- here now and visits today (as C6 / C5), students who came this week, sign-ups waiting at the desk
-- (as Register a student: waiting_sign_ups), calls due (a coordinator's: my_calls_due as C1; the
-- Guru's: overdue or escalated per person, as G1's Follow-ups circle), promotions waiting (a
-- coordinator: feedback asked of me; the Guru: nominations to decide, as promotion_home), recordings
-- to review (assessment assignments sent and not yet reviewed), fund entries waiting for my decision
-- (never my own; the Guru, or a treasurer for the Guru's), material suggestions waiting (the Guru).
-- Each count follows the rule of the screen it opens, so the number on the home is the number there.
-- Needs 0001-0048. Safe to run twice. Nothing else changes.

create or replace function staff_dashboard() returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  today date := today_ist();
  guru  boolean := is_guru();
  promo jsonb;
begin
  if not is_staff() then
    raise exception 'not_allowed' using detail = 'Only coordinators and the Guru have the staff dashboard.';
  end if;
  promo := promotion_home();
  return jsonb_build_object(
    'role',             case when guru then 'guru' else 'coordinator' end,
    -- Same as C6: every open visit, including one the nightly job failed to close.
    'here_now',         (select count(*) from visits where check_out is null),
    -- Same as C5: check-ins since the caller's midnight.
    'visits_today',     (select count(*) from visits
                          where check_in >= today::timestamp at time zone my_time_zone()),
    -- Same as the Guru's Overview: students who came at least once this week, each once.
    'came_this_week',   (select count(distinct student_id) from visits
                          where check_in >= week_start_ist()::timestamp at time zone my_time_zone()),
    -- Same list as Register a student (C2): confirmed sign-ups of my centre (the Guru: all) to accept.
    'signups_waiting',  coalesce(jsonb_array_length(waiting_sign_ups()), 0),
    'calls_due',        case when guru then
                          -- G1 (guru_dashboard follow_ups, summed as the Follow-ups circle does).
                          (select coalesce(sum(x.n), 0) from (
                             select count(distinct t.student_id) filter (where not t.escalated)
                                  + count(distinct t.student_id) filter (where t.escalated) as n
                               from follow_up_tasks t
                              where t.done_at is null and (t.escalated or t.due_on < today)
                              group by t.assignee_id) x)
                        else
                          -- C1 (0037 FS1b-09): by each student's most urgent open task, mine or my mentee's.
                          (select count(*)
                             from (select distinct on (t.student_id) t.assignee_id, t.due_on, t.escalated, s.mentor_id
                                     from follow_up_tasks t
                                     join students s on s.id = t.student_id
                                    where t.done_at is null
                                    order by t.student_id, t.escalated desc, t.due_on) m
                            where (m.due_on <= today or m.escalated)
                              and (m.assignee_id = auth.uid() or m.mentor_id = auth.uid()))
                        end,
    'promotions',       case when guru then coalesce((promo->>'to_decide')::int, 0)
                        else coalesce((promo->>'to_answer')::int, 0) end,
    -- Recordings sent and not yet reviewed (staff read every assignment).
    'to_review',        (select count(*) from assessment_assignments where status = 'submitted'),
    -- Waiting fund entries I may decide (app/src/data/fund.ts canDecide); others read no entries.
    'fund_to_approve',  (select count(*) from fund_entries e
                           join profiles m on m.id = e.created_by
                          where e.status = 'waiting' and e.created_by <> auth.uid()
                            and (guru or (is_treasurer() and m.role = 'guru'))),
    -- The Guru decides suggestions; a coordinator's own waiting ones wait for the Guru, not for them.
    'suggestions',      case when guru then
                          (select count(*) from materials where approved_by is null and decided_at is null)
                        else 0 end);
end $$;

revoke execute on function staff_dashboard() from public, anon;
grant execute on function staff_dashboard() to authenticated;

comment on function staff_dashboard is 'C1/G1 staff homes: today (here now, visits today, came this week) and what waits for the caller (sign-ups, calls due, promotions, recordings to review, fund entries to approve, suggestions), as one JSON object. Staff only; security invoker (#340).';
