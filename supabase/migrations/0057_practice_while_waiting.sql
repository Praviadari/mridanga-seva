-- Mridanga Seva — 0057: practice while waiting for the desk (docs/DECISIONS.md #510-#512; docs/DATABASE.md "Practice
-- while waiting (0057)"; world-class audit 22-10-2026 fix 8). Run in the Supabase SQL editor, TEST first. Needs
-- 0001-0054 (0051's minor_signups, 0052's practice_mantras). Safe to run twice. No existing row, function or policy
-- changes: one new read-only function and three new read policies, each added beside the ones there.
--
-- A login that signed up and waits for the class desk (role pending) could open only the waiting page, About you and
-- Ishtagoshti. Now it may also read the class's practice content, nothing personal:
-- 1. the taals switched on (the taal player and metronome need no data);
-- 2. the mantras before practice switched on;
-- 3. the approved lesson videos (YouTube or the team's own file) of the first level, the Beginner lessons.
-- Who counts (practice_while_waiting()): an active login whose role is pending (my_role(): no student record, not
-- switched off, not a door tablet), that is not a public Ishtagoshti subscriber (they have their own area), AND whose
-- age is known to be 18 or over from the sign-up's date of birth, OR a child whose parent consented by email (0051).
-- A child waiting for the parent, a login with no date of birth, staff and students are not covered (staff and students
-- read these already). Under the DPDP Rules nothing more is processed about a child before the parent consents
-- (#399); reading class content records nothing about the person.
-- Nothing is written: practice minutes, plans, goals and reminders stay for students (log_practice is unchanged).

-- ---------------------------------------------------------------- 1. who counts
-- Security definer: reads person_details, minor_signups and levels past row-level security, for the caller only.
-- Returns the first level's id (lowest levels.sort) for a login that may practise while waiting, else null, so one
-- call serves both "may they" and "which lessons".
create or replace function practice_while_waiting() returns smallint
language sql stable security definer set search_path = public, pg_temp as $$
  select (select l.id from levels l order by l.sort, l.id limit 1)
   where coalesce(my_role() = 'pending', false)
     and not exists (select 1 from ig_subscribers i where i.profile_id = auth.uid())
     and (exists (select 1 from person_details d
                   where d.profile_id = auth.uid() and d.student_id is null
                     and d.dob <= today_ist() - interval '18 years')
          or exists (select 1 from minor_signups m where m.profile_id = auth.uid() and m.consented_at is not null))
$$;

-- ---------------------------------------------------------------- 2. what they read
-- New permissive policies beside the existing ones (a row is readable when any policy allows it).
drop policy if exists waiting_read on taals;
create policy waiting_read on taals for select to authenticated
  using (active and (select practice_while_waiting()) is not null);

drop policy if exists waiting_read on practice_mantras;
create policy waiting_read on practice_mantras for select to authenticated
  using (active and (select practice_while_waiting()) is not null);

-- Only lesson videos: PDFs and photos live in Storage, whose rules stay for students and staff.
drop policy if exists waiting_read on materials;
create policy waiting_read on materials for select to authenticated
  using (approved_by is not null and kind in ('youtube', 'video')
         and level_id = (select practice_while_waiting()));

-- ---------------------------------------------------------------- who may run functions
-- docs/DECISIONS.md #14: the app asks it once on the waiting page; the policies call it too.
revoke execute on function practice_while_waiting() from public, anon, authenticated;
grant execute on function practice_while_waiting() to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function practice_while_waiting() is 'Waiting page: the first level''s id when the caller is a pending login that may use the practice tools, the mantras and the Beginner lesson videos before the desk accepts them (an adult by the sign-up''s date of birth, or a child whose parent consented; not an Ishtagoshti subscriber), else null (0057, docs/DECISIONS.md #510).';
comment on policy waiting_read on taals is 'A login waiting for the desk reads the taals switched on (0057, #510).';
comment on policy waiting_read on practice_mantras is 'A login waiting for the desk reads the mantras switched on (0057, #510).';
comment on policy waiting_read on materials is 'A login waiting for the desk reads the approved lesson videos of the first level (0057, #510).';
