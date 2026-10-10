# LIVE go-live checklist (audit brief 8)

The ordered steps that take the live Supabase project `qeozvvizcojzxcjgnaei` from where it stands
(migrations 0001-0011, Praveen's login, no class data) to the pilot: every later migration, push
notifications, real sign-up and reset emails, and the live web site. Written 10 Oct 2026 against
main `bcdb2bb` ([DECISIONS.md #232-#234](DECISIONS.md)). Linked from
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

**Order on the day:** A → B → E1-E2 (the same day as B, for 0034) → C → D1, D3-D6 → D7-D9 → F → G.
The ⏳ DOMAIN steps (D2, E3-E6) follow whenever the domain is on Cloudflare.

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
| A2 | Praveen · terminal | **Backup** of LIVE, exactly as [OPERATIONS.md "Backups"](OPERATIONS.md#backups) "Each backup" (three `pg_dump` files, row counts, 7-Zip, log line with note `before go-live`) | A `.7z` that opens, a line in `backup-log.csv` | No computer can run `pg_dump` (the office PC cannot, 7 Oct 2026): **the go-live waits.** A backup is the only way back from a bad migration |
| A3 | Praveen · terminal | In the main folder: `git pull`, then `cd supabase\tests`, `npm ci`, `npm test` | Ends with `Replay passed: LIVE can take the go-live migrations in this order.` and `All checks passed` | A failure names the file. Nothing goes to LIVE until it passes on main |
| A4 | Praveen · dashboard | LIVE → SQL Editor: paste the **drift query** ([OPERATIONS.md "Releasing a change"](OPERATIONS.md#releasing-a-change-database-first)), Run, **Download CSV** as `drift-live-before-<date>.csv` | About 300 rows | Keep the file with the backup log; it is the "before" picture |
| A5 | Praveen | Pick a time with no class and two free hours. 0034 needs the live web site the same day (B, step M0034) | | |

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
  ('0043', to_regclass('public.parent_notices') is not null)
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

## B. Migrations 0013-0043, one file per run

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
| M0034 | `0034_access_log.sql` | Praveen · dashboard | `schedule` table, one row; probe `0034` | **Run once** (its header does not say so; a second paste is refused with `relation "access_log" already exists`). **The same day as the app update** ([OPERATIONS.md](OPERATIONS.md#releasing-a-change-database-first), [#146](DECISIONS.md)): an app from before it shows students with no parent, consent or calls. On go-live day the only LIVE app is the live web site (no production APK exists yet, brief 9), so part E1 follows this part the same day. If a production APK exists by then, also `npm run update:production` straight after B |
| M0035 | `0035_asset_labels.sql` | Praveen · dashboard | No rows; probe `0035` | |
| M0036 | `0036_account_creation.sql` | Praveen · dashboard | No rows; probe `0036` | |
| M0037 | `0037_db_backlog.sql` | Praveen · dashboard | No rows; probe `0037` | |
| M0038 | `0038_app_correctness.sql` | Praveen · dashboard | No rows; probe `0038` | Adds four checks as NOT VALID: old rows are not checked, new ones are |
| M0039 | `0039_security_backlog.sql` | Praveen · dashboard | No rows; probe `0039` | |
| M0040 | `0040_ops_backlog.sql` | Praveen · dashboard | `schedule` table (two jobs); probe `0040` | Adds `mridanga-cron-history-purge`, `mridanga-orphan-files`. Until C4 the old function ignores the orphan-files call |
| M0042 | `0042_app_leftovers.sql` | Praveen · dashboard | No rows; probe `0042`, `MISSING` `none` | Stops with `roll_no_missing` (changing nothing) if a student has no roll number: run the hint's select, give each one a roll number with a chat's help, run 0042 again |
| M0043 | `0043_parent_notices.sql` | Praveen · dashboard | `schedule` table (one job); probe `0043`, `MISSING` `none` | Adds `mridanga-parent-notices` (answers `off`: parent emails stay off until the Guru ticks them on G10). Its Edge Function is C7-C8 |

**A file newer than 0043 on main:** the replay's first check fails until this table lists it. Add it
here, with its own steps, then run it last.

**B-end.** Paste the **verification SQL** (part F) and the drift query again. Download the drift CSV
as `drift-live-after-<date>.csv`, run the same drift query on TEST, and compare the `KIND:` rows
([OPERATIONS.md "Releasing a change"](OPERATIONS.md#releasing-a-change-database-first) step 4).
Expected differences only: `config_rows`, `vault_secret` until part C, and the objects of any
migration TEST has run that is not on main yet (none on 10 Oct 2026: TEST and main both end at 0043).

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
| C6 | Praveen · dashboard | A minute later: `select last_job_at, last_job_result from push_status;` | `last_job_at` within the last minutes; `last_job_result` `nothing_due` or `called` | `not_set_up`: C1 or C2 is missing, or the URL is not `https://<ref>.supabase.co` |
| C7 | Praveen · terminal | Parent emails' function, same folder and commit as C4: `npx supabase@latest functions deploy notify-parents --project-ref qeozvvizcojzxcjgnaei --no-verify-jwt --use-api`, then `functions list` | `notify-parents` ACTIVE, version 1 | As C4. It needs no secret of its own to deploy: without `BREVO_API_KEY` / `NOTICE_FROM` it only does dry runs ([OPERATIONS.md "Parent notices by email"](OPERATIONS.md#parent-notices-by-email)) |
| C8 | Praveen · terminal | `curl.exe -s -X POST https://qeozvvizcojzxcjgnaei.supabase.co/functions/v1/notify-parents` | `{"error":"not_allowed"}` | As C5. Brevo secrets and switching the emails on are later steps (OPERATIONS "On LIVE"), not go-live |

The real push test needs the production APK (brief 9): OPERATIONS step 12 with it, then.

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
| D5 | Praveen · dashboard | **Authentication → Rate Limits**: emails per hour `30` | 30 | |
| D6 | Praveen · dashboard | **Authentication → Sign In / Providers → Email**: Email **on**, **Confirm email on**, minimum password length **8**, Secure email change on. **Authentication → URL Configuration**: Site URL `https://mridanga-seva.pages.dev`; Redirect URLs exactly `https://mridanga-seva.pages.dev` (the app sends the site's origin, no path). **No localhost** and no wildcard: delete `http://localhost:8081` if it is still there (brief 1a). After part E2 the addresses change (E3) | As written | |
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
| E1 | Praveen · terminal | On the PC with `app/.env.live` (LIVE URL + publishable key): from `app/`, on main at the replay's commit, `npm run export:web -- --site live`; then the first upload as [OPERATIONS.md "Publishing the web version"](OPERATIONS.md#publishing-the-web-version) "First upload" (project name `mridanga-seva`, drag and drop) or `npx wrangler@4 pages deploy dist --project-name mridanga-seva --branch main` | The script's last line names site `live`, Cloudflare project `mridanga-seva`, Supabase `qeozvv…`; Cloudflare shows `https://mridanga-seva.pages.dev` | *Settings file missing*: on 10 Oct 2026 the main folder still had only `app/.env` (= LIVE); move it to `app/.env.live` first (app/README.md "Settings files", [#145](DECISIONS.md)). Cloudflare added letters to the name: use the address it shows everywhere in D6 and here. From a worktree, wrangler without `--branch main` makes a preview, not the site |
| E2 | Praveen · terminal | The header check and upload-log row of OPERATIONS "After every upload", on `https://mridanga-seva.pages.dev` | CSP with `https://qeozvvizcojzxcjgnaei.supabase.co`, HSTS, `nosniff`; `version.txt` names site live and the commit | |
| E3 | Praveen · dashboard | **⏳ DOMAIN** Cloudflare → `mridanga-seva` → **Custom domains → Set up a custom domain** `app.mridangaseva.com` (Cloudflare adds the CNAME itself once the zone is Active) | `https://app.mridangaseva.com` opens the app with a padlock | The zone is not Active yet: the domain move is not finished |
| E4 | Praveen · dashboard | **⏳ DOMAIN** Supabase LIVE → URL Configuration: Site URL `https://app.mridangaseva.com`; Redirect URLs `https://app.mridangaseva.com` and, for a week while old mails are still around, `https://mridanga-seva.pages.dev`; then remove the pages.dev one | As written | |
| E5 | Praveen | **⏳ DOMAIN** Repeat D7 and D8 once from `https://app.mridangaseva.com` | Both links open `app.mridangaseva.com` | As D7 |
| E6 | Praveen · terminal | **⏳ DOMAIN** The website: OPERATIONS "The public website" → "Going live" (attach `mridangaseva.com`, `app.webLive: true` once E3 works) | | |

## F. After go-live: verification (read-only)

Paste into LIVE's SQL editor. Every row's `ok` must be `true`, except the two the `expected` column
explains. Then the row counts below, and record the results in part G.

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
  ('0043', to_regclass('public.parent_notices') is not null)
),
last_in_order as (select coalesce(max(a.migration), 'before 0010') as v from m a
  where a.present and not exists (select 1 from m b where b.migration <= a.migration and not b.present)),
missing as (select coalesce(string_agg(a.migration, ' ' order by a.migration), 'none') as v from m a
  where not a.present and exists (select 1 from m b where b.present and b.migration > a.migration)),
jobs(name) as (values ('mridanga-status-refresh'), ('mridanga-close-visits'), ('mridanga-push'), ('mridanga-inbox-cleanup'),
  ('mridanga-assessments'), ('mridanga-events-polls'), ('mridanga-duty'), ('mridanga-access-log-purge'),
  ('mridanga-cron-history-purge'), ('mridanga-orphan-files'), ('mridanga-parent-notices')),
checks(sort, check_name, ok, found, expected) as (
  select 1, 'last migration', (select v from last_in_order) = '0043', (select v from last_in_order), '0043'
  union all select 2, 'migrations missing', (select v from missing) = 'none', (select v from missing), 'none'
  union all select 3, 'scheduled jobs',
    (select count(*) from jobs j join cron.job c on c.jobname = j.name and c.active) = 11,
    (select count(*) from jobs j join cron.job c on c.jobname = j.name and c.active)::text || ' of 11', '11 of 11 (active)'
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
      and has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'sign_up_choices'),
    coalesce((select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'sign_up_choices'), 'none'), 'none (sign_up_choices is the one public function, #163)'
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
| Last migration (probe) | SQL editor | `0043`, MISSING none | | | |
| Backup before go-live | `backup-log.csv` | archive name, `before go-live` | | | |
| Drift before / after | CSVs of A4, B-end | `ALL` hashes noted; KIND rows = TEST except the expected | | | |
| Scheduled jobs | verification row 3 | 11 of 11 active | | | |
| pg_net | Database → Extensions | on | | | |
| Vault secret names | verification row 12 | `mridanga_project_url`, `mridanga_push_secret` | | | |
| `PUSH_SECRET` | Edge Functions → Secrets | set; SHA-256 = Vault's | | | |
| `notify-announcements` | `functions list` | ACTIVE, version __, from commit __ | | | |
| `notify-parents` | `functions list` | ACTIVE, version __, from commit __ | | | |
| `BREVO_API_KEY`, `NOTICE_FROM`, `NOTICE_REPLY_TO` | Edge Functions → Secrets | set; sender `notices@<domain>` (domain authenticated) — or none yet = dry run | | | |
| Parent emails (G10) | G10 Settings → Emails to parents | **off** until the team's decisions (DECISIONS #231) and consent line (#230) | | | |
| Email provider | Sign In / Providers → Email | on | | | |
| Confirm email | Sign In / Providers → Email | **on** (auto-confirm off) | | | |
| Minimum password length | Sign In / Providers → Email | 8 | | | |
| `/auth/v1/settings` | D9 | `mailer_autoconfirm:false`, `disable_signup:false` | | | |
| Custom SMTP | Emails → SMTP Settings | on, `smtp-relay.brevo.com:587`, sender __ | | | |
| Brevo sender | Brevo → Senders | verified: __ | | | |
| Brevo domain | Brevo → Domains | ⏳ authenticated `mridangaseva.com` | | | |
| Email rate limit | Authentication → Rate Limits | 30 an hour | | | |
| Site URL | URL Configuration | `https://mridanga-seva.pages.dev`, then ⏳ `https://app.mridangaseva.com` | | | |
| Redirect URLs | URL Configuration | exactly the Site URL's origin (two during the switch); no localhost, no wildcard | | | |
| Live web site | Cloudflare `mridanga-seva` | `version.txt` commit __ | | | |
| Custom domain | Cloudflare `mridanga-seva` → Custom domains | ⏳ `app.mridangaseva.com` active | | | |
| Real sign-up mail | D7 | arrived in the inbox, link opened the site | | | |
| Real reset mail | D8 | arrived, new password works | | | |
| Region | Project Settings → General | South Asia (Mumbai) (processors table, OPERATIONS) | | | |

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
