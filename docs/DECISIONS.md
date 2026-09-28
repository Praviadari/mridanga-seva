# Decisions

Every important decision, with the reason. Newest at the bottom. Never rewrite an entry: if a
decision changes, mark the old one *Replaced by #N* and add a new entry.

Each entry: **Context** (the situation), **Decision**, **Why**, **Consequences** (what it means for
the code and for maintainers).

---

## 1. React Native (Expo) and Supabase — 28 Sep 2026

**Context.** The app must run on Android and iPhone, most members use iPhones, there is almost no
budget, and there will be few maintainers. An early draft used Flutter and Firebase.

**Decision.** Build the app with Expo (React Native + TypeScript) and use Supabase (Postgres) as
the backend.

**Why.** One code base gives Android, iOS and web. Supabase is a relational database, which suits
records like visits and roll numbers and makes reports (attendance %, retention) simple SQL. Its
row-level security puts access rules in the database. Firebase file storage requires the
pay-as-you-go plan with a card on file for projects created after 30 Oct 2024.

**Consequences.** Business rules go in SQL (see #5). Maintainers need basic TypeScript and SQL.

## 2. Attendance is a visit, not a roll call — 28 Sep 2026

**Context.** The class is drop-in: students come any time between 14:30 and 20:00, and new students
join every week. There are no batches.

**Decision.** Record each arrival as a *visit* with check-in and check-out times.

**Why.** There is no fixed class to take a roll call for. Visits give visits per week, hours per
month and days since last visit, which are the numbers that matter for a drop-in class.

**Consequences.** Reports use visits and hours, not "% of classes attended".

## 3. Roll numbers are frozen and never reused — 28 Sep 2026

**Decision.** Roll numbers look like `MS-2026-0001`, are given on registration, can never be
changed, and are never reused.

**Why.** Attendance, progress and call history are linked to the student; a changed or reused number
would mix up records. Level is a separate field, so promotion does not change the number.

**Consequences.** Enforced by triggers. A student who leaves and comes back keeps the same number.

## 4. Paused and Left only through a logged call — 28 Sep 2026

**Context.** Students who stop coming need a phone call, and the reason matters for improving the class.

**Decision.** A student can be marked *Paused* or *Left* only by logging a call with an outcome, a
reason and a comment.

**Why.** It makes sure someone actually called, and that the reason is recorded.

**Consequences.** A trigger on `students` refuses any other way. `log_call` sets a flag
(`app.via_call_log`) for the length of its transaction so the trigger allows its update.

## 5. Business rules live in the database — 28 Sep 2026

**Decision.** Access rules, status changes, roll numbers and multi-step actions are enforced in
Postgres (row-level security, triggers, functions), not only in the app.

**Why.** A rule in the database cannot be skipped by an old app version, a bug in a screen or a
modified client. There is one place to look.

**Consequences.** The app stays thin. When you look for "why did this happen?", read the migration first.

## 6. Phase 1 costs nothing — 28 Sep 2026

**Context.** The team has no budget.

**Decision.** Supabase free plan; Brevo free SMTP for emails; Android app installed from a link;
a web version for iPhones. No app-store listings, no door tablet in Phase 1.

**Why.** Everything needed for Phase 1 fits in free plans. The App Store costs $99 a year.

**Consequences.** Supabase free projects pause after 7 days without use and have no paid backups —
see [OPERATIONS.md](OPERATIONS.md) for the weekly backup. Supabase's built-in email sends only 2
emails an hour, so custom SMTP is required.

## 7. Email and password login — 28 Sep 2026

**Decision.** Log in with email and password.

**Why.** A one-time code at every login would use up the free email allowance; with a password,
emails are only needed for sign-up and password reset. SMS was rejected for cost.

## 8. Minimum personal data, consent for minors — 28 Sep 2026

**Context.** Some students are under 18. India's DPDP Rules require verifiable parental consent for
children's data, with full compliance by 13 May 2027.

**Decision.** For minors, record the parent's details and consent before storing more. Phase 1: the
parent writes and signs a consent; Phase 2 adds confirmation by email code. Store only area and
pincode, not full address. Store the type of ID checked, never the ID number. Photos only with
consent; faces (Phase 3) only after consent.

**Consequences.** `consents` has a `method` (`written` or `email_code`) and a `scope`
(`data`, `photo`, `face`).

## 9. Content is kept apart from code — 28 Sep 2026

**Decision.** Lesson videos stay on YouTube and are played through the YouTube player. Sloka
translations, the syllabus and recordings are not stored in the repository. No BBT (Bhaktivedanta
Book Trust) translations or purports are used.

**Why.** The code is MIT-licensed; the content belongs to its authors. BBT holds copyright on
Prabhupada's translations and purports.

## 10. MIT license — 28 Sep 2026

**Decision.** The code is released under the MIT License, in a public repository open to contributions.

**Why.** Other classes and temples can adopt it freely; contributing is simple. The main libraries
(Expo, React Native, Supabase client) are MIT too.

## 11. Three roles; coordinator is the teacher — 28 Sep 2026

**Decision.** Roles are Guru, Coordinator and Student (plus `kiosk` for the door tablet and
`pending` for new sign-ups). Coordinators are the teachers. Treasurer is a permission on a
coordinator, not a separate role. New logins get no access until linked to a student or given a
role by the Guru.

## 12. Three languages from the start — 28 Sep 2026

**Decision.** All interface text goes through translation files for English, Telugu and Hindi.

**Why.** Most members speak Telugu or Hindi. Adding languages later to hard-coded text is slow and
error-prone.
