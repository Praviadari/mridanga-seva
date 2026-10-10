# Operations

How to set up, run and hand over the live system. Keep this current: whoever runs the system next
will rely on it.

## Accounts the system depends on

| Service | Used for | Plan | Target owner | Holder today (9 Oct 2026) |
|---|---|---|---|---|
| Supabase | Database, login, storage (photos and PDFs), scheduled jobs, the Edge Function that sends push notifications | Free (1 GB of files, 500,000 Edge Function calls a month) | Team email account | Maintainer's personal login, organisation "Mridanga Seva" |
| Brevo | Sending sign-up and password-reset emails | Free (300 emails a day) | Team email account | **Not set up yet** (audit brief 8) |
| Expo | Building the Android app (EAS Build) and updating it on the phones (EAS Update); its push service passes notifications on | Free (15 Android builds a month; updates for 1,000 people a month, 100 GiB of downloads) | Team email account | Maintainer's personal account |
| Firebase (Google) | Delivers push notifications to Android phones (Cloud Messaging) | Free | Team email account | Maintainer's personal account |
| Cloudflare | Hosting the web version and the public website (Cloudflare Pages) | Free | Team email account | Maintainer's personal account |
| Zoho | The domain mridangaseva.com (registrar) and the team's mail (info@, privacy@ aliases) | Zoho Mail free plan | Team Zoho account | **[[TEAM]]:** confirm |
| GitHub | Source code | Free, public repository | Maintainer | Maintainer's personal account |
| YouTube | Lesson videos | Free | Team or channel owner | **[[TEAM]]:** confirm |

Keep the logins for these in one place the team controls, so the system never depends on one person.

**For now (from 30 Sep 2026) Supabase, Cloudflare, Expo and Firebase are on the maintainer's
personal account, and Brevo does not exist yet**, because the team email does not exist yet. The
"Target owner" column and the steps below that say "team email" describe where they should end up. When it does, add it to each with full
rights (Cloudflare: a Super Administrator member of the account; Expo: an Owner of the
organisation that owns the app; Firebase: an Owner in **Project settings → Users and
permissions**), check that it can sign in, then remove the personal account. The sites, the app's
project id and its signing keystore stay the same, so nothing needs rebuilding.

### Who processes the data (processors)

Every service below receives some personal data from the app or the website. Parents are told
about them in the privacy notice (website, `privacy.html`); this table is the team's register
([DECISIONS.md #149](DECISIONS.md)). Checked against the code on 7 Oct 2026. **[[TEAM]]:** for each
row, find and file the provider's data processing terms (DPA) and confirm the region, then fill
the last column. India has not yet listed any country to which transfers are restricted (DPDP Act
s.16), so a processor abroad is allowed, but it must be recorded and named in the notice.

| Service | What it does for us | Personal data it sees | Where | Terms filed |
|---|---|---|---|---|
| Supabase | Database, logins, files, scheduled jobs, Edge Functions | Everything the app stores: students (minors too), parents' contacts, consents, attendance, call notes, logins, photos and recordings | Project region South Asia (Mumbai), per "Setting up a new environment" step 1; the company is in the USA and its support can reach the project. **[[TEAM]]:** check the LIVE project's region in Project Settings | [[TEAM]] |
| Expo (EAS Build, EAS Update, push service) | Builds the Android app, sends app updates, passes push notifications on to Google | App code (no data); for each notification: the phone's push token, the title and text (an announcement title, an event, a reply; may hold a name) | USA (provider's own regions) | [[TEAM]] |
| Google Firebase Cloud Messaging | Delivers push notifications to Android phones | Same as Expo's push service: token, title, text | Google's regions | [[TEAM]] |
| Brevo (**planned**: live sign-up mail, audit brief 8; parent codes once its key is set) | Sends sign-up confirmations, password resets and Ishtagoshti parent codes | Email address, the person's name in the mail, the mail's text | EU (France) | [[TEAM]] |
| Cloudflare (Pages) | Serves the web version of the app and the public website | Visitors' IP addresses and request details in its logs; the app's data goes from the browser straight to Supabase, not through Cloudflare | Worldwide edge | [[TEAM]] |
| Zoho Mail | The team's mail: privacy@ and info@ | Whatever parents write to us: requests, complaints, their contact details | **[[TEAM]]:** the account's data centre (zoho.in = India, zoho.com = USA) | [[TEAM]] |
| YouTube (Google) | Lesson videos shown in the app | The viewer's IP address and device, and YouTube's own cookies on the web; the app sends it no names | Google's regions | YouTube's terms |
| GitHub | Source code (public) | None: no personal data is kept in the repository | USA | — |

jsDelivr is no longer one: since brief 13 the web QR reader is served from our own site ([DECISIONS.md #143](DECISIONS.md)).

Change this table (and tell the website owner, so the notice follows) whenever a service is added,
removed or starts seeing different data.

## Setting up a new environment

1. **Create a Supabase project** (free plan) inside the "Mridanga Seva" organisation. Region: South
   Asia (Mumbai). Let Supabase generate the database password and keep it in a password manager —
   never in this repository or a chat. Turn on **Enable automatic RLS**.
2. **Create the tables** — step by step:
   1. On GitHub, open [`supabase/migrations/0001_phase1.sql`](../supabase/migrations/0001_phase1.sql)
      and click **Copy raw file** (the copy icon at the top right of the file).
   2. In Supabase, open **SQL Editor → New query**, paste, and click **Run**. **Before pressing
      Run, check which project is open**: its name is at the top of the dashboard, and its
      reference is in the address bar. The live and test projects look the same.
   3. You should see *Success. No rows returned.* A file that creates a scheduled job with a
      top-level `select cron.schedule(...)` line (0001:496-497, 0011:180, 0015:136, 0016:778,
      0022:885, 0023:549, 0033:210, 0034:77) may instead show a small table with one column,
      `schedule`, holding the job's number (2 for 0001, 3 for 0011 on a new project); that also
      means it worked. Do not run such a file again because of it.
   4. If it fails on `pg_cron`: open **Database → Extensions**, switch on **pg_cron**, and run the
      same query again. A failed run changes nothing, so running it again is safe.
   5. Run every later migration the same way, in number order: `0002_login_linking.sql`, then
      `0003_register_student.sql`, `0004_attendance.sql`, `0005_students_follow_up.sql`, and so on. **Run 0002 straight after
      0001**: without it the first Guru cannot be set (step 7) and internal functions are open.
      **Numbers 0012 and 0016-0018 (Phase 2, renumbered 3 Oct 2026).** Main has no 0012. Phase 2 was
      built on branches as 0012_assessments, 0014_promotion and 0016_practice; when it merged into
      main they became `0016_assessments.sql`, `0017_promotion.sql` and `0018_practice.sql` (same
      SQL), followed by `0019_phase2_inbox.sql` ([DECISIONS.md #55](DECISIONS.md)). The **test**
      project ran the three under their old names and needs only **0019**. The **live** project
      runs **0013, 0014, 0015, 0016, 0017, 0018, 0019 in number order** (0001-0011 are on it already;
      check with `select count(*) from information_schema.tables where table_name = 'push_outbox';`
      = 0 before 0016). Running a Phase 2 file again on the test project is not needed: it would
      fail on its first `create table`, and a failed run changes nothing.
3. **Test project only — add the dummy data:** do the same with [`supabase/seed.sql`](../supabase/seed.sql)
   in a new query. Check under **Table Editor → students**: 15 students, roll numbers
   `MS-2026-0001` to `MS-2026-0015`. Never run the seed on the live project. Its header lists the
   steps it cannot do (creating staff logins, assigning mentors). Since 6 Oct 2026 the seed opens
   with a guard: on a project that already has any student or announcement it stops with
   *seed.sql refused* and changes nothing ([DECISIONS.md #122](DECISIONS.md)). The guard cannot
   tell an **empty** live project from an empty test one, so still check the project name first.

   **If the seed was run on the live project by mistake** (it happened once, on 29 Sep 2026), remove
   it in the live project's SQL editor with the block below. It refuses, and deletes nothing, if
   the project holds any student, announcement, group, material or syllabus item that the seed did
   not create, so it cannot remove real records. Copies of the fictional rows stay in `audit_log`.
   ```sql
   -- Seed clean-up (guarded): removes the dummy data of seed.sql and nothing else.
   do $$
   begin
     if exists (select 1 from students where full_name not in ('Arjun Rao', 'Meera Iyer',
          'Karthik Reddy', 'Sanjana Varma', 'Rohan Gupta', 'Lakshmi Prasad', 'Vikram Joshi',
          'Ananya Sharma', 'Suresh Naidu', 'Divya Menon', 'Harish Kumar', 'Pooja Patel',
          'Naveen Chandra', 'Gayatri Devi', 'Bhaskar Murthy'))
        or exists (select 1 from announcements where title <> 'Welcome to Mridanga Seva')
        or exists (select 1 from groups where name not in ('Sunday Harinam', 'Festival kirtan',
          'Beginners follow-up'))
        or exists (select 1 from materials where title not in ('How to sit with the mridanga',
          'Kaherva taal — notation'))
        or exists (select 1 from syllabus_items where title not in ('Holding the mridanga', 'Dayan bols', 'Baya bols', 'Combined bols',
          'Practice phrases', 'Elementary kirtan rhythm', 'Kaherva taal',
          'Prabhupada / Dasapahira taal', 'Bhajani taal', 'Dadra and Khemta', 'Lopha taal',
          'Fast 8- and 6-beat cycles', 'Cadences and tihais', 'Mukhras')) then
       raise exception 'clean-up refused: this project holds records that seed.sql did not make. Nothing was deleted.';
     end if;
     delete from students;        -- also their parents, consents, visits, calls, follow-ups, progress
     delete from roll_counters;   -- the first real student gets MS-<year>-0001 again
     delete from announcements;   -- before groups: announcements point to groups
     delete from materials;       -- before syllabus_items: materials point to syllabus items
     delete from groups;
     delete from syllabus_items;
   end $$;
   ```

   **If the SQL editor only shows a spinning circle,** the network is blocking the editor's files
   (common on office networks). Try Ctrl + F5, another browser, a private window, or another
   network such as home Wi-Fi or a phone hotspot. As a last resort, use the Supabase CLI from a
   terminal in the repository folder — it asks for the database password, which you type yourself:
   ```bash
   npx supabase login
   npx supabase init
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   The project ref is the part before `.supabase.co` in the project URL. `supabase init` creates
   `supabase/config.toml`; **do not commit it** (the repository keeps none, `git ls-files supabase`;
   the Edge Function deploy in "Push notifications" step 10 needs none either).
4. **Auth settings:**
   - **Authentication → Sign In / Providers → Email:** keep Email enabled. Set the minimum
     password length to **8** (the app asks for 8 too).
   - **Confirm email:** while testing with dummy data and without step 5, you may turn it off (the
     built-in email sends only 2 emails an hour). **Turn it on before any real student record
     exists**: while it is off, anyone can sign up with a student's email and be linked to that
     student's record ([DECISIONS.md #13](DECISIONS.md)), and sign-up says whether an email already has
     an account (D3-16).
   - **Authentication → URL Configuration:** set **Site URL** to the address of the web version
     that talks to this project: `https://mridanga-seva.pages.dev` for the live project,
     `https://mridanga-seva-test.pages.dev` for the test one (see "Publishing the web version"). Under
     **Redirect URLs** add that address. **Test project only:** also add `http://localhost:8081`
     for development; the live project lists only the live site's address. Links in
     sign-up and password-reset emails open these addresses; the Android app uses the Site URL.
5. **Email (SMTP):** in Brevo, verify the sender email and create an SMTP key. In Supabase, go to
   Authentication → SMTP settings and enter Brevo's host `smtp-relay.brevo.com`, port 587, login and key.
   Without this, Supabase sends only 2 emails an hour.
6. **App settings:** copy `app/.env.example` to `app/.env.development` and `app/.env.test` with
   the **test** project's URL and anon / publishable key (**Project Settings → API Keys**), and
   only on a computer that builds the class's site to `app/.env.live` with the live project's
   values. Keep no plain `app/.env` (app/README.md "Settings files", [DECISIONS.md #145](DECISIONS.md)):
   development then always talks to the test project. Never use the `service_role` or
   `sb_secret_...` key in the app: the app refuses to start with it. Then run the app:
   ```bash
   cd app
   npm install
   npx expo start
   ```
   Press `w` for the web version in a browser, or scan the QR code with Expo Go on an Android
   phone. If the app shows *App not set up*, the URL or key in `app/.env.development` is missing; restart
   `npx expo start` after changing it.
7. **First Guru account:** sign up in the app and confirm the email. Then in the Supabase
   **Authentication → Users**, copy that login's **User UID**; in **Table Editor → profiles** find the
   row with that `id` (not by email) and set `role` to `guru`. After that, the Guru gives roles from
   the app (G2). Always match a login by its user id: before 0028 any login could write any email into
   its own profile row, so a row found by email may be an impostor's ([DECISIONS.md #97](DECISIONS.md)).

## Paper consent forms

For a student under 18, the parent fills in and signs a paper consent form at the desk, and the
coordinator ticks in the app that it was received ([DECISIONS.md #16](DECISIONS.md)). The app
stores only that it was given and the form signed (the tick, required since 0025, #74), when, by whom it
was checked, and which type of ID was seen.

Suggested practice, until the team agrees its own (with the temple's legal adviser):

- Keep the signed forms together, in a closed file at the centre that only coordinators use.
- A parent (or an adult student) may withdraw consent at any time: see "Consent withdrawal" below.
  A request to delete the data: "Erasure request".
- The wording of the form itself is still to be agreed.

## Consent withdrawal

Only the Guru records a withdrawal ([DECISIONS.md #75](DECISIONS.md)). It **freezes** the record:
the student's login is switched off, their phones get no more notifications, all consents are
revoked, and nothing new (attendance, calls, ticks, edits) can be recorded. The history stays
until the Guru erases the record or the parent consents again.

1. Write down, privately: the date, who asked (parent / student), how (in person, phone, email),
   and the student's roll number. Keep the parent's written request with the consent forms if
   there is one. A restore from a backup needs this register ("Backups → Restoring", step 5).
2. Supabase → SQL editor of the right project (TEST first when practising), find the student:
   `select id, roll_no, full_name from students where roll_no = 'MS-2026-0042';`
3. Run `select withdraw_consent('<id>', 'mother, by phone, 5 Oct 2026');` (the note is at most
   500 characters; no ID numbers). It answers with the roll number, how many consents were
   revoked and whether a login was switched off.
4. Tell the coordinators that the student is withdrawn (the app answers "consent withdrawn" if
   they try to mark or call them). Decide with the parent whether the record is to be erased; if
   so, follow "Erasure request".

**If the parent consents again:** a new paper form is signed. Then, in the SQL editor:
`update students set withdrawn_at = null, withdrawn_note = null where id = '<id>';`, insert the new
consent (`insert into consents (student_id, scope, method, id_type_checked, signed_form, verified_by)
values ('<id>', 'data', 'written', '<id type>', true, '<Guru''s login id>');`), and switch the
login on again in G2.

## Erasure request

Only the Guru erases ([DECISIONS.md #76](DECISIONS.md)). It cannot be undone, so check the
request first.

1. Check who asks: the parent of a minor, or the adult student themselves. Write down privately
   the date, who asked, how, and a request reference (e.g. `ER-2026-01`). After a restore from a
   backup this register is how the erasure is made again ("Backups → Restoring", step 5).
2. If the student holds a lent instrument, take it back and record the return in C19 first.
3. Supabase → SQL editor, find the student (`select id, roll_no, full_name from students where
   roll_no = '...';`), then run:
   `select erase_student('<id>', 'parent asked to delete the data', 'ER-2026-01');`
4. It answers `{ roll_no, login_deleted, audit_rows_redacted, files }`:
   - `files`: Storage paths still to delete. Supabase → Storage → the bucket in the path
     (`assessment-files`, or the photo's bucket) → find each path → Delete.
   - `login_deleted: false`: the login could not be deleted from the SQL editor. Supabase →
     Authentication → Users → find the email the parent gave → Delete user.
5. Destroy the paper consent form as agreed with the parent, or keep it only as long as the team's
   retention rule says (to be agreed).
6. The tombstone (roll number, date, who, reason, reference) stays in `erasures`:
   `select * from erasures order by erased_at desc;` This is the proof that the request was met.

## Staff who leave

A coordinator who stops: the Guru switches the login off in the app (G2); that is enough for a
break. When they leave for good, or ask for their data to go ([DECISIONS.md #196](DECISIONS.md)),
the maintainer anonymises the login in the Supabase SQL editor (since 0040). A login that did any
work cannot simply be deleted: the records say who registered, marked or called.

1. Check the login is switched off and holds nothing: hand their mentees to someone else (G2,
   "Reassign"), and any instrument or fund role they had.
2. Find it: `select id, full_name, email, role, active from profiles where email = '...';`
3. Run, with a reason and a reference (e.g. `ST-2026-01`):
   `select anonymise_staff('<id>', 'left the team', 'ST-2026-01');`
4. It answers `{ login_deleted, login_scrubbed, audit_rows_redacted }`:
   - `login_deleted: true`: the login did nothing and is gone. Done.
   - `login_scrubbed: true`: the login stays only as a row with the email `<id>@former-staff.invalid`
     (nobody can sign in with it), and the person shows as **Former staff** in the app's history.
     This is what TEST answered on 10 Oct 2026.
   - both `false`: the SQL editor may not change Supabase's login table. In **Authentication →
     Users**, find the email from step 2 and use **Ban user** (or remove the email under the
     user's details); the profile is anonymised anyway.
5. The tombstone stays: `select erased_at, reason, request_ref from erasures where staff_profile is not null;`

Errors: `switch_off_first` (step 1), `not_staff` (a student: "Erasure request"; a subscriber leaves
in the app), `not_yourself`, `reason_required`.

## Requests from parents

A parent (for a child) or an adult student may ask what we keep about them, have it corrected or
deleted, withdraw consent, or complain ([DECISIONS.md #148](DECISIONS.md); DPDP Act ss.11-13, Rules
2025 Rule 14). They may ask at the desk, by phone, or by mail to **privacy@mridangaseva.com**.

**Owner:** Praveen (the maintainer) handles every request; if he is away for more than three days,
the Guru. **[[TEAM]]:** confirm the owner and the deputy, and name them in the privacy notice as the
contact.

**Time limits (publish the same ones in the notice):** acknowledge within **3 working days**;
answer within **30 days** of the request, and never later than **90 days** (Rule 14). If an
answer will take longer than 30 days, tell the person why and when, before the 30 days end.

**Check who asks before giving or changing anything.** The parent of a minor: the guardian's phone
or email on the record (call back on that number; do not trust a new number in the request). An
adult student: their own signed-in app login or the email on their record. Never send a child's
details to an address that is not on the record.

**The request log.** Keep it in the team's private folder (a spreadsheet), **never in this
repository**. One row per request:

| Column | What goes in |
|---|---|
| Ref | `RQ-2026-01`, then `RQ-2026-02` ... (erasures keep their `ER-` reference too) |
| Received | Date, and how (desk, phone, privacy@) |
| From | Parent of `<roll number>` / adult student `<roll number>` (no other personal details here) |
| Kind | Access, correction, erasure, withdrawal, grievance, other |
| Identity checked | How (call-back to the phone on record, signed-in login ...) |
| Acknowledged | Date |
| Answered | Date, and what was done |
| Within 30 / 90 days | Yes / no, and why not |

**What to do for each kind:**

- **Access** ("what do you keep about my child?"): in the live project's SQL editor, find the
  student (`select id, roll_no, full_name from students where roll_no = '...';`) and send the person
  the student record, the guardians and consents, the attendance count, levels and syllabus ticks,
  and the call notes about them. Send it only to the checked contact; a PDF or the mail text, not a
  shared link.
- **Correction:** the Guru corrects the record in the live project's SQL editor (Table Editor
  or `update students set phone = '...' where id = '...';`, `update guardians set phone = '...'
  where id = '...';`); the change is kept in `audit_log`. A consent is never edited: revoke it and
  record a new one ("Consent withdrawal" → "If the parent consents again").
- **Withdrawal of consent:** "Consent withdrawal" above (`withdraw_consent`).
- **Erasure:** "Erasure request" above (`erase_student`).
- **Grievance** (a complaint about how we handled their data): the owner answers it in writing
  within the same limits. If the person is not satisfied, tell them they may complain to the Data
  Protection Board of India, as the notice says.

Log the answer even when the request is refused (say why: for example, the person could not be
identified).

## Publishing the web version

iPhone users use the web version and can add it to their home screen. It is hosted on
**Cloudflare Pages** ([DECISIONS.md #23](DECISIONS.md)), as two sites that look the same:

| Site | Build with | Talks to | Settings file | Used by |
|---|---|---|---|---|
| `mridanga-seva-test` | `--site test` | the test Supabase project `fhuqykssenuhczdqbafu` (dummy data) | `app/.env.test` | demos, testers, volunteers |
| `mridanga-seva` | `--site live` | the live Supabase project `qeozvvizcojzxcjgnaei` | `app/.env.live` | the class, from the pilot on (later at `app.mridangaseva.com`) |

Both files hold the two lines of `app/.env.example`, filled in with that project's URL and
publishable key. Build on any computer that has the file:

```bash
cd app
npm run export:web -- --site test
```

`--site live` builds the class's site. Without `--site` the script stops; it never guesses
([DECISIONS.md #145](DECISIONS.md)). The last line it prints names the site, the Cloudflare project
to upload to, the Supabase project and the build id: check it before uploading. The site is written
to `app/dist/`. Always use this command, not a bare `npx expo export`, because
`scripts/export-web.mjs`

- reads the site's file, refuses if its URL is not that site's project, hands the settings to Expo
  with `EXPO_NO_DOTENV=1` (so Expo loads no `.env` file of its own) and clears Metro's cache (an old
  cache once produced a site that said *App not set up*);
- moves the images Expo puts under `assets/node_modules` (such as the back arrow) to
  `assets/vendor` — Cloudflare Pages never uploads a folder named `node_modules`, so those images
  would be missing;
- stops if the export holds a secret (the Supabase secret key and the other shapes in
  [#155](DECISIONS.md)), names the other project, or does not hold exactly the URL and key of the
  site's file, so a test site can never talk to the live project. The file is read with Expo's own
  `.env` rules (quotes, `export`, `#` comments; [#154](DECISIONS.md)), so the check sees the same
  values Expo would;
- copies the QR reader into `dist/zxing/<version>/` after checking its SHA-256 ([#143](DECISIONS.md));
- writes `dist/_headers` from `app/public/_headers`: the Content-Security-Policy with this site's
  Supabase address, HSTS, `nosniff`, Referrer-Policy and Permissions-Policy ([#142](DECISIONS.md));
- writes `dist/version.txt` (site, commit, build time, project, and the entry bundle's file name,
  `entry-<hash>.js`, which the site's page source loads: audit SURF-09). The same id shows under
  **Sign out** on the web version, e.g. "Web version test · 244e9f8 · 07-10-2026 15:00"
  ([#144](DECISIONS.md)). "+changes" after the commit means the folder had uncommitted changes:
  commit first for a site people use.

**After every upload, check the headers** (a minute, on the site's address):

1. In a terminal: `curl.exe -sI https://mridanga-seva-test.pages.dev/` — the answer must contain
   `content-security-policy:` (with the site's own `https://<ref>.supabase.co` in `connect-src`),
   `permissions-policy: camera=(self), ...`, `strict-transport-security:` and
   `x-content-type-options: nosniff`. No CSP line means `_headers` was not in the upload: upload
   the whole `dist` folder again.
2. `curl.exe -s https://mridanga-seva-test.pages.dev/version.txt` shows the site and commit just built,
   and `curl.exe -s https://mridanga-seva-test.pages.dev/ | Select-String entry-` names the same
   `entry-<hash>.js` (else the browser or Cloudflare still serves an older upload).
3. Open the site, sign in, press F12 → Console: no red "Content Security Policy" lines. Open
   Attendance → scan (the camera starts and reads a QR code) and, if there is one, a lesson video.
4. Add a row to the upload log below.

**Upload log** (newest first; site, commit, build time from version.txt, who):

| Date | Site | Commit | Built (UTC) | By |
|---|---|---|---|---|
| 10-10-2026 | test | 74890f0 (branch ops-backlog = main 5c8d972 + scripts/docs; entry-348c578a…) | 2026-10-10T04:46:22Z | Claude (wrangler, Praveen's login) |
| 10-10-2026 | test | 40dbe19 (main; P3-1 printed QR cards; entry-1c789e7f…; headers checked) | 2026-10-10T16:16:06Z | Claude (wrangler, Praveen's login) |
| 07-10-2026 | test | 90b7444 | 2026-10-07T09:48:09Z | Praveen |

**First upload** (once per site, logged in to the team's Cloudflare account; the dashboard's
wording may differ a little):

1. **Workers & Pages → Create application**, then the link at the bottom of that screen,
   **"Looking to deploy Pages? Get started" → Drag and drop your files** (direct upload, no Git
   connection). Two wrong turns, both seen on 30 Sep 2026:
   - **Not a Worker** (the options at the top of the Create screen): it gets a `*.workers.dev`
     address with the account's name in it and answers 404 for every address except `/`, so
     reloading a screen or opening a link breaks. The address must end in `.pages.dev`.
   - **Not "Connect to Git"**: that publishes the repository's source files instead of the
     built site, every address answers 404, and such a project cannot be switched to uploads
     later — it has to be deleted (**Settings → Delete project**) and made again.
2. Project name `mridanga-seva-test` (or `mridanga-seva` for the live site). The address is then
   `https://<name>.pages.dev` (Cloudflare adds a few letters if the name is taken; use the
   address it shows).
3. Drag the `app/dist` folder in and click **Deploy site**. The upload should list about 30
   files; well over 100 means the wrong folder. If the file chooser cannot reach `app/dist`
   (for example inside a hidden `.claude` folder), copy the folder somewhere visible first, such
   as the Desktop.
4. In **the Supabase project that site talks to**, set that address as the **Site URL** and add
   it to **Redirect URLs** (setup step 4).

**Each new release:** build for the site, open its project in Cloudflare, choose **Create
deployment**, and drag in `app/dist`. From a terminal instead:
`npx wrangler pages deploy dist --project-name <name>` (it opens the browser to log in).

The web version is a single-page app ([DECISIONS.md #15](DECISIONS.md)), so the host must send
every address to `index.html`. Cloudflare Pages does this by itself as long as the site has no
`404.html`; the script warns if one appears. On other hosts (not used now): Netlify needs a file
`app/public/_redirects` containing `/* /index.html 200`; GitHub Pages needs `dist/index.html`
copied to `dist/404.html`.

**Camera on the web version.** Browsers let a page use the camera only on an `https://` address
(or `localhost` during development); all the hosts above serve `https`. Browsers without built-in
QR reading (Safari on iPhone, Firefox, desktop Chrome on Windows) use a WebAssembly QR reader
(`zxing-wasm`, about 1 MB) that the site itself serves from `/zxing/<version>/`, cached for a year
([DECISIONS.md #143](DECISIONS.md)); no CDN is involved, and camera pictures never leave the
phone. In development (`npx expo start`) the reader still comes from the jsDelivr CDN, because
the dev server has no `zxing/` folder; the CSP does not apply there.

### Adding it to an iPhone home screen

In **Safari**, open the site, tap **Share → Add to Home Screen → Add**. It then opens full screen
with the app icon, like an installed app. The icon and name come from `app/public/index.html` and
`app/public/manifest.json`. The saffron header runs behind the status bar (white clock and battery)
and the tabs sit above the home bar ([DECISIONS.md #42](DECISIONS.md)).

To check on a real iPhone after a new web version (a volunteer can do it in two minutes): the
header text is below the notch; the bottom tabs are above the home bar, not under it; tapping a
text field does not zoom the page; turning the phone sideways keeps the text size; with VoiceOver
on and the app in Telugu, a Telugu line is read in a Telugu voice.

Tell users two things:

- The home-screen app keeps its own login, apart from Safari: sign in once inside it.
- Links in emails (confirm the email, reset the password) open in Safari, not in the home-screen
  app. Confirm or set the new password there, then go back to the home-screen app and sign in.

## The public website

The website for `mridangaseva.com` is in `website/` ([DECISIONS.md #128-#131](DECISIONS.md),
ARCHITECTURE.md "The public website"). It needs only Node 20 or newer; there is nothing to install.

**Change a text or a fact.**

- A sentence on a page: edit `website/content/<lang>/<page>.html` in **every** language folder
  (en, te, hi). Keep `{{…}}` values and `[[TEAM: …]]` markers as they are unless the fact is
  settled; then replace the marker with the real text in all languages.
- Dates, links, mail addresses, the APK link, "web app is live": `website/site.config.mjs`.
- The privacy notice: edit the three `privacy.html` files and raise `privacyNotice.version` and
  `date` in the config.
- A new language: copy `website/content/en` to `website/content/<code>` (BCP 47, e.g. `ta`, `bn`,
  `fr`), translate the eight `.html` files and `strings.json`, and set its `meta` (`bcp47`,
  `ogLocale`, `dateLocale`, `name`, `nativeName`, `dir`, `order`). Nothing else changes.

**Build and check** (from `website/`):

```bash
npm test
```

That builds `website/dist/` and checks it; it must end in `OK`. `npm run check:external` also asks
every outside link (the APK page, GitHub) for an answer. To look at it: `npm run serve` and open
`http://localhost:4321/` (the same headers as Cloudflare, except HSTS).

**First upload** (once, in the team's Cloudflare account; same wrong turns as for the app, see
"Publishing the web version"):

1. **Workers & Pages → Create application → "Looking to deploy Pages? Get started" → Drag and drop
   your files**. Not a Worker, not "Connect to Git".
2. Project name **`mridangaseva-site`**. The address is `https://mridangaseva-site.pages.dev`
   (Cloudflare adds letters if the name is taken; use the address it shows).
3. Drag in the **`website/dist`** folder (copy it to the Desktop first if the file chooser cannot
   reach the hidden `.claude` folder) and click **Deploy site**. The upload lists about 32 files,
   including `_headers`, `fonts/` and `.well-known/security.txt`.
4. Do **not** add a custom domain yet: the domain is attached at go-live, together with
   `app.mridangaseva.com` for the app (audit brief 8).

**Each new release:** `npm test`, then in Cloudflare open `mridangaseva-site` → **Create
deployment** → drag in `website/dist`. Or from `website/`:
`npx wrangler pages deploy dist --project-name mridangaseva-site`.

**Check after an upload:** open the `pages.dev` address; the response headers (browser
developer tools → Network → the page → Headers) show `content-security-policy` and
`strict-transport-security`; `/.well-known/security.txt` and `/sitemap.xml` open; a made-up
address like `/te/nothing` shows the Telugu "page not found". Score it at
`https://developer.mozilla.org/en-US/observatory` (aim A+) and `https://pagespeed.web.dev/`.

**Going live (with brief 8):**

1. Settle every `[[TEAM: …]]` marker (`npm run check` lists how many are left per file), get the
   te/hi texts reviewed by native speakers and the privacy notice by a legal adviser.
2. In `site.config.mjs`: `draft: false`; swap `app.apkUrl` for the **production** APK (brief 9; the
   link today is the pilot build that talks to the TEST project); `app.webLive: true` once
   `app.mridangaseva.com` works.
3. Build, upload, then attach the domain: `mridangaseva-site` → **Custom domains** → add
   `mridangaseva.com` (and `www.mridangaseva.com`, redirected to the root with a Redirect Rule).
   The DNS must already be on Cloudflare; Zoho's MX, SPF and DKIM records stay as they are.
4. In the zone, keep **Email Address Obfuscation** (Scrape Shield), **Web Analytics** and **Rocket
   Loader** off: they inject scripts the CSP blocks, and obfuscation would break the mailto links.
5. Renew `.well-known/security.txt` (`Expires`) before 1 Oct 2027.

## Building the Android app

The Android app is an APK that people install from a link; it is not on the Play Store yet
([DECISIONS.md #24](DECISIONS.md)). It is built in the cloud by **EAS Build** on the team's free
Expo account, so no Android Studio is needed. The package name `org.mridangaseva.app` is in
`app/app.json`. **Never change it**: phones would treat it as a different app. `app/eas.json` has
two build profiles, both an APK for sharing by link with the version code raised by EAS on every
build:

| Profile | Talks to | Used by |
|---|---|---|
| `preview` | the test Supabase project (settings from the EAS environment `preview`, copied from `app/.env.test` with `env:push` below; `eas.json` `"environment"`) | demos, testers, volunteers |
| `production` | the live Supabase project (settings from the EAS environment `production`, copied from `app/.env.live` with `env:push`) | the class, from the pilot on |

Both have the same package name, so a phone holds one or the other: installing one replaces the
other, and the person signs in again. Each profile is also the **update channel** of the same
name (`"channel"` in `eas.json`): a preview APK takes only preview updates, a production APK only
production ones (see "Updating the Android app" below).

The app belongs to the Expo project `@mridanga-seva/mridanga-seva`, in the Expo organisation
`mridanga-seva` (set up 30 Sep 2026). `app.json` names it: `"owner"` and `extra.eas.projectId`.
The id is not a secret.

**EAS CLI is pinned** ([DECISIONS.md #153](DECISIONS.md)): `app/package.json` holds an exact
version (`"eas-cli": "24.11.0"` in devDependencies), so every computer runs the same, checked
copy. Run `npm ci` in `app/` first; then `npx eas-cli …` runs that copy and `npx eas-cli
--version` prints 24.11.0. If npx asks *Need to install the following packages*, answer no and
run `npm ci`: it is about to download whatever version is newest. Never add `@latest`.
**Upgrading** it is a change like any other: `npm install --save-dev --save-exact eas-cli@<version>`
in `app/` (a version at least a week old, after reading its release notes), check
`npm run update:preview -- --check-only --message x`, commit `package.json` and
`package-lock.json`, and change the version in this paragraph.

**Once, on a new computer** (from `app/`, after `npm ci`): `npx eas-cli login`. It opens the
browser to sign in to Expo.

**Once, and again whenever a project's Supabase URL or key changes** (from `app/`):

```bash
npx eas-cli env:push --environment preview --path .env.test
npx eas-cli env:push --environment production --path .env.live
```

`env:push` copies each project's Supabase URL and publishable key to EAS. The build servers
never see `app/.env.live` or `app/.env.test` (they are not in git), so without this step the APK would
say *App not set up*. If it asks for a visibility, choose plain text: these values are inside
every copy of the app anyway. `npx eas-cli env:list --environment preview` shows what EAS
has.

**Only for a new Expo project** (a new organisation, for example): put `"owner":
"<organisation>"` in `app.json`, run `npx eas-cli init --account <organisation>` and commit
the change. `init` writes the project id into `app.json`, but also copies settings from the
plugins into it (an `android.permissions` list, an empty `extra.router`): remove those two, keep
`extra.eas.projectId`.

**Each build** (`preview` for the test project, `production` for the live one):

```bash
npx eas-cli build -p android --profile preview
```

- Build from a clean, committed `main`: the APK's fingerprint (see "Updating the Android app")
  is computed from what is uploaded, and later updates must match it.
- EAS needs `git` in the terminal. If it says *git command not found*, Git is installed but not
  on the terminal's path; add it for that window, for example
  `$env:Path = "$env:LOCALAPPDATA\Programs\Git\cmd;$env:Path"` in PowerShell. Do not use the
  `EAS_NO_VCS=1` it suggests: git decides which files are uploaded, and it leaves out `.env`.
- If a command fails with *unable to verify the first certificate* (a network that inspects
  secure connections), run `$env:NODE_OPTIONS='--use-system-ca'` in that window and try again.
  If it still fails while *uploading*, the network rewrites the connection to Google's storage,
  where EAS keeps uploads (seen 1 Oct 2026 on the office network: the certificate of
  `storage.googleapis.com` was issued by a Fortinet firewall). Use another network, such as a
  phone hotspot. Never switch certificate checks off (`NODE_TLS_REJECT_UNAUTHORIZED`).
- The **first** build asks to generate an Android keystore: answer yes. Expo keeps it. Every
  later APK must be signed with the same keystore, or phones refuse the update. Download a backup
  once (`npx eas-cli credentials -p android`) and keep it with the team's passwords —
  never in this repository or a chat. `.gitignore` refuses `*.jks`, `*.keystore`,
  `credentials.json`, private keys and `.npmrc` anywhere in the repository
  ([DECISIONS.md #155](DECISIONS.md)), so a stray copy is not committed by `git add -A`; still
  download it outside the repository folder.
- Free builds wait in a low-priority queue, sometimes for a while, and may run for at most
  45 minutes. The free plan allows 15 Android builds a month, so build for a release, not for every change.
- When it finishes, the build's page on expo.dev has an **Install** link and a QR code. That link
  **stops working after about 14 days** (EAS keeps build files for a limited time; seen in the
  build list on 1 Oct 2026), and new joiners keep needing the APK long after. So keep every APK
  that is shared ([DECISIONS.md #199](DECISIONS.md)):
  1. On the build page, **Download** the `.apk` (or from `npx eas-cli build:list --limit 1`, the
     *Application Archive URL*).
  2. Note its SHA-256: `Get-FileHash .\<file>.apk -Algorithm SHA256` (PowerShell).
  3. Rename it `mridanga-seva-<profile>-<build id first 8>.apk` and put it in the team's shared
     drive folder **Mridanga Seva APKs** (until the team email exists: the maintainer's drive),
     shared as "anyone with the link can view". Share **that** link with volunteers, not the
     expo.dev one; the folder's link stays the same, so the newest APK is always there.
  4. Add a row to the APK log below. Never put an APK in this repository (`*.apk` is ignored).

  **APK log** (newest first; profile, EAS build id, fingerprint, SHA-256):

  | Date | Profile | Build | Fingerprint | SHA-256 (first 16) | By |
  |---|---|---|---|---|---|
  | | | | | | |

**Keeping the APK small** ([DECISIONS.md #38](DECISIONS.md)). The `expo-build-properties` plugin
in `app/app.json` builds the APK for phone processors only (`buildArchs`: `armeabi-v7a`, the old
32-bit phones, and `arm64-v8a`, all newer ones), not for `x86`/`x86_64` (emulators, some
Chromebooks). It also switches on R8 (`enableMinifyInReleaseBuilds`), which removes unused Java
code, and `enableShrinkResourcesInReleaseBuilds`, which removes unused images and layouts. R8 can
remove code that a library only reaches by name, so after a change to these settings or a new
package with native code, test the APK on a phone before sharing it: sign in, scan a QR code,
add a photo and a PDF to an announcement, receive a notification, restart into an update. If
something breaks only in the APK, add a keep rule with `extraProguardRules` in the same plugin.

**Installing on a phone:** open the link on the phone, download the APK, allow the browser to
**install unknown apps** when Android asks, and install. Android may warn that the app is from an
unknown developer; choose to install anyway. A newer APK installs over the old one and keeps
the login.

## Updating the Android app

Since 1 Oct 2026 the APK updates itself ([DECISIONS.md #35](DECISIONS.md)): a change to the
screens reaches the phones without a new install. The first APK built on 30 Sep 2026 (build
`eba8be2e`) cannot do this; every phone must install a newer APK once.

**How a phone gets an update.** When the app starts, it asks Expo for a newer update on its
channel and downloads it in the background; it does the same when it comes back to the front
(at most every 30 minutes). Once one is downloaded, the home screen shows **A new version is
ready** with **Restart now**. Without a restart, the new version starts the next time the app
is opened from scratch. The line under Sign out shows what the phone runs: *Version 1.0.0 · as
installed, …* or *Version 1.0.0 · update of 01-10-2026 15:30 (a1b2c3d4)*; ask testers to quote
it in bug reports.

**An update is enough** for changes in `app/src/` (screens, text, translations, colours), images
the screens use, and JavaScript-only packages.

**A new APK is needed** when anything native changes, because the update would reach no phone:

- adding, removing or upgrading a package with native code (most `expo-*` packages, for example
  `expo-camera`), or an Expo SDK upgrade;
- `app/app.json` (name, version, icon, splash, permissions, plugins, anything in it), the icon and
  splash images, `app/google-services.json`;
- `app/eas.json`.

Expo works this out itself: it computes a **fingerprint** (a hash) of all of these, and an update
reaches only the APKs with the same fingerprint. `app/fingerprint.config.js` leaves out the npm
scripts and `.gitignore`. EAS Build does run npm's install hooks (`preinstall`, `postinstall`,
`prepare`) and its own `eas-build-*` hooks; `app/package.json` has none, and `app/tests/repo-guards.test.mjs`
fails if one is added, because the fingerprint would not see what it changes: such a hook means a
new APK, decided first ([DECISIONS.md #198](DECISIONS.md)). When unsure, just run the
publish command: it stops with *no finished … APK has fingerprint …* when a new APK is needed.

**Publishing an update** (from `app/`, logged in to Expo, with the change committed to `main`):

```bash
npm run update:preview -- --message "Clearer follow-up card"
```

That is for the test app (testers, volunteers). For the live app used by the class, after the
change has been checked on preview, use `npm run update:production -- --message "..."`. Both
ask you to type `yes` before anything is published, and anything else (or no answer, or Ctrl+C)
publishes nothing ([DECISIONS.md #152](DECISIONS.md)); there is no flag to skip the question.
The script (`app/scripts/publish-update.mjs`):

1. stops if the network cannot upload to EAS (an office network that inspects secure
   connections), or if no finished APK on that channel has the app's current fingerprint;
2. takes the Supabase URL and key from the EAS environment of the same name — never from
   the `app/.env*` files, and with `EXPO_NO_DOTENV=1` so Expo loads none of them either — and checks the URL is that channel's project (`preview` = test
   `fhuqyk…`, `production` = live `qeozvv…`), that both have the right shape (a publishable key),
   and deletes the temporary file it pulled them into, whatever happens;
3. builds the Android bundle into `app/dist-update/` and checks it holds that project's URL and
   key, not the other project's address, and no secret (a Supabase secret or service_role key,
   personal access token, private key, Postgres address with a password, Google, GitHub, Slack or
   AWS key; [DECISIONS.md #155](DECISIONS.md));
4. asks you to type `yes`, then publishes it with `eas update` (the pinned EAS CLI).

Add `--check-only` to run steps 1-3 without publishing; it stops before the question. Never run `eas update` by hand: it
would bundle whatever settings it finds, and an update made with the live settings would send
testers into the class's real data. The message may not contain `"`, `%`, `$`, backticks or
backslashes. Uploading needs a network that does not inspect secure connections (see "Each
build" above).

**The next APK (Phase 2 merge, 3 Oct 2026; [DECISIONS.md #55](DECISIONS.md)).** Main's fingerprint
is **185e839f** since the merge (the APK f9a084aa in use has 38ce7d9d), so from now on updates from
main reach only the new APK; phones on f9a084aa keep round 9 (update bf11f742) until they install
it. It carries every native package Phase 2 needs: expo-audio (with expo-asset), expo-location
(while using the app only), react-native-webview, expo-keep-awake, expo-sharing,
expo-screen-orientation, expo-haptics, and the image picker's microphone text. Steps, from a
hotspot (the office network breaks uploads):

1. In `app/`: `npx eas-cli build -p android --profile preview`; check the build page shows
   fingerprint 185e839f (or what `npx expo-updates runtimeversion:resolve --platform android`
   prints on main then).
2. Install it over the old app on a test phone, sign in, and check: the metronome sounds at 30, 80
   and 240 beats a minute with no gap where the loop restarts, and keeps time against a reference
   metronome for a few minutes; the taal player at 50 / 75 / 100 %; tempo changes while playing;
   leaving the screen stops the sound; the screen and app in the background (expo-audio plays on,
   with a media notice); the practice timer logs; Android asks for the microphone only when
   recording and for location only "while using the app"; notices in the inbox open their screens.
3. Then share the APK link with the volunteers as for f9a084aa.
**Rolling back** a bad update (from `app/`): `npx eas-cli update:rollback` and follow the
questions: choose the channel's branch (`preview` or `production`), then either an earlier
update or *the embedded update* (what came inside the APK). Phones get the rollback the same
way they get an update. A fix published later replaces it.
**After a bad update, a phone needs two fresh starts** (audit FLOW-06): the first start after the
rollback or fix downloads it in the background and still runs what it had; the second runs it. So
tell staff (the door phone first) and testers: *close the app fully (swipe it away from recent
apps) and open it again, twice*, or tap **Restart now** when the home screen offers it. Check the
version line under Sign out shows the new update. If the app crashes before any screen shows,
Expo itself goes back to the update that came with the APK on the next start; then the same two
starts bring the fix.

**What exists on EAS:** `npx eas-cli update:list --all` (updates), `channel:list`
(channels and the branch each one serves). The free plan covers 1,000 people a month who
download updates; the class is about 200.

## LIVE go-live (brief 8)

The live project is at migrations 0001-0011. Taking it to the pilot is one ordered runbook with a
person, a command or click path, an expected result and a "what if it differs" for every step:
**[GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md)** ([DECISIONS.md #232-#234](DECISIONS.md)). In short:

1. **Before:** the probe shows LIVE at `0011`; a backup as in "Backups" (no backup, no go-live);
   `npm test` in `supabase/tests` passes on main, which includes the replay below; the drift query's
   CSV saved.
2. **Migrations 0013-0042**, one file per run in number order, the probe after each. 0012 and 0041
   do not exist. 0031 is the corrected version (every `update push_status` ends in `where id;`).
   0034 goes with the live web site (and a production update, once a production APK exists) the
   same day.
3. **Push:** steps 7-10 of "Push notifications" on LIVE, then `notify-announcements` deployed again
   from main.
4. **Email:** Brevo verified sender and SMTP; Confirm email on, auto-confirm off, password length 8,
   Site URL and exact Redirect URLs (no localhost); one real sign-up and one real reset with a team
   mailbox; `/auth/v1/settings` shows `"mailer_autoconfirm":false`.
5. **Web:** the live site `mridanga-seva` on Pages, then `app.mridangaseva.com` and the switch of
   Site URL and Redirect URLs. Steps marked **⏳ DOMAIN** wait for the domain move (Zoho nameservers
   → Cloudflare).
6. **After:** the checklist's read-only verification SQL (last migration, jobs, grant sweep,
   safeupdate sweep, Vault and pg_net, push job, instantly confirmed logins) and row counts, and the
   dated settings record filled in.

**Never hand-confirm or Auto-Confirm an address that is on a student record without checking
identity in person.** A confirmed login with that email is linked to the child's record (0002).

**The replay proof** (`cd supabase/tests && npm ci && npm run replay`; also part of `npm test`,
about 20-30 seconds): builds an in-memory database at LIVE's state (0001-0011 plus rows of every kind
LIVE can hold), applies 0013-0042 in order and fails on any error, runs each file a second time
(it must change nothing, or be refused as a whole and be marked "Run once"), compares the result
with a fresh build, and runs the checklist's SQL blocks. A new migration fails its first check until
the checklist lists it.

## Releasing a change: database first

A release that has a migration goes in this order, every time ([DECISIONS.md #121](DECISIONS.md)).
An app update reaches the phones within minutes, so if it calls something the live database does
not have yet, the class's app breaks.

1. **Test project:** run the migration (setup step 2: check the project name first).
2. **Check on test:** publish the change to the test channel and the test site
   (`npm run update:preview`, `npm run export:web -- --site test`) and try it, with the
   checks the change's notes ask for.
3. **Live project:** make a backup ("Backups"), then run the same migration.
4. **Drift query** (below) in both projects, and compare the `KIND:` rows. Every kind must have the
   same hash, except the intended differences: `config_rows` (the test project's settings and
   centres are its own) and `vault_secret` while a secret exists in one project only. Anything else
   is drift: find it before going on. (The `ALL` hash covers these too, so it matches between test
   and live only when they are identical; it is what each backup logs, to compare one project with
   itself.)
5. **Then the app:** `npm run update:production`, and the live web site (`npm run export:web -- --site live`,
   upload to `mridanga-seva`, header check).

**Migrations stay additive for one release.** A migration may add tables, columns, functions and
policies. It may not drop or rename a table, column or function that the app in use calls, or change
a function's parameters, in the same release: phones run the old app until the update arrives, and
phones on an older APK never get it. Remove the old thing in a later release, once no app in use
calls it. Then a bad app update can always be rolled back ("Rolling back") without touching the
database.

**The one planned exception: 0034, the access log ([DECISIONS.md #146](DECISIONS.md)).** It closes
coordinators' direct reads of guardians, consents and call notes, and everyone's direct reads of
the audit log, on purpose. An app from before the update then shows a student with **no parent,
no consent and no call history**, the call screen with no parent's number, and G11 empty, until
the update arrives (the app itself is not broken: it asks again on the next screen visit). So run
0034 on live and publish the update **the same day**, one after the other (steps 3-5 without a
pause), at a time with no class. The update also works on a database without 0034 (it falls back
to the old reads), so publishing it first is safe; rolling it back after 0034 is not.

A change with no migration skips steps 1, 3 and 4. A migration with no app change still runs
steps 1-4.

**Drift query** (read-only; paste into **SQL Editor → New query** in each project and Run). The first
row (`ALL`) is one hash of everything below it; the `KIND:` rows are one hash per kind; then one row
per object. To find a difference, download both results as CSV and compare them (`fc.exe a.csv b.csv`).
Vault secrets appear by name only; versions are shown (`info`) but not hashed.

```sql
-- Drift check between the TEST and LIVE projects. READ-ONLY.
with
fn as (   -- every function and procedure we created (pgcrypto/pg_net members excluded)
  select 'function'::text as kind, p.oid::regprocedure::text as name, md5(pg_get_functiondef(p.oid)) as hash
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
fn_grants as (  -- who may EXECUTE each function
  select 'function_grants', p.oid::regprocedure::text,
         md5(coalesce((select string_agg(g, ',' order by g) from (
             select (case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end) || ':' || a.privilege_type as g
               from aclexplode(p.proacl) a) s), 'default'))
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
tbl as (  -- tables: columns (name, type, not null, default) and row-level security switches
  select 'table', c.oid::regclass::text,
         md5(concat_ws('|', c.relrowsecurity, c.relforcerowsecurity,
           (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                   || case when a.attnotnull then ' not null' else '' end
                   || coalesce(' default ' || pg_get_expr(ad.adbin, ad.adrelid), ''), ', ' order by a.attname)
              from pg_attribute a left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
             where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)))
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),
rel_grants as (  -- table and view privileges per role
  select 'table_grants', c.oid::regclass::text,
         md5(coalesce((select string_agg(g, ',' order by g) from (
             select (case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end) || ':' || a.privilege_type as g
               from aclexplode(c.relacl) a) s), 'default'))
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
),
con as (  -- primary keys, foreign keys, unique and check constraints
  select 'constraint', conrelid::regclass::text || '.' || conname, md5(pg_get_constraintdef(oid))
    from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0
),
idx as (
  select 'index', schemaname || '.' || indexname, md5(indexdef) from pg_indexes where schemaname = 'public'
),
pol as (  -- row-level security policies, including Storage's
  select 'policy', schemaname || '.' || tablename || '.' || policyname,
         md5(concat_ws('|', permissive, roles::text, cmd, qual, with_check))
    from pg_policies where schemaname in ('public', 'storage')
),
trg as (  -- triggers whose function is ours, also those on auth.users (0002 login linking)
  select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and p.pronamespace = 'public'::regnamespace
),
vw as (   -- views, with their options (security_invoker)
  select 'view', c.oid::regclass::text,
         md5(coalesce(array_to_string(c.reloptions, ','), '') || '|' || pg_get_viewdef(c.oid, true))
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
),
typ as (
  select 'enum', t.oid::regtype::text, md5(string_agg(e.enumlabel, ',' order by e.enumsortorder))
    from pg_type t join pg_enum e on e.enumtypid = t.oid
   where t.typnamespace = 'public'::regnamespace group by t.oid
),
cfg as (  -- configuration rows the migrations insert
  select 'config_rows', 'settings', md5(coalesce(string_agg(key || '=' || value::text, ';' order by key), '')) from settings
  union all
  select 'config_rows', 'levels', md5(coalesce(string_agg(id || '=' || name || '/' || sort, ';' order by id), '')) from levels
  union all
  select 'config_rows', 'centres', md5(coalesce(string_agg(name || '/' || opens_at || '-' || closes_at || '/' || radius_m || '/' || active, ';' order by name), '')) from centres
),
ext as (  -- extensions switched on (pg_cron, pg_net, ...); presence counts, version is info only
  select 'extension', extname, 'on' from pg_extension
),
cron_jobs as (
  select 'cron_job', jobname, md5(concat_ws('|', schedule, command, active)) from cron.job
),
bucket as (
  select 'bucket', id, md5(concat_ws('|', public, file_size_limit, allowed_mime_types::text)) from storage.buckets
),
vault_names as (  -- names only, never values
  select 'vault_secret', name, 'present' from vault.secrets where name like 'mridanga%'
),
everything as (
  select * from fn union all select * from fn_grants union all select * from tbl
  union all select * from rel_grants union all select * from con union all select * from idx
  union all select * from pol union all select * from trg union all select * from vw
  union all select * from typ union all select * from cfg union all select * from ext
  union all select * from cron_jobs union all select * from bucket union all select * from vault_names
),
info as (  -- shown, not hashed: these may differ for reasons that are not drift
  select 'info'::text as kind, 'server_version'::text as name, current_setting('server_version') as hash
  union all select 'info', 'extension_version:' || extname, extversion from pg_extension
),
per_kind as (
  select 'KIND:' || kind as kind, count(*)::text || ' objects' as name,
         md5(string_agg(name || '=' || hash, E'\n' order by name)) as hash
    from everything group by kind
)
select 'ALL' as kind, (select count(*) from everything)::text || ' objects' as name,
       (select md5(string_agg(kind || ':' || name || '=' || hash, E'\n' order by kind, name)) from everything) as hash,
       0 as sort
union all select kind, name, hash, 1 from per_kind
union all select kind, name, hash, 2 from everything
union all select kind, name, hash, 3 from info
order by sort, kind, name;
```

## Push notifications

When an announcement is published, the Android app shows a notification on the phones of the
people it is addressed to; a tap opens it ([DECISIONS.md #33](DECISIONS.md)). It goes: database
job (every minute) → Edge Function `notify-announcements` → Expo's push service → Firebase Cloud
Messaging → the phone. Until every step below is done, nothing is sent and the app works as
before. The web version (iPhones) gets no notifications yet. Push does not work in Expo Go.

Two keys are secret and **never go into this repository, the app or a chat**: the Firebase
service-account key (step 4) and the push secret (step 8). Nobody needs to keep a copy: the
key can be generated again, and the push secret stays readable in each project's Vault. The Edge
Function gets the Supabase service-role key from Supabase by itself; nobody copies it anywhere.

**Once, in Firebase** (logged in with the team email):

1. Open <https://console.firebase.google.com> → **Create a project**, name `mridanga-seva`.
   Google Analytics is not needed.
2. In the project: **Add app → Android**. Package name `org.mridangaseva.app` (exactly this,
   [DECISIONS.md #24](DECISIONS.md)); nickname and SHA-1 can stay empty. **Register app**, then
   **Download google-services.json**. Skip the remaining SDK steps: Expo does them.
3. The file is **committed** at `app/google-services.json`, and `app/app.json` points to it
   (`"googleServicesFile"` under `"android"`), [DECISIONS.md #34](DECISIONS.md). Download it again
   only for a new Firebase project: ⚙ **Project settings → General → Your apps →
   google-services.json**, replace the file and commit it. Before committing, open it: it must
   name `org.mridangaseva.app` and must **not** contain `"private_key"` (that would be the secret
   key of step 4).
4. **Project settings → Service accounts → Generate new private key → Generate key.** A JSON
   file downloads (`mridanga-seva-firebase-adminsdk-….json`). This one is secret. It is needed
   only for step 5; delete it afterwards, from the Recycle Bin too. If it is needed again, generate
   a new one here.

**Once, in Expo** (signed in with `eas login`, see "Building the Android app"; from `app/`):

5. Upload the service-account key:
   ```bash
   npx eas-cli credentials -p android
   ```
   Choose a build profile (either; the key belongs to the package name) → **Google Service
   Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** →
   **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new
   service account key** → give the full path of the JSON from step 4. Then delete the
   downloaded copy from the computer.

**In each Supabase project** (test first, then live):

6. Run `0010_announcement_files.sql` and `0011_push_notifications.sql` in the SQL editor, in
   order, like the other migrations.
7. **Database → Extensions**: switch on **pg_net**.
8. Make the push secret and save it, with the project address, in the Vault. The database makes
   the secret itself, so it is never typed into a query (the SQL editor keeps its queries). In
   the SQL editor, with your project ref (the part before `.supabase.co`) in the first line:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'mridanga_project_url');
   select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'mridanga_push_secret');
   select name, length(decrypted_secret) as characters from vault.decrypted_secrets where name like 'mridanga_%';
   ```
   The last line should show `mridanga_project_url` (40 characters) and `mridanga_push_secret`
   (64). Each project gets its own secret.
9. Give the Edge Function the same secret. In the dashboard open **Integrations → Vault →
   Secrets**, reveal `mridanga_push_secret` and use its **copy** button (copying from the SQL
   editor's results grid once picked up the wrong text). Then **Edge Functions → Secrets → Add
   new secret**: name `PUSH_SECRET`, paste the value, **Save**. (Not with `supabase secrets set`
   in a terminal: the terminal keeps the value in its history file.) After the login of step 10,
   check that the two are the same without showing either:
   `npx supabase@latest secrets list --project-ref <project-ref>`
   prints a fingerprint (SHA-256) of each secret, and in the SQL editor
   `select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex') from vault.decrypted_secrets where name = 'mridanga_push_secret';`
   must print the same text as the one for `PUSH_SECRET`.
10. Deploy the Edge Function from a terminal in the repository folder. `login` opens the browser;
    paste the verification code it shows into the terminal.
    ```bash
    npx supabase@latest login
    npx supabase@latest functions deploy notify-announcements --project-ref <project-ref> --no-verify-jwt --use-api
    npx supabase@latest functions list --project-ref <project-ref>
    ```
    `--no-verify-jwt` because the database job calls it without a login; the function checks
    the push secret instead. `supabase/config.toml` says the same (`verify_jwt = false`), so a
    deploy that forgets the flag keeps it off too ([DECISIONS.md #197](DECISIONS.md)); deploy from the
    repository folder so the CLI finds it. `--use-api` builds it on Supabase's side, so Docker is
    not needed (CLI 2.118). The list must show `notify-announcements`,
    status `ACTIVE`; an empty list means nothing was deployed. Called without the secret, the
    function answers `401 {"error":"not_allowed"}`; `404` means it is not deployed.
    Only if the Expo account has "enhanced push security" switched on, also add the secret
    `EXPO_ACCESS_TOKEN` (a token from expo.dev → Access tokens) the same way as in step 9.

**Deploy again after a change to the function.** The Phase 2 version (assessment and promotion
notifications from `push_outbox`, deleting expired recordings with `{"cleanup": true}`) is on main
since 3 Oct 2026; TEST and LIVE still run the older one, which ignores those rows (they wait, nothing
breaks). Praveen deploys it with step 10's command to the test project (`fhuqykssenuhczdqbafu`)
after the Sunday 4 Oct 2026 demo, and to the live one (`qeozvvizcojzxcjgnaei`) before Phase 2's
notices are used there. Queued test notices of the last day may then arrive on test phones.
**Push fixes (0031, audit brief 11, 6 Oct 2026):** run `0031_push_fixes.sql` and deploy the function
again, in either order: until both are done the old function keeps working (before 0031 runs, the
new one answers `500 {"error":"claim_failed"}` and nothing is lost). From the repository folder:
`npx supabase@latest functions deploy notify-announcements --project-ref <project-ref> --no-verify-jwt --use-api`.
The secret `EXPO_PROJECT` is optional (default `@mridanga-seva/mridanga-seva`, the app's Expo project).
**Ops backlog (0040, audit brief 16, 9 Oct 2026):** run `0040_ops_backlog.sql` and deploy the function
again, in either order (the same command). The new function also deletes announcement files no
announcement lists ("Files no announcement uses"); before 0040 it logs
`orphan_announcement_files failed` once a day and carries on. It now names supabase-js 2.117.2
exactly: upgrading it is an edit in `index.ts` and a deploy, never automatic.
**Then a new APK**, built after steps 3 and 5 (see "Building the Android app"):

11. `npx eas-cli build -p android --profile preview` (test project) or `--profile
    production` (live). Install it over the old one, sign in, and allow notifications when
    Android asks.

**Check that it works** (test project):

12. On a phone with the new APK, sign in as a student and allow notifications. On another device,
    post an announcement "Now" to all students. Within about a minute the phone shows it; a tap
    opens it.
13. If nothing arrives, look in the SQL editor:
    ```sql
    select send_due_push();   -- 'not_set_up' = step 7 or 8 is missing ('nothing_due' = nothing waiting)
    select id, status_code, content from net._http_response order by id desc limit 5;
    select title, publish_at, notified_at from announcements order by id desc limit 5;
    select platform, updated_at from push_tokens order by updated_at desc limit 5;
    ```
    `status_code` 401: read `content`. `{"error":"not_allowed"}` is the function's own answer = the
    push secret in the Vault and the function's `PUSH_SECRET` differ (compare their fingerprints,
    step 9). Anything else, such as `{"code":401,"message":"Missing authorization header"}` or
    `Invalid JWT`, comes from Supabase's gateway before the function runs = it was deployed with the
    JWT check on: deploy again from the repository folder with step 10's command. 404 = the function
    is not deployed. No row in `push_tokens` = the phone has no token: Expo Go, no
    permission, or steps 3 and 5 were missing when the APK was built. The function's own log is
    under **Edge Functions → notify-announcements → Logs** (for example `InvalidCredentials` =
    the key of step 5 is missing or wrong).
    Since 0031 the queue says what happened to each phone, without showing tokens or texts:
    ```sql
    select last_job_at, last_job_result, last_run_at, last_run from push_status;
    select announcement_id, outbox_id, tries, next_try_at, sent_at, failed from push_queue order by id desc limit 20;
    ```
    `last_job_result` `not_set_up` with pg_net and the Vault in place = the project URL is not
    `https://<ref>.supabase.co` or the push secret is shorter than 32 characters (step 8).
    `last_run.errors` counts Expo's error codes; `failed` on a row: `DeviceNotRegistered` (app removed,
    token deleted), `OtherProject` (a token of another Expo app), `token_gone` (signed out first),
    `expired` (over a day), `gave_up` (5 tries), `bad_url`. Rows with neither `sent_at` nor `failed`
    wait for `next_try_at`. Rows are deleted after 3 days.
    **Never edit `announcements.notified_at` by hand in the Table Editor** except to re-send a post on
    purpose: emptying it makes the next run push the post again to every phone (if it was published
    less than a day ago), and the dashboard's edit leaves no audit row (audit R2G3-04).

**Switching it off:** `select cron.unschedule('mridanga-push');` in the SQL editor stops it. To
switch on again, `select cron.schedule('mridanga-push', '* * * * *', 'select send_due_push()');`:
announcements published meanwhile are then sent if they are less than a day old, the older ones
never.

## Parent codes by email (Ishtagoshti, Phase 2)

A child under 18 who joins Ishtagoshti (I14) gets in only after typing a 6-digit code that the
database emails to the parent ([DECISIONS.md #88](DECISIONS.md)). The database sends it itself,
through pg_net (already on for push) to Brevo's mail API. Until the two Vault secrets below exist,
the app says "Emails to parents are not switched on yet" and nothing is stored.

1. **Brevo** (team account, free plan: 300 emails a day): verify the sender address (Senders,
   Domains & Dedicated IPs → Senders), then SMTP & API → API keys → Generate a new API key.
2. **Supabase SQL editor** of the project (TEST first), once:

   ```sql
   select vault.create_secret('<the Brevo API key>', 'mridanga_brevo_key');
   select vault.create_secret('<the verified sender address>', 'mridanga_mail_from');
   ```

   To change one later: `select vault.update_secret(id, '<new value>') from vault.secrets where name = 'mridanga_brevo_key';`
3. **Check:** join as a test child with your own email as the parent's; the code arrives within a
   minute. Brevo's answer stays for a few hours in
   `select status_code, content from net._http_response order by created desc limit 5;`
   (201 = accepted; 401 = wrong key; 400 = sender not verified).

**Before real use:** Authentication → "Confirm email" must be ON (joining needs a confirmed email);
the consent and notice texts must be the team's (search the locale files for "TEST —" and change
`IG_TERMS_VERSION` in `app/src/data/ig-subscribers.ts` and the email text in `ig_send_parent_code`).
The app sends at most 100 parent codes a day, well under Brevo's 300 shared with sign-up emails.

**Testing without Brevo (TEST only):** give a test child a known code in the SQL editor, then type
123456 in the app:

```sql
insert into ig_parent_codes (profile_id, code_hash, expires_at)
select id, encode(sha256(convert_to(id::text || ':123456', 'UTF8')), 'hex'), now() + interval '1 day'
  from auth.users where email = '<the test child''s email>'
on conflict (profile_id) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0;
```
## Parent notices by email

When a student under 18 is checked out in the app (QR, door tablet, a coordinator's tap, Check out
all), the parent gets a short email: name, centre, time. **Check-out only** is the team's choice of
10 Oct 2026 ([DECISIONS.md #246](DECISIONS.md)): since 0044 the check-in email (the "When the
student is checked in" box) and the night's "no check-out recorded" email (the "At night…" box) are G10 switches,
both off; ticking them brings back 0043's behaviour ([#224-#231](DECISIONS.md), DATABASE.md "Parent
notices (0043)").
Never a location or a photo. It goes: trigger on `visits` → queue `parent_notices` → job
`mridanga-parent-notices` (every minute) → Edge Function `notify-parents` → Brevo's transactional
API → the parent's inbox. **Off by default**: nothing is queued until the Guru ticks "Email parents…"
on G10 Settings ("Emails to parents").

It reuses the push set-up (pg_net, Vault `mridanga_project_url` + `mridanga_push_secret`, function
secret `PUSH_SECRET`: "Push notifications", steps 7-9). Its own secrets, set like step 9 in the
dashboard (**Edge Functions → Secrets → Add new secret**, never in a terminal):

| Secret | Value | Without it |
|---|---|---|
| `BREVO_API_KEY` | A Brevo API key (SMTP & API → API keys; the key of "Parent codes by email" may be reused) | Dry run: the function logs `would send <row> <kind> <language>` and marks rows `skipped` |
| `NOTICE_FROM` | A sender address verified in Brevo. **Placeholder until brief 8**: on TEST Praveen's own verified address; on LIVE `notices@<the class domain>` once the domain is authenticated in Brevo (SPF, DKIM, DMARC) | Dry run |
| `NOTICE_FROM_NAME` | Optional; default `Mridanga Seva` | — |
| `NOTICE_REPLY_TO` | Optional: the class desk's email, so a parent's reply ("stop", a question) reaches a person | Replies go to `NOTICE_FROM` |
| `PARENT_NOTICES_DRY_RUN` | Optional `1`: a dry run even with a key (to check the queue on a project with a key) | — |

**On TEST** (`fhuqykssenuhczdqbafu`), in this order:

1. SQL editor: run `0043_parent_notices.sql` (after 0040; 0042 is not needed). Check:
   ```sql
   select key, value from settings where key like 'parent_notice%' order by key;
   select jobname, schedule, active from cron.job where jobname = 'mridanga-parent-notices';
   ```
   Expected: `parent_notice_contact ""`, `parent_notices_check_out true`, `parent_notices_enabled false`;
   the job `* * * * *`, active. Then `0044_parent_checkout_only.sql`; the first select adds
   `parent_notices_check_in false` and `parent_notices_no_checkout false`.
2. Deploy the function from the repository folder (the CLI is logged in on Praveen's PC; this really
   deploys, so only with the TEST ref):
   ```bash
   npx supabase@latest functions deploy notify-parents --project-ref fhuqykssenuhczdqbafu --no-verify-jwt --use-api
   ```
   `functions list` must show `notify-parents` ACTIVE. Without the secret it answers `401
   {"error":"not_allowed"}`. `supabase/config.toml` keeps its JWT check off as for push.
3. Dry run (no `BREVO_API_KEY` yet): register a test student under 18 on C2/C3 with your own email as the
   parent's (a made-up child; TEST only), tick "Email parents…" on G10 as the Guru and save, then check the
   student in on C8 (nothing is queued: check-in emails are off) and out again. Within a minute:
   ```sql
   select id, kind, outcome, tries, created_at from parent_notices order by id desc limit 5;
   select last_job_at, last_job_result, last_run_at, last_run from parent_notice_status;
   ```
   Expected: the row's `outcome` = `skipped`, `last_run` `{"dryRun": true, "skipped": 1, …}`, and in
   **Edge Functions → notify-parents → Logs** a line `would send <id> out en`. `last_job_result`
   `not_set_up` = the push Vault secrets are missing (push steps 7-8).
4. One real email: in Brevo verify your own address as a sender (Senders, Domains & Dedicated IPs →
   Senders → Add a sender), then add the secrets `BREVO_API_KEY` and `NOTICE_FROM` (that address).
   Check the student out on C8: the email arrives within about a minute; the row says `sent`. Try the
   mail app's "Unsubscribe" if it shows one (Gmail shows it only for an authenticated domain): C8 then
   says "Attendance emails stopped (the parent asked)"; "Send emails to this parent again" undoes it.
5. Untick "Email parents…" on G10 when done.

`outcome` of a row, if not `sent`: `skipped` dry run; `brevo_400` sender not verified or bad address;
`gave_up` after 5 tries (Brevo down, or 401 = wrong key: the run stops at the first 401 and retries
later); `expired` the email could not go within 6 hours; `stopped` / `switched_off` / `not_eligible`
nothing to send any more. At most 200 are sent a day (Brevo's free plan sends 300; the Ishtagoshti
parent codes take up to 100); the rest wait and expire after 6 hours.

**On LIVE (brief 8)** (the team decided #231 on 10 Oct 2026: check-out only, [#246](DECISIONS.md)):
the class domain authenticated in Brevo; the consent line added to the paper form and the privacy
notice (DECISIONS #230, wording approved; [#247](DECISIONS.md)), Brevo listed as a processor for these emails ("Who processes the data");
then run 0043 and 0044 (after 0012-0042 in order), deploy `notify-parents` with the LIVE ref, set
`BREVO_API_KEY`, `NOTICE_FROM` = `notices@<domain>`, `NOTICE_REPLY_TO` = the desk; send one email to
a team member's child (or a test record) and only then tick "Email parents…" (leave the check-in and
night boxes unticked).

**Switching it off:** untick on G10 (nothing more is queued; waiting rows end as `switched_off`). In
an emergency, `select cron.unschedule('mridanga-parent-notices');` stops the sending at once; to switch
on again `select cron.schedule('mridanga-parent-notices', '* * * * *', 'select send_parent_notices()');`
(rows over 6 hours old then expire instead of arriving late).

**A parent asks to stop:** C8 → under the parent → "Stop emails to this parent" (or they use the
email's Unsubscribe). Rows are kept 30 days and hold no text; the parent's email is read from the
guardian row at sending time.
## Files no announcement uses

Photos and PDFs are removed from Storage by the app when an announcement or one of its files is
deleted ([DECISIONS.md #32](DECISIONS.md)). If that failed (no internet at that moment), or a post
was never saved after its upload, the file stays in the bucket, unused. **Since 0040** (with the
Edge Function deployed again, "Push notifications") the job `mridanga-orphan-files` removes them
every morning, up to 100 a day, once they are a day old ([DECISIONS.md #195](DECISIONS.md)); it
removes none while the announcements table is empty, so during a restore load the rows before the
job's next run anyway. To see what is waiting (the job's list is
`select * from orphan_announcement_files();`), or before 0040, in the SQL editor:

```sql
select o.name, o.created_at, (o.metadata ->> 'size')::bigint as bytes
  from storage.objects o
 where o.bucket_id = 'announcement-files'
   and o.created_at < now() - interval '1 day'
   and not exists (select 1 from announcements a
                    where a.attachments @> jsonb_build_array(jsonb_build_object('path', o.name)));
```

Before 0040, delete them by hand in **Storage → announcement-files** (open the folder, tick the files, **Delete**).
**Never** `delete from storage.objects` in SQL: that forgets the file but leaves it taking space.
How much of the free 1 GB is used: **Project Settings → Usage**, or
`select sum((metadata ->> 'size')::bigint) / 1048576 as mb from storage.objects;`.

## App icon and splash screen

`app/assets/images/` and the web version's home-screen icons in `app/public/` hold placeholder
artwork (a white khol on saffron), drawn by `node scripts/make-placeholder-icons.mjs` (run from
`app/`). When the team has a logo, replace the PNG files
with images of the same sizes and keep the saffron colour in `app.json` and
`app/src/theme/colors.ts` in step with it.

## Backups

The free plan has no backups you can download, so the live project is copied once a week by hand
([DECISIONS.md #120](DECISIONS.md)). A copy holds personal data of children: it is always
encrypted, never put in the repository, a chat, WhatsApp or an email.

| | |
|---|---|
| **Owner** | Praveen (maintainer) until the team names a second person who can do it too |
| **When** | Every **Monday**, and before every migration on the live project ("Releasing a change") |
| **Where** | The team's private cloud folder `Mridanga Seva backups` (owner and second person only) |
| **Archive password** | One long password in the team password manager, entry *Mridanga Seva backup archive*. Without it the archives cannot be opened; never write it anywhere else |
| **Keep** | The last **8** weekly archives; delete older ones (an erased child is gone from all copies 8 weeks after the erasure) |
| **Log** | `backup-log.csv` in the same folder: one line per backup (below). It holds no personal data |

A backup is three files, made with PostgreSQL's own `pg_dump` (the Supabase CLI's `db dump` runs
`pg_dump` inside Docker, which this PC does not have; it is equivalent):

| File | Holds | Needed for |
|---|---|---|
| `schema.sql` | Tables, functions, policies, grants of the `public` schema, as the project has them | Finding out how a rebuilt project differs ("Restoring") |
| `data-public.sql` | Every row of every `public` table (`COPY` format) | The class's records |
| `data-auth.sql` | The logins: `auth.users`, `auth.identities`, `auth.mfa_factors` (not sessions, not Supabase's own logs) | People keep their logins and passwords after a restore |

The app makes no database roles of its own, so no roles file is needed (Supabase's roles exist in
every project). Not in the backup, and set up again by hand after a restore: the photos and PDFs in
Storage (copies of posters the authors keep; download from **Storage** if one is needed), the
Vault secrets, the Edge Function and its secrets, and the dashboard settings (Auth, SMTP, Site URL).

**Once, on the computer that makes backups:**

1. Install **PostgreSQL command line tools** of the same major version as the project or newer
   (`select version();` in the SQL editor shows it; 17 in Oct 2026): <https://www.postgresql.org/download/windows/>
   → the EDB installer → tick only **Command Line Tools**. Install **7-Zip** (<https://7-zip.org>).
2. The connection string: Supabase → **Connect** (top of the dashboard) → **Session pooler** → copy
   the URI. It looks like `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`.
   Delete `:[YOUR-PASSWORD]` from it, so the tools ask for the password instead of keeping it in
   the terminal's history. (The direct connection works only over IPv6, which most networks lack.)
   The database password is in the password manager; if it is lost, **Project Settings → Database →
   Reset database password** (nothing else uses it).

**Each backup** (PowerShell; each `pg_dump` asks for the database password):

```powershell
$env:Path = "C:\Program Files\PostgreSQL\17\bin;$env:Path"
$db  = "postgresql://postgres.qeozvvizcojzxcjgnaei@aws-…pooler.supabase.com:5432/postgres"   # the live project's string
$day = Get-Date -Format yyyy-MM-dd
$dir = "$env:USERPROFILE\mridanga-backup-$day"
New-Item -ItemType Directory $dir | Out-Null
pg_dump -d $db --schema-only --schema=public -f "$dir\schema.sql"
pg_dump -d $db --data-only --schema=public -f "$dir\data-public.sql"
pg_dump -d $db --data-only --table=auth.users --table=auth.identities --table=auth.mfa_factors -f "$dir\data-auth.sql"
```

A warning about *circular foreign-key constraints* is expected (the restore handles it). Then count
the rows in the dump, per table; these numbers go into the log and are what a restore must show:

```powershell
$t = $null; $n = [ordered]@{}
foreach ($l in [IO.File]::ReadLines("$dir\data-public.sql")) {
  if ($t) { if ($l -eq '\.') { $t = $null } else { $n[$t]++ } }
  elseif ($l -match '^COPY public\.("?[^ "(]+"?) ') { $t = $Matches[1].Trim('"'); $n[$t] = 0 }
}
$n.GetEnumerator() | Sort-Object Name | Format-Table -AutoSize
"tables: $($n.Count)  rows: $(($n.Values | Measure-Object -Sum).Sum)  students: $($n['students'])"
```

Encrypt, check the archive opens, and delete the plain files (`-p` asks for the archive password;
`-mhe=on` hides the file names too):

```powershell
& "C:\Program Files\7-Zip\7z.exe" a -t7z -mhe=on -p "$env:USERPROFILE\mridanga-backup-$day.7z" "$dir\*"
& "C:\Program Files\7-Zip\7z.exe" t -p "$env:USERPROFILE\mridanga-backup-$day.7z"
Remove-Item -Recurse $dir
```

Move the `.7z` to the backups folder, delete archives beyond the newest 8, and add a line to
`backup-log.csv`:

```text
date,by,project,archive,size_kb,tables,rows,students,drift_all_hash,note
2026-10-12,Praveen,live,mridanga-backup-2026-10-12.7z,412,61,5230,148,3f2a…,weekly
```

`drift_all_hash` is the `ALL` row of the drift query ("Releasing a change") run on the same day; a
rebuilt project is compared with it.

### Restoring

Only the owner restores, with the Guru told. Two cases:

- **The project is gone or broken beyond repair:** make a new project (setup steps 1, 2 with every
  migration in number order, 4-7), then load the data as below. The new project has a new URL and
  key: follow "When the app's Supabase URL or key changes" ("If a key leaks").
- **The project is fine but data was lost** (a wrong delete): load the newest archive from before
  the loss into the same project, as below. Everything written since that backup is lost, so first
  write down what changed since (new students, visits) to enter again.

1. Copy the archive to the computer, open it with 7-Zip (archive password) into a new folder `$dir`.
2. Save this as `restore-begin.sql` in the same folder. It empties every `public` table so the copy
   can be loaded (inside one transaction: if anything fails, nothing changes) and switches off
   triggers and foreign-key checks for the load, as `pg_dump`'s own restore does:
   ```sql
   set session_replication_role = replica;
   do $$ begin
     execute (select 'truncate table ' || string_agg(format('public.%I', tablename), ', ')
                from pg_tables where schemaname = 'public');
   end $$;
   ```
3. **Check that `$db` names the project you mean to overwrite** (its ref is in the string), then:
   ```powershell
   psql -d $db --single-transaction -v ON_ERROR_STOP=1 -f "$dir\restore-begin.sql" -f "$dir\data-public.sql"
   ```
   Into a **new** project, load the logins too: put `-f "$dir\data-auth.sql"` between the two
   files. (Not into the same project: its logins are still there and would clash.)
4. Check: the row counts per table (query below) match the log line of that archive; the drift
   query's `ALL` hash matches `drift_all_hash` of that line. If it does not, the rebuilt schema
   differs from the old one: `pg_dump -d $db --schema-only --schema=public -f new-schema.sql`, then
   `fc.exe "$dir\schema.sql" new-schema.sql` shows where.
   ```sql
   select table_name, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', table_name),
          false, true, '')))[1]::text::int as rows
     from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
   union all select '(auth.users)', count(*)::int from auth.users
   order by 1;
   ```
5. **Re-apply every erasure and withdrawal made after the backup's date.** The copy predates them,
   so an erased child is back and a withdrawn one is active again. The private register of requests
   ("Consent withdrawal" step 1, "Erasure request" step 1) has the date and roll number of each;
   for each one dated on or after the backup day, find the student by roll number and run
   `withdraw_consent` / `erase_student` again, with the same note and request reference. Check:
   `select roll_no, erased_at from erasures order by erased_at desc;` lists every erasure of the
   register.
6. Everyone signs in again (sessions are not in the backup). Files the erasure step lists, and the
   Storage, Vault, Edge Function and dashboard settings of a new project: set up as in "Setting up
   a new environment" and "Push notifications". Then run the cron health query ("Scheduled jobs").

### Restore drill

Done once before the pilot, on the **test** project, and again once a year: back up the test project
as above (its string has `fhuqykssenuhczdqbafu`), restore `data-public.sql` into it (step 3, without
the logins), and compare the row counts with the dump's.

| Date | Project | Tables | Rows in dump | Rows after restore | Same per table | Drift ALL hash before / after | By |
|---|---|---|---|---|---|---|---|
| *(pending)* | test | 57 | | | | | |

**Not done yet (7 Oct 2026).** The test project before the drill: PostgreSQL 17.6, 57 tables, 708
rows (20 students), 9 logins. The drill could not run on the maintainer's office PC: installing
needs admin rights, and its security software deletes the PostgreSQL programs of the no-install
zip as soon as they are unpacked. The backups need the same tools, so the backup computer must be
one where they run (a PC the owner controls, or the tools installed by IT). Do the drill there
before the pilot and fill in the row.

## Keeping the free project awake

A free Supabase project pauses after 7 days without activity ([DECISIONS.md #6](DECISIONS.md)).
Daily class use keeps it awake; until the pilot starts (and in long holidays) LIVE has no daily
use, so **every Monday** the maintainer opens the live app or its dashboard (the backup and health
check below do this anyway). Supabase emails the project's owner before pausing it.

**If it has paused** (the app cannot sign in; the dashboard shows *Paused*): only a member of the
Supabase organisation can restore it — today the maintainer alone (accounts table at the top), so
add a second member when the team email exists. Dashboard → the project → **Restore project**;
it takes a few minutes. Data, logins, files and settings come back as they were, and the scheduled
jobs start again by themselves (the daily ones at their next time; students' statuses catch up at
06:00 IST). Tell the class group once it answers again. A project paused for over 90 days can no
longer be restored from the dashboard: then it is a restore from backup ("Backups").

## Monthly usage check

The free plans have limits, and nothing warns before one is reached (audit D2-13, D10-17;
[DECISIONS.md #199](DECISIONS.md)). On the first Monday of each month, look at:

- **Supabase → Project Settings → Usage** (each project): database size (500 MB), Storage (1 GB),
  Edge Function calls (500,000 a month), egress. Edge Function calls well beyond about 45,000 a month
  (the push job's minutes plus the daily jobs) mean someone is calling the push endpoint: it
  refuses them, but they count. Look at **Edge Functions → notify-announcements → Logs**.
- **expo.dev → the organisation → Usage**: update downloads (1,000 people a month) and builds.
- **Cloudflare → Workers & Pages**: the two sites' requests.
- The app has no crash reporting. Ask the coordinators whether anything failed on their phones, with
  the version line under Sign out; a crash reporter needs a privacy review first (minors' data).

Anything near its limit: tell the team before it stops; the paid plans are the fallback.

## Scheduled jobs: health check

The database runs ten jobs on its own (times in UTC; IST is 5:30 later): `mridanga-status-refresh`
(00:30, student statuses and follow-up calls), `mridanga-close-visits` (every hour at :30,
checks out visits an hour after their centre closes), `mridanga-assessments` and `mridanga-events-polls` (03:30), `mridanga-inbox-cleanup`
(01:00), `mridanga-access-log-purge` (01:45, deletes access-log rows older than 400 days),
`mridanga-duty` (12:30), `mridanga-orphan-files` (02:00, announcement files no post lists),
`mridanga-cron-history-purge` (02:15, keeps a week of the run history this check reads) and
`mridanga-push` (every minute). If one fails, nothing tells
anyone: students stop changing status and no calls are created. **Every Monday, with the backup**,
run in the live project's SQL editor:

```sql
select j.jobname, j.schedule, j.active,
       max(d.end_time) filter (where d.status = 'succeeded') as last_success,
       count(*) filter (where d.status = 'failed' and d.start_time > now() - interval '2 days') as failed_2_days,
       (array_agg(d.return_message order by d.start_time desc) filter (where d.status = 'failed'))[1] as last_error
  from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
 group by j.jobid, j.jobname, j.schedule, j.active
 order by j.jobname;
select last_job_at, last_job_result from push_status;
```

Healthy: ten rows, all `active`; each daily job's `last_success` within the last day and
`mridanga-push` within minutes; `failed_2_days` 0. Otherwise `last_error` says why (for example a
setting changed in the dashboard to a wrong value); fix the cause and the job recovers on its next
run. The push job always counts as succeeded, even when push is not set up: its own result is
`last_job_result` (`not_set_up` = "Push notifications", step 13). A missing row means the job was
removed: create it again with its `cron.schedule` line from `supabase/migrations/` (search for the
job's name). A project that has not run every migration has fewer jobs (0001 makes the first two,
0011 the push job, 0015, 0016, 0022, 0023 and 0034 one each, 0040 two).

## Incidents

Everything that may have exposed personal data, or put the app in someone else's hands. Start with
**"Personal data breach"** whenever data may have been seen, copied, changed or lost by anyone who
should not have it; the runbooks after it fix the cause for a key, the Expo account or a phone.
They run side by side: lock the door (the cause) and tell the people (the breach) at the same time.

### Personal data breach

Follows the DPDP Rules 2025, Rule 7 ([DECISIONS.md #147](DECISIONS.md)). The duty applies to us from
13 May 2027; we follow it from the first pilot day.

**Who decides it is a breach, and who acts.** Praveen (the maintainer) decides and runs the steps;
if he cannot be reached within 2 hours, the Guru. Either may start the steps alone; when in doubt,
treat it as a breach. **[[TEAM]]:** confirm these two people and add phone numbers in the team's
private contact sheet.

**Examples:** a coordinator's phone or login used by someone else; a leaked secret key or database
password; a hostile app update; a backup file or an exported list sent to the wrong person; a
staff member reading many children's records with no class reason (seen in the access log).

**Steps, in this order. Write the time of each in the incident log.**

1. **Stop it.** Do the cause's own runbook at once: "If a key leaks", "If the Expo account is
   compromised" or "If a staff phone is lost" below; a person misusing their access: switch their
   login off in G2.
2. **Save the logs before they are gone (within hours).** The **Free plan keeps API and database
   logs for 1 day only** (supabase.com/pricing, checked 7 Oct 2026; Pro 7 days). In the live project:
   **Logs** → the API (gateway) log, the Auth log and the Postgres log → set the time range from
   before the suspected start → **Download logs** (CSV, at most 1,000 rows per download: repeat with
   shorter time ranges until the whole period is saved). Also save the app's own logs, which the
   project keeps for a year:
   ```sql
   -- run in the SQL editor; Download CSV each result
   select * from access_log where at >= '<start, e.g. 2026-11-20 00:00+05:30>' order by id;
   select * from audit_log where changed_at >= '<start>' order by id;
   ```
   Keep the files in the team's private folder for the incident (never in this repository).
3. **Find out who read what** (scope). `access_log` records each read of parents' contacts,
   consents and call notes, and each audit-log page, made in the app (0034):
   ```sql
   -- reads per login in the period
   select a.actor_id, p.full_name, a.function_name, count(*) as reads,
          count(distinct a.student_id) as students, min(a.at) as first, max(a.at) as last
     from access_log a left join profiles p on p.id = a.actor_id
    where a.at between '<start>' and '<end>'
    group by 1, 2, 3 order by reads desc;
   -- the students one login read about
   select distinct s.roll_no, s.full_name, s.dob
     from access_log a join students s on s.id = a.student_id
    where a.actor_id = '<user id>' and a.at between '<start>' and '<end>';
   ```
   Not in `access_log`: reads of student names, dates of birth, phones and attendance (other
   screens), anything read with the secret key or in the SQL editor, and the Guru's reads straight
   from the tables. For those, the Supabase logs of step 2 are the evidence. If a secret key, the
   database password or a hostile update was involved, assume **every** record was exposed.
4. **Tell each affected parent or adult student, without delay** (in practice within 24 hours of
   knowing, not waiting for the full picture). One message each, in their language, by the phone
   or email on the record; use the template below. A child's message goes to the parent. If more
   than about 200 people are affected, the Guru also announces it in the app and at the class.
5. **First report to the Data Protection Board, without delay** (the same day as step 4): what
   happened, how big, when, where, and the likely impact, as far as known. Send it through the
   Board's online channel. **[[TEAM]]:** look up the Board's current reporting channel now and write
   it here, so nobody searches for it during an incident.
6. **Detailed report to the Board within 72 hours** of becoming aware (or the longer time the Board
   allows): the updated description; the facts, circumstances and reasons that led to the breach;
   what was done and is planned to reduce the risk; what is known about who did it; what was
   changed so it does not happen again; and a report of the messages sent to the affected people
   (how many, when, how).
7. **Afterwards:** fix the cause properly (new keys, a new APK, a changed rule), write a short
   DECISIONS.md entry if a rule changes, and close the incident in the log. **[[TEAM]] / legal:**
   check whether CERT-In's 6-hour reporting of cyber incidents (Directions of 28 Apr 2022) applies
   to the class.

**The incident log.** Private folder, never this repository. One row per incident: Ref
(`IN-2026-01`), when it started (best guess) and when we knew, who found it, what happened, data
and people affected (count, roll numbers in a separate private file), logs saved (files), parents
told (date, how many), Board first report (date), Board 72-hour report (date), cause, fix, closed
(date).

**Message to an affected parent or adult student.** The Telugu and Hindi texts are **drafts for a
native speaker's review** before the pilot. Fill in the brackets; keep it short and plain.

> **English.** Mridanga Seva class: a problem with your data. On [date] we found that [what
> happened, e.g. "someone used a volunteer's lost phone to open student records"]. It happened
> between [start] and [end]. The data involved: [e.g. your child's name, date of birth and your
> phone number]. What this could mean for you: [e.g. calls or messages from people pretending to be
> the class]. What we have done: [e.g. switched that login off, changed the keys]. What you can do:
> [e.g. do not share codes or money with callers who say they are from the class; tell us about any
> such call]. We are sorry. Questions: privacy@mridangaseva.com or [phone].

> **తెలుగు (draft).** మృదంగ సేవ తరగతి: మీ వివరాలకు సంబంధించిన ఒక సమస్య. [తేదీ]న మేము గమనించాం:
> [ఏం జరిగింది]. ఇది [మొదలు] నుంచి [ముగింపు] మధ్య జరిగింది. ప్రభావితమైన వివరాలు: [ఉదా. మీ బిడ్డ పేరు,
> పుట్టిన తేదీ, మీ ఫోన్ నంబరు]. మీకు జరగగల ప్రమాదం: [ఉదా. తరగతి పేరుతో మోసపూరిత కాల్స్]. మేము
> చేసినది: [ఉదా. ఆ లాగిన్‌ను ఆపేశాం, కీలు మార్చాం]. మీరు చేయగలిగినది: [ఉదా. తరగతి పేరుతో అడిగే
> వారికి కోడ్‌లు లేదా డబ్బు ఇవ్వకండి; అలాంటి కాల్ వస్తే మాకు చెప్పండి]. క్షమించండి. ప్రశ్నలకు:
> privacy@mridangaseva.com లేదా [ఫోన్].

> **हिन्दी (draft).** मृदंग सेवा कक्षा: आपकी जानकारी से जुड़ी एक समस्या। [तारीख] को हमें पता चला कि
> [क्या हुआ]। यह [शुरुआत] से [अंत] के बीच हुआ। प्रभावित जानकारी: [जैसे आपके बच्चे का नाम, जन्मतिथि
> और आपका फ़ोन नंबर]। आपके लिए इसका संभावित असर: [जैसे कक्षा के नाम से धोखे वाले कॉल]। हमने क्या
> किया: [जैसे वह लॉगिन बंद किया, कुंजियाँ बदलीं]। आप क्या कर सकते हैं: [जैसे कक्षा के नाम से माँगने
> वालों को कोड या पैसे न दें; ऐसा कॉल आए तो हमें बताएँ]। हमें खेद है। सवाल: privacy@mridangaseva.com
> या [फ़ोन]।

### Reviewing the access log

Once a month (with the first Monday backup), the Guru opens **G11 Audit log → Reads of private
details**, or Praveen runs the first query of step 3 above for the last 30 days. Look for a login
that read far more students than it works with, reads at night, or reads by a login that left. Ask
the person first; if the answer does not explain it, it is a possible breach: start at step 1.
Rows older than 400 days are deleted every night (job `mridanga-access-log-purge`).

### If a key leaks

First find out which key it is and which project (test or live); do the steps for that project
([DECISIONS.md #123](DECISIONS.md)). A leaked secret that ever reached git stays in its history:
rotating it is the fix, not deleting the file.

| Key | What a leak allows | Do |
|---|---|---|
| **Publishable key** `sb_publishable_…` (`EXPO_PUBLIC_SUPABASE_KEY`) | Nothing extra: it is inside every APK and web page by design; row-level security protects the data | Nothing. Change it only if Supabase forces it, with the steps below |
| **Secret key** `sb_secret_…`, or the legacy `service_role` key | Everything, past all row-level security | Project Settings → **API Keys**: make a new secret key, then delete the leaked one (a legacy `service_role` key: **disable the legacy keys**). Treat all data as exposed: tell the Guru, look through `audit_log` for the time since the leak. The Edge Function gets its key from Supabase by itself; deploy it again ("Push notifications", step 10) and post a test announcement |
| **Database password** | Everything, like the secret key | Project Settings → **Database → Reset database password**; new one into the password manager. Only backups use it |
| **Firebase service-account key** | Sending notifications to the app's phones | Firebase → Project settings → Service accounts → **Manage service account permissions** (Google Cloud) → the service account → Keys → delete the leaked key; make a new one and upload it ("Push notifications", steps 4-5) |
| **Push secret** (`mridanga_push_secret`) | Calling the push function: it sends only what is queued | In that project's SQL editor: `select vault.update_secret((select id from vault.secrets where name = 'mridanga_push_secret'), encode(gen_random_bytes(32), 'hex'));` then replace the function's `PUSH_SECRET` ("Push notifications", step 9) |
| **Brevo API key or SMTP key** | Sending email as the team | Brevo → SMTP & API: delete it, make a new one. API key: `vault.update_secret` of `mridanga_brevo_key` ("Parent codes by email"). SMTP key: Supabase → Authentication → SMTP settings. Then send a test sign-up email |
| **Expo access token** or the Expo login | Publishing app updates to every phone | "If the Expo account is compromised" below |
| **Android keystore** | Signing an APK that installs over the app | Cannot be changed for APKs shared by link. Tell users to install only from the team's link; move to the Play Store's app signing when the app goes there |

#### When the app's Supabase URL or key changes

After a new publishable key (or a new project after a restore), every copy of the app must get the
new value before the old one stops working. Make the new key first, do all of this, check, and only
then delete the old key.

1. **`.env` files:** `app/.env.live` (live), or `app/.env.test` and `app/.env.development` (test),
   on every computer that builds or publishes. Never commit them.
2. **EAS environment** (from `app/`): `npx eas-cli env:push --environment production --path .env.live`
   for live, `--environment preview --path .env.test` for test; check with
   `npx eas-cli env:list --environment production`.
3. **App updates, per channel:** `npm run update:production -- --message "New key"` (live) and/or
   `npm run update:preview -- --message "New key"` (test). The script reads the key from EAS (step 2)
   and checks it. Phones on an APK whose fingerprint no longer matches main get no update: build a
   new APK for them ("Building the Android app"). Do not roll back to the embedded update afterwards:
   it holds the old key.
4. **Web sites, each one:** `npm run export:web -- --site live` and upload to `mridanga-seva` (live);
   `npm run export:web -- --site test` and upload to `mridanga-seva-test` (test). The script's
   last line names the site and project: check it, then the header check.
5. **Sign-in test on each:** the live APK, the test APK, the live site and the test site: sign in,
   open the students list (staff) or the home screen (student). *App not set up* or a sign-in error =
   that surface still has the old value.
6. Then delete the old key in Supabase, and sign in once more on each to be sure.

### If the Expo account is compromised

Whoever controls the Expo account can publish an update that runs on every phone with the
signed-in person's rights (updates are not signed, [DECISIONS.md #35](DECISIONS.md)). Act at once,
from a computer that is not suspected:

1. **Lock the account:** expo.dev → change the password; check that two-factor login is on; Account
   settings → **Sessions**: revoke all others; **Access tokens**: delete every token (the
   organisation `mridanga-seva` has its own token list too); **Members** of `mridanga-seva`: remove
   anyone unknown.
2. **See what was published:** from `app/`, `npx eas-cli update:list --branch production`
   and `--branch preview`, `npx eas-cli channel:list` (each channel must point to the branch of
   the same name), `npx eas-cli build:list`. Any update or build nobody on the team made is
   hostile.
3. **Roll back** each affected channel: `npx eas-cli update:rollback` → the branch → the
   last update the team made, or *the embedded update* ("Rolling back"). Then publish a fresh update
   from a clean `main` (`npm run update:production`), so phones land on known code.
4. **Rotate what Expo held:** the `EXPO_ACCESS_TOKEN` function secret, if one is set (new token,
   replace it in Supabase → Edge Functions → Secrets); the Firebase service-account key uploaded to
   Expo ("If a key leaks"). The keystore is in Expo too: if it may have been downloaded, follow its
   row in "If a key leaks".
5. **The data:** a hostile update could read what each signed-in person may read. Tell the Guru.
   Sign everyone out in each project's SQL editor (`delete from auth.sessions;`: phones cannot renew
   their login; what they hold ends within an hour) and look through `audit_log` for the time since
   the compromise.

### If a staff phone is lost

A Guru's or coordinator's phone holds a signed-in app that can open student records, including
minors'. The person tells the Guru at once (the maintainer, if it is the Guru's phone).

1. **Switch the login off** in G2 (Coordinators → the person). From that moment the database refuses everything that
   login asks; the app on the lost phone shows *Account switched off*.
2. **End its sessions and notifications** in the live project's SQL editor (find the user id in
   Authentication → Users by their email):
   ```sql
   delete from auth.sessions where user_id = '<user id>';
   delete from push_tokens where profile_id = '<user id>';
   ```
   The first stops the phone renewing its login; the second stops notifications (which can show
   names) on its lock screen.
3. **Password:** Authentication → Users → the user → **Send password recovery**, so the person sets a
   new one (in case the phone held it).
4. The person locks or erases the phone remotely (Google **Find My Device**,
   <https://www.google.com/android/find>).
5. **On the new phone:** switch the login on again in G2, install the APK, sign in.

A student's lost phone: the same steps 2-3 for their login if they ask; their own record is all it
can open.

## CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every pull request and every push to `main`
([DECISIONS.md #141](DECISIONS.md)). Three jobs, all with Node from `.nvmrc` (24):

| Job | Runs (in its folder) | Fails when |
|---|---|---|
| App | `npm ci`, `npx expo lint --no-cache`, `node scripts/typed-routes.mjs`, `npx tsc --noEmit`, `npm test` | lint, a type error or a mistyped route, an app unit test |
| Database | `supabase/tests`: `npm ci`, `npm test` | any smoke-test or push-message check, or a total other than `EXPECTED_CHECKS` |
| Website | `website`: `npm test` | the site does not build or its checker finds a problem |

It needs no secrets and reads the code only (`permissions: contents: read`). The same commands
run locally before a merge (see CONTRIBUTING.md). Results: the pull request's **Checks** tab, or
the repository's **Actions** tab. A red run: open the failed step, read the first `FAIL` or error
line, fix on the branch, push again; the run repeats itself.

**Not yet:** CI does not block a merge until the three jobs are made required (GitHub → the
repository → Settings → Rules → a ruleset for `main` → "Require status checks to pass": App,
Database, Website). That is Praveen's call. CI does not run the app on a phone, deploy anything,
publish an update or touch TEST/LIVE: those stay manual (sections above).

**Actions are pinned by commit SHA**, with the version in a comment. Dependabot proposes newer
ones monthly; check the action's release notes before merging.

## Dependabot

`.github/dependabot.yml` opens pull requests for outdated or vulnerable packages: npm weekly on
Monday for `app/`, `supabase/tests/` and `website/` (minor and patch updates grouped into one pull
request per folder), GitHub Actions monthly. In `app/`, every Expo-pinned package is skipped
entirely (expo, expo-*, @expo/*, react, react-dom, react-native, react-native-*, @react-native/*,
@types/react), as is the pinned eas-cli and the TypeScript/ESLint majors: Expo SDK 57 pins exact
versions, so even a patch bump changes the fingerprint and needs a new APK. Those move together in
an SDK upgrade (`npx expo install --fix`) with a new build. Their security alerts still show under
the repository's Security tab; they are fixed at that upgrade, or by a lock-file-only
`npm update <transitive package>` when the fingerprint stays the same (07-10-2026: shell-quote).

Reviewing one (never auto-merge, never merge on a green CI alone):
1. Read what changed (the pull request lists versions and release notes).
2. **`app/` updates:** in a worktree with the branch, `cd app`, `npm ci`, then
   `npx expo-updates runtimeversion:resolve --platform android`. Same fingerprint as the installed
   APK (185e839f today) → it can ship as an over-the-air update. A different one → it needs a new
   APK build: merge only when a build is planned (OPERATIONS "Building the Android app").
3. `supabase/tests/` and `website/` updates touch no phone: a green CI is enough after step 1.
4. Merge, or close with a comment why (Dependabot then skips that version).

A security alert comes as a Dependabot pull request too; treat it first.

**`npm audit` in `app/`** (triage of 9 Oct 2026, [DECISIONS.md #199](DECISIONS.md)): 55 advisories
(1 low, 23 moderate, 31 high). All but one are in tools that run on the maintainer's computer or on
EAS while building (eas-cli, the Expo CLI, Metro, config plugins: node-forge, tar, minimatch, braces,
joi, yaml …); none of their code is in the app. The one in the app is query-string /
decode-uri-component under expo-router: a malformed address slows only the phone that opens it.
They are fixed by the Expo SDK upgrade that comes with the production APK (brief 9), then
`npm audit` again. **Never** `npm audit fix --force` (it installs versions Expo does not support
and moves the fingerprint). Re-run the triage after each SDK upgrade and write the date here.

## Handing over

A new maintainer needs: access to the accounts above, this documentation, and the repository. Read
[ARCHITECTURE.md](ARCHITECTURE.md), then [DECISIONS.md](DECISIONS.md), then [DATABASE.md](DATABASE.md).
