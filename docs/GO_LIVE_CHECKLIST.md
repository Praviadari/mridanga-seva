# LIVE go-live checklist (audit brief 8)

The ordered steps that take the live Supabase project `qeozvvizcojzxcjgnaei` from where it stands
(migrations 0001-0011, Praveen's login, no class data) to the pilot: every later migration, push
notifications, real sign-up and reset emails, and the live web site. Written 10 Oct 2026 against
main `bcdb2bb` ([DECISIONS.md #232-#234](DECISIONS.md)); updated 15 Oct 2026 for the launch run
(main `fd49d25`: audit phase 3 S4-09/S4-10/S4-11, phase 5 R5-02). Linked from
[OPERATIONS.md "LIVE go-live (brief 8)"](OPERATIONS.md#live-go-live-brief-8).

**Who.** *Praveen · dashboard* = Praveen in the Supabase, Brevo or Cloudflare dashboard.
*Praveen · terminal* = Praveen in a terminal on his own PC, in the main folder
`C:\Users\praveen.a\Mridanga_Seva_App`. *Guru · Zoho* = the Guru, who holds the domain. Claude
never runs anything on LIVE: the Supabase CLI on Praveen's PC is logged in, so a deploy command
from any chat really deploys.

**⏳ DOMAIN** marks a step that waits on the domain move (the Guru's Zoho nameservers → Cloudflare,
then Zoho Mail's records in Cloudflare; NOTES_lead.md 07-10-2026). Everything else can be done
before it: the pilot can start on `https://mridanga-seva.pages.dev` and move to
`https://app.mridangaseva.com` later (part E).

**Order on the day:** A → B → C → D1, D3-D6c → E0-E2 (the same day as B, for 0034) → D7-D9 → F → G.
The Auth settings (D5-D6c) come **before** the live web site goes up (E1), so no one can sign up while
Confirm email, the redirect addresses or the providers are still unchecked (audit S4-10). The ⏳ DOMAIN
steps (D2, E3-E6) follow whenever the domain is on Cloudflare; E7 follows the production APK.

**The rules for the whole day.**

- Before every paste into a SQL editor, look at the project name at the top of the dashboard and
  `qeozvvizcojzxcjgnaei` in the address bar. TEST (`fhuqykssenuhczdqbafu`) looks the same.
- A step whose result differs from "Expected": **stop there**. A failed migration changes nothing
  (the SQL editor runs a paste as one transaction), so LIVE stays at the last good file. Do not
  edit SQL on LIVE to get past an error; bring the error to a chat, fix it on a branch, prove it
  with `npm test` in `supabase/tests`, and continue from the same file.
- Copy every migration from GitHub **main** (the file → **Copy raw file**), not from a branch or a
  chat, at the commit the replay passed on (A3).
- Never hand-confirm or Auto-Confirm an address on a student record without checking identity in
  person (part D).

## A. Before anything changes

| # | Who | Do | Expected | If it differs |
|---|---|---|---|---|
| A1 | Praveen · dashboard | Supabase → LIVE → SQL Editor → New query: paste the **probe** (below), Run | `LAST IN ORDER` = `0011`, `MISSING` = `none`, every row after 0011 `no` | Another number: LIVE already has later files. Start part B at the next file after it. `MISSING` not `none`: a file was skipped once; stop and bring the output to a chat |
| A2 | Praveen · terminal | **Backup** of LIVE, exactly as [OPERATIONS.md "Backups"](OPERATIONS.md#backups) "Each backup" (three `pg_dump` files, row counts, 7-Zip, log line with note `before go-live`) | A `.7z` that opens, a line in `backup-log.csv` | No computer can run `pg_dump` (the office PC cannot, 7 Oct 2026): **the go-live waits** — except on the 15 Oct 2026 run, see "A2 waiver" below. A backup is the only way back from a bad migration |
| A3 | Praveen · terminal | In the main folder: `git pull`, then `cd supabase\tests`, `npm ci`, `npm test` | Ends with `Replay passed: LIVE can take the go-live migrations in this order.` and `All checks passed` | A failure names the file. Nothing goes to LIVE until it passes on main |
| A4 | Praveen · dashboard | LIVE → SQL Editor: paste the **drift query** ([OPERATIONS.md "Releasing a change"](OPERATIONS.md#releasing-a-change-database-first)), Run, **Download CSV** as `drift-live-before-<date>.csv` | About 300 rows | Keep the file with the backup log; it is the "before" picture |
| A5 | Praveen | Pick a time with no class and two free hours. 0034 needs the live web site the same day (B, step M0034) | | |
| A6 | Praveen · dashboard | **Owner accounts.** supabase.com → your avatar → **Account preferences → Security**: multi-factor authentication **on** (authenticator app). Then the organisation → **Team**: every member listed is someone the team named, and each Owner has MFA on | MFA on for every Owner; no unknown member | Turn MFA on before going further: an Owner login can read and change everything on LIVE (audit S4-10, brief 1b) |

**A2 waiver (15 Oct 2026 run only, lead's decision 12 Oct 2026, audit S4-09).** LIVE holds no class
data yet, so the first run may go ahead without the A2 backup. Before part B, paste the **row-count
SQL** (part F) on LIVE: the waiver holds only if `students`, `visits`, `guardians` and `consents` are
`0` and `(auth.users)` counts only the team's own logins (Praveen / the Guru). Any class row: stop,
the go-live waits for A2. Write `waived: LIVE empty (row counts <date>)` in the G-table's backup row.
The first real backup and a restore drill on TEST follow on the home network on Sun 18 / Mon 19 Oct,
and **every later LIVE migration (0049 on) needs A2 done**, because from Friday LIVE holds sign-ups.

<!-- replay: probe -->
```sql
-- Which migrations has this project run? READ-ONLY. One row per migration from 0010, each found by an
-- object that only that file makes, then LAST IN ORDER and MISSING (a file skipped before a later one).
-- 0012 and 0041 were never used on main, so they have no row.
with m(migration, present) as (values
  ('0010', exists (select 1 from pg_proc where proname = 'announcement_file_path_ok' and pronamespace = 'public'::regnamespace)),
  ('0011', to_regclass('public.push_tokens') is not null),
  ('0013', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'syllabus_items' and column_name = 'retired_at')),
  ('0014', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'duty_hours')),
  ('0015', to_regclass('public.notifications') is not null),
  ('0016', to_regclass('public.assessments') is not null),
  ('0017', to_regclass('public.promotion_nominations') is not null),
  ('0018', to_regclass('public.practice_logs') is not null),
  ('0019', exists (select 1 from pg_proc where proname = 'inbox_on_push_outbox' and pronamespace = 'public'::regnamespace)),
  ('0020', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'panes')),
  ('0021', to_regclass('public.ig_slokas') is not null),
  ('0022', to_regclass('public.events') is not null),
  ('0023', to_regclass('public.inventory_items') is not null),
  ('0024', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visits' and column_name = 'location_check')),
  ('0025', to_regclass('public.erasures') is not null),
  ('0026', to_regclass('public.fund_entries') is not null),
  ('0027', to_regclass('public.ig_subscribers') is not null),
  ('0028', exists (select 1 from pg_proc where proname = 'release_old_student_login' and pronamespace = 'public'::regnamespace)),
  ('0029', obj_description(to_regprocedure('public.setting_int(text)'), 'pg_proc') is not null),
  ('0030', exists (select 1 from pg_proc where proname = 'check_setting_order' and pronamespace = 'public'::regnamespace)),
  ('0031', to_regclass('public.push_queue') is not null),
  ('0032', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'request_id')),
  ('0033', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'centres' and column_name = 'time_zone')),
  ('0034', to_regclass('public.access_log') is not null),
  ('0035', to_regclass('public.inventory_stocktakes') is not null),
  ('0036', to_regclass('public.choice_options') is not null),
  ('0037', exists (select 1 from pg_proc where proname = 'guard_student_values' and pronamespace = 'public'::regnamespace)),
  ('0038', exists (select 1 from pg_proc where proname = 'guard_call_log_date' and pronamespace = 'public'::regnamespace)),
  ('0039', exists (select 1 from pg_proc where proname = 'search_students' and pronamespace = 'public'::regnamespace)),
  ('0040', exists (select 1 from pg_proc where proname = 'anonymise_staff' and pronamespace = 'public'::regnamespace)),
  ('0042', coalesce((select attnotnull from pg_attribute where attrelid = to_regclass('public.students') and attname = 'roll_no'), false)),
  ('0043', to_regclass('public.parent_notices') is not null),
  ('0044', exists (select 1 from settings where key = 'parent_notices_no_checkout')),
  ('0045', exists (select 1 from pg_proc where proname = 'reissue_qr_code' and pronamespace = 'public'::regnamespace)),
  ('0046', exists (select 1 from pg_proc where proname = 'accept_sign_up' and pronamespace = 'public'::regnamespace)),
  ('0047', exists (select 1 from pg_proc where proname = 'clean_person_name' and pronamespace = 'public'::regnamespace)),
  ('0048', exists (select 1 from pg_proc where proname = 'in_audience' and pronamespace = 'public'::regnamespace)),
  ('0049', exists (select 1 from pg_proc where proname = 'erase_login' and pronamespace = 'public'::regnamespace)),
  ('0050', exists (select 1 from pg_proc where proname = 'staff_dashboard' and pronamespace = 'public'::regnamespace)),
  ('0051', to_regclass('public.minor_signups') is not null),
  ('0052', to_regclass('public.practice_plans') is not null),
  ('0053', exists (select 1 from pg_proc where proname = 'link_staff_record' and pronamespace = 'public'::regnamespace)),
  ('0054', exists (select 1 from pg_proc where proname = 'undo_import' and pronamespace = 'public'::regnamespace)),
  ('0055', to_regclass('public.practice_links') is not null),
  ('0057', exists (select 1 from pg_proc where proname = 'practice_while_waiting' and pronamespace = 'public'::regnamespace)),
  ('0058', to_regclass('public.parent_digests') is not null),
  ('0059', to_regclass('public.data_requests') is not null)
)
select migration, case when present then 'yes' else 'no' end as present from m
union all
select 'LAST IN ORDER', coalesce((select max(a.migration) from m a
  where a.present and not exists (select 1 from m b where b.migration <= a.migration and not b.present)), 'before 0010')
union all
select 'MISSING', coalesce((select string_agg(a.migration, ' ' order by a.migration) from m a
  where not a.present and exists (select 1 from m b where b.present and b.migration > a.migration)), 'none')
order by 1;
```

## B. Migrations 0013-0059, one file per run

For each row: GitHub main → `supabase/migrations/<file>` → **Copy raw file** → LIVE → SQL Editor →
New query → paste → check the project → **Run** → then paste the probe again (or keep it in a second
tab) and Run: `LAST IN ORDER` must name the file just run. *Success. No rows returned.* is the normal
answer; a file with a top-level `cron.schedule` may show a one-column table `schedule` instead, which
also means it worked (OPERATIONS setup step 2.3).

**0012 and 0041 do not exist.** 0012 was Phase 2's branch number (that file is 0016 on main); 0041
was skipped. Do not look for them.

**Every file ran a second time in the replay** (`npm run replay`, A3): those marked "Run once" in their
header are refused as a whole on a second paste, which changes nothing; the others change nothing on
a second paste. So pasting a file twice by mistake is harmless; still, never do it on purpose.

| Step | File | Who | Expected after Run | Notes, and if it differs |
|---|---|---|---|---|
| M0013 | `0013_syllabus_materials.sql` | Praveen · dashboard | No rows; probe `0013` | |
| M0014 | `0014_guru_admin.sql` | Praveen · dashboard | No rows; probe `0014` | |
| M0015 | `0015_inbox_reports_centres.sql` | Praveen · dashboard | `schedule` table, one row; probe `0015` | Adds the job `mridanga-inbox-cleanup` |
| M0016 | `0016_assessments.sql` | Praveen · dashboard | `schedule` table, one row; probe `0016` | Phase 2 (0012 on its branch). Adds `mridanga-assessments` |
| M0017 | `0017_promotion.sql` | Praveen · dashboard | No rows; probe `0017` | |
| M0018 | `0018_practice.sql` | Praveen · dashboard | No rows; probe `0018` | |
| M0019 | `0019_phase2_inbox.sql` | Praveen · dashboard | No rows; probe `0019` | |
| M0020 | `0020_media.sql` | Praveen · dashboard | No rows; probe `0020` | |
| M0021 | `0021_ishtagoshti.sql` | Praveen · dashboard | No rows; probe `0021` | |
| M0022 | `0022_events_polls.sql` | Praveen · dashboard | `schedule` table, one row; probe `0022` | Adds `mridanga-events-polls` |
| M0023 | `0023_team_tools.sql` | Praveen · dashboard | `schedule` table, one row; probe `0023` | Adds `mridanga-duty` |
| M0024 | `0024_attendance_location.sql` | Praveen · dashboard | No rows; probe `0024` | |
| M0025 | `0025_security_round.sql` | Praveen · dashboard | No rows; probe `0025` | |
| M0026 | `0026_fund.sql` | Praveen · dashboard | No rows; probe `0026` | |
| M0027 | `0027_ishtagoshti_public.sql` | Praveen · dashboard | No rows; probe `0027` | |
| M0028 | `0028_security_round_2.sql` | Praveen · dashboard | No rows; probe `0028` | |
| M0029 | `0029_function_comments.sql` | Praveen · dashboard | No rows; probe `0029` | Comments only |
| M0030 | `0030_round10_rules.sql` | Praveen · dashboard | No rows; probe `0030` | |
| M0031 | `0031_push_fixes.sql` | Praveen · dashboard | No rows; probe `0031` | **The corrected version** (main since `7573c4b`, 6 Oct 2026). Before Run, Ctrl+F `update push_status` in the editor: both lines end in `where id;`. Without it Supabase's safeupdate refuses the push job's updates and phones get a notice three times (happened on TEST). The old Edge Function keeps working until C4 |
| M0032 | `0032_auth_fixes.sql` | Praveen · dashboard | No rows; probe `0032` | |
| M0033 | `0033_time_zones.sql` | Praveen · dashboard | `schedule` table, one row; probe `0033` | Re-schedules `mridanga-close-visits` hourly |
| M0034 | `0034_access_log.sql` | Praveen · dashboard | `schedule` table, one row; probe `0034` | **Run once** (its header does not say so; a second paste is refused with `relation "access_log" already exists`). **The same day as the app update** ([OPERATIONS.md](OPERATIONS.md#releasing-a-change-database-first), [#146](DECISIONS.md)): an app from before it shows students with no parent, consent or calls. On go-live day the only LIVE app is the live web site (no production APK exists yet, brief 9), so part E1 follows this part the same day. If a production APK exists by then, also `npm run update:production` straight after B. The first production APK (planned 16 Oct 2026, [OPERATIONS.md "Friday production build"](OPERATIONS.md#friday-production-build-first-production-apk-brief-9)) is built from main after 0045, so it needs all of part B first (its gate G1): built before B, it signs in but its screens fail on LIVE |
| M0035 | `0035_asset_labels.sql` | Praveen · dashboard | No rows; probe `0035` | |
| M0036 | `0036_account_creation.sql` | Praveen · dashboard | No rows; probe `0036` | |
| M0037 | `0037_db_backlog.sql` | Praveen · dashboard | No rows; probe `0037` | |
| M0038 | `0038_app_correctness.sql` | Praveen · dashboard | No rows; probe `0038` | Adds four checks as NOT VALID: old rows are not checked, new ones are |
| M0039 | `0039_security_backlog.sql` | Praveen · dashboard | No rows; probe `0039` | |
| M0040 | `0040_ops_backlog.sql` | Praveen · dashboard | `schedule` table (two jobs); probe `0040` | Adds `mridanga-cron-history-purge`, `mridanga-orphan-files`. Until C4 the old function ignores the orphan-files call |
| M0042 | `0042_app_leftovers.sql` | Praveen · dashboard | No rows; probe `0042`, `MISSING` `none` | Stops with `roll_no_missing` (changing nothing) if a student has no roll number: run the hint's select, give each one a roll number with a chat's help, run 0042 again |
| M0043 | `0043_parent_notices.sql` | Praveen · dashboard | `schedule` table (one job); probe `0043`, `MISSING` `none` | Adds `mridanga-parent-notices` (answers `off`: parent emails stay off until the Guru ticks them on G10). Its Edge Function is C7-C8 |
| M0044 | `0044_parent_checkout_only.sql` | Praveen · dashboard | No rows; probe `0044`, `MISSING` `none` | Parent emails only for a check-out recorded in the app ([#246](DECISIONS.md)): adds the switches `parent_notices_check_in` and `parent_notices_no_checkout`, both off. No Edge Function change |
| M0045 | `0045_qr_cards.sql` | Praveen · dashboard | No rows; probe `0045`, `MISSING` `none` | Adds `reissue_qr_code` (the Guru replaces a lost printed QR card, [#250](DECISIONS.md)); the cards need no other database change |
| M0046 | `0046_registration_accept.sql` | Praveen · dashboard | No rows; probe `0046`, `MISSING` `none` | Adds `accept_sign_up` (Accept on Register a student, [#263](DECISIONS.md)) and lets every link path take a login whose role was set to `student` by hand without a record ([#265](DECISIONS.md)); links such logins that a record with their email already waits for. **Before the students sign up on LIVE** |
| M0047 | `0047_form_rules.sql` | Praveen · dashboard | No rows; probe `0047`, `MISSING` `none` | Form rules in SQL (audit phase 1 and early phase 3, [#271-#274, #276, #280](DECISIONS.md)): the app's name rule on every name an app user writes (no digits, letters and vowel signs of any script), a minor needs a guardian with a phone and that guardian's consent also when the date of birth changes, **a child's record is never linked to a login by email (the Guru links it)**, a student inserted by an app user gets no login, About you keeps a student's gender once set, the desk's new students get the coordinator's centre, `possible_duplicates`, the privacy-notice tick at sign-up is kept and Accept needs it. Checks only what is written from now on: stored rows are not changed or re-checked. **Before the students sign up on LIVE** |
| M0048 | `0048_withdrawn_and_leaks.sql` | Praveen · dashboard | No rows; probe `0048`, `MISSING` `none` | Withdrawn records and leaks ([#281, #288-#290](DECISIONS.md)): **a record whose consent was withdrawn is never linked to a login again** and its login stays off; nothing new is recorded about the student (practice, phones, promotion, loans; events and assessments leave them out), error `student_withdrawn`; `audience_profiles` closed to app users, `event_visible_to` and `staff_name_taken` answer for the caller only; a QR re-scan within 10 minutes of the check-in answers "already in" (setting `qr_rescan_minutes`, no parent "left" email); the sign-up's privacy-notice tick is kept when the login joins a record with About-you details, and Fill the form keeps an adult's. Switches off any login already on a withdrawn record (none expected on LIVE). Was planned as its own run on Sat 17-10 while it was still a branch; it is on main and in the replay since 13 Oct, so **run it on 15 Oct with the rest**, after 0047 (0050 cannot follow without it: the probe counts a gap as `MISSING`) |
| M0049 | `0049_launch_cleanup.sql` | Praveen · dashboard | No rows; probe `0049`, `MISSING` `none` | Launch clean-up ([#286-#287](DECISIONS.md)): adds `erase_login` (the Guru erases a waiting sign-up on request), unlisted assessment files go in the existing daily clean-up (no new job, no Edge Function deploy), 150 MB a day per login in assessment-files, erasure takes the notices about the child and matches emails as whole values. Verify on TEST and LIVE: `select count(*) from cron.job where jobname like 'mridanga%'` = 11 (unchanged). Safe to run twice. **LIVE took 0050 on 15 Oct 2026 without 0049, so on LIVE it runs after 0050** (0049 replaces no function 0050 uses; the replay of that order matches a fresh build). Until it runs, the probe on LIVE shows `LAST IN ORDER` `0048` and `MISSING` `0049`. Only function replacements and one new empty column on `erasures`: no data changes at the run, under a second. **Done on LIVE 21 Oct 2026** (Praveen): probe 0049 yes, `LAST IN ORDER` `0050`, `MISSING` `none`; erase_login, orphan_assessment_files and `erasures.login_profile` present, jobs 11, files waiting 0; verification all ok except the push job "never ran" (no notice yet) |
| M0050 | `0050_staff_dashboard.sql` | Praveen · dashboard | No rows; probe `0050`, `MISSING` `none` | **Goes with the launch UI (renumbered from placeholder 0063, 14-10-2026); a read-only function, no data change.** Staff home "Today" and "Waiting for you" in one request ([#339, #340](DECISIONS.md)): one read-only function `staff_dashboard()` (staff only, security invoker); nothing else changes. Run before the OTA that uses it (the app falls back to the older functions without it). **TEST first:** not on TEST on 15 Oct 2026; paste it on TEST (`fhuqyk…`), check the probe there, then LIVE |
| M0051 | `0051_minor_home_signup.sql` | Praveen · dashboard | No rows; probe `0051`, `MISSING` `none`; verification row 3 `12 of 12` | **A child under 18 signs up at home; the parent consents by email** ([#399](DECISIONS.md)). New tables `minor_signups` and `parent_mail_log` (empty), new job `mridanga-minor-signups` (daily 02:15 IST: a child's sign-up without the parent's consent in 30 days is erased with `erase_login`), replaced `handle_new_user` (a minor's date of birth is kept only with the parent's details), `waiting_sign_ups` (+ the parent's part; a child appears only once the parent consented), `send_parent_notices` (also calls `notify-parents` for consent emails, check-out emails on or off) and the consent guard; new `accept_minor_sign_up`, the child's `my_parent_consent` / `resend_parent_email` / `set_parent_details` and the consent page's `give_parent_consent` (anon). `accept_sign_up` is not changed. **Order:** TEST first (with Praveen); on LIVE only after 0049 (it uses `erase_login`) and after (1) `notify-parents` is deployed from the same commit (C7, LIVE ref) and (2) `BREVO_API_KEY` + `NOTICE_FROM` are set in Edge Functions → Secrets (OPERATIONS "Parent consent by email"): without them every consent email is a dry run and children see "emails to parents are not switched on". Then the OTA with the new sign-up screen. Safe to run twice. **Done on LIVE 22 Oct 2026** (Praveen, main 3f74b53 file): `minor_signups` present, jobs 12 with `mridanga-minor-signups`, anon may run `give_parent_consent` and not `accept_minor_sign_up`; `notify-parents` deployed to LIVE the same morning (version 2, 11:16 IST). Brevo secrets not set yet: consent emails are dry runs |
| M0052 | `0052_practice_more.sql` | Praveen · dashboard | No rows; probe `0052`, `MISSING` `none` | More home practice ([#400-#405](DECISIONS.md)): adds the table `practice_plans` (per level: the weekly goal, 4 x 15 until changed, and up to three things to practise; staff write, a student reads their own level's), `practice_goals` with `set_my_practice_goal` (a student's own goal), `practice_mantras` (the mantra before practice, Guru and Ishtagoshti editors write; nothing seeded) and the read-only function `practice_days` (a student's minutes per day with their goal, row-level security of the asker). No existing row or function changes; safe to run twice. **TEST first** (`fhuqyk…`), then LIVE, **before** the OTA and web upload that use it (without it the app shows no plan and no week card, and the plan editor cannot load). After 0051. **Done on LIVE 22 Oct 2026** (Praveen, main 7c846ed file): "Success. No rows returned"; `practice_plans` and `practice_mantras` present |
| M0053 | `0053_staff_own_record.sql` | Praveen · dashboard | No rows; probe `0053`, `MISSING` `none` | Coordinators are students too (placeholder 0061 on branch `staff-own-record`, renumbered 22-10-2026) ([#316-#321](DECISIONS.md)): `link_staff_record` (the Guru links a coordinator's login to their own student record; the role stays); `my_student_id` covers staff, so practice and face enrolment work on an own record; **nobody records about their own record** (check-in or out by name, QR or Mark attendance, ticks, level, promotion, assessment reviews, calls: error `own_record`; an event list leaves the own row as it is); nobody is their own mentor (`own_mentor`); a record with a staff login is not withdrawn or erased while linked (`staff_login_linked`). Changes no stored row. TEST first (NOTES.md "13-10-2026 — Coordinators are students too" TEST-run pack). After 0052. **Done on LIVE 22 Oct 2026** (Praveen, main 47f3c5f file): `link_staff_record` present; 1 staff login with its own record (coordinator 5cd712ff…); jobs 12 |
| M0054 | `0054_after_launch_forms.sql` (placeholder 0062 on branch `after-launch-forms`, renumbered 22-10-2026) | Praveen · dashboard | No rows; probe `0054`, `MISSING` `none`. **Changes stored rows:** run OPERATIONS "Phones that are not E.164" step 1 before and step 2 after; the counts must match | After-launch forms ([#322, #324-#326, #328, #329](DECISIONS.md)): creates saved once per request id (`request_id` on 10 tables; twins of `record_fund_entry`, `log_call`, `log_practice`); an approved material's file only the Guru deletes; `change_event_attendance`; the Guru's `delete_student_record` and `undo_import` (`students.import_id`); **phones kept as E.164**: stored national numbers on students, guardians, profiles and Ishtagoshti subscribers are rewritten once (`+91`; a number it cannot read stays as it is, OPERATIONS `Phones that are not E.164`); at most 3 parent codes a day to one address. **After the launch**, with the app update that uses it. **Done on LIVE 22 Oct 2026** (Praveen): step 1 before = logins 11 and students 8, all already E.164 (no guardian or Ishtagoshti phones), so the rewrite changed 0 rows; after: `request_id` on 11 tables, `undo_import` present, students not E.164 0 |
| M0055 | `0055_practice_links.sql` | Praveen · dashboard | No rows; probe `0055`, `MISSING` `none` | "Learn more" links under Practice ([#474](DECISIONS.md)): one new table `practice_links` (title, https link, note, order, on/off; class roles read the ones switched on, only the Guru reads all and writes; nothing seeded) with its guard `guard_practice_link`. No existing row, table or function changes; safe to run twice. **TEST first** (`fhuqyk…`), then LIVE, **before** the OTA and web upload that show Learn more (without it the list says it cannot load and the Guru cannot add links; the other Practice tools work). After 0054 |
| M0057 | `0057_practice_while_waiting.sql` | Praveen · dashboard | No rows; probe `0057`, `MISSING` `none` | **Practice while waiting for the desk** ([#510-#512](DECISIONS.md), audit 22-10-2026 fix 8): one read-only function `practice_while_waiting()` and three new read policies `waiting_read` (on `taals`, `practice_mantras`, `materials`), beside the existing ones. A pending login that is an adult by its sign-up's date of birth, or a child whose parent consented by email, reads the taals and mantras switched on and the approved Beginner lesson videos; nothing personal, nothing written, no existing row, function or policy changed. Safe to run twice. **TEST first** (`fhuqyk…`), then LIVE, **before** the OTA and web upload that show the waiting page's practice section (without it the section stays hidden: the app asks the function first). Verify: `select count(*) from pg_policies where policyname = 'waiting_read'` = 3 |
| M0058 | `0058_parent_digest.sql` | Praveen · dashboard | No rows; probe `0058`, `MISSING` `none`; verification row 3 `13 of 14` (`14 of 14` after 0059) | **The weekly email to parents** ([#530-#539](DECISIONS.md)): new table `parent_digests` (empty), new setting `parent_digest_enabled` = **false**, consent scope `digest` (the parent's own written yes, opt-in), four new columns on `parent_notice_status`, new job `mridanga-parent-digests` (every 5 minutes; while off it only answers `off`), the staff functions (`set_parent_digest` the Guru, `guardian_digest_status`, `set_guardian_digest`, `resend_parent_digest`, `preview_parent_digest`, `parent_digest_overview`) and the Edge Function's `claim_parent_digests` / `finish_parent_digests` / `stop_parent_digests`. **No existing function is replaced** (`guard_setting` and `send_parent_notices` stay as they are); the `consents.scope` check gains `digest`. Changes no stored row. **Order:** TEST first; `notify-parents` deployed from the same commit (C7) before the Guru switches it on (OPERATIONS "Weekly email to parents"); then the OTA with the screen. After 0054 (it does not need 0055-0057). Safe to run twice |
| M0059 | `0059_data_rights.sql` (branch `data-rights`) | Praveen · dashboard | No rows; probe `0059`, `MISSING` `none`; verification row 3 `14 of 14` | **A person's data rights in the app** ([#550-#556](DECISIONS.md), audit 22-10-2026 fix 17): new table `data_requests` (one row per request: correction, erasure, photo or data withdrawal, complaint, nominee, access; type, status, made / answer-by / closed times; a person reads only their own, the Guru all; written only by the functions, audited), the person's `my_data_summary` (logged in the access log), `file_data_request`, `cancel_data_request`, the Guru's `record_data_request`, `answer_data_request` and `act_on_data_request` (runs the photo withdrawal, `withdraw_consent`, `erase_student` or `erase_login` after the roll number or email is typed), and job `mridanga-data-requests` (daily 02:30 IST: reminder 3 days before the 30-day answer-by date; text blanked a year after closing, row deleted after two). No existing function or row changes; safe to run twice. **TEST first** (`fhuqyk…`), then LIVE, **before** the OTA with "My data and rights" (without it the screen says the requests are not set up and the To do shows no data requests). Phone pushes about requests need the Edge Function `notify-announcements` deployed from the same commit (its list of screens a push may open); until then those notices reach the inbox only (the push is refused `bad_url`, nothing breaks) |

**A file newer than 0059 on main:** the replay's first check fails until this table lists it. Add it
here, with its own steps, then run it last.

**0049 (launch clean-up)** is on TEST but not on main on 15 Oct 2026. It joins this table when branch
`launch-cleanup` is merged and then runs on LIVE as its own run, **after** 0050 and after a real A2
backup. The lead checks at that merge that the replay also passes in LIVE's order (0050 before 0049).

**B-end.** Paste the **verification SQL** (part F) and the drift query again. Download the drift CSV
as `drift-live-after-<date>.csv`, run the same drift query on TEST, and compare the `KIND:` rows
([OPERATIONS.md "Releasing a change"](OPERATIONS.md#releasing-a-change-database-first) step 4).
Expected differences only: `config_rows`, `vault_secret` until part C, and the objects of any
migration TEST has run that is not on main yet (on 15 Oct 2026: 0049's objects, from branch launch-cleanup).

## C. Push notifications on LIVE

[OPERATIONS.md "Push notifications"](OPERATIONS.md#push-notifications) steps 1-5 (Firebase project,
the FCM key in Expo) are done once for both projects and were done for TEST; step 6 is part B. LIVE
needs steps 7-10. First see what LIVE already has (read-only):

```sql
select (select count(*) from pg_extension where extname = 'pg_net') as pg_net,
       (select string_agg(name, ', ' order by name) from vault.secrets where name like 'mridanga%') as vault_names;
```

| # | Who | Do | Expected | If it differs |
|---|---|---|---|---|
| C1 | Praveen · dashboard | Step 7: **Database → Extensions** → pg_net **on** (skip if the query shows `1`) | The query shows `pg_net` = 1 | |
| C2 | Praveen · dashboard | Step 8: the two `vault.create_secret` lines with `https://qeozvvizcojzxcjgnaei.supabase.co`, then the check line (skip a secret the query already lists) | `mridanga_project_url` 40 characters, `mridanga_push_secret` 64 | An error "duplicate key": that secret exists; do not make a second one |
| C3 | Praveen · dashboard | Step 9: copy the Vault's `mridanga_push_secret` with its copy button → **Edge Functions → Secrets** → `PUSH_SECRET` | After C4's login: `npx supabase@latest secrets list --project-ref qeozvvizcojzxcjgnaei` shows the same SHA-256 as the step 9 digest query | Different: copy again with the Vault's copy button (never from the results grid) |
| C4 | Praveen · terminal | Step 10, from the main folder on **main at the replay's commit** (`git status` clean, `git log -1` = that commit): `npx supabase@latest functions deploy notify-announcements --project-ref qeozvvizcojzxcjgnaei --no-verify-jwt --use-api`, then `npx supabase@latest functions list --project-ref qeozvvizcojzxcjgnaei` | `notify-announcements` ACTIVE, version one higher than before | Check the ref twice before Enter: the CLI is logged in and deploys at once. An empty list: nothing deployed, run it again |
| C5 | Praveen · terminal | `curl.exe -s -X POST https://qeozvvizcojzxcjgnaei.supabase.co/functions/v1/notify-announcements` | `{"error":"not_allowed"}` | `404`: not deployed. `Missing authorization header` / `Invalid JWT`: deployed with the JWT check on; deploy again from the repository folder (step 13 of OPERATIONS) |
| C6 | Praveen · dashboard | A minute later: `select last_job_at, last_job_result from push_status;` | `last_job_result` `called` within the last minutes **once a notice is due**. On a LIVE with nothing to send both stay empty ("never ran"): the job answers `nothing_due` without writing `push_status` (0031 `send_due_push`). Then check the job itself: `select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'mridanga-push') order by start_time desc limit 3;` shows `succeeded` every minute (15 Oct 2026) | `not_set_up`: C1 or C2 is missing, or the URL is not `https://<ref>.supabase.co` |
| C7 | Praveen · terminal | Parent emails' function, same folder and commit as C4: `npx supabase@latest functions deploy notify-parents --project-ref qeozvvizcojzxcjgnaei --no-verify-jwt --use-api`, then `functions list` | `notify-parents` ACTIVE, version 1 | As C4. It needs no secret of its own to deploy: without `BREVO_API_KEY` / `NOTICE_FROM` it only does dry runs ([OPERATIONS.md "Parent notices by email"](OPERATIONS.md#parent-notices-by-email)) |
| C8 | Praveen · terminal | `curl.exe -s -X POST https://qeozvvizcojzxcjgnaei.supabase.co/functions/v1/notify-parents` | `{"error":"not_allowed"}` | As C5. Brevo secrets and switching the emails on are later steps (OPERATIONS "On LIVE"), not go-live |

**Not on go-live day:** do **not** put the Brevo API key into LIVE's Vault (`mridanga_brevo_key`) or
into the Edge Function secrets. The parent-code mail can be made to send to any address until the
mail hardening after launch (audit S3-01). The Auth SMTP key of D3-D4 is a different key and is fine.
Parent emails (G10) stay **off**.

The real push test needs the production APK (brief 9): OPERATIONS step 12 with it, then (step 9 of
[OPERATIONS.md "Friday production build"](OPERATIONS.md#friday-production-build-first-production-apk-brief-9)).
For the production APK, parts A and B are required (gate G1); C (notifications) and D1, D3-D9 + E1-E2
(new logins, reset mails) are needed before the class relies on those; the ⏳ DOMAIN steps are not.

## D. Email: Brevo, auth settings, real sign-up and reset

**Sender.** Brevo needs a verified sender. The right one is an address on `mridangaseva.com` with the
domain authenticated in Brevo (DKIM + DMARC records), which needs the DNS on Cloudflare: **⏳ DOMAIN**.
Until then Brevo can verify a single sender address of a mailbox the team reads (the team email; audit
decision 6.1 C (b): Brevo on a personal account now, moved to the team email later). Mail sent that
way may land in spam: D7 shows it.

| # | Who | Do | Expected | If it differs |
|---|---|---|---|---|
| D1 | Praveen · dashboard | Brevo (free plan) → **Senders, Domains & Dedicated IPs → Senders → Add a sender**: name `Mridanga Seva`, the team address; confirm with the code Brevo mails to it | The sender shows **Verified** | No mail from Brevo: check the team mailbox's spam |
| D2 | Praveen · dashboard + Guru · Zoho | **⏳ DOMAIN** Brevo → **Domains → Add a domain** `mridangaseva.com` → **Authenticate** → put the records Brevo shows (Brevo code TXT, DKIM, DMARC) into Cloudflare's DNS as **DNS only** (grey cloud). One SPF TXT only: Zoho's and Brevo's `include:` in the same record. Then a sender `noreply@mridangaseva.com` (or `seva@`) | Brevo shows the domain **Authenticated** | Do it after Zoho Mail's MX/SPF/DKIM are in Cloudflare and a test mail to seva@ arrives (NOTES_lead.md 07-10-2026) |
| D3 | Praveen · dashboard | Brevo → **SMTP & API → SMTP → Generate a new SMTP key** (name `supabase-live`). Copy it straight into D4; do not save it anywhere else | A key and the SMTP login (`…@smtp-brevo.com`) | |
| D4 | Praveen · dashboard | Supabase LIVE → **Authentication → Emails → SMTP Settings** → Enable custom SMTP: sender email = D1's (later D2's) address, sender name `Mridanga Seva`, host `smtp-relay.brevo.com`, port `587`, username = the SMTP login, password = the key → Save | Saved without error | |
| D5 | Praveen · dashboard | **Authentication → Rate Limits**: emails sent per hour **`100` for the sign-up weekend (Fri 16 - Sun 18 Oct 2026)**, back to `30` on Mon 19 Oct (audit S4-11; Brevo free = 300 a day). Token refreshes **at least `150` per 5 minutes per IP** (audit R5-02: the class shares the temple's Wi-Fi, one IP; a refused refresh signs the person out and deletes their offline QR card; since #393 the app treats a refused refresh like no internet, but the limit still decides how fast people get back in). **Sign-ups and sign-ins per IP: `150` per 5 minutes for the sign-up weekend (Fri 16 - Sun 18 Oct 2026)**, back to the default `30` on Mon 19 Oct (launch audit 15-10-2026: a burst of sign-ups on the temple Wi-Fi otherwise gets "Too many tries"). Save | 100 (then 30); token refresh ≥ 150; sign-ups/sign-ins 150 (then 30) | Lower token-refresh value: raise it, never lower it below 150 |
| D6 | Praveen · dashboard | **Authentication → Sign In / Providers → Email**: Email **on**, **Confirm email on**, minimum password length **8**, Secure email change on. **Authentication → URL Configuration**: Site URL `https://mridanga-seva.pages.dev`; Redirect URLs exactly `https://mridanga-seva.pages.dev` (the app sends the site's origin, no path). **No localhost** and no wildcard: delete `http://localhost:8081` if it is still there (brief 1a). After part E2 the addresses change (E3) | As written | |
| D6b | Praveen · dashboard | **Authentication → Sign In / Providers**: every provider other than Email **off** (Phone, Google, Apple, GitHub, … and **Allow anonymous sign-ins off**); **Allow new users to sign up on** (students sign up themselves); manual linking off | Only Email enabled | Any other provider on: switch it off. The app only signs in with email; another provider makes logins that skip Confirm email and the identity line (audit S4-10) |
| D6c | Praveen · dashboard | **Project Settings → Data API** (newer dashboards: **Integrations → Data API → Settings**): **Exposed schemas** = `public` and Supabase's default `graphql_public` only | Exactly those two | `auth`, `vault`, `cron`, `storage`, `extensions` or any other schema listed: remove it and Save. The app reads only `public`; every exposed schema can be called through the Data API with the public key (audit S4-10) |
| D7 | Praveen | **One real sign-up**: on the live web site (part E1 first) sign up with a team mailbox that is not on any student record, e.g. a `+golive` alias | The mail arrives from the sender of D4 within a minute, in the inbox (not spam); its link opens `https://mridanga-seva.pages.dev` and the app says the email is confirmed; the login then waits for a role (pending) | No mail: Supabase → **Authentication → Logs** and Brevo → **Transactional → Logs**. Link opens the Site URL instead of the site, or errors `redirect_to`: the Redirect URL does not match the origin exactly. In spam: do D2 before the pilot |
| D8 | Praveen | **One real reset**: Forgot password with the same mailbox | The reset mail arrives; its link opens the site; a new password of 8+ characters is accepted; signing in with it works | As D7. Afterwards switch that test login off (G2) or delete it in Authentication → Users |
| D9 | Praveen · terminal | `curl.exe -s https://qeozvvizcojzxcjgnaei.supabase.co/auth/v1/settings -H "apikey: <LIVE publishable key, the one in app/.env.live>"` | `"disable_signup":false` and `"mailer_autoconfirm":false` | `mailer_autoconfirm:true` = Confirm email is off: switch it on (D6) **before** any real student record exists ([#13](DECISIONS.md), SURF-01) |

**The identity line (audit brief 8, D10-04).** Never hand-confirm or Auto-Confirm an address on a
student record without checking identity in person. A confirmed login whose email is on a student
record is linked to that child's record (0002), so whoever confirms an address they do not own
reads a child's data. When someone says the mail never came: fix the mail (D7's checks), or confirm
the address in **Authentication → Users** only after the person has shown, at the class, that it is
theirs. Auto-confirm (Confirm email off) stays off for good.

## E. The live web site and its address

| # | Who | Do | Expected | If it differs |
|---|---|---|---|---|
| E0 | Praveen · terminal | **Settings file and EAS environment** (OPERATIONS "Friday production build" gate G5 and step 4). In the main folder move `app\.env` (= LIVE) to `app\.env.live` (app/README.md "Settings files", [#145](DECISIONS.md)); then from `app/`: `npx eas-cli env:push --environment production --path .env.live` and `npx eas-cli env:list --environment production --format long` | `app\.env.live` exists and no plain `app\.env`; EAS `production` shows `EXPO_PUBLIC_SUPABASE_URL` = `https://qeozvvizcojzxcjgnaei.supabase.co` and a key starting `sb_publishable_` | Another address in EAS: push again from the right file. A chat never reads these files |
| E1 | Praveen · terminal | On the PC with `app/.env.live` (LIVE URL + publishable key): from `app/`, on main at the replay's commit (15 Oct 2026: `fd49d25` or later — it carries the launch redesign and the dark gradient), `npm run export:web -- --site live`; then the first upload as [OPERATIONS.md "Publishing the web version"](OPERATIONS.md#publishing-the-web-version) "First upload" (project name `mridanga-seva`, drag and drop) or `npx wrangler@4 pages deploy dist --project-name mridanga-seva --branch main` | The script's last line names site `live`, Cloudflare project `mridanga-seva`, Supabase `qeozvv…`; Cloudflare shows `https://mridanga-seva.pages.dev` | *Settings file missing*: on 10 Oct 2026 the main folder still had only `app/.env` (= LIVE); move it to `app/.env.live` first (app/README.md "Settings files", [#145](DECISIONS.md)). Cloudflare added letters to the name: use the address it shows everywhere in D6 and here. From a worktree, wrangler without `--branch main` makes a preview, not the site |
| E2 | Praveen · terminal | The header check and upload-log row of OPERATIONS "After every upload", on `https://mridanga-seva.pages.dev` | CSP with `https://qeozvvizcojzxcjgnaei.supabase.co`, HSTS, `nosniff`; `version.txt` names site live and the commit | |
| E3 | Praveen · dashboard | **⏳ DOMAIN** Cloudflare → `mridanga-seva` → **Custom domains → Set up a custom domain** `app.mridangaseva.com` (Cloudflare adds the CNAME itself once the zone is Active) | `https://app.mridangaseva.com` opens the app with a padlock | The zone is not Active yet: the domain move is not finished |
| E4 | Praveen · dashboard | **⏳ DOMAIN** Supabase LIVE → URL Configuration: Site URL `https://app.mridangaseva.com`; Redirect URLs `https://app.mridangaseva.com` and, for a week while old mails are still around, `https://mridanga-seva.pages.dev`; then remove the pages.dev one | As written | |
| E5 | Praveen | **⏳ DOMAIN** Repeat D7 and D8 once from `https://app.mridangaseva.com` | Both links open `app.mridangaseva.com` | As D7 |
| E6 | Praveen · terminal | **⏳ DOMAIN** The website: OPERATIONS "The public website" → "Going live" (attach `mridangaseva.com`, `app.webLive: true` once E3 works) | | |
| E7 | Lead chat, Praveen's go | **After the production APK** (Fri 16 Oct 2026): the public website's "Download for Android" (`apkUrl`) → the **production** APK's link, not the TEST preview APK; `webUrl` `https://mridanga-seva.pages.dev/`, `webLive: true`; upload the website on Praveen's go (audit S4-14) | The website's download button installs the build named in the G-table's production APK row | Still the preview link: TEST logins on the public download — fix before sign-ups |

## F. After go-live: verification (read-only)

Paste into LIVE's SQL editor. Every row's `ok` must be `true`, except the two the `expected` column
explains. Row 13 (`push job`) also reads `false` / `never ran` on a LIVE that has not sent a notice yet: see C6. Then the row counts below, and record the results in part G.

<!-- replay: verify -->
```sql
-- Go-live verification. READ-ONLY: selects only.
with m(migration, present) as (values
  ('0010', exists (select 1 from pg_proc where proname = 'announcement_file_path_ok' and pronamespace = 'public'::regnamespace)),
  ('0011', to_regclass('public.push_tokens') is not null),
  ('0013', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'syllabus_items' and column_name = 'retired_at')),
  ('0014', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'duty_hours')),
  ('0015', to_regclass('public.notifications') is not null),
  ('0016', to_regclass('public.assessments') is not null),
  ('0017', to_regclass('public.promotion_nominations') is not null),
  ('0018', to_regclass('public.practice_logs') is not null),
  ('0019', exists (select 1 from pg_proc where proname = 'inbox_on_push_outbox' and pronamespace = 'public'::regnamespace)),
  ('0020', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'panes')),
  ('0021', to_regclass('public.ig_slokas') is not null),
  ('0022', to_regclass('public.events') is not null),
  ('0023', to_regclass('public.inventory_items') is not null),
  ('0024', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visits' and column_name = 'location_check')),
  ('0025', to_regclass('public.erasures') is not null),
  ('0026', to_regclass('public.fund_entries') is not null),
  ('0027', to_regclass('public.ig_subscribers') is not null),
  ('0028', exists (select 1 from pg_proc where proname = 'release_old_student_login' and pronamespace = 'public'::regnamespace)),
  ('0029', obj_description(to_regprocedure('public.setting_int(text)'), 'pg_proc') is not null),
  ('0030', exists (select 1 from pg_proc where proname = 'check_setting_order' and pronamespace = 'public'::regnamespace)),
  ('0031', to_regclass('public.push_queue') is not null),
  ('0032', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'request_id')),
  ('0033', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'centres' and column_name = 'time_zone')),
  ('0034', to_regclass('public.access_log') is not null),
  ('0035', to_regclass('public.inventory_stocktakes') is not null),
  ('0036', to_regclass('public.choice_options') is not null),
  ('0037', exists (select 1 from pg_proc where proname = 'guard_student_values' and pronamespace = 'public'::regnamespace)),
  ('0038', exists (select 1 from pg_proc where proname = 'guard_call_log_date' and pronamespace = 'public'::regnamespace)),
  ('0039', exists (select 1 from pg_proc where proname = 'search_students' and pronamespace = 'public'::regnamespace)),
  ('0040', exists (select 1 from pg_proc where proname = 'anonymise_staff' and pronamespace = 'public'::regnamespace)),
  ('0042', coalesce((select attnotnull from pg_attribute where attrelid = to_regclass('public.students') and attname = 'roll_no'), false)),
  ('0043', to_regclass('public.parent_notices') is not null),
  ('0044', exists (select 1 from settings where key = 'parent_notices_no_checkout')),
  ('0045', exists (select 1 from pg_proc where proname = 'reissue_qr_code' and pronamespace = 'public'::regnamespace)),
  ('0046', exists (select 1 from pg_proc where proname = 'accept_sign_up' and pronamespace = 'public'::regnamespace)),
  ('0047', exists (select 1 from pg_proc where proname = 'clean_person_name' and pronamespace = 'public'::regnamespace)),
  ('0048', exists (select 1 from pg_proc where proname = 'in_audience' and pronamespace = 'public'::regnamespace)),
  ('0049', exists (select 1 from pg_proc where proname = 'erase_login' and pronamespace = 'public'::regnamespace)),
  ('0050', exists (select 1 from pg_proc where proname = 'staff_dashboard' and pronamespace = 'public'::regnamespace)),
  ('0051', to_regclass('public.minor_signups') is not null),
  ('0052', to_regclass('public.practice_plans') is not null),
  ('0053', exists (select 1 from pg_proc where proname = 'link_staff_record' and pronamespace = 'public'::regnamespace)),
  ('0054', exists (select 1 from pg_proc where proname = 'undo_import' and pronamespace = 'public'::regnamespace)),
  ('0055', to_regclass('public.practice_links') is not null),
  ('0057', exists (select 1 from pg_proc where proname = 'practice_while_waiting' and pronamespace = 'public'::regnamespace)),
  ('0058', to_regclass('public.parent_digests') is not null),
  ('0059', to_regclass('public.data_requests') is not null)
),
last_in_order as (select coalesce(max(a.migration), 'before 0010') as v from m a
  where a.present and not exists (select 1 from m b where b.migration <= a.migration and not b.present)),
missing as (select coalesce(string_agg(a.migration, ' ' order by a.migration), 'none') as v from m a
  where not a.present and exists (select 1 from m b where b.present and b.migration > a.migration)),
jobs(name) as (values ('mridanga-status-refresh'), ('mridanga-close-visits'), ('mridanga-push'), ('mridanga-inbox-cleanup'),
  ('mridanga-assessments'), ('mridanga-events-polls'), ('mridanga-duty'), ('mridanga-access-log-purge'),
  ('mridanga-cron-history-purge'), ('mridanga-orphan-files'), ('mridanga-parent-notices'), ('mridanga-minor-signups'),
  ('mridanga-parent-digests'), ('mridanga-data-requests')),
checks(sort, check_name, ok, found, expected) as (
  select 1, 'last migration', (select v from last_in_order) = '0059', (select v from last_in_order), '0059'
  union all select 2, 'migrations missing', (select v from missing) = 'none', (select v from missing), 'none'
  union all select 3, 'scheduled jobs',
    (select count(*) from jobs j join cron.job c on c.jobname = j.name and c.active) = 14,
    (select count(*) from jobs j join cron.job c on c.jobname = j.name and c.active)::text || ' of 14', '14 of 14 (active)'
  union all select 4, 'other mridanga jobs', not exists (select 1 from cron.job where jobname like 'mridanga%' and jobname not in (select name from jobs)),
    coalesce((select string_agg(jobname, ', ') from cron.job where jobname like 'mridanga%' and jobname not in (select name from jobs)), 'none'),
    'none'
  union all select 5, 'job failures in 2 days', (select count(*) from cron.job_run_details where status = 'failed' and start_time > now() - interval '2 days') = 0,
    (select count(*) from cron.job_run_details where status = 'failed' and start_time > now() - interval '2 days')::text, '0 (OPERATIONS "Scheduled jobs: health check" says why)'
  union all select 6, 'tables without row-level security',
    (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity) = 0,
    coalesce((select string_agg(relname, ', ') from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity), 'none'), 'none'
  union all select 7, 'anon table rights',
    not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace
      and ((c.relkind in ('r', 'v', 'm', 'p') and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
        or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE')))),
    coalesce((select string_agg(c.relname, ', ') from pg_class c where c.relnamespace = 'public'::regnamespace
      and ((c.relkind in ('r', 'v', 'm', 'p') and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
        or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE')))), 'none'), 'none'
  union all select 8, 'anon function rights',
    not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('sign_up_choices', 'give_parent_consent')),
    coalesce((select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('sign_up_choices', 'give_parent_consent')), 'none'), 'none (the public functions are sign_up_choices, #163, and give_parent_consent, #399)'
  union all select 9, 'update/delete without where',
    not exists (select 1 from pg_proc p, regexp_split_to_table(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), ';') as s(stmt)
      where p.pronamespace = 'public'::regnamespace and p.prolang in (select oid from pg_language where lanname in ('sql', 'plpgsql'))
        and s.stmt ~* '\m(update\s+\w+(\s+\w+)?\s+set|delete\s+from)\M' and s.stmt !~* '\mwhere\M'),
    coalesce((select string_agg(distinct p.proname, ', ') from pg_proc p, regexp_split_to_table(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), ';') as s(stmt)
      where p.pronamespace = 'public'::regnamespace and p.prolang in (select oid from pg_language where lanname in ('sql', 'plpgsql'))
        and s.stmt ~* '\m(update\s+\w+(\s+\w+)?\s+set|delete\s+from)\M' and s.stmt !~* '\mwhere\M'), 'none'), 'none (Supabase safeupdate; 0031 corrected)'
  union all select 10, 'roll numbers missing', (select count(*) from students where roll_no is null) = 0,
    (select count(*) from students where roll_no is null)::text, '0'
  union all select 11, 'pg_net', exists (select 1 from pg_extension where extname = 'pg_net'),
    coalesce((select extversion from pg_extension where extname = 'pg_net'), 'missing'), 'installed (part C1)'
  union all select 12, 'vault secrets', (select count(*) from vault.secrets where name in ('mridanga_project_url', 'mridanga_push_secret')) = 2,
    (select count(*) from vault.secrets where name in ('mridanga_project_url', 'mridanga_push_secret'))::text || ' of 2', '2 of 2 (part C2; names only)'
  union all select 13, 'push job', coalesce((select last_job_at > now() - interval '10 minutes' and last_job_result in ('called', 'nothing_due') from push_status), false),
    coalesce((select coalesce(last_job_result, 'never ran') || coalesce(' at ' || to_char(last_job_at, 'YYYY-MM-DD HH24:MI'), '') from push_status), 'no row'),
    'called or nothing_due, in the last 10 minutes (part C6)'
  union all select 14, 'logins confirmed within 2 s of sign-up (7 days)',
    (select count(*) from auth.users where created_at > now() - interval '7 days' and email_confirmed_at - created_at < interval '2 seconds') = 0,
    (select count(*) from auth.users where created_at > now() - interval '7 days' and email_confirmed_at - created_at < interval '2 seconds')::text,
    '0 (more = auto-confirm was on, or someone confirmed by hand at once: check D6, D9 and the identity line)'
  union all select 15, 'logins', true, (select count(*) from auth.users)::text || ' (' || (select count(*) from auth.users where email_confirmed_at is null)::text || ' unconfirmed)',
    'information: compare with Authentication → Users'
)
select check_name, ok, found, expected from checks order by sort;
```

**Day one** (before the desk accepts the weekend's sign-ups, and again on Monday): the people and the class data the app
needs, which no migration makes on LIVE (the TEST project has them from `seed.sql`, never run on LIVE). Every `ok` should
be `true` by Tuesday's class; `false` names what to do in the app. READ-ONLY.

<!-- replay: day-one -->
```sql
-- Day-one readiness. READ-ONLY: selects only.
with staff as (select role, active, coalesce(btrim(full_name), '') as name, gender from profiles where role in ('guru', 'coordinator')),
checks(sort, check_name, ok, found, expected) as (
  select 1, 'Guru logins', (select count(*) from staff where role = 'guru' and active) >= 1,
    (select count(*) from staff where role = 'guru' and active)::text,
    '1 or more (the first Guru: Table Editor → profiles → role guru, OPERATIONS "Setting up a new environment"); 0 = nobody can make coordinators'
  union all select 2, 'coordinators', (select count(*) from staff where role = 'coordinator' and active) >= 1,
    (select count(*) from staff where role = 'coordinator' and active)::text,
    '1 or more by Tuesday: the Guru → Coordinators → a waiting login → Make a coordinator'
  union all select 3, 'staff without a name', (select count(*) from staff where active and name = '') = 0,
    (select count(*) from staff where active and name = '')::text, '0 (an empty name shows as blank in "posted by", mentor and reports; each sets it in My profile)'
  union all select 4, 'staff without a gender', (select count(*) from staff where active and gender is null) = 0,
    (select count(*) from staff where active and gender is null)::text,
    '0: students get a mentor of their own gender; without it Accept leaves them "mentor needed" (Coordinators → the person → gender)'
  union all select 5, 'centres', (select count(*) from centres where active) >= 1,
    (select string_agg(format('%s %s-%s %s%s%s', name, to_char(opens_at, 'HH24:MI'), to_char(closes_at, 'HH24:MI'), time_zone,
       case when lat is null then ', no GPS point' else '' end, case when city is null then ', no city' else '' end), '; ' order by id)
       from centres where active),
    'the real class hours (open visits are closed at the closing time each night); without a GPS point no check-in is flagged'
  union all select 6, 'syllabus items (Beginner / Intermediate / Advanced)',
    (select count(*) from syllabus_items i where i.level_id = 1 and i.retired_at is null) >= 1,
    (select string_agg(coalesce(n, 0)::text, ' / ' order by l.id) from levels l
       left join (select level_id, count(*) n from syllabus_items where retired_at is null group by level_id) c on c.level_id = l.id),
    'Beginner items before progress is ticked (the Guru → Lessons → a level → add an item); 0 = students see their level without a count'
  union all select 7, 'sign-ups waiting', true,
    (select count(*) from profiles where role = 'pending' and active)::text, 'information: the desk''s waiting list (and team members not yet made coordinators)'
)
select check_name, ok, found, expected from checks order by sort;
```

<!-- replay: row-counts -->
```sql
-- Rows per table, READ-ONLY (the same query as OPERATIONS "Restoring" step 4). Compare with the
-- backup log line of A2: after the migrations the old tables keep their counts; new tables hold
-- only the rows their migration adds (settings, options, taals, centres' fields).
select table_name, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', table_name),
       false, true, '')))[1]::text::int as rows
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
union all select '(auth.users)', count(*)::int from auth.users
order by 1;
```

Also: `/auth/v1/settings` (D9) still shows `"mailer_autoconfirm":false`; the cron health query of
[OPERATIONS.md](OPERATIONS.md#scheduled-jobs-health-check) the next morning shows every daily job
succeeded once.

## G. LIVE settings record

Fill in on the day; one row per setting, the value **as seen** in the dashboard (never a key or
password: write "set" and the fingerprint where there is one). Update a row whenever the setting
changes later, with the new date.

| Setting | Where | Expected | Seen on LIVE | Date | By |
|---|---|---|---|---|---|
| Replay commit | A3, `git log -1` | the main commit the replay passed on; migrations, functions (C4, C7) and the web site (E1) all from it | 512429d (replay passed on 600b620; migrations copied from 512429d raw) | 15-10-2026 | lead chat 10 |
| Last migration (probe) | SQL editor | `0050`, MISSING none | 0050, MISSING none | 16-10-2026 | lead chat 10 (Praveen pasted 0020-0050) |
| Backup before go-live | `backup-log.csv` | archive name, `before go-live` — or on 15 Oct 2026 `waived: LIVE empty (row counts <date>)` (A2 waiver) | waived: LIVE empty (row counts 15-10-2026: students/visits/guardians/consents 0, 2 team logins) | 15-10-2026 | lead chat 10, Praveen confirmed logins |
| Owner MFA | supabase.com Account → Security; organisation → Team | on for every Owner; members = __ | | | |
| Drift before / after | CSVs of A4, B-end | `ALL` hashes noted; KIND rows = TEST except the expected | before ALL 359 89928db8…; after ALL 1528 bbdb960a…; KIND rows = TEST except config_rows, pg_net, vault, 0049 | 15/16-10-2026 | lead chat 10 |
| Scheduled jobs | verification row 3 | 11 of 11 active | 11 of 11 active | 17-10-2026 | lead chat 10 |
| pg_net | Database → Extensions | on | on, 0.20.4 | 16-10-2026 | Praveen |
| Vault secret names | verification row 12 | `mridanga_project_url`, `mridanga_push_secret` | 2 of 2 | 16-10-2026 | Praveen |
| `PUSH_SECRET` | Edge Functions → Secrets | set; SHA-256 = Vault's | set; SHA-256 38fe99eb… (Vault digest compare: Praveen) | 16-10-2026 | Praveen |
| `notify-announcements` | `functions list` | ACTIVE, version __, from commit __ | ACTIVE, version 1, from main (512429d tree) | 16-10-2026 | Praveen |
| `notify-parents` | `functions list` | ACTIVE, version __, from commit __ | ACTIVE, version 1, from main (512429d tree) | 16-10-2026 | Praveen |
| `BREVO_API_KEY`, `NOTICE_FROM`, `NOTICE_REPLY_TO` | Edge Functions → Secrets | set; sender `notices@<domain>` (domain authenticated) — or none yet = dry run | none (dry run), as planned (S3-01) | 16-10-2026 | lead chat 10 |
| Parent emails (G10) | G10 Settings → Emails to parents | **off** until the consent line (#230, wording approved 10 Oct 2026) is on the paper form and the privacy notice; then on: check-out emails only (#246), "check-in" and "night" boxes unticked | off | 17-10-2026 | lead chat 10 |
| Email provider | Sign In / Providers → Email | on | on | 16-10-2026 | Praveen |
| Other providers, anonymous sign-ins | Sign In / Providers (D6b) | all off | all off; manual linking off | 16-10-2026 | Praveen |
| Exposed schemas | Data API settings (D6c) | `public`, `graphql_public` | public, graphql_public | 16-10-2026 | Praveen |
| Confirm email | Sign In / Providers → Email | **on** (auto-confirm off) | on (D7: confirmed after 354 s, by the link) | 17-10-2026 | Praveen |
| Minimum password length | Sign In / Providers → Email | 8 | 8 | 16-10-2026 | Praveen |
| `/auth/v1/settings` | D9 | `mailer_autoconfirm:false`, `disable_signup:false` | mailer_autoconfirm false, disable_signup false | 17-10-2026 | lead chat 10 |
| Custom SMTP | Emails → SMTP Settings | on, `smtp-relay.brevo.com:587`, sender __ | on, smtp-relay.brevo.com:587, Brevo SMTP login (…@smtp-brevo.com), sender = verified Gmail address (domain sender later) | 16-10-2026 | Praveen |
| Brevo sender | Brevo → Senders | verified: __ | verified (Gmail address; D8 reset arrived in Primary) | 17-10-2026 | Praveen |
| Brevo domain | Brevo → Domains | ⏳ authenticated `mridangaseva.com` | | | |
| Email rate limit | Authentication → Rate Limits | 100 an hour Fri 16 - Sun 18 Oct 2026, then 30 (new row with the date when it goes back) | 150 an hour (plan said 100) — set 30 on 19-10-2026 | 16-10-2026 | Praveen |
| Token refresh limit | Authentication → Rate Limits | ≥ 150 per 5 minutes per IP (R5-02) | 150 per 5 min | 16-10-2026 | Praveen |
| Sign-ups and sign-ins limit | Authentication → Rate Limits | 150 per 5 minutes per IP Fri 16 - Sun 18 Oct 2026, then 30 | 150 per 5 min — set 30 on 19-10-2026 | 16-10-2026 | Praveen |
| EAS `production` environment | `eas-cli env:list --environment production` (E0) | LIVE URL `qeozvv…` + `sb_publishable_…` key | qeozvv… + sb_publishable_okS0… | 16-10-2026 | lead chat 10 |
| Site URL | URL Configuration | `https://mridanga-seva.pages.dev`, then ⏳ `https://app.mridangaseva.com` | https://mridanga-seva.pages.dev | 16-10-2026 | Praveen |
| Redirect URLs | URL Configuration | exactly the Site URL's origin (two during the switch); no localhost, no wildcard | https://mridanga-seva.pages.dev only | 16-10-2026 | Praveen |
| Live web site | Cloudflare `mridanga-seva` | `version.txt` commit __ | version.txt live 60db35b (deployment 6bb0dcd6) | 16-10-2026 | lead chat 10 |
| Production APK | EAS build page; OPERATIONS APK log | build id __, commit __, fingerprint __, versionCode __, same keystore as preview | 90c6d1cd, f835830, 23dc7e4a, vc12, keystore lzS_QanDLs (same as preview) | 16-10-2026 | Praveen |
| Website download link | public website `apkUrl` (E7) | the production APK above | 90c6d1cd build page (EAS deletes it 30-10-2026: move to Drive link) | 17-10-2026 | lead chat 10 |
| Custom domain | Cloudflare `mridanga-seva` → Custom domains | ⏳ `app.mridangaseva.com` active | | | |
| Real sign-up mail | D7 | arrived in the inbox, link opened the site | arrived, link opened the site, login pending | 17-10-2026 | Praveen |
| Real reset mail | D8 | arrived, new password works | arrived in Primary after the sender was verified | 17-10-2026 | Praveen |
| Region | Project Settings → General (or `supabase projects list`) | South Asia (Mumbai) (processors table, OPERATIONS) | **ap-southeast-2, Sydney** — kept (#398); privacy notice and processors table now say Sydney, Australia | 17-10-2026 | lead chat 11, Praveen's choice |

## How the replay proves part B

`supabase/tests/live-replay.mjs` (`npm run replay`, also inside `npm test`, about 20 seconds) builds an
in-memory Postgres at LIVE's state: 0001-0011, then rows of every kind LIVE can hold at 0011 (staff
and student logins, students with a minor's guardian and consents, open and closed visits, a call
and a follow-up task, ticks, a material, a group, published, scheduled and replied-to announcements,
a push token). Then it:

1. checks the migration folder holds exactly 0001-0011 and the files of part B, in this table's order;
2. runs each file of part B in one transaction and stops at the first error; after each, the probe
   above must name that file;
3. runs each file a second time: it must change nothing (schema, grants, policies, jobs, every row),
   or be refused as a whole with "Run once" in its header; a refused or rolled-back run must leave
   the database unchanged;
4. compares the result with a fresh build of every migration (what TEST and CI have): same
   functions, grants, tables, constraints, indexes, policies, triggers, views, jobs and buckets;
5. runs part F's verification and row-count SQL on the result.

What it cannot prove: pg_cron really running, pg_net, the Vault, Auth and SMTP, Storage limits, and
LIVE holding rows of a shape the sample does not have. Those are parts C-F on LIVE itself.
