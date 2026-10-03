# 7. How it was built

An app that holds children's details and a class's records must be trustworthy. Trust does not
come from saying "we were careful"; it comes from a process anyone can check. This page describes
that process, what was built day by day, and, honestly, what is not done yet.

[← Back to the guide](README.md) · Previous: [6. How the app works](06-how-it-works.md) · Next: [8. For a new helper →](08-new-helper.md)

---

**Contents**

1. [Who built it, and how](#who-built-it-and-how)
2. [Agree first: the approved screen list](#agree-first-the-approved-screen-list)
3. [Write every decision down](#write-every-decision-down)
4. [How each change is checked](#how-each-change-is-checked)
5. [Test before live; publish only on the maintainer's word](#test-before-live-publish-only-on-the-maintainers-word)
6. [Rounds of look-and-feel work](#rounds-of-look-and-feel-work)
7. [Phases and dates](#phases-and-dates)
8. [Timeline](#timeline)
9. [What is not done yet](#what-is-not-done-yet)

## Who built it, and how

The app is built as seva by a volunteer maintainer, working with
**Claude**, an AI coding assistant made by Anthropic. The maintainer and the class team decide
*what* is built and approve every step; the assistant writes code and documents under those
decisions, in separate working sessions, each on its own copy of the code (a **branch**). Nothing
reaches the class without the checks below and the maintainer's word.

The code is public on GitHub under the MIT licence, so anyone can read exactly what it does.

## Agree first: the approved screen list

Before any code was written, on **28 Sep 2026**, every screen the app might need was listed in a
shared document for the team: about 80 screens, each with a number (A1 = login, C5 = mark
attendance, G4 = syllabus editor, S3 = My QR…), a phase, and a choice for the team: **Approve**,
**Change** or **Drop**. The team's choices in that document are the approval record. The screen
numbers are still used in the code and in [SCREENS.md](../SCREENS.md), so anyone can trace a screen
back to what was approved.

The team's answers shaped the app from the start: three roles; no batches; three levels; email
login; English first with Telugu and Hindi; some students under 18, so parental consent; ten
WhatsApp groups to replace; most members on iPhones; and **Phase 1 must cost nothing**.

## Write every decision down

Every important choice is a numbered entry in [DECISIONS.md](../DECISIONS.md), with the date, the
choice, the **reason**, and what was given up. By 3 Oct 2026 there were 55 entries (number 43 unused), for example:

- #2 *Attendance is a visit, not a roll call* (because the class is drop-in);
- #4 *Paused and Left only through a logged call* (so nobody is dropped without a reason);
- #5 *Business rules live in the database* (so no screen or old app can break them);
- #16 *A minor is registered together with the parent's consent, or not at all*;
- #44 *The team edits the syllabus and lessons; ticks are never lost*.

Old entries are never rewritten. If a decision changes, a new entry replaces it and says so, so the
history stays readable. The rule for the documents themselves: **a change is not finished until its
documentation is** ([docs/README.md](../README.md)).

## How each change is checked

Every change passes these checks before it goes further:

| Check | What it catches |
|---|---|
| **Type check** (`npx tsc --noEmit`) | Mistakes in the code's logic and names, and a word missing in Telugu or Hindi |
| **Lint** (`npx expo lint`) | Common coding errors and unsafe patterns |
| **Database smoke test** (`supabase/tests`) | Runs every database migration on a temporary database on the laptop, with the dummy data, then tries hundreds of things a person could do, as each role, and checks the database allows or refuses each one. On 3 Oct 2026, with Phase 2 merged, main passes **522 checks**: login linking, consent for minors, attendance, follow-up calls, ticks, announcements, replies, files, notifications, the inbox, reports, centres, assessments, promotion, practice, who may run each function, and row-level security |
| **Notification test** | How the server words and batches notifications |
| **Browser check per role** | The changed screens are opened in a browser as a student, a coordinator and the Facilitator, on the test project, at phone width (375 pixels) and laptop width (1280 pixels) |
| **Contrast check** | Each new pair of text and background colours is measured against the WCAG AA standard for readability; the first draft of the new look failed twice and was fixed |
| **Large text and screen reader** | Screens checked at 200 % text size and with a screen reader (round 4) |
| **Bundle check** | Before anything is published, a script checks the package talks to the right project and contains no secret key |
| **Phone tests** | On a real Android phone: install, notifications with the app open, closed and signed out, scheduled posts, restart into an update. Volunteers repeated the notification tests on their own phones (1 Oct 2026) |
| **End-to-end checklist** | A written walk through the screens on the test site (sign-up, registration of an adult and a 12-year-old, attendance, calls, ticks, announcements, home screens, Telugu and Hindi), ticked item by item as it passes |

Database changes follow extra rules ([DATABASE.md "Changing the database"](../DATABASE.md#changing-the-database)):
a new numbered migration file for each change (applied ones are never edited), row-level security
and a description for every new table, each function granted only to the roles that need it, and
a new smoke-test check for each new rule. A migration runs on the test project before the live one.

## Test before live; publish only on the maintainer's word

- **Two projects.** A test project with made-up students, and the live project for the class. On
  29 Sep 2026 the dummy students were found in the live project by mistake; they were removed the
  same day and a warning was added to the instructions. Since then all testing uses the test project.
- **Made-up data only.** The seed students (such as "Arjun Rao" or "Divya Menon") are fictional,
  with `example.com` emails. No real student appears in code, tests or screenshots.
- **Publishing is a separate, deliberate step.** An update to the phones is published only when the
  maintainer says "publish", after a dry run (`--check-only`) has passed, from a network that does
  not interfere with uploads. Pushing code to the main branch also waits for the maintainer's word
  ("push to main").
- **Secrets stay out.** The secret key, passwords and keystores are never in the code, the documents
  or a chat. The repository's `.gitignore` keeps settings files out of git.

## Rounds of look-and-feel work

After the working screens came **rounds** of design work (UI/UX: user interface and user
experience), each one small enough to check fully and send as an update:

| Round | Date | What changed |
|---|---|---|
| 1 | 1 Oct 2026 | The saffron look, the icon set, tabs for each role |
| 2 | 1 Oct 2026 | Sign-in screens and detail screens |
| 3 | 2 Oct 2026 | Faster start from a saved profile, coloured status labels |
| 4 | 2 Oct 2026 | The ring of modules around the drum, two-column lists on laptops, pull to refresh, large-text and screen-reader pass, the motto |
| 5 | 2 Oct 2026 | The student's ring, **My progress**, the announcement card |
| 6 | 2 Oct 2026 | Staying signed in and signing out without internet; iPhone page settings |
| 7 | 3 Oct 2026 | Syllabus editor, lessons, attendance history, **My profile** |
| 8 | 3 Oct 2026 | Coordinators, student database and Excel import, settings, audit log |
| 9 | 3 Oct 2026 | Notifications inbox, reports with CSV, centres; a fix for saving the open window on Settings |

Volunteers' remarks and a volunteer's mock-up (the ring of circles around the drum) fed these rounds.

## Phases and dates

| Phase | What it brings | Dates (plan) |
|---|---|---|
| **1. Run the class** | Registration and consent, QR attendance, follow-up calls, syllabus and lessons, announcements and groups, dashboards, admin screens, reports | Build to 15 Nov 2026 · pilot at Abids 16-29 Nov · **live 1 Dec 2026** |
| **2. Learning and community** | Assessments, promotion approval, practice tools (metronome, taal player, two-head view of the drum, practice log), events, polls, door tablet, instruments, Ishtagoshti (sloka study, free to anyone), fund records | Build Dec 2026-Feb 2027 · **live 1 Mar 2027** |
| **3. Face attendance** | Attendance by face recognition, only with consent | **Live 30 Apr 2027**, before India's data-protection deadline of 13 May 2027 |

**Phase 2 was built beside Phase 1, on separate branches, and merged into the main code on
3 Oct 2026.** It needs new native parts (sound, location), so on Android it arrives with the next
app version, which everyone installs once:

- **Assessments** (slice 1, 3 Oct 2026): the Facilitator creates a piece to learn;
  coordinators release it to students, follow up and review submissions.
- **Promotion approval** (slice 2, 3 Oct 2026): a mentor nominates a student, other
  coordinators answer Ready / Almost / Not yet, and the Facilitator decides **Promote**, **Not yet**
  or **More feedback**.
- **Practice tools** (slice 3, 3 Oct 2026): metronome and taal player, the two-head view (both
  drum heads drawn, the zone and hand lighting up per stroke), and a practice log.
- **Ishtagoshti part 1** (slice 6, 3 Oct 2026, on a branch): the Slokas tab for everyone signed in,
  with themes, the sloka of the day, private notes and memorised ticks; the Facilitator and named
  editors type in the temple's own translations.

The two-head view answers a real problem: a student watching the teacher cannot see both drum
heads at once.

## Timeline

What was built each day. Dates are 2026.

| Date | Built |
|---|---|
| **28 Sep** | Research on the instrument and on class apps. Scope with the team; the drop-in design (visits, follow-up calls, levels); the screen list for approval; the technology chosen (Expo and Supabase). Public repository under MIT; the documentation standard; the database design with row-level security; dummy data; the live project created |
| **29 Sep** | Login with three roles and three languages; **register a student** with parental consent; **mark attendance** and **who is here now**; student list, profile, **follow-up calls** and call log; **My QR card**; **syllabus tick-off**. The test project created and filled with dummy data. Web hosting and Android build set up |
| **30 Sep** | Ticks with remarks; **announcements** for staff and students; posted by, edit, groups, private replies; the three **home screens**; photos and PDFs on announcements; **Android notifications**. First Android app built; the test web site online; volunteers begin testing |
| **1 Oct** | Notifications tested on a real phone and by volunteers; fixes from the first end-to-end test; the Android app **updates itself** (EAS Update); UI/UX rounds 1 and 2 |
| **2 Oct** | Rounds 3 to 6; a smaller Android app; "Facilitator" on the English screens; a new Android app for testers. Phase 2 assessments started on a branch. Rounds 5 and 6 published to test phones |
| **3 Oct** | Round 7 (syllabus editor, lessons, attendance history, profile) and round 8 (coordinators, database and import, settings, audit log), published to test phones; round 9 (notifications inbox, reports, centres); promotion approval on a branch; practice tools started; this guide |

The full history is in git (`git log`), commit by commit.

## What is not done yet

Honesty about gaps is part of trust. As of 3 Oct 2026:

**Needs the team's input**

- **Telugu and Hindi review** by native speakers. The translations are careful drafts, not checked.
- **The real syllabus** for each level, from the Guru. The test data has a placeholder.
- **The consent form wording**, ideally with the temple's legal adviser. The app records that a
  signed form was received; the form itself is still to be agreed
  ([OPERATIONS.md "Paper consent forms"](../OPERATIONS.md#paper-consent-forms)).
- **A logo and app icon.** The current icon is a placeholder.
- The coordinator list with mentees and duty hours, the pilot group, and who may post announcements.

**Still to build or set up for Phase 1**

- Checking the centre's attendance area on phones (needs location in the next Android app).
- Editing a student's details (name, phone, level) in the app.
- Notifications on the live project and the live ("production") Android app, before the pilot.
- Moving the service accounts (Expo, Firebase, Cloudflare) from the maintainer's personal account
  to a team account ([OPERATIONS.md "Handing over"](../OPERATIONS.md#handing-over)).

**Not chosen yet:** notifications on iPhone, the Play Store and App Store, the door tablet (Phase 2).

---

[← Back to the guide](README.md) · Previous: [6. How the app works](06-how-it-works.md) · Next: [8. For a new helper →](08-new-helper.md)
