-- Mridanga Seva — 0037: database and performance backlog (audit brief 16, Low/Info, dimensions 1, 5
-- and 9, plus two leftovers of brief 12). Run once, after 0036, in the Supabase SQL editor (TEST
-- first). Why: docs/DECISIONS.md #168-#173. How: docs/DATABASE.md "Backlog fixes (0037)".
--
-- Behaviour for the app stays the same except where a rule was missing; every new refusal is a
-- case the app's screens never send. Old app builds keep working: the error codes they read are
-- unchanged, and toggle_visit / scan_qr's new snake_case codes are mapped by every bundle since
-- 29 Sep 2026 (app/src/data/attendance.ts lists both spellings).
--
-- 1. Row-level security calls its helpers once per query, not once per row: every policy's
--    is_staff(), is_guru(), my_role(), my_student_id(), has_class_role(), is_ig_editor(),
--    ig_reader(), today_ist() and auth.uid() is wrapped as (select ...) (D9-01, #168). Groups lose
--    their delete-for-any-staff policy (FR-10); materials compare levels by their order (FS1a-22).
-- 2. Speed: student_overview reads the last visit and "here now" through the visits index (D9-02);
--    indexes for the student lookups, the visits-today count and the policy subqueries (D9-07, #169).
-- 3. Rights: the six 0001 trigger functions are closed to signed-in people; no app role may
--    TRUNCATE, REFERENCE or put a TRIGGER on a table (D1a-11); every security definer function
--    searches public, then pg_temp (D1a-10); the internal jobs are closed to service_role (D1b-10);
--    toggle_visit and scan_qr say not_allowed / student_not_found like every other function (#170).
-- 4. Roll numbers and student fields: number 10,000 of a year no longer collides (D5-07), a number
--    given by the owner (import, restore) is kept (FS1a-18), and impossible dates, over-long names
--    and malformed emails are refused (D1b-08, FS1a-17, #171).
-- 5. Data rules (#172): a switched-off sign-up is not linked on email confirmation (D1b-09); a post
--    cannot be backdated (D5-09) or sent to a switched-off group, and only switched-on staff and
--    students with a record join groups (D5-13); "Seen by" counts a student with a switched-off
--    login as having no login (D5-10); a visit left open from an earlier day is closed at that day's
--    closing time before the next check-in (D5-18); a null in call_reasons no longer switches off
--    log_call's reason check (FS1a-15); kept attachments keep their stored size, a huge size is a
--    clean attachments_invalid (FS1b-05); tick remarks of only tabs/newlines are empty (FS1b-07);
--    look-alike group names are made the same (FS1b-08); "my calls due" counts like the Mine filter
--    (FS1b-09); materials follow their item to a new level (R2G2-02); a retirement time cannot be
--    rewritten and a YouTube link cannot hold spaces or line breaks (R2G2-04); new logins and
--    profile changes other than the language are audited (D1a-13).

-- ---------------------------------------------------------------- 1. policies: helpers once per query
-- Postgres runs a function in a policy for every row it checks. Written as (select f()) the call
-- has no link to the row, so the planner runs it once per statement (an InitPlan) and reuses the
-- answer (Supabase "RLS performance" advice; audit D9-01: 30,306 my_role() calls for one student
-- list at 200 students, 2 after). The rules themselves are unchanged: each statement below is the
-- policy's current text as Postgres prints it, with only the helper calls wrapped. Functions that
-- take a column (event_visible_to(id, ...), is_public_subscriber(id), the storage *_readable(name))
-- depend on the row and stay as they are.
alter policy "guru_read" on access_log
  using (( SELECT is_guru()));
alter policy "own_insert" on announcement_reads
  with check (((profile_id = ( SELECT auth.uid())) AND (announcement_id IN ( SELECT announcements.id
   FROM announcements))));
alter policy "own_or_staff" on announcement_reads
  using (((profile_id = ( SELECT auth.uid())) OR ( SELECT is_staff())));
alter policy "guru_delete" on announcement_replies
  using (( SELECT is_guru()));
alter policy "own_author_or_guru" on announcement_replies
  using (((profile_id = ( SELECT auth.uid())) OR ( SELECT is_guru()) OR (( SELECT is_staff()) AND (announcement_id IN ( SELECT announcements.id
   FROM announcements
  WHERE (announcements.created_by = ( SELECT auth.uid())))))));
alter policy "own_insert" on announcement_replies
  with check (((profile_id = ( SELECT auth.uid())) AND (announcement_id IN ( SELECT announcements.id
   FROM announcements))));
alter policy "audience" on announcements
  using ((( SELECT is_staff()) OR ((( SELECT my_role()) = 'student'::app_role) AND (publish_at <= now()) AND ((audience = 'all'::text) OR ((audience = 'level'::text) AND (audience_level = ( SELECT students.level_id
   FROM students
  WHERE (students.profile_id = ( SELECT auth.uid()))))) OR ((audience = 'mentees'::text) AND (created_by = ( SELECT students.mentor_id
   FROM students
  WHERE (students.profile_id = ( SELECT auth.uid()))))) OR ((audience = 'group'::text) AND (audience_group IN ( SELECT group_members.group_id
   FROM group_members
  WHERE (group_members.profile_id = ( SELECT auth.uid())))))))));
alter policy "own_delete" on announcements
  using ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))));
alter policy "own_edit" on announcements
  using ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))))
  with check ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))));
alter policy "staff_post" on announcements
  with check (( SELECT is_staff()));
alter policy "readable" on assessment_assignments
  using ((( SELECT is_staff()) OR (student_id = ( SELECT my_student_id()))));
alter policy "readable" on assessment_releases
  using ((( SELECT is_staff()) OR (id IN ( SELECT a.release_id
   FROM assessment_assignments a
  WHERE (a.student_id = ( SELECT my_student_id()))))));
alter policy "readable" on assessment_submissions
  using ((( SELECT is_staff()) OR (assignment_id IN ( SELECT a.id
   FROM assessment_assignments a
  WHERE (a.student_id = ( SELECT my_student_id()))))));
alter policy "guru_delete" on assessments
  using (( SELECT is_guru()));
alter policy "guru_insert" on assessments
  with check (( SELECT is_guru()));
alter policy "guru_update" on assessments
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "readable" on assessments
  using ((( SELECT is_guru()) OR ((( SELECT my_role()) = 'coordinator'::app_role) AND (sent_at IS NOT NULL)) OR (id IN ( SELECT a.assessment_id
   FROM assessment_assignments a
  WHERE (a.student_id = ( SELECT my_student_id()))))));
alter policy "guru_read" on call_logs
  using (( SELECT is_guru()));
alter policy "guru_write" on centres
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "read_all" on centres
  using (( SELECT has_class_role()));
alter policy "class_read" on choice_options
  using (( SELECT has_class_role()));
alter policy "guru_delete" on choice_options
  using (( SELECT is_guru()));
alter policy "guru_insert" on choice_options
  with check (( SELECT is_guru()));
alter policy "guru_update" on choice_options
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "guru_delete" on consents
  using (( SELECT is_guru()));
alter policy "guru_read" on consents
  using (( SELECT is_guru()));
alter policy "staff_insert" on consents
  with check (( SELECT is_staff()));
alter policy "staff_update" on consents
  using (( SELECT is_staff()));
alter policy "guru_write" on duty_assignments
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "staff_read" on duty_assignments
  using (( SELECT is_staff()));
alter policy "guru_write" on duty_shifts
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "staff_read" on duty_shifts
  using (( SELECT is_staff()));
alter policy "guru_read" on erasures
  using (( SELECT is_guru()));
alter policy "readable" on event_attendance
  using ((( SELECT is_staff()) OR (student_id = ( SELECT my_student_id()))));
alter policy "readable" on event_performers
  using ((( SELECT is_staff()) OR (student_id = ( SELECT my_student_id()))));
alter policy "readable" on event_rsvps
  using ((( SELECT is_staff()) OR (profile_id = ( SELECT auth.uid()))));
alter policy "own_delete" on events
  using ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))));
alter policy "own_edit" on events
  using ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))))
  with check ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))));
alter policy "readable" on events
  using ((( SELECT is_staff()) OR ((( SELECT my_role()) = 'student'::app_role) AND event_visible_to(id, ( SELECT auth.uid())))));
alter policy "staff_insert" on events
  with check (( SELECT is_staff()));
alter policy "staff_all" on follow_up_tasks
  using (( SELECT is_staff()))
  with check (( SELECT is_staff()));
alter policy "guru_insert" on fund_categories
  with check (( SELECT is_guru()));
alter policy "guru_update" on fund_categories
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "staff_read" on fund_categories
  using (( SELECT is_staff()));
alter policy "staff_read" on fund_entries
  using (( SELECT is_staff()));
alter policy "own_or_staff" on group_members
  using (((profile_id = ( SELECT auth.uid())) OR ( SELECT is_staff())));
alter policy "staff_write" on group_members
  using (( SELECT is_staff()))
  with check (( SELECT is_staff()));
alter policy "staff_or_member" on groups
  using ((( SELECT is_staff()) OR (id IN ( SELECT group_members.group_id
   FROM group_members
  WHERE (group_members.profile_id = ( SELECT auth.uid()))))));
-- FR-10: groups are switched off, never deleted (DECISIONS #28): staff add and change them; only
-- the Guru may delete one (0001's staff_write let any coordinator delete any group).
drop policy "staff_write" on groups;
create policy staff_insert on groups for insert to authenticated with check (( SELECT is_staff()));
create policy staff_update on groups for update to authenticated using (( SELECT is_staff())) with check (( SELECT is_staff()));
create policy guru_delete on groups for delete to authenticated using (( SELECT is_guru()));
alter policy "guru_delete" on guardians
  using (( SELECT is_guru()));
alter policy "guru_read" on guardians
  using (( SELECT is_guru()));
alter policy "guru_update" on guardians
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "staff_insert" on guardians
  with check (( SELECT is_staff()));
alter policy "editor_delete" on ig_daily_pins
  using (( SELECT is_ig_editor()));
alter policy "editor_insert" on ig_daily_pins
  with check (( SELECT is_ig_editor()));
alter policy "editor_update" on ig_daily_pins
  using (( SELECT is_ig_editor()))
  with check (( SELECT is_ig_editor()));
alter policy "readable" on ig_daily_pins
  using (( SELECT ig_reader()));
alter policy "own_delete" on ig_memorised
  using ((profile_id = ( SELECT auth.uid())));
alter policy "own_insert" on ig_memorised
  with check (((profile_id = ( SELECT auth.uid())) AND ( SELECT ig_reader()) AND (memorised_on = ( SELECT today_ist())) AND (EXISTS ( SELECT 1
   FROM ig_slokas s
  WHERE (s.id = ig_memorised.sloka_id)))));
alter policy "own_or_staff" on ig_memorised
  using (((profile_id = ( SELECT auth.uid())) OR ( SELECT is_guru()) OR (( SELECT is_staff()) AND (NOT is_public_subscriber(profile_id)))));
alter policy "own_delete" on ig_notes
  using ((profile_id = ( SELECT auth.uid())));
alter policy "own_insert" on ig_notes
  with check (((profile_id = ( SELECT auth.uid())) AND ( SELECT ig_reader()) AND (EXISTS ( SELECT 1
   FROM ig_slokas s
  WHERE (s.id = ig_notes.sloka_id)))));
alter policy "own_select" on ig_notes
  using ((profile_id = ( SELECT auth.uid())));
alter policy "own_update" on ig_notes
  using ((profile_id = ( SELECT auth.uid())))
  with check (((profile_id = ( SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM ig_slokas s
  WHERE (s.id = ig_notes.sloka_id)))));
alter policy "editor_delete" on ig_slokas
  using (( SELECT is_ig_editor()));
alter policy "editor_insert" on ig_slokas
  with check (( SELECT is_ig_editor()));
alter policy "editor_update" on ig_slokas
  using (( SELECT is_ig_editor()))
  with check (( SELECT is_ig_editor()));
alter policy "readable" on ig_slokas
  using (((published AND ( SELECT ig_reader())) OR ( SELECT is_ig_editor())));
alter policy "own_or_guru" on ig_subscribers
  using (((profile_id = ( SELECT auth.uid())) OR ( SELECT is_guru())));
-- unchanged: ig_theme_slokas.readable
alter policy "editor_delete" on ig_themes
  using (( SELECT is_ig_editor()));
alter policy "editor_insert" on ig_themes
  with check (( SELECT is_ig_editor()));
alter policy "editor_update" on ig_themes
  using (( SELECT is_ig_editor()))
  with check (( SELECT is_ig_editor()));
alter policy "readable" on ig_themes
  using (((published AND ( SELECT ig_reader())) OR ( SELECT is_ig_editor())));
alter policy "staff_read" on inventory_checks
  using (( SELECT is_staff()));
alter policy "guru_delete" on inventory_items
  using (( SELECT is_guru()));
alter policy "guru_insert" on inventory_items
  with check (( SELECT is_guru()));
alter policy "guru_update" on inventory_items
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "staff_or_holder" on inventory_items
  using ((( SELECT is_staff()) OR (EXISTS ( SELECT 1
   FROM inventory_loans l
  WHERE ((l.item_id = inventory_items.id) AND (l.returned_at IS NULL) AND ((l.student_id = ( SELECT my_student_id())) OR (l.profile_id = ( SELECT auth.uid()))))))));
alter policy "staff_or_own" on inventory_loans
  using ((( SELECT is_staff()) OR (student_id = ( SELECT my_student_id())) OR (profile_id = ( SELECT auth.uid()))));
alter policy "staff_read" on inventory_stocktake_items
  using (( SELECT is_staff()));
alter policy "guru_delete_open" on inventory_stocktakes
  using ((( SELECT is_guru()) AND (finished_at IS NULL)));
alter policy "staff_read" on inventory_stocktakes
  using (( SELECT is_staff()));
alter policy "guru_write" on level_history
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "own_or_staff" on level_history
  using ((( SELECT is_staff()) OR (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.profile_id = ( SELECT auth.uid()))))));
alter policy "guru_write" on levels
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "read_all" on levels
  using (( SELECT has_class_role()));
alter policy "guru_delete" on materials
  using (( SELECT is_guru()));
alter policy "guru_manage" on materials
  using (( SELECT is_guru()));
alter policy "own_suggestion_delete" on materials
  using ((( SELECT is_staff()) AND (uploaded_by = ( SELECT auth.uid())) AND (approved_by IS NULL)));
alter policy "staff_suggest" on materials
  with check ((( SELECT is_staff()) AND ((approved_by IS NULL) OR ( SELECT is_guru()))));
-- FS1a-22: a student sees materials up to their level by the levels' order (levels.sort), not by
-- comparing level ids (a level added later gets a higher id whatever its place).
alter policy "visible" on materials
  using ((( SELECT is_staff()) OR (COALESCE((( SELECT my_role()) = 'student'::app_role), false) AND (approved_by IS NOT NULL) AND ((level_id IS NULL) OR (( SELECT ml.sort
   FROM levels ml
  WHERE (ml.id = materials.level_id)) <= ( SELECT sl.sort
   FROM (students s
     JOIN levels sl ON ((sl.id = s.level_id)))
  WHERE (s.profile_id = ( SELECT auth.uid()))))))));
alter policy "own_due" on notifications
  using (((profile_id = ( SELECT auth.uid())) AND (visible_at <= now())));
alter policy "guru_read" on person_details
  using (( SELECT is_guru()));
alter policy "own_delete" on polls
  using ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))));
alter policy "own_edit" on polls
  using ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))))
  with check ((( SELECT is_staff()) AND ((created_by = ( SELECT auth.uid())) OR ( SELECT is_guru()))));
alter policy "readable" on polls
  using ((( SELECT is_staff()) OR ((( SELECT my_role()) = 'student'::app_role) AND (( SELECT auth.uid()) IN ( SELECT audience_profiles(polls.audience, polls.audience_level, polls.audience_group, polls.created_by) AS audience_profiles)))));
alter policy "staff_insert" on polls
  with check (( SELECT is_staff()));
alter policy "own_or_staff" on practice_logs
  using ((( SELECT is_staff()) OR (student_id = ( SELECT my_student_id()))));
alter policy "own_or_staff" on profiles
  using (((id = ( SELECT auth.uid())) OR ( SELECT is_guru()) OR (( SELECT is_staff()) AND (NOT is_public_subscriber(id)))));
alter policy "own_update" on profiles
  using (((id = ( SELECT auth.uid())) OR ( SELECT is_guru())));
alter policy "staff_read" on promotion_feedback
  using (( SELECT is_staff()));
alter policy "staff_read" on promotion_nominations
  using (( SELECT is_staff()));
alter policy "own_delete" on push_tokens
  using ((profile_id = ( SELECT auth.uid())));
alter policy "own_select" on push_tokens
  using ((profile_id = ( SELECT auth.uid())));
alter policy "guru_write" on settings
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "read_all" on settings
  using (( SELECT has_class_role()));
alter policy "staff_read" on status_history
  using (( SELECT is_staff()));
alter policy "own_or_staff" on student_progress
  using ((( SELECT is_staff()) OR (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.profile_id = ( SELECT auth.uid()))))));
alter policy "staff_write" on student_progress
  using (( SELECT is_staff()))
  with check (( SELECT is_staff()));
alter policy "guru_delete" on students
  using (( SELECT is_guru()));
alter policy "own_or_staff" on students
  using ((((profile_id = ( SELECT auth.uid())) AND COALESCE((( SELECT my_role()) = 'student'::app_role), false)) OR ( SELECT is_staff())));
alter policy "staff_insert" on students
  with check (( SELECT is_staff()));
alter policy "staff_update" on students
  using (( SELECT is_staff()));
alter policy "guru_write" on syllabus_items
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "read_all" on syllabus_items
  using (( SELECT has_class_role()));
alter policy "guru_delete" on taals
  using (( SELECT is_guru()));
alter policy "guru_insert" on taals
  with check (( SELECT is_guru()));
alter policy "guru_update" on taals
  using (( SELECT is_guru()))
  with check (( SELECT is_guru()));
alter policy "readable" on taals
  using ((( SELECT is_staff()) OR (active AND (( SELECT my_role()) = 'student'::app_role))));
alter policy "own_or_staff" on visits
  using ((( SELECT is_staff()) OR (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.profile_id = ( SELECT auth.uid()))))));
alter policy "staff_update" on visits
  using (( SELECT is_staff()));
alter policy "ishtagoshti audio: delete" on storage.objects
  using (((bucket_id = 'ishtagoshti-audio'::text) AND ( SELECT is_ig_editor())));

-- ---------------------------------------------------------------- 2. speed: views and indexes
-- D9-02: 0033's view aggregated every visit of every student (max and bool_or over all rows). The
-- newest check-in now comes from visits_student_time (student_id, check_in desc) and "here now"
-- from visits_one_open (one open visit per student). Same columns, same answers.
create or replace view student_overview with (security_invoker = true) as
select s.id, s.roll_no, s.full_name, s.level_id, s.status, s.paused_until, s.mentor_id,
       s.home_centre_id, s.joined_on,
       lv.last_visit_at,
       centre_today(s.home_centre_id::integer)
         - coalesce(local_day(lv.last_visit_at, s.home_centre_id::integer),
                    greatest(s.joined_on, local_day(s.created_at, s.home_centre_id::integer))) as days_since_visit,
       lv.here_now
  from students s
  left join lateral (
    select (select max(v.check_in) from visits v where v.student_id = s.id) as last_visit_at,
           exists (select 1 from visits v where v.student_id = s.id and v.check_out is null) as here_now
  ) lv on true;

-- D5-10: "no login" also counts a student whose login is switched off: announcement_audience
-- leaves switched-off logins out, so such a student was counted nowhere (they cannot open the post
-- and must be told in class).
create or replace view announcement_seen with (security_invoker = true) as
select a.id as announcement_id,
       count(aa.profile_id)::integer as addressed,
       count(aa.read_at)::integer as seen,
       case when a.audience in ('all', 'level', 'mentees') then (
         select count(*)::integer from students s
          where (s.profile_id is null
                 or not exists (select 1 from profiles p where p.id = s.profile_id and p.active))
            and s.status <> 'left'
            and (a.audience = 'all'
                 or (a.audience = 'level' and s.level_id = a.audience_level)
                 or (a.audience = 'mentees' and s.mentor_id = a.created_by)))
       else 0 end as no_login,
       (select count(*)::integer from announcement_replies r where r.announcement_id = a.id) as replies
  from announcements a
  left join announcement_audience aa on aa.announcement_id = a.id
 group by a.id;

-- D9-07: every per-student lookup the app, the daily job and erasure make, the "visits today"
-- count, and the group / read-receipt subqueries of the policies. Small tables: built in moments.
create index if not exists call_logs_student_idx       on call_logs (student_id, called_at desc);
create index if not exists consents_student_idx        on consents (student_id);
create index if not exists guardians_student_idx       on guardians (student_id);
create index if not exists follow_up_tasks_student_idx on follow_up_tasks (student_id);
create index if not exists status_history_student_idx  on status_history (student_id, changed_at desc);
create index if not exists level_history_student_idx   on level_history (student_id);
create index if not exists student_progress_item_idx   on student_progress (item_id);
create index if not exists materials_item_idx          on materials (item_id) where item_id is not null;
create index if not exists visits_check_in_idx         on visits (check_in);
create index if not exists announcement_reads_profile_idx on announcement_reads (profile_id);
create index if not exists group_members_profile_idx   on group_members (profile_id);
create index if not exists notifications_announcement_idx on notifications (announcement_id) where announcement_id is not null;

-- ---------------------------------------------------------------- 3. rights and error codes
-- Brief 12 leftover: 0001's trigger functions kept EXECUTE for signed-in people (harmless, Postgres
-- refuses a direct call, but untidy). A trigger fires whatever the rights of the person writing.
revoke execute on function assign_roll_no(), audit_row(), guard_profile_update(), guard_student_update(),
  handle_user_confirmed(), link_student_email() from public, anon, authenticated;

-- D1a-11: anon lost every table right in 0025; signed-in people still held TRUNCATE (which skips
-- row-level security), REFERENCES and TRIGGER on the 0001 tables. The app never uses them.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- D1b-10: the daily jobs and the linking helper run from pg_cron or a trigger as the owner; the
-- Edge Function (service_role) calls only claim_push_queue, finish_push, claim_expired_submission_files
-- and release_submission_files (and the old claim_due_push / release_push_claim until LIVE's
-- function is redeployed, so those two keep their grant).
revoke execute on function refresh_student_statuses(), close_open_visits(), send_due_push(),
  link_login_to_student(uuid, text) from service_role;

-- D1b-09: a sign-up the Guru switched off is not linked to a student record when its email is
-- confirmed (link_student_email, the other path, already checked p.active).
create or replace function link_login_to_student(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s_id uuid;
begin
  if p_email is null
     or not exists (select 1 from profiles where id = p_user and role = 'pending' and active)
     or exists (select 1 from students where profile_id = p_user) then
    return;
  end if;
  select id into s_id from students
   where lower(email) = lower(p_email) and profile_id is null
   order by created_at limit 1;
  if s_id is null then return; end if;
  update students set profile_id = p_user where id = s_id;
  update profiles set role = 'student' where id = p_user;
end $$;

-- Brief 12 leftover + D5-18: 0030's toggle_visit, with the error codes in snake_case like every
-- other function, and a visit left open from an earlier day (the hourly close job did not run)
-- closed at that day's closing time, as check_out_all does; this tap then checks the student in
-- (before, it checked them out with tens of hours and today's visit was missing).
create or replace function toggle_visit(p_student uuid, p_method visit_method, p_device text default null,
  p_location jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v visits; s students; v_check text; v_dist int;
begin
  if not coalesce(my_role() in ('guru', 'coordinator', 'kiosk'), false) then
    raise exception 'not_allowed';
  end if;
  select * into s from students where id = p_student;
  if not found then raise exception 'student_not_found'; end if;

  update visits ov set check_out = greatest(ov.check_in + interval '1 minute',
         (local_day(ov.check_in, ov.centre_id) + c.closes_at) at time zone c.time_zone)
    from centres c
   where ov.student_id = p_student and ov.check_out is null and c.id = ov.centre_id
     and local_day(ov.check_in, ov.centre_id) < centre_today(ov.centre_id);

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

create or replace function scan_qr(p_qr uuid, p_device text default null, p_location jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s_id uuid;
begin
  if not coalesce(my_role() in ('guru', 'coordinator', 'kiosk'), false) then
    raise exception 'not_allowed';
  end if;
  select id into s_id from students where qr_token = p_qr;
  if s_id is null then return jsonb_build_object('action', 'unknown'); end if;
  return toggle_visit(s_id, 'qr', p_device, p_location);
end $$;

-- D5-18: "In" on C5 counts only a visit opened today as "already in"; a forgotten visit from an
-- earlier day is closed by toggle_visit before the check-in.
create or replace function mark_visit(p_student uuid, p_action text, p_device text default null,
  p_location jsonb default null) returns jsonb
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

  is_in := exists (select 1 from visits v where v.student_id = p_student and v.check_out is null
                     and local_day(v.check_in, v.centre_id) >= centre_today(v.centre_id));
  if (p_action = 'in') = is_in then
    return jsonb_build_object('action', case when is_in then 'already_in' else 'already_out' end,
      'roll_no', s.roll_no, 'full_name', s.full_name);
  end if;
  return toggle_visit(p_student, 'manual', p_device, case when p_action = 'in' then p_location end);
end $$;

-- ---------------------------------------------------------------- 4. roll numbers and student fields
-- D5-07: lpad cut the 10,000th number of a year to 4 digits ('1000'), a duplicate. FS1a-18: a roll
-- number the owner gives (dashboard, an import or a restore; nobody signed in) in the MS-YYYY-NNNN
-- form is kept, and that year's counter moves up to it, so later numbers never collide with it.
create or replace function assign_roll_no() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare y int := extract(year from new.joined_on); n int;
begin
  if auth.uid() is null and new.roll_no ~ '^MS-[0-9]{4}-[0-9]{4,9}$' then
    insert into roll_counters (year, last)
    values (split_part(new.roll_no, '-', 2)::int, split_part(new.roll_no, '-', 3)::int)
    on conflict (year) do update set last = greatest(roll_counters.last, excluded.last);
    return new;
  end if;
  insert into roll_counters (year, last) values (y, 1)
  on conflict (year) do update set last = roll_counters.last + 1
  returning last into n;
  new.roll_no := format('MS-%s-%s', y, case when n < 10000 then lpad(n::text, 4, '0') else n::text end);
  return new;
end $$;

-- D1b-08, FS1a-17: values no screen can produce, checked when they are written or changed (rows
-- already stored are left alone). The roll number's year comes from joined_on, so a typo like 2099
-- or 0026 would make a permanent wrong number. Phone formats differ by screen (E.164 on sign-up,
-- Indian 10 digits on the register form), so only the length is checked here.
create or replace function guard_student_values() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.dob is not null and (tg_op = 'INSERT' or new.dob is distinct from old.dob)
     and (new.dob < date '1900-01-01' or new.dob > current_date) then
    raise exception 'dob_invalid' using detail = 'A date of birth lies between 1900 and today.';
  end if;
  if new.joined_on is not null and (tg_op = 'INSERT' or new.joined_on is distinct from old.joined_on)
     and (new.joined_on < date '1900-01-01' or new.joined_on > current_date + 1) then
    raise exception 'joined_on_invalid' using detail = 'A joining date lies between 1900 and today.';
  end if;
  if (tg_op = 'INSERT' or new.full_name is distinct from old.full_name) and char_length(new.full_name) > 120 then
    raise exception 'name_too_long' using detail = 'A name is at most 120 characters.';
  end if;
  if new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email)
     and (char_length(new.email) > 254 or new.email !~ '^[^@[:space:]]+@[^@[:space:]]+$') then
    raise exception 'email_invalid' using detail = 'An email address looks like name@example.com.';
  end if;
  if (tg_op = 'INSERT' or new.phone is distinct from old.phone) and char_length(new.phone) > 30 then
    raise exception 'phone_invalid' using detail = 'A phone number is at most 30 characters.';
  end if;
  return new;
end $$;
-- Named so it runs before students_roll_no (BEFORE triggers run in name order).
create trigger students_check_values before insert or update of dob, joined_on, full_name, email, phone
  on students for each row execute function guard_student_values();

-- ---------------------------------------------------------------- 5. data rules
-- D1a-13: new logins are audited (when and with which email a login appeared), and a profile
-- change that only switches the language is not (it copied the whole row each time).
drop trigger audit_profiles on profiles;
create trigger audit_profiles after insert or delete on profiles
  for each row execute function audit_row();
create trigger audit_profiles_update after update on profiles
  for each row when ((to_jsonb(old.*) - 'language') is distinct from (to_jsonb(new.*) - 'language'))
  execute function audit_row();

-- D5-09 + D5-13: 0010's guard_announcement, plus: an app user's new post is never dated in the
-- past (it would never be pushed and would sit low in every list), and a post goes to a group
-- only while that group is switched on.
create or replace function guard_announcement() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Trim spaces and blank lines at both ends, as the app does before sending.
  new.title := btrim(new.title, E' \t\r\n');
  new.body  := btrim(new.body, E' \t\r\n');
  if coalesce(new.title, '') = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then
    raise exception 'title_too_long' using detail = 'A title is at most 120 characters.';
  end if;
  if coalesce(new.body, '') = '' then raise exception 'body_required'; end if;
  if char_length(new.body) > 4000 then
    raise exception 'body_too_long' using detail = 'The text of an announcement is at most 4000 characters.';
  end if;

  -- The level belongs only to audience 'level', the group only to audience 'group'.
  if new.audience = 'level' then
    if new.audience_level is null then raise exception 'level_required'; end if;
  else
    new.audience_level := null;
  end if;
  if new.audience = 'group' then
    if new.audience_group is null then raise exception 'group_required'; end if;
    if auth.uid() is not null
       and (tg_op = 'INSERT' or new.audience_group is distinct from old.audience_group)
       and not exists (select 1 from groups g where g.id = new.audience_group and g.active) then
      raise exception 'group_inactive' using detail = 'The group is switched off; switch it on first.';
    end if;
  else
    new.audience_group := null;
  end if;

  -- No publish time given = publish now. A time in the future keeps it from students until then.
  new.publish_at := coalesce(new.publish_at, now());

  if tg_op = 'INSERT' then
    new.edited_at := null;
    -- An app user is always recorded as the author: "my mentees" means the author's mentees, and
    -- only the author may delete. The dashboard and seed.sql (no signed-in user) keep what they give.
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
      if new.publish_at < now() then new.publish_at := now(); end if;
    end if;
    return new;
  end if;

  -- UPDATE from here on.
  if auth.uid() is not null and (
        new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at) then
    raise exception 'announcement_frozen' using detail = 'The author and the creation time of an announcement cannot be changed.';
  end if;

  if auth.uid() is not null and new.publish_at is distinct from old.publish_at then
    if old.publish_at <= now() then
      raise exception 'already_published' using detail = 'An announcement that students can already see keeps its publish time.';
    end if;
    if new.publish_at < now() then
      new.publish_at := now();
    end if;
  end if;

  if old.publish_at <= now()
     and (new.title, new.body, new.audience, new.audience_level, new.audience_group, new.attachments)
         is distinct from (old.title, old.body, old.audience, old.audience_level, old.audience_group, old.attachments) then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;

-- D5-13: only switched-on staff, and students whose login has a record, are put in a group (a
-- pending login could read the group's name and purpose). The dashboard and seed.sql are free.
create or replace function guard_group_member() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not exists (
       select 1 from profiles p
        where p.id = new.profile_id and p.active
          and (p.role in ('guru', 'coordinator')
               or (p.role = 'student' and exists (select 1 from students s where s.profile_id = p.id)))) then
    raise exception 'member_not_allowed' using detail = 'Only switched-on staff and students with a record join a group.';
  end if;
  return new;
end $$;
create trigger group_members_guard before insert or update on group_members
  for each row execute function guard_group_member();

-- FS1b-08: a group name is compared as people read it: no-break and other wide spaces count as a
-- space, runs of spaces as one, invisible characters are dropped ("Sunday  Harinam" and
-- "Sunday Harinam" with a no-break space were three different groups).
create or replace function guard_group() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.name := regexp_replace(coalesce(new.name, ''), '[​-‍⁠﻿]', '', 'g');
  new.name := btrim(regexp_replace(translate(new.name, U&'\00A0\2007\202F\3000', '    '), '[[:space:]]+', ' ', 'g'));
  new.purpose := nullif(btrim(new.purpose, E' \t\r\n'), '');
  if coalesce(new.name, '') = '' then raise exception 'group_name_required'; end if;
  if char_length(new.name) > 60 then
    raise exception 'group_name_too_long' using detail = 'A group name is at most 60 characters.';
  end if;
  if char_length(new.purpose) > 200 then
    raise exception 'group_purpose_too_long' using detail = 'The purpose of a group is at most 200 characters.';
  end if;
  -- The person who made the group, from the login; it never changes afterwards. The dashboard
  -- and seed.sql (no signed-in user) keep what they give.
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end $$;

-- FS1b-05: a file already on the announcement keeps the size stored for it (an edit sent size 1
-- and it was stored); a size beyond any number is attachments_invalid, not a raw "bigint out of
-- range".
create or replace function guard_announcement_attachments() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_item   jsonb;
  v_path   text;
  v_name   text;
  v_kind   text;
  v_want   text;
  v_size   bigint;
  v_stored bigint;
  v_clean  jsonb := '[]';
  v_old    jsonb := case when tg_op = 'UPDATE' then coalesce(old.attachments, '[]') else '[]' end;
begin
  new.attachments := coalesce(new.attachments, '[]');
  if jsonb_typeof(new.attachments) <> 'array' then
    raise exception 'attachments_invalid' using detail = 'attachments must be a JSON list.';
  end if;
  if jsonb_array_length(new.attachments) > 3 then
    raise exception 'too_many_attachments' using detail = 'An announcement has at most 3 files.';
  end if;

  for v_item in select value from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'attachments_invalid' using detail = 'Each file is a JSON object.';
    end if;
    v_path := v_item ->> 'path';
    v_name := btrim(coalesce(v_item ->> 'name', ''), E' \t\r\n');
    v_kind := v_item ->> 'kind';
    v_size := case when jsonb_typeof(v_item -> 'size') = 'number'
                    and (v_item ->> 'size')::numeric between 1 and 5242880
                   then (v_item ->> 'size')::numeric::bigint end;
    -- Worked out first: inside IF, PL/pgSQL would read the CASE's THEN as the end of the test.
    v_want := case when v_path like '%.pdf' then 'pdf' else 'image' end;
    if not announcement_file_path_ok(v_path)
       or v_name = '' or char_length(v_name) > 120
       or v_kind is null or v_kind <> v_want
       or v_size is null or v_size < 1 or v_size > 5242880 then
      raise exception 'attachments_invalid'
        using detail = 'A file needs a proper path, a name of 1 to 120 characters, kind image or pdf, and a size up to 5 MB.';
    end if;
    if v_clean @> jsonb_build_array(jsonb_build_object('path', v_path)) then
      raise exception 'attachments_invalid' using detail = 'The same file is listed twice.';
    end if;

    if v_old @> jsonb_build_array(jsonb_build_object('path', v_path)) then
      -- A file that was already on this announcement stays as it was.
      select coalesce((e ->> 'size')::numeric::bigint, v_size) into v_size
        from jsonb_array_elements(v_old) e
       where e ->> 'path' = v_path and jsonb_typeof(e -> 'size') = 'number'
       limit 1;
      v_size := coalesce(v_size, (v_item ->> 'size')::numeric::bigint);
    elsif auth.uid() is not null then
      -- A new one must be the signed-in person's own upload, and must really be in Storage.
      if split_part(v_path, '/', 1) <> auth.uid()::text then
        raise exception 'attachment_not_yours' using detail = 'Only files you uploaded yourself can be added.';
      end if;
      select (o.metadata ->> 'size')::bigint into v_stored
        from storage.objects o
       where o.bucket_id = 'announcement-files' and o.name = v_path;
      if not found then
        raise exception 'attachment_missing' using detail = 'The file is not in Storage; upload it first.';
      end if;
      v_size := coalesce(v_stored, v_size);
    end if;

    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'path', v_path, 'name', v_name, 'kind', v_kind, 'size', v_size));
  end loop;

  new.attachments := v_clean;
  return new;
end $$;

-- FS1b-07: a remark of only tabs and line breaks is no remark (trim() removed spaces only).
create or replace function guard_student_progress() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.remark := nullif(btrim(new.remark, E' \t\r\n'), '');
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

-- FS1a-15: NOT IN over a list holding a null is never true, so one null in settings.call_reasons
-- let every reason through. NOT EXISTS ignores the null.
create or replace function log_call(p_student uuid, p_outcome call_outcome, p_reason text, p_comment text,
  p_next_date date default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
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
  if v_reason is not null and not exists (
       select 1 from (select jsonb_array_elements_text(value) as code from settings where key = 'call_reasons') r
        where r.code = v_reason) then
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

-- FS1b-09: "my calls due" on C1 counts a student when their MOST URGENT open task (escalated
-- first, then the earliest due; the same choice as C10's queue) is due and is the caller's, or the
-- caller is the mentor: the same rule as C10's Mine filter (app/src/data/follow-up.ts isMine).
create or replace function coordinator_dashboard() returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  today       date := today_ist();
  joiner_days int  := coalesce(setting_int('new_joiner_weeks'), 4) * 7;
begin
  if not is_staff() then
    raise exception 'not_allowed' using detail = 'Only coordinators and the Guru have the coordinator dashboard.';
  end if;
  return jsonb_build_object(
    -- Same as C6: every open visit, including one the nightly job failed to close.
    'here_now',         (select count(*) from visits where check_out is null),
    -- Same as C5: check-ins since the caller's midnight, including students who have left again.
    'visits_today',     (select count(*) from visits
                          where check_in >= today::timestamp at time zone my_time_zone()),
    'my_calls_due',     (select count(*)
                           from (select distinct on (t.student_id) t.assignee_id, t.due_on, t.escalated, s.mentor_id
                                   from follow_up_tasks t
                                   join students s on s.id = t.student_id
                                  where t.done_at is null
                                  order by t.student_id, t.escalated desc, t.due_on) m
                          where (m.due_on <= today or m.escalated)
                            and (m.assignee_id = auth.uid() or m.mentor_id = auth.uid())),
    'new_joiner_weeks', joiner_days / 7,
    'new_joiner_count', (select count(*) from students
                          where joined_on > today - joiner_days and status <> 'left'),
    'new_joiners',      coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', j.id, 'full_name', j.full_name, 'roll_no', j.roll_no, 'level_id', j.level_id,
               'joined_on', j.joined_on, 'visits', j.visits)
             order by j.joined_on desc, j.full_name)
        from (select s.id, s.full_name, s.roll_no, s.level_id, s.joined_on,
                     (select count(*) from visits v where v.student_id = s.id) as visits
                from students s
               where s.joined_on > today - joiner_days and s.status <> 'left'
               order by s.joined_on desc, s.full_name
               limit 50) j), '[]'::jsonb));
end $$;

-- R2G2-04: the retirement time is the database's: an item added already retired, or retired
-- again, cannot carry a made-up date (the dashboard keeps what it gives).
create or replace function guard_syllabus_item() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.title := btrim(coalesce(new.title, ''), E' \t\r\n');
  if new.title = '' then raise exception 'title_required'; end if;
  if char_length(new.title) > 120 then
    raise exception 'title_too_long' using detail = 'A syllabus item''s title is at most 120 characters.';
  end if;
  new.description := nullif(btrim(new.description, E' \t\r\n'), '');
  if char_length(new.description) > 1000 then
    raise exception 'description_too_long' using detail = 'A description is at most 1000 characters.';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.retired_at is not null then
      new.retired_at := now();
    end if;
    -- No position given = the end of the level, after the retired items too, so the unique
    -- (level, sort) never clashes.
    if new.sort is null then
      select coalesce(max(sort), 0) + 1 into new.sort from syllabus_items where level_id = new.level_id;
    end if;
    return new;
  end if;

  if new.level_id is distinct from old.level_id then
    if exists (select 1 from student_progress p where p.item_id = old.id) then
      raise exception 'item_has_ticks' using detail = 'A ticked item stays in its level. Retire it and add a new one instead.';
    end if;
    select coalesce(max(sort), 0) + 1 into new.sort from syllabus_items where level_id = new.level_id;
  end if;
  -- Retiring stamps the moment; the app may send any time. A retired item keeps its first time.
  if new.retired_at is not null and old.retired_at is null then
    new.retired_at := now();
  elsif auth.uid() is not null and new.retired_at is not null then
    new.retired_at := old.retired_at;
  end if;
  return new;
end $$;

-- R2G2-02: an item moved to another level takes its materials along (they kept the old level, so
-- students of the old level still saw them as their lesson).
create or replace function materials_follow_item() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update materials set level_id = new.level_id
   where item_id = new.id and level_id is distinct from new.level_id;
  return null;
end $$;
create trigger syllabus_items_materials_follow after update of level_id on syllabus_items
  for each row when (new.level_id is distinct from old.level_id) execute function materials_follow_item();

-- R2G2-04: no spaces or line breaks anywhere in a YouTube link (Postgres's "." matched a newline,
-- so "https://youtu.be/<id>?\n..." passed here but not in the app).
create or replace function youtube_link_ok(p_url text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_url !~ '[[:space:][:cntrl:]]'
                  and p_url ~ ('^https://(www\.|m\.)?(youtube\.com/(watch\?(.*&)?v=|shorts/|live/|embed/)|youtu\.be/)'
                               '[A-Za-z0-9_-]{11}([?&#/].*)?$'), false)
$$;

-- ---------------------------------------------------------------- search_path everywhere (D1a-10)
-- With search_path = public alone, Postgres still looks in the session's temporary schema FIRST
-- for tables, so a temporary table named like ours could stand in for it inside a security
-- definer function. pg_temp named last closes that. PostgREST cannot create temporary tables;
-- this guards any future raw-SQL path. The four helpers without any search_path get one too.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosecdef
              and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
                                and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;
alter function is_staff() set search_path = public, pg_temp;
alter function is_guru() set search_path = public, pg_temp;
alter function is_minor(students) set search_path = public, pg_temp;
alter function guard_profile_update() set search_path = public, pg_temp;

-- ---------------------------------------------------------------- who may run the new functions
revoke execute on function guard_student_values(), guard_group_member(), materials_follow_item()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function toggle_visit(uuid, visit_method, text, jsonb) is
  'Checks a student in, or out if already in. A visit left open from an earlier day is first closed at that day''s closing time. A QR scan within 30 seconds of the check-in answers already_in. Staff and kiosk only (not_allowed); student_not_found; flags a check-in by the phone''s location.';
comment on function scan_qr(uuid, text, jsonb) is
  'Finds the student by QR token and calls toggle_visit; answers unknown for a code that is not a student''s. Staff and kiosk only (not_allowed, checked before the lookup).';
comment on function assign_roll_no() is
  'Trigger: gives a new student the next roll number of their joining year (MS-YYYY-NNNN, more digits after 9999). A number the owner gives (no signed-in user) is kept and the year''s counter moves up to it.';
comment on function guard_student_values() is
  'Trigger: refuses impossible values when written or changed: dob_invalid (1900..today), joined_on_invalid (1900..tomorrow), name_too_long (120), email_invalid, phone_invalid (over 30 characters).';
comment on function guard_group_member() is
  'Trigger: an app user puts only switched-on staff and students with a record in a group (member_not_allowed).';
comment on function materials_follow_item() is
  'Trigger: when a syllabus item moves to another level, its materials move with it.';
comment on column announcement_seen.no_login is
  'Students it is meant for who have no app login, or whose login is switched off (not counting students who have left): tell them in class.';
