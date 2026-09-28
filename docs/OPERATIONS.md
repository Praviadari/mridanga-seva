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

1. **Create a Supabase project** (free plan). Choose a region close to India.
2. **Run the schema:** open the SQL editor and run `supabase/migrations/0001_phase1.sql`, then any
   later migrations in number order.
   - If `create extension pg_cron` fails, enable **pg_cron** under Database → Extensions and run the file again.
   - **Test project only:** then run `supabase/seed.sql` for fictional students, a placeholder
     syllabus and sample visits. Never run it on the live project. Its header lists the steps it
     cannot do (creating staff logins, assigning mentors).
3. **Auth settings:** enable Email sign-in with password. Set the site URL to where the web version runs.
4. **Email (SMTP):** in Brevo, verify the sender email and create an SMTP key. In Supabase, go to
   Authentication → SMTP settings and enter Brevo's host `smtp-relay.brevo.com`, port 587, login and key.
   Without this, Supabase sends only 2 emails an hour.
5. **App settings:** copy `app/.env.example` to `app/.env` and fill in the project URL and the
   anon / publishable key. Never use the `service_role` key in the app.
6. **First Guru account:** sign up in the app, then in the Supabase Table Editor set that row's
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
