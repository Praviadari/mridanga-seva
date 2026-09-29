-- Mridanga Seva — 0006: ticking syllabus items for a student (screen C9 Syllabus tick-off).
-- Run once, after 0005_students_follow_up.sql, in the Supabase SQL editor.
-- Why: docs/DECISIONS.md #22. How: docs/DATABASE.md "Syllabus progress".
--
-- The app writes student_progress directly (insert = tick, update = change the remark, delete =
-- untick); row-level security from 0001 already lets only coordinators and the Guru do that.
-- This migration adds the rules that must hold however a row is written:
-- 1. A tick records the person who really ticked it, not whoever the app says, and cannot be
--    dated in the future. After that only the remark can change; to fix the date, untick and tick.
-- 2. The remark is trimmed, empty becomes null, and it is at most 500 characters.
-- 3. Every tick, remark change and untick is copied to audit_log. Promotion (Phase 2) will rest on
--    these ticks, so an untick must never erase who ticked the item and when.

-- ---------------------------------------------------------------- guard
-- Error codes (the app turns them into messages, src/data/syllabus.ts):
--   done_on_future    the tick is dated after today (India time)
--   progress_frozen   an app user tried to change the student, the item, the date or who ticked it
--   remark_too_long   the remark is longer than 500 characters
-- Security invoker: it only checks and adjusts the row being written.
create or replace function guard_student_progress() returns trigger
language plpgsql set search_path = public as $$
begin
  new.remark := nullif(trim(new.remark), '');
  if char_length(new.remark) > 500 then
    raise exception 'remark_too_long' using detail = 'A remark is at most 500 characters.';
  end if;

  if tg_op = 'INSERT' then
    -- An app user is always recorded as the person who ticked. The dashboard and seed.sql run
    -- with no signed-in user (auth.uid() is null) and keep what they wrote.
    if auth.uid() is not null then
      new.ticked_by := auth.uid();
    end if;
    if new.done_on > today_ist() then
      raise exception 'done_on_future' using detail = 'A syllabus item cannot be ticked for a day that has not come yet.';
    end if;
  elsif auth.uid() is not null and (
        new.student_id is distinct from old.student_id
     or new.item_id    is distinct from old.item_id
     or new.done_on    is distinct from old.done_on
     or new.ticked_by  is distinct from old.ticked_by) then
    raise exception 'progress_frozen' using detail = 'Only the remark of a tick can be changed. Untick and tick again instead.';
  end if;
  return new;
end $$;

create trigger student_progress_guard before insert or update on student_progress
  for each row execute function guard_student_progress();

-- ---------------------------------------------------------------- audit
-- audit_row() from 0001 keys the log on an `id` column, which student_progress does not have
-- (its key is student + item), so this table gets its own small audit function.
-- Security definer: audit_log has no insert policy, so only the table owner can write to it.
create or replace function audit_student_progress() returns trigger
language plpgsql security definer set search_path = public as $$
declare r student_progress := coalesce(new, old);
begin
  insert into audit_log (table_name, row_id, action, changed_by, old_row, new_row)
  values (tg_table_name, format('%s/%s', r.student_id, r.item_id), tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return r;
end $$;

create trigger audit_student_progress after insert or update or delete on student_progress
  for each row execute function audit_student_progress();

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: trigger functions are internal; no app role may call them directly.
-- (Postgres does not check EXECUTE when a trigger fires, so the triggers still run.)
revoke execute on function guard_student_progress(), audit_student_progress()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function guard_student_progress is 'Trigger: a syllabus tick records the person who ticked it, cannot be dated in the future, and afterwards only its remark can change (docs/DECISIONS.md #22).';
comment on function audit_student_progress is 'Trigger: copies every tick, remark change and untick of student_progress to audit_log (row_id = student/item).';
comment on column student_progress.done_on is 'Day the student showed the item in class (India time). Never in the future.';
comment on column student_progress.ticked_by is 'Coordinator or Guru who ticked the item. Set by the database from the login, not by the app.';
comment on table audit_log is 'Who changed students, profiles, call logs, levels or syllabus ticks, and when. Guru only.';
comment on column student_progress.remark is 'Optional note by the coordinator, e.g. "needs a steadier tempo". At most 500 characters.';
