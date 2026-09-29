-- Mridanga Seva — 0004: marking attendance by tapping a name, and "check out all" at closing.
-- Run once, after 0003_register_student.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #18. How: docs/DATABASE.md "Attendance".
--
-- 1. mark_visit(): the coordinator's attendance screens (C5, C6) call this when a name is tapped.
--    The tap says what the coordinator wants, 'in' or 'out'. If the student is already in that
--    state (another phone marked them a moment ago), nothing changes. toggle_visit() alone would
--    do the opposite of what the button said, because a list on a phone can be out of date.
--    Scanning a QR code still uses scan_qr() / toggle_visit(): a scan has no button to go stale.
-- 2. check_out_all(): the "Check out all" button on C6, used when the class closes. One call
--    closes every open visit, instead of one toggle per student from the phone, which would
--    check a student back IN if someone else had checked them out in between.

-- ---------------------------------------------------------------- mark_visit
-- Checks a student in (p_action = 'in') or out ('out'), by a coordinator or the Guru.
-- Returns what toggle_visit() returns ({ action: 'in' | 'out', full_name, roll_no, at, ... }),
-- or { action: 'already_in' | 'already_out', full_name, roll_no } when nothing had to change.
-- Runs as the caller (not security definer), so row-level security applies; the check-in
-- itself is done by toggle_visit(), so its rules (student becomes active, follow-up tasks
-- close) live in one place only.
-- Errors are short codes the app translates: not_allowed, bad_action, student_not_found.
create or replace function mark_visit(p_student uuid, p_action text, p_device text default null)
returns jsonb
language plpgsql set search_path = public as $$
declare s students; is_in boolean;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  if coalesce(p_action, '') not in ('in', 'out') then
    raise exception 'bad_action' using detail = 'p_action must be ''in'' or ''out''.';
  end if;
  -- Lock the student's row until this call ends, so two phones marking the same student at the
  -- same moment are handled one after the other and the second sees the first one's change.
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;

  is_in := exists (select 1 from visits where student_id = p_student and check_out is null);
  if (p_action = 'in') = is_in then
    return jsonb_build_object('action', case when is_in then 'already_in' else 'already_out' end,
      'roll_no', s.roll_no, 'full_name', s.full_name);
  end if;
  return toggle_visit(p_student, 'manual', p_device);
end $$;

-- ---------------------------------------------------------------- check_out_all
-- Closes every open visit, at one centre (p_centre) or at all centres (null, the default).
-- A visit that started today ends now. A visit left open from an earlier day (the nightly job
-- close_open_visits did not run) ends at that day's closing time, as the nightly job would have
-- done, so the hours in reports are not stretched overnight.
-- Returns how many visits were closed. Coordinators and the Guru only (error not_allowed).
-- Runs as the caller, so row-level security applies (staff may update visits).
create or replace function check_out_all(p_centre smallint default null)
returns int
language plpgsql set search_path = public as $$
declare closed int;
begin
  if not is_staff() then raise exception 'not_allowed'; end if;
  update visits v
     set check_out = case
           when (v.check_in at time zone 'Asia/Kolkata')::date = today_ist()
             -- "+ 1 second" keeps check_out after check_in for someone checked in this instant.
             then greatest(now(), v.check_in + interval '1 second')
           else greatest(v.check_in + interval '1 minute',
                  ((v.check_in at time zone 'Asia/Kolkata')::date + c.closes_at) at time zone 'Asia/Kolkata')
         end
    from centres c
   where c.id = v.centre_id
     and v.check_out is null
     and (p_centre is null or v.centre_id = p_centre);
  get diagnostics closed = row_count;
  return closed;
end $$;

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: take the right away from everyone, then give it back only to signed-in
-- people. Both functions check inside that the caller is a coordinator or the Guru.
revoke execute on function mark_visit(uuid, text, text), check_out_all(smallint)
  from public, anon, authenticated;
grant execute on function mark_visit(uuid, text, text), check_out_all(smallint)
  to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function mark_visit is 'Tap-to-mark attendance: check a student in or out as asked; does nothing if they already are. Coordinators and Guru only.';
comment on function check_out_all is 'Closing time: close every open visit (today''s at now, older ones at that day''s closing time). Returns the number closed. Coordinators and Guru only.';
