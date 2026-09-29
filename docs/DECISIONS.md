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

## 13. A login is linked to a student only after its email is confirmed — 28 Sep 2026

**Context.** Students sign up themselves. When the email of a new login matches a student record,
the login becomes that student's (DECISIONS #11). The first version linked at the moment of
sign-up, before the email was confirmed, so anyone who knew a student's email could claim that
record. It also never linked a person who signed up before a coordinator had typed their email on
the record.

**Decision.** Link only when the login's email is confirmed, and also when a coordinator adds the
email to a record whose owner has already signed up and confirmed. Only logins that are still
`pending` are linked, so a coordinator never becomes a student this way.

**Why.** Confirming the email proves the person owns it. Many students are minors.

**Consequences.** Migration `0002_login_linking.sql`. **"Confirm email" must be on** in Supabase
before real student records exist: while it is off, Supabase treats every email as confirmed.

## 14. Every database function says who may run it — 28 Sep 2026

**Context.** On Supabase, the roles the app connects as (`anon` before login, `authenticated`
after) may run any new function in the public schema, not only functions granted to `public`. The
first migration revoked only from `public`, so anyone with the app's public key could run the
nightly job that checks everyone out.

**Decision.** Each function is revoked from `public`, `anon` and `authenticated`, then granted
only to the role that needs it. Internal functions (daily jobs, linking helpers) are granted to no
app role; they run from triggers or pg_cron as the owner.

**Consequences.** Every new function in a migration needs its own `revoke` / `grant` lines. The
database smoke test (`supabase/tests/`) checks this. The profile guard also now applies only to
app users, so the first Guru can be set in the Supabase dashboard (OPERATIONS.md).

## 15. The web version is a single-page app — 28 Sep 2026

**Context.** Expo can export the web version as one page (`single`) or as a pre-rendered page per
screen (`static`). Pre-rendering runs each screen at build time without a browser, where the saved
login is not available.

**Decision.** `web.output` is `single` in `app/app.json`.

**Why.** Everything is behind a login, so pre-rendered pages would only ever show the splash, and
search engines have nothing to index. One page avoids a class of build-time errors.

**Consequences.** The web host must send every address to `index.html` (a "rewrite" or "SPA
fallback" setting; see OPERATIONS.md). For now a link to a particular screen opens the person's
home screen instead, because screens stay closed until the login has been checked.

## 16. A minor is registered together with the parent's consent, or not at all — 28 Sep 2026

**Context.** DECISIONS #8 says a minor's details are kept only after a parent has consented. If
the student were saved first and the consent added on a later screen, a dropped connection or a
coordinator called away would leave a child's record without consent.

**Decision.** Registration (screens C2 and C3) is one form and one database call,
`register_student`, which saves the student, the parent and the written consent together. The
date of birth is required, because it decides whether consent is needed. In addition, a check that
runs when each database transaction ends refuses any student under 18 without a current consent,
however the row was written.

**Why.** All-or-nothing saving makes the rule impossible to break by accident, from the app, the
dashboard or a future import.

**Consequences.** Migration `0003_register_student.sql`. `seed.sql` runs inside one transaction.
A future Excel import (G3) must bring the parent and consent for every minor in the same step.
Phase 1 consent is a paper form the parent fills in and signs; the coordinator ticks that it was
received and records only which ID they looked at. A student photo needs its own consent
(`scope = 'photo'`); taking photos is not built yet.

## 17. A student's QR code holds `MS1:` and a secret token — 29 Sep 2026

**Context.** Coordinators check students in by scanning a QR code shown on the student's phone
(screen S3, and later the door tablet). The content of the code has to be fixed before the first
code is shown, because every scanner must read it the same way.

**Decision.** The code holds the text `MS1:` followed by the student's `qr_token` in capital
letters, for example `MS1:3F2A…`. The token is a random value stored on the student's record; it
is not the roll number. Scanners also accept a bare token without the prefix.

**Why.** A random token cannot be guessed from a roll number. The prefix lets the scanner tell a
student code from any other QR code (a payment code, a web link) and say so clearly. The `1` is a
version: if codes change later, for example to codes that expire so a screenshot stops working,
they get a new prefix and old and new codes cannot be confused. Capital letters and digits make a
smaller QR code that scans more easily.

**Consequences.** `studentQrText()` and `qrTokenFromScan()` in `app/src/data/attendance.ts` are
the only places that know the format. A screenshot of someone's code works like the code itself,
so the result card shows the name and roll number large, for the coordinator to check against the
person in front of them. Phase 3 face attendance removes this weakness.

## 18. A tap says in or out; only a scan toggles — 29 Sep 2026

**Context.** `toggle_visit` checks a student in if they are out and out if they are in. That suits
a QR scan. On a list, however, the button shows what was true when the list was loaded. If another
coordinator has marked the student since, a toggle does the opposite of what the button said. The
same problem would hit a "check out all" done as one toggle per student from the phone.

**Decision.** Tapping a name calls `mark_visit(student, 'in' | 'out')`, which does what the button
says and changes nothing if the student is already in that state. "Check out all" is one database
call, `check_out_all()`. Scanning a QR code still toggles, through `scan_qr`.

**Why.** Two coordinators working the same class at once is normal. With this, the worst a stale
list can do is show "Already checked in. Nothing changed."

**Consequences.** Migration `0004_attendance.sql`. `mark_visit` calls `toggle_visit` to do the
actual change, so the rules for a check-in (student becomes active, follow-up tasks close) stay in
one function. After each scan the camera pauses until the coordinator taps *Scan the next
student*, and the same code is ignored for 30 seconds, so a phone held up a moment too long does
not check its student straight out again. "Check out all" is on *Who is here now* (C6), where the
coordinator sees exactly whom it affects.

## 19. Reasons for a call are codes the app translates — 30 Sep 2026

**Context.** When a coordinator logs a follow-up call, they pick why the student stopped coming
from a list in `settings.call_reasons`. The first migration stored that list as English
sentences ("Studies/exams"), so a Telugu or Hindi screen could only show English, and reports
would count "Health" and a translated word for health as two reasons.

**Decision.** The list holds short codes (`studies`, `work_timing`, `moved`, `health`, `family`,
`lost_interest`, `joined_elsewhere`, `travel`, `other`). The app translates each code
(`callReasons.<code>` in the translation files). `log_call` refuses a reason that is not in the
list. A code the Guru adds to the list later, before anyone has translated it, is shown exactly
as the Guru typed it.

**Why.** Codes keep reports and the "discontinue reasons" chart (G8) clean, whatever language
each coordinator uses. Showing an untranslated code as typed means the Guru can add a reason
without waiting for a new app version.

**Consequences.** Migration `0005_students_follow_up.sql` rewrites the list and any reasons
already logged. A new reason should get a translation in `en.json`, `te.json` and `hi.json`, and
a `KNOWN_CALL_REASONS` entry in `app/src/data/follow-up.ts`. The settings screen (G10) should
offer codes, not free sentences.

## 20. Views read the tables as the person asking — 30 Sep 2026

**Context.** The student list and the follow-up queue need each student's last visit and the
days since. Supabase's API does not allow `max()` in app queries by default, so the database
works it out in a view, `student_overview`. A Postgres view normally runs with its owner's
rights, which skips row-level security: every signed-in person, students included, would see
every student.

**Decision.** Every view is created `with (security_invoker = true)`, so it reads its tables with
the rights of the person asking and their row-level security applies. Views are granted
`select` only, to `authenticated` only.

**Why.** Access rules stay in one place, the tables' policies (#5). A view can never become a
side door around them.

**Consequences.** Needs Postgres 15 or later (Supabase has it). The database smoke test checks
that a student sees only their own row in `student_overview` and that a signed-out visitor sees
none. A future view that must show more than the tables allow (for example a report) needs its
own decision entry and a security-definer function instead.

## 21. The My QR card is drawn on the phone and works without internet — 29 Sep 2026

**Context.** Students check in by showing *My QR* (screen S3) to a coordinator, who scans it
(C5). The code carries `MS1:` and the student's secret `qr_token` (#17), which is what makes a
check-in possible, so it must not leave the app. Phone signal inside the temple can be weak, and a student standing at
the door with a spinner holds up the queue.

**Decision.**
- The QR code is made on the phone by the `qrcode-generator` library (MIT, plain JavaScript, no
  other packages) and drawn with `react-native-svg` (an Expo module, included in Expo Go, works on
  Android, iOS and web). No online QR image service is used.
- It is always black on white with the standard four-square white border, in dark mode too, and
  uses error-correction level Q.
- The last card loaded (name, roll number, `qr_token`) is kept on the phone and shown, with a
  note, when the server cannot be reached. It is shown only to the login it belongs to, deleted at
  sign-out, and deleted when the server says the login has no student record.

**Why.** An online QR image service would receive every student's secret. Many scanners cannot
read light-on-dark codes. Level Q survives glare and cracked screens, and for this short text it
gives no bigger a code than the usual level M. The saved copy is no more sensitive than the login
session, which is kept on the phone already.

**Consequences.** Code: `app/src/components/qr-code.tsx`, `app/src/data/my-student.ts`. A code
shown from the saved copy stops working if its `qr_token` is changed on the server; the card
updates the next time the phone is online. There is no screen yet to issue a new `qr_token` for a
student whose code was shared.

## 22. A syllabus tick records who ticked it, and an untick leaves a trace — 29 Sep 2026

**Context.** Coordinators tick a syllabus item for a student when the student shows it in class
(screen C9). Any coordinator on duty may tick, not only the mentor. In Phase 2 these ticks decide
when a student can be put forward for the next level. The table `student_progress` let the app
write any name in "ticked by" and any date, and an untick simply deleted the row, so nobody could
see later that an item had been ticked, by whom or when.

**Decision.** A trigger sets "ticked by" to the signed-in person, whatever the app sends, and
refuses a date after today. After that, only the remark can change; to correct a tick, untick and
tick again. Every tick, remark change and untick is copied to `audit_log`. The screen dates a
tick today and asks once more before unticking. Ticking stays open to every coordinator and the
Guru.

**Why.** The record of who confirmed a student's progress must be true, because promotion will
rest on it. Keeping the rule in the database (#5) means an old app version or a modified client
cannot break it. Asking before an untick, and the audit copy, protect against a slip of the finger
during a busy class.

**Consequences.** Migration `0006_syllabus_progress.sql`. The app writes `student_progress`
directly (insert, update of the remark, delete) instead of through a function, because each change
is one row. If two coordinators tick the same item at once, the first tick is kept and the second
phone says so. A future import of past progress (for example from today's Excel sheet) may carry
earlier dates, but keeps the original "ticked by" names only when it runs in the Supabase
dashboard, where no login is attached; from the app every tick is in the importer's name.
