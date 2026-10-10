# Mridanga Seva

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Status: Phase 1 in development](https://img.shields.io/badge/status-Phase%201%20in%20development-orange.svg)
![Platforms: Android · Web (iPhone via the web)](https://img.shields.io/badge/platforms-Android%20%C2%B7%20Web%20(iPhone%20via%20the%20web)-blue.svg)

> Open-source class management app for mridanga (khol) kirtan classes: drop-in attendance, levels,
> coordinator follow-up, lessons, practice tools and announcements. Built with React Native (Expo)
> and Supabase.

**Topics:** `mridanga` · `khol` · `kirtan` · `class-management` · `education` · `react-native` · `expo` · `supabase`

**Status:** Phase 1 in development. A pilot with one class is planned for November 2026.

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
- Practice tools: metronome, taal player and an animated view of both drum heads
- Events, polls, inventory with QR asset labels; door-tablet check-in is planned (the `kiosk` role exists, no screen yet)
- Ishtagoshti: thematic study of Sanskrit slokas, free and open to anyone
- Transparent fund management for donations and sponsorships

**Phase 3** — face-recognition attendance (only with consent).

## Tech stack

- **App:** React Native with [Expo](https://expo.dev) (Expo Router, TypeScript) — an Android APK and a web version from one code base; there is no iOS app (`app.json` has no `ios` block), iPhone users add the web version to the home screen
- **Backend:** [Supabase](https://supabase.com) — Postgres with row-level security, auth (email + password), storage
- **Languages:** English, Telugu and Hindi

## Repository layout

```
app/                   Expo app (screens live in app/src/app/)
supabase/migrations/   Database schema, row-level security, functions and scheduled jobs
supabase/functions/    Edge Functions (notify-announcements sends the push notifications)
supabase/seed.sql      Dummy data for a test project
supabase/tests/        Database smoke test and push message test that run on your own computer
docs/                  How it works and why — start with docs/README.md
```

## Documentation

| Read | To understand |
|---|---|
| [docs/guide/easy/](docs/guide/easy/README.md) | **Not technical?** The easy guide in everyday words, for school and college students and people from the medical field; also in [తెలుగు](docs/guide/easy/te/README.md) and [हिन्दी](docs/guide/easy/hi/README.md) |
| [docs/guide/](docs/guide/README.md) | **New here? Start with the beginner's guide**: why the app exists, how to use it per role, how it works and how it was built, in plain words |
| [docs/WHY_THIS_STACK.md](docs/WHY_THIS_STACK.md) | **Why this tech stack?** Expo, Supabase and PostgreSQL compared with the usual alternatives |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app, database and roles fit together |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, student status rules, database functions, scheduled jobs |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are built this way |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Mridanga and app terms |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Setting up, backing up and handing over the live system |

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
