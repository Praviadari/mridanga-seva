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
| Cloudflare | Hosting the web version (Cloudflare Pages) | Free | Team email account |
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
3. **Test project only — add the dummy data:** do the same with [`supabase/seed.sql`](../supabase/seed.sql)
   in a new query. Check under **Table Editor → students**: 15 students, roll numbers
   `MS-2026-0001` to `MS-2026-0015`. Never run the seed on the live project. Its header lists the
   steps it cannot do (creating staff logins, assigning mentors).

   **If the seed was run on the live project by mistake** (it happened once, on 29 Sep 2026), and
   the live project has no real students yet, remove it in the live project's SQL editor. This
   deletes every student and their records, so never run it once real students exist:
   ```sql
   begin;
   delete from students;        -- also their parents, consents, visits, calls, follow-ups, progress
   delete from roll_counters;   -- the first real student gets MS-<year>-0001 again
   delete from announcements;   -- before groups: announcements point to groups
   delete from materials;       -- before syllabus_items: materials point to syllabus items
   delete from groups;
   delete from syllabus_items;
   commit;
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
6. **App settings:** copy `app/.env.example` to `app/.env` and fill in the project URL and the
   anon / publishable key (**Project Settings → API Keys**). Never use the `service_role` or
   `sb_secret_...` key in the app: the app refuses to start with it. Put the test project's two
   values in `app/.env.test` the same way; the test web site and test APK are built from it
   ("Publishing the web version", "Building the Android app"). Then run the app:
   ```bash
   cd app
   npm install
   npx expo start
   ```
   Press `w` for the web version in a browser, or scan the QR code with Expo Go on an Android
   phone. If the app shows *App not set up*, the URL or key in `app/.env` is missing; restart
   `npx expo start` after changing it.
7. **First Guru account:** sign up in the app and confirm the email. Then in the Supabase
   **Table Editor → profiles**, find the row with that email and set `role` to `guru`. After that,
   the Guru gives roles from the app.

## Paper consent forms

For a student under 18, the parent fills in and signs a paper consent form at the desk, and the
coordinator ticks in the app that it was received ([DECISIONS.md #16](DECISIONS.md)). The app
stores only that it was given, when, by whom it was checked, and which type of ID was seen.

Suggested practice, until the team agrees its own (with the temple's legal adviser):

- Keep the signed forms together, in a closed file at the centre that only coordinators use.
- A parent may withdraw consent at any time. Until a screen for this exists, the Guru fills in
  `consents.revoked_at` in the dashboard and removes the student's details as agreed with the parent.
- The wording of the form itself is still to be agreed.

## Publishing the web version

iPhone users use the web version and can add it to their home screen. It is hosted on
**Cloudflare Pages** ([DECISIONS.md #23](DECISIONS.md)), as two sites that look the same:

| Site | Talks to | Settings file | Used by |
|---|---|---|---|
| `mridanga-seva-test` | the test Supabase project (dummy data) | `app/.env.test` | demos, testers, volunteers |
| `mridanga-seva` | the live Supabase project | `app/.env` | the class, from the pilot on |

Both files hold the two lines of `app/.env.example`, filled in with that project's URL and
publishable key. Build on any computer that has the file:

```bash
cd app
npm run export:web -- --env .env.test
```

That builds the test site; `npm run export:web` alone builds the live site. The first line it
prints names the Supabase project it built for: check it before uploading. The site is written
to `app/dist/`. Always use this command, not a bare `npx expo export`, because
`scripts/export-web.mjs`

- hands the chosen file's settings to Expo and clears Metro's cache (an old cache once produced
  a site that said *App not set up*);
- moves the images Expo puts under `assets/node_modules` (such as the back arrow) to
  `assets/vendor` — Cloudflare Pages never uploads a folder named `node_modules`, so those images
  would be missing;
- stops if the export holds the Supabase secret key, or does not hold exactly the URL and key of
  the chosen file, so a test site can never talk to the live project.

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
QR reading (Safari on iPhone, Firefox) get a QR reader that expo-camera downloads once from the
public jsDelivr CDN (`fastly.jsdelivr.net`, package `zxing-wasm`). Only the reader program is
downloaded; camera pictures never leave the phone. If that address is blocked on a network,
scanning does not work there, but the name search on the same screen still does.

### Adding it to an iPhone home screen

In **Safari**, open the site, tap **Share → Add to Home Screen → Add**. It then opens full screen
with the app icon, like an installed app. The icon and name come from `app/public/index.html` and
`app/public/manifest.json`.

Tell users two things:

- The home-screen app keeps its own login, apart from Safari: sign in once inside it.
- Links in emails (confirm the email, reset the password) open in Safari, not in the home-screen
  app. Confirm or set the new password there, then go back to the home-screen app and sign in.

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
| `production` | the live Supabase project (settings from `app/.env`) | the class, from the pilot on |

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
npx eas-cli@latest env:push --environment production --path .env
```

`env:push` copies each project's Supabase URL and publishable key to EAS. The build servers
never see `app/.env` or `app/.env.test` (they are not in git), so without this step the APK would
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
   `app/.env` or `app/.env.test` — and checks the URL is that channel's project (`preview` = test
   `fhuqyk…`, `production` = live `qeozvv…`);
3. builds the Android bundle into `app/dist-update/` and checks it holds that project's URL and
   key, not the other project's address, and no secret key;
4. publishes it with `eas update`.

Add `--check-only` to run steps 1-3 without publishing. Never run `eas update` by hand: it
would bundle whatever settings it finds, and an update made with the live settings would send
testers into the class's real data. The message may not contain `"`, `%`, `$`, backticks or
backslashes. Uploading needs a network that does not inspect secure connections (see "Each
build" above).

**Rolling back** a bad update (from `app/`): `npx eas-cli@latest update:rollback` and follow the
questions: choose the channel's branch (`preview` or `production`), then either an earlier
update or *the embedded update* (what came inside the APK). Phones get the rollback the same
way they get an update. A fix published later replaces it.

**What exists on EAS:** `npx eas-cli@latest update:list --all` (updates), `channel:list`
(channels and the branch each one serves). The free plan covers 1,000 people a month who
download updates; the class is about 200.

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

**Switching it off:** `select cron.unschedule('mridanga-push');` in the SQL editor stops it. To
switch on again, `select cron.schedule('mridanga-push', '* * * * *', 'select send_due_push()');`:
announcements published meanwhile are then sent if they are less than a day old, the older ones
never.

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

## Weekly backup

The free plan does not include downloadable backups (check Supabase's current pricing page). Once a
week, export the data yourself:

- Use the Supabase CLI (`supabase db dump`) or `pg_dump` with the connection string from
  Project Settings → Database.
- Store the file somewhere private. It contains personal data of students, including minors — never
  put it in the repository or a shared chat.
- The dump holds the database only, not the photos and PDFs in Storage. They are usually copies
  of posters and timetables their authors keep; if a copy is needed, download them from
  **Storage → announcement-files**.

## Keeping the free project awake

A free Supabase project pauses after 7 days without activity. Daily class use keeps it awake. During
long holidays, open the app once a week, or restore the project from the dashboard if it pauses.

## If a key leaks

1. Supabase → Project Settings → API: rotate the leaked key.
2. If it was the `service_role` key, treat all data as exposed: check `audit_log`, and tell the Guru.
3. Remove the key from the repository history and update `app/.env`.
4. The **Firebase service-account key**: in Firebase, Project settings → Service accounts →
   **Manage service account permissions** (Google Cloud) → the service account → Keys → delete
   the leaked key; generate a new one and upload it again ("Push notifications", steps 4-5).
5. The **push secret**: make a new one in the Vault, in that project's SQL editor:
   `select vault.update_secret((select id from vault.secrets where name = 'mridanga_push_secret'), encode(gen_random_bytes(32), 'hex'));`
   then give the new value to the function ("Push notifications", step 9: replace `PUSH_SECRET`).

## Handing over

A new maintainer needs: access to the accounts above, this documentation, and the repository. Read
[ARCHITECTURE.md](ARCHITECTURE.md), then [DECISIONS.md](DECISIONS.md), then [DATABASE.md](DATABASE.md).
