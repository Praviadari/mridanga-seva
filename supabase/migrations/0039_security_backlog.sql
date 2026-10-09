-- 0039 Security and privacy backlog (audit 01-10-2026, dimensions 3 and 4; docs/DECISIONS.md #186-#193).
-- 1. D4-17: the "minor needs consent" refusal names the student by roll number, not by name, so a
--    child's name never lands in the server's error log.
-- 2. D2-06: a person switched off, or no longer given a class role, has their phones forgotten at
--    once (push_tokens), and the ones kept today for such people are deleted. Tokens of people who
--    still use the app are untouched; an age limit waits for the team's retention periods.
-- 3. ENT-08: the staff's student search runs as a function (POST), so the letters of a child's name
--    travel in the request body, not in the address that platform logs keep.
-- Needs 0001-0038 (it changes no 0038 object). Safe to run twice.

-- ---------------------------------------------------------------- 1. no name in the error (D4-17)
-- 0003's check, unchanged but for the detail: the roll number (set before the row is stored).
create or replace function check_minor_consent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if is_minor(new) and not exists (
       select 1 from consents
        where student_id = new.id and scope = 'data' and revoked_at is null) then
    raise exception 'minor_needs_consent'
      using detail = format('Student %s is under 18 and has no parental consent on record.', coalesce(new.roll_no, 'without roll number')),
            hint = 'Record the parent and their written consent in the same step (register_student).';
  end if;
  return null;
end $$;
revoke execute on function check_minor_consent() from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. phones of people switched off (D2-06)
-- register_push_token (0011) refuses anyone without an active class role, and the push queue sends
-- only to such people, so these tokens are never used again; they are kept no longer.
create or replace function forget_switched_off_phones() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from push_tokens where profile_id = new.id;
  return new;
end $$;
revoke execute on function forget_switched_off_phones() from public, anon, authenticated;

drop trigger if exists profiles_forget_phones on profiles;
create trigger profiles_forget_phones after update of active, role on profiles
  for each row when (not new.active or new.role::text not in ('guru', 'coordinator', 'student'))
  execute function forget_switched_off_phones();

delete from push_tokens t
 using profiles p
 where t.profile_id = p.id
   and (not p.active or p.role::text not in ('guru', 'coordinator', 'student'));

-- ---------------------------------------------------------------- 3. student search by POST (ENT-08)
-- The C5 search (src/data/attendance.ts) and the lending search (src/data/inventory.ts): students
-- whose name holds every word of p_text, in any order, or whose roll number contains the whole
-- text, by name. Runs as the caller, so row-level security decides what is found; staff only.
-- p_with_left false leaves out Left students. At most p_limit rows (1-50).
-- Error codes: not_allowed.
create or replace function search_students(p_text text, p_limit integer default 20, p_with_left boolean default true)
returns table (id uuid, full_name text, roll_no text, level_id smallint, status student_status)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_text  text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_words text[];
begin
  if not is_staff() then
    raise exception 'not_allowed';
  end if;
  if char_length(v_text) < 2 then
    return;
  end if;
  v_text := left(v_text, 100);
  -- LIKE's own signs are searched as letters.
  v_words := string_to_array(replace(replace(replace(v_text, '\', '\\'), '%', '\%'), '_', '\_'), ' ');
  return query
    select s.id, s.full_name, s.roll_no, s.level_id, s.status
      from students s
     where (p_with_left or s.status <> 'left')
       and ((select bool_and(s.full_name ilike '%' || w || '%') from unnest(v_words) w)
            or s.roll_no ilike '%' || array_to_string(v_words, ' ') || '%')
     order by s.full_name
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;
revoke execute on function search_students(text, integer, boolean) from public, anon;
grant execute on function search_students(text, integer, boolean) to authenticated;

comment on function check_minor_consent is 'Trigger at commit: a student under 18 must have a current data consent. The refusal names the roll number, never the name (0039, D4-17).';
comment on function forget_switched_off_phones is 'Trigger: deletes the push tokens of a person switched off or left without a class role (0039, D2-06).';
comment on function search_students is 'Staff search of students by every word of the name, or by roll number; called by POST so names stay out of request addresses (0039, ENT-08).';
