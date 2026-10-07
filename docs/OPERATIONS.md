# Operations

How to set up, run and hand over the live system. Keep this current: whoever runs the system next
will rely on it.

## Accounts the system depends on

| Service | Used for | Plan | Owner |
|---|---|---|---|
| Supabase | Database, login, storage (photos and PDFs), scheduled jobs, the Edge Function that sends push notifications | Free (1 GB of files, 500,000 Edge Function calls a month) | Team email account |
| Brevo | Sending sign-up and password-reset emails | Free (300 emails a day) | Team email account |
| Expo | Building the Android app (EAS Build) and updating it on the phones (EAS Update); its push service passes notifications on | Free (15 Android builds a month; updates for 1,000 people a month, 100 GiB of downloads) | Team email account |
| Firebase (Google) | Delivers push notifications to Android phones (Cloud Messaging) | Free | Team email account |
| Cloudflare | Hosting the web version and the public website (Cloudflare Pages) | Free | Team email account |
| Zoho | The domain mridangaseva.com (registrar) and the team's mail (info@, privacy@ aliases) | Zoho Mail free plan | Team Zoho account |
| GitHub | Source code | Free, public repository | Maintainer |
| YouTube | Lesson videos | Free | Team or channel owner |

Keep the logins for these in one place the team controls, so the system never depends on one person.

**For now (from 30 Sep 2026) Cloudflare, Expo and Firebase are on the maintainer's personal
account**, because the team email does not exist yet. When it does, add it to each with full
rights (Cloudflare: a Super Administrator member of the account; Expo: an Owner of the
organisation that owns the app; Firebase: an Owner in **Project settings → Users and
permissions**), check that it can sign in, then remove the personal account. The sites, the app's
project id and its signing keystore stay the same, so nothing needs rebuilding.

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
   3. You should see *Success. No rows returned.* For `0001` only, the editor instead shows a small
      table with one column, `schedule`, holding the number 2 (the second daily job it created);
      that also means it worked.
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
   `supabase/config.toml`; commit it.
4. **Auth settings:**
   - **Authentication → Sign In / Providers → Email:** keep Email enabled. Set the minimum
     password length to **8** (the app asks for 8 too).
   - **Confirm email:** while testing with dummy data and without step 5, you may turn it off (the
     built-in email sends only 2 emails an hour). **Turn it on before any real student record
     exists**: while it is off, anyone can sign up with a student's email and be linked to that
     student's record ([DECISIONS.md #13](DECISIONS.md)).
   - **Authentication → URL Configuration:** set **Site URL** to the address of the web version
     that talks to this project: `https://mridanga-seva.pages.dev` for the live project,
     `https://mridanga-seva-test.pages.dev` for the test one (see "Publishing the web version"). Under
     **Redirect URLs** add that address and, for development, `http://localhost:8081`. Links in
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
- stops if the export holds the Supabase secret key, names the other project, or does not hold
  exactly the URL and key of the site's file, so a test site can never talk to the live project;
- copies the QR reader into `dist/zxing/<version>/` after checking its SHA-256 ([#143](DECISIONS.md));
- writes `dist/_headers` from `app/public/_headers`: the Content-Security-Policy with this site's
  Supabase address, HSTS, `nosniff`, Referrer-Policy and Permissions-Policy ([#142](DECISIONS.md));
- writes `dist/version.txt` (site, commit, build time, project). The same id shows under
  **Sign out** on the web version, e.g. "Web version test · 244e9f8 · 07-10-2026 15:00"
  ([#144](DECISIONS.md)). "+changes" after the commit means the folder had uncommitted changes:
  commit first for a site people use.

**After every upload, check the headers** (a minute, on the site's address):

1. In a terminal: `curl.exe -sI https://mridanga-seva-test.pages.dev/` — the answer must contain
   `content-security-policy:` (with the site's own `https://<ref>.supabase.co` in `connect-src`),
   `permissions-policy: camera=(self), ...`, `strict-transport-security:` and
   `x-content-type-options: nosniff`. No CSP line means `_headers` was not in the upload: upload
   the whole `dist` folder again.
2. `curl.exe -s https://mridanga-seva-test.pages.dev/version.txt` shows the site and commit just built.
3. Open the site, sign in, press F12 → Console: no red "Content Security Policy" lines. Open
   Attendance → scan (the camera starts and reads a QR code) and, if there is one, a lesson video.
4. Add a row to the upload log below.

**Upload log** (newest first; site, commit, build time from version.txt, who):

| Date | Site | Commit | Built (UTC) | By |
|---|---|---|---|---|
| | | | | |

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
  `fr`), translate the seven `.html` files and `strings.json`, and set its `meta` (`bcp47`,
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
| `preview` | the test Supabase project (settings from `app/.env.test`) | demos, testers, volunteers |
| `production` | the live Supabase project (settings from `app/.env.live`) | the class, from the pilot on |

Both have the same package name, so a phone holds one or the other: installing one replaces the
other, and the person signs in again. Each profile is also the **update channel** of the same
name (`"channel"` in `eas.json`): a preview APK takes only preview updates, a production APK only
production ones (see "Updating the Android app" below).

The app belongs to the Expo project `@mridanga-seva/mridanga-seva`, in the Expo organisation
`mridanga-seva` (set up 30 Sep 2026). `app.json` names it: `"owner"` and `extra.eas.projectId`.
The id is not a secret.

**Once, on a new computer** (from `app/`): `npx eas-cli@latest login`. It opens the browser to
sign in to Expo.

**Once, and again whenever a project's Supabase URL or key changes** (from `app/`):

```bash
npx eas-cli@latest env:push --environment preview --path .env.test
npx eas-cli@latest env:push --environment production --path .env.live
```

`env:push` copies each project's Supabase URL and publishable key to EAS. The build servers
never see `app/.env.live` or `app/.env.test` (they are not in git), so without this step the APK would
say *App not set up*. If it asks for a visibility, choose plain text: these values are inside
every copy of the app anyway. `npx eas-cli@latest env:list --environment preview` shows what EAS
has.

**Only for a new Expo project** (a new organisation, for example): put `"owner":
"<organisation>"` in `app.json`, run `npx eas-cli@latest init --account <organisation>` and commit
the change. `init` writes the project id into `app.json`, but also copies settings from the
plugins into it (an `android.permissions` list, an empty `extra.router`): remove those two, keep
`extra.eas.projectId`.

**Each build** (`preview` for the test project, `production` for the live one):

```bash
npx eas-cli@latest build -p android --profile preview
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
  once (`npx eas-cli@latest credentials -p android`) and keep it with the team's passwords —
  never in this repository or a chat.
- Free builds wait in a low-priority queue, sometimes for a while, and may run for at most
  45 minutes. The free plan allows 15 Android builds a month, so build for a release, not for every change.
- When it finishes, the build's page on expo.dev has an **Install** link and a QR code. Share that link.

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
scripts and `.gitignore`, which cannot change this app's native side. When unsure, just run the
publish command: it stops with *no finished … APK has fingerprint …* when a new APK is needed.

**Publishing an update** (from `app/`, logged in to Expo, with the change committed to `main`):

```bash
npm run update:preview -- --message "Clearer follow-up card"
```

That is for the test app (testers, volunteers). For the live app used by the class, after the
change has been checked on preview, use `npm run update:production -- --message "..."`; it asks
you to type `yes`. The script (`app/scripts/publish-update.mjs`):

1. stops if the network cannot upload to EAS (an office network that inspects secure
   connections), or if no finished APK on that channel has the app's current fingerprint;
2. takes the Supabase URL and key from the EAS environment of the same name — never from
   the `app/.env*` files, and with `EXPO_NO_DOTENV=1` so Expo loads none of them either — and checks the URL is that channel's project (`preview` = test
   `fhuqyk…`, `production` = live `qeozvv…`);
3. builds the Android bundle into `app/dist-update/` and checks it holds that project's URL and
   key, not the other project's address, and no secret key;
4. publishes it with `eas update`.

Add `--check-only` to run steps 1-3 without publishing. Never run `eas update` by hand: it
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

1. In `app/`: `npx eas-cli@latest build -p android --profile preview`; check the build page shows
   fingerprint 185e839f (or what `npx expo-updates runtimeversion:resolve --platform android`
   prints on main then).
2. Install it over the old app on a test phone, sign in, and check: the metronome sounds at 30, 80
   and 240 beats a minute with no gap where the loop restarts, and keeps time against a reference
   metronome for a few minutes; the taal player at 50 / 75 / 100 %; tempo changes while playing;
   leaving the screen stops the sound; the screen and app in the background (expo-audio plays on,
   with a media notice); the practice timer logs; Android asks for the microphone only when
   recording and for location only "while using the app"; notices in the inbox open their screens.
3. Then share the APK link with the volunteers as for f9a084aa.
**Rolling back** a bad update (from `app/`): `npx eas-cli@latest update:rollback` and follow the
questions: choose the channel's branch (`preview` or `production`), then either an earlier
update or *the embedded update* (what came inside the APK). Phones get the rollback the same
way they get an update. A fix published later replaces it.

**What exists on EAS:** `npx eas-cli@latest update:list --all` (updates), `channel:list`
(channels and the branch each one serves). The free plan covers 1,000 people a month who
download updates; the class is about 200.

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
   npx eas-cli@latest credentials -p android
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
    the push secret instead. `--use-api` builds it on Supabase's side, so Docker is not needed,
    and no `supabase/config.toml` either (CLI 2.118). The list must show `notify-announcements`,
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
**Then a new APK**, built after steps 3 and 5 (see "Building the Android app"):

11. `npx eas-cli@latest build -p android --profile preview` (test project) or `--profile
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
    `status_code` 401 = the push secret in the Vault and the function's `PUSH_SECRET` differ
    (compare their fingerprints, step 9); 404 = the function is not deployed. No row in `push_tokens` = the phone has no token: Expo Go, no
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
## Files no announcement uses

Photos and PDFs are removed from Storage by the app when an announcement or one of its files is
deleted ([DECISIONS.md #32](DECISIONS.md)). If that failed (no internet at that moment), the file
stays in the bucket, unused. Once in a while, list such files in the SQL editor:

```sql
select o.name, o.created_at, (o.metadata ->> 'size')::bigint as bytes
  from storage.objects o
 where o.bucket_id = 'announcement-files'
   and o.created_at < now() - interval '1 day'
   and not exists (select 1 from announcements a
                    where a.attachments @> jsonb_build_array(jsonb_build_object('path', o.name)));
```

Delete them in **Storage → announcement-files** (open the folder, tick the files, **Delete**).
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

A free Supabase project pauses after 7 days without activity. Daily class use keeps it awake. During
long holidays, open the app once a week, or restore the project from the dashboard if it pauses.

## Scheduled jobs: health check

The database runs seven jobs on its own (times in UTC; IST is 5:30 later): `mridanga-status-refresh`
(00:30, student statuses and follow-up calls), `mridanga-close-visits` (15:30, checks out open
visits), `mridanga-assessments` and `mridanga-events-polls` (03:30), `mridanga-inbox-cleanup`
(01:00), `mridanga-duty` (12:30) and `mridanga-push` (every minute). If one fails, nothing tells
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

Healthy: seven rows, all `active`; each daily job's `last_success` within the last day and
`mridanga-push` within minutes; `failed_2_days` 0. Otherwise `last_error` says why (for example a
setting changed in the dashboard to a wrong value); fix the cause and the job recovers on its next
run. The push job always counts as succeeded, even when push is not set up: its own result is
`last_job_result` (`not_set_up` = "Push notifications", step 13). A missing row means the job was
removed: create it again with its `cron.schedule` line from `supabase/migrations/` (search for the
job's name). A project that has not run every migration has fewer jobs (0001 makes the first two,
0011 the push job, 0015, 0016, 0022 and 0023 one each).

## If a key leaks

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

### When the app's Supabase URL or key changes

After a new publishable key (or a new project after a restore), every copy of the app must get the
new value before the old one stops working. Make the new key first, do all of this, check, and only
then delete the old key.

1. **`.env` files:** `app/.env.live` (live), or `app/.env.test` and `app/.env.development` (test),
   on every computer that builds or publishes. Never commit them.
2. **EAS environment** (from `app/`): `npx eas-cli@latest env:push --environment production --path .env.live`
   for live, `--environment preview --path .env.test` for test; check with
   `npx eas-cli@latest env:list --environment production`.
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

## If the Expo account is compromised

Whoever controls the Expo account can publish an update that runs on every phone with the
signed-in person's rights (updates are not signed, [DECISIONS.md #35](DECISIONS.md)). Act at once,
from a computer that is not suspected:

1. **Lock the account:** expo.dev → change the password; check that two-factor login is on; Account
   settings → **Sessions**: revoke all others; **Access tokens**: delete every token (the
   organisation `mridanga-seva` has its own token list too); **Members** of `mridanga-seva`: remove
   anyone unknown.
2. **See what was published:** from `app/`, `npx eas-cli@latest update:list --branch production`
   and `--branch preview`, `npx eas-cli@latest channel:list` (each channel must point to the branch of
   the same name), `npx eas-cli@latest build:list`. Any update or build nobody on the team made is
   hostile.
3. **Roll back** each affected channel: `npx eas-cli@latest update:rollback` → the branch → the
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

## If a staff phone is lost

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

## Handing over

A new maintainer needs: access to the accounts above, this documentation, and the repository. Read
[ARCHITECTURE.md](ARCHITECTURE.md), then [DECISIONS.md](DECISIONS.md), then [DATABASE.md](DATABASE.md).
