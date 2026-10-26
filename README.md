# Mridanga Seva

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Status: live with a pilot class](https://img.shields.io/badge/status-live%20(pilot%20class)-brightgreen.svg)
![Platforms: Android · Web (iPhone via the web)](https://img.shields.io/badge/platforms-Android%20%C2%B7%20Web%20(iPhone%20via%20the%20web)-blue.svg)

> Open-source class management app for mridanga (khol) kirtan classes: drop-in attendance, levels,
> coordinator follow-up, lessons, practice tools and announcements. Built with React Native (Expo)
> and Supabase.

**Topics:** `mridanga` · `khol` · `kirtan` · `class-management` · `education` · `react-native` · `expo` · `supabase`

**Status:** live since 17 October 2026 with one pilot class (Abids, Hyderabad): Android app, web version and
website ([mridangaseva.com](https://mridangaseva.com)). Phases 1 and 2 are in use; updates reach phones over the air.
Phase 3 (face self-scan) is being tested on a separate test project.

## Why

Mridanga classes often run as drop-in sessions — students come when it suits them, new learners
join every week, and attendance, progress and follow-up live in spreadsheets and chat groups.
Mridanga Seva puts class records, learning material and communication in one place.

## Who uses it

| Role | Does |
|---|---|
| Guru / Admin | Manages coordinators, students, levels, syllabus and materials; approves promotions; sees reports |
| Coordinator | Runs the daily class: registers students, marks attendance, ticks syllabus progress, calls students who stop coming, posts announcements |
| Student | Sees lessons, notes and videos, attendance and progress; receives announcements |

## Features by phase

**Phase 1 — run the class**
- Student registration with roll numbers (`MS-2026-0001`, never reused) and parental consent for minors
- Attendance as visits: the coordinator scans the student's on-screen QR code, or taps to mark
- Levels (Beginner, Intermediate, Advanced) with a per-student syllabus checklist
- Follow-up: students who stop coming become *Irregular*; their mentor coordinator calls and records
  the reason. A student can be marked *Paused* or *Left* only through a logged call
- Learning materials (YouTube links, notes, notation), announcements and groups
- Dashboards and reports

**Phase 2 — learning and community**
- Assessments with coordinator review and a Guru-approved promotion workflow
- Practice tools: metronome, taal player (layakari, silent bars, speed trainer) and an animated view of both drum heads;
  Play and learn (tap pad, Which bol?, Echo me), practice of the week, goals and milestones
- Events, polls, inventory with QR asset labels; door-tablet check-in is planned (the `kiosk` role exists, no screen yet)
- Ishtagoshti: thematic study of Sanskrit slokas, free and open to anyone
- Transparent fund management for donations and sponsorships

**Since go-live** — My data and rights (copy, correction, erasure), sign-up at home for under-18s with a parent's
email consent, an opt-in weekly email for parents, a web version that works offline once opened, and a short
sign-up. **In the next update:** privacy notice 1.0 (everyone is asked once), sign-in codes from an authenticator app
for staff, and door check-ins and practice entries made without internet kept and sent later. Every update lists its
changes under My profile → What's new.

**Phase 3** — face self-scan attendance, only with consent (plan and DPIA in [docs/phase3/](docs/phase3/WORK_PLAN.md)).

## Tech stack

- **App:** React Native with [Expo](https://expo.dev) (Expo Router, TypeScript) — an Android APK and a web version from one code base; there is no iOS app (`app.json` has no `ios` block), iPhone users add the web version to the home screen
- **Backend:** [Supabase](https://supabase.com) — Postgres with row-level security, auth (email + password; an
  authenticator-app code for staff), storage, scheduled jobs (pg_cron) and Edge Functions
- **Hosting:** web version and website on Cloudflare Pages; app updates through Expo EAS Update
- **Languages:** English, Telugu and Hindi

## Repository layout

```
app/                   Expo app (screens live in app/src/app/)
supabase/migrations/   Database schema, row-level security, functions and scheduled jobs
supabase/functions/    Edge Functions (notify-announcements sends the push notifications, notify-parents the parent emails)
supabase/seed.sql      Dummy data for a test project
supabase/tests/        Database smoke test, migration replay and message tests that run on your own computer
e2e/                   Playwright browser tests of five core flows on the TEST web version (see e2e/README.md)
website/               The public website (English, Telugu, Hindi), built to static pages
docs/                  How it works and why — start with docs/README.md
```

## Documentation

| Read | To understand |
|---|---|
| [docs/guide/easy/](docs/guide/easy/README.md) | **Not technical?** The easy guide in everyday words, for school and college students and people from the medical field; also in [తెలుగు](docs/guide/easy/te/README.md) and [हिन्दी](docs/guide/easy/hi/README.md) |
| [docs/guide/](docs/guide/README.md) | **New here? Start with the beginner's guide**: why the app exists, how to use it per role, how it works and how it was built, in plain words |
| [docs/print/](docs/print/sop-student.pdf) | **Printable A4 guides**: the student, coordinator and Guru screens step by step, and the whole app explained for maintainers |
| [docs/MAINTAINER_HANDBOOK.md](docs/MAINTAINER_HANDBOOK.md) | **Maintaining it?** Two pages: where things live, the checks, how a release goes |
| [docs/WHY_THIS_STACK.md](docs/WHY_THIS_STACK.md) | **Why this tech stack?** Expo, Supabase and PostgreSQL compared with the usual alternatives |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app, database and roles fit together |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, student status rules, database functions, scheduled jobs |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are built this way |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Mridanga and app terms |
| [docs/SCREENS.md](docs/SCREENS.md) | Every screen, per role |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Setting up, backing up, publishing updates and handing over the live system |

## Getting started

1. Install [Node.js](https://nodejs.org) (LTS).
2. Create a free Supabase project and run the files in `supabase/migrations/` in its SQL editor,
   in number order (step by step: [docs/OPERATIONS.md](docs/OPERATIONS.md#setting-up-a-new-environment)).
3. Copy `app/.env.example` to `app/.env.development` and fill in your (test) project URL and
   **anon / publishable** key ([app/README.md](app/README.md) "Settings files").
4. Start the app, then press `w` to open the web version:
   ```bash
   cd app
   npm install
   npx expo start
   ```

Never commit a `.env` file, the Supabase `service_role` key, or any real student data.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

The code is released under the [MIT License](LICENSE).

Lesson recordings, sloka translations and syllabus content are not part of this repository and are
not covered by this license.
