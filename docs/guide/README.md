# Mridanga Seva — the beginner's guide

Hare Krishna, and welcome.

**Mridanga Seva** is a free, open-source app for the mridanga seva class at **ISKCON Abids**,
Hyderabad. It keeps the class's attendance, students, follow-up calls, syllabus progress, lessons
and announcements in one place, in English, Telugu and Hindi. It was built as seva (service),
an offering to Lord Krishna, so that the devotees who teach can give their time to the students
and the kirtan.

This guide is written for **beginners**: students, parents, coordinators, the Facilitator, and
anyone who wants to help but has never written code. Every technical word is explained the first
time it is used.

## Read the part you need

| # | Part | For | What you will find |
|---|---|---|---|
| 1 | [Why this app exists](01-why-this-app.md) | Everyone | The class, the mridanga (khol), the WhatsApp-and-Excel problem, the spirit of seva |
| 2 | [Student guide](02-student-guide.md) | Students and parents | Sign up, wait for access, the home screen, My QR, announcements, My progress, attendance, profile |
| 3 | [Coordinator guide](03-coordinator-guide.md) | Coordinators | Register a student with consent, mark attendance, who is here now, follow-up calls, syllabus ticks, announcements and groups, my reports |
| 4 | [Facilitator (Guru) guide](04-facilitator-guide.md) | The Guru | Dashboard, syllabus and lessons, coordinators, the student database and Excel import, settings, reports, centres, audit log |
| 5 | [Phones, install and updates](05-phones-and-updates.md) | Everyone | The Android app from a link, iPhone through Safari, updates and Restart, languages, using it offline |
| 6 | [How the app works](06-how-it-works.md) | The curious, new helpers | App, web and database in plain words; why the rules live in the database; test and live; how updates reach phones |
| 7 | [How it was built](07-how-it-was-built.md) | Anyone deciding whether to trust it | The approved screen list, written decisions, the checks on every change, the timeline, and what is not done yet |
| 8 | [For a new helper](08-new-helper.md) | Volunteers and developers | Ways to help without code; running the app on a laptop; a map of the code; making a small change safely |
| — | [Glossary](../GLOSSARY.md) | Everyone | Mridanga words (bol, taal, dayan), app words (visit, mentor, Irregular) and beginner's technical words |

**Short on time?**

- *I am a student:* read [Create your account](02-student-guide.md#create-your-account) and
  [My QR card](02-student-guide.md#my-qr-card-checking-in-and-out).
- *I am a coordinator at the desk today:* read [Register a student](03-coordinator-guide.md#register-a-student)
  and [Mark attendance](03-coordinator-guide.md#mark-attendance).
- *I want to know if the app is safe for children's data:* read
  [The rules live in the database](06-how-it-works.md#the-rules-live-in-the-database) and
  [How each change is checked](07-how-it-was-built.md#how-each-change-is-checked).

## What the app does today

The state on **3 October 2026**, on the main code:

| Ready | Being built | Later |
|---|---|---|
| Sign-up, sign-in, password reset; three roles | Phone check of the centre's attendance area (next Android app) | Events, polls, instruments, door tablet, Ishtagoshti, fund (Phase 2) |
| Registration with roll numbers and parental consent for minors | Assessments and promotion approval (Phase 2; on Android with the next app version) | Face attendance, only with consent (Phase 3) |
| Attendance by QR code or by name; who is here now; check out all | Practice tools: metronome, taal player, two-head view, practice log (Phase 2; on Android with the next app version) | |
| Student list and profile; follow-up calls with reasons | | |
| Syllabus tick-off; syllabus editor; lessons (YouTube, PDF, photo) | | |
| Announcements with audiences, files, "seen by", private replies; groups; Android notifications | | |
| Home screens for each role; attendance history; my profile | | |
| Coordinators and roles; student database and Excel import; settings; audit log | | |
| Notifications inbox; reports with a CSV file; centres | | |
| English, Telugu, Hindi; Android app with self-updates; iPhone and laptop through the web | | |

The class's pilot is planned at Abids from 16 to 29 November 2026, and Phase 1 goes live on
1 December 2026. See [Phases and dates](07-how-it-was-built.md#phases-and-dates).

## The other documents

This guide explains in plain words. The reference documents in [docs/](../README.md) hold the exact
detail for maintainers, and this guide links to them rather than repeating them:
[ARCHITECTURE.md](../ARCHITECTURE.md), [DATABASE.md](../DATABASE.md), [SCREENS.md](../SCREENS.md),
[DECISIONS.md](../DECISIONS.md), [TRANSLATIONS.md](../TRANSLATIONS.md),
[OPERATIONS.md](../OPERATIONS.md) and [GLOSSARY.md](../GLOSSARY.md).

If something in this guide no longer matches the app, the app and the reference documents win;
please open an issue so the guide can be corrected.
