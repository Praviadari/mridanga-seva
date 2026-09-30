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
home screen instead, because screens stay closed until the login has been checked. *(That last
point no longer holds: see #30.)*

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

## 23. The web version is hosted on Cloudflare Pages — 29 Sep 2026

**Context.** Most members use iPhones, and Phase 1 has no App Store listing (#6), so they use the
web version. It needs a free host that sends every address to `index.html` (#15).

**Decision.** Host it on Cloudflare Pages (free plan) under the team's account, uploaded by hand
from `app/dist` (direct upload, no Git connection yet). There are two sites:
`mridanga-seva-test` talks to the test Supabase project (demos, testers, volunteers) and
`mridanga-seva` to the live one.

**Why.** Free without a card; it sends unknown addresses to `index.html` by itself; the free plan
does not meter bandwidth for a static site. Netlify's free plan now counts deploys and bandwidth
against a monthly credit; GitHub Pages would put the site under a personal account's name and
needs a copied `404.html`.

**Consequences.** Build with `npm run export:web` (add `-- --env .env.test` for the test site),
never a bare `expo export`: Cloudflare Pages never uploads a folder named `node_modules`, where
Expo puts some images, so `app/scripts/export-web.mjs` moves them; it also checks that the site
holds the chosen project's settings and no secret key. A person uploads each release
(OPERATIONS.md); automatic deploys from GitHub can be added later. Each site's address is the
Site URL of the Supabase project it talks to.

## 24. The Android app is an APK built by EAS Build — 29 Sep 2026

**Context.** Phase 1 costs nothing (#6), so there is no Play Store listing yet: Android users
install the app from a link. The maintainer's computer has no Android build tools.

**Decision.** Build an APK in the cloud with EAS Build on the team's free Expo account
(`app/eas.json`: internal distribution, version code kept and raised by EAS). Profile `preview`
talks to the test Supabase project, profile `production` to the live one. The Android package
name is `org.mridangaseva.app`, chosen by the team.

**Why.** No Android Studio needed; the free plan's 15 Android builds a month are plenty for
releases; the build page gives an install link and QR code to share.

**Consequences.** The package name is permanent: a Play Store listing must use the same name, and
a new name would be a different app that people must install again. The signing keystore is kept
by Expo, with one backup outside the repository; losing it means nobody can update the installed
app. The Supabase URL and key reach the build as EAS environment variables (`preview` and
`production`), because `app/.env` and `app/.env.test` are not uploaded. Both profiles share the
package name, so a phone has the test app or the live app, not both. Every app change needs a
new APK until over-the-air updates (EAS Update) are chosen.

## 25. "Seen by N of M" counts only people who can open the announcement — 30 Sep 2026

**Context.** Announcements replace the class WhatsApp groups, where the coordinators like seeing
who has read a message. The first migration had the tables but several gaps: an announcement to
*all* could be read by any login, including someone who had just signed up and was still
*pending*; a level or group announcement could be saved without its level or group; nobody could
delete an announcement from the app; any person could write a read receipt with any time; and
"seen by" was left for the app to count.

**Decision.**
- *All* means all students. A person who is not staff must be a student to see any announcement,
  and then only published ones addressed to them. Staff see every announcement.
- M counts the people the announcement is addressed to **who can open it in the app**: active
  logins that the read rule lets in, never the author. Students with no app login are counted
  separately ("without the app: 3") so the coordinator can tell them in class. N counts those of
  M who have opened it.
- Both numbers, and the list of who has not seen it, come from two database views that read as
  the person asking (#20), not from counting in the app.
- A read receipt is written only by the reader, only for an announcement they can see, holds only
  the database's own time, and cannot be changed or removed.
- Only the author, while still staff, or the Guru can pin, unpin or delete. Edits and deletes are
  copied to the audit log. A trigger checks title, text, audience target and author (#5).

**Why.** A count that includes people who cannot receive the message never reaches M and makes a
good announcement look ignored; mixing in students without the app hides who must be told in
person. Counting in the database keeps the number the same on every phone and keeps other
people's receipts off students' phones. Receipts that only the reader can write, once, make "seen"
mean seen. A newcomer's login should learn nothing about the class before the Guru lets them in.

**Consequences.** Migration `0007_announcements.sql`. The two views must follow the read rule of
`announcements`: a change to who may read an announcement must change `announcement_audience` in
the same migration, or the counts go wrong. A student who is *Left* but still has a login stays in
M, because they can still read. Replies, images and files (C15, S10) and push notifications come
later; groups are still made in the Supabase dashboard until a groups screen exists.

## 26. Students see staff names through one narrow function — 30 Sep 2026

**Context.** A student reading an announcement should see who posted it. Row-level security on
`profiles` lets a student read only their own row, which is right: profiles hold emails and
phone numbers. #20 says that anything showing more than the tables allow needs its own decision
and a security-definer function.

**Decision.** The function `staff_names()` runs with its owner's rights and returns only the id
and name of each Guru and coordinator, active or not (old announcements keep their author). It
answers only students and staff; a `pending` login or the door tablet gets nothing. Staff
screens use it too, for "posted by".

**Why.** The names of the Guru and coordinators are no secret to their students; their email,
phone and role stay behind row-level security. One small function is easier to check than a
view or a copied name column.

**Consequences.** Migration `0008_announcement_follow_ups.sql`. The smoke test checks that the
function returns only these two columns and nothing to a pending login. Do not add columns to it
without a new decision.

## 27. An edited announcement keeps its receipts and says "Edited" — 30 Sep 2026

**Context.** Coordinators make mistakes in an announcement (a wrong time, a missing word). Until
now the only way out was to delete it and post it again, which loses who had seen it.

**Decision.** The author (while staff) and the Guru can edit the title, message and audience.
Read receipts are kept. When an announcement that was already published is changed, the database
sets `edited_at` and the app shows "Edited" with the time; editing a scheduled one, which nobody
has seen, does not count, and neither does pinning. Once published, an announcement keeps its
publish time; a scheduled one can still be moved, and a time already past means "now".

**Why.** Praveen chose to keep "seen" (30 Sep 2026): the count stays meaningful, and "Edited"
tells readers to look again. A published announcement cannot go back to being scheduled, because
students may have read it. Setting `edited_at` in the database keeps the mark honest.

**Consequences.** Migration `0008`, trigger `announcements_guard`. The edit screen
(`staff/announcements/edit/[id].tsx`) shares its fields with the compose screen
(`components/announcement-form.tsx`) and shows "When should students see it?" only while the
announcement is scheduled. A student who read the first version is not told again until push
notifications exist; the audit log keeps every earlier version.

## 28. Groups are managed in the app and seen only by staff and members — 30 Sep 2026

**Context.** Groups were made in the Supabase dashboard. 0001 let every login, even a `pending`
one, list all groups, and names like "Sunday Harinam" could be doubled with other capitals.

**Decision.** A groups screen for coordinators and the Guru: make a group, rename it, change its
purpose, switch it off or on, add and remove members. Members are logins: students who use the
app, coordinators and the Guru. A trigger checks the name (required, at most 60 characters,
unique whatever the capitals) and the purpose (at most 200). Only staff and a group's own members
can see a group. Groups are switched off, not deleted.

**Why.** Coordinators run the groups, not the maintainer. A newcomer learns nothing about the
class before the Guru lets them in (#25). Deleting a group would break the announcements sent to
it (the database refuses), so switching off is the only safe way to retire one.

**Consequences.** Migration `0008`, view `group_summary` for member counts. The screen has no
number in the approved screen list yet (docs/SCREENS.md, "—"); the team should give it one.
Students without the app cannot be members; they are told in class, as for other announcements.

## 29. Replies to an announcement are private — 30 Sep 2026

**Context.** On WhatsApp, a reply goes to the whole group. Many students are minors, and a
coordinator often needs a quiet answer ("I cannot come on Sunday").

**Decision.** A person can reply to an announcement they can see. Only the writer, the author
of the announcement (while still staff) and the Guru can read a reply; students never see each
other's replies. Nobody can edit a reply; only the Guru can delete one, and the audit log keeps
it. Phase 1 is one-way: the author answers in person or by phone. The database fills in who
wrote the reply and when; the app sends only the announcement and the text.

**Why.** Praveen chose private replies (30 Sep 2026). Keeping them between the student and the
teacher protects minors and avoids a noisy group chat. A reply that cannot be changed later is a
fair record for both sides.

**Consequences.** Migration `0008`: table `announcement_replies`, view `announcement_reply_list`,
and a `replies` count on `announcement_seen` (counted with the reader's rights, so a coordinator
sees the number of replies to their own announcements). A two-way thread, and telling the author
about a new reply, come later (with push notifications).

## 30. A link to a screen survives the login check — 30 Sep 2026

**Context.** #15 left a gap: opening an address such as `/student/announcements/12` in a new tab
always landed on the home screen. While the login is being checked, every area's screens are
closed, so Expo Router sends the link to the start page and the address is lost. Shared links and
taps on push notifications need the screen itself.

**Decision.** When the app starts, `src/auth/requested-path.ts` notes the path it was opened
with (the web address, or the link that opened the Android app). Once the person's area is
known, the start page sends them there instead of home, if the screen belongs to their area. Only
the path is kept, never the part after `?` or `#`, which can hold sign-in tokens. The path is
forgotten as soon as the person is signed in, used or not; while they are signed out it is kept,
so a link opened before signing in still works after it. The student home screen is put
underneath, so Back leads home.

**Why.** It needs no change to the login flow or to how screens are protected. A screen of
another area is still refused (#15, `Stack.Protected`).

**Consequences.** `src/app/index.tsx`, `src/auth/requested-path.ts`, `unstable_settings.anchor` in
`src/app/student/_layout.tsx`. Push notifications can use `rememberRequestedPath()` for the
announcement a tap should open. A staff screen opened from a link has no screen under it, so its
header shows no Back arrow; the browser's Back still works.

## 31. Each home screen gets its numbers from one database function — 30 Sep 2026

**Context.** The three home screens (S1 student, C1 coordinator, G1 Guru) show counts: visits
this week, who is here now, calls due, new joiners, students per level and status, overdue
follow-ups per coordinator. Counting in the app would mean downloading every student, visit and
task to the phone on every opening, and Supabase's API does not allow `count()` and `max()` in
app queries by default. "This week", "new joiner" and "overdue" also need one meaning, so that
every screen and every phone shows the same number.

**Decision.**
- One function per home screen: `student_home()`, `coordinator_dashboard()` and
  `guru_dashboard()`. Each returns every number its screen shows as one JSON object, and only reads.
- They are **security invoker**, like the views (#20): they count with the rights of the person
  asking, so row-level security still decides what is counted. `coordinator_dashboard` answers
  staff only and `guru_dashboard` the Guru only (`not_allowed` for anyone else); `student_home`
  gives a student only their own numbers, and nothing to a login without a student record.
- **This week** is Monday to today, India time (`week_start_ist()`), for every screen.
- **New joiner**: joined in the last `settings.new_joiner_weeks` weeks (4) and not *Left*.
  **In class**: not *Left*. Students per level count only those in class; students per status
  count everyone.
- **Calls due for my students** (C1) follows the follow-up queue (C10): a task due today or
  earlier, or escalated, that is assigned to me or for a student I mentor. **Overdue** (G1) is an
  open task past its due date and not escalated; escalated ones are counted separately. Both count
  students, not tasks, and G1 groups them by the person the task is assigned to.
- **Here now** and **visits today** are counted exactly as on C6 and C5.

**Why.** One request per home keeps the first screen fast on a weak phone signal, and the phone
never holds the whole class's visits. Counting in the database with the asker's rights keeps the
access rules in the tables' policies (#5, #20) and gives every phone the same number. A week
from Monday (the international standard week) is the everyday meaning of "this week", and it
starts again each Monday, which suits a student's "visits this week"; the screens say "from
Monday" so nobody reads it as the last seven days.

**Consequences.** Migration `0009_home_screens.sql`; app `src/data/home.ts`. A new number on a
home screen goes into its function, in a new migration. A change to "this week" is one function,
`week_start_ist`. The smoke test checks each number against a direct count, the role checks, and
that none of the functions is security definer. The home screens reload when they come back into
view, so they follow what was just done; they do not update live while open. The temporary
`components/role-home.tsx` is gone: the staff buttons are `components/staff-shortcuts.tsx`, on
both C1 and G1. Items the approved screen list also names for C1 and G1 (reviews pending, visit
trend, practice hours, level-up queue) come with their Phase 2 features.

## 32. Photos and PDFs on announcements live in a private bucket — 30 Sep 2026

**Context.** On WhatsApp the class shares posters, route maps and timetables as photos and PDFs.
Announcements had an `attachments` column since 0001 but nothing used it. Many students are
minors, so a photo of a student is personal data under the DPDP Act, and the free Supabase plan
holds only 1 GB of files in all.

**Decision.** Praveen chose (30 Sep 2026): photos and PDFs, at most 3 per announcement, PDFs up
to 5 MB, photos made smaller on the phone, and only people who can read the announcement can open
its files.
- The files are in the Storage bucket `announcement-files`: private, at most 5 MB a file, only
  JPEG, PNG, WebP and PDF. Each file sits in a folder named after the uploader's login.
- The app makes a photo at most 1600 pixels on its longest side and saves it as a JPEG (quality
  0.7) before upload, which also leaves out the hidden camera details such as the place.
- A file is uploaded only when the announcement is saved, then listed in `attachments`
  (`path`, `name`, `kind`, `size`). A trigger checks the list: at most 3, well-formed, and an app
  user may add only files from their own folder that are really in Storage.
- Storage's row-level security lets a person open a file only when an announcement they may read
  lists it (the announcements rule of #25 decides), and staff their own uploads. The app shows
  files through signed links that work for an hour.
- Only the uploader, the Guru, or the author of the announcement that lists a file can delete it.
  Deleting an announcement removes its files first; removing a file while editing removes it
  from Storage once the change is saved. A file change on a published announcement counts as an
  edit (#27).
- The compose screen reminds that a photo showing a student needs the parent's photo consent.

**Why.** A public bucket would put every file one guessed link away from anyone; tying the file
rule to the announcement rule means a file can never be seen by more people than its
announcement. Uploading at save time leaves nothing behind when a form is abandoned. Smaller
photos load fast on phone data and make the 1 GB last: at about 300 KB a photo, that is over
3,000 photos. Checking the folder stops a coordinator from attaching a file from someone else's
announcement to reach a wider audience.

**Consequences.** Migration `0010_announcement_files.sql`; `app/src/data/announcement-files.ts`,
`components/attachment-picker.tsx`, `components/attachment-list.tsx`. Deleting a row in SQL
does not delete the file in Storage, so files are removed through the Storage API; a file whose
removal failed (no internet) stays unused until it is cleaned up (OPERATIONS.md "Files no
announcement uses"). The consent reminder is only a reminder: the app cannot tell who is in a
photo. The existing photo consent reads "a photo of the student on the class record"; whether it
also covers photos in announcements is for the team and its legal adviser to settle. Files are
not in the audit log.

## 33. Push notifications on Android go through Expo, sent by an Edge Function — 30 Sep 2026

**Context.** Announcements replace WhatsApp, where a message makes the phone ring. Without push,
people see a new announcement only when they open the app. Praveen chose (30 Sep 2026): Android
now, through the APK (#24); iPhone web push after the Sunday demo.

**Decision.**
- The Android app asks for permission after sign-in and saves its Expo push token
  (`push_tokens`, through `register_push_token`). A token belongs to the login last signed in on
  that phone; signing out deletes it.
- `announcements.notified_at` marks an announcement as notified. A pg_cron job runs every minute;
  when a published announcement is still waiting, it calls the Edge Function
  `notify-announcements` through pg_net, with a shared secret kept in the Vault.
- The Edge Function claims the waiting announcements (`claim_due_push`), which returns the
  phones of the people each one is addressed to (the same people as "seen by", #25), and sends
  one notification per phone through Expo's push service, which passes it to Google's Firebase
  Cloud Messaging. The notification shows the announcement's title and the start of its text;
  a tap opens the announcement. Scheduled announcements are sent at their time the same way.
- An announcement published more than a day before it could be sent is marked but not sent, so
  switching push on never sends old news. An edit is not sent again.
- Until push is set up (pg_net, the deployed function, the Vault secrets, the Firebase key, a new
  APK), everything above does nothing and the app works as before.

**Why.** Expo's push service is free and one API for Android now and iPhones later; the app
already builds with EAS. Sending from an Edge Function keeps the service-role key inside Supabase;
it never reaches the app or the repository. Checking every minute from the database covers
posts made now and scheduled ones with one mechanism, and the claim step cannot send twice.

**Consequences.** Migration `0011_push_notifications.sql`, `supabase/functions/notify-announcements/`,
`app/src/lib/push.ts` (and `push.web.ts`, which does nothing). The Android app needs a Firebase
project on the team email, its `google-services.json` in the build and the FCM key in EAS
(OPERATIONS.md "Push notifications"); push does not work in Expo Go. The notification text is
the announcement's own words, not translated. Nothing is sent for replies yet, and no delivery
receipts are read: a token is dropped only when Expo answers that the app is gone. Setting
`notified_at` is not copied to the audit log. iPhone web push needs a service worker and VAPID
keys, and the iPhone app added to the home screen (iOS 16.4 or later): a later decision.
