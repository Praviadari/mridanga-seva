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
   5. Later migrations (`0002_...`, `0003_...`) are run the same way, in number order.
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
4. **Auth settings:** under **Authentication → Sign In / Providers → Email**, keep Email enabled.
   While testing without step 5, turn **Confirm email** off (the built-in email sends only 2 emails
   an hour); turn it back on before real users join. Set the site URL to where the web version runs.
5. **Email (SMTP):** in Brevo, verify the sender email and create an SMTP key. In Supabase, go to
   Authentication → SMTP settings and enter Brevo's host `smtp-relay.brevo.com`, port 587, login and key.
   Without this, Supabase sends only 2 emails an hour.
6. **App settings:** copy `app/.env.example` to `app/.env` and fill in the project URL and the
   anon / publishable key (**Project Settings → API Keys**). Never use the `service_role` key in the app.
7. **First Guru account:** sign up in the app, then in the Supabase Table Editor set that row's
   `role` in `profiles` to `guru`. After that, the Guru gives roles from the app.

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
