-- Mridanga Seva — 0029: descriptions for eight database functions that had none.
-- Run once, in number order, in the Supabase SQL editor (TEST first). It only adds COMMENT ON
-- descriptions: no table, rule, function body or permission changes, so it is safe to run before
-- or after 0028 and to run again.
-- Why: a comment audit of 6 Oct 2026 found these were the only functions with no description and
-- no comment above them (docs/DATABASE.md "Changing the database": every function is described).
-- The descriptions show in the Supabase dashboard (Database → Functions).

comment on function setting_int(text) is
  'Reads a whole-number setting by key from settings (for example irregular_days). Returns null when the key is missing. Settings are edited on G10.';

comment on function today_ist() is
  'Today''s date in India (Asia/Kolkata). Use it, not current_date, for every "today" rule: the database clock runs on UTC, so between midnight and 05:30 IST current_date is still yesterday.';

comment on function my_role() is
  'The role of the person signed in (guru, coordinator, student, kiosk, pending), or null when signed out or when their login is switched off (profiles.active = false). Security definer so that row-level security policies can call it without reading profiles through their own policies (which would loop). The base of is_guru() and is_staff().';

comment on function is_guru() is
  'True when the person signed in is the Guru (Facilitator) with an active login. Used in row-level security policies and in functions that only the Guru may run.';

comment on function is_staff() is
  'True when the person signed in is the Guru or a coordinator with an active login. Used in row-level security policies for what staff may see and change.';

comment on function is_minor(students) is
  'True when the student is under 18 on today''s date in India (today_ist). Decides when a parent''s consent is required (docs/DECISIONS.md #16). Unknown date of birth = not a minor here; registration requires the date of birth.';

comment on function audit_row() is
  'Trigger: writes one audit_log row for each insert, update or delete on the table it is attached to: table, row id, action, who (auth.uid(), null for the system or the dashboard) and the row before and after. Security definer so it can write audit_log, which app users cannot. Read on G11.';

comment on function release_submission_files(bigint[]) is
  'Service role only: undoes claim_expired_submission_files for the given submissions (file_removed_at back to null) when the Edge Function could not delete their files from Storage, so they are tried again later.';
