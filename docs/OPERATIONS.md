# Operations

How to set up, run and hand over the live system. Keep this current: whoever runs the system next
will rely on it.

## Accounts the system depends on

| Service | Used for | Plan | Owner |
|---|---|---|---|
| Supabase | Database, login, storage, daily jobs | Free | Team email account |
| Brevo | Sending sign-up and password-reset emails | Free (300 emails a day) | Team email account |
| Expo | Building the Android app | Free | Team email account |
| GitHub | Source code | Free, public repository | Maintainer |
| YouTube | Lesson videos | Free | Team or channel owner |

Keep the logins for these in one place the team controls, so the system never depends on one person.

## Setting up a new environment

1. **Create a Supabase project** (free plan) inside the "Mridanga Seva" organisation. Region: South
   Asia (Mumbai). Let Supabase generate the database password and keep it in a password manager —
   never in this repository or a chat. Turn on **Enable automatic RLS**.
2. **Create the tables** — step by step:
   1. On GitHub, open [`supabase/migrations/0001_phase1.sql`](../supabase/migrations/0001_phase1.sql)
      and click **Copy raw file** (the copy icon at the top right of the file).
   2. In Supabase, open **SQL Editor → New query**, paste, and click **Run**.
   3. You should see *Success. No rows returned.*
   4. If it fails on `pg_cron`: open **Database → Extensions**, switch on **pg_cron**, and run the
      same query again. A failed run changes nothing, so running it again is safe.
   5. Run every later migration the same way, in number order: `0002_login_linking.sql`, then
      `0003_register_student.sql`, `0004_attendance.sql`, `0005_students_follow_up.sql`, and so on. **Run 0002 straight after
      0001**: without it the first Guru cannot be set (step 7) and internal functions are open.
3. **Test project only — add the dummy data:** do the same with [`supabase/seed.sql`](../supabase/seed.sql)
   in a new query. Check under **Table Editor → students**: 15 students, roll numbers
   `MS-2026-0001` to `MS-2026-0015`. Never run the seed on the live project. Its header lists the
   steps it cannot do (creating staff logins, assigning mentors).

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
   - **Authentication → URL Configuration:** set **Site URL** to the web version's address (see
     "Publishing the web version"). Under **Redirect URLs** add that address and, for development,
     `http://localhost:8081`. Links in sign-up and password-reset emails open these addresses.
5. **Email (SMTP):** in Brevo, verify the sender email and create an SMTP key. In Supabase, go to
   Authentication → SMTP settings and enter Brevo's host `smtp-relay.brevo.com`, port 587, login and key.
   Without this, Supabase sends only 2 emails an hour.
6. **App settings:** copy `app/.env.example` to `app/.env` and fill in the project URL and the
   anon / publishable key (**Project Settings → API Keys**). Never use the `service_role` or
   `sb_secret_...` key in the app: the app refuses to start with it. Then run the app:
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

iPhone users use the web version and can add it to their home screen. Build it on any computer:

```bash
cd app
npx expo export --platform web
```

This writes the site to `app/dist/`. Upload that folder to a free static host. The web version is a
single-page app ([DECISIONS.md #15](DECISIONS.md)), so the host must send every address to
`index.html`:

- **Netlify:** a file `app/public/_redirects` containing `/* /index.html 200`.
- **Cloudflare Pages:** does this by itself when the site has no `404.html`.
- **GitHub Pages:** copy `dist/index.html` to `dist/404.html` before uploading; if the site lives
  under `/<repo-name>`, also set `experiments.baseUrl` in `app.json`.

Then put the site's address in Supabase as the Site URL (setup step 4). The host is not chosen yet.

**Camera on the web version.** Browsers let a page use the camera only on an `https://` address
(or `localhost` during development); all the hosts above serve `https`. Browsers without built-in
QR reading (Safari on iPhone, Firefox) get a QR reader that expo-camera downloads once from the
public jsDelivr CDN (`fastly.jsdelivr.net`, package `zxing-wasm`). Only the reader program is
downloaded; camera pictures never leave the phone. If that address is blocked on a network,
scanning does not work there, but the name search on the same screen still does.

## App icon and splash screen

`app/assets/images/` holds placeholder artwork (a white khol on saffron), drawn by
`node app/scripts/make-placeholder-icons.mjs`. When the team has a logo, replace the PNG files
with images of the same sizes and keep the saffron colour in `app.json` and
`app/src/theme/colors.ts` in step with it.

## Weekly backup

The free plan does not include downloadable backups (check Supabase's current pricing page). Once a
week, export the data yourself:

- Use the Supabase CLI (`supabase db dump`) or `pg_dump` with the connection string from
  Project Settings → Database.
- Store the file somewhere private. It contains personal data of students, including minors — never
  put it in the repository or a shared chat.

## Keeping the free project awake

A free Supabase project pauses after 7 days without activity. Daily class use keeps it awake. During
long holidays, open the app once a week, or restore the project from the dashboard if it pauses.

## If a key leaks

1. Supabase → Project Settings → API: rotate the leaked key.
2. If it was the `service_role` key, treat all data as exposed: check `audit_log`, and tell the Guru.
3. Remove the key from the repository history and update `app/.env`.

## Handing over

A new maintainer needs: access to the accounts above, this documentation, and the repository. Read
[ARCHITECTURE.md](ARCHITECTURE.md), then [DECISIONS.md](DECISIONS.md), then [DATABASE.md](DATABASE.md).
