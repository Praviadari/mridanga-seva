# Maintainer handbook

Two pages for the person who looks after the app. It says where things are and which section of the big documents to
open; it repeats none of their steps. Read it first, then [ARCHITECTURE.md](ARCHITECTURE.md) and
[OPERATIONS.md](OPERATIONS.md) when a task needs them.

## 1. Where things live

| Folder | What is in it | Read more |
|---|---|---|
| `app/` | The app (Expo SDK 57, React Native, Expo Router): Android APK, over-the-air updates and the web version from one code base | [ARCHITECTURE.md](ARCHITECTURE.md) |
| `app/src/app/` | One file per screen, by area: `student/`, `staff/`, `waiting/`, `subscriber/`, sign-in and sign-up at the top | [SCREENS.md](SCREENS.md) |
| `app/src/lib/`, `data/`, `components/` | Shared logic (rules, dates, the offline queue), database calls, building blocks of the screens | comments at the top of each file |
| `app/src/i18n/locales/` | English, Telugu and Hindi text | [TRANSLATIONS.md](TRANSLATIONS.md) |
| `app/scripts/` | Web export (`export-web.mjs`), update publishing (`publish-update.mjs`), the service worker, checks | the comment at the top of each script |
| `app/tests/` | Unit tests (`npm test`) | [CONTRIBUTING.md](../CONTRIBUTING.md) "Tests" |
| `supabase/migrations/` | The database, one numbered SQL file per change, run in number order and never edited once run | [DATABASE.md](DATABASE.md) |
| `supabase/functions/` | Edge Functions: `notify-announcements` (push), `notify-parents` (parent emails) | OPERATIONS "Push notifications", "Parent notices by email" |
| `supabase/tests/` | The database tests: every migration on an in-memory Postgres, the access rules, the push texts | DATABASE "Testing a migration" |
| `e2e/` | Browser tests of the web version on the TEST project (Playwright): sign-in, desk, check-in, practice, What's new | [e2e/README.md](../e2e/README.md) |
| `website/` | The public website (mridangaseva.com) | OPERATIONS "The public website" |
| `design/` | Colours and type sizes shared by the app and the website | `design/tokens.json` |
| `docs/` | These documents; every important choice is numbered in [DECISIONS.md](DECISIONS.md) | [docs/README.md](README.md) |

**Two Supabase projects.** TEST (`fhuqyk…`, dummy data, the test site and the preview channel) and LIVE (`qeozvv…`, the
class). `app/.env.test` points at TEST, `app/.env.live` at LIVE; neither file is in git. Every change goes to TEST
first. Never run a dev server, a test or a script against LIVE to "try" something.

## 2. Checks before any merge

From `app/` (what CI runs, OPERATIONS "CI"):

```bash
npx expo lint --no-cache
npx tsc --noEmit
npm test
```

- **Fingerprint:** `node node_modules/expo-updates/bin/cli runtimeversion:resolve --platform android` must print the
  same value as the APK on the phones (OPERATIONS "Updating the Android app"). A change of it means a new APK, not an
  update: native packages, `app.json` and plugins change it; JavaScript does not.
- **Database:** after any change in `supabase/`, in `supabase/tests/`: `npm ci`, `npm test`.
- **Website:** after a change in `website/`, `npm test` there.
- **Browser flows:** `npm run e2e` in `e2e/` (needs the E2E logins of [e2e/README.md](../e2e/README.md), so it runs
  on a maintainer's PC, not in CI).
- **An update bundle:** `npm run update:preview -- --check-only --message x` in `app/` builds it without publishing.

## 3. Releasing

The order never changes: **database first, then the app** (OPERATIONS "Releasing a change: database first").

| Step | Where it is written |
|---|---|
| Run a migration on TEST, then on LIVE after a backup | OPERATIONS "Setting up a new environment" step 2, "Backups", GO_LIVE_CHECKLIST part B |
| Edge Function deploys | OPERATIONS "Push notifications" and "Parent notices by email" |
| Test site and preview channel | OPERATIONS "Publishing the web version", "Updating the Android app" |
| A "What's new" entry for the release | `app/src/content/` (the publish check refuses a production update without a dated entry) |
| LIVE web site, production update, website | OPERATIONS "Publishing the web version", "Updating the Android app", "The public website" |
| A new APK (only when the fingerprint changed) | OPERATIONS "Building the Android app" |
| After the release: read-only checks | GO_LIVE_CHECKLIST part F |
| Something went wrong | OPERATIONS "Incidents", "Rolling back" in "Updating the Android app" |

Every upload gets a row in the upload log of OPERATIONS. A production update and the LIVE site go out only on the
maintainer's own "publish"; nobody else and no script publishes on their own.

## 4. Who holds which login or key

Roles only; the values live in the holder's password manager, never in git, a chat or a document.

| Login or key | Held by | Used for |
|---|---|---|
| Supabase organisation (both projects, dashboard, SQL editor) | Maintainer | Migrations, Edge Function deploys and secrets, logins on TEST |
| Edge Function secrets (Brevo key, push secret, mail sender) | Supabase, set by the maintainer | Emails and push; rotated as in OPERATIONS "If a key leaks" |
| Expo organisation (EAS Build, EAS Update) and the Android keystore | Maintainer (keystore kept by EAS, plus the maintainer's offline copy) | APKs and updates |
| Firebase project (push) and its service-account key | Maintainer; the key only in EAS | Android push |
| Cloudflare account (test site, LIVE site, website) | Maintainer | Web uploads |
| Zoho (domain mridangaseva.com, mail aliases) | Team Zoho account | Mail to info@ / privacy@, DNS |
| GitHub repository | Maintainer | Code, CI |
| Guru logins in the app | The Guru(s) | Roles, sign-in code resets, records entered by mistake |
| TEST logins (Student Test, Coordinator Test, the three `e2e.*@example.com` logins) | Maintainer; the E2E passwords in `e2e/.env.e2e` on their PC | Testing only, TEST project only |

The target owner of every account is the team account (OPERATIONS "Accounts the system depends on"); moving them is
part of OPERATIONS "Handing over".

## 5. Rules that save trouble

- One change, one branch, one pull request; documents change in the same pull request ([docs/README.md](README.md)).
- A migration only adds for one release (OPERATIONS "Releasing a change"); a new migration gets the next free number.
- A new decision gets the next number in DECISIONS.md; old entries are never rewritten.
- Real student data never goes into TEST, a test, a screenshot or an issue.
