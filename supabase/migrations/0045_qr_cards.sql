-- 0045 Printed QR cards (Phase 3 P3-1, docs/phase3/WORK_PLAN.md; docs/DECISIONS.md #249-#252).
-- A student without a phone gets a printed card carrying the same code as My QR (MS1:<qr_token>, #17),
-- so C5 needs no change to read it. A lost card is "revoked" by giving the student a new qr_token:
-- the old card (and any photo of it, or of the old My QR screen) then scans as "Code not recognised",
-- and My QR on the student's phone, if they have one, shows the new code the next time it is online
-- (#21). qr_token stays frozen for app users (0025); only this function changes it.
-- 1. reissue_qr_code(student): the Guru only (not_allowed otherwise); student_not_found; a withdrawn
--    record stays frozen (student_withdrawn). The change is in the audit log (audit_students).
-- Needs 0001-0044. Safe to run twice.

create or replace function reissue_qr_code(p_student uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s students;
begin
  if not coalesce(is_guru(), false) then raise exception 'not_allowed'; end if;
  select * into s from students where id = p_student for update;
  if not found then raise exception 'student_not_found'; end if;
  if s.withdrawn_at is not null then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: the record is frozen.';
  end if;
  update students set qr_token = gen_random_uuid() where id = p_student;
end $$;

revoke execute on function reissue_qr_code(uuid) from public, anon;
grant execute on function reissue_qr_code(uuid) to authenticated;

comment on function reissue_qr_code(uuid) is
  'The Guru gives a student a new qr_token (a lost printed QR card, P3-1): the old card and old My QR codes stop scanning. Refuses a withdrawn record.';
