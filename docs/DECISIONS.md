# Decisions

Every important decision, with the reason. Newest at the bottom. Never rewrite an entry: if a
decision changes, mark the old one *Replaced by #N* and add a new entry. When only part of it
changes, add a line *Replaced in part by #N: what no longer holds* under the old entry (a date or
typo fix gets an *Erratum* line instead).

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
role by the Guru. *(The English screens call the Guru "Facilitator" since 2 Oct 2026: see #40.)*

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
point: Replaced by #30.)*

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

## 19. Reasons for a call are codes the app translates — 29 Sep 2026

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

*Erratum 9 Oct 2026: #19 and #20 were headed 30 Sep 2026; they were committed on 29 Sep 2026
(b348fe7), before #21. Only the dates changed.*

## 20. Views read the tables as the person asking — 29 Sep 2026

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
- The last card loaded (name, roll number, `qr_token`) is kept on the phone. My QR shows it at
  once while it asks the server, and keeps it with a note when the server cannot be reached.
  (Showing it only after the server failed made a student wait about 6 seconds without signal,
  because the database client retries a failed request 3 times first; changed 1 Oct 2026.) It is
  shown only to the login it belongs to, deleted at sign-out, and deleted when the server says the
  login has no student record.

**Why.** An online QR image service would receive every student's secret. Many scanners cannot
read light-on-dark codes. Level Q survives glare and cracked screens, and for this short text it
gives no bigger a code than the usual level M. The saved copy is no more sensitive than the login
session, which is kept on the phone already.

**Consequences.** Code: `app/src/components/qr-code.tsx`, `app/src/data/my-student.ts`. A code
shown from the saved copy stops working if its `qr_token` is changed on the server; the card
updates the next time the phone is online. There is no screen yet to issue a new `qr_token` for a
student whose code was shared. *(Since 10 Oct 2026 the Guru can: #250.)*

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
new APK until over-the-air updates (EAS Update) are chosen. *(Last point: Replaced by #35.)*

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
*Replaced in part by #28 (groups screen), #29 (replies), #32 (photos and PDFs) and #33 (push
notifications): the last two sentences no longer hold.*

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
*Replaced in part by #33: push notifications exist, but an edit is not sent again, so the reader
is still not told.*

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
*Replaced in part by #33: push exists, and still nothing is sent for replies (checked 9 Oct 2026:
no migration up to 0037 notifies on `announcement_replies`).*

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
header shows no Back arrow; the browser's Back still works. *(Last point: Replaced by #36. Since #36
the staff tabs are underneath too, and the anchor is the role's tabs.)*

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
**Corrected 6 Oct 2026 (#112-#115):** the claim step did lose or repeat pushes when a run failed half-way (audit D2-01, D2-04); since 0031 each phone's push is a queue row of its own.

## 34. google-services.json is in the repository — 30 Sep 2026

**Context.** The Android app needs Firebase's `google-services.json` in the build for push
notifications (#33). EAS Build uploads only what git does not ignore. The repository is public.

**Decision.** Praveen chose (30 Sep 2026) to commit `app/google-services.json`, and `app.json`
points to it. The Firebase service-account key stays out: it is uploaded to EAS only, and file
names such as `*-firebase-adminsdk-*.json` are ignored by git.

**Why.** Expo's documentation says the file holds only public identifiers (project id, app id,
an Android API key) and may be committed; the same values are inside every APK anyone can
download. Committing it means any maintainer can build the app without a hidden extra step. The
alternative, an EAS file variable read by an `app.config.ts`, would add a file and a step for
no real protection.

**Consequences.** Anyone can read the project's Firebase identifiers on GitHub; they allow no
sending of notifications (that needs the service-account key). The API key can be restricted
later in Google Cloud (Credentials → the Android key → Android apps only). A new Firebase project
means replacing the file and committing it again (OPERATIONS.md "Push notifications", step 3).

## 35. The Android app updates itself with EAS Update — 1 Oct 2026

**Context.** Until now every change, even one word, meant a new APK (#24) that each tester or
student had to download and install again. The interface is about to change often (look-and-feel
rounds from the volunteers' remarks), and the free plan allows 15 builds a month. Praveen asked
(1 Oct 2026) for updates inside the app, "as formal apps do".

**Decision.**
- The app has `expo-updates`. Each APK listens on the channel of its build profile: `preview`
  (test project) or `production` (live project), set in `app/eas.json`.
- A change to screens, text, translations or images is published as an update with
  `npm run update:preview` or `npm run update:production` (`app/scripts/publish-update.mjs`).
  The script takes the Supabase URL and key from the EAS environment of the same name, never
  from `app/.env` or `app/.env.test`, and checks the bundle holds only that channel's project
  before it publishes. Production asks once more.
- The phone checks for an update when the app starts (and downloads it in the background) and
  when it comes back to the front, at most every 30 minutes. Once one is downloaded, the home
  screens (S1, C1, G1) say "A new version is ready" with a Restart button (Praveen chose this
  over the silent default, 1 Oct 2026). Without a restart it starts the next time the app is
  opened from scratch. The home screens also show which version the phone runs.
- `runtimeVersion` uses the **fingerprint** policy: Expo computes a hash of everything native
  (packages with native code, `app.json`, plugins, icons, `eas.json`, `google-services.json`).
  An update reaches only the APKs with the same hash. `app/fingerprint.config.js` leaves out the
  npm scripts and `.gitignore`, which cannot change this app's native side (it keeps no
  `android/` folder in git). The publish script stops when no finished APK on the channel has
  the current hash, which means a new APK is needed instead.

**Why.** EAS Update is free up to 1,000 monthly active users and 100 GiB of downloads, enough for
a class of about 200; it needs no store and no reinstall, and is part of the Expo tools already in
use. Taking the settings from EAS rather than local files keeps an update on the same project as
the APKs it reaches: a preview update made with the live settings would send testers into real
data. The fingerprint policy was chosen over `appVersion` because it cannot forget: with
`appVersion` someone must remember to raise the version for every native change, or an update
reaches an APK that lacks the native code and the app crashes; with the fingerprint such an
update simply reaches no APK, and a new APK is needed anyway. The cost is that more changes count
as native, so an APK is needed a little more often.

**Consequences.** Native changes still need a new APK, and phones on an older APK stop getting
updates until they install it (OPERATIONS.md "Updating the Android app" lists what counts).
Updates are not signed with our own key: EAS Update code signing needs a paid plan, so the
phones trust Expo's server over HTTPS, as they already trust it for builds. The web version is
not affected: it changes when a new export is uploaded (#23). The APK built before this decision
(30 Sep 2026) has no `expo-updates`, so it must be replaced once. On a network that inspects
secure connections to Google's storage (the office FortiGate, seen 1 Oct 2026), uploading an
update or a build fails; publish from another network rather than switching checks off.

## 36. One look for every screen, and tabs per role — 1 Oct 2026

**Context.** The first week built rules and data; the screens were plain on purpose: stack
screens, no icons, the word "Loading…", and home screens that ended in a list of seven identical
buttons, so every task meant home → button → back. A volunteer called it "UI/UX is bad" (30 Sep
2026) and sent a mockup of a desktop admin panel: ISKCON logo header, sidebar, banner, eight module
tiles, a quote. Most members use iPhones (the web version); the class runs on phones at 375 px.

**Decision.**
- **Take the mockup's look, not its layout.** Warm saffron colours, a devotional header on the
  home screens, cards with icons. Phone first; each role keeps its own home (S1, C1, G1);
  students never see staff or fund screens; nothing from the mockup that was decided against or
  is for later (batches, WhatsApp groups, inventory, events, fund).
- **Tabs per role** (Praveen, 1 Oct 2026), from Expo Router's own `Tabs`: students Home · My QR ·
  Announcements; the Guru and coordinators Home · Attendance · Students · Calls · Announcements.
  Bottom tabs on a phone; for staff a sidebar on the left from 900 px wide. Other screens open on
  top of the tabs with a back button. The tab screens sit in `(tabs)` route groups, so the
  addresses stay (`/staff/students`, `/student/my-qr`, ...). The two staff homes share one
  address, `/staff`, which shows G1 or C1 by role (`src/screens/`); `/guru` and `/coordinator`
  are gone. The role's tabs are the anchor of its stack, so a screen opened from a link or a push
  notification has them underneath and Back leads there.
- **Header:** a saffron band with our own drum mark (`components/mridanga-mark.tsx`), "Hare
  Krishna", the name, the role and the Hare Krishna maha-mantra in the app's language and script.
  Header bars of the other screens are saffron too.
- **Design system** in `src/theme/` and `src/components/`: new colours `primarySoft`,
  `onPrimarySoft`, `cardBorder`, `shadow`, `skeleton`, `headerTop/Bottom`, `onHeader(Muted)`;
  `cardLook()` (16 px corners, a faint edge, a soft shadow in light mode); icons from one list
  (`components/icon.tsx`, Ionicons outline); grey placeholder cards while a screen loads
  (`loading-cards.tsx`); an icon, a line and the one action when a list is empty
  (`empty-state.tsx`); one big main action per home (My QR; Mark attendance); 16 px page sides
  at 375 px; the language switch, Sign out and version in a quiet card at the end of a home.
- **JavaScript only**, so it reaches the installed APKs as an update (#35): the tabs come with
  Expo Router, the icons with `@expo/vector-icons` (no native code, uses expo-font, already in
  the APK), the mark and the header shading with react-native-svg (already in the APK). The
  Android fingerprint stayed `e4c4af08…` with the new package.

**Why.** Tabs put the five things staff do most one tap away and make the web version usable
without the browser's Back button. Keeping the addresses keeps old links, push notifications and
#30 working. The ISKCON logo needs the temple's written permission, so the app has its own mark
until there is an approved logo. Book translations and purports are copyrighted (BBT), so the
header carries only the maha-mantra, which is free to use in every script. Every new text pair
was checked against WCAG AA (4.5:1) in both themes; this is why the header's top colour is a
deeper saffron (`#9A4307`) than the brand colour, and why initials use `onPrimarySoft`.

**Consequences.** New screens use `Screen`, `Section`, `cardLook()`, `Icon` and `LoadingCards`
instead of their own colours, borders or "Loading…" text, and a new icon is added to the list
in `icon.tsx`. A new staff screen that is used all the time may become a tab (five is the most a
phone holds); any other one goes in `staff/` beside the tabs. The icon font adds about 380 KB,
downloaded once. Native look items (a gradient package, haptics, blur, SF Symbols / Material
Symbols, a new app icon or splash) need a new APK and wait for one. Translations of the tab
labels and the mantra lines are drafts for the native-speaker review (TRANSLATIONS.md).

## 37. The app remembers the signed-in person's profile on the device — 2 Oct 2026

**Context.** Every start of the app, and every reload of the web version, showed the saffron
splash for 2-5 s. Measured on the test site (1 Oct 2026, Guru login, office network): the page
was ready after 0.7 s, then Supabase refreshed the expired login token (1.1 → 4.6 s) and only
then was the profile fetched (4.6 → 5.2 s); the area, and so the first screen, waited for both.
Without internet the profile fetch failed and the person landed on "Could not load your
account", even a student who only wanted My QR at the door (#21).

**Decision.** After every successful profile fetch the app keeps a copy of the person's own
`profiles` row (id, role, name, email, language, active) on the device
(`src/auth/saved-profile.ts`). On the next start that copy decides the area at once, so the
person's home opens while Supabase restores and refreshes the login behind it; the screens'
own data arrives when the login is ready (the Supabase client waits for it). The fresh profile
then replaces the copy. The copy is used only for the same person (same user id), is forgotten on
sign-out and when the profile no longer exists, and is kept when a fetch fails for lack of
internet, so the person keeps their screens offline.

**Why.** The wait was the network, not the app, and the role rarely changes. Showing the home
at once with placeholder cards (#36) feels immediate, and offline it opens My QR, which matters
most at the door. It is the same kind of data the device already holds (the login itself, the
saved QR card, #21), and less sensitive than the login token.

**Consequences.** A role or "switched off" change reaches a device on its next successful
profile fetch, a few seconds after start with internet; until then the old screens show, but
the database still refuses any data the person may no longer see (#15, row-level security). If
a saved login turns out to be invalid, the home shows briefly and then the sign-in screen. The
pending screen ("Could not load your account") now appears only for someone who has never
loaded their profile on this device.

## 38. The APK is built for phones only, with unused code removed — 2 Oct 2026

**Context.** Praveen asked (1 Oct 2026) for a smaller APK: people download it from a link, often on
mobile data. By default an Expo APK holds the native code four times, once per processor type,
two of which (`x86`, `x86_64`) are used only by emulators and some Chromebooks, and it keeps
Java code and resources that the app never uses.

**Decision.** The `expo-build-properties` plugin in `app/app.json` sets, for Android:
`buildArchs` `armeabi-v7a` and `arm64-v8a`; `enableMinifyInReleaseBuilds` (R8);
`enableShrinkResourcesInReleaseBuilds`. Both profiles get the same settings. The first APK with
them is a `preview` build tested on a phone before any `production` build: build `f9a084aa`
(2 Oct 2026) is 68 MB instead of 147 MB, and sign-in, QR scanning, a photo and a PDF on an
announcement, and push notifications all worked on Praveen's phone.

**Why.** Every Android phone the class may use runs one of the two kept processor types.
`armeabi-v7a` stays for old and low-cost 32-bit phones (Android Go), which `arm64-v8a` alone
would shut out. R8 and resource shrinking are Android's own tools, supported by Expo. Not chosen:
`enableBundleCompression` (smaller, but the app starts more slowly), and a Play Store AAB that
gives each phone only its own part (no Play Store yet, #24).

**Consequences.** The APK does not install on an x86 emulator or an x86 Chromebook. R8 can remove
code that a library reaches only by name; libraries ship their own keep rules, but a crash or a
broken feature that appears only in the APK points here, and the fix is a rule in
`extraProguardRules` (OPERATIONS.md "Keeping the APK small" lists what to test). The plugin
changes the fingerprint (#35), so the APKs built before it (up to `c43019c2`) stop getting
updates once this is on `main`: every phone installs the new APK once.

## 39. A ring of modules on the staff home, and the motto — 2 Oct 2026

**Context.** The volunteers reviewed the app after round 3 and sent three mockups made with
ChatGPT (2 Oct 2026). They liked the third, "Central Menu Style": a ring of coloured module
circles around the drum, with the app name and "Saṅkalpa · Sādhana · Seva" under it. They asked
for all the icons, with the unbuilt ones marked "under construction". The mockups also had an
ISKCON logo, a painted banner of a temple and a drum, a quote, and modules the app does not have
(Admins, Teachers, Inventory, Events, Reports, Settings, Calendar, WhatsApp groups, e-mail
templates, backup).

**Decision** (Praveen, 2 Oct 2026).
- **The ring, on the staff homes, with the tabs staying.** C1 and G1 keep their counts and the
  Mark attendance button; the ring (`components/module-ring.tsx`) replaces the three shortcut
  tiles further down. Around the drum mark: Students, Attendance, Who is here now, Follow-up
  calls, Announcements, Groups, each in its own colour, and two modules that are not built yet,
  **Instruments** and **Events**, in saffron with a small "under construction" mark. Those two open
  one **Coming soon** screen (`staff/coming-soon.tsx`) that says in a line what the module will
  do, with an "Under construction" label and a way back. Nothing else from the mockups' module
  list: those modules were decided against or are for much later (#36), and an empty screen per
  module is what makes an app feel like a demo. Register a student stays the first button on the
  Students tab.
- **The motto** "Saṅkalpa · Sādhana · Seva" is shown under the app name: in the middle of the ring
  and on the sign-in header. It is written the same way, in Latin letters with diacritics, in all
  three languages. This relaxes #36's "only the maha-mantra" by one line; the mantra stays as it was.
- **Not taken:** the ISKCON logo (needs the temple's written permission, #36), the painted banner
  (AI-generated pictures of deities and temples are the temple's call, and a picture costs a few
  hundred KB per update), the quote (#36: book texts are BBT copyright; the motto is not a quote),
  and the mockup's bottom tabs (Calendar, Notifications, Profile): ours are the five things staff
  do most.
- **Large text:** when the phone's text size is about 130 % or more, the ring would not hold its
  labels, so the same modules are shown as a grid of tiles. The two-column grids of round 4 (the
  profile's details, the lists on a laptop) fall back to one column the same way.

**Why.** The ring is a devotional home that the volunteers asked for, it is plain JavaScript (an
update, not an APK), and with only planned modules on it, each saying what it will do, it is
honest. The tabs stay the anchor because they put the five everyday screens one tap away and
keep Back working on the web (#36).

**Consequences.** A module that gets built swaps its Coming soon entry for its screen in
`staff-shortcuts.tsx`; a module that is dropped is removed from the ring. The module colours
(`colors.modules`) were checked for contrast: icon on tint 4.5:1 or better in both themes. The
Telugu and Hindi lines of the Coming soon screen and the module names are drafts for the
native-speaker review (TRANSLATIONS.md).

## 40. The English screens call the Guru "Facilitator" — 2 Oct 2026

**Context.** After using the test app, the team said (2 Oct 2026, through Praveen) that the role
should be called Facilitator rather than Guru.

**Decision.** Only the English text changes (`roles.guru` and every sentence that named the
Guru, in `app/src/i18n/locales/en.json`). Telugu and Hindi keep గురువు and गुरु, as Praveen
chose. The role's value in the database stays `guru`, and so do the code, the screen numbers
(G1 "Guru dashboard") and these documents, which mean the same person.

**Why.** Renaming the value would mean a migration on both projects and touching every policy,
function and check that names it, for nothing anyone can see. Text in the translation files
reaches the phones as an update (#35).

**Consequences.** A new English sentence about this person says "the facilitator" (lowercase, as
"coordinators" is). The Telugu and Hindi words can change the same way after the native-speaker
review (TRANSLATIONS.md).

## 41. Students get the ring too, and can read their own progress — 2 Oct 2026

**Context.** #39 put the ring of modules on the staff homes. The student home (S1) still ended in
a list; a student's level showed only as a bar, with no way to see which items were ticked. The
database already lets a student read their own `student_progress` rows and the syllabus (policy
`own_or_staff`, 0001).

**Decision** (Praveen, 2 Oct 2026). The student home gets the same ring, smaller, with four
circles: My QR, Announcements, **My progress** (new screen S4, read-only: the current level's
syllabus with a tick and the date on the items shown in class, and the progress bar) and
**Events** as the only coming-soon circle; students never see staff modules. The big My QR button
stays at the top (#21). The Coming soon page is shared by both areas (`src/screens/coming-soon.tsx`)
because an area may open only its own routes. The announcement screens (C15 detail, S10 detail)
show the announcement as one card: a "Pinned" strip, the title, the message, the photos as a strip
of squares (one photo stays large), PDFs as rows with a file icon, and the facts under it with
small icons; replies carry the writer's initials. The sign-in and sign-up screens centre their card
on a laptop.

**Why.** The ring is the home's centre piece for everyone, not only staff, and a student who
can see which items are ticked knows what to practise. Reading is safe: ticking stays with the
coordinators and the facilitator (#22), and moving up a level stays the facilitator's decision.

**Consequences.** S4 is half built: the syllabus progress is there, the lessons and materials
come later. Telugu and Hindi lines of S4 are drafts for the native-speaker review.

## 42. Without internet a saved login stays signed in, and iPhone page settings — 2 Oct 2026

**Context.** Round 6 tested the paths that had never been tried (NOTES, UI/UX handover). Reading
the installed Supabase auth client (2.117.2) and trying it in the browser with no internet showed
two gaps. A login's access token lasts an hour. When the app starts after that with no internet,
the client cannot refresh the token and reports "no session" after about 30 seconds of retries,
although the login is still saved and works again once there is a connection. The app then
showed the sign-in screen: a student at the door with no signal lost My QR, which #21 and #37
promise works offline. In the same state, Sign out returned an error and kept the login, so the
person stayed signed in. Separately, the web version had no iPhone page settings beyond the
home-screen icon.

**Decision.**
- **A saved login that could not be refreshed for lack of internet keeps the person's area.**
  The auth provider tells this case from a real sign-out by looking for the saved login on the
  device (`storedLoginUserId` in `src/lib/supabase.ts`) when "no session" arrives at start. The
  remembered profile of the same person (#37) then opens their screens; with no remembered
  profile they see "Could not load your account" with Check again, not sign-in. The next
  Supabase event settles it: a refreshed token once online, or SIGNED_OUT when the server says
  the login is no longer valid.
- **Sign out works without internet.** When Supabase's sign-out fails and the login is still
  saved, the app deletes the saved login itself and signs out again, which clears the client and
  forgets the remembered profile and the saved QR card. The phone's push token row then stays on
  the server until the phone's next sign-in replaces it.
- **iPhone page settings** in `app/public/index.html`: `viewport-fit=cover`, so Safari reports the
  notch and home-bar sizes that the app's safe-area code already uses; a translucent status bar
  for the home-screen app, so the saffron header runs behind it with white icons (every screen
  starts with a saffron band or header bar); `theme-color` in the header colours, light and
  dark; `text-size-adjust: 100%`, so turning the phone does not enlarge the text; no grey tap
  flash. The page's language (`<html lang>`) follows the app's, so VoiceOver reads Telugu and Hindi
  with the right voice (`src/i18n/index.ts`). Text fields are 16 px, so Safari does not zoom in
  when one is tapped.

**Why.** The door is where the app matters most, and a weak signal there is normal. A saved
login is not proof of access: the database still checks every request (#15), and an invalid
login ends at the next successful contact with the server.

**Consequences.** Offline with an expired token, the first data request on a screen waits for the
client's refresh retries (up to about 30 s) before it fails; My QR shows its saved card at once
meanwhile. A device with no remembered profile shows the splash for those 30 s. The iPhone layout
under the notch and the home bar is verified only in a desktop browser, where the sizes are zero;
it needs a check on a real iPhone (OPERATIONS.md "Adding it to an iPhone home screen").

## 44. The team edits the syllabus and lessons; ticks are never lost — 3 Oct 2026

(Number #43 was left to the Phase 2 branch phase2-assessments; its entry is #52 since the Phase 2
merge (#55), so #43 stays unused.)

**Context.** The syllabus was dummy data from seed.sql, editable only in the dashboard, and
deleting an item there deleted every tick on it (`student_progress.item_id ... on delete cascade`,
0001). The pilot (16-29 Nov 2026) needs the real syllabus and the lesson videos, entered by the
team. The Screen List doc approves G4 Levels and syllabus, G5 Materials library and S4 Learn; S9
Attendance and A3 Profile have no team pick yet and were built on Praveen's brief for round 7.

**Decision** (Praveen's brief, 2 Oct 2026; details by the round 7 chat).
- **The levels stay fixed** (Beginner, Intermediate, Advanced, 28-09-2026). The Guru adds, edits,
  reorders, retires and deletes syllabus items; coordinators see the same pages read-only.
- **Retire instead of delete.** `syllabus_items.retired_at`: a retired item is no longer taught,
  cannot be ticked and does not count in progress, but its ticks stay and show (marked "No longer
  taught") where the student has it ticked. An item with ticks or materials cannot be deleted,
  not even from the dashboard; a ticked item cannot move to another level. Delete is only for an
  item nobody ticked. All of it is enforced by triggers (migration 0013) and logged in audit_log.
- **Reorder** with Up / Down buttons (`move_syllabus_item`, Guru only), not drag and drop: it
  works the same on phones, the web and with a screen reader.
- **Materials** are a YouTube link, a PDF or a photo, for one level and optionally one item, with
  an optional note. Lesson videos are unlisted YouTube videos (Praveen, 28-09-2026); the app opens
  them in the YouTube app or the browser, with no player inside the app for now (V3 player
  controls are Phase 2). PDFs and photos reuse the announcement picker and go to a private bucket
  `material-files` with a **10 MB** cap (double the announcements' 5 MB: scanned notation booklets
  are larger; the free plan's 1 GB of storage holds about a hundred such files plus the photos).
  Only the Guru uploads in Phase 1; the Guru's materials are approved at once. Coordinators'
  suggestions (C18) come in Phase 2. A student opens a file exactly when they may read the
  material (approved, up to their level).
- **S4** shows the lessons under each item and the level's own lessons first. **S9** lists a
  student's visits by month (3 months, then "Show earlier months"), for the student and, from
  C8, for staff. **A3** lets everyone change their own name and phone (checked by a trigger),
  switch language and sign out; a student also sees their roll number and the way to My QR. The
  name on the roll stays the coordinators' record.
- **Entry points:** a ninth circle "Syllabus and lessons" (indigo) on the staff ring, the ring's
  limit before it turns into a grid; "Attendance" and "My profile" circles on the student ring
  (six circles); "My profile" at the foot of every home.

**Why.** Promotion (Phase 2) rests on the ticks, so no edit may erase one. Retiring keeps the
history honest while the syllabus evolves. YouTube costs nothing and needs no new native package.

**Consequences.** Migration 0013 must run on TEST before the screens work there, and on LIVE before
the next publish to production. A material's file goes from Storage before its row; a file whose
material row fails to save is taken out of Storage again. The Telugu and Hindi lines are drafts
for the native-speaker review (docs/TRANSLATIONS.md).

## 45. The facilitator gives roles and manages coordinators in the app — 3 Oct 2026

**Context.** Until round 8 a signed-up person became a coordinator only when someone edited
`profiles.role` in the Supabase Table Editor, and moving a coordinator's students meant editing each
student. The team approved G2 Coordinators, G3 Students (whole database and import), G10 Settings
and G11 Audit log in the Screen List doc; the pilot (16-29 Nov 2026) needs them on a laptop.

**Decision** (Praveen's brief for round 8, 3 Oct 2026; details by the round 8 chat).
- **G2 Coordinators** (`staff/coordinators/`): the Guru and coordinators with their number of mentees
  and duty hours; the people waiting for a role; logins put aside. On a person: make a waiting
  person a coordinator, or **link them to a student record** that has no login
  (`link_student_login`, for a student whose record carries a different email or none; the
  automatic link by confirmed email of #13 stays); write **duty hours** as free text
  (`profiles.duty_hours`, up to 120 characters; the duty roster C20 is Phase 2); pick mentees and
  **move them to another coordinator** in one step (`reassign_mentees`); switch a login off or on.
- **Rules in the database** (trigger `profiles_admin_guard`, migration 0014): nobody changes their own
  role or switches themselves off; the Guru role is given and taken only in the dashboard; the app
  gives roles only to pending logins (coordinator, or student through a linked record); a
  coordinator who still mentors students cannot be switched off until they are moved; a mentor is
  an active coordinator or the Guru. Switching off keeps every record (`profiles.active`, #11).
- **G3 Student database** (`staff/database/`): every record, Left ones too, with search and filters
  for level, status, mentor and area; a table on a laptop, rows on a phone. C7 stays the everyday
  list for coordinators. The import is #46.
- **Entry:** a short list "Running the class" under the ring on the Guru home (G1), not new circles:
  the ring holds nine (#44) and these are one person's laptop screens. The four screens tell a
  coordinator who opens them by address that only the facilitator uses them; the database refuses
  a coordinator anyway.

**Why.** Giving roles is the "main thing" of the team's brief (coordinator management, 28 Sep 2026),
and the Table Editor is neither safe nor usable for the volunteers. Linking a login to a record by
the Guru's decision is safe where the email rule cannot help, because the Guru checks the person.

**Consequences.** Migration 0014 must run on TEST before the screens work there, and on LIVE before
the next production publish. A person who gets a role sees it after reopening the app or tapping
Check again on the pending screen.

## 46. Students are imported from Excel or CSV, adults only, row by row — 3 Oct 2026

**Context.** The class keeps its students in an Excel list today. The pilot needs them in the app
without typing each one into C2. The brief allowed a pure-JavaScript reader such as SheetJS.

**Decision.**
- **Reader:** fflate (MIT, pure JavaScript, from npm) opens the .xlsx zip, and
  `src/lib/sheet-reader.ts` reads the first sheet's cells (shared and inline text, numbers,
  true/false; formulas give their saved value); CSV with comma, semicolon or tab is read too. Not
  SheetJS: the newest SheetJS on npm (`xlsx` 0.18.5) has two published advisories (prototype
  pollution CVE-2023-30533, ReDoS CVE-2024-22363) that are fixed only in versions served from
  SheetJS's own CDN, not npm, and it is several hundred KB. Measured on the web export: fflate adds
  about 34 KB minified (13 KB gzipped); all of round 8 adds about 199 KB minified (51 KB gzipped)
  to the entry bundle, much of it the new text in three languages. No native code: the fingerprint
  stays 38ce7d9d. Old .xls files are refused with "save as .xlsx or CSV".
- **Steps on one page** (`staff/database/import.tsx`): choose a file → the columns are matched to
  name, date of birth, phone, email, area, pincode, level, joined on and an old roll number by
  their headings (the Guru can change each) → every row is checked and listed with its problems →
  only the good rows are sent, after a confirmation.
- **Row rules** (app and again in `import_students`, migration 0014): name and **date of birth
  required** (as for C2; under-18 cannot be told otherwise); **under 18 refused** with "register
  with the form", so the parent's consent is recorded (#8, #16); a duplicate phone (same last 10
  digits), email, name with date of birth, or old roll number, against the database and within the
  file, is refused; dates as Excel day numbers, day-month-year, year-month-day or 15-Jun-2012; level
  as Beginner / Intermediate / Advanced or 1-3, empty = Beginner. Each row is saved or refused on
  its own; at most 500 rows a call (the app sends 200).
- **Roll numbers** come from the same trigger as always, by the joining year (#3); the old roll
  number is not kept, it only finds repeats. Imported students start as *New*.
- **Days away count from when the record was made** if that is later than the joining date
  (`student_overview` and the daily job, 0014): otherwise every imported student with an old joining
  date would be *Irregular* the next morning, with a call task for each.

**Why.** The import is a one-time job for the facilitator, done on a laptop; showing every problem
before anything is saved, and saving the good rows only, lets them fix the file and import again
without creating doubles.

**Consequences.** Minors and rows without a date of birth stay in the file for C2. The seed's
dummy students get a creation time equal to their joining date so their days away stay as before.

## 47. Settings the database uses are edited on G10; the audit log is readable on G11 — 3 Oct 2026

**Context.** The follow-up day limits were rows in `settings` changed only in the dashboard, the open
window was fixed in `centres`, and "this week" always meant from Monday (#31), while the team had
asked "from Monday or the last 7 days" (NOTES_demo). The audit log was written but not readable.

**Decision.**
- **G10** (`staff/settings.tsx`) offers only what the code reads: the open window of the centre
  (`centres.opens_at`, `closes_at`; visits left open are closed at the closing time); **"this week"
  = from Monday or the last 7 days** (`settings.week_starts` = `monday` / `rolling7`, read by
  `week_start_ist()`, so every home number follows); days to Irregular and Inactive, days to make
  a call, days to retry, tries before the Guru is asked, weeks as a new joiner. Saved together by
  `save_settings` (all or nothing; Irregular must come before Inactive); each value checked by the
  trigger `settings_guard` (whole numbers in a range, known keys only, no delete from the app); each
  change written to the audit log with the key as the row id.
- **Promotion criteria for Phase 2** (#52; #43 on the branch phase2-assessments): the same keys and
  defaults as the promotion migration (0017_promotion since the Phase 2 merge, #55), `promotion_syllabus_percent`
  (100), `promotion_min_visits` (8), `promotion_visit_weeks` (8), `promotion_needs_level_up` (true) and
  `promotion_min_feedback` (2), so G10 edits what promotion reads. Shown on G10 as "not used yet"
  while Phase 2 is not on main. (A first version of 0014 had two placeholder keys of its own; found
  on TEST next to the Phase 2 keys on 3 Oct 2026 and replaced before 0014 reached main.)
- **Later, listed on the screen:** reasons for a call (each new code needs a translation), centres
  and the attendance area (G9, round 9), notification times, the duty roster.
- **G11** (`staff/audit-log.tsx`): read-only, newest first, 50 at a time, filtered in the database
  by record type, person, kind of change and period; a row opens to show the values before and
  after. Guru only (policy `guru_read`, 0001). Indexes for the filters; settings and centres are
  now logged too.

**Why.** Each setting changes what someone sees or is asked to do, so it belongs to the facilitator,
checked by the database, and traceable.

**Consequences.** A changed day limit takes effect at the next daily job (06:00 IST). The home
screens read `week_starts` to word their line ("from Monday" or "last 7 days").

## 48. A call follows the student's mentor; the profile holds the app language — 3 Oct 2026

**Context.** Two defects seen on 3 Oct 2026. (a) The follow-up queue said "not given to anyone yet"
for students who had a mentor: their call task had been made while they had none (the task copies
the mentor when it is made), and changing the mentor later did not touch it. (b) A language picked
on a device seemed lost after a reload (the coordinator: Telugu, then English): a language once picked
on any device won over the profile at every start and was written back to the profile, so a person's
second device (or browser) kept setting the profile back, and a device that had no choice of its own
followed the profile.

**Decision** (Praveen asked the chat to choose, round 8 brief).
- **(a) The call is given to the mentor**, not only shown: when a student's mentor changes, their open
  call tasks that were the old mentor's, or nobody's, go to the new mentor (trigger
  `students_follow_mentor`); 0014 also gives the existing unassigned tasks to the student's current
  mentor. The queue shows "for <name> (mentor)" when a task still has no assignee, and "not given to
  anyone yet" only for a student with no mentor.
- **(b) The profile holds the language;** the person's last choice wins on every device. A choice is
  saved to the profile at once; the device marks it "unsaved" only until the save works (picked on
  the sign-in screen, or without internet), and then sends it at the next profile load. Otherwise
  the profile's language is used and remembered on the device for the next start.

**Why.** Calls belong to the mentor (drop-in design, 28 Sep 2026); giving the task to them makes C1's
"calls due for my students", G1's per-coordinator counts and C10 agree. For the language, one place
of truth ends the tug of war between devices.

**Consequences.** A device that had picked a language before round 8 takes the profile's language at
its next start if they differ.

## 49. The notifications inbox is a table the database fills, one row per person — 3 Oct 2026

**Context.** A2 Notifications inbox is the last common Phase 1 screen. Push works only on the
Android app; web users (most members use iPhones and the web version) get none. Phase 2 adds assessment and
promotion notices through its own queue (`push_outbox`, branch phase2-promotion), with a
title, a line of text and the screen to open.

**Decision** (Praveen's brief preferred a table; round 9 chose it).
- **A table `notifications`, filled by the database** (migration 0015), not derived from the
  announcements on the fly: one row per person per notice, with a `kind`, the title, the start of
  the text, the screen to open (the same as the push's), `visible_at` and `read_at`. A trigger on
  announcements keeps it in line with `announcement_audience` on posting and on every edit of the
  title, text, audience or time; it does not depend on push being set up. Phase 2's notices fit the
  same row (kinds `assessment`, `promotion` are allowed already) and join it at the merge.
- **Read state.** Opening an announcement marks its notice read (trigger on read receipts). "Mark
  all read" marks notices only and adds no read receipts, so "seen by" (C15) keeps counting the
  people who opened the announcement.
- **No Edge Function change**: the push and the inbox are filled independently from the same
  audience view, so the deployed `notify-announcements` (and phase2-promotion's version) stay as
  they are.
- **Entry points:** a bell with the unread count at the top right of the home header (S1, C1, G1),
  and "Notifications" in the account card at the foot of every home. No ring circle: the staff ring
  is full (#44) and the student ring already has Announcements.
- **Start and housekeeping:** the inbox begins with the last 30 days of announcements; notices
  older than a year are deleted daily.

**Why.** Deriving the inbox from announcements would work for announcements only: Phase 2's
notices have no table of their own to derive from, and "mark all read" would have to fake read
receipts. One row per person also keeps what was *sent* stable when someone later changes level.

**Consequences.** A student who joins a level or group later gets no earlier notices in the inbox
(the announcements are still in S10). Migration 0015 must run on TEST and on LIVE before the
screens work; without it the bell shows no number and the inbox says it could not load.

## 50. Reports are counted in the database like the home screens; CSV with what is installed — 3 Oct 2026

**Context.** The team approved C21 My reports and G8 Reports (basic). The numbers must agree
with C1, G1 and `student_overview` as round 8 left them, and a coordinator may see only their
mentees' figures. Exporting must not add a native package (fingerprint 38ce7d9d).

**Decision.**
- **One function `class_report(from, to, mentor)`** (0015, security invoker, staff only) for both
  screens; a coordinator always gets their own mentees, the Guru everyone or one coordinator's
  mentees. Counting rules are those of the home screens (table in DATABASE.md "Reports"): statuses
  and days away from `student_overview`, weeks from Monday or 7-day blocks following
  `week_starts`, progress over the items in use at the current level, calls due = due by today or
  escalated. Statuses are "now", whatever the dates; the rest is for the dates chosen (at most a
  year). Smoke tests check that the Guru's report has the same "in class" and statuses as G1.
- **One screen** `staff/reports.tsx`: ranges this month, last month, last 4 weeks, last 3 months or
  two dates; tiles, statuses, visits per week and month, calls, progress per level, and every
  student's line; tables on a laptop (`components/data-table.tsx`), cards on a phone. Entry: the
  Guru's "Running the class" list; "My reports" under the ring on C1.
- **CSV** (`lib/csv.ts`): a byte-order mark so Excel shows Telugu and Hindi names, CRLF lines, and
  a leading apostrophe before a cell starting with = + - @ so Excel does not run it as a formula.
  On the web it downloads. On the Android app "Save to a folder" uses the folder picker of
  `expo-file-system` (already in the APK) and "Share" sends the text through React Native's own
  share sheet; `expo-sharing` would share the file itself but is a native package.

**Why.** Counting in one database function keeps the screens, the CSV and the home numbers
consistent and keeps the mentee rule in the database.

**Consequences.** "Share" sends text, not a file attachment, until a future APK adds
`expo-sharing` (not queued). The reports have no charts yet.

## 51. Centres store their attendance area now; the phone checks it from the next APK — 3 Oct 2026

**Context.** G9 Centres and geofence. `centres` (0001) already had a GPS point, a radius and the
open window, but nothing checked them and only the dashboard could change them. Checking a
phone's position needs `expo-location`, a native package, so a new APK.

**Decision.**
- **G9** (`staff/centres/`, Guru only): list, add, edit, switch off or on. The point is typed as
  "17.3850, 78.4867" or pasted as a Google Maps link (`lib/map-link.ts` reads the place marker
  `!3d…!4d…`, `q=`/`query=`/`ll=` and `@lat,lng`); a short `maps.app.goo.gl` link is refused with
  "open it, then copy the long link or the numbers", because the app does not follow links.
  "Check on Google Maps" opens the point. A radius of 25-2000 m (default 150). The open window
  can be edited here too (G10 keeps editing the first centre's).
- **Checks in the database** (`centres_details_guard`, 0015) and an `address` column; a centre is
  switched off, never deleted from the app; the last centre in use stays on. Round 8's
  `centres_guard` and audit trigger are unchanged.
- **The phone-side check is not built:** the screens say "checked on phones from the next app
  version". `expo-location` is queued for the next planned APK, together with `expo-audio`
  (Phase 2 recording).

**Why.** Storing the area now lets the team enter Abids' real point before the pilot; the check
itself waits for the APK that is coming anyway, so no extra install for the volunteers.

**Consequences.** Visits still carry centre 1 (Abids) and new students get centre 1 as home
centre; a centre picker comes when a second centre opens. Round 9 also fixed G10, which never
saved a changed open window (a lost template string made every window look unchanged).

## 52. Assessments: the Guru sets them, coordinators run and grade them — 2 Oct 2026

(Numbered #43 on the Phase 2 branch; renumbered at the merge into main, #55.)

**Status: confirmed by Praveen 3 Oct 2026; on main since the Phase 2 merge (#55), reaching phones
with the next APK.** Built on the branch `phase2-assessments`. He confirmed the storage cap,
the retention, the reminder time and keeping S7; in-app recording waits for the next planned APK;
editing an assessment comes in slice 2; promotion criteria will be settings with defaults (slice 2).

**Context.** The team approved the assessment flow in the Screen List doc (G6, C12, C13, C14; S7
has no pick yet, but the flow needs it): the Guru sets work in any form, coordinators hand it
out, follow up and grade routine work, the Guru grades level-ups (G7, slice 2). Students today
send recordings on WhatsApp. The free Supabase plan has 1 GB of Storage for everything.

**Decision.**
- **One assessment, many students.** The Guru writes `assessments` directly (title,
  instructions, type, level, level-up flag, a rubric of 1-8 lines with a top score 1-10 each, up
  to 3 files and a link) and keeps it as a draft until "Send to coordinators". A coordinator
  releases it (`release_assessment`) with notes and a due date to picked students; each student
  gets one `assessment_assignments` row, whose status is Not seen / Seen / Submitted / Reviewed /
  Redo. A student gets an assessment once, whichever coordinator releases it.
- **Database functions do the changes** that touch several rows or must check who is asking
  (`mark_assessment_seen`, `submit_assessment`, `review_submission`, `remind_assessment`), as
  for attendance (#5, #14). Row-level security: the Guru sees everything; coordinators see
  sent assessments and all students' work on them (any coordinator may follow up or review, as
  any coordinator may tick the syllabus, #22); a student sees only what was given to them. After
  the first release the type, level, level-up flag and rubric are fixed, so scores keep their
  meaning; a released assessment cannot be deleted.
- **A review** gives a score per rubric line, a comment (required for a redo), and Accept or
  Redo. A redo opens the assignment again; each recording is its own `assessment_submissions`
  row, so the history stays. On a level-up assessment an accepted review can be marked "send
  level-up to the Guru" (`send_level_up`), which slice 2 (G7, C22, C23) will read.
- **Recordings are files the student picks**, made with the phone's own recorder or camera, or
  a link (unlisted YouTube, Google Drive). Recording inside the app needs expo-audio, a native
  package and a new APK: it goes into the next planned APK, before Phase 2 goes live. Coordinators' voice notes on a
  review (C14 in the doc) wait for the same decision. Audio and video play through the browser
  view the app already has (expo-web-browser), not an in-app player.
- **Storage cap:** a private bucket `assessment-files`, at most **50 MB a file**
  (the free plan's own per-file limit), only common audio, video, photo and PDF types. A student
  may upload only while an assessment waits for them, at most **10 files a day**. One recording
  per submission.
- **Retention:** a submitted file is deleted **30 days after its review**; the score,
  comment and history stay. A file sent to the Guru for a level-up is kept until slice 2
  decides. The daily job asks the Edge Function to delete expired files through the Storage API
  (a SQL delete would leave the file behind, #32).
- **Notifications** go through a queue, `push_outbox`, worded on the server in the person's app
  language and sent by the Edge Function `notify-announcements` with the announcements: a new
  assessment to the student, "sent a recording" to the coordinator who released it, the review
  to the student, and reminders. **Remind** on the tracker reaches students who have not sent it,
  at most once in 12 hours each. **Automatic reminders** come from a daily job at 09:00 IST
  (`assessment_daily`) for work due today or tomorrow: it is a few lines of SQL on the same
  queue, so it is built.
- **Entry points:** an Assessments circle on the staff ring and on the student ring.

**Why.** It follows the approved flow and the Phase 1 patterns (rules in the database, views as
the person asking, private files behind signed links), so a coordinator's phone and a student's
phone cannot see or change more than they should. 50 MB is about 25 minutes of phone audio or a
minute or two of phone video; with 200 students sending one recording a month and files kept 30
days after review, Storage should stay well under 1 GB, and a link costs nothing.

**Consequences.** Migration `0016_assessments.sql` (run on TEST as 0012; LIVE runs it in main's
order, OPERATIONS.md).
The Edge Function must be deployed again for the assessment notifications and the file deletion;
until then those rows wait and nothing breaks, and the old function ignores them. S7 was kept by
Praveen although the Screen List doc has no team pick for it yet. The Telugu and Hindi texts, in the app and in the
notification lines in the migration, are drafts for the native-speaker review. Slice 2 is the
promotion approval (C22, C23, G7).

## 53. Promotion: coordinators nominate and give feedback, only the Guru promotes — 3 Oct 2026

(Numbered #45 on the Phase 2 branch; renumbered at the merge into main, #55.)

**Status: decided 3 Oct 2026; on main since the Phase 2 merge (#55), reaching phones with the next
APK.** Built on the branch `phase2-promotion`. Praveen left the open points to the build chat ("take the best viable
decisions; we will configure later if it does not suit"): criteria advise and do not block, the
nominating coordinator counts as one of the 2 answers, students see only the promotion push (no
nomination status until S8 is picked), level-up recordings kept 30 days after the decision (180
days if never nominated), no ring circle for promotions. The numbers are settings; the rest is a
small change if the team wants it otherwise.

**Context.** The Screen List doc approves C22 Nominate for promotion, C23 Promotion feedback and
G7 Level-up queue / Promotion approvals: a student moves up only when the Guru approves, after the
coordinators who teach the student have given feedback; the app never promotes by itself and
tells the mentor when a student meets the Guru's criteria. Praveen (3 Oct 2026): the criteria are
settings with defaults (whole level syllabus ticked, 8+ visits in the last 8 weeks, one accepted
level-up assessment), and an assessment can be edited (text, files, link any time; rubric, level,
type only until the first release).

**Decision.**
- **Criteria as settings** (`promotion_syllabus_percent` 100, `promotion_min_visits` 8 in
  `promotion_visit_weeks` 8, `promotion_needs_level_up` true, `promotion_min_feedback` 2),
  checked by `promotion_criteria` on the server. "Visits" counts days in class; the syllabus
  counts the items in use (retired ones left out, #44); the level-up is an accepted submission of a
  level-up assessment *of the current level* sent to the Guru (`send_level_up`, #52).
- **The criteria advise, the Guru decides.** A coordinator may nominate a student who misses a
  criterion (the reason says why); the check at the time is kept with the nomination and shown to
  the Guru. Coordinators see their own mentees who meet everything; the Guru sees all.
- **Who.** Any coordinator (or the Guru) nominates and picks coordinators to ask; those who
  ticked, marked a visit or reviewed in the last weeks, and the mentor, are suggested. A
  nominating coordinator's own view counts as one "Ready". Only coordinators answer (Ready /
  Almost / Not yet + a comment, changeable while open). **Promote needs 2 answers**; Not yet and
  More feedback can be given at any time. One open nomination per student.
- **The Guru's three answers.** Promote (confirm step; `students.level_id` and a `level_history`
  row with the Guru as approver; the student gets a push), Not yet (guidance and a date, tomorrow
  to a year ahead, before which the student cannot be nominated again), More feedback (a note;
  coordinators who have not answered get a push). The nominator or the Guru may withdraw.
- **Only the Guru changes a level**, enforced by a trigger: before this, a coordinator's phone
  could change `students.level_id` through the general staff update policy.
- **Students see no nominations or comments** (staff only); a promoted student gets a push that
  opens My progress. Showing the nomination's state on S8 waits for a team pick of S8.
- **Keeping the level-up recording:** while its nomination is open, then 30 days after the
  decision; one never used for a nomination 180 days after its review (0012 left this to slice 2).
- **Entry points:** cards on G1 (level-up queue: to decide, collecting, ready) and C1 (feedback
  asked of me, my students ready), a Promotion block on C8. No ring circle; the staff ring already
  holds ten since the merge with round 7 (circles drawn smaller, same slots).
- **Editing an assessment (G6):** an Edit button for the Guru; after the first release the type,
  level, level-up flag and rubric are shown, not editable (the database already refuses them).
  Files taken off are deleted from Storage after the save.

**Why.** It is the approved flow with the rules in the database, like attendance and assessments:
a coordinator's phone cannot promote, skip the feedback or see more than staff should. Settings let
the Guru tune the criteria without an app update. A soft criteria check keeps the Guru's judgement
in charge while still telling coordinators who is ready.

**Consequences.** Migration `0017_promotion.sql` (run on TEST as 0014_promotion; LIVE runs it in
main's order, after 0016). The Edge Function `notify-announcements` must be deployed again to send the
promotion notifications (it now accepts `/staff/promotion/<id>` and `/student/progress`); until
then they wait in `push_outbox`. The Telugu and Hindi texts are drafts (docs/TRANSLATIONS.md).

## 54. Practice tools: metronome, taal player, two-head view and practice log — 3 Oct 2026

(Numbered #49 on the Phase 2 branch; renumbered at the merge into main, #55.)

**Status: S5, S6 and the Guru taal editor confirmed by Praveen 3 Oct 2026; on main since the Phase 2
merge (#55), reaching phones with the next APK.** Built on the branch `phase2-practice`. **S5 Practice tools and S6 Practice log have no team pick in the Screen List doc**;
they were built because the approved V1 two-head view needs a player, and Praveen kept them.

**Context.** The Screen List doc approves V1 (both drum faces drawn, the zone and the hand lit per
bol in time with the sound, at any tempo, offline) and sequences "practice tools + two-head view"
after assessments and promotion. S5 (metronome with tap tempo, taal player with a beat-name grid,
slow-down player, record myself) and S6 (timer from S5 logs itself, manual entries, weekly hours)
are listed without a pick. The real taals (bols, levels) are a team input.

**Decision.**
- **S5** has a metronome (30-240 beats a minute, −5/−1/+1/+5, tap tempo from the last 2-5 taps, 2-8
  beats in a bar with an accent on beat 1, beat dots lit in time) and a taal player (a taal from the
  table, its own tempo, slow-down 50 / 75 / 100 %, the beat-name grid, the two-head view). Staff
  open the same screen without the timer; the Guru also finds "Edit taals".
- **Timing.** In the browser a look-ahead scheduler starts every sound on the Web Audio clock
  (`AudioContext.currentTime`), 150 ms ahead (up to 2 s when the browser slows the timer), from one anchor: a slow JavaScript timer never shifts a
  sound and nothing adds up (measured: see ARCHITECTURE "Practice tools"). On phones, where
  expo-audio cannot start a sound at a future time, the whole cycle is mixed into one WAV at the
  tempo and looped by the audio hardware (`player.loop`); the screen reads `player.currentTime`.
  A tempo change re-anchors (web) or mixes a new loop and seeks to the same beat (phone).
- **Sounds are synthesised** (decaying partials with a pitch bend for the baya, a noise attack), so
  nothing is downloaded and everything works offline. Recorded strokes can replace them (team input).
- **V1** draws both faces with react-native-svg as the player sees them (baya left, dayan right) and
  lights the zone of each stroke (kinar, maidan, the syahi's edge, the syahi, or the whole head for a
  flat hand) with a ripple when the stroke rings; words under each head name the zone, the fingers and
  open / damped. The bol-to-stroke table is from NOTES "Bols" (kksongs khol lessons 2-4), the khol's
  and not the Carnatic mridangam's; a few spellings are mapped by assumption and marked unverified in
  `lib/bols.ts` (tin, ge/gi, khe, dhi). The screen re-renders only when the bol changes; Reanimated is
  not needed for it.
- **Vibhag marks** follow the kksongs khol course: X sam, 2 / 3 tali (a tali is an open baya stroke),
  0 khali. Bengali kirtan names such as "phāṅk" for khali were not confirmed and are not used.
- **Taals are data** (`taals`: name, bols one per beat with `-` for a rest and `te.re` for two bols in
  a beat, divisions, marks, level or all, placeholder, note, order, switched on). **A simple Guru
  editor is built** (list + form with a live grid preview), because the placeholders must be replaced
  by the Guru without SQL; coordinators read it. Three **placeholder** taals are seeded and marked so
  in the app: kksongs lesson 6's 8-beat kirtan rhythm, a 6-beat one with invented bols, and
  Dasapahira 16 (8+4+4, khali on 9) from kksongs lesson 10 with bols and marks to check.
- **S6.** The S5 timer starts with the first sound (or by hand), survives leaving the screen, and on
  Stop logs itself when it ran 1 minute or more (at most 240 minutes an entry; over 6 hours counts as
  forgotten). Students type in practice for a day of the last week; delete their own entries of the
  last 14 days. The database (`log_practice`) checks the minutes against the timer's start, at most
  12 hours and 20 entries a day. Weeks run from Monday (India).
- **Where it shows.** A "Practice" circle on the student ring (8 circles); a Practice block with 4
  weeks on S4 My progress (opens S6) and on C8 for staff (the coordinator sees a mentee's hours);
  a "Practice tools" button under the staff ring (the ring is full at ten).
- **Promotion criteria are unchanged** (#53). Practice hours could become a setting later
  (`practice_weeks` already gives the numbers).

**Why.** The approved V1 needs a player, and a drifting metronome teaches the wrong time. The audio
clock (web) and a hardware-looped buffer (phone) keep time without depending on JavaScript timers.
Taals as editable data let the Guru put in the real ones without an app update.

**Consequences.** Migration `0018_practice.sql` (run on TEST as 0016_practice).
**expo-audio** came with this slice (#52 chose it for the next planned APK): the Android
fingerprint changes, so from the Phase 2 merge on, main's JS reaches only the next APK (#55);
sound on phones is tested with that APK. Not in this slice (slice 4, native): V3 player controls
(mirror, 0.5x / 0.75x, A-B loop: a WebView or expo-video), "record myself", in-app recording for
assessments. The Telugu and Hindi lines are drafts (TRANSLATIONS.md).

## 55. Phase 2 merges into main; one new APK carries every native package it needs — 3 Oct 2026

**Context.** Phase 2 slices 1-3 (assessments, promotion, practice tools) were built on their own
branches, with migrations 0012, 0014_promotion and 0016_practice and DECISIONS #43, #45 and #49,
while main took 0013-0015 and #44-#51 for Phase 1 rounds 7-9. Praveen decided on 3 Oct 2026 (in the
lead chat) to merge all three slices into main now and build a new APK. expo-audio (slice 3) changes
the Android fingerprint, so after the merge no update from main reaches the installed APK f9a084aa
(fingerprint 38ce7d9d). Round 9 was published to that APK first (update bf11f742 "Round-9").

**Decision.**
- **Renumbered after main's last**, in the order the slices were built: migrations 0012_assessments
  → **0016_assessments**, 0014_promotion → **0017_promotion**, 0016_practice → **0018_practice**
  (git mv; the SQL is unchanged, only the header comments), and DECISIONS #43 → **#52**, #45 →
  **#53**, #49 → **#54**; each entry says its branch number. #43 stays unused on main. Main's own
  #44-#51 keep their numbers and meanings. No object of 0016-0018 is defined in 0013-0015 too, so
  running them after 0015 ends in the same database as TEST, which ran them in branch order.
- **TEST runs only the new 0019; LIVE runs 0013 to 0019 in number order** (OPERATIONS.md).
- **Phase 2 notices join the inbox** in a new migration, **0019_phase2_inbox.sql**, so the renamed
  files stay as TEST ran them: a trigger copies every `push_outbox` row into `notifications`, with a
  kind from the screen it opens; the last 30 days were copied in. The inbox opens the same screens
  as the push (assessment, recording to review, nomination, My progress). 0019 also writes the table
  descriptions that named the branch numbers again with #52-#54.
- **One APK for all of Phase 2's native needs** (lead chat, 3 Oct 2026), because builds are slow
  and limited: expo-audio (playing and in-app recording; microphone text "Mridanga Seva uses the
  microphone only when you record your practice or an answer.", recording on Android) with its peer
  expo-asset; **expo-location** (G9's attendance area: "while using the app" only, no background
  location, no foreground service); **react-native-webview** 13.16.1 (slice 4's lesson video
  controls); **expo-keep-awake** (screen on during the metronome, taal player and timer);
  **expo-sharing** (CSV reports, files, an .ics "add to calendar" file, instead of expo-calendar);
  **expo-screen-orientation** (lesson video and two-head view in landscape while the app stays
  portrait); **expo-haptics** (a metronome vibration option); the image picker may record video
  with sound (a microphone text instead of `false`); expo-camera stays QR-only, no audio. Packages
  not used yet only need to be in the APK. expo-audio keeps its default background playback
  (Android adds a media-playback foreground service, so the metronome can play with the screen off).
- **Not wired yet:** the phone-side check against a centre's area (G9 stores it, #51). Attendance is
  marked on the coordinator's phone by scanning the student's QR, so the check would run there;
  whether it warns or blocks is a product choice. It can come as an update to the new APK.

**Why.** Merging now stops the branches drifting from main (three numbering clashes in one day)
and lets one APK carry what Phase 2 needs, so the volunteers install once.

**Consequences.** Android fingerprint **185e839f**. From the merge on, updates from main reach only
APKs built from it; phones on f9a084aa keep round 9 until they install the new APK. Phase 2 screens
appear on the web version with the next test-site export. The Edge Function `notify-announcements`
from the Phase 2 branches is on main and must be deployed again to TEST and LIVE. Slice 4
(branch phase2-media) takes migrations from 0020 when it rebases on this merge.

## 56. Media: the lesson-video player in a WebView, recording in the app — 3 Oct 2026

**Status: decided by Praveen 3 Oct 2026 (answers at the end), on the branch `phase2-media`, rebased on
main after the Phase 2 merge (#55); not on main until the lead pushes it.** On the branch this entry
was #52 and Assessments was #43; on main Assessments is #52, which is what "#52" below means.

**Context.** The Screen List doc approves V3 (mirror, 0.5x / 0.75x, A-B loop, tap a pane to zoom) and
V2 (lessons filmed from 2-3 phones and joined side by side). Lessons are unlisted YouTube links
(`materials`). #52 put recording in the app into the next planned APK (expo-audio, added in slice 3),
and left the coordinator's voice note on C14 waiting for it. S5 in the doc lists "record myself".

**Decision.**
- **One player page, in a WebView.** expo-video (SDK 57) plays files and streams (HLS, DASH), not
  YouTube links, and pulling a stream out of YouTube breaks its terms. So V3 is one HTML page
  (`lib/lesson-player-html.ts`) in an OS WebView on phones (**react-native-webview**, the one new
  native package; in the next APK, already on the merge's list) and in an iframe in the browser.
  YouTube plays in its own embedded player through the IFrame Player API; the team's own video file
  plays in a `<video>` element in the same page. expo-video is not needed.
- **YouTube's terms decide what each kind may do.** YouTube's developer policies (III.I: no
  modifying the player or the video, no background playing) and its Required Minimum Functionality
  (no changes to the player not in the API documentation, nothing drawn over it, at least 200 x 200
  px, the app identified by its Referer) allow speed and seeking, which the API offers, but not
  mirroring or zooming the picture. So a **YouTube lesson** has speed, ±5 s and the A-B loop, the
  controls under the player, and a line saying why mirror and zoom are missing, with Open in YouTube.
  A **video file** (new material kind `video`: an https link to the team's own .mp4 / .webm / .m4v /
  .mov, with 1-4 camera angles side by side) also has mirror and tap-a-pane zoom. The video leaves
  the screen paused.
- **Speed** offers 0.5x / 0.75x / 1x when the video offers them (YouTube lists its own rates). The
  **A-B loop** runs inside the page, so the bridge's delay does not shift it.
- **Recording** uses expo-audio (mono, 96 kbit/s: .m4a on phones, about 0.7 MB a minute; .webm in the
  browser). A take is heard before it is used and uploaded only when the form is sent. **S7**: "Record
  here", up to 20 minutes, into the same bucket within #52's 50 MB and 10-a-day limits. **C14**: a
  voice note, up to 5 minutes, sent with the review; a redo needs a comment or a voice note; it is
  deleted with the recording (#52 keep time). Coordinators may now upload audio into their own folder,
  10 files a day.
- **Record myself** (S5): recordings stay on the phone (the newest 30, never uploaded; in the browser
  only until the page is closed). "With the sound" starts the chosen metronome or taal from beat 1 as
  recording starts and stores what played, so "Play with the sound" starts both together and a late
  stroke is heard against the beat. Headphones keep the click out of the recording. A student can
  **send a take to an assessment** waiting for them: it opens S7 with the take attached, to listen to
  and send (uploaded only then, within the same limits).

**Why.** One page in a WebView covers both kinds of lesson with one code path that the browser can
check. Following YouTube's terms keeps the team's channel and the app safe; the team keeps the
mirror and zoom it asked for by keeping its own copy of the multi-angle lessons. Recording in the app
replaces the WhatsApp round trip for assessments and feedback.

**Consequences.** Migration `0020_media.sql` (TEST ran it as 0017_media.sql): `materials.kind`
`video` + `panes`, `assessment_submissions.voice_note`, `review_submission` with `p_voice_note`,
Storage rules and keep time (DATABASE.md "Media"). Smoke tests pass (section "media"). Phone tests
with the next APK (react-native-webview, expo-audio): see NOTES.md "Phase 2 slice 4". YouTube could
not be checked from the office network (FortiGate breaks TLS to youtube.com); its page logic was
checked against a stand-in player, and a real YouTube check needs a hotspot or the phone.

**Praveen's answers (3 Oct 2026).** (1) The team's own lesson video files go to **Cloudflare R2**.
Its free tier is 10 GB-month of storage, 1 million writes and 10 million reads a month, and no
charge for downloads; but R2 is a paid product with a free allowance: it can only be switched on
with a payment method on file (a card or PayPal; Cloudflare checks it with a temporary hold of about
US$5, not a charge), and use above the allowance is billed, not stopped. For the pilot the public
r2.dev address works but is rate-limited and meant for development; for real use Cloudflare wants
the bucket behind a domain on Cloudflare (a domain costs about a few hundred rupees a year). Videos
are uploaded in the Cloudflare dashboard, and the link is pasted into G5 as a Video file. (2) The
limits stay as built. (3) Sending a Record-myself take to an assessment: yes, built (above); it uses
the existing Supabase bucket and needs no paid plan.

## 57. Ishtagoshti part 1: sloka study for everyone signed in — 3 Oct 2026

**Status: decided by Praveen 3 Oct 2026 (answers below), on the branch `phase2-ishtagoshti`; not on
main until the lead pushes it.**

**Context.** The Screen List doc approves Ishtagoshti I1-I15: a thematic study of Sanskrit slokas,
a tab for every role, with the daily sloka moved into it. The team's answers of 28 Sep 2026: the
translation is the **temple senior devotee's own** (no BBT text), and Ishtagoshti should be free to
anyone (public sign-up I14, which needs consent wording: slice 7). Slice 6 builds the core for people
who already have a login.

**Decision.**
- **Screens:** I1 home (sloka of the day, my memorised count, themes, all slokas), I2 a theme, I3 a
  sloka, I11 theme editor, I12 sloka editor, as a "Slokas" tab for students and staff. Staff phones
  keep five bottom tabs (a sixth label does not fit: "Attendance" needs 62 px, Telugu "Students" 65 px,
  in a 53 px slot at 375 px), so there the staff home has an Ishtagoshti button; the staff sidebar on
  a wide screen has the tab. Later
  slices: I4 memorise mode, I5 discussion + I8 moderation, I6 / I9 sessions, I10 recitation review,
  I13 report, I14 / I15 public sign-up and subscribers.
- **Who edits (Praveen):** the Guru, and the coordinators the Guru marks as **Ishtagoshti editors** on
  G2 (`profiles.ig_editor`, a permission like the treasurer flag, not a role). Everyone signed in with a
  role reads the published slokas and themes; drafts are for editors.
- **Translator credit (Praveen):** per sloka, "Translation and purport: name". The name is typed
  once in G10 Settings as the default and can be changed on a sloka.
- **Sloka of the day (Praveen):** automatic, the published slokas in turn, the same for everyone on
  a day in India; an editor can pin a sloka to a date.
- **Extras in this slice (Praveen):** private notes on a sloka (only the writer reads them), an "I
  have memorised it" tick (I1 counts them; staff may read the ticks for the later report), and a
  recitation audio (recorded in the app or an audio file, 10 MB).
- **Copyright:** the Sanskrit verse and its transliteration are free; translation, word meanings and
  purport must be the temple's own. The editor confirms that on each sloka, and the database refuses
  to publish without it. Text is kept per language (English, Telugu, Hindi); a reader sees their own
  language, else another one, marked.
- **Samples:** three SAMPLE slokas (BG 10.9, Upadeśāmṛta 4, Śikṣāṣṭaka 3) and two SAMPLE themes,
  marked Sample. Their meanings and translations are short placeholders written for the app, not the
  temple's and not BBT's; the team replaces them in the app.
- **Ready for slice 7:** reading is decided by one function, `ig_reader()`, to which slice 7 adds its
  subscribers; notes and ticks hang on the login, not on a student record.

**Why.** The temple's own text avoids the BBT copyright question entirely. A named-editor flag lets the
senior devotee (or a typist) enter slokas without making them Guru, and without every coordinator
editing scripture. Rotation keeps I1 alive every day without daily work; pins let the Guru match a
festival or the week's Ishtagoshti.

**Consequences.** Migration `0021_ishtagoshti.sql` (DATABASE.md "Ishtagoshti (Phase 2)"); it
redefines `guard_setting` with the key `ig_translator`, so any later redefinition must keep it.
Smoke tests pass (section "Ishtagoshti (0021, Phase 2)"). No native package: the Android fingerprint
stays 185e839f, so phones on the new APK get it by an update. Telugu and Hindi strings are drafts
for the review (TRANSLATIONS.md).

## 61. Events and polls: C16, C17, and the student side S11, S12 — 5 Oct 2026

**Status: decided by Praveen 3 Oct 2026 (answers below), on the branch `phase2-events`; not on main
until the lead pushes it.** Numbers reserved by the lead: migration 0022, DECISIONS #61-#64 (only #61
used).

**Context.** The Screen List doc approves C16 Events ("Create, RSVP list, assign performers, mark event
attendance") and C17 Polls ("Create, choose audience, deadline, anonymous option, results"). S11
(events: list, detail, RSVP, add to calendar) and S12 (polls: vote and see results) have no team pick
yet, but an RSVP list and poll results need someone to answer and vote, so they are built with C16 and
C17, as S7 was with the assessments (#52). S1's row in the doc already names "next event".

**Decision.**
- **Events:** coordinators and the Guru create one with a title, start (and an end on the same day), a
  centre and/or a place, an audience (the announcement audiences: all students, one level, my mentees,
  staff, a group) and a description. The author or the Guru edits, cancels with a reason, or deletes it
  while nobody has answered. The audience is fixed once someone answered.
- **Answers:** everyone it is for answers Going / Maybe / Not going and can change it until the
  start. **Students see the counts, staff the names (Praveen).**
- **Performers and attendance (Praveen: build both now):** staff pick student records (also students
  without the app) with a part (Mridanga, Kartal, Lead singer, Harmonium or typed); new performers are
  told. From the event's day on, staff tick who came.
- **Polls:** a question, 2-6 answers, one choice, an audience, a closing time; staff choose
  **anonymous** or not and **results after voting or only after closing**. A vote can change until
  the poll closes (or is closed early). Answers, anonymity, the results rule and the audience are
  fixed after the first vote.
- **Anonymous (Praveen):** staff see **who** voted, not what, so they can remind the rest; nobody in
  the app (the Guru included) sees a person's choice. Votes are not readable from the app at all, only
  through functions. Found in the browser check: live counts next to the "who voted" list would show
  who chose what (one person votes, one count goes up), so **in an anonymous poll staff see the counts
  only after it closes**, like everyone. With very few voters the closed result can still give a choice
  away; that is the nature of a small class.
- **Reminders (Praveen: all three):** the day before an event at 09:00 IST to those going or maybe;
  within 24 hours of a poll's closing to those who have not voted; and a Remind button for staff (those
  who have not answered or voted), once in 12 hours.
- **Add to calendar (#55):** no expo-calendar and no calendar permission. An .ics file (RFC 5545),
  shared through expo-sharing on the phone and downloaded in the browser (iPhone Safari offers "Add to
  Calendar"), plus a Google Calendar link that opens the event ready to save.
- **Notices:** new event, new time or place, cancellation, your part, reminders, new poll — through
  push_outbox, so the inbox has them too (kinds `event` and `poll`).
- **Entry:** the Events circle of both rings (was "coming soon") is now "Events & polls": one screen
  with an Events tab and a Polls tab. S1 shows the next event and "Polls waiting for your vote".

**Why.** The audiences, notices and inbox already exist and are trusted; reusing them keeps one idea of
"who it is for" across the app. Student records for performers and attendance count the students
without a phone, who are many. Keeping votes away from every app query is the only way "anonymous" can
mean what it says.

**Consequences.** Migration `0022_events_polls.sql` (DATABASE.md "Events and polls (Phase 2)"); TEST
ran it as `0021_events_polls.sql` plus a one-function patch (`poll_state`). The Edge Function
`notify-announcements` accepts the event and poll screens; until it is redeployed, the inbox gets the
notices but phones get no push for them. No native package: the Android fingerprint stays 185e839f.
Not done: event photos, a results notice when a poll closes, reminders at another hour, multi-choice
polls. Telugu and Hindi strings are drafts for the review (TRANSLATIONS.md).

## 65. Team tools: suggest material, inventory, duty roster — 3 Oct 2026

**Status: decided by Praveen 3 Oct 2026 (four answers below), on the branch `phase2-team-tools`; not
on main until the lead pushes it.** Numbers #57-#64 are held by slices 5 and 6.

**Context.** The Screen List doc approves C18 "Suggest material: upload goes to the Guru for
approval", C19 "Inventory: issue and return mridangas and other items, condition check", C20 "My
duty roster: my shifts in the 14:30-20:00 window", and G2 lists the duty roster for the Guru. Phase 1
left `materials.approved_by` empty for a coordinator's suggestion (0001) and wrote duty hours as free
text (`profiles.duty_hours`, #45). The research table in NOTES.md gives the instrument kinds (clay
khol, fibreglass Balaram / Tilak, fibreglass body with skin heads, brass) and the care rules.

**Decision (Praveen's answers, 3 Oct 2026, all four as proposed).**
- **C18: coordinators suggest; the Guru decides.** A coordinator adds a material with the same form
  as G5 (YouTube link, video-file link, PDF or photo, up to 10 a day) and an optional reason. It waits
  unseen by students. The Guru reviews it on the same form (may change the title, level or item),
  then **Add to lessons** (it becomes an ordinary approved material) or **Decline** with a reason
  the coordinator sees. Both sides get a notice. The coordinator may take back a waiting suggestion
  and remove a declined one with its file. Students do not suggest.
- **C19: the Guru adds items, coordinators lend.** The Guru adds an item (kind, name or number as
  written on it, notes, condition now), edits it, retires it (not while lent) or deletes one added by
  mistake (never lent). Any coordinator or the Guru lends an item to a student (with or without a
  login) or a coordinator, with the condition seen, an optional note and bring-back date, and takes
  it back with the condition seen. Condition: **Good / Needs care / Damaged / In repair**; a note is
  needed for anything but Good; only Good or Needs care items go out; a condition check can be
  recorded any time. Every condition seen is kept (history on the item); "Damaged" tells the Guru.
  A borrower sees what they hold on My profile; C8 shows a student's items on loan.
- **C20: the Guru plans; everyone on a shift is reminded.** A shift is a date, a centre, a time
  inside the centre's open hours, an optional duty ("Desk and attendance"), and the coordinators on
  it; a new shift can repeat weekly for up to 12 weeks (each week its own shift). Coordinators see
  "My shifts" and the whole roster for 4 weeks. At 18:00 India time the evening before, everyone on
  a shift gets an inbox notice and a push (once; again if the date or start time changes).
  `profiles.duty_hours` (G2) stays as the usual-hours line.

**Why.** Suggestions reuse the materials table and form, so an added suggestion is simply a lesson,
with no copy to keep in step. One open loan per item and conditions written only through checks,
loans and returns keep the inventory honest without an admin. The roster is the Guru's plan, as in
G2; reminders come through the push queue and inbox the Phase 2 notices already use (#55).

**Consequences.** Migration `0023_team_tools.sql` (DATABASE.md "Team tools"): materials columns and
guard for suggestions, coordinator uploads to `material-files`, `inventory_items`, `inventory_loans`,
`inventory_checks`, `duty_shifts`, `duty_assignments`, the functions and the pg_cron job
`mridanga-duty`. The Edge Function `notify-announcements` accepts the three new screens and must be
redeployed on TEST (and later LIVE) for the pushes; the inbox works without it. No native change:
the Android fingerprint stays 185e839f. The Instruments circle on the staff ring is no longer
"Coming soon".

## 70. Check-ins are checked against the centre's area, saved anyway and flagged — 3 Oct 2026

**Status: decided by Praveen 3 Oct 2026; branch `fix-gps-back`, migration `0024_attendance_location.sql`
(numbers 0024 and #70-#71 reserved by the lead; slices 5, 6, 8 hold 0021-0023 and #57-#69).**

**Context.** #51 stored each centre's point and radius (G9) and left the phone-side check for the
APK with expo-location. APK 0bfc5c14 has it (foreground only, #55), but no code used it: the phone
showed no location prompt. Attendance is marked only on staff phones: the coordinator scans the
student's My QR, or taps the name (C5, C8); students scan nothing.

**Decision.**
- **When:** every **check-in** by a coordinator or the Guru, by scan or tap (C5, C8). The position
  of the **marking phone** is checked; students' phones are never asked. Check-outs, Check out all
  and the nightly job are not checked.
- **Permission:** foreground only, asked the first time a student is checked in; app.json's text
  says why (only while the app is open, to confirm you are at the class). C5 says the same under the
  scanner and, after a refusal for good, how to allow it in the phone's settings.
- **Never blocks:** outside the area, permission refused, no fix within 8 s (indoors, location off)
  or a browser without location: the visit is **saved and flagged**, with the reason (and the
  distance in metres when outside). A fix is reused for 2 minutes and C5 warms it up on opening, so
  the queue at the door is not slowed. The web version uses the browser's location.
- **Inside** = within the radius plus the fix's own accuracy, at most 100 m of it (a phone indoors
  often reports ±30-80 m). A centre without a point gives `no_area`, not a flag.
- **Privacy:** the phone sends its position with the call; the database computes the distance
  (`visit_location_result`, haversine) and keeps only `visits.location_check` and
  `location_distance_m`, never the position. The result is written once by `toggle_visit`; the app
  cannot change it (`visits_location_guard`), staff may still correct the times.
- **Who sees it (Praveen's pick):** the result card on C5/C8 says "flagged for the facilitator";
  **C6 Who is here now** and **S9 visit history (staff view)** show a red line on the visit; **C21/G8
  reports** count flagged check-ins in total, by reason and per student, and the CSV has a column.
  The student's own S9 does not show it.

**Why.** Praveen chose to allow and flag rather than block: a weak signal indoors must never stop a
student from being marked, and the Guru can look into repeated flags. Checking the marking phone
fits how attendance is taken today; a student self check-in would be a new feature.

**Consequences.** `toggle_visit`, `scan_qr`, `mark_visit` get a `p_location jsonb` parameter (default
null = not checked, so an older app or the old test site still works); `class_report` gains the
flag counts. TEST and LIVE run 0024 (after 0021-0023 when those land). Phone check after the lead
publishes: prompt appears once, a check-in at the centre is not flagged, one far away is.

## 71. Back never leaves a blank screen — 3 Oct 2026

**Context.** On APK 0bfc5c14 + update "Slice-4", Praveen sometimes got a black screen after the
phone's own Back, which stayed until the app was closed. react-native-webview shows a fullscreen
video (YouTube's fullscreen button on V3) by laying a black view over the whole activity; the
phone's Back went to the navigator, which closed the lesson screen underneath, and nothing removed
the black view. Back buttons on three screens (C11, G3 import, G5) also called `router.back()` without a fallback, which has nowhere
to go on a screen opened from a notification or a reload.

**Decision.** The player page reports fullscreen on and off; while it is on, the frame catches the
phone's Back and only leaves fullscreen, and leaving the screen leaves fullscreen too. Every Back
button calls `goBackOr(parent)` (`lib/go-back.ts`) or the same `canGoBack() ? back() : replace()`
pattern already used elsewhere.

**Consequences.** JS only; the fingerprint stays 185e839f. To confirm on the phone after the
update: lesson video → fullscreen → phone Back returns to the lesson, Back again returns to the list.

## 72. A switched-off login is refused everywhere, also where the role is NULL — 5 Oct 2026

**Context.** `my_role()` is NULL for a switched-off login and for a login without a profile.
`toggle_visit` (0001, again in 0024) refused with `if my_role() not in (...)`; `NULL not in (...)` is
NULL, and an IF treats NULL as false, so the refusal never ran. A switched-off coordinator or
student could check children in and out through `scan_qr` and `mark_visit`, and reactivate Left
students. A sweep of every migration found no other current function with the pattern.

**Decision.** Role checks are written NULL-safe: `if not coalesce(my_role() in (...), false)`
(`is_guru()` and `is_staff()` already were). Migration 0025 replaces `toggle_visit` and `scan_qr`
(scan_qr now checks before the lookup, so a switched-off login cannot probe codes). The door tablet
role `kiosk` keeps check-in by QR and nothing else.

**Consequences.** smoke-test.mjs checks a switched-off coordinator, a switched-off student, a login
without a profile and a kiosk login. New functions must follow the pattern (CONTRIBUTING).

## 73. Only the linking functions attach a login to a student record — 5 Oct 2026

**Context.** The staff update policy on `students` has no column limits, so a coordinator could set
`profile_id` to any login (or clear it and set another email in one update), and that login then
read the child's record and became a student without the Guru. `qr_token` and `created_by` were
equally open.

**Decision.** A BEFORE trigger `students_frozen_guard` (0025), for app users only (`current_user`
anon or authenticated, as 0014's guards), refuses changes to `profile_id`, `qr_token`,
`created_by`, `created_at` and the withdrawal fields (`student_field_locked`), and a student without
a date of birth (`dob_required`). Its name sorts before `students_link_login`, so saving an email on
a record without a login still links (0002); only the definer paths change `profile_id`:
confirmation linking (0002), `link_student_login` (0014) and the new Guru-only
`unlink_student_login`. A level change stays the Guru's (0017) and is now kept in `level_history`
when made on the table directly. A deleted record's login goes back to `pending`. A student's own
record (and through it own visits, ticks and level history) is readable only while the login is
an active student.

**Consequences.** No app screen wrote these columns, so nothing in the app changes.

## 74. The consent register is insert-only and checked at commit — 5 Oct 2026

**Context.** #16 promised "no minor without consent", but the check ran only when a student was
added or the date of birth changed. A coordinator could delete or revoke a minor's consent, move it
to another student, or insert a back-dated one "verified by" the Guru, with no trace; the
"parent signed the paper form" tick (C3) never reached the database.

**Decision (Praveen 5 Oct 2026: the tick keeps its wording and is required).**
- App users add consents only: `verified_by` and `given_at` are set by the server, `revoked_at` and
  `otp_verified_at` start empty, a written consent needs `signed_form = true`
  (`written_consent_required`). Nothing else changes afterwards (`consent_locked`), except that
  the Guru may revoke a consent once. Deleting a consent is the Guru's.
- A deferred check (`consents_minor_recheck`, `guardians_minor_recheck`) refuses, for everyone, any
  change that leaves a minor on record without a current data consent or without a guardian; only a
  withdrawal (#75) may, because it marks the record first.
- `register_student` gains `p_written_consent` (required for a minor) and stores it; the app sends
  the tick it already shows. Consents written before 0025 have `signed_form` NULL (unknown).
- Consents and guardians are audited (`audit_row`) and appear in G11.

**Consequences.** Migration and app update go out the same day: between 0025 and the update, a
minor cannot be registered from an old app (adults are not affected).

## 75. Withdrawing consent freezes the record — 5 Oct 2026

**Context.** Revoking consent in the dashboard (OPERATIONS) stopped nothing: attendance, calls,
edits and pushes went on.

**Decision (Praveen 5 Oct 2026: Guru only; freeze, erase later).** `withdraw_consent(student, note)`
(Guru in the app, or the owner in the SQL editor) marks `students.withdrawn_at` / `withdrawn_note`,
revokes every consent of the student, closes an open visit and open call tasks, switches the login
off and deletes its push tokens. A withdrawn record refuses edits, visits, calls and ticks
(`student_withdrawn`), and the daily job's call tasks for it are dropped. History stays until the
Guru erases the record (#76) or the parent consents again (OPERATIONS "Consent withdrawal").

**Consequences.** The students and consents audit rows written by the call are the proof. No app
screen yet: the Guru runs it in the SQL editor.

## 76. A student can be erased, audit copies included — 5 Oct 2026

**Context.** Deleting a student cascaded the rows but wrote a full copy of each into `audit_log`,
which nobody could purge; the login, its profile and push tokens survived.

**Decision (Praveen 5 Oct 2026: Guru only; the login goes too).** `erase_student(student, reason,
request_ref)` (Guru in the app, or the owner in the SQL editor): forgets the phones, deletes past
instrument loans (an open loan stops it: `open_loan`), deletes the record (cascade), deletes the
login from `auth.users` (falls back to the profile if not allowed), and only then blanks
`old_row` / `new_row` of every audit row whose id or values hold the student id, login id, QR token
or email. The skeleton (table, action, time, who) stays. A tombstone in `erasures` keeps the roll
number, time, Guru, reason and request reference. It returns the Storage paths (photo,
recordings) for the runbook to delete by hand.

**Consequences.** smoke-test.mjs sweeps every table and audit_log for the child's name, ids, QR
token, email and parent's details after an erasure and finds none. OPERATIONS "Erasure request".

## 77. anon holds no right in public; a grant sweep test guards it — 5 Oct 2026

**Context.** Supabase gives anon (no login) every right on new tables, sequences and functions in
`public`. Row-level security kept tables closed (no policy names anon), but 0023's five tables, for
example, answered anon with 200 and no rows. Several helpers were executable by anon.

**Decision.** 0025 revokes every table and sequence right from anon, and the default rights for new
tables and sequences. For functions, EXECUTE is revoked from PUBLIC and anon on every function the
migration's role owns (not extensions'), keeping what authenticated and service_role had. New
functions still get EXECUTE through PUBLIC (that default cannot be changed per schema, and changing
it globally is too wide), so supabase/tests now runs a **grant sweep**: anon has no right on any
table, view or sequence and may run no non-trigger function; a pending login reads no row of any
table or view except its own profile and the lists open to every signed-in person (settings,
centres, levels, syllabus items, groups); listed internal functions are closed to authenticated.

**Consequences.** Every new migration revokes its functions from `public, anon` (#14), or the sweep
fails. anon reading a table now gets "permission denied" instead of no rows.

## 80. Class fund ledger: who records, who approves, nothing deleted — 5 Oct 2026

**Status: decided by Praveen 5 Oct 2026 (four answers below), on the branch `phase2-fund`; not on
main until the lead pushes it.** Numbers #72-#79 are held by the security round (migration 0025).

**Context.** The Screen List doc's fund section (F1-F10, approved by the team, rev 89) asks for a
transparent in/out ledger with maker-checker (the recorder is not the approver). The team said on
28 Sep 2026 that the fund is the **Mridanga team's own** (not the temple's), and #11 made the
treasurer a permission on a coordinator (`profiles.is_treasurer`, in the schema since 0001, unused
until now). Open until now: who sees the ledger, who grants the treasurer flag, the approval limit,
the categories, when a bill is needed.

**Decision (Praveen's answers, 5 Oct 2026).**
- **Who sees it: the Guru, the treasurers and every coordinator** (coordinators read only). Students
  and parents see no money at all: no screen, and the database refuses their reads.
- **Treasurer:** the existing flag, switched by the Guru in G2 (person page), coordinators only. A
  treasurer records entries and reverses them; only the Guru and treasurers ("keepers") write.
- **Approval (maker-checker): expenses over Rs 2,000 wait** and count in the balance only once
  approved. The Guru approves or declines (with a reason); an entry the Guru made is approved by a
  treasurer (or another Guru). **Nobody approves their own entry** (error `own_entry`). The maker may
  withdraw their own waiting entry. A reversal over the limit waits the same way.
- **Bills: a photo or PDF of the bill is required for an expense over Rs 500** (10 MB, as the
  materials; private bucket `fund-bills`). Both limits are G10 settings in whole rupees
  (`fund_approval_rupees`, `fund_bill_rupees`; 0 = every expense).
- **Categories:** income Donation, Sponsorship; expense Instrument repair or purchase, Prasadam,
  Events and festivals, Travel, Printing and stationery, Other. The Guru adds own ones and retires
  any; none is deleted.
- **Never deleted, never changed.** An entry, once saved, changes only by a decision. A mistake is
  undone by a **reversal**: a counter-entry dated today with the same kind and category and the
  amount negative, with a reason. The database refuses delete and change even from the dashboard
  (trigger `fund_entries_keep`); every row change is also in the audit log (G11).
- **Records money only.** No payment integration, no money moved online; donors pay the temple or
  team account as before and the keeper records the reference (UPI, cheque, temple receipt). No 80G
  receipts (NOTES.md 28-09-2026). Amounts are whole paise (integers), at most Rs 1 crore an entry;
  dates up to a year back, never in the future.

**Consequences.** Migration 0026_fund.sql (tables `fund_categories`, `fund_entries`, functions
`record_/decide_/withdraw_/reverse_fund_entry`, `fund_balance`; notices to `/staff/fund/<id>` through
push_outbox, so the push function needs a redeploy for pushes, the inbox works without). Screens:
`/staff/fund` (balance, waiting for me, entries of a period with the balance after each, month by
month, CSV like C21/G8), `/staff/fund/[id]` (record; approve / decline / withdraw / reverse),
`/staff/fund/categories` (Guru), a "Class fund" row on both staff homes, the treasurer switch in G2,
the two limits in G10. JS + SQL only: the fingerprint stays 185e839f. Not built (F-section items for
later): donors and sponsors lists, pledges, sponsorship needs per event.

## 88. Ishtagoshti part 2: free public sign-up, parent's code by email, the Guru's subscriber list — 5 Oct 2026

**Status: decided by Praveen 5 Oct 2026 (answers below), on the branch `phase2-ishtagoshti-public`;
not on main until the lead pushes it. The consent and notice texts are PLACEHOLDERS until the team
gives the wording.**

**Context.** The team wants Ishtagoshti free to anyone (28 Sep 2026; I14 public sign-up, I15
subscribers for the Guru). Anyone could already create a login (A1); it waited on the pending screen
with no access. A public member must read the slokas and nothing of the class: no students,
announcements, attendance or staff data. Some will be under 18, and India's DPDP Rules 2025 (rule 10)
ask for verifiable consent of a parent before a child's data is processed.

**Decision.**
- **A subscriber is a flag, not a role.** The login keeps role `pending`, which every existing rule
  refuses, and gets a row in `ig_subscribers`. `ig_reader()` lets a pending login read when it has
  such a row, is not blocked and, under 18, its parent has confirmed. Nothing else learns a new role.
  A new value of the `app_role` enum was rejected: every policy that trusts "authenticated" or
  `my_role()` would have to be checked again, and Postgres cannot use a new enum value in the same
  transaction that adds it (the SQL editor runs a file as one).
- **Joining (I14, Praveen):** after sign-in and a confirmed email, from the pending screen. Name and
  email come from the login; plus the **year of birth** (in the year one turns 18 the form asks about
  the birthday) and an **optional phone**. The person agrees to the notice; its version is stored.
- **Under 18 (Praveen):** the parent's name, email and relation; the database emails the parent a
  **6-digit code** (valid 24 hours, 5 tries, at most 3 a day per child and 100 a day for the app);
  reading opens when the child types it. Before that nothing opens. The email goes from the database
  through pg_net to Brevo's mail API (the Brevo key and sender in the Vault), like the push call of
  #33; without them the app says parent emails are not switched on yet. A year of birth under 18
  cannot later be changed to 18 or older.
- **Wording (Praveen):** placeholders marked "TEST — the team's wording comes here" in en/te/hi, for
  the notice, the parent text in the app and the email. `IG_TERMS_VERSION` / `terms_version`
  record which text was agreed; change both when the team's text arrives.
- **Who blocks (Praveen):** the Guru only, with an optional reason only the Guru sees. I15 also shows
  the counts and joins per week. Sign-up is open on the web test site too.
- **Less data in fewer hands:** coordinators no longer see public subscribers' profiles or memorised
  ticks; "Leave Ishtagoshti" deletes the details, notes and ticks (a blocked person keeps only the
  block, so leaving does not undo it).
- **Found on the way:** 0001 let any signed-in login read settings, centres, levels and the syllabus
  (`using (true)`), so also a login still waiting for a role. Now only logins with a class role (Guru,
  coordinator, student, door tablet).

**Why.** Keeping the role `pending` makes the safe answer the default: a forgotten policy refuses a
subscriber instead of letting one in. The smoke test proves it with a sweep: as a subscriber it reads
every table and view, writes to every table and bucket, and calls every function a signed-in login
may run; only Ishtagoshti reading and its own rows answer. A code to the parent's email is the
lightest verifiable consent that needs no paid SMS and no visit; the class's written consent (C3)
stays for students.

**Consequences.** Migration `0027_ishtagoshti_public.sql` (DATABASE.md "Ishtagoshti subscribers").
Smoke tests pass (section "Ishtagoshti public sign-up (0027, Phase 2)"). No native package: the
fingerprint stays 185e839f. Before real use: the team's wording; a Brevo account, its API key and a
verified sender in the Vault (OPERATIONS.md "Parent codes by email"); "Confirm email" ON (joining
needs a confirmed email, else anyone could join with someone else's address). Not built: erasing the
login itself (Supabase Auth admin), a notice to the Guru on a new join, I4-I13.

**Rebased on the security round (6 Oct 2026).** Its consent register (#74) belongs to a student record
(`consents.student_id`); a public subscriber has none, so the parent's confirmation stays in
`ig_subscribers.parent_confirmed_at`, set only by the server like #74's `given_at`, with the code as
the proof. 0025 changes none of 0027's rules. Its pending-login sweep now also covers settings,
centres, levels and the syllabus, which 0027 closes to logins without a class role.

## 96. A student login needs a student record — 6 Oct 2026

**Context.** Every rule asks `my_role()`, which read only `profiles.role`. A login whose role says
`student` but which no student record points at (the record unlinked or deleted outside the app, or
the role set in the dashboard) kept the student's reach: announcements "to everyone" and their
photos, staff names, push tokens and pushes, events, the inbox. 0025 sends a login back to `pending`
when its record is deleted or unlinked through the app, but not for other paths. Separately, the
materials policy (0001) asked only for the level, so any login (waiting, door tablet) read the
approved materials for all levels and opened their files.

**Decision.** Migration 0028: `my_role()` returns `pending` for a `student` login without a record,
so one change covers every rule that asks it. The audiences worked out for other people
(`announcement_audience`, which feeds pushes and the inbox, and `audience_profiles` for events and
polls) need the record too. Existing such logins are set to `pending` and their phones forgotten; a
trigger does the same when a record's `profile_id` changes. Materials need staff or a student.
**Praveen decided (6 Oct 2026):** a student marked Left keeps announcements, photos, materials and
pushes until the Guru switches the login off; only a login with no record loses them.

**Consequences.** smoke-test.mjs sweeps every table as such a login (nothing but its own profile and
the open lists) and checks announcements, files, audiences, staff names, pushes and materials.

## 97. A login's identity is frozen in the app; names cannot copy a staff member's — 6 Oct 2026

**Context.** The profile update policy has no column limits. Any login could rewrite its own
`email` (a stranger could pre-claim a volunteer's address before the volunteer signed up, so the
Table Editor showed two rows with that email), `created_at` and `centre_id`, and pick any name,
including the Guru's or one with invisible characters, which students then see as "posted by".
`profiles.email` also went stale when someone changed their sign-in email.

**Decision.** 0028 extends `guard_profile_details` (0013): for app users `id`, `email`, `created_at`
and `centre_id` are refused (`profile_field_locked`); the dashboard can still change them. `email`
follows `auth.users.email` through a trigger, which also links a waiting login to a record with the
new email (as on sign-up); copies rewritten earlier are put right once. **Praveen decided (6 Oct
2026):** everyone still edits their own name, but control and invisible characters are refused
(`name_invalid`; zero-width joiner and non-joiner stay, Telugu and Hindi use them) and so is the name
of the Guru or a coordinator, ignoring case and repeated spaces (`name_taken`). A phone has 7 to 15
digits (spaces and a leading + allowed). Role and active stay with 0014's `guard_profile_admin`.

**Consequences.** Roles are given in G2, or in the dashboard by the login's user id, not by email
(OPERATIONS.md). The A3 profile screen shows the two new messages.

## 98. A posted file cannot be swapped — 6 Oct 2026

**Context.** No bucket has an update policy, so a stored file cannot be replaced in place. But the
uploader of an announcement file could delete it and upload different content under the same name
while the announcement still listed it; readers saw the new content with no "Edited" mark (#27, #32).
Material files and Ishtagoshti recordings had the same gap. Fund bills (0026) and assessment
submissions (0016/0020) already refuse deleting a listed file.

**Decision.** 0028: a file name that an announcement, a material or a sloka lists cannot be uploaded
again (the upload rules check the listing). Deleting stays as it was, because the app removes an
announcement's files just before deleting the announcement; a file taken off by an edit is marked
Edited, and its name is free again.

**Consequences.** No app change. A listed file deleted on purpose shows as missing to readers; it can
no longer come back with other content.

## 99. A switched-off login loses its screens at once — 6 Oct 2026

**Context.** The app read the profile once, at start. A coordinator the Guru switched off kept the
staff screens and the QR scanner until the app restarted; the database refused their calls (#72),
but the screens showed an empty, misleading class.

**Decision.** The app (an update, no new APK) reads the profile again when it comes back to the
screen, when the login token is refreshed (about hourly), and when the database or Storage refuses a
call as not allowed (`42501`, `not_allowed`, a row-level security refusal), at most once in 10
seconds. The Supabase client's fetch reports such refusals (sign-in calls excluded). **Praveen
decided (6 Oct 2026):** a switched-off person then sees the existing "Account switched off" screen
with Check again and Sign out, not an automatic sign-out. A changed role moves the person to their
new area the same way.

**Consequences.** Without internet the remembered profile stays in use (#37, #42).

## 100. A minor keeps a guardian with a phone — 6 Oct 2026

**Context.** Registering a minor needs a guardian's name and phone (0003, 0025), and 0025's
commit-time check keeps a current data consent and a guardian. The consent-edge tests (audit
follow-up) found the only guardian's phone could still be cleared afterwards.

**Decision.** 0028: the commit-time check asks for a guardian with a phone, and also runs when a
guardian's phone changes. Tests now cover a dob edited to one day short of 18 (refused) and to
exactly 18 (kept), a 17-year-old added straight to the table, a guardian with a blank phone or no
name, and a minor's dob corrected to an adult's and back.

**Consequences.** #101-#103 were reserved for this round and are left unused.

## 104. Controls have an edge you can see — 6 Oct 2026

**Context.** #36 checked text colours only. The `border` colour was the only edge of a text field, an
unticked box and an unselected choice, at about 1.4:1 on the background in both schemes: near
invisible in sunlight or for low vision (WCAG 1.4.11 asks 3:1; audit D7-04).

**Decision.** A new theme colour, `controlBorder` (light `#8C7B6C`, dark `#8A7B6E`; 3.86-4.56:1 on
background and surface), for text fields, checkboxes, unselected choices, the syllabus tick box and
the beat grid's empty cells. `border` stays for faint decorative lines (tables, file rows, the info
note). Every text pair of both palettes was measured again: all 4.5:1 or more.

**Consequences.** An app update only (no new APK). New controls use `controlBorder`.

## 105. Screen readers hear results; long forms say why they did not save — 6 Oct 2026

**Context.** On Android, TalkBack said nothing when an error, a saved call or a scan result appeared:
`role="alert"` only names the box (audit D7-01). On a long form, a refused Save showed its messages
under fields scrolled out of view, so the button seemed dead (D7-07).

**Decision.** `src/lib/announce.ts` speaks a message with `AccessibilityInfo.announceForAccessibility`
on the phone (the web keeps its alert/status live regions). The Notice box speaks errors and
confirmations when they appear or change; a plain info box only when asked (attendance results, the
Left confirmation), so standing help text is not read out on every visit. Field errors are polite
live regions. `FormErrorSummary` shows "Some fields need a fix (n)" beside the submit button of the
call log, the announcement forms, the event and poll forms and the Ishtagoshti sign-up (registration
already had one).

**Consequences.** Register done and call saved are announced through their green Notice. A new form
with field errors adds `FormErrorSummary`.

## 106. A failed load blocks nothing; Mine never hides the queue; long file names fit — 6 Oct 2026

**Context.** One failed load of today's attendance disabled every name check-in, with no Try again
(audit D6-03). The follow-up queue's "Mine" filter stayed on after its switch disappeared, so the
queue looked empty (D6-04). A file name over 120 characters made a whole post fail with "try again"
(FS3-02, and the same limit for materials and fund bills, R2G2-01).

**Decision.** Attendance shows Try again, and the name rows stay tappable: without the list a row
says Check in, and the database answers "already checked in" when the student is (`mark_visit`); the
list is fetched again after each tap. A tap's result shows under that row, a scan's at the top. The
queue shows everyone when "Mine" has nobody. Picked file names are cut to 120 characters keeping
their ending (`fitFileName`).

**Consequences.** App update only.

## 107. When a pause ends, the mentor calls; Inactive counts from the pause end — 6 Oct 2026

**Context.** The daily job turned an ended pause Irregular with no call task, and a long pause could
jump to Inactive the same morning, never reaching the calls-due list (audit D5-01, D12a-10). The job
also added a second open task for a student who already had one, and escalated an Inactive
student's task even when a call had just been logged with a later date (D5-16).

**Decision.** **Praveen decided (6 Oct 2026):** the day after the pause-until date the student turns
Irregular, the mentor gets a call task (due in `call_due_days`), and the days to Inactive count from
the day the pause ended (its `status_history` row), not from the last visit. 0030: a call task is
added only when no open one exists; an Inactive student's open tasks are escalated once they are due.

**Consequences.** The screens' "days since visit" still count from the last visit, so a student back
from a long pause can show many days away and still be Irregular.

## 108. A visit starts the retry count again; settings cannot stop the daily job — 6 Oct 2026

**Context.** The failed-try count spanned separate absences, so the first unanswered call after a
student came back could escalate to the Guru (audit D5-02). 0014 checks settings ranges, but a value
that slipped past (the dashboard, a trigger turned off) still stopped the daily job, and Irregular
before Inactive was checked only in `save_settings` (D5-03).

**Decision.** `log_call` counts failed tries since the last call that got through or the last visit,
whichever is later. `setting_int` treats a value that is not a whole number as missing, and the
follow-up numbers then fall back to the defaults of 0001 (14, 30, 3, 3, 3, 4 weeks). A constraint
trigger checks Irregular before Inactive at commit for every write, so one save may still change both.

**Consequences.** A retry task's `attempt` is the next try: the first failed call of a new absence
plans try 2, not escalated.

## 109. Paused and Left only through a call, on insert too — 6 Oct 2026

**Context.** #4 makes a logged call the only way to Paused or Left, but an app user could insert a
student straight as Paused or Left, or move `paused_until` far ahead with a plain edit, keeping a child
out of follow-up with no call (audit D1b-04, D12a-04).

**Decision.** 0030's `students_status_guard`, for app users: a new record starts New or Active
(error `status_on_insert`); `paused_until` changes only through `log_call` (error
`student_field_locked`, detail paused_until) and is cleared when the status leaves Paused. The daily
job, `toggle_visit` and the dashboard are not stopped. Left to New by hand stays allowed (#4).

**Consequences.** No app screen changes: the app never sends these.

## 110. A visit's times may be corrected, nothing else; a rescan does not check out — 6 Oct 2026

**Context.** The visits update policy let any coordinator move a visit to another student, back-date
it or rewrite who marked it, with no trace (audit D1a-06, FR-05). The 30-second "same code" pause of
the scanner lived only in one phone's memory, so a second phone (or the door tablet) scanning a
moment later checked the student out after 0 minutes (D5-11).

**Decision.** **Praveen decided (6 Oct 2026):** times only, audited. For app users a visit's student,
centre, method, marker and device are frozen (error `visit_field_locked`), a check-in cannot be in the
future (`visit_time_future`), and every update or delete of a visit goes to `audit_log`. In
`toggle_visit`, a QR scan within 30 seconds of the check-in answers `already_in`; a tap on Check out
still checks out at once.

**Consequences.** The app has no visit-correction screen; corrections are made in the dashboard (as
the owner, not stopped, still audited).

## 111. Left keeps the login; the pending screen names the Guru — 6 Oct 2026

**Context.** Marking a student Left changes nothing else (#25): the login, class messages and
notifications go on. The confirmation did not say so (audit FLOW-08). The pending screen told a
student to ask a coordinator to fix their email, which no coordinator can do in the app (FLOW-01).

**Decision.** **Praveen decided (6 Oct 2026):** wording only. The Left confirmation says the login
keeps working and messages and notifications continue until the Guru switches the login off. The
pending screen says "Ask the Guru to link this login to your student record" (G2, #45).

**Consequences.** No database change for either. A staff screen to correct a student's login email
was not built.

## 112. Pushes go through a per-phone queue — 6 Oct 2026

**Context.** The audit (brief 11; D2-01, D2-03, D2-04, R2G3-05) found that the Edge Function
claimed whole announcements and sent up to 100 phones in one request to Expo. Expo refuses a whole
request when it holds a token of another Expo project, so one foreign token, saved by any
signed-in student, stopped the push for everyone in that batch, for every announcement. A request
that failed was retried only when every request of the run had failed; otherwise its phones were
lost, and a retry after a partly sent run sent the others twice. Ticket errors such as
InvalidCredentials counted as delivered.

**Decision.** 0031 adds `push_queue`: one row per phone and notification, for announcements and
for the `push_outbox` notices alike. Each row is sent, retried or given up on its own, and its
result (`sent_at` or `failed` with a reason) is kept for 3 days. The message shapes and the screens
a tap opens are unchanged (messages.ts). Rows older than a day are not sent, as before.

**Consequences.** One bad phone affects only itself. A run reads at most 500 rows (enough for the
class; the next minute takes the rest). `claim_due_push` and `claim_push_outbox` stay for an older
deployed function; `push_outbox.sent_at` now means "queued".

## 113. A claim has an id and a 5-minute lease; each row is retried alone — 6 Oct 2026

**Context.** A run that stopped between marking an announcement notified and sending it lost the
push; putting it back re-sent it to phones that had it (D2-04, R2G3-05).

**Decision.** `claim_push_queue` gives each run a claim id and holds its rows for 5 minutes;
`finish_push` records sent, retry or refused only for rows of its own claim. Requests that get no
answer, 429, a 5xx or no answer within 15 seconds, and ticket errors other than
DeviceNotRegistered and MessageTooBig, are retried after 2, 8, 18 and 32 minutes; after 5 tries the
row is `gave_up`. A request Expo refuses as a whole (400) is split in halves until the message it
refuses is alone; that one is refused with Expo's code. A run that stops is picked up by the next
one after the lease. **Accepted:** if a run stops after Expo took the messages but before
`finish_push`, those phones get the push a second time after the lease (at most once more). Expo's
delivery receipts are still not read (#33; brief 11 does not ask for them).

**Consequences.** `index.ts` is a thin wrapper; the logic is `send.ts`, tested with an imitated Expo
in `push-messages.test.mjs` and against the real SQL in the smoke test (D2-15).

## 114. Only DeviceNotRegistered deletes a token; another project's token is set aside — 6 Oct 2026

**Context.** Expo names the tokens of each project in a PUSH_TOO_MANY_EXPERIENCE_IDS refusal.

**Decision.** The function sends only this app's tokens (`@mridanga-seva/mridanga-seva`, or the
`EXPO_PROJECT` function secret if set; if Expo does not name it, the project with the most tokens
in that request) and marks the others `OtherProject`, never sent. A token is deleted only when Expo
answers DeviceNotRegistered, and only if it still belongs to the same login. The function logs
counts and Expo error codes, never a token, a title or Expo's answer text (D2-12).

**Consequences.** A foreign token stays in `push_tokens` and costs one extra request per run in
which it is due; the lead or the team may later decide to delete such tokens (D1b-06 is open).

## 115. The push job checks its address and secret, and keeps a status row — 6 Oct 2026

**Context.** `send_due_push` sent the push secret to whatever the Vault's project URL said
(R2G3-01), and pg_cron's history cannot tell `not_set_up` from `called` (R2G3-03, D2-07).

**Decision.** `call_notify_function` calls only `https://<20 letters/digits>.supabase.co` with a
secret of at least 32 characters (OPERATIONS step 8 makes 64); anything else is `not_set_up`.
`push_status` keeps the last job call and the last run's counts; OPERATIONS has the check query.

**Consequences.** No alert or staff banner yet (D2-07's banner stays a team decision). #116-#119
were reserved for this round and are left unused. Not done here, each a team decision or another
brief: D1b-06 (token take-over on a shared phone), D2-02 (lock-screen text), FS1b-04 (widened
audience), receipts (D2-03's second half).

## 120. Weekly encrypted backup with pg_dump, kept 8 weeks — 6 Oct 2026

**Context.** The documented `supabase db dump` wrote the schema only, no rows (D10-01), and said
nothing about encryption, owner or retention (D4-15). The free plan has no downloadable backups. The
CLI's dump runs `pg_dump` inside Docker, which the maintainer's PC does not have.

**Decision.** Every Monday and before every live migration, the owner (Praveen until a second person
is named) dumps the live project over the session pooler with PostgreSQL's command-line tools into
three files: `schema.sql` (public schema), `data-public.sql` (all public rows, COPY) and
`data-auth.sql` (auth.users, identities, mfa_factors; no sessions or Supabase logs). No roles file:
the app makes no roles of its own. The files go into a 7-Zip AES archive (file names hidden) whose
password lives in the team password manager; the plain files are deleted. The last 8 archives are
kept, and a `backup-log.csv` beside them records date, person, sizes, rows per dump and the drift
query's ALL hash. A restore loads the data into a project built from the migrations, inside one
transaction with triggers off, then re-applies every erasure and withdrawal dated after the backup
from the private request register.

**Consequences.** An erased child's data survives in older archives for up to 8 weeks; a restore
must re-apply erasures or it brings the child back. Storage files, Vault secrets, function secrets
and dashboard settings are not in the backup and are set up again by hand. One restore drill on the
test project before the pilot, then yearly; its result is recorded in OPERATIONS. Closes D10-01, D4-15.

## 121. Releases go database first; migrations stay additive for one release — 6 Oct 2026

**Context.** OPERATIONS had no order between migrations and app updates (D10-10) and no way to see
drift between the test and live projects (D10-08). An update reaches phones within minutes.

**Decision.** Migrate test, check on test, back up and migrate live, run the drift query (from the
audit, now in OPERATIONS) in both and compare its per-kind hashes, then publish the update and the
live site. A migration never drops, renames or changes the parameters of anything the app in use
calls in the same release. A weekly cron health query (last success, failures in 2 days, last
error per job, plus `push_status`) runs with the backup.

**Consequences.** A bad update can always be rolled back without touching the database. The drift
query's `config_rows` and `vault_secret` kinds may differ on purpose between the projects. No
schema_version table and no dashboard warning for a failed job yet (D10-09's "better" option).
Closes D10-08, D10-09, D10-10, R2G3-03 (doc part).

## 122. seed.sql refuses a project that has students or announcements — 6 Oct 2026

**Context.** The seed once ran on the live project (29 Sep 2026), and nothing stopped it running
again (FS1b-02); the clean-up in OPERATIONS deleted every student without a check (D10-11).

**Decision.** `seed.sql` opens with a DO block that raises unless `students` and `announcements` are
empty. The clean-up stays in OPERATIONS, guarded: it refuses unless every student, announcement,
group, material and syllabus item is one the seed makes. The smoke test runs the seed twice and the
clean-up (read from OPERATIONS.md) in both cases.

**Consequences.** The guard cannot tell an empty live project from an empty test one; the operator
still checks the project name. Copies of the fictional rows stay in `audit_log` after a clean-up.

## 123. Runbooks for a key leak, an Expo compromise and a lost staff phone — 6 Oct 2026

**Context.** The key-leak steps changed only `app/.env`, so a rotated app key would break every phone
and site (D12b-05); nothing covered a hijacked Expo account (D11-01) or a lost phone (D3-14).

**Decision.** OPERATIONS lists every key with what its leak allows and how to rotate it; a change of
the app's URL or key goes to the .env files, `eas env:push` per environment, an update per channel,
`export:web` per site, then a sign-in test on each, and only then is the old key deleted. An Expo
compromise: lock the account, list updates, builds and channels, roll back, republish from main,
rotate what Expo held, sign everyone out (`delete from auth.sessions`). A lost staff phone: switch
the login off in G2, delete its sessions and push tokens, password recovery, remote lock.

**Consequences.** No "sign out everywhere" button yet (D3-14's option); updates stay unsigned (#35).
The keystore cannot be rotated for APKs shared by link. Closes D12b-05, D3-14; D11-01 runbook part.

## 124. An expired or used email link says so and offers a new one — 6 Oct 2026

**Context.** Links in sign-up and password-reset emails open the web app. When a link had expired or
was used already, Supabase sent the person back with the reason in the address
(`#error=access_denied&error_code=otp_expired`) and the app showed the plain sign-in screen: the old
password failed and the reset seemed broken, in every language (audit D6-12, merged D8-03, FLOW-15).

**Decision.** `app/src/auth/email-link.ts` reads `error` / `error_code` from the address (hash or
query) once at start and removes them, so a reload does not repeat it. The sign-in screen then shows a
card: "This email link has expired" (`otp_expired`) or "This email link did not work" (any other
reason), why links stop working, and two buttons: **Send a new confirmation email** (to the email typed
in the sign-in form; `supabase.auth.resend`) and **Send a new password link** (Forgot password). The
error does not say which kind of link it was, so both are offered. The "sent" text does not say
whether the account exists, like Forgot password.

**Consequences.** JS-only (OTA). Phones never get these addresses (email links open the web app). A
person who is still signed in on that browser lands on their own screens and sees nothing, which is
harmless. Translations are drafts (TRANSLATIONS.md "Sign-in leftovers").

## 125. A new login keeps the language its phone showed at sign-up — 6 Oct 2026

**Context.** Before sign-in the app follows the phone's language when it is Telugu or Hindi. A new
profile was always created with the default `en`, and at the first sign-in the profile's language wins
(#48) unless the person had tapped a language on this device, so a Telugu phone switched to English
right after the first sign-in (audit D8-01).

**Decision.** The app sends the language it shows (picked, or the phone's own) with the sign-up, in
the user metadata as `language`; 0032's `handle_new_user` stores it on the new profile when it is
`en`, `te` or `hi`, else `en`. Later sign-ins on any device follow the profile, as #48 says.

**Consequences.** Logins made before 0032 keep `en` until the person picks a language once. A sign-up
on a laptop in English and a first sign-in on a Telugu phone shows English (the profile's), as
intended by #48. Before 0032 runs, the extra metadata is ignored.

## 126. A registration saved twice stores the student once — 6 Oct 2026

**Context.** When the answer to Save on Register a student (C2) was lost (weak signal), the app showed
"no internet" although the student, guardian and consent had been stored; a second Save stored the
child again with a new roll number (audit D6-08; the probe made MS-2026-0016 and -0017).

**Decision.** Each registration form gets a random id (`expo-crypto`, no new package) that every
Save of that form sends as `p_request_id`. 0032 adds `students.request_id` (unique) and
`register_student(..., p_request_id)`: when a student with that id exists, nothing new is stored and
that student comes back with `repeated = true`; two calls at the same moment are caught by the unique
index. The done screen then adds "This student had already been saved ... check the details". The id
is another person's: `request_id_used`. App users cannot change `request_id` (trigger
`students_request_id_guard`). "Register another" starts a new form with a new id.

**Consequences.** A repeat after the coordinator edited the form returns the first record unchanged
(the note asks them to check it). Students registered before 0032, by the import (G12) or in the
dashboard have no request id. An app without 0032 on its database gets PGRST202 for the new argument
and calls again without it, so the OTA can ship before the migration. #127 was reserved for this round
and is left unused.

## 128. The public website is plain HTML built by a small script in `website/` — 7 Oct 2026

**Context.** mridangaseva.com is bought (Zoho, 7 Oct 2026). The root of the domain becomes a public
website that tells people about the class and sends them to the app; the app's web version moves
to `app.mridangaseva.com` at go-live (audit brief 8). The site must meet international standards
(accessibility, languages, privacy, security) because the seva is expanding abroad, and it must
not touch the app or its native fingerprint.

**Decision.** The site lives in its own top-level folder `website/` with its own `package.json`
and **no dependencies**. `website/src/build.mjs` (Node only) puts each language's page texts
(`website/content/<lang>/*.html`) into one layout and writes plain HTML, one CSS file with a
content hash in its name, `sitemap.xml` and `robots.txt` to `website/dist/`. The pages ship **no
JavaScript**. Facts that change (dates, links, mail aliases, the draft switch) are in
`website/site.config.mjs`. `npm run check` tests links, languages, page structure and headers;
`npm test` builds and checks. It is hosted as a separate Cloudflare Pages project,
`mridangaseva-site`, uploaded by hand like the app's sites (#23).

**Why.** Astro was the other candidate (good i18n routing, also ships no JS). Seven pages in three
languages do not need a framework: a short script has nothing to upgrade, no supply chain and
no build cache, and a volunteer can read it. With no JavaScript there is nothing to break, a
strict CSP is easy, and the pages are fast on a slow phone.

**Design (7 Oct 2026, Praveen asked for a world-class look).** Compared krishna.com (cream,
saffron and maroon, italic serif headings, ornamental dividers, wave-edged bands, devotional
paintings), artofkirtan.org (deep indigo bands, brass buttons, serif headings, photos with wavy
edges; low-contrast text and a cookie wall) and mayapur.com (heavy, blank until scripts load). The
site keeps their warmth and beats them on speed, contrast and privacy: night indigo (*śyāma*) bands
with a marigold glow, temple-cream sections, Cormorant Garamond for headings (OFL, self-hosted in
`website/static/fonts/`, 600 roman + italic, Latin + Latin Extended for IAST, ~22 KB a file,
loaded only for the characters a page uses), the system sans for text and the system Indic fonts
for Telugu and Hindi. All artwork is original inline SVG drawn by `website/src/art.mjs`: the clay
khol with laced straps on a turning halo of petals, a labelled diagram of the heads (gajarā,
kinār, maidān, syāhī; labels from the language's `strings.json`), lotus ornaments and waves.
The home page has a hero, the three words of the motto (Saṅkalpa · Sādhana · Seva), the
instrument, an eight-beat rhythm (kksongs lesson 6) whose strokes pulse in time, a short
history timeline, the three levels and a closing band with the dates. Motion is CSS only and off
under reduced motion. No photographs or paintings: none are owned or cleared yet; class photos
can be added later with the people's consent. The emblem in the header is a placeholder until
the team has a logo.

**Consequences.** Anything interactive (a form, a search) would need JavaScript and a CSP change;
none is planned (contact is by email). If the site grows past ~20 pages or needs a blog, moving to
Astro is straightforward: the content files are already HTML fragments per language.

## 129. One folder per language; English at the root, other languages under /te/ and /hi/ — 7 Oct 2026

**Context.** English, Telugu and Hindi now; Praveen will name more languages as the seva expands.

**Decision.** Every folder in `website/content/` that holds a `strings.json` is a language: its
`meta` gives the BCP 47 code, the Open Graph and date locales, the native name, the direction
(`ltr`/`rtl`) and the menu order, and its seven `.html` files are the page texts. The default
language (English) is served at `/`, every other one at `/<code>/` with the same page slugs. Each
page has `<html lang dir>`, a canonical URL, `hreflang` alternates for every language plus
`x-default` (English), and the sitemap lists the same alternates. The language switcher is a
visible list of links in each language's own name and script, each marked with `lang` and
`hreflang`, linking to the same page in that language; no flags. Dates are formatted at build
time with `Intl` in the page's locale inside `<time datetime="YYYY-MM-DD">`. Text fonts are the
system's (Segoe UI / Nirmala UI on Windows, Roboto / Noto on Android, San Francisco / Kohinoor on
Apple), which carry IAST diacritics (mṛdaṅga), Telugu and Devanagari; nothing is loaded from
Google Fonts or any other host. Unsettled facts are written `[[TEAM: ...]]` in the texts and shown
as a marked "To confirm" note; while `draft` is on, every page says it is a draft and carries
`noindex`.

**Why.** One folder per language is the smallest unit a translator can own. English at the root
plus prefixed languages keeps today's links short and gives each language a stable, crawlable
address. System fonts render all three scripts with no download and no third-party request.

**Consequences.** A new language = copy `content/en` to `content/<code>`, translate, set `meta`;
`npm run check` fails until every file and string key exists. In Telugu the class's drum is
written "మృదంగ (ఖోల్)", not "మృదంగం", which Telugu readers take for the Carnatic drum. The te
and hi texts are drafts for native-speaker review. A right-to-left language would need the CSS
checked (it uses left/right in a few places).

## 130. The website sets no cookies and loads nothing from elsewhere; strict headers — 7 Oct 2026

**Context.** A public site for a class with children must not track visitors, and should score A+
on Mozilla Observatory (audit brief 13 asked for a CSP on the app's site; this does the same for
the new site).

**Decision.** No cookies, analytics, trackers, embeds or forms, so no cookie banner. Cloudflare
Pages serves `website/static/_headers`: `Content-Security-Policy: default-src 'none'; style-src
'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`, HSTS (2 years, includeSubDomains, no
preload yet), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, a Permissions-Policy that switches every powerful feature off,
COOP and CORP `same-origin`; the hashed CSS and the fonts are cached for a year (a changed font
file must get a new name). `/.well-known/security.txt`
(RFC 9116) points to GitHub private reporting and privacy@. `connect-src 'self'` is there only
because Lighthouse reads `/robots.txt` from inside the page and called it invalid under
`default-src 'none'`.

**Consequences.** Cloudflare features that inject scripts (Email Address Obfuscation, Web
Analytics, Rocket Loader) would be blocked by the CSP and must stay off for the zone. HSTS with
includeSubDomains will also apply to `app.mridangaseva.com` and every other subdomain once the
domain is attached, so each must serve HTTPS (Cloudflare and Zoho do). Add `preload` only after
the domain has run on HTTPS for a while. security.txt expires on 1 Oct 2027; `npm run check` warns
a month before.

## 131. One privacy notice for the website and the app, written for DPDP and GDPR — 7 Oct 2026

**Context.** Audit brief 6 asked for a reviewed privacy notice before the first parent signs. The
seva may take students abroad, so the EU/UK GDPR matters as well as India's DPDP Act 2023 and its
2025 Rules.

**Decision.** The notice is a page of the website (`/privacy/`, `/te/privacy/`, `/hi/privacy/`) and
covers the website and the app: the data fiduciary/controller; what the app keeps (from
DATABASE.md); purposes and legal bases (DPDP s.6 consent and s.8 duties; GDPR Art. 6(1)(a), (c),
(f)); children (under 18, verifiable written parental consent, no tracking or targeted ads); who
sees what; the processors and where they are (Supabase, Expo, Firebase Cloud Messaging, Brevo,
Cloudflare, Zoho Mail, YouTube); transfers abroad; retention; security and breach notice; rights
(including DPDP nomination; GDPR restriction, objection, portability); complaints (Data Protection
Board of India; EU/UK authority); contact privacy@mridangaseva.com; version and ISO date. Items
waiting on team decisions are marked in the text: D4-07 retention (the audit's proposed periods,
shown as a proposal), D4-09 who sees parents' contacts, D4-12 processors abroad, D4-08 age check
at sign-up, plus the controller's legal name and address, the grievance officer, the reply period
and a legal review.

**Consequences.** The app's sign-up screens can link to `https://mridangaseva.com/privacy/` once
the domain is attached (brief 6's app part: a notice link, and the notice version on each
consent). When a team decision lands, edit the three language files, raise
`privacyNotice.version` and `date` in `site.config.mjs`, rebuild and upload. The notice must have
no "To confirm" left before the draft switch is turned off.

## 132. Each centre has its own time zone and country; "today" is the caller's centre's — 7 Oct 2026

**Context.** The seva is expanding to centres in other countries and time zones (Praveen, 7 Oct
2026: "we require international standards as we are expanding"). Every "today", "this week" and
time of day was India time, written as `'Asia/Kolkata'` into about 15 SQL functions and views and as +05:30 into
the app. A class in New York would have had its 23:30 check-ins counted on the next day, its
visits closed at 21:00 IST (11:30 in New York, before the class), and its notices dated in India.
The I18N audit (docs/I18N.md) lists every place.

**Decision.** `centres.time_zone` (IANA name, default `Asia/Kolkata`, checked against Postgres's
zone list; no abbreviations such as IST, no fixed offsets) and `centres.country_code` (ISO 3166-1
alpha-2, default `IN`), migration 0033. Per centre, not per batch: the class has no batches
(NOTES 28 Sep 2026: drop-in window), and students (`home_centre_id`), visits, events and duty
shifts already carry a centre. A person's centre is their student record's home centre, else
`profiles.centre_id`. `today_ist()` keeps its name (dozens of functions call it) but now means
today at the caller's centre; pg_cron and the dashboard (no login) get the first centre's zone.
The functions that wrote the zone themselves now use the right centre: the attendance day of a
visit is its centre's (`local_day`), a student's "days since the last visit" and the daily status
job use the home centre's today, check-out and closing use the visit's centre, the home screens and
reports use the caller's midnight and Monday, event reminders and duty reminders use the event's
or shift's centre. Storage stays ISO 8601: `timestamptz` in UTC, `date` as YYYY-MM-DD.

**Why.** Keeping the name `today_ist` avoids redefining dozens of functions in one migration (risk for
no gain); a comment says what it means now. A time zone on the centre is the smallest place that
is always known for a visit, a student and a staff member.

**Consequences.** With one centre in India every answer is the same as before (smoke test). A new
centre abroad is one row: `insert into centres (name, time_zone, country_code) values ('Queens',
'America/New_York', 'US')` (the G9 screen has no field for it yet). Students still get centre 1 as
home centre until the centre picker exists. Not changed (low risk, documented in docs/I18N.md):
`promotion_criteria` counts visit days in India time, and `assessment_daily` reminders use the
first centre's date (one day early at most for a centre far west of India).

## 133. Visits left open are closed every hour, an hour after the centre closes — 7 Oct 2026

**Context.** `close_open_visits` ran once a day at 21:00 IST. For a centre west of India that is
during its class, and it would have closed today's visits at a closing time still in the future.

**Decision.** The job `mridanga-close-visits` runs at half past every hour and closes only the
visits whose centre's closing time (on the day the visit began, in the centre's zone) was at
least an hour ago; each ends at that closing time, as before.

**Why.** One rule for every zone. For Abids (closes 20:00) the first run that qualifies is 21:00
IST, exactly as before.

**Consequences.** pg_cron replaces the job of the same name when 0033 runs. If a centre's closing
time is changed to later than 20:00, its visits close an hour after that time, not at 21:00.

## 134. Dates: India keeps day-month-year; elsewhere the month is a word; typing stays day-month-year — 7 Oct 2026

**Context.** The app wrote every date by hand as DD-MM-YYYY and every time as 24-hour HH:MM, and the
database's notices did the same. In the US, 04-10-2026 reads as April 10. Typed dates are read as
day-month-year, and about 25 hints in three languages say so.

**Decision.** `formatDate` keeps DD-MM-YYYY for a centre in India (unchanged). For any other
country it uses `Intl.DateTimeFormat` with the app's language and the centre's country and the
month as a word ("Oct 4, 2026" in the US, "4 Oct 2026" in the UK), so no order can be misread. A
typed date stays day-month-year in every country, and ISO 8601 (2026-10-04) is now accepted too;
form fields are filled with `formatTypedDate` (always day-month-year). Notices written by the
database use DD-MM-YYYY in India and ISO 8601 elsewhere (`local_stamp`). Times stay 24-hour.
`lib/class-locale.ts` gets the zone and country from `my_centre_locale()` after sign-in and keeps
the last known on the device; an app on a database without 0033, or before sign-in, uses India.

**Why.** Nothing changes for the Hyderabad class, and nothing that is shown abroad can be misread.
Changing the typed order per country would mean rewriting every date hint in every language;
the proper fix is a date picker (a native package, so the next APK; see docs/I18N.md proposals).

**Consequences.** Intl on Android (Hermes) is used only for a centre outside India, always with a
fallback (India's offset, or ISO text). 12-hour time for the US waits for the same picker decision.

## 135. Every fund amount has an ISO 4217 currency; one fund, one currency for now — 7 Oct 2026

**Context.** The fund (#80) keeps whole paise with no currency, and the app writes them as ₹ with
Indian grouping. A centre abroad would count dollars.

**Decision.** `fund_entries.currency` (three capital letters, default `INR`); `amount_paise` holds
the minor units of that currency. A reversal copies the currency of the entry it undoes (trigger
`fund_entries_currency`). `record_fund_entry` does not take a currency yet, so every entry is INR
until the team decides how money is kept abroad (one fund per country, or per centre). The app's
`lib/money.ts` `formatMoney(minor, currency)` writes INR as before (₹, lakh grouping, in every
language) and any other currency through `Intl.NumberFormat`.

**Why.** Recording the currency now costs nothing and makes old rows unambiguous later; mixing
currencies in one balance would be wrong, so it is not offered yet.

**Consequences.** `fund_balance()` still sums one currency. The column `amount_paise` keeps its name
(renaming would break the current app). The settings `fund_approval_rupees` / `fund_bill_rupees`
are rupees.

## 136. Counts use plural keys; search ignores accents — 7 Oct 2026

**Context.** Five texts wrote "student(s)" and nine more would read "1 students" or "1 days"; a new language may have more plural
forms (Arabic six, Russian three). Search compared plain lower case, so "krsna" did not find
"Kṛṣṇa".

**Decision.** Texts with a `{{count}}` that names a thing have `_one` / `_other` keys (i18next,
CLDR plural rules; Telugu and Hindi keep their draft text in both until the native-speaker review).
`lib/search-text.ts` `searchFold` (NFD, Latin combining marks U+0300-U+036F removed, lower case) is
used by every name search; Telugu and Devanagari vowel signs are not touched.

**Why.** i18next picks the right form for any language from `count`; a translator only adds the
forms their language needs. Without `Intl.PluralRules` (older Hermes) i18next falls back to one /
other, which is right for en, te and hi.

**Consequences.** A new text with a count of things gets `_one` and `_other` from the start
(docs/TRANSLATIONS.md).

## 137. Proposals that wait for a team decision before expansion — 7 Oct 2026

**Context.** Some international changes are not technical choices: age of consent per country,
phone numbers, addresses, new languages, a fund abroad, typed dates.

**Decision.** Not built. Each is written up in docs/I18N.md "Proposals for the team" with a
recommendation; this number is kept for the decision record when the team answers.

**Why.** They change consent, money or what families are asked, which the team decides.

**Consequences.** Until then a centre outside India can run attendance, follow-up, events and
reports (#132-#136), but registration still asks for an Indian-style phone and pincode and treats
under 18 as a minor.

## 138. A refusal check names its exact error, and the smoke test counts its checks — 7 Oct 2026

**Context.** The audit (D14-09, D14-10, D14-11) found 174 `refuses()` checks that passed on any
error, so a check could pass behind another rule's error; a skipped block (a renamed migration)
vanished behind "All checks passed"; and `asApp` left `auth.uid()` set, so owner statements ran
as the last app user, which never happens on Supabase.

**Decision.** `refuses()` is gone. Every refusal uses `refusesWith(name, expected, fn)`, where
`expected` is the whole error message (our codes such as `not_allowed`, or Postgres's
`permission denied for table x` / `new row violates row-level security policy for table "x"`) or a
RegExp. The 174 were converted to the message each one gets today (recorded by a run, then
read through: none was refused for the wrong reason). The run counts every PASS and FAIL and
fails unless the total equals `EXPECTED_CHECKS` (1133 at this change, with 0033). `asApp` passes the user id
as a bind parameter and clears it in `finally`.

**Consequences.** Adding checks means setting `EXPECTED_CHECKS` to the new total the run prints;
two branches that both add checks will conflict on that one line — take the sum. A changed error
code is now a test failure, which is the point: the app shows those codes. One inconsistency is
pinned as it is: `toggle_visit` answers `not allowed` (with a space) where the other functions say
`not_allowed`.

## 139. The test net walks the whole schema; new functions go on an allow-list — 7 Oct 2026

**Context.** The audit's mutation probes (D14-01, D14-03, D14-05..D14-08, D12a-18) loosened one
policy or grant at a time and the suite stayed green: guardians, consents and the audit log open
to students, anon allowed to run `link_login_to_student`, a coordinator deleting students or
rewriting settings, the daily jobs emptied, a mistyped cron command.

**Decision.** One block at the end of `supabase/tests/smoke-test.mjs` ("test net (audit brief
12)") checks the whole schema rather than single cases, so a new table, view, policy or function
is covered without a new check:
- guardians and consents: no row for a student or a pending login, every row for staff; the audit
  log: the Guru only;
- function sweep: anon may run no function of ours; signed-in people exactly the functions on
  `SIGNED_IN_MAY_RUN` (115 today, with 0033's five time-zone helpers); every SECURITY DEFINER function fixes its search_path; every
  public table has row-level security; every view is `security_invoker`; a switched-off login gets
  `my_role()` null and no helper says yes;
- student isolation: for every column named `student_id` or `profile_id` (34 in tables and views)
  a student sees no one else's row and can update or delete none (a control fails if the key
  tables have no other students' rows to hide);
- write sweeps: a no-op UPDATE and a DELETE on every table as a pending login and a student, and on
  the Guru-only tables as a coordinator, each in a transaction that is rolled back; a write
  stopped only by a foreign key counts as let through by the policy; plus the positive side (the
  Guru and staff can still write) and a few named inserts;
- triggers: roll number frozen, one status_history row per status change, one audit row naming
  who changed a student, a profile, a call log;
- the two daily jobs on fixed cases (13/14 days, 29/30 days, a due task escalated, an open visit
  closed at closing time, a late one after one minute); the old check that could not fail is
  deleted;
- pg_cron is imitated with a job table: every job has a five-field schedule and a command whose
  functions exist (EXPLAIN, never run).

**Consequences.** A new function the app calls must be added to `SIGNED_IN_MAY_RUN` in the same
change (and revoked from anon); an internal one revoked from authenticated too. Six trigger
functions from 0001 (`assign_roll_no`, `audit_row`, `guard_profile_update`,
`guard_student_update`, `handle_user_confirmed`, `link_student_email`) are still executable by
authenticated. That is harmless (Postgres refuses to call a trigger function directly, which a
check proves) but untidy: they are listed apart as `OLD_TRIGGER_FUNCTIONS` for a later migration to
revoke. Proof the net catches what the audit found (run with a throw-away migration, then
removed): U02, U03, U04, U06, U11, U15, U01 and U17 each turn at least one new check red.
What PGlite cannot show (real cron, pg_net, Storage limits, two sessions) is listed in the test's
header and still needs a run on TEST.

## 140. App unit tests use Node's own test runner; typed routes are generated by a script — 7 Oct 2026

**Context.** The app had no tests (D14-15), and a fresh clone's `tsc` passed route typos because
`.expo/types/router.d.ts` is written only by the dev server (FS4-05). Node's version was unpinned
though the packages need 22.13+ and the push test needs type stripping (D11-15, D14-17).

**Decision.** `npm test` in `app/` runs `node --test tests/*.test.mjs`: plain Node reads the
TypeScript of `src/lib/dates.ts` and `src/auth/requested-path.ts` directly; `react-native`,
`expo-linking`, `@/i18n` and `./class-locale` are replaced by small stand-ins through a module
resolve hook (`tests/stubs/`), so a test can set the class's time zone (India and New York are
tested). No test library, no new dependency, no change to app code, so the fingerprint
stays 185e839f (`PackageJsonScriptsAll` is skipped by `fingerprint.config.js`; the `engines`
field does not count either — checked with `npx expo-updates runtimeversion:resolve`).
`node scripts/typed-routes.mjs` writes the typed routes with the Expo CLI's own generator, without
starting the dev server; run it before `npx tsc --noEmit`. Node is pinned: `.nvmrc` 24,
`engines` `^22.18.0 || ^24.3.0 || >=25.0.0` (app) and `^22.18.0 || >=23.6.0` (supabase/tests).

**Consequences.** A pure helper is tested the cheap way; a screen test needs jest-expo later (a
new dev dependency, a separate decision). A helper that imports another native package needs a
stub added to `tests/stubs/hooks.mjs`. `typed-routes.mjs` reaches into `@expo/cli`'s build
folder; an SDK upgrade may move it — the script then fails loudly rather than silently passing.

## 141. GitHub Actions checks every pull request; Dependabot proposes updates, a person merges — 7 Oct 2026

**Context.** No CI, Dependabot or CODEOWNERS (D11-16): tests, lint and tsc ran only when someone
remembered, and vulnerable packages surfaced only in manual audits.

**Decision.** `.github/workflows/ci.yml` runs on every pull request and on push to main, three
jobs: app (npm ci, `expo lint`, typed routes, tsc, unit tests), database (`supabase/tests` npm
test), website (npm test). It needs no secrets (PGlite only), has `permissions: contents: read`,
checks out without keeping the token, and pins each action by commit SHA. `.github/dependabot.yml`
checks npm weekly (app, supabase/tests, website; minor and patch grouped; Expo and React Native
majors left to an SDK upgrade) and the actions monthly. `.github/CODEOWNERS` names @Praviadari
for everything, release files and the database listed apart.

**Consequences.** A Dependabot pull request is reviewed like any other and never auto-merged: an
app package change can change the fingerprint and needs a new APK (docs/OPERATIONS.md
"Dependabot"). CI is advice until Praveen makes its three checks required in the branch rules of
`main` (GitHub → Settings → Rules); that is a repository setting, left to him.

## 142. The web version sends a strict Content-Security-Policy and security headers — 7 Oct 2026

**Context.** Audit D3-06: the web version, which holds staff sessions with access to children's
records, was served with no CSP, no frame protection and no Permissions-Policy. There is no known
injection today; this is defence in depth before `app.mridangaseva.com` goes live.

**Decision.** `app/public/_headers` is a template that `scripts/export-web.mjs` fills in per site and
writes to `dist/_headers` (it stops if a placeholder is left). The policy: `default-src 'self'`;
`script-src 'self' 'wasm-unsafe-eval'`, the SHA-256 of the lesson player's script and
`https://www.youtube.com`; `connect-src`/`img-src` only that site's Supabase project
(`https://<ref>.supabase.co`, no `wss:` because Realtime is not used) plus `data:`/`blob:`;
`media-src https:` (a lesson video file may live at any https address the team gives);
`frame-src https://www.youtube.com`; `style-src 'self' 'unsafe-inline'`; `object-src 'none'`,
`base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`.
Also HSTS (2 years, includeSubDomains, no preload), `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, and
`Permissions-Policy` with camera, microphone and geolocation for the site itself, fullscreen /
autoplay / encrypted-media / picture-in-picture also for YouTube, everything else `()`. The
lesson player's script (`PLAYER_SCRIPT` in `src/lib/lesson-player-html.ts`) became one constant
text, with the lesson passed in a `<script type="application/json">` block, because the player runs
in a srcdoc frame that inherits the site's policy and only a fixed text can be allowed by hash;
export-web hashes it with Node (type stripping) and stops if the bundle does not hold it word for
word. Every outside host and why is listed at the top of `_headers`.

**Addendum 13 Oct 2026 (#282).** YouTube's scripts no longer run in the site's origin: a YouTube lesson plays in YouTube's
own embed frame, driven by messages, and `https://www.youtube.com` left `script-src` (it stays in `frame-src`).

**Why.** A hash keeps `'unsafe-inline'` out of script-src without moving the player to a separate
page, which phones (a WebView loaded from a string) could not share. Per-site placeholders keep the
TEST site from being allowed to talk to LIVE and the other way round. `'unsafe-inline'` for styles
is needed by react-native-web and cannot run code. Microphone and geolocation are used (record
yourself, recorded answers, coordinator check-in), so "camera only" from the brief was widened.

**Consequences.** A new outside host (a map tile server, analytics, a font CDN) needs a line in
`_headers` and a DECISIONS entry, or it is blocked. Cloudflare's Email Obfuscation, Web Analytics
and Rocket Loader must stay off (they inject scripts). Any change to `PLAYER_SCRIPT` changes the
hash automatically at the next export. After each upload, OPERATIONS.md "Publishing the web
version" has a header check. Closes D3-06 (with #143).

## 143. The web QR reader is served by the site, not by jsDelivr — 7 Oct 2026

**Context.** Audit D11-12: in browsers without a built-in barcode reader, expo-camera loads
barcode-detector, whose zxing-wasm downloaded `zxing_reader.wasm` from `fastly.jsdelivr.net` with no
integrity check, into the page that holds staff sessions; a CDN block also stopped web scanning.

**Decision.** export-web copies `zxing-wasm/dist/reader/zxing_reader.wasm` (the copy barcode-detector
resolves, version pinned by package-lock, 3.1.3 now) to `dist/zxing/<version>/` after checking that
its version and SHA-256 equal `ZXING_WASM_VERSION` / `ZXING_WASM_SHA256` exported by barcode-detector.
`src/lib/qr-reader.web.ts` calls `setZXingModuleOverrides({ locateFile })` before the scanner's
camera starts, pointing at `/zxing/<version>/zxing_reader.wasm`; the CSP allows no other host and
`'wasm-unsafe-eval'` lets it compile. barcode-detector is imported by the same name expo-camera
uses, so both share one module; it is not added to package.json (it comes with expo-camera, and a
package.json change would be a new dependency). In development the CDN default stays (the dev server
has no `zxing/` folder and no CSP).

**Why.** Same-origin, hash-checked at build time, cached a year (`/zxing/*` immutable, versioned
path), and it works on networks that block CDNs.

**Consequences.** If expo-camera ever drops barcode-detector, the import and export-web fail loudly
rather than silently; then revisit. An expo-camera upgrade that moves zxing-wasm to a new version
just changes the folder name. Closes D11-12.

## 144. The web version shows which upload it is — 7 Oct 2026

**Context.** Audit D10-16: the web version showed no version, so nobody could prove which commit a
site served (the test site once served an old bundle for days).

**Decision.** export-web sets `EXPO_PUBLIC_BUILD = "<site> <commit>[+changes] <ISO time>"`;
`runningVersion()` in `app-update.web.ts` returns `{ kind: 'web', site, commit, date }` and the
version line under Sign out reads "Web version test · 244e9f8 · 07-10-2026 15:00" (en/te/hi).
`dist/version.txt` holds site, commit, build time and project ref. OPERATIONS.md keeps an upload log.

**Why.** One id in three places (the page, version.txt, the log) answers "what is live?" without
opening developer tools.

**Consequences.** "+changes" marks an export from a folder with uncommitted changes; a site people
use should be built from a commit. Closes D10-16.

## 145. Development defaults to TEST; the live values are used only by an explicit live build — 7 Oct 2026

**Context.** Audits FS4-01, D10-07, D11-08: `app/.env` held the LIVE values, so `npx expo start`
talked to the class's real data; `npm run export:web` with no flag built the live site; and Expo
loaded `app/.env` into every export, test ones included.

**Decision.** Settings files in `app/` (none in git): `.env.development` = TEST (Expo loads it under
`expo start`), `.env.test` = TEST (test site, EAS preview env:push), `.env.live` = LIVE (only
`export:web -- --site live` and EAS production env:push); no plain `.env`. export-web requires
`--site test|live` (refuses without it, and refuses the old `--env`), maps it to a hard-coded
project ref (test `fhuqykssenuhczdqbafu`, live `qeozvvizcojzxcjgnaei`, as publish-update's PROJECTS),
refuses a file whose URL is not that project, refuses a bundle that names the other project, and
prints the site and Cloudflare project last. Both export-web and publish-update run Expo with
`EXPO_NO_DOTENV=1`. The main folder's files are moved by Praveen once (NOTES.md "07-10-2026 — Web
hardening", steps).

**Why.** A mistake now needs two explicit choices (`--site live` and a `.env.live` file) instead of
none, and nothing in development can reach real children's records.

**Consequences.** Worktrees get `.env.development` and `.env.test` (TEST) and never `.env.live`.
Scripts or notes that say `--env .env.test` or `app/.env` are out of date. Closes FS4-01, D10-07,
D11-08.

## 146. Reads of parents' contacts, consents and call notes go through logging functions — 7 Oct 2026

**Context.** Audit D4-06 (with D10-13): nothing recorded who read a child's guardian phone, consent
or call notes, so a leak could be neither noticed nor scoped; DPDP Rules 2025 Rule 6 asks for access
logs kept a year. Every coordinator could read every row straight from the tables (D4-09).

**Decision.** Migration 0034 adds `access_log` (at, actor_id, function_name, student_id,
row_count) and the security-definer functions `get_guardians(p_student)`, `get_consents(p_student)`,
`get_call_notes(p_student, p_limit)` (active staff, `is_staff()`) and `get_audit_log(...)` (the
Guru): each writes one access_log row, then returns the rows. Coordinators lose the direct SELECT on
guardians, consents and call_logs (guardians: they still add one through register_student; edits and
deletes become the Guru's); the Guru keeps it. audit_log has no direct SELECT any more: G11 pages
go through get_audit_log. The table is insert-only from the functions (no client right to write),
readable by the Guru, purged nightly after 400 days (`mridanga-access-log-purge`, 01:45 UTC). A
deleted or erased student's id is blanked in it (trigger on students). What read those tables as the
caller is kept working: register_student makes the guardian's id itself instead of `returning`, and
class_report counts call outcomes through `call_outcomes()` (outcomes only, no notes, not logged).
The app reads through the functions and falls back to the old table read only on PGRST202 (the
function does not exist yet).

**Why.** The functions are the one door, so each read leaves a trace whatever app or tool a login
uses. The Guru keeps direct reads because revoking a consent and correcting a guardian are done on
the table (guard_consent decides) and the Guru is the controller's own operator; the Guru's reads in
the app are logged anyway.

**Consequences.** An exception to #121 ("Releasing a change: database first"): an app from before
the update shows no parent, consent or call history to coordinators, and an empty G11 to the Guru,
until the update arrives; 0034 on live and the update go out the same day. Not logged: the Guru's
direct table reads, the SQL editor and the secret key (the Supabase logs cover those, for 1 day on
the Free plan), and reads of other student fields (name, dob, phone). G11 has a second view, "Reads
of private details". Closes the logging part of D4-06; partly closes D4-09.

## 147. A personal data breach follows Rule 7, run by the maintainer with the Guru as deputy — 7 Oct 2026

**Context.** Audit D4-06, D10-13: the incident runbooks covered keys, the Expo account and phones,
but nobody would have told parents or the Data Protection Board.

**Decision.** docs/OPERATIONS.md "Incidents" opens with "Personal data breach": Praveen decides and
acts, the Guru if Praveen cannot be reached within 2 hours ([[TEAM]] to confirm); stop it; save the
Supabase logs at once (Free plan: 1 day, checked on supabase.com/pricing 7 Oct 2026); scope it with
access_log (#146); tell each affected parent or adult student without delay (template in en, te, hi;
te/hi drafts for review); a first report to the Board without delay; the detailed report within 72
hours; an incident log kept privately, never in the repository. The key, Expo and phone runbooks sit
under the same heading.

**Why.** The Rule's clock starts when we know, so the steps, the people and the words must be ready
before the first pilot day, not written during an incident.

**Consequences.** [[TEAM]]: the Board's reporting channel, the two contacts' phones, and whether
CERT-In's 6-hour rule applies. A monthly look at the access log ("Reviewing the access log"). Closes
D10-13 and the runbook part of D4-06.

## 148. Requests from parents have an owner, a log and a 30-day answer (90 at most) — 7 Oct 2026

**Context.** Audit D4-02: parents had no channel for access, correction, erasure, withdrawal or a
complaint, no owner and no clock.

**Decision.** docs/OPERATIONS.md "Requests from parents": privacy@mridangaseva.com, the desk or a
phone call; owner Praveen, deputy the Guru ([[TEAM]] to confirm); acknowledge within 3 working days,
answer within 30 days and never after 90 (Rule 14); identity checked against the contact on record;
a private request log; withdrawal and erasure use withdraw_consent and erase_student. SECURITY.md
names privacy@ for personal-data problems (GitHub private reporting stays for code).

**Why.** 30 days is easy for a class of this size and leaves room under the legal 90; publishing one
number in the notice is a promise the team can keep.

**Consequences.** The privacy notice (website) must state the same owner and periods. A "my data"
screen in the app stays a later idea. Closes the process part of D4-02.

## 149. The processor register lives in OPERATIONS — 7 Oct 2026

**Context.** Audit D4-12: the services that see personal data, and where they are, were not recorded.

**Decision.** docs/OPERATIONS.md "Who processes the data": Supabase (Mumbai region, USA company),
Expo (build, update, push), Google FCM, Brevo (planned), Cloudflare Pages, Zoho Mail, YouTube, GitHub
(no personal data), each with the data it sees; jsDelivr is gone since #143. The terms (DPA) and
regions to confirm are [[TEAM]] cells.

**Why.** The notice must name them, and a breach or a request needs to know where data sits.

**Consequences.** A new service is added to the table and the notice in the same change. Closes the
register part of D4-12; the transfer decision itself stays with the team.

## 150. The app links the website's privacy notice and records its version on a consent — 7 Oct 2026

**Context.** Audit D4-01, D4-05, D4-08: the draft notice (website, #131) was not linked from the app,
and a consent did not say which notice the parent saw.

**Decision.** `app/src/lib/privacy-notice.ts` holds the one website origin (the pages.dev preview
until mridangaseva.com is attached, brief 8) and `PRIVACY_NOTICE_VERSION`, equal to
`privacyNotice.version` in website/site.config.mjs (the smoke test fails when they differ). Sign-up
(A1) shows "Under 18? Ask at the class desk." and a "Privacy notice" link; registration (C2) shows
"Privacy notice for parents" in the parent's part. The link opens /privacy/, /te/privacy/ or
/hi/privacy/ by the app's language. register_student takes `p_notice_version` and stores it on each
consent (`consents.notice_version`, frozen by guard_consent; NULL before 0034); the app falls back
without it on PGRST202, then without p_request_id (#126).

**Why.** One constant means brief 8 changes the address once; the version on the consent is the
proof of what the parent was told.

**Consequences.** Raising the notice's version means changing both files and publishing an update.
The age line is a sign, not a check (D4-08 stays a team decision). An adult's self sign-up does not
store the version yet (no consent row); see #151.

## 151. Open choices left for the team after the access log — 7 Oct 2026

**Context.** Brief 6b was built on is_staff() because D4-09 (who may see parents' details) is a
team decision.

**Decision.** Not built, recorded: (1) D4-09 mentor-plus-Guru: only a student's mentor and the
Guru (with a cover rule) pass get_guardians / get_consents / get_call_notes; the change is one
condition in each function, no app change; (2) close the Guru's direct reads too, with Guru-only
functions for revoking a consent and editing a guardian, so every read is logged; (3) store the
notice version at an adult's self sign-up (a profiles column filled from the sign-up metadata, as
the language is, #124); (4) log reads of the student list and record (name, dob, phone) as well.

**Why.** Each changes who can do their work at the desk or adds weight to every screen; the team
should choose after the pilot shows the need.

**Consequences.** Until then any active coordinator can still read any child's parent details, but
every such read is now in access_log.

## 152. A preview update asks "Type yes" like a production one; no flag skips it — 7 Oct 2026

**Context.** `publish-update.mjs` asked for confirmation only on `production`. A preview update
went out straight after the checks, and two went out by accident (audit D10-18 / D11-03). Testers
then got builds nobody meant to ship, and the update history could no longer be trusted for a
rollback.

**Decision.** Both channels stop after every check and ask *Type yes* (preview names the TEST app
on the testers' phones, production the LIVE app). Anything else, the end of the input (no
keyboard, as when a tool runs the command) or Ctrl+C publishes nothing and exits with code 1.
`--check-only` still stops before the question and before any upload. There is no `--yes` flag.

**Why.** The accidents came from running the publish command where a check was meant; a flag
that skips the question would be typed by the same habit. Nothing publishes unattended: CI only
checks, and a publish happens after Praveen says "publish". Whoever really has to answer from a
script can pipe the word in (`echo yes | npm run update:preview -- …`), which is as deliberate as
typing it.

**Consequences.** A chat that publishes for Praveen gets *not published* when its terminal has no
keyboard: run the command in Praveen's terminal, or pipe `yes` after his go. Closes D10-18, D11-03.

## 153. EAS CLI is an exact devDependency (24.11.0) and always runs from node_modules — 7 Oct 2026

**Context.** Every release command ran `npx eas-cli@latest`: whatever version was newest that
minute, with the Expo login that can publish to the class's phones (audit D11-02). The lockfile
had no eas-cli at all.

**Decision.** `app/package.json` devDependencies `"eas-cli": "24.11.0"` (exact, no `^`/`~`),
installed with npm so `package-lock.json` pins it and its whole tree. `publish-update.mjs` runs
`node_modules/eas-cli/bin/run` with Node, no shell and no npx. Docs and messages say
`npx eas-cli …`, which after `npm ci` runs the local copy (checked: `npx --no-install eas-cli
--version` = 24.11.0). 24.11.0 is what `@latest` gave for every run since its release on 5 Oct
2026; eas.json asks for `>= 24.0.0`, which it meets.

**Why.** A pinned, locked CLI changes only when someone upgrades it on purpose and the lockfile
records exactly what ran. Running the file with Node avoids the Windows `npx.cmd` shell, so the
update message no longer passes through one. `eas.json` "cli.version" is left as it is: eas.json
counts in the app's fingerprint ("Updating the Android app"), so tightening it would have needed a
new APK; the exact pin in package.json does the job.

**Consequences.** Fingerprint unchanged (185e839f): devDependencies without native code do not
count. `npm ci` in `app/` adds about 370 packages (only on developer computers and CI). Upgrading
= `npm install --save-dev --save-exact eas-cli@<version>` (a version at least a week old, release
notes read), `update:preview -- --check-only`, commit both files and the version in OPERATIONS.
If npx ever offers to *install* eas-cli, `npm ci` was not run: answer no. Dependabot PRs for
eas-cli are reviewed like any upgrade. Closes D11-02.

*Replaced in part by #257: the pinned version is 24.12.1 (12 Oct 2026).*

## 154. Release scripts read .env files with Expo's own parser and check the settings' shape — 7 Oct 2026

**Context.** The scripts read EXPO_PUBLIC_SUPABASE_URL and _KEY with a regex of their own: an
inline comment stayed in the value, a quoted value with a comment kept its quotes. The same wrong
value was then handed to Expo and found again in the bundle, so a site or update that could not
reach Supabase passed every check (audit D11-07).

**Decision.** `app/scripts/lib/env-file.mjs` parses with `parseEnv` of `@expo/env`, resolved from
the `expo` package (the copy `expo export` uses: Node's `util.parseEnv` rules for quotes, `export`,
`#` comments and CRLF, then `${VAR}` expansion, Expo's blocked names dropped).
`bundle-checks.mjs` `supabaseSettingsFrom` uses it, so `publish-update.mjs` and `export-web.mjs`
both read files the way Expo does. A new `settingsProblem` checks the shape: URL
`https://<20-character ref>.supabase.co`, key `sb_publishable_…` or a JWT with role anon;
`publish-update.mjs` refuses an EAS environment that fails it.

**Why.** Using Expo's parser rather than imitating it means the rules cannot drift apart when Expo
changes them. The shape check catches what a correct parser cannot: a value that was typed wrong.

**Consequences.** `export-web.mjs` (brief 13's file, not changed here) gets the parser through
`supabaseSettingsFrom` already; it can also call `settingsProblem` before its export. Tests:
`app/tests/release-scripts.test.mjs`. Closes D11-07.

## 155. Wider secret scan of bundles; signing material ignored by git; temp env file always deleted — 7 Oct 2026

**Context.** The bundle check knew only the Supabase secret key (and in Hermes bytecode only its
JWT form). `.gitignore` let `credentials.json`, a keystore at the root, private keys and `.npmrc`
be committed. The env file pulled from EAS was not deleted if reading it threw (audit D11-06,
D11-10, D11-19).

**Decision.**
- `bundle-checks.mjs` `secretIn` (and `holdsSecretKey` on top of it) also finds: JWTs with role
  `supabase_admin`, Supabase personal access tokens (`sbp_`), PEM private keys, Postgres addresses
  with a password, Google API keys (`AIza`), GitHub tokens (`ghp_`… and `github_pat_`), Slack
  tokens and webhooks, AWS access keys, and `EXPO_TOKEN` / `SUPABASE_ACCESS_TOKEN` /
  `SERVICE_ROLE_KEY` / `SUPABASE_DB_PASSWORD` followed by a value. In bytecode, where the app's own
  `'sb_secret_'` literal runs into the next string, a secret key is assumed when `sb_secret_`
  appears more than once or is followed by 31+ key characters that include a digit.
- Root `.gitignore`: `credentials.json`, `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `*.pem`, `*.key`,
  `.npmrc` anywhere, and `/.claude/` (local tool settings and worktrees; `app/.claude/settings.json`
  stays tracked). Nothing tracked matched before the change.
- `publish-update.mjs` deletes the pulled env file in `finally`, on any exit and on Ctrl+C.

**Why.** Each shape has a fixed prefix, so the current bundles give no false hits (TEST web export
and TEST Android bytecode checked 7 Oct 2026), while a pasted token of any of these kinds stops the
release. A token without a shape (an Expo access token, a bare password) cannot be found this way;
it must never be put in an `EXPO_PUBLIC_` variable.

**Consequences.** A fake secret planted in a copy of each export is caught (sb_secret_, sbp_, AIza,
PEM in web JS; sb_secret_ in Hermes bytecode). If a library ever adds its own `'sb_secret_'`
literal, the bytecode check stops publish-update with a clear message: look at the match before
changing the rule. Closes D11-06, D11-10, D11-19.
## 156. Every seva asset in the inventory, with a free-text category — 7 Oct 2026

**Context.** Praveen (07-10-2026): track ALL seva assets with QR stickers, not only the drums and kartals of C19 (#65).

**Decision.** Migration 0035 widens `inventory_items.kind` with `harmonium`, `instrument` (other instruments: gong,
conch, whompers), `sound` (speaker, mic, mixer, cables), `cover_bag` (drum covers and bags), `book`, `furniture`
(chairs, mats, stands), `altar` (altar and puja items); the six old kinds stay. Each item gets an optional `category`
(free text, ≤ 40) inside its kind, e.g. "Mixer", "Bhagavad Gita". Praveen chose this set over a minimal one.

**Why.** A fixed kind keeps the code prefix and the filters simple; the category covers the variety without a table
of categories to maintain.

**Consequences.** The screen title is now "Instruments and assets". The old app (before the OTA) shows a new kind's
key until it updates; it still works.

## 157. Each item has an unguessable label token and a human code per centre — 7 Oct 2026

**Context.** A printed label must lead to the item, survive being photographed, and still show nothing to a stranger.

**Decision.** `asset_token`: 22 base64url characters from a random UUID (122 random bits), unique, set by the
database and frozen for app users (`asset_locked`), like `students.qr_token` (#73). The QR holds the web link
`https://app.mridangaseva.com/i/<token>` (one constant, `ASSET_LINK_ORIGIN` in `src/lib/asset-link.ts`; a TEST build
and the TEST site print and open TEST links). `code`: prefix by kind + a number per centre and prefix, three digits
at least, e.g. KHOL-007 (the four mridanga kinds share KHOL; KART, HARM, INST, SND, BAG, BOOK, FURN, PUJA, OTH), from
`inventory_code_counters`, never reused, frozen for app users; correcting the kind keeps the code; a move to another
centre gives a new code there and clears `labelled_at` (the label shows the centre, so it is printed again).
Existing rows are backfilled in id order. Praveen chose prefix-by-kind over one running number.

**Why.** A web link opens from any phone camera, so a finder or a volunteer without the app still reaches a sign-in
page; the token, not the code, is the secret, so a code on a label cannot be guessed into another item's link.

**Consequences.** Real stickers only after app.mridangaseva.com is live (brief 8). Opening the link in the APP
instead of the browser needs Android App Links (intent filter with autoVerify + assetlinks.json on
app.mridangaseva.com): a native change for the production APK (brief 9).

## 158. Labels are printed from a web page laid out in millimetres — 7 Oct 2026

**Context.** The label stock is an A4 sheet of 18 (3 x 6), 63.5 x 46.6 mm, Avery L7161 / J8161 type (Praveen's pack,
scan of 06-10-2026). The app has no print module (no expo-print) and no native change is wanted.

**Decision.** `/staff/inventory/labels` (Guru and coordinators) builds the sheets as HTML in mm (`src/lib/label-sheet.ts`:
left 7.2, top 8.8, column pitch 66.0, row pitch 46.6) and prints them with the browser (`@page A4, margin 0`; the print
copy is a direct child of `<body>`, everything else hidden when printing). Per label: QR 30 mm with its 4-module quiet
zone (error correction Q, about 24 mm of code), "Mridanga Seva", the code, category or kind · centre, the name, and
"Seva property — if found: info@mridangaseva.com". A half-used sheet starts at any position 1-18; a test print draws
the outlines, centre marks and a 100 mm ruler on plain paper; a nudge (±5 mm right / down) for a printer that prints
off-centre is kept in that browser. After printing, "mark printed" stamps `labelled_at` (`mark_labels_printed`), so
"Not printed yet" lists what still needs a label. On a phone the page explains and opens itself in the browser.

**Why.** CSS mm at 100 % scale is exact on any printer, needs no dependency and no native module; HTML with no
script fits the web Content-Security-Policy (brief 13: inline styles allowed, no inline scripts).

**Consequences.** The print window must be at 100 % (Actual size), margins None, no headers or footers; the page says
so. Another label pack = change `SHEET` and note it here.
Calibration 07-10-2026 on Praveen's printer (test sheet scanned, \\cea-server\prop-scan\20261007202348.pdf, measured
against the blank-sheet scan): the 170 mm box measures 169.9 mm (scale right); row pitch 46.69 mm vs the labels' 46.70,
column pitch 66.0 vs 66.2; outlines within about 1 mm of the labels (0.8 mm low, 0.7 mm left, within the scan-placement
error). No nudge; the QR keeps about 3.7 mm and the text 3 mm from the label edge.

## 159. One scanner path for labels: /i/<token> and the in-app scanners — 7 Oct 2026

**Context.** A label is scanned by a phone camera app (opens the browser) or by the app's own scanners.

**Decision.** `/i/<token>` is open to every area but shows nothing itself: staff are forwarded to
`/staff/inventory/label/<token>`; signed-out visitors sign in first and land there (requested path); students and
subscribers see "Mridanga Seva property" with the finder address. The staff screen calls `resolve_asset(token)`:
the item opens, or "Label not found", or "Another centre's item" (a coordinator whose login has another centre;
the Guru sees every centre). The attendance scanner opens the item for a label and still checks students in and out
for `MS1:` codes (#17); a new "Scan a label" screen in C19 points a student code to attendance.

**Why.** One resolving function keeps the centre rule and the anon refusal in the database.

**Consequences.** Row-level security on `inventory_items` is unchanged (staff read every centre, as before 0035); the
per-centre rule applies to resolving, stocktake and mark-printed. Tightening the list itself per centre is left for
when a second real centre starts.

## 160. Stocktake: count a centre, save what was not seen — 7 Oct 2026

**Context.** With labels on every asset the team wants a regular count.

**Decision.** `inventory_stocktakes` (centre, started/finished by and at, note, counts, summary jsonb) and
`inventory_stocktake_items` (item, scan or tap, seen by, seen at). `start_stocktake(centre)` opens a count or joins
the open one (one open per centre); `stocktake_see(count, token | item)` answers seen / already / unknown /
other_centre / retired; `finish_stocktake(count, note)` saves expected (items in use), seen, lent (not seen but on
loan, with the holder) and missing (neither), with the lists. Written only by these functions; staff read; the Guru
may delete an open count started by mistake. Counts are in the audit log.

**Why.** An item out on loan is not missing; listing it separately avoids false alarms.

**Consequences.** Screens `/staff/inventory/stocktake` and `/staff/inventory/stocktake/<id>`. A missing item is
only listed: the Guru decides to retire it.

## 161. Asset labels: who may do what — 7 Oct 2026

**Context.** Audit rules: anon reaches nothing; every UPDATE/DELETE in SQL has a WHERE (#116 lesson).

**Decision.** anon has no right on the new tables or functions (checked: 401 / 42501 on TEST); `inventory_code_counters`
has no app access; the helpers `inventory_new_token`, `inventory_next_code`, `inventory_code_prefix`,
`inventory_centre_ok` are internal; `resolve_asset`, `mark_labels_printed` and the stocktake functions are for staff
(`not_allowed` otherwise). Lend, take back and condition checks stay as in #65 (condition only through a check, not
retired while lent) and are already recorded with who and when in `inventory_checks`.

**Why / Consequences.** supabase/tests checks all of it ("asset labels and stocktake (0035)"), plus the grant sweeps
and the WHERE sweep that run over every function.

## 162. Joining in two steps: a one-minute sign-up, then "About you" — 7 Oct 2026

**Context.** The team's minutes of 5 Oct 2026 list the fields a new student should give: name as per
Aadhaar, phone, email, date of birth, bio verify / face scan, referred by (yes → coordinator; no → a
source for analysis), a parent's or spouse's number, gender (female students with female
coordinators, male with male), region, blood group (not final), service areas of interest and
occupation. One long form at sign-up loses people; a form at the desk takes a coordinator's time.

**Decision.** Two steps (lead plan, 7 Oct 2026; checked against the team's field list of 7 Oct 2026
with Praveen's answers the same day). The sign-in screen's link reads **New student registration**.
**Step 1, A1 sign-up** (about a minute): the full name *as on the Aadhaar or other government ID* —
only the name is kept, never an ID number or a copy (#8) — and, optional, the **Dīkṣā (initiated)
name** as a second field (the team's "name as per Dīkṣā / Aadhaar": the legal name stays the one the
desk checks), email and password, the date of birth as three drop-downs (day, month name, year; no
native picker before the next APK, I18N P6), gender, the **mobile number** (required, E.164, the
centre's country first), the centre as country → city → centre (`centres.city`, the minutes'
"region") and **Interested in learning** (Mṛdaṅga, Kartāl, Harmonium as an option list, and "All",
which ticks every one). Under 18 the form stops and says to come to the desk with a parent (#150): a
minor's data needs the parent's consent first. The values go in the sign-up's user metadata;
`handle_new_user` keeps an adult's date of birth, the Dīkṣā name and the instruments (on
`person_details`), an active gender option, an active centre and a well-formed E.164 mobile (on the
profile), and ignores anything else, so a sign-up never fails on them. **Step 2, About you**
(#164) opens by itself after the first sign-in. **At the desk** (C2) the coordinator sees the
confirmed sign-ups of their centre (`waiting_sign_ups`), fills the form from one in a tap, checks the
name against the ID and takes the photo; the same optional questions are there for walk-ins.

**Why.** The sign-up asks only what routing needs (age, gender, centre); everything else waits until
the person is in and can skip it. Keeping the desk as the place where identity is checked keeps the
consent and photo rules where they already work.

**Consequences.** The language (#125), the expired-link card (#124) and the request id (#126) are kept.
A database without 0036 gets the old sign-up: the new app hides gender and centre when
`sign_up_choices` is missing, and the old `handle_new_user` ignores the extra metadata. Face scan:
#167.

## 163. One function a visitor may run: the sign-up's centre and gender lists — 7 Oct 2026

**Context.** Since 0025 the anon role holds no right at all in `public` (#77), checked by two sweeps.
Step 1 must offer the centres and the gender options before anyone is signed in.

**Decision.** `sign_up_choices()` (security definer, stable) is granted to anon: the active centres'
id, name, city and ISO country, and the active gender options with their labels. Nothing else — no
address, position, hours, people or counts. The sweeps allow exactly this one (`ANON_MAY_RUN`).

**Why.** These facts are public (the website lists the centres); a fixed list in the app would not
follow the Guru's edits, and an Edge Function only for this would be more to run. A single named
exception is easy to audit.

**Consequences.** Any other anon right still fails the test net. If the team ever treats a centre's
existence as private, drop the grant and ask the centre after sign-in.

## 164. About you: optional answers saved step by step, each with a stated purpose — 7 Oct 2026

**Context.** The minutes' remaining fields (phone, parents'/spouse's number, referred by / source,
occupation, service areas) are useful to the coordinators but not needed to join, and a login
waiting for the desk reads no table (0028).

**Decision.** `person_details` holds them: on the login (`profile_id`) until a student record exists,
then on the record (`student_id`; linking moves the row, drops the sign-up date of birth and copies
the login's gender to an empty `students.gender`). About you is four short steps — the sign-up's own
answers to correct (Dīkṣā name, instruments, gender if none) and the phone (E.164 with a country picker
defaulting to the centre's country, `libphonenumber-js/min`, pure JS, lead-approved; asked at sign-up
since Praveen's answer of 7 Oct 2026, the parents' / spouse's number stays here),
emergency contact (relation from a list, name, phone; required under 18 unless the desk's guardian is
on record, and then a parent or guardian), how they heard of us (a coordinator's referral code, or a
source with "Other: …"), education / occupation and service areas (tick any) — the team's "profile
settings". Each step saves its own keys
(`save_about_me`; a key not sent is left alone), "Skip for now" stores `about_state = 'skipped'` so the
form does not open by itself again; it stays reachable from the waiting screen and My profile. The
desk and C8 write the same through `save_student_details` (staff). Each step says why it asks; the
privacy notice lists the purposes. The Guru reads `person_details` directly; coordinators read it
through `get_student_details` (C8) and `waiting_sign_ups` (C2), which write to 0034's access log once
it is on the database (called by name). Every write is audited (`audit_person_details`).

**Why.** Saving per step keeps answers when a person stops half-way; optional and skippable keeps the
data to what people choose to give (DPDP data minimisation); reading through functions follows the
parents' contacts (0034, briefs 6/6b).

**Consequences.** No blood group (#167). The minor rule can only bite on a record without a guardian,
which 0028 already prevents; the check stays as a second line. Phone numbers outside India are
accepted in E.164; the desk's own phone field keeps its old check (10-13 digits).

## 165. Same-gender coordinators: referral code first, then the least loaded — 7 Oct 2026

**Context.** The minutes: female students with female coordinators, male with male; "referred by"
should name the coordinator — but a public list of coordinators' names must not exist.

**Decision.** Staff get a gender (`profiles.gender`, set by the Guru on G2) and a six-character
referral code (`profiles.referral_code`, letters and digits without I, O, 0, 1, made by the database
when someone becomes staff, shown on their own My profile). A student without a mentor whose gender is
known gets, by trigger (`assign_mentor`): the coordinator (or the Guru) whose code they gave, if the
gender matches; else the active coordinator of the student's home centre with that gender and the
fewest students in class (not Left, not withdrawn), the earlier staff member on a tie. Nobody fits:
the mentor stays empty and the Gurus get an inbox notice (once a day per student). The new mentor
gets an inbox notice. A mentor picked at the desk is kept; the Guru changes mentors as before (G2,
C8). C2's mentor picker now starts at "Automatic".

**Why.** A code ties a person to who brought them without exposing names; load balancing keeps
mentees spread; the Guru keeps the last word. The team's list asked for a coordinator list under
"Referred by: yes"; registration happens before sign-in, so such a list would be public — Praveen chose
the code on 7 Oct 2026. The desk (staff) still picks the coordinator from a list.

**Consequences.** Notices go to the inbox only: the Edge Function sends only the screens it knows,
and `/staff/students/<id>` would be refused as bad_url until it is redeployed with that screen
(later, with the next function change). Coordinators need a gender before matching works: the Guru
sets it on G2 for every coordinator once. A code stays with its person; a new-code button is not built.

## 166. Option lists are data the Guru edits (G12), and a report counts the answers (G13) — 7 Oct 2026

**Context.** The team has not settled the lists (gender options, sources, occupations, service areas)
and wants analysis of "how students found us".

**Decision.** `choice_options` (list, code, en/te/hi labels, order, active), seeded with the lead's
defaults and the team's instruments (`instrument`: Mṛdaṅga, Kartāl, Harmonium; "All" is a tick in the
app, not a row); the occupation list is shown as "Education / occupation"; read by class roles, written by the Guru only; codes never change, an option in use is
switched off rather than deleted, and male/female, the parent relations and every "other" cannot be
deleted; every change is audited. G12 (Running the class → Option lists) edits labels, order and
on/off and adds options. G13 (Running the class → How students found us) shows, for a range of dates,
the people who answered, by source, by the instruments they want to learn and by referring
coordinator, with how many are students now (`heard_about_report`, Guru only).

**Why.** The team can change wording and add choices without a new app version; codes keep old
answers readable.

**Consequences.** A "prefer not to say" gender is one G12 row away; with no coordinator of that
gender, those students wait for the Guru (#165).

## 167. Not built: face scan and blood group — 7 Oct 2026

**Context.** The minutes list "bio verify / face scan" and, as not final, blood group.

**Decision.** Neither is built. Face recognition stays Phase 3 with its own opt-in consent (biometric
data; `consents.scope = 'face'` exists since 0001) and its own APK; nothing about it is shown now.
Blood group is deferred: the team is undecided and it is health data, needed only if the class runs
events where it matters; the lead advised skipping it.

**Consequences.** Open with the team: gender options, blood group (if ever: optional, Guru-only, with
a purpose), face scan (Phase 3), the final option lists, the wording of "region" (now country → city →
centre).

## 168. Row-level security asks "who are you" once per query — 7 Oct 2026

**Context.** Audit D9-01: Postgres ran the helpers in a policy (`is_staff()`, `my_role()`, ...) once
for every row it checked. One coordinator's student list at 200 students made 30,000+ `my_role()`
calls; the cost grows with every year of visits and shares the free plan's CPU with the door check-in.

**Decision.** Migration 0037 rewrites every policy that calls one (125 of the 139 in public and Storage) with each
zero-argument helper and `auth.uid()` written as `(select ...)`, Supabase's own advice: the planner
then works it out once per statement. Each new policy text is the old one as Postgres prints it with
only those calls wrapped, so the rules are unchanged; the whole smoke test (1,280 checks of who may
read and write what) passed on the rewritten policies before any new check was added. Helpers that
take a column of the row stay as they are.

**Why.** Measured on a seeded PGlite (200 students × 150 visits): the staff student list 644 → 35 ms,
`my_role()` calls 32,711 → 20; the "visits today" count 548 → 8 ms.

**Consequences.** A new policy must wrap its helpers too: the test net fails on a bare call. Policies
are written in that style from 0037 on.

## 169. Indexes for the lookups the app makes — 7 Oct 2026

**Context.** Audit D9-02, D9-07: `student_overview` aggregated every visit of every student; the
per-student tables (calls, consents, guardians, tasks, status and level history) had no index on
`student_id`, and the "visits today" count had none on `check_in`.

**Decision.** `student_overview` reads the newest check-in and "here now" through the two visits
indexes (same columns, same answers; a test compares it with the full aggregate). Twelve indexes are
added (DATABASE.md "Backlog fixes (0037)"), each for a lookup the app, the daily job, erasure or a
policy subquery makes. Not every foreign key gets one: columns such as `created_by` / `decided_by`
are never searched by.

**Consequences.** Slightly slower writes on those tables (negligible at class size).

## 170. Rights: nothing open that the app does not use — 7 Oct 2026

**Context.** Audit D1a-10, D1a-11, D1b-10 and two brief-12 leftovers: the 0001 trigger functions
were still callable by signed-in people; signed-in people held TRUNCATE (which skips row-level
security), REFERENCES and TRIGGER on the 0001 tables; security definer functions searched `public`
only, which lets a session's temporary table stand in for one of ours; service_role could run the
daily jobs; `toggle_visit` / `scan_qr` said `not allowed` where every other function says `not_allowed`.

**Decision.** 0037 revokes the six trigger functions and TRUNCATE / REFERENCES / TRIGGER from anon and
authenticated (and their default privileges for future tables); sets `search_path = public, pg_temp`
on every security definer function and on the four helpers that had none; closes
`refresh_student_statuses`, `close_open_visits`, `send_due_push` and `link_login_to_student` to
service_role (pg_cron and triggers run them as the owner; the Edge Function calls only the claim /
finish functions); `toggle_visit` and `scan_qr` raise `not_allowed` and `student_not_found`. The app
has mapped both spellings since its first attendance screen (29 Sep 2026), so every build in use
shows the same message. `claim_due_push` / `release_push_claim` keep service_role until LIVE runs
the 0031 Edge Function.

**Consequences.** The test net checks the definer search path, the absence of the three table rights
and the service_role list; its OLD_TRIGGER_FUNCTIONS exception is gone.

## 171. Roll numbers past 9999, owner-given ones kept, impossible student values refused — 7 Oct 2026

**Context.** Audit D5-07 (number 10,000 of a year collided), FS1a-18 (an import or restore lost its
roll numbers, "frozen, never changed", #3), D1b-08 and FS1a-17 (a joining year of 2099 or a birth
year of 1850 was stored; the roll number's year comes from `joined_on`).

**Decision.** `assign_roll_no` pads to four digits only below 10,000; a number given by the owner (no
signed-in user) in the `MS-YYYY-NNNN` form is kept and the year's counter moves up to it; app users
still get the database's number. A new trigger `students_check_values` refuses, when written or
changed, `dob` outside 1900..today, `joined_on` outside 1900..tomorrow, a name over 120 characters,
an email that is not `x@y`, a phone over 30 characters. Phones are checked by length only: the
register form, the import and the sign-up use different formats (E.164 rules come with the phone
decision P2 of docs/I18N.md). Rows already stored are not checked.

**Consequences.** A restore keeps every roll number. A bad import row is refused with a code the
import screen shows as a generic error.

## 172. Small data rules from the audit backlog — 7 Oct 2026

**Context.** The Low/Info findings of audit dimensions 1 and 5 that needed no team choice.

**Decision.** In 0037: a switched-off waiting login is not linked on email confirmation (D1b-09); an
app user's new post dated in the past is published now (D5-09); posts go only to switched-on groups,
and only switched-on staff and students with a record join groups (D5-13); only the Guru deletes a
group, staff switch it off (FR-10, as #28 intended); "Seen by" counts a student with a switched-off
login under "no login" (D5-10); a visit left open from an earlier day is closed at that day's closing
time and the next tap checks in (D5-18); a null in `call_reasons` no longer disables the reason check
(FS1a-15); a kept attachment keeps its stored size and an absurd size is `attachments_invalid`
(FS1b-05); remarks of only tabs and line breaks are empty (FS1b-07); group names compare spaces as
people read them (FS1b-08); "my calls due" counts like C10's Mine (FS1b-09); materials are shown by
the levels' order (FS1a-22) and follow their item to a new level (R2G2-02); retirement times are
the database's and YouTube links hold no spaces or line breaks (R2G2-04); new logins are audited
and language-only profile changes are not (D1a-13).

**Why.** Each closes a gap the app's screens never use, so nothing the published app sends is
refused (0037 is safe for update 0126db5a on APK 0bfc5c14).

**Consequences.** New error codes `group_inactive`, `member_not_allowed` (the app shows its generic
message for both; neither can come from its screens).

## 173. Backlog items not changed, and those waiting for the team — 7 Oct 2026

**Context.** The rest of the database and performance backlog of audit brief 16.

**Decision.** Already fixed on main, no change: D1b-11 (scan_qr checks the role first, 0025), D5-04
and D5-08 (local days and the hourly close, 0033), D5-15 (items are retired, a ticked item cannot be
deleted or moved, 0013/0017), FS1a-16 (nobody changes their own role or switches themselves off and
the Guru role moves only in the dashboard, 0014, so the app cannot leave the class without a Guru),
D9-03 (0031 claims the push queue 500 at a time). App side (JS only): D9-05 the student home loads
the newest three posts and only the ids of the rest; D9-06 photos are cached by their path, not the
signed link; D9-09 the staff detail shows the reader's own receipt without loading again. Left for
an app-performance slice: D9-04 (lists past PostgREST's 1,000 rows; not reached at ~200 students),
D9-08 (virtualised lists, a UI change); D9-11 (lazy web routes) needs an app.json change, which moves
the fingerprint (next APK). Docs only: D1a-14 (DATABASE.md "Linking"), R2G3-04 (OPERATIONS.md).
**Waiting for a team decision** (audit Part B §6): D5-12 (which statuses each call outcome may
change, and a maximum pause, e.g. 90 days), FS1b-03 (tick only items up to the student's level and
dates after joining), FLOW-03 (does a drop-in visit end an agreed pause?), FS1b-06 (cap replies per
person per post, e.g. 5), FLOW-02 (a switched-off coordinator's scheduled posts: hold them for the
Guru, or send them as now).

**Consequences.** Each team answer is a small migration; none blocks the pilot.

## 178. Errors say what really happened: network, server, or no account yet — 9 Oct 2026

**Context.** Audit brief 16, app correctness backlog (dimension 6). Only the Chrome and phone
wording of a failed request counted as "no internet" (D6-05); every failed profile read said "Cannot
reach the server" (D6-06); a browser that blocks site storage showed an empty page (D6-18).

**Decision.** `isNetworkError` (data/errors.ts, used by every data file) also knows Safari's "Load
failed" and Firefox's "NetworkError when attempting to fetch". The auth provider keeps why a profile
is missing (`profileProblem`: network / server / missing) and the pending screen words each.
The Supabase client gets a store that never throws (lib/local-storage.ts `deviceStorage`): with
storage blocked the login lasts until the page closes instead of the app not starting.

**Consequences.** No database change. Unit test: tests/app-correctness.test.mjs.

## 179. A screen's address id is checked before anything loads — 9 Oct 2026

**Context.** D6-07: an edited or cut-off link (/staff/announcements/abc) reached the database, was
refused as bad input, and the screen said "no internet" with a Try again that could never work.

**Decision.** Every `[id]` route is wrapped in `RouteIdGuard` (components/route-id-guard.tsx,
lib/route-id.ts): a whole number from 1 up for the tables' ids, a UUID for students and logins,
"new" where the screen opens an empty form. Anything else shows "page does not exist" with Go to
home, as for an unknown address.

**Consequences.** A new `[id]` screen should use the guard too.

## 180. Attendance: a repeated scan changes nothing; the search finds by words and shows status — 9 Oct 2026

**Context.** D6-09: a scan retried after a lost answer, or the same card on two phones, could check
a student out and straight back in (0-minute visits). FS2-04: "K. Sri" found nobody. FS2-05: the
search hid Left/Paused and silently stopped at 20.

**Decision.** 0038's `toggle_visit` locks the student row (as `mark_visit` does), and a QR scan
within 30 seconds of a check-out answers `already_out` (0030 did the same for a check-in). The C5
search turns punctuation into spaces and looks for every word of the name in any order, or the
whole text in the roll number (lib/student-search.ts); rows show a Left / Paused label (checking
them in makes them Active); "Showing the first 20, type more" when there are more.

**Consequences.** A real re-entry within 30 seconds of leaving needs a tap ("In") instead of a scan.
(The search itself runs in 0039's search_students from #188.)

## 181. Saving an announcement or group never undoes someone else's change or loses files — 9 Oct 2026

**Context.** D6-10: a save whose answer was lost removed its own new files although the post had
been saved. D6-15: an edit silently overwrote another staff member's change. FS3-03: the author
removing the Guru's file from their post orphaned it (Storage allows that only while it is listed).
D5-14: files removed before a save that then failed left dead entries.

**Decision.** (data/announcements.ts) On a network error the app reads the row back: a post found
(same author and title in 15 minutes, holding the first new file) counts as saved; otherwise it
says "it is not known whether this was saved, check the list" and keeps the files. An edit reads
the announcement again first and stops when it differs from the version the form was filled from
("Load the latest version"). Someone else's dropped files are removed before the save, while still
listed; my own after it. Entries whose file is gone are dropped on every save. Delete removes
someone else's files first and my own after the row. Groups save with the old name and purpose as
a condition and say when someone else changed them meanwhile.

**Consequences.** Unused files can still be left when the network fails at the wrong moment;
OPERATIONS.md "Files no announcement uses" covers them.

## 182. Typed values get limits: dates ahead, text length, phone and PIN, the server's age — 9 Oct 2026

**Context.** D6-14: a year typo paused a child until 2062 or hid a post for decades. FS2-09: call
notes, names and the area had no length limit. D6-21: "0000000000" and PIN "012345" were accepted.
D6-13: with the phone's clock a day off, a student turning 18 could not be registered.

**Decision.** A pause or "coming back on" date at most a year ahead (app 365 days, 0038 trigger on
call_logs 366, error `next_date_too_far`); an announcement scheduled at most 6 months ahead (app 182
days, 0038 trigger 183 days, `publish_too_far`). Call note 1000, area 100, guardian name 120
characters (0038 checks, NOT VALID: old rows untouched); the register form limits name and guardian
name to 100, emails to 254. A phone without + is an Indian mobile (10 digits from 6-9, a leading 0
allowed); with + it must be a real number (libphonenumber); a PIN never starts with 0 (also 0038).
When the database answers "minor" the register form opens the parent's part and says why.

**Consequences.** The year cap on a pause is a typo guard, not the team's policy: D5-12 (a maximum
pause, e.g. 90 days) is still the team's to decide and would lower it.

## 183. Small app behaviours from the backlog — 9 Oct 2026

**Decision.** D6-16: the dialler and file opening say when they cannot open (number shown to dial by
hand); a malformed app link opens the home screen. D6-17: Enter while a sign-in, sign-up, password or
join request runs does nothing. D6-19: the student home and the follow-up queue show only their
newest load (lib/latest-load.ts). D6-20: after a sign-out the person did not ask for, sign-in says
"You were signed out" (auth/session-end.ts); drafts of long forms are not kept (left for later).
FS2-07: "Open profile" on the call screen goes back to the profile when it opened the call screen.
FS2-10: the student home greets with the record's name once loaded. FS4-03: announcement file links
are fetched again after 50 minutes and when the app returns. FS4-07: words typed while a reply is
sending stay in the box. FS3-09: a failed update check is tried again at the next return to the
front, not 30 minutes later.

## 184. A child's record never holds a parent's email — 9 Oct 2026

**Context.** D1a-15: a login is linked to the student whose email it signs up with (0002). A
parent's email on a child's record makes the parent's login act as the child (pushes, the child's
data), and with siblings only the first child is linked.

**Decision.** The audit's Phase 1 default, until the team decides on parent logins: 0038 refuses a
minor's email that is any guardian's email (`guardian_email_on_minor`), checked on the student and
on the guardian; the register form says so under the email. An adult student may share an email
with a child's guardian (a parent learning too).

**Consequences.** Parent logins, if wanted, need a guardian login model (team decision).

## 185. Backlog items not changed — 9 Oct 2026

**Decision.** FS4-04 (Restart does nothing when the reload fails): fixed on main (08e33e5, a 10 s
wait and an error notice); the APK's embedded copy changes with the next APK (brief 9). FS1a-21
(visits recorded at the home centre): the audit's default holds, home centre until a second centre
exists. Not cited by the audit but the same pattern, left as they are: other screens' focus reloads
(D6-19 fixed the two cited), and `openURL` without a catch on the lesson, centre map and label links.

## 186. Every sign-out clears what the person left on the device — 9 Oct 2026

**Context.** On a shared family phone or computer the next person could find the last person's
traces: the QR card stayed when the server ended a login (D3-05, only Sign out deleted it), the
notification list kept their announcements (FLOW-04), photos stayed in the image cache and the
pickers' copies in the cache folder (D3-09), and the push token was deleted only if this app run had
registered it (D2-05).

**Decision.** `lib/device-traces.ts` runs on every SIGNED_OUT event, so also when the server ended
the login: it deletes the saved QR card, dismisses this app's notifications, clears expo-image's
memory and disk cache, and deletes the ImageManipulator, DocumentPicker and ImagePicker cache
folders. The push token is also kept on the device (`pushToken`), so Sign out deletes it in a later
app run too; the copy goes only when the delete worked. While nobody is signed in, a notice that
still arrives is not shown while the app is open.

**Consequences.** Photos stay in the disk cache while the person is signed in, so a screen opens
them without downloading again (D9-06); they go at sign-out, not when an announcement is deleted.

**Addendum 13 Oct 2026 (#283).** Recordings too: the "Record myself" takes and expo-audio's cache folders.
The OS still shows a notice that arrives while the app is closed and nobody is signed in: that needs
the token delete to have failed (no internet at sign-out) and nobody to have signed in since.

## 187. File links: the app chooses their life; phones open files with a two-minute link — 9 Oct 2026

**Context.** D3-08: Storage signs a link for whatever time the app asks; the hour of #32 is the
app's choice, and a link opened in a browser stays in its history and works for anyone until it
expires. D3-15 / D4-16: type and metadata checks on uploads are in the app only; PDFs keep their name
and inner details (author); EXIF removal from photos was assumed, not checked.

**Decision.** Screens keep loading hour-long links to show files (FS4-03 renews them). On a phone,
Open asks for a fresh link that works 2 minutes (`OPEN_LINK_SECONDS`) and opens that. The web opens
the screen's link straight from the tap (a browser blocks a tab opened after waiting). The
announcement form tells the author, once a PDF is added, that readers see its name and inner
details. Photos: expo-image-manipulator re-encodes with Android's `Bitmap.compress` and iOS's
`jpegData`, neither of which writes EXIF (read in the installed module's source, 9 Oct 2026); a
check on a real phone photo is still worth doing once.

**Consequences.** Storage's checks stay as 0010 set them (size, MIME list, path); a staff uploader
could still send a PDF with metadata. Stripping PDF metadata or checking types on the server would
need an Edge Function: not done.

## 188. Staff search students through a function, not the address — 9 Oct 2026

**Context.** ENT-08: the C5 and lending searches put the typed letters of a child's name into the
request address (`?or=(full_name.ilike...)`), which platform request logs keep.

**Decision.** 0039 `search_students(p_text, p_limit, p_with_left)`, called by POST: every word of the
name in any order, or the whole text in the roll number (#180's rules), `%` and `_` searched as
letters, staff only, runs as the caller (row-level security), at most 50 rows. C5 and lending use it;
lending leaves Left students out.

**Consequences.** The staff-name part of the lending search still filters by address (adults'
names). The app's `studentSearchFilter` is gone; `cleanSearchText` stays.

## 189. A switched-off person's phones are forgotten at once — 9 Oct 2026

**Context.** D2-06: push tokens were never removed for people switched off or put back to waiting;
the queue no longer sends to them, so the rows only kept device identifiers, many of minors.

**Decision.** 0039 trigger `profiles_forget_phones`: when `active` turns false or the role is no
longer guru, coordinator or student, that person's push tokens are deleted; the ones kept today are
deleted once.

**Consequences.** A token of someone still using the app but not opening it is kept; an age limit
(the audit proposes 60 days) waits for the team's retention periods (audit section 6 H).

## 190. A reset link names the account and offers to sign out of the browser — 9 Oct 2026

**Context.** FLOW-05: links in emails open the web version, which signs the person in there; someone
who uses the Android app or a borrowed computer stayed signed in in that browser. D3-03: a crafted
link can swap the browser's session, and the reset screen did not say whose password was set.

**Decision.** The reset screen shows "Setting a new password for <email>" and, beside Save, "Save
and sign out of this browser" with a note for shared computers and Android users. On the phone,
the sign-up and forgot-password confirmations say the link opens in the browser and to sign in in
the app afterwards (en/te/hi).

**Consequences.** token_hash links with `verifyOtp` (D3-03's real fix) wait for the team (#192).

## 191. Small hardening from the security backlog — 9 Oct 2026

**Decision.** D3-12: a requested path is decoded once, `\` read as `/`, slashes collapsed and dot
segments resolved before it is compared with an area (`requested-path.ts pathOnly`); control
characters count as nothing asked for; a failing `getInitialURL` opens the home screen. D3-11: the
Supabase URL and key are trimmed before the secret-key check. D2-14: push bodies are cut by code
points, never inside an emoji. D2-16: `SUPABASE_SECRET_KEYS` is read only as an object of non-empty
texts ("default" first), else the legacy key; the variable used is logged once per start, never the
key. D4-17: the minor-consent refusal names the roll number, not the child (0039).

## 192. Security backlog items not changed, and those waiting for the team — 9 Oct 2026

**Decision.** Waiting for the team, with the default this chat would take: D3-03 token_hash email
links with `verifyOtp` (after the pilot); D3-04 recovery marker kept until USER_UPDATED, so a reload
still asks for the new password; SURF-04 CAPTCHA (Turnstile) on sign-up and reset, decided after the
pilot's sign-up volume; FS2-08 a minor's guardians listed first on the call screen. Not changed:
D3-13 (custom scheme carries no secret; App Links come with brief 9), D3-16 (Confirm email on
wherever real emails exist, OPERATIONS step 4; LIVE is decision A), D2-12 (fixed by #114). D3-11's
build-time guard needs an `eas-build-pre-install` script in package.json: brief 9.

## 194. pg_cron's run history is kept for 7 days — 9 Oct 2026

**Context.** pg_cron writes one row to `cron.job_run_details` per run, and nothing deleted them: the
every-minute push job alone adds about 1,440 rows a day to the free plan's 500 MB (audit D2-08).

**Decision.** 0040 schedules `mridanga-cron-history-purge` (02:15 UTC daily), deleting rows that
ended more than 7 days ago, as Supabase advises for pg_cron.

**Why.** The weekly health check (OPERATIONS "Scheduled jobs: health check") reads the last 2 days
and each job's last success; 7 days cover it with room for a missed Monday.

**Consequences.** Ten jobs instead of eight. Older failures are gone after a week: the health check
is the record.

## 195. Files no announcement lists are removed daily — 9 Oct 2026

**Context.** An upload whose post was never saved, or a file the app failed to delete offline, stayed
in the bucket for ever; a coordinator (or a stolen staff session) could fill the 1 GB with them
(audit D1b-07). Audit Part B §6 proposed a daily clean-up job rather than a quota.

**Decision.** 0040 adds `orphan_announcement_files()` (service role only): up to 100 files in
`announcement-files`, over a day old, that no announcement lists, oldest first, and none at all while
the announcements table is empty (a restore half done). The daily job `mridanga-orphan-files` (02:00
UTC) asks the Edge Function to clean up when the list is not empty; the function deletes them
through the Storage API, as it does for expired recordings (#52). No upload quota.

**Why.** The bucket holds only announcement files (materials, bills, recordings and audio have their
own buckets), and the app uploads just before saving the post, so a day-old unlisted file can never
be shown. Storage files must go through the Storage API: a delete in SQL leaves the bytes.

**Consequences.** Needs the function deployed again; until then nothing is removed (the manual query
in OPERATIONS still works). A post saved more than a day after its upload would lose its file — the
app never does that.

## 196. A staff login that did work is anonymised in place — 9 Oct 2026

**Context.** 13 columns record who did what (`created_by`, `marked_by` …) with no delete rule, so a
staff login that did any work cannot be deleted; switching it off keeps name and email for ever
(audit FS1a-14). Part B §6 proposed an anonymise-in-place procedure over `ON DELETE SET NULL`.

**Decision.** 0040 adds `anonymise_staff(profile, reason, reference)`, run by the owner in the SQL
editor only, for a switched-off coordinator or Guru login that is not the caller's: an idle login is
deleted outright; otherwise the login's sign-in email becomes `<id>@former-staff.invalid` and its
sign-up details go, the profile becomes "Former staff" without email, phone, duty hours, gender,
referral code, treasurer or editor flags, the phones are forgotten, the profile's own audit rows
and any row holding the old email are redacted, and a tombstone goes into `erasures`
(`staff_profile`). Runbook: OPERATIONS "Staff who leave".

**Why.** Records keep a "done by" that still resolves (reports, history, audit); `SET NULL` would
lose who registered or marked what. The person's identifying data is gone.

**Consequences.** Tried on TEST on 10 Oct 2026 (inside a block that rolled itself back): for a
coordinator with work it answered `login_deleted: false, login_scrubbed: true, audit_rows_redacted: 15`
and the sign-in email became `<id>@former-staff.invalid`, so the SQL editor's owner may change
`auth.users`. Should Supabase ever refuse it, the result says `login_scrubbed: false` and the runbook
bans the login in the dashboard. Audit rows about other records the person changed keep their values (they are about
students, not about the staff member).

## 197. Edge Function deploys: settings in the repository, an exact supabase-js — 9 Oct 2026

**Context.** The push function needs the gateway's JWT check off, which lived only in the deploy
flag `--no-verify-jwt`; a redeploy without it stops push with a 401 the runbook blamed on the push
secret (audit D2-09). The function imported `npm:@supabase/supabase-js@2`, so each deploy took
whatever 2.x was newest (D2-10).

**Decision.** `supabase/config.toml` sets `verify_jwt = false` for `notify-announcements` (the CLI
reads it on every deploy; the flag stays in the commands too). The import names an exact version,
2.117.2 (the app's), and `app/tests/repo-guards.test.mjs` refuses a range. The runbook tells the
gateway's 401 from the function's own `{"error":"not_allowed"}`. No `deno.lock`: `--use-api` builds
on Supabase's side.

**Consequences.** Upgrading supabase-js in the function is a deliberate edit and deploy.

## 198. Build hooks and agent settings are guarded — 9 Oct 2026

**Context.** The fingerprint ignores npm scripts (#35), but EAS Build runs npm's install hooks and
its own `eas-build-*` hooks, so such a hook could change the APK unseen (audit D11-09). Tracked agent
settings (`app/.claude/settings.json`) and `app/AGENTS.md` steer an AI agent in a maintainer's
session, which holds publish rights (D11-20).

**Decision.** The skip stays (removing it moves the fingerprint, a new APK). `app/tests/repo-guards.test.mjs`
(run by CI) fails when `app/package.json` gets an install, prepare or `eas-build-*` script, and when a
tracked `.claude` file is anything but a `settings.json` holding only `enabledPlugins`. CODEOWNERS
names `app/.claude/` and `app/AGENTS.md`.

**Consequences.** Adding such a hook, or agent hooks and permissions in git, needs this decision
changed first. CODEOWNERS only enforces review once `main` has a ruleset (Praveen, GitHub settings).

*Replaced in part by #256: the settings guard `eas-build-pre-install` is the one allowed build hook.*

## 199. Operations trade-offs accepted — 9 Oct 2026

**Context.** The rest of the operations and build backlog of audit brief 16 (dimensions 10, 11).

**Decision.** Accepted and written down:
- **LIVE project ref in the public repository** (D11-18): a Supabase project ref is in every copy of
  the app and web site anyway; the scripts need it to refuse the wrong project. The protection is
  row-level security, Confirm email and the publishable key, not a hidden address.
- **Push endpoint without rate limiting** (D2-13): it refuses every call without the 64-character
  secret before touching the database; the risk is the free plan's 500,000 calls a month. The
  monthly usage check (OPERATIONS) watches it.
- **npm audit** (D11-17): on 9 Oct 2026, 55 advisories (31 high), all in build tools (EAS CLI, Expo
  CLI, Metro, config plugins) that run on the maintainer's computer or EAS, except query-string /
  decode-uri-component in expo-router (a malformed address can slow only the phone that opens it).
  Fixed by the Expo SDK upgrade with the production APK (brief 9); never `npm audit fix --force`.
- **Free project pauses after 7 idle days** (D10-14, #6): a weekly check until the pilot, and the
  restore steps in OPERATIONS; the jobs resume by themselves.
- **No crash reporting** (D10-17): a monthly usage check now; a root error screen is app work for an
  app chat; a crash reporter only after a privacy review (minors' data).
- **APK install links expire** (D10-06): each release APK is kept with its SHA-256 in the team's
  drive (OPERATIONS "Each build").

**Consequences.** Revisit D11-18 and D2-13 if Supabase adds per-function rate limits or the class
leaves the free plan.

## 200. Every web page has its own title — 9 Oct 2026

**Context.** D7-03: Expo Router turns React Navigation's document title off, so every browser tab
read "Mridanga Seva" (WCAG 2.4.2).

**Decision.** Every navigator passes `screenLayout={documentTitleLayout}` (src/lib/document-title.tsx):
the focused screen's `title` option and the app's name, "Attendance · Mridanga Seva", in the app's
language. Navigators nest, so the deepest focused title wins. The root screens without a header
(sign-in, sign-up, pending ...) get a `title` option only for this. Phones: nothing changes.

## 201. Controls work by keyboard, are named, and are 48 dp — 9 Oct 2026

**Decision.** On the web, Space ticks a tick box and picks a radio (src/lib/space-key.ts, D7-05;
react-native-web presses only buttons on Space). Choice rows and tick-box rows are at least 48 dp
(D7-18). A ChoiceGroup without a visible label takes an `accessibilityLabel` (D7-10, D8-12); the
language names carry `lang`. A row's button says which row ("Check in, Arjun Rao", D7-11). A text
field's hint or error is its `aria-describedby`, and an error sets `aria-invalid` (D7-13). Titles are
h1, subtitles h2 (D7-09). The splash and the scanner frame are named (D7-21). Sign out shows a
spinner and runs once (components/sign-out-button.tsx, D7-14). Not done: arrow keys inside a
radio group (Tab and Space work).

## 202. State is said in words, not only colour or glyph — 9 Oct 2026

**Decision.** "Fields marked in red" becomes "the fields that show a message under them" (D7-08).
The student profile's syllabus list says "ticked 05-10-2026" / "not ticked yet" (the ✓ and ○ are
hidden from screen readers), the promotion criteria say "met" / "not met", the tick box draws an
icon of fixed size, and a "—" stat tile is read as "no visit yet" (D8-13, D7-12). The connection
error no longer claims the cause is the internet (D8-06; the loaders still return only null, so
the real cause is not shown — that needs every loader changed).

## 203. Typed dates, times and phones — 9 Oct 2026

**Decision.** Digits typed with a Telugu, Hindi or other Indic keyboard are read as 0-9 in dates,
times and phone numbers (src/lib/digits.ts, D8-16). A time may be typed as 12-hour with am / pm,
"6:30 pm" = 18:30; the hints still show 24-hour time and add "(6:30 pm also works)" (D8-17); a bare
"6:30" is still morning. Date fields open the phone pad on Android (`DATE_KEYBOARD`, D7-15);
'numbers-and-punctuation' is iPhone-only. Time fields keep the full keyboard on Android (am / pm).

## 204. A home tile opens the list its number counts — 9 Oct 2026

**Decision.** FS2-06: C1 "My calls due" opens Follow-up with `?scope=mine`; G1 "In class" opens the
student list with `?status=notLeft` (a new filter, everyone but Left); a row of G1's follow-up list
opens Follow-up with `?assignee=<profile id>` (or `none`), which shows "Only the calls of: …" and a
button back to everyone.

## 205. Translation checks and wording fixes — 9 Oct 2026

**Decision.** `npm test` (tests/i18n.test.mjs, D8-22) checks: Telugu and Hindi have exactly the
English keys; every string has the same `{{placeholders}}` in all three; plural keys come as
`_one` / `_other` pairs; every literal `t('…')` key exists; and the limits written into the texts
(announcement title, body and reply, group name and purpose, syllabus remark, password) equal the
constants the code checks (D8-14: a limit change now fails the test instead of staling three
files). Counts use plural keys ("last week", "1 student … does not", D8-07). Telugu level names lose
స్థాయి, which the templates already add (D8-08); the Telugu call button reads "కాల్ చేయండి — {{who}}"
(D8-09); tempo is లయ / लय and a Hindi try is "कोशिश 2" (D8-10). An unknown level reads "Level 4"
(FS4-08), a file just under 1 MB "1.0 MB" (FS4-09). Auth errors for an ended sign-in, an expired
link, closed sign-ups and a switched-off account have their own messages (D8-04). Telugu and Hindi
stay drafts for native review (docs/TRANSLATIONS.md).

## 212. Phase 3 reads a location only at a check-in or check-out, never tracks — 9 Oct 2026

**Status: decided by Praveen 9 Oct 2026 (relayed by lead chat 5, on the Guru's face-scan request);
face-scan prep, branch `face-prep`. Nothing is built yet.**

**Context.** The Guru wants face-scan attendance bounded by GPS like the railways' UTS app, so parents
know when their children were at class. India's DPDP Act s.9(3) forbids "tracking or behavioural
monitoring of children"; the Fourth Schedule exemption (Rule 12, Part A item 3, educational
institutions) is uncertain for this class and is not relied on (docs/phase3/DPIA_DRAFT.md §4).

**Decision.** No live or continuous location tracking at all. In Phase 3, as already for staff
check-ins (#55, #70), a phone's location is read only at the moment a person checks in or out, in the
foreground, and compared with the class's area (geofence); never in the background, on a timer or
while the app is merely open. Verifiable parental consent is taken for minors, and face recognition
is a separate biometric opt-in (#213). Only the result (inside/outside, distance in metres) is stored, never
the position. No live location, location history or "where is my child" view is built. The APK keeps
background location, the Android foreground service and iOS background location switched off.

**Why.** It meets s.9(3) without the exemption, keeps the app out of Google Play's background-location
review, and is all that an attendance record needs.

**Consequences.** Self-scan geofencing (blocking outside the area) and parent notices are proposals in
docs/phase3/ and need the Guru's answers (DECISIONS_FOR_GURU.md); any future location feature must fit
this rule or come back as a new decision.

## 213. Face scan only by its own opt-in; QR and coordinator check-in stay for everyone — 9 Oct 2026

**Status: decided (restates #8, #167 and the lead's condition of 9 Oct 2026); face-scan prep, branch
`face-prep`. Nothing is built yet.**

**Context.** #8 and #167 keep faces behind their own consent (`consents.scope = 'face'`, since 0001).
Audit D4-18 asked for a QR alternative for every student. A Swedish school was fined in 2019 for face
attendance partly because pupils' consent was not free when no real alternative existed
(docs/phase3/DPIA_DRAFT.md §5).

**Decision.** Face recognition is used only for a student with a current, separate face consent (the
parent's for a minor, verifiable as #16/#74), never bundled with the data or photo consent. QR (#17,
#21) and coordinator check-in remain available to every student permanently; a student without face
consent is not reminded, marked or treated differently anywhere. Withdrawing face consent deletes the
face template and changes nothing else.

**Why.** Consent is only free when saying no costs nothing (DPDP s.6(1)), and children's data needs the
parent's verifiable consent (s.9(1), Rule 10).

**Consequences.** Phase 3 keeps the QR scanner and My QR. The proposed details (who scans, minimum age,
retention, the child's own refusal, the impact-assessment gate) are in docs/phase3/ for the Guru;
DECISIONS #214-#215 stay unused until then.

## 216. A crash shows a page with Try again, never a blank screen — 10 Oct 2026

**Status: decided by the lead's brief (audit D10-17 default "ErrorBoundary now; a reporter only after a privacy
review"); branch `app-leftovers`.**

**Context.** D10-17: nothing caught a rendering error, so a crash left a blank page (web) or a white screen
(phone), and volunteer testers could only say "it stopped".

**Decision.** The root layout exports Expo Router's `ErrorBoundary` (src/components/crash-screen.tsx): "Something
went wrong" in en/te/hi, **Try again** (renders again), **Go to the home screen** (then tries again), how to report
it, the error's first line (not translated, at most 200 characters) and the version line. It replaces the whole
app, providers included, so it needs none of them; it hides the splash in case the crash came first. Only the
stable root `ErrorBoundary` is used, not the per-navigator `unstable_screenErrorBoundary`. **No crash reporter:**
nothing leaves the phone; a reporter (Sentry or similar) needs a privacy review first, minors use the app.

**Consequences.** A crash in one screen takes the tabs with it until Try again or Go home; acceptable for a
crash. The error line on screen can be read out or photographed for a bug report.

## 217. Staff screens offer a waiting update; the app looks every 30 minutes in front — 10 Oct 2026

**Status: decided by the lead's brief (FLOW-06); branch `app-leftovers`.**

**Context.** FLOW-06: the "new version ready" notice was only on the three homes; a door phone left on the
scanner for a whole class never saw it, and the app checked for updates only when it came back to the front.

**Decision.** The staff layout sets `UpdateNoticeOnScreens`; `Screen` then shows the same notice and Restart
button at the top of every staff screen that has no header band (the homes keep theirs under the greeting). The
pending screen shows it too. While the app stays in front it asks every 5 minutes whether a check is due; the
check itself still runs at most every 30 minutes and only in a release build (`useUpdateChecks`). Student screens
are unchanged (their home shows it).

**Consequences.** A downloaded update reaches the door phone within about 30 minutes plus a Restart tap. The
two-cold-start recovery from a broken update stays as documented in OPERATIONS ("Rolling back", #194-#199).

## 218. Long forms are kept after a forced sign-out, for the same login only — 10 Oct 2026

**Status: decided by the lead's brief (D6-20 part 2); branch `app-leftovers`.**

**Context.** D6-20: when the server ends a login (refresh token revoked or expired, password changed elsewhere)
a coordinator lost a half-filled registration or announcement. Part 1 (#178-#185) added the sign-in notice.

**Decision.** src/lib/form-drafts.ts. Register a student (C2/C3), New announcement and Edit announcement report
what they hold while open (`useDraftKeeper`); **nothing is written to the device then.** Only on a sign-out the
person did not ask for (`noteSignedOut`) are the open forms written to local storage under the login's user id.
The form fills itself from the draft when the same login opens it again, says so ("What you typed is back") with
a button to start empty / use the saved version, and deletes the draft from the device. Rules:
- another login never gets it, and the auth provider deletes it as soon as another login signs in;
- the person's own Sign out deletes every draft (a shared phone keeps nothing);
- a draft older than 7 days is ignored and deleted;
- consent ticks are never brought back (the coordinator ticks them again after checking the signed form);
- files picked on the phone are not kept (the sign-out deletes them, #186); the form says to add them again;
- the edit draft keeps the version it started from, so a save still notices someone else's change (D6-15);
- a registration draft keeps its request id, so a save whose answer was lost is still not stored twice (#126).
The sign-in notice (endedBody) now says a registration or announcement being written is kept.

**Consequences.** A minor's registration draft can sit on the coordinator's phone for up to 7 days after a
forced sign-out (in the app's local storage, like the login itself). Other forms (call notes, events, polls,
assessments) are not kept; add them to the same module when needed.

**Addendum 13 Oct 2026 (#284).** The limit is now 3 days, and an old draft is deleted at every app start.

## 219. The last English-sentence errors become codes; roll_no is NOT NULL — 10 Oct 2026

**Status: decided by the lead's brief (D13-02, D13-05); migration 0042, branch `app-leftovers`.**

**Decision.** 0042 re-creates `guard_student_update` (`roll_no_frozen`, `status_needs_call_log`, the status in
`detail`) and `guard_profile_update` (`role_guru_only`) and sets `students.roll_no NOT NULL` (it stops with
`roll_no_missing` and changes nothing when a student without one exists). A smoke check now fails when any
function of ours raises a message with a space in it. **The app keeps understanding `not allowed` and
`student not found`** (data/attendance.ts) until LIVE has run 0037 (brief 8): LIVE is at about 0011 and gets the
next update's JavaScript first.

**Generated types (rest of D13-05): deferred.** `supabase gen types` and `createClient<Database>` would type every
query; the app's hand-written row types and casts (every loader) would all have to change in one go. Doing it
is a slice of its own, after LIVE reaches 0042 so the types match both projects.

## 220. Comments on the helper functions and the core columns — 10 Oct 2026

**Status: decided by the lead's brief (D13-06); migration 0042, branch `app-leftovers`.**

**Decision.** 0042 adds `comment on` for the two 0001 functions the audit named that still had none
(`guard_student_update`, `handle_user_confirmed`), `guard_profile_update`, the helpers row-level security and the
storage rules call (`is_treasurer`, `my_student_id`, `event_visible_to`, `inventory_centre_ok`, the
`*_readable` rules ...) and 29 non-obvious columns of students, profiles, guardians, consents, visits, call_logs,
follow_up_tasks, centres, roll_counters and status_history. Existing comments are not rewritten. The smoke test
reads 0042's own `comment on` lines and checks each landed.

**Consequences.** About 50 later functions (push lines, guards of Phase 2 tables, pgcrypto's own) and many Phase 2
columns still have no comment; the function names and their migration's header explain them. Not worth a
migration on their own; add comments when a migration touches them.

## 221. Radio groups follow the web's keyboard pattern; every group is named — 10 Oct 2026

**Status: decided by the lead's brief (a11y leftovers of #201); branch `app-leftovers`.**

**Decision.** `useRadioKeys` (src/lib/space-key.ts), web only: a group of radio buttons is one Tab stop, at the
chosen button (the first when none); the arrow keys move to the next / previous button, round at the ends, and
pick it; Space picks. Used by ChoiceGroup and the label sheet's start grid; the drop-down list (SelectField) moves
the focus with the arrows without picking, since picking closes it. The ten ChoiceGroups without a visible label
or `accessibilityLabel` got one (assessment level and tracker filters, import rows, fund direction, report range,
week start, event answer, performer part, events/polls switch, poll vote), reusing the section title where it
says the same. Phones: nothing changes (no keyboard focus).

## 222. The language is saved through the data layer, never by changing the profile in place — 10 Oct 2026

**Status: decided by the lead's brief (D13-12); branch `app-leftovers`. D8-01's behaviour unchanged.**

**Decision.** `fetchProfile` only reads. After a fetch, `adoptProfile` remembers the profile and keeps the
languages in step as before (#48): a language picked on this device and not saved yet goes to the profile (this
is what keeps the phone's language at the first sign-in, D8-01); otherwise the profile's language is applied. The
save is `saveMyLanguage` (data/my-profile.ts), which reports a refusal instead of hiding it; the provider puts the
new language in a new profile object (`useAuth().saveLanguage`, used by the language picker). A failed save leaves
the choice marked unsaved, so the next profile load tries again.

## 232. LIVE goes live by one checklist, one migration file per run — 10 Oct 2026

**Status: decided by the lead's brief (audit brief 8 prep); branch `golive-pack`. Nothing has run on LIVE.**

**Decision.** The go-live is the ordered runbook `docs/GO_LIVE_CHECKLIST.md` (linked from OPERATIONS "LIVE go-live
(brief 8)"): pre-checks, then 0013-0042 pasted one file per run in number order from GitHub main, a read-only
**probe** after each file that names the last migration the project has (one object per file that only that file
makes; 0012 and 0041 have none, they were never used), then push steps 7-10 and the function deployed again from
main, Brevo and the auth settings, the live site and its address, a read-only verification block and a dated
settings record. Every step names who does it (Praveen in a dashboard or in his terminal; the Guru for Zoho), the
command or click path, the expected result and what to do when it differs. A result that differs stops the day
at that step; SQL is never edited on LIVE to get past an error. Steps that wait on the domain move are marked
⏳ DOMAIN, so the pilot can start on `mridanga-seva.pages.dev` and move to `app.mridangaseva.com` later.

**Consequences.** LIVE has no migration table (files are pasted by hand), so the probe is the record of where it
stands; it is tested after every file by the replay (#233). A new migration must be added to the checklist's
table, or the replay fails.

## 233. The replay proof gates the LIVE migrations — 10 Oct 2026

**Status: decided by the lead's brief; branch `golive-pack`.**

**Decision.** `supabase/tests/live-replay.mjs` (in `npm test`, about 20-30 s, and `npm run replay`) builds a PGlite
database at LIVE's state (0001-0011, then rows of every kind LIVE can hold at 0011), runs each later file in one
transaction and stops at the first error, checks the probe after each, runs each file a second time, compares the
result with a fresh build of every migration (1,798 objects: functions, grants, tables, constraints, indexes,
policies, triggers, views, jobs, buckets; and the count of function comments) and runs the checklist's SQL blocks,
which it reads from the checklist itself so the pasted text is the tested text. The Supabase imitation is read
from `smoke-test.mjs`, not copied. **Second-run rule:** a file run twice must change nothing at all (schema and
every row) or be refused as a whole and say "Run once"; a file that runs twice and changes something must say
"Run once" too. Result on main `bcdb2bb`: 23 files are refused on a second run (each says "Run once"; 0034's
header does not, so its checklist row carries it, since an applied file is not edited), 6 change nothing (0029,
0033, 0035, 0038, 0039, 0042), none changes anything on a second run.

**Consequences.** A pass does not cover pg_cron running, pg_net, the Vault, Auth, SMTP or Storage limits, nor LIVE
rows of a shape the sample lacks; the checklist's parts C-F check those on LIVE.

## 234. LIVE's email settings: Brevo, Confirm email on, exact addresses — 10 Oct 2026

**Status: decided by the lead's brief and audit brief 8 (decision 6.1 C (b)); branch `golive-pack`.**

**Decision.** LIVE sends sign-up and reset mail through Brevo's SMTP relay (port 587) from a verified sender: a
team mailbox's address until the domain move, then an address on `mridangaseva.com` with the domain authenticated
in Brevo (DKIM, DMARC; one SPF record with Zoho's and Brevo's includes). Confirm email stays on (auto-confirm off)
for good, minimum password length 8, email rate limit 30 an hour. The Site URL is the live site's address and the
Redirect URLs list exactly that origin (the app sends `window.location.origin`, no path): no localhost, no
wildcard; both addresses only for the week of the switch to `app.mridangaseva.com`. One real sign-up and one real
reset with a team mailbox prove it, and `/auth/v1/settings` must show `"mailer_autoconfirm":false`. Nobody
hand-confirms or Auto-Confirms an address on a student record without checking identity in person (D10-04).

**Consequences.** Mail from a free-mail sender may land in spam before the domain is authenticated; the real
sign-up test shows it, and the pilot waits for the domain if it does. #235 is unused.

## 224. Parents get an email when their child is checked in or out; off until the Guru switches it on — 10 Oct 2026

**Status: built on branch `parent-notices` (worker of lead chat 5); not on main until Praveen's OK.
The email wording and the team decisions in #231 are open; the Telugu and Hindi texts are drafts.**

**Context.** The Guru wants parents to know accurately when their child arrived and left
(docs/phase3/DECISIONS_FOR_GURU.md item 6). Parents have no app login; guardians are rows with a phone
and, often, an email (#16, #100). The face-scan plan (docs/phase3/FACE_ATTENDANCE_PLAN.md §2.6) showed
that the notice gives most of the value without face and fits today's QR and coordinator check-in.

**Decision.** An email to each guardian (with an email) of a student under 18, at check-in and at
check-out, through Brevo (#88's provider). A class switch `parent_notices_enabled` on G10, **off by
default**; a second switch for check-outs (`parent_notices_check_out`, on); the class contact for the
email's last line (`parent_notice_contact`). Once switched on, every eligible parent gets them unless
they say stop (opt-out, as the plan proposes); the paper consent form tells them (#230).

**Why.** Email costs nothing on Brevo's free plan and needs no parent login, no new role and no APK.
Off by default because the team has not yet answered #231 and the domain for a real sender is brief 8.

**Consequences.** Migration 0043, Edge Function `notify-parents`, G10 section "Emails to parents", C8
lines under each guardian. OPERATIONS.md "Parent notices by email". A parent login with push stays a
separate, later project.

## 225. The notices are queued by a trigger on visits; one per visit, kind and address — 10 Oct 2026

**Context.** A visit is written by `toggle_visit` (QR, door tablet), `mark_visit` (C5/C8 taps),
`check_out_all`, the hourly `close_open_visits` and staff time corrections (#110). The brief asked that
0038's 30-second repeat-scan rule never sends twice.

**Decision.** An after insert / update of `check_out` trigger on `visits` (`queue_parent_notices`) adds
rows to `parent_notices`, so no path is missed and no RPC was copied again (`toggle_visit` stays 0038's).
Only news is sent: a check-in written within the last 10 minutes; a check-out set to about now; a
visit closed by the hourly job (nobody signed in) within 6 hours = `no_checkout`. A visit typed in later,
a corrected time and an old day's visit closed by the next check-in send nothing. Dedupe: unique
(visit, guardian, kind); guardians sharing one email get one email (the consenting guardian's row
first); the repeat scan writes no visit at all, so it queues nothing.

**Why.** A trigger is the single place every check-in passes through; adding a call to four functions
would copy them again and miss the next one.

**Consequences.** A coordinator's quick mistake (in, out, in) sends what happened, three emails; the
times say the truth. Smoke tests "0043 parent notices".

## 226. A new Edge Function notify-parents sends them, with a dry run — 10 Oct 2026

**Context.** Push already has a database job → Edge Function → provider pipeline (#33, #112-#115);
the Ishtagoshti parent code calls Brevo straight from the database (#88).

**Decision.** A **new** Edge Function `notify-parents`, not a mode of `notify-announcements`. The
every-minute job `send_parent_notices()` calls it (pg_net, the push secret) only when a row waits; it
claims up to 50 rows, sends one Brevo transactional email each, and records sent / retry (2, 8, 18,
32 minutes; a 401 stops the run) / refused, like 0031's queue. Secrets `BREVO_API_KEY`, `NOTICE_FROM`
(placeholder until brief 8), optional `NOTICE_FROM_NAME`, `NOTICE_REPLY_TO`, `PARENT_NOTICES_DRY_RUN`.
**Without a key or sender it is a dry run**: logs "would send <row> <kind> <language>" and marks the
rows `skipped`. Logs never hold an address, a name or a text.

**Why a new function.** Push and email fail differently (Expo vs Brevo, tokens vs addresses); one
function's error or deploy then never delays the other, its logs show only one thing, and LIVE can get
notices without redeploying push. It shares the push secret and `pickServiceKey`, so the set-up is the
same. Not from the database like #88: the email needs per-language templates, retries and an
unsubscribe link, which are easier to test in TypeScript (`parent-notices.test.mjs`) than in SQL.

**Consequences.** One more deploy on TEST and LIVE (`supabase/config.toml` keeps its JWT check off).
One more pg_cron job (about 1,440 run rows a day, trimmed by 0040's purge).

## 227. Who gets one, and how a parent stops them — 10 Oct 2026

**Decision.** A guardian gets the email when (`parent_notice_block` is null): notices are on; the
student is under 18 (`is_minor`), not withdrawn (#75), with a current `data` consent (#16, #74); the
guardian has an email and no stop. Adults get none, even with a guardian on record (#231). Stopping:
the desk on C8 ("Stop emails to this parent", `set_guardian_notices`, staff, audited through
guardians), or the email's one-click **Unsubscribe** (RFC 8058: the mail app POSTs a link carrying the
guardian id signed with an HMAC of the push secret; a link scanner's GET does nothing). One address,
one choice: a stop on any guardian row with that email counts, and the one-click stops the address for
every child. The language is per guardian (en / te / hi; empty = the child's app language).

**Why.** Withdrawing must be as easy as giving (DPDP s.6(4)); a signed link needs no parent login and
cannot be used to stop someone else's emails.

## 228. What the email says: name, centre, time, how — never where — 10 Oct 2026

**Decision.** Plain and short, en / te / hi (`supabase/functions/notify-parents/template.ts`): "Arjun
Rao checked in at Abids at 17:02 on 10-10-2026 (QR code scanned)"; check-out without the method; for
`no_checkout` "No check-out was recorded … closed at 20:00, the centre's closing time; this is not the
time Arjun Rao left" (the plan's rule: never a made-up leaving time). Then: it never includes the
child's location or photo; "Questions: <class contact>"; how to stop. The student's **full name** as
on the record (a first word can be an initial, and siblings must be told apart). Times in the centre's
time zone (0033), dates day first. No location, distance, geofence result or photo — not in the email,
not in the queue (#212); a flagged check-in (#70) looks like any other to the parent.

## 229. Notice rows are short-lived; at most 200 a day — 10 Oct 2026

**Decision.** `parent_notices` holds ids, the kind, times and the outcome only, and is deleted after 30
days (each run purges). A row not sent within 6 hours of the event ends as `expired` (a late "arrived"
is worse than none). At most 200 sent a day (Brevo's free plan: 300; the Ishtagoshti codes take up to
100); the rest wait and expire. The queue and `parent_notice_status` are closed to every app role
(RLS on, no grants); the claim functions are the service role's (#14).

## 230. A line for the parent consent form (DRAFT — the team's wording) — 10 Oct 2026

**Status: draft only.** The team words the real line and adds it to the paper form and the privacy
notice before notices are switched on at LIVE; Brevo is then listed as a processor for these emails.
**Approved as drafted on 10 Oct 2026: see #247.**

> *Draft (en):* "When the class's attendance emails are switched on, we will email you when your child
> is checked in and checked out at the class (name, centre, time). These emails never contain your
> child's location or photo. You can stop them at any time with the Unsubscribe link in the email or
> by telling the class desk."

A Telugu and a Hindi version follow from the team's English, with the consent form's other lines
(docs/phase3/CONSENT_DRAFT.md).

## 231. Parent notices: decisions for the team, with the defaults built — 10 Oct 2026

**Status: open; the build follows the defaults below, each a setting or a small change.**
**Decided 10 Oct 2026: see #246 (check-out emails only; every other default kept) and #247 (#230's
wording approved).**

| Question | Default built | To change |
|---|---|---|
| Switch on at all, and when? | Off (`parent_notices_enabled` false) | Tick on G10 |
| Adult students too (e.g. a parent asks for their 19-year-old)? | No: minors only; an adult decides about their own data | A new decision + the adult's own consent; a small change in `parent_notice_block` |
| Both check-in and check-out? | Both | Untick "and when they are checked out" on G10 |
| The night's "no check-out recorded" email? | Sent (with check-outs), about an hour after closing (21:00-21:30 IST at Abids) | Ask for a separate switch |
| Quiet hours? | None: emails follow the class times; the latest is that night's no-check-out email | Ask for a window (e.g. none after 21:30) |
| Opt-out (on for every eligible parent) or opt-in? | Opt-out, as the plan proposes, told on the consent form (#230) | Opt-in = a new consent scope `notices` and a tick on C3 |
| Full name or first name in the email? | Full name (#228) | Template change |
| Sender and domain | Placeholder (`NOTICE_FROM`, Praveen's verified address on TEST) | Brief 8: domain authenticated in Brevo |
| Flagged (outside the area) check-ins | Same email; the flag stays for staff (#70) | Guru decision (FACE_ATTENDANCE_PLAN §2.6) |

## 236. The Android app keeps nothing in phone backups and asks for no overlay or old storage permission — 10 Oct 2026

**Status: decided by the lead's brief (audit brief 9, D3-02 / FS4-10); branch `device-hardening`, ships with the
next APK (production). Native change: fingerprint 185e839f → 835f9adb.**

**Context.** Android backed up the app's data to the person's Google account by default (`allowBackup` true): the
saved login (refresh token), the remembered profile and a student's saved QR card went with it, and came back on
another phone restored from that backup. The merged manifest also listed SYSTEM_ALERT_WINDOW (draw over other
apps, added by React Native for its developer menu) and READ/WRITE_EXTERNAL_STORAGE (old shared-storage access),
which the app never uses: it picks photos and files through the system pickers and keeps its own files in its own
folders.

**Decision.** `android.allowBackup: false` and `android.blockedPermissions` for SYSTEM_ALERT_WINDOW,
READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE in app/app.json (they are removed from the merged manifest with
`tools:node="remove"`). `npx expo config --type introspect` shows `android:allowBackup="false"` and the three as
removed (NOTES.md "10-10-2026 — Device hardening"). No `dataExtractionRules` file: with backup off, the only copy
Android still makes is a phone-to-phone transfer that the owner starts while setting up a new phone, which moves
the person's own login to the person's own new phone. Revisit if that matters (it needs a small config plugin).

## 237. Every call to Supabase has a 15-second limit, and a slow start says so — 10 Oct 2026

**Status: decided by the lead's brief (audit brief 9, D6-02 / FS3-04); branch `device-hardening`. JS only, but it
rides the production APK with #236.**

**Context.** The Supabase client used the plain fetch, which waits as long as the connection stays open. A
stalled connection (one bar of signal, a captive Wi-Fi page) kept the splash screen up with no way out.

**Decision.**
- `withTimeout` (src/lib/timed-fetch.ts) wraps the client's fetch (src/lib/supabase.ts): a call that has no
  answer within 15 s is cancelled and fails as a TypeError whose message contains "Network request failed", so the
  screens show the usual "Could not reach the server" (isNetworkError) and the auth client counts it as a network
  failure it may retry. The limit covers the wait for the answer, not the reading of a long body; a signal the
  caller passes still cancels. A controller and a timer, not `AbortSignal.timeout`: that timer cannot be stopped
  and Hermes may lack it; the timer also rejects by itself, so a fetch that ignores the signal cannot hang.
- Storage uploads (POST/PUT to `/storage/v1/object/` or `/upload/`) have no limit: the whole file goes up before
  the server answers, which on a phone connection can take minutes.
- A start still `loading` after 10 s (`useTakingLong`, src/lib/slow-start.ts) hides the native splash and the
  app's splash says "This is taking long. Check your internet connection, then try again." with Try again, which
  starts the app again (page reload on the web, `Updates.reloadAsync` on the phone). 10 s, under the call limit,
  so the person hears something before the calls give up. Telugu and Hindi lines are drafts (docs/TRANSLATIONS.md).

## 238. A sign-out without internet is finished on the server at the next online moment (adds to #42) — 10 Oct 2026

**Status: decided by the lead's brief (audit brief 9, D3-07 / R2G2-05); branch `device-hardening`. #42 stands; this
adds what happens to the login on the server.**

**Context.** #42 made Sign out work without internet by deleting the saved login on the phone. The login itself
stayed valid on the server: its refresh token, if copied from the phone before (a backup, a debugging tool), could
still be used for up to the login's lifetime. Reading supabase-js 2.117 also showed a second case #42 did not
name: with a still valid access token and no internet, `signOut` deletes the saved login first and then returns
the error, so the token was gone before the app could keep it.

**Decision.**
- `signOut` (src/auth/auth-actions.ts) reads the saved refresh token **before** calling Supabase. When the call
  fails, the token is kept as a "sign-out pending" (src/auth/pending-sign-out.ts, device key `pendingSignOut`, at
  most 5), then #42's fallback runs as before when the login is still saved.
- `finishPendingSignOuts` ends each pending login on the server with the project's address and key and the
  client's timed fetch, never through the client (whose session may by then be the next person's): POST
  `/auth/v1/token?grant_type=refresh_token` with the kept token, then POST `/auth/v1/logout?scope=local` with the
  fresh access token, which ends that whole login (every refresh token of it). Outcomes: done (logout answered, or
  the server refused the token with 400/401/403, i.e. it is already dead); no answer or 429/5xx → kept for the next
  try; refreshed but /logout unreachable → the new refresh token is kept instead (the old one is used up).
- "Next online moment": app start, the app back on screen, the browser's `online` event (web), and the auth events
  SIGNED_IN / TOKEN_REFRESHED, which prove the server can be reached (src/auth/auth-provider.tsx). One run at a time.
- The push token row still stays on the server after an offline sign-out until the phone's next sign-in (#42).

## 239. A QR scan buzzes once: success or error — 10 Oct 2026

**Status: decided by the lead's brief (audit brief 9, optional, D7-20); branch `device-hardening`. expo-haptics was
already installed (no new native package).**

**Decision.** `scanFeedback` (src/lib/haptics.ts) after each student scan on C5 (attendance): the success pattern
when the visit was marked, the error pattern for an unknown code or a failed call. Not on the web; never throws.
The phone's "touch vibration" setting can silence it. Taps on the name list stay silent (the finger is already on
the screen).

## 240. Simple homes: a greeting, then only circles — 10 Oct 2026

**Status: decided by Praveen (10 Oct 2026); branch `simple-home`.**

**Context.** The homes (S1, C1, G1) had grown into a long scroll: numbers, cards, the ring, buttons and links,
then the account card. Praveen: "make it simple with only the circular screens icons where they will navigate to
their own sub modules".

**Decision.** Every home shows the saffron greeting and then only circles (`components/module-ring.tsx`), each
opening its own screen; the cards move behind circles and are reused there. Student: My QR, Announcements, My
progress, Assessments, Practice, Attendance (S9, now with this week's visits on top), Events & polls, About you
(only while unfinished). Coordinator and Guru: a ring of eight (Overview, Follow-up calls, Promotions, Here now,
New joiners, Assessments, Events & polls, My reports or Running the class) and two rows of four under it (Syllabus and lessons, Groups, Practice, Ishtagoshti, Instruments, Duty roster, Material
suggestions, Class fund). Mark attendance, Students, Calls and Announcements are bottom tabs, so not circles (the
big Mark attendance button is gone); My QR and Announcements stay circles on S1 too. New screens:
`staff/overview.tsx` (the old numbers, every tile opening its filtered list; the Guru's per level and per
status), `staff/new-joiners.tsx`, `staff/follow-ups-by-coordinator.tsx` (Guru), `staff/running-the-class.tsx`
(Guru only). What waits for the person is a red count on its circle, said in the circle's name ("Announcements,
3 new"): unread announcements, polls to vote, About you unfinished, calls due (coordinator: mine; Guru: overdue
or escalated), promotions waiting (feedback asked / nominations to decide); 9+ above nine. Only notices stay on
a home: the app update, could not load, no student record. The language switch, Sign out and the version line
are on My profile (A3), opened by a person button beside the bell in the header (Praveen, 10 Oct 2026;
components/profile-button.tsx), so My profile is not a circle. The header's drum mark, buttons and name are a
little smaller so a usual name stays on one line.

**Consequences.** The homes fit a 375 x 812 phone with little or no scroll (S1 none, C1/G1 about 47 px for the
second row's labels). One more tap to reach a number. Large text keeps the two-column tile grid (#39), with the
rows' modules after the ring's.

## 241. Drawn art instead of a picture on the homes — 10 Oct 2026

**Status: decided by Praveen (10 Oct 2026); branch `simple-home`.**

**Decision.** Behind the ring a faint lotus mandala, and behind the fact card under it a faint temple between
lotuses (`components/home-art.tsx`), drawn with react-native-svg in the theme's primary colour, light and dark.
No photo or painting: #39 stands (a temple or deity picture is the temple's call, and a picture costs a few
hundred KB per update). Decoration only: hidden from screen readers, never takes a tap. A picture with the
temple's permission can go in the same place later.

## 242. "Did you know?" and my level under the student's ring — 10 Oct 2026

**Status: decided by Praveen (10 Oct 2026); branch `simple-home`.**

**Decision.** Under the student's ring: a slim bar "My level: … · done of total" (a button to S4) and one short
fact about the mṛdaṅga a day (`components/fact-card.tsx`, `lib/fact-of-the-day.ts`): 15 facts written for the app
from the sourced instrument research (name and khol, Caitanya Mahāprabhu, the heads, syāhī, humidity, the
fibreglass drum, care, bols, dhā, khol vs mṛdaṅgam, kartāls, daily practice, the rings of a head), the same for
everyone on a day, changing at local midnight. No data call. Telugu and Hindi are drafts for the review.

## 243. Ishtagoshti home as circles — 10 Oct 2026

**Status: decided by Praveen (10 Oct 2026, "if possible circle"); branch `simple-home`.**

**Decision.** I1 shows its intro line, then a ring: Sloka of the day (opens the sloka), Themes (a new list,
`screens/ishtagoshti-themes.tsx`, routes `*/ishtagoshti/themes.tsx`), All slokas; editors also Add a sloka and Add
a theme; the Guru also Ishtagoshti subscribers. Under it the memorised and slokas-to-study numbers. The verse and
translation are no longer on I1 itself; they are one tap away. **#244 and #245 are unused.**

## 246. Parents get an email only when a check-out is recorded in the app — 10 Oct 2026

**Status: the team's answers to #231 (Praveen, 10 Oct 2026); built in migration 0044, merged to main by the lead on 10 Oct 2026.**

**Context.** #231 left the defaults of the parent emails to the team. Their answers: minors only — yes;
both check-in and check-out — **no: "only checkout if added in app or else no send"**; opt-out — yes;
quiet hours — none; full name — yes; a flagged (outside the area) check-in or check-out — the same email
as any other.

**Decision.** An email goes to the parent only when a check-out is recorded in the app (QR, door
tablet, a coordinator's tap, Check out all). No email at check-in, and no night "no check-out was
recorded" email when the hourly job closes a visit nobody checked out. Built as two new G10 switches,
**both off**: `parent_notices_check_in` and `parent_notices_no_checkout`; `parent_notices_check_out`
stays on. The visits trigger checks each kind's switch; the night email is no longer tied to the
check-out switch. The kinds `in` and `no_checkout` stay in the queue's check, so 0043's rows stay
valid. Every other #231 default is kept as built; the flag (#70) stays for staff only (#228).

**Why switches, not a hard removal.** The trigger, the email texts and the tests for the other two
kinds already exist and passed on TEST; removing them saves no running cost (nothing is queued while
off) but would need a migration and an app update to bring back if the team changes its mind. Two
unticked boxes cost one guard line each, and "off" is the safe default for any database that runs
0044.

**Why the "not news" rule stays.** A check-out is queued only when it is set to about now (within
the last 10 minutes). Every check-out the app records is set to now: `toggle_visit` and `mark_visit`
use `now()`, `check_out_all` uses `now()` for today's visits (an old day's visit gets its closing time,
which is not news). So the rule never holds back a genuine app check-out; it only skips a check-out
typed in later or a corrected time (#110), where an email at the wrong moment would mislead.

**Consequences.** Migration 0044 (settings, `guard_setting`, `queue_parent_notices`); no Edge
Function change, no redeploy. G10 shows "When the student is checked out in the app" (ticked), "When
the student is checked in" and "At night, when nobody checked the student out" (unticked); the two
new boxes appear only once the database has 0044. C8 says "attendance emails" instead of "check-in
emails". Smoke tests "0044 check-out emails only"; GO_LIVE_CHECKLIST M0044.

## 247. The consent line for parent emails is approved as drafted — 10 Oct 2026

**Decision.** #230's English draft is the team's wording (Praveen, 10 Oct 2026). It goes on the
paper consent form and in the privacy notice before the emails are switched on at LIVE, with Brevo
listed as a processor; the Telugu and Hindi versions follow from it with the form's other lines
(docs/phase3/CONSENT_DRAFT.md).

**Note for the team.** The approved line says "we will email you when your child is checked in and
checked out"; with #246 only the check-out email is sent. It over-promises rather than hides
anything, so it was kept as approved; if the team wants it exact, dropping "checked in and" ("when
your child is checked out at the class") is the one-phrase change, to be made before the forms are
printed.

## 248. Phase 3 face scan = student self-scan on their own phone; no phone = printed QR or roll number; ₹0 budget — 10 Oct 2026

**Decided by Praveen, 10-10-2026.** Supersedes the "who scans" proposal in
docs/phase3/FACE_ATTENDANCE_PLAN.md §2.1 (modes A door tablet and B coordinator phone are dropped)
and answers DECISIONS_FOR_GURU items 2 and 10.

- **Face scan is only the student's own phone (self-scan, 1:1):** the app checks that the face is
  the student whose login it is, with liveness, and reads location once at that moment (#212).
- **A student without a phone** is checked in by a coordinator as today: the coordinator scans the
  student's **printed QR card** or types the **roll number or name** in C5 (search_students already
  matches roll numbers, 0039). Printed QR cards are a new, small JS job (P3-1 in
  docs/phase3/WORK_PLAN.md) that can ship before Phase 3.
- **Budget ₹0:** no door tablet; on-device open models (ML Kit detection, SFace, MiniFASNet —
  Apache 2.0 / free); Supabase, Expo and Brevo free plans. The lawyer's review stays recommended
  (children's biometric data, DPDP s.9) — the team looks for a pro-bono reviewer.

**Why:** most of the cost and build in the draft plan was the tablet and the 1:N scanner; self-scan
needs neither, and students without phones already have a working path.

**Trade-offs accepted, and how they are covered:** nobody watches a self-scan, so anti-spoofing must
be stronger than a supervised scan — the first enrolment is done at the desk in front of a
coordinator (who confirms it is the right student), every scan uses active + passive liveness, a
conservative match threshold (prefer "use your QR" over a wrong match), Android's mocked-location
flag and Play Integrity; self-scan is refused offline, outside the area or outside the class
window, and the coordinator path stays. A child's own phone reading location at check-in is still
a single moment, never tracking (#212); the DPIA and consent drafts are revised for self-scan
before the lawyer sees them. Minimum age for face (item 3, recommended 13) stays a Guru decision.
Work packages, order and pick-up rules: docs/phase3/WORK_PLAN.md.

## 249. A printed QR card carries the student's My QR code, not a code of its own — 10 Oct 2026

**Context.** Phase 3 P3-1 (docs/phase3/WORK_PLAN.md, #248): a student without a phone needs a card the
coordinator can scan in C5. The work plan asked first how My QR is encoded: if it were time-limited or
signed per session, the card would need a long-lived code of its own.

**Decision.** It is neither: My QR is `MS1:` + the student's `qr_token` (#17), a random value kept on the
record until it is replaced (#250). The card prints exactly that text (`studentQrText`), so `scan_qr` and
C5 read a card like a phone, with no change. No card table, no second token, no new prefix.

**Why.** One code per student keeps one scanner path and one place that knows the format
(`app/src/data/attendance.ts`). A separate card code would need a table, a second lookup in `scan_qr` and a
rule for students who have both.

**Consequences.** A card and the student's phone show the same code; replacing one replaces both (#250).
Like a screenshot of My QR, a card can be lent; the C5 result card still shows the name and roll number large
for the coordinator to check (#17). If codes ever expire (a future `MS2:`), printed cards need a decision of
their own.

## 250. A lost card: the Guru gives the student a new code — 10 Oct 2026

**Context.** The work plan asks that the Guru can revoke a lost card, and #21 noted there was no screen to
issue a new `qr_token`. `qr_token` is frozen for app users (0025).

**Decision.** Migration 0045 adds `reissue_qr_code(student)`: the Guru only (`not_allowed` otherwise),
`student_not_found`, and a withdrawn record stays frozen (`student_withdrawn`). It sets a new random
`qr_token`. On C8 a "QR card" section has *Print QR card* for staff and, for the Guru, *Replace a lost card*,
which asks first. The old card, and any photo of it or of the old My QR, then scans as "Code not recognised";
C5's text for that now says it may be an old card that was replaced. The change is in the audit log
(`audit_students`).

**Why.** Rotating the one token is the whole revocation: nothing to list or check at every scan. The Guru
only, as asked, so a coordinator cannot lock a student out by mistake.

**Consequences.** A student who also has a phone sees the new code in My QR the next time the phone is
online (#21); until then their saved card shows the old code. The audit log page hides `qr_token` values
(quiet field), so the entry shows who changed the record and when, not the codes. LIVE runs 0045 after 0044: docs/GO_LIVE_CHECKLIST.md M0045.

## 251. Who prints cards: staff, a coordinator for their own centre — 10 Oct 2026

**Context.** Work plan: "Who may print: staff of the student's centre." Staff can already read every student,
`qr_token` included (row-level security `own_or_staff`, 0025).

**Decision.** The print screen (C24) shows a coordinator only the students of their login's centre
(`profiles.centre_id`); a coordinator with no centre set, and the Guru, choose the centre. The codes are read
only for the students picked, when the sheet is built. Row-level security is unchanged.

**Why.** The same rule and the same reasoning as the asset labels (#159): the screen keeps people to their
centre; tightening what staff may read per centre is a wider change, left for when a second real centre
starts.

**Consequences.** A coordinator can still open another centre's student profile (C8) and print from there;
that is accepted for now, as for labels.

## 252. The card sheet: ten bank-card size cards on A4, printed from the web page — 10 Oct 2026

**Context.** Cards are cut by hand from plain paper or thin card; the class has no card printer. The asset
labels already print exact millimetre layouts from the browser (#158).

**Decision.** `/staff/qr-cards` (C24; Guru and coordinators, web only — the phone app opens it in the
browser, as for labels) builds the sheet in `app/src/lib/qr-card-sheet.ts`: 2 x 5 cards of 85.6 x 54 mm
(bank-card size, fits a wallet or card holder), centred on A4 (19.4 mm left, 13.5 mm top), with dashed cut
lines. Each card: the QR 32 mm with its 4-module quiet zone (error correction Q, black on white, #21), a round
logo placeholder ("MS") and "Mridanga Seva · Attendance card", the full name, the roll number large, the
centre, and "Show this card at the door to check in. If found, please return it to the class." Students are
picked by centre (#251), "Without the app" (no login; the default) or all, level, a name / roll-number search,
or one by one; `?ids=` preselects (C8's button). The print path is the labels' one (`LabelPrint` with the
card CSS; the A4 page and print rules are shared as `PAGE_CSS`). No start position or nudge: plain paper is
cut, not label stock. C5's search hint now says "name or roll number" and its scan text mentions the card.

**Why.** Bank-card size is what a student keeps; 32 mm of QR scans easily from a phone at arm's length. No
dependency, no native module, fingerprint unchanged.

**Consequences.** Print at 100 % (Actual size), as for labels. The logo placeholder is replaced when the class
has a logo (one CSS rule and the `qrCards.logo` text). Lamination is fine; a glossy pouch can glare under
tube lights, so a matte pouch is better.

## 253. A self-scan's single location reading is an attendance record, not tracking; the lawyer answers it first — 10 Oct 2026

**Status: team position for the legal review (P3-8, branch `p3-privacy-docs`); docs only.**

**Context.** With #248 the location at check-in/out is read on the **child's own phone**, not on a
door tablet or a coordinator's phone, so DPDP s.9(3) ("tracking or behavioural monitoring of
children") needs a fresh argument. The Act does not define tracking; the Fourth Schedule (Part A
item 5) treats "tracking the location ... during the course of their travel" as tracking.

**Decision.** The DPIA (docs/phase3/DPIA_DRAFT.md §4) argues that one foreground fix at the child's
own check-in/out tap, kept only as inside/outside + distance against one fixed point (#70, #212), is
an attendance record, not tracking, and that 1:1 face verification is not behavioural monitoring.
This is **question 1** of the lawyer's pack (docs/phase3/LAWYER_PACK.md). The Fourth Schedule
exemption is not relied on. If the lawyer disagrees, minors lose the location step or self-scan (QR
card / coordinator only) and adults keep it; proposal for P3-5: a setting for the location step of
minors, so no new APK is needed.

**Why.** It is the only new legal risk self-scan adds over v1, and the rest of Phase 3 does not depend
on it.

## 254. The Phase 3 privacy papers describe self-scan only, 1:1, with phone and server copies of the face code — 10 Oct 2026

**Status: drafts for the lawyer (P3-8); nothing built.**

**Decision.** DPIA v2, consent drafts v2 (en master; te/hi NATIVE REVIEW NEEDED) and the notice
additions (docs/phase3/PRIVACY_NOTICE_DRAFT.md) describe: separate face consent (parent's in person
for a minor + the child's own yes); supervised first enrolment on the student's phone; the face code
kept encrypted on that phone (Android Keystore) and on the server (Vault key), matched 1:1 only, no
class device or cache; active + passive liveness, mocked-location check, Play Integrity; refused
offline, outside the area or window; check-out outside = saved and flagged. Withdrawal: one tap or the
desk; server copy deleted at once, phone copy at once on switch-off / sign-out, else at the app's next
online start (until then the server refuses face check-ins); expiry 12 months minors / 24 adults,
Left + 30 days, model change. Parent email: check-out only (#231 answers, 0044). Location keeps no
consent scope of its own (told on the form and in the notice) unless the lawyer asks.

**Why.** The papers the lawyer reviews must match the decided design (#248); v1's tablet, kiosk cache
and 1:N text are history.

**Consequences.** Open technical point for P3-0 / P3-6: the APK is installed from a link, not Google
Play, and Play Integrity may then give only a device verdict; if it cannot be used, self-scan for
minors waits (DPIA §6).

## 255. When each privacy-notice addition goes on the website — 10 Oct 2026

**Decision.** The website notice (`website/content/*/privacy.html`) is not changed by P3-8.
Part N1 (guardian email, check-out emails, Brevo's new use) is pasted in before the Guru switches
parent emails on at LIVE (#230). Parts N2-N4 (face scan, self-scan location, Play Integrity) are
pasted in only after the lawyer's review, with the Phase 3 APK (P3-7). Each paste raises
`privacyNotice.version` and `date` in `website/site.config.mjs`; te/hi only after native review.

**Why.** A notice must describe what the app does now: describing face scan before it exists would
mislead, and the parent emails need their notice line before they are switched on.

## 256. An APK build stops when its Supabase settings belong to the other project — 12 Oct 2026

**Status: branch `brief9-apk` (audit brief 9, D3-11); goes to main with the production APK.**

**Context.** An APK takes its Supabase URL and key from the EAS environment of its profile
(`eas.json` "environment"). Updates were already checked (`publish-update.mjs`, #152-#155), APK
builds were not: a production APK built while the `production` environment still held the test
settings would cut the class off from its data, and a preview APK with the live settings would send
testers into the class's real data. #191 left D3-11's build-time guard for brief 9 because it needs
an `eas-build-pre-install` script, which #198 forbade.

**Decision.** `app/package.json` gets one hook, `"eas-build-pre-install": "node
scripts/eas-build-guard.mjs"`. EAS Build runs it before `npm install` with the profile's EAS
environment and `EAS_BUILD_PROFILE` set. It fails the build (exit 1) unless the profile is in
`scripts/lib/supabase-projects.mjs` (`preview` = TEST `fhuqyk…`, `production` = LIVE `qeozvv…`), the
URL is exactly `https://<that ref>.supabase.co` and the key is a publishable key or an anon JWT. It
prints the profile and the ref, never the key. Plain Node, no packages (node_modules does not exist
yet). `publish-update.mjs` reads the same project list. `tests/build-guard.test.mjs` covers it;
`tests/repo-guards.test.mjs` now allows exactly this hook with exactly this command, and checks the
guard imports nothing but `node:` modules and the project list.

**Why.** The guard changes no file, so the fingerprint not counting npm scripts (#198) is harmless
here: the APK is the same with or without it; a wrong build simply does not finish. Comparing only
refs keeps keys out of build logs.

**Consequences.** Fingerprint unchanged by this (835f9adb on the branch). A new profile (a
development build, say) must be added to `supabase-projects.mjs` first or its builds stop. The build
log's pre-install step shows `eas-build-guard: profile production → project qeozvv…`; check it once on
the Friday build (OPERATIONS "Friday production build"); the docs do not say in words that a failing
npm hook fails the build, so that first log is also the proof. Replaces in part #198 (one eas-build
hook is now allowed). Closes D3-11 (with #191).

## 257. Dependencies for the production APK: SDK 57 patches, EAS CLI 24.12.1, three scoped overrides — 12 Oct 2026

**Status: branch `brief9-apk` (audit brief 9); goes to main with the production APK. Native change:
fingerprint 835f9adb → 0dea00a3.**

**Context.** `npm audit` in `app/` gave 55 advisories (31 high, 23 moderate, 1 low) on 12 Oct 2026,
all in build tools except query-string / decode-uri-component in expo-router (#199). The triage of
10 Oct (NOTES.md "Device hardening") expected an EAS CLI upgrade to fix the EAS CLI ones. It does
not: eas-cli 24.12.1 (newest, 8 Oct 2026) still pins exactly tar 7.5.19, minimatch 5.1.2, nanoid
3.3.8, joi 17.11.0.

**Decision.**
- `npx expo install --fix`: expo 57.0.27, expo-image-manipulator 57.0.21, expo-linking 57.0.12,
  expo-notifications 57.0.22, expo-router 57.0.25, expo-sqlite 57.0.4, expo-updates 57.0.25 (the
  lockfile also takes expo-asset 57.0.19, expo-constants 57.0.21 and @expo/metro-file-map 57.0.4).
  Same SDK, patch releases only; `expo install --check` then reports nothing.
- `eas-cli` 24.12.1, exact (#153). Release notes 24.11.0 → 24.12.1: simulator and custom-build
  features, no breaking change. It was 4 days old on 12 Oct, under the "at least a week" rule;
  accepted because nothing in it touches Android builds or updates and it is 8 days old on the
  Friday build. Replaces in part #153 (the version).
- `package.json` `overrides`, under eas-cli and keyed by the exact vulnerable version, for the three
  the triage marked safe: `tar@7.5.19` → 7.5.22, `minimatch@5.1.2` → 5.1.9, `nanoid@3.3.8` → 3.3.19
  (patch versions of the same minor; minimatch 5.1.9 and nanoid 3.3.19 were already in the tree for
  other packages). **Gotcha:** a plain `"minimatch": "5.1.9"` under eas-cli also replaced the
  minimatch 9 and 10 that @oclif/core and glob need, and `eas build:list` then failed with
  *minimatch_1.minimatch is not a function*; after changing overrides, regenerate the lockfile from
  the committed one (`git checkout HEAD -- package-lock.json`, `npm install`), check `npm ls
  minimatch nanoid tar` shows no *invalid*, and run `npm run update:preview -- --check-only
  --message x`. joi is left (17.11 → 17.13 is a minor inside @expo/eas-json; the triage did not mark
  it safe).
- Never `npm audit fix --force` (it offers expo 44 and eas-cli 0.52, majors backwards).

**Result.** 51 advisories (27 high, 23 moderate, 1 low). Left, none in the APK or web bundle except
the last: node-forge (no patched release; build-time signing), braces (no patched release; Metro),
joi, ajv, yaml, uuid, sprintf-js, ts-deepmerge, diff (EAS CLI / Expo tooling), decode-uri-component
(expo-router 57; fixed only by expo-router 58 = SDK 58, #258). `npx expo-doctor`: 20/21, the one
failure is "EAS CLI should not be installed in your project", which #153 decided on purpose.

**Consequences.** The fingerprint moves (expo and expo-* native packages), so this goes only with a
new APK; tsc, lint and every test passed on it. Until an APK with 0dea00a3 exists,
`update:preview -- --check-only` on this branch stops at its first check (*no finished preview APK
has fingerprint 0dea00a3…*), which is the expected answer. On the built APK the usual smoke steps
cover the patched modules (notifications, router, SQLite, updates, image manipulator).

## 258. The first production APK stays on Expo SDK 57; SDK 58 waits for its stable release — 12 Oct 2026

**Status: decided by Praveen, 12 Oct 2026 ("SDK 58 waits"), on the worker's recommendation (audit
brief 9). The first production APK is built on SDK 57.**

**Context.** The only advisory in the app itself (decode-uri-component under expo-router 57, #199)
is fixed only by expo-router 58, i.e. Expo SDK 58. Assessed on 12 Oct 2026 on a local branch
`brief9-sdk58` (commit 470af73, never pushed, deleted after this decision): `npx expo install
expo@^58`, then `--fix`.

**Findings.**
- SDK 58 is **not released**: on npm `expo@latest` = 57.0.27, SDK 58 is the `next` tag (58.0.7, 9 Oct
  2026); its React Native is **0.88.0-rc.4**, a release candidate. The beta post (expo.dev/changelog/
  sdk-58-beta, 15 Sep 2026) says SDK 58 ships "shortly after" React Native 0.88 stable; no date.
- `expo install --fix` **fails** with npm ERESOLVE: react-native-reanimated 4.7.0 (SDK 58's pick)
  asks for react-native "0.86 - 0.88", which does not admit 0.88.0-rc.4. Only `--legacy-peer-deps`
  installs it.
- With it installed: `tsc` **10 errors** (React Native 0.88's strict TypeScript API: TextInput refs
  `.focus()` in sign-in, sign-up, reset-password and text-field; a colour type in icon.tsx;
  react-native-webview 14's onMessage in lesson-video-frame.tsx). Lint 0, app tests 86/86, expo-doctor
  20 of 21 checks (the eas-cli one, #153). Fingerprint 31ba10a3. npm audit 51 → 47 (decode-uri-component
  gone).
- Breaking changes that hit this code (beta post + "Migrate Expo Router from SDK 57 to SDK 58"):
  `File.write()` becomes async (4 calls: save-csv, practice-audio, my-recordings, calendar-file →
  `writeSync()`); the module-level `router` "throws before the first render" and `useRouter()` is
  preferred (85 files import `router`); navigation dispatch is queued after the commit; tabs show
  only declared screens; ancestor params no longer copied; react-native-gesture-handler 3,
  react-native-webview 14, worklets 0.13 majors; R8 on by default (already on here). Every screen
  and the back behaviour would need re-testing on a phone.

**Decision.** No-go for 16 Oct 2026: build the first production APK on SDK 57 (#257).
Upgrade to SDK 58 as its own branch and its own APK once SDK 58 and React Native 0.88 are stable,
`expo install --fix` succeeds without `--legacy-peer-deps`, and a week has passed; then the
Dependabot expo-router branches close with it.

**Why.** A release-candidate React Native under the class's first production APK, a dependency tree
that only installs by overriding peer checks, ten type errors and a navigation rework, for one
moderate advisory whose worst case is a slow phone on a malformed address (#199).

**Consequences.** decode-uri-component stays open in the production APK until SDK 58 (OPERATIONS
"Dependabot"). The SDK 58 APK will change the fingerprint again: the class installs a second APK
then.

## 259. Android App Links for asset labels wait for app.mridangaseva.com — 12 Oct 2026

**Status: decided by the lead's brief (audit brief 9); not in the first production APK.**

**Context.** #157 left opening a label link (`https://app.mridangaseva.com/i/<token>`) in the app
instead of the browser to brief 9 (D3-13 in #192). Android only opens an https link in an app after
it has verified the domain: the app declares the domain with `autoVerify`, and the domain serves
`/.well-known/assetlinks.json` naming the app's package and signing key. app.mridangaseva.com is not
live (the domain move is not done, GO_LIVE_CHECKLIST E3).

**Decision.** No App Links in the 16 Oct 2026 APK. They are added in one later APK, after E3, with:
1. `app.json` → `android.intentFilters`: one filter, `action` `VIEW`, `autoVerify: true`, `data`
   `[{ scheme: 'https', host: 'app.mridangaseva.com', pathPrefix: '/i/' }]`, `category`
   `['BROWSABLE', 'DEFAULT']` (Expo docs "Android App Links"). Only `/i/`: every other address of the
   site stays in the browser. Native change: a new APK.
2. `app/public/.well-known/assetlinks.json`, so `npm run export:web -- --site live` puts it on the
   site: `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":
   "android_app","package_name":"org.mridangaseva.app","sha256_cert_fingerprints":["<production
   keystore SHA-256>"]}}]`, the SHA-256 from `npx eas-cli credentials -p android` (production). Served
   over https as `application/json` with no redirect (add a rule for it to `app/public/_headers` and
   check the header after the upload). If preview APKs use another key, list both, or leave TEST out (the TEST site is
   pages.dev and is not in the filter).
3. `src/app/i/[token].tsx` already handles the path in the app (staff sign-in, then the item), and
   `assetTokenFromScan` reads the link.
4. Check on a phone: `adb shell pm get-app-links org.mridangaseva.app` shows `app.mridangaseva.com:
   verified`; a camera scan of a label opens the app.

**Why.** Without the domain, `assetlinks.json` has nowhere to live and Android would never verify the
filter; adding the filter alone changes nothing for the user but still moves the fingerprint.

**Consequences.** Until then a phone camera opens labels in the browser (the web app, sign-in, then
the item) and the app's own scanner reads them directly. Real labels are printed only after E3
(#157).

## 260. Leaving a screen never reads an expo-audio object its hook has released — 12 Oct 2026

**Context.** Praveen, 12-10-2026, on the preview APK (update 01a12699): Back from Practice tools showed the
crash screen (#216) with "The 1st argument cannot be cast to type class expo.modules.audio.AudioRecorder
(received class java.lang.Integer)". The recorder panel (`components/audio-recorder.tsx`, used by S5 Record
myself, S7, C14 and the sloka editor) stopped a running recording in a `useEffect` cleanup by reading
`recorder.isRecording`. expo-audio's `useAudioRecorder` releases the native recorder in its own effect
cleanup, and React runs a component's effect cleanups in hook order, so on unmount the recorder was already
released; on Android the property getter then receives a bare id and throws, and a throw in an unmount
cleanup reaches the root ErrorBoundary. The web keeps working (its recorder is not a native object), which
is why the browser walks of every screen with Back found nothing.

**Decision.** The panel stops the recording in a `useLayoutEffect` cleanup, which React runs during the
unmount itself, before any `useEffect` cleanup and so before the release; and the stop goes through
`stopRecorderOnLeave` (`components/recorder-leave.ts`), which never throws and ignores a failed stop. Rule
for the app: a cleanup that touches an object made by `useAudioRecorder` / `useAudioPlayer` (or another
releasing hook) uses `useLayoutEffect`; `tests/back-crash.test.mjs` fails on a `useEffect` cleanup that does.
JavaScript only (fingerprint 185e839f unchanged), so it reaches the installed APK as an update.

**Why.** Reordering hooks cannot put our cleanup before expo-audio's (the recorder must exist first), and a
`try` alone would leave the microphone to be freed only by the release. A layout-effect cleanup keeps
"leaving stops the recording" and runs while the recorder is still alive.

**Consequences.** If a screen with the panel is ever hidden without being removed (React `Activity`, a
frozen screen), the layout cleanup stops a running recording then too, which is what leaving should do.
Expo's own listener removal after the release is harmless on Android: the AudioRecorder class declares no
events, so no native stop-listening call is made. #261 and #262 were reserved for this bug and are unused.

## 263. Accept: an adult's sign-up becomes a student record in one tap, by one database function — 12 Oct 2026

**Context.** Praveen's rule (12 Oct 2026): a student's registration form is filled once, by the student at
sign-up; staff never type it again. Register a student already listed the waiting sign-ups with "Fill the
form" (#162), which copies the answers into the form; the coordinator still had to save the form and could
change it by mistake. Students self-register on LIVE on 16-18 Oct 2026; the desk will accept many in a row.

**Decision.** Each adult sign-up on the waiting list gets **Accept**. It calls one function,
`accept_sign_up(profile)` (migration 0046, security definer, staff; a coordinator only for their own
centre, like the list). The function reads the sign-up's own data on the server (the profile's name,
mobile and centre, the confirmed sign-in email, the sign-up date of birth on `person_details`), inserts
the student (level 1, roll number by trigger), links the login and makes it a student, all in one
transaction. The About-you row moves to the record and the login's gender fills the record through the
0036 link trigger, which then gives the mentor by the Automatic rule (#165: the referral first, then
the least loaded coordinator of that gender). The record's `request_id` is the login's id: a second
Accept (a lost answer, or two coordinators at once; the profile row is locked) returns the first record
with `repeated: true`. A record that already carries the email without a login (registered at the desk
while the login was switched off) is linked instead of a second record being made (`existing: true`).

**Why one function, not the app chaining `register_student` + `save_student_details` + a link.** One
transaction cannot leave a record without its login or details; the server reads the data, so nothing
on the phone can change what is stored; the retry rule and the centre rule live in one place; the
existing triggers (link, details, mentor, audit) run exactly as on the desk path.

**Consequences.** Errors: `not_allowed`, `sign_up_not_found`, `already_registered`, `not_waiting`,
`email_not_confirmed`, `dob_required`, `minor_needs_desk`, `name_required` (the app maps each to a
sentence). Area and pincode stay empty (the sign-up does not ask them); the photo is taken on the
student's page as before. Tests: section "0046 registration accept" in `supabase/tests/smoke-test.mjs`.

## 264. Accept on the waiting list: one button per row, a confirm card that asks for the ID check — 12 Oct 2026

**Decision.** A waiting adult's row shows **Accept** (a person under 18 or without a date of birth shows
"Fill the form", as before). Accept opens a confirm card in place of the row: name, date of birth with the
age, centre, phone and email as the person gave them, the line **"Check the name against the government
ID."**, and Accept / "Change something first: fill the form" / Cancel. After Accept the screen stays on
the list with "Student registered: roll number …" and "Open the student's page"; the person leaves the
list.

**Why.** Two buttons beside a name do not fit a 375-pixel phone; "Fill the form" stays one tap away on the
card for a correction. Staying on the list suits accepting several people in a row.

## 265. A login set to "student" by hand without a record is linked like a waiting one — 12 Oct 2026

**Context.** On TEST (12 Oct 2026) a profile's role was set to `student` in the dashboard before any
record existed. `link_login_to_student` (0037), `link_student_email` (0002) and `link_student_login`
(0014) all asked for `pending`, so the login was never linked, and the app said "No student record
found" (#96 already treats such a login as `pending` for every rule).

**Decision.** Migration 0046 adds `login_awaits_record(profile)`: switched on, `pending` or a `student`
that no record points at, and not on a record yet. The three link paths, `waiting_sign_ups` (Register a
student) and `accept_sign_up` use it. Kept: the email must be confirmed (#13), a switched-off login is
never linked, a login already on a record is never linked again, the Guru and coordinators are never made
students. The migration also links, once, every such login whose email a record without a login already
carries.

**Consequences.** The rule for people stays: never set `student` by hand; register the record with the
login's email or Accept the sign-up. The Guru's people board (G2) still lists only `pending` logins; a
hand-set one is found on Register a student instead.

## 266. Accept is for adults only; under 18 stays at the desk with a parent — 12 Oct 2026

**Decision.** `accept_sign_up` refuses a date of birth under 18 (`minor_needs_desk`, by the centre's date,
like `register_student`) and a sign-up without a date of birth (`dob_required`); the app hides Accept for
both. The sign-up form already stops under 18 (#150) and keeps no minor's date of birth, so such a
sign-up should not exist; if one does, "Fill the form" with the parent, the ID check and the signed form
(C3) is the only way.

**Why.** A minor's data needs the parent's written consent before it is stored (#16); a one-tap path must
not reach around it. An adult's registration needs no consent row (as on the desk).

## 267. Person names take letters of any script only; phone boxes keep digits only — 12 Oct 2026

**Status: decided by the lead's brief (forms fix, Praveen's test of 12 Oct 2026); in the 16 Oct 2026 APK.**

**Context.** Praveen's test of the forms found that name boxes took digits and signs ("Ram 2"). Names
are written in Telugu, Hindi and English, so a Latin-only rule is wrong.

**Decision.** One rule for every person-name box (sign-up full name and Diksha name, About you's Diksha
name and emergency contact, Register a student's student and parent names, My profile's name, the
Ishtagoshti parent's name): `src/lib/person-name.ts` `checkPersonName`. A name is letters of any script
plus their vowel signs (`\p{L}\p{M}`, with the zero-width joiner and non-joiner of Indic keyboards),
with a single space, dot, apostrophe (' or ’) or hyphen between letters; it starts with a letter, ends
with a letter or a dot, has at least 2 letters and at most 80 characters (100 on Register a student,
the database bound is 120). Digits of any script (0-9, Telugu ౦-౯, Devanagari ०-९ ...) give "A name has
letters only, no numbers."; any other sign gives the "Use letters only ..." message (`validation.name*`,
en/te/hi). Names are saved trimmed with single spaces (`cleanName`). An engine without Unicode property
classes falls back to explicit Latin, Greek, Cyrillic and Indic ranges (tested). Phone boxes drop
everything but digits as they are typed (`typedPhone`: other scripts' digits read as 0-9, a + kept only
at the start, at most 15 digits), with the phone keyboard and `inputMode="tel"`; the country rules of
#164 still decide whether the number is real. The email check (`src/lib/email.ts`, one for every form)
now also refuses a domain without a dot and two letters at the end, spaces, commas and double dots.

**The exact rule** (for the SQL `clean_person_name` of migration 0047 to match; `checkPersonName`):
1. Clean: Unicode **NFC**, trim, every run of white space → one space (U+0020). Saved names are this text.
2. Empty → `required` (optional boxes: fine).
3. Any digit → `digits`: `[0-9०-९০-৯੦-੯૦-૯୦-୯௦-௯`
   `౦-౯೦-೯൦-൯０-９]` (ASCII, Devanagari, Bengali, Gurmukhi, Gujarati, Odia,
   Tamil, Telugu, Kannada, Malayalam, full-width).
4. Each character is a **letter** `[\p{L}\p{M}‌‍]` (letters, combining marks = matras, virama,
   anusvara, nukta; ZWNJ, ZWJ) or a **separator** `[ .'’-]` (space, full stop, apostrophe U+0027, right
   single quote U+2019, hyphen-minus U+002D); anything else → `symbols` (Telugu/Hindi danda ।, comma, @, _,
   emoji ...).
5. The first character is a letter; two separators never stand together, except `.`, `'` or `’` followed by
   a space ("K. Rama"); the name does not end in `-`, `'` or `’` (a final `.` is allowed: "Rao Jr.") →
   else `symbols`.
6. Fewer than 2 letters → `tooShort`; more than `max` characters → `tooLong` (max 80; 100 on Register a
   student and the Excel import, the database bound is 120; JS counts UTF-16 units).
Fallback when an engine lacks `\p{…}` (not expected on Hermes or browsers): letters =
`[A-Za-zÀ-ÖØ-öø-ɏ̀-ͯͰ-ϿЀ-ӿऀ-ॣ॰-৥`
`ৰ-੥ੰ-૥૰-୥୰-௥௰-౥౰-೥೰-൥൰-෿‌‍]`.
The Excel import's preview (`data/student-import.ts`) gives the same answer as row problems
`name_required`, `name_too_long`, `name_digits`, `name_signs`. The audit's staff-name clash and
invisible-character check stay server-side (My profile keeps its own hidden-character check too).

**Why.** Students self-register on LIVE from 16 Oct 2026 (launch Tue 20 Oct); a digit in a name reaches
roll lists, QR cards and certificates. The server half is the audit's P1-08 (migration 0047,
`form-rules-sql`); the sign-up insert path skipped the server rules until then.

**Consequences.** Names typed before this stay as they are until edited. A name with a digit in it
(none expected) cannot be saved from these forms.

## 268. Forms check each box when it is left, and Save goes to the first box with a problem — 12 Oct 2026

**Status: decided by the lead's brief (forms fix); in the 16 Oct 2026 APK.**

**Decision.** On the sign-up and Register a student: a box is checked when the person leaves it (a
problem shows at once, a fixed one goes away; an empty box says nothing until Save unless it showed a
problem already); a new date of birth updates its message at once. Save / Create checks everything,
shows every message, and takes the person to the first field with a problem in page order: the page
scrolls it to the middle of the screen and a text box gets the cursor (the keyboard opens on a phone);
a date or choice field gets the focus of its first control on the web. `components/form-focus.tsx`
(`useFormFocus`: `target(key)` refs, `focusFirst(order, errors)`, `focusField(key)`); Screen provides the
scroll view and one View around the page to measure against. The keyboard's Next button moves through
the text boxes in page order (the date of birth is a tap, so Next skips it).

The sign-up also refuses Create while the centre list is loading or failed to load (audit P1-05: the
account would otherwise get no centre and the server would pick the lowest-id one): the message "Your
centre is needed …" shows on the failed-list notice, the page goes to its Try again button, and the
message clears when the list arrives.

**Privacy notice tick (audit phase 3, S4-02, added 12 Oct 2026).** An adult's own sign-up recorded no
acceptance of the privacy notice. Create an account now has a required tick "I have read the privacy
notice." with the notice link directly above it (no longer under the button); without it Create shows
"Read the privacy notice (link above), then tick this box." and goes to the tick. The sign-up sends the
notice version it showed (`PRIVACY_NOTICE_VERSION` of #150, now '0.1-draft') in the user metadata as
`notice_version`; migration 0047 (`form-rules-sql`) keeps it in `handle_new_user`, and a database before
0047 ignores it.

**Join Ishtagoshti on the waiting screen (audit S4-08, added 12 Oct 2026).** The card showed the
placeholder "TEST —" terms, and an adult who joined left Register a student's waiting list (Accept then
answers `not_waiting`). It is now hidden for a login that has not started joining, behind
`IG_JOIN_FOR_WAITING` (`app/src/lib/ishtagoshti-terms.ts`, false). It is an app setting, not a database
one (no migration in this branch): to turn it on, put the team's terms in en/te/hi, set it to true and
publish an update; a test refuses true while any language still has the TEST terms. A login already
waiting for a parent's code still sees the card, to finish. Until then no one can join Ishtagoshti from
the app, although the sign-up's subtitle still mentions it (the team's wording, left as it is).

**Why.** Praveen's test: with the messages far up the page, people pressed Save again and nothing seemed
to happen.

**Consequences.** The web scroll is an instant jump (a smooth scroll does not run in a page that is not
drawing, and suits reduced motion); the reveal waits one `setTimeout`, not `requestAnimationFrame`, which
never fires in a background tab.

## 269. The page follows the phone keyboard with react-native-keyboard-controller — 12 Oct 2026

**Status: decided by the lead's brief (forms fix); native: in the 16 Oct 2026 APK.**

**Context.** Android draws the app edge to edge on SDK 57, so the window no longer shrinks for the
keyboard (`adjustResize` does nothing); Screen's KeyboardAvoidingView had no Android behaviour, and a
focused box low on the page stayed behind the keyboard with no way to scroll to it (Praveen's test).

**Decision.** `react-native-keyboard-controller` 1.21.9 (`npx expo install`, SDK 57's version; needs
reanimated, already in), as the Expo keyboard-handling guide shows for long forms: `KeyboardProvider`
once around the app (`components/keyboard.tsx` `KeyboardRoot`, in `src/app/_layout.tsx`) and Screen's
ScrollView replaced by `KeyboardAwareScrollView` (`bottomOffset` 96: the focused box and its hint stay
above the keyboard; the page gets room under it, so the last field and the button can be scrolled up).
Every screen uses Screen, so one change covers every form. The web keeps a plain ScrollView
(`keyboard.web.tsx`): the browser moves the page for its keyboard; `app/public/index.html` adds
`interactive-widget=resizes-content` to the viewport so Chrome on Android shrinks the page for it.
KeyboardAvoidingView is gone (its Android `behavior` was undefined: the root cause in the audit, F5 §4).

**Consequences.** New native code: fingerprint 0dea00a3 (brief9-apk) → **40e5832c**. Only an APK can
prove it: see the phone test list in NOTES.md "12-10-2026 — Forms fix".

## 270. Date of birth opens the phone's calendar; the web keeps the drop-downs — 12 Oct 2026

**Status: decided by the lead's brief (forms fix; docs/I18N.md P6); native: in the 16 Oct 2026 APK.**

**Decision.** `@react-native-community/datetimepicker` 9.1.0 (`npx expo install`, with its config
plugin). On Android the date-of-birth box shows the picked date ("15 June 2012") or "Tap to choose the
date"; a tap opens the phone's own calendar dialog (`DateTimePickerAndroid.open`, `display: 'calendar'`)
between 100 years ago and today, at the picked date or 18 years back when empty
(`pickerRange`, `startAge` prop). iPhone: the inline calendar under the box. The web keeps the day /
month / year drop-downs of #162 (`birth-date-field.web.tsx`). Used by the sign-up and Register a student;
the stored format and the under-18 rules are unchanged: the sign-up keeps day/month/year parts, Register a
student keeps its typed text ('15-6-2012', `typedOfParts` / `partsOfTyped`), so drafts and "Fill the form"
work as before. Register a student's empty date now says "Choose the day, month and year."; a wrong one
"Choose a real date of birth, not in the future."

**Why.** Praveen's test: no calendar on the date of birth. Typing a date on a phone keyboard was the
slowest box of the desk form.

**Consequences.** Other date boxes (events, visits, fund) stay typed until a later round (I18N P6).

## 275. Register a student: one request id per person, details on a repeat, a fresh waiting list — 12 Oct 2026

**Context.** Audit phase 1 (12 Oct 2026, P1-04, P1-06, F2-02, F2-03, F2-05, F2-13, F2-16) found that the desk form kept
its request id (#126) when it was filled from another sign-up or retyped for another person: after a Save whose
answer was lost but which was stored, the next person's Save returned the first person's record, so the next person
was not saved and the screen showed their name with the first one's roll number. A repeated Save also skipped the
details (gender, centre, About you), and each desk's waiting list was loaded once. Students sign up on LIVE on
16-18 Oct 2026 and several desks register at once.

**Decision.** (1) The form gets a new request id when it is filled from a sign-up and whenever the name or date of
birth changes; only a retry of the same person repeats. (2) On a repeat the app reads the stored record's name; when it
is another person's, the screen says "{{name}} was NOT saved" with the other record's name and roll number, keeps
the form with a new id and writes no details. (3) The details are sent after a repeated Save too (the keys overwrite).
(4) The waiting list reloads when the screen comes into focus and after each Save and Accept. (5) `mentor_not_staff`
has its own message (the mentor was switched off while the form was open), and only the pincode's own check gets the
pincode message. (6) Editing a field clears its message; phone fields take at most 16 characters.

**Not here.** The desk's centre picker and a duplicate-person check need a migration (the `form-rules-sql` worker,
0047); sign-up.tsx belongs to the `forms-fix` worker; the error summary, leave guard and autofill fixes are audit B4.
## 271. One name rule, the app's, in SQL for every person's name — 12 Oct 2026

**Context.** Audit phase 1 (12-10-2026), P1-08: the sign-up only trimmed the name (0036), the other
paths refused control and invisible characters only, so "Ravi 2", "రవి ౨" or "राम १" were stored; Praveen
found names accepting digits in his own test. forms-fix wrote the app's rule (`checkPersonName`,
app/src/lib/person-name.ts, #267); the lead asked that the database never disagree with it.

**Decision.** `clean_person_name(name, max)` (0047) is `checkPersonName` step for step: NFC; white
space (JavaScript's `\s`) made one space and trimmed; digits of ASCII, the nine Indian scripts and
full-width refused; every character must be a Unicode letter or mark, ZWNJ/ZWJ, or a separator
(space . ' ’ -); no separator first, none after another except a space after . ' ’ -; no name ending in
- ' ’; at least 2 letters; at most 80 characters (100 for a student record, a guardian, the import and
the Ishtagoshti parent). The app's kinds map to the codes the app knows: required `name_required`,
digits/symbols/tooShort `name_invalid` (the detail says which), tooLong `name_too_long`. It runs at
sign-up and on a login's name change (with the staff-name clash `name_taken`, now also at sign-up), and
by trigger on `students`, `guardians`, the emergency contact, the initiated name and the Ishtagoshti
parent whenever an app user writes a name (inside the app's functions too).

**Why.** PostgreSQL's regular expressions have no `\p{L}`, and `[[:alpha:]]` follows the server's
locale (PGlite and Supabase may differ), so "is a letter" is written out the other way round: the
refused characters, `person_name_symbols()`, are 765 code-point ranges generated from JavaScript's own
Unicode tables (supabase/tests/name-symbols.mjs, Unicode 17); the smoke test fails when they differ. A
run of both functions over 190,487 names (every BMP character at the start, inside and at the end of a
name, the app's test cases, astral samples) on 12-10-2026 found no difference. A trigger rather than
edits to each function catches every path, including direct API writes and Accept. (0047's first
draft used a short list of allowed scripts; it refused Greek, Arabic and other letters the app takes.)

**Consequences.** Known differences, both tiny: the app counts length in UTF-16 units and the
database in characters (a character beyond U+FFFF counts 2 in the app); a phone whose JavaScript has an
older Unicode than 17 refuses a newly added letter the database takes. The app's rule lets a joiner
count as a letter ("‌Ravi", or two joiners alone, pass) and a line break inside a name become a space;
the database follows it, so 0028's "a line break inside is refused" no longer holds. Names already
stored are not touched or re-checked; one is checked again only when edited. A sign-up with a refused
name or with the Guru's or a coordinator's name fails with Supabase's generic "Database error saving new
user" (the app checks the same rule first; the staff-name clash only the database knows). The dashboard
is not checked.

## 272. A minor needs their own guardian with a phone, and that guardian's consent, at every check — 12 Oct 2026

**Context.** Audit P1-01 (High): `check_minor_consent` (0003, 0039) asked only for a current data consent.
A coordinator writing tables directly could add an adult, add a data consent naming no guardian (or
another child's), then change the date of birth to a minor's: nothing refused it (#16, #100).

**Decision.** One function `minor_rule_gap` decides, used by the commit-time checks on students (insert,
`dob`, now also `withdrawn_at`) and on consents and guardians (0025, 0028): a minor on record and not
withdrawn needs a current data consent (`minor_needs_consent`), a guardian with a phone
(`minor_needs_guardian`) and a current data consent given through one of their own guardians
(`minor_needs_consent`). A consent naming another student's guardian is refused at once, for everyone
(`consent_guardian_mismatch`).

**Why.** The same test everywhere closes the gap between the insert check and the 0028 recheck;
`register_student` already writes exactly this shape, so the app is unaffected.

**Consequences.** A minor stored before 0047 whose consent names no guardian keeps working until their
record, consent or guardian is changed; the TEST check query of 12-10-2026 counts such records (LIVE has
no class data).

## 273. A student sets their own gender once; staff change it — 12 Oct 2026

**Context.** Audit P1-12: About you let a student overwrite the gender on their own student record at any
time, though #164 said "only if none", and the gender drives mentor matching (#165).

**Decision.** `guard_student_gender` keeps a gender already on the record when the student's own login
writes it: no change, no clearing, no error; About you shows the kept value. An empty gender is filled
as before; coordinators and the Guru change it in `save_student_details`.

**Why.** Silent keeping needs no new error message in three languages before launch; the screen shows
the kept value after the save. The app may disable the field once set (a JS change, not 0047).

## 274. The desk's default centre is the coordinator's; the desk can ask for possible duplicates — 12 Oct 2026

**Context.** Audit P1-05 and P1-06: a student typed in at the desk always got centre 1 (the column
default), and nothing warned of a person already on record or already signed up.

**Decision.** `students.home_centre_id` defaults to `default_home_centre()`: the signed-in Guru's or
coordinator's own active centre, else the lowest active centre, else 1; an explicit centre is kept.
`possible_duplicates(full_name, dob, phone)`, staff only, lists up to 10 student records (every centre)
and waiting sign-ups (the coordinator's centre; the Guru all) with the same cleaned name and date of
birth, or the same phone's last 10 digits; the app shows "Possible duplicate" before saving (B2, a later
JS change). The sign-up's own centre fallback is left as it is: the app blocks a sign-up whose centre
list failed (forms-fix), and refusing in the database would fail the sign-up with a generic error.

**Why.** A column default covers the desk form, the import and the API without changing
`register_student`'s signature, which the desk form calls. Name and date of birth together (or a
phone) keep false alarms rare: siblings share a parent's phone, not their own.

## 276. A minor's record is linked to a login only by the Guru; no shared parent/child email — 12 Oct 2026

**Context.** Audit phase 3, early findings (Notes audit chat, confirmed in PGlite on 0001-0046):
P1-18/S1-04 (High) a coordinator saving an email on a 16-year-old's record linked any confirmed waiting
login with that email at once, and that login then read the child's date of birth, area, PIN code,
roll number, QR code, visits and the parent's emergency contact (About you); S2-01 the reverse: a
parent's email typed on a child's record linked the parent's own adult sign-up to the child (role
student, writes the child's row through About you); S2-03 a coordinator's direct insert could set a
student's `profile_id` to any login, even the Guru's; S2-04 an app user could insert an `email_code`
consent although no code flow exists.

**Decision (0047).** Neither automatic link path (`link_login_to_student` on confirming an email or in
Accept; `link_student_email` when an email is saved on a record) links a record of someone under 18.
The Guru links one explicitly (`link_student_login`, G2); coordinators get no confirm step of their own
for now (a child's login is rare: children use the parent's phone or a printed QR card, #248-#252).
A guardian's email may not be any child's record email (`guardian_email_on_minor`), as a child's record
already may not hold any guardian's email (0038). An adult student may still share a guardian's email
(D1a-15, a parent learning too): without automatic links onto minors, that email can only link the
adult's own record. A student inserted by an app user gets no login, a fresh QR code and the inserting
user as creator, whatever the request said. An app user's `email_code` consent is refused
(`consent_method_not_allowed`).

**Why.** Linking by email trusts that the email is the student's own; for a child it is very often the
parent's, and a wrong link hands a child's data to another adult. The Guru's explicit link is rare
enough to do by hand.

**Consequences.** A child who signs up with the email on their record stays `pending` ("waiting") until
the Guru links them; a record that turns 18 is not linked by itself either, until its email is saved
again or the Guru links it. Withdrawn records and the rest of the S2-02 linking rules follow in 0048.
The lead may still decide to refuse an adult's email equal to a guardian's (one line in the guard).

## 280. The privacy notice ticked at sign-up is kept; Accept needs it — 12 Oct 2026

**Context.** Audit phase 3 S4-02 (High): an adult's own sign-up recorded no acceptance of the privacy
notice, while the desk records one with a minor's consent (`consents.notice_version`, 0034, #150).
forms-fix now sends `notice_version` in the sign-up's metadata after a required tick.

**Decision (0047).** `handle_new_user` keeps it in `person_details.notice_version` with
`notice_accepted_at` (same shape as the consent's: a short version code); a missing or malformed one is
left out and never fails the sign-up. The row moves to the student record with the other sign-up
details when the login is linked. `waiting_sign_ups` shows it; `accept_sign_up` refuses a sign-up
without one (`notice_not_accepted`), so the desk uses Fill the form.

**Why.** A consent row needs a student record, which a sign-up does not have yet; the details row is the
person's own data from sign-up on, and travels with them.

**Consequences.** Sign-ups made before the app sends the tick (TEST, and any LIVE sign-up from an old
app) cannot be accepted with one tap. Open: an adult registered at the desk by Fill the form has no
notice version stored (`register_student` records one only on a minor's consent); and if the student
record already has a details row when the login is linked, 0036's merge keeps the record's row and the
sign-up's notice is not copied (rare: a record that got About-you answers at the desk before the link).

## 281. A withdrawn record is never linked again, and nothing new is recorded about the student — 13 Oct 2026

**Context.** Audit phase 3 S2-02 (High): after a parent withdrew consent (`withdraw_consent`, #76), the
record was frozen only against app users' direct writes; the linking functions run as the owner, so the
child's own later sign-up (or the Guru's G2 link, or Accept) attached a new, switched-on login to the
frozen record, and practice logs, phones for pushes and promotion started again. `refuse_withdrawn` (0025)
was on visits, calls, call tasks and syllabus ticks only.

**Decision (0048).** The automatic link paths skip a withdrawn record (like a minor's, #276);
`link_student_login` and `accept_sign_up` refuse with `student_withdrawn` (Accept: any withdrawn record
with the sign-up's email, so no second, unfrozen record of the same person is made). A login on a
withdrawn record cannot be switched on (`guard_withdrawn_login`, for everyone, the dashboard too). One
error code for every refusal: **`student_withdrawn`**, the code 0025 already used (the app shows it on
attendance, calls, About you and QR cards). `refuse_withdrawn` now also guards `practice_logs`,
`push_tokens` (through the login's record), `promotion_nominations`, `promotion_feedback`, `level_history`
(so the Guru's "promote" is refused; "not yet" and "more feedback" still close or keep a nomination) and
`inventory_loans`; where a whole list is written at once (`assessment_assignments`, `event_attendance`,
`event_performers`, like the daily job's call tasks) the withdrawn student is left out without an
error, so the rest of the list is saved. The migration switches off any login already on a withdrawn
record and forgets its phones.

**Why.** DPDP s.6: processing stops when consent is withdrawn. A second record for the same person
would undo the freeze as surely as a link.

**Consequences.** The parent consenting again stays the documented SQL-editor step (OPERATIONS
"Withdrawal of consent": clear `withdrawn_at`, new consent, then switch the login on in G2 — in that
order, or the switch is refused). The desk can still register the person as a new record with a new
consent; `possible_duplicates` shows the old one as withdrawn. G2's link, promotion, instrument loans
and Accept show the app's generic error for `student_withdrawn` until an app message is added (JS).
Votes, RSVPs and assessment submissions are covered by the login staying off (`my_role()` is null).

## 288. Audience and staff-name checks answer for the person asking only — 13 Oct 2026

**Context.** Audit phase 3 S1-01 (Medium): `audience_profiles` gave any signed-in login (waiting,
Ishtagoshti subscriber, kiosk, switched off) every active student's and staff member's login id, per
level and per mentor, and `event_visible_to(event, any login)` said whether someone was in an event's
audience. S1-02 (Low): `staff_name_taken(id, name)` told anyone whether a name is the Guru's or a
coordinator's, and with an id which login carries it.

**Decision (0048).** `audience_profiles` is no longer executable by app users (only the owner's
functions and pg_cron use it). The polls rule asks `in_audience(...)`, which tests the caller only.
`event_visible_to` answers about another login only for staff (and with nobody signed in).
`staff_name_taken` answers for the caller's own id (the sign-up runs with nobody signed in; a name
change passes the caller's id) and for the Guru, who names coordinators; anyone else gets false.

**Why.** The rules need "is this person in the audience", never the list. The name clash must stay a
rule of the sign-up and of a name change, so a login can still learn that one name is taken by trying
it for itself — that much the rule itself tells, but no list and no id-to-name mapping.

**Consequences.** No app change: the app calls none of these directly.

## 289. A QR re-scan within 10 minutes of the check-in does not check out — 13 Oct 2026

**Context.** Audit phase 2 R2-05/R5-12: the app gives up on an answer after 15 seconds; a coordinator
who scanned the same student again more than 30 seconds after a lost answer checked the student out,
and with parent emails on the parent got a "left" email.

**Decision (0048).** A QR scan within `qr_rescan_minutes` (setting, default **10**, 1-60) of the open
visit's check-in answers `already_in` and changes nothing; the open visit is today's (an earlier day's
is closed first) at the student's centre. The 30 seconds after a check-out (`already_out`, 0038) and
the coordinator's tap on Mark attendance (manual, always checks out) are unchanged. The setting is
changed in the SQL editor (G10 does not show it; old builds keep working).

**Why.** Ten minutes covers a retry, a second phone and a queue at the door; a real visit is longer.

**Consequences.** A student who really leaves within 10 minutes is checked out by a tap on Mark
attendance, or by the centre's closing time (the night email is off, #246).

## 290. The privacy notice stays on the record: the merge, and Fill the form for an adult — 13 Oct 2026

**Context.** #280's two open points: when a login is linked to a record that already has About-you
answers, 0036's merge dropped the notice the person ticked at sign-up; and an adult registered by Fill
the form had no notice stored.

**Decision (0048).** The merge keeps the record's own notice when it has one, else the sign-up's (with
its time). `register_student` keeps `p_notice_version` for an adult on the record's About-you row, through
the new staff function `record_desk_notice(student, version)` (set once: a notice already there stays;
`notice_version_invalid`, `student_withdrawn`). A minor's stays on the parent's consent.

**Why.** The tick is the person's own record of the notice they were shown; it should follow them.

**Consequences.** The app sends `p_notice_version` today only for a minor
(app/src/data/students.ts); sending it for adults too is a one-line JS change for the app chip. A
sign-up whose email the desk typed differently is not linked, so its notice stays with the login.

**Update 13 Oct 2026 (#292):** the app now sends it for an adult too (weekend-app).

## 282. A YouTube lesson in the browser plays in YouTube's own frame, driven by messages — 13 Oct 2026

**Status: decided by the lead's brief L7 (audit phase 3, S5-01); branch `launch-cleanup`. Web upload only.**

**Context.** The web lesson player (#56, #142) was a srcdoc iframe without `sandbox`, so it had the app's origin, and
it loaded YouTube's IFrame Player API script (`www.youtube.com/iframe_api`) into it. Code served from www.youtube.com
therefore ran with the app's reach: it could read the stored Supabase session (refresh token) of a Guru, coordinator
or student who opened a YouTube lesson on the web. The brief asked to sandbox the frame. A sandbox without
`allow-same-origin` is inherited by the YouTube frame inside it, so YouTube's player would run without storage and
very likely fail; the audit's own fallback was a separate origin or driving YouTube's embed by messages.

**Decision.** On the web a YouTube lesson shows YouTube's embed page itself
(`https://www.youtube.com/embed/<id>?enablejsapi=1&origin=<app>`) in an iframe with
`sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"` (the origin is
YouTube's, not the app's; no top navigation, forms or downloads). The app drives it with the messages the IFrame API
itself uses (`listening`, then `infoDelivery` / `onReady` / `onError` from the embed; `command` with `playVideo`,
`pauseVideo`, `seekTo`, `setPlaybackRate`), as other players do (vidstack). `src/lib/youtube-embed.ts` holds the
protocol and the bookkeeping (speeds from the embed's list, time counted on between reports, the A-B loop, state 10
times a second, "no internet" after 15 s of silence), so the lesson screen and its events are unchanged. Messages are
accepted only from `https://www.youtube.com` and that frame; commands go only to that origin. `https://www.youtube.com`
left `script-src` in `app/public/_headers` (it stays in `frame-src`). A video FILE keeps the srcdoc player page: it
runs only its hash-pinned script and a `<video>`, no third-party code. Phones keep the WebView page with the API
script: the WebView is not the app's origin (S5-06, #285 locks its navigation).

**Why.** It removes the third-party script from the origin that holds the login, keeps YouTube's player working (it
keeps its own storage), and needs no extra host or DNS (a `player.` subdomain waits for the domain move).

**Consequences.** Not checked against real YouTube from the office: the network resets connections to youtube.com
(as in #56). Unit tests cover the protocol (`app/tests/youtube-embed.test.mjs`, 6 tests). **Before the web upload a
real check is needed** on a phone hotspot or a home network: open a YouTube lesson on the TEST web build at 375 px,
press Play / Pause, change speed, set A and B, go fullscreen and back. If YouTube does not answer the messages, revert
this commit alone (the frame then has the app's origin again, as before) and keep S5-01 open.

## 283. Every sign-out deletes the recordings on the device — 13 Oct 2026

**Status: decided by the lead's brief L7 (audit phase 3, S5-02); branch `launch-cleanup`. JS (OTA + web).**

**Context.** #186 says every sign-out clears what the person left, but recordings were not covered: "Record myself"
keeps up to 30 takes in the app's own `recordings/` folder with no owner, listed to whoever signs in next on a shared
family phone (and attachable to that person's assessment); expo-audio leaves every recording (assessment answers,
coordinators' voice notes) in the cache (`Audio/` on Android, `ExpoAudio/` on iOS). In the browser the takes stay in
the open tab's memory after Sign out.

**Decision.** `clearDeviceTraces` (every SIGNED_OUT, also a forced one) calls `forgetMyRecordings()` (phones: deletes
`recordings/`; browser: revokes the blob addresses and empties the list) and deletes the cache folders `Audio` and
`ExpoAudio` besides the pickers' (`TRACE_FOLDERS`). A folder still in use does not stop the rest; the next sign-out
tries again. Takes stay on the phone while the same person is signed in, as before.

**Consequences.** A student who signs out loses their kept takes (they were never uploaded, #56); the screen already
says they stay on this phone only. Tests: `app/tests/launch-cleanup.test.mjs` (S5-02).

## 284. Form drafts expire after 3 days, checked at every app start — 13 Oct 2026

**Status: decided by the lead's brief L7 (audit phase 3, S5-03); branch `launch-cleanup`. JS (OTA + web).**

**Context.** A draft kept after a forced sign-out (#218) was deleted only when it was read: when a form opened, at the
next sign-in or at Sign out. On a phone or browser where nobody signed in again, a minor's name, date of birth and
guardian's phone stayed past the "7 days" of #218.

**Decision.** `purgeExpiredDrafts()` runs once at app start (the auth provider's first effect, before the login is
read) and deletes a draft that is too old or unreadable. The age limit is now **3 days** (`DRAFT_DAYS`): the person
whose login ended usually signs in again the same day, and 3 days still cover a class weekend.

**Consequences.** #218's "7 days" now reads 3 days. A device that is never opened again still keeps its draft (nothing
can run then); that is the login's own storage, cleared with the app's data. Tests: `launch-cleanup.test.mjs` (S5-03).

## 285. The phone's lesson WebView stays on its page, under our own domain — 13 Oct 2026

**Status: decided by the lead's brief L7 (audit phase 3, S5-06); branch `launch-cleanup`. JS (OTA).**

**Context.** The Android lesson WebView (#56) allowed any navigation (`originWhitelist={['*']}`, no
`onShouldStartLoadWithRequest`), so a tap on YouTube's logo could put another site where the player page was, with the
app's message bridge. Its base URL (the Referer YouTube sees) was `https://mridanga-seva.app`, a domain the team does
not own.

**Decision.** `src/lib/lesson-navigation.ts` decides each load: the player page (its base URL) and `about:` / `data:` /
`blob:` stay; YouTube's player frame (`/embed/`) stays; any other YouTube page (watch, channel, logo) opens outside
the app (`Linking.openURL`); everything else is stopped. Frames inside the page (iOS reports them) may load any https
address: they are another origin. The base URL is now `https://app.mridangaseva.com` (the team's domain, as the asset
labels' links, #161).

**Consequences.** If Android ever reports an ad frame inside YouTube's player as a page load, it is stopped (the
player still plays, as with an ad blocker). Phone check with the next OTA on the production APK: a YouTube lesson
plays; tapping the YouTube logo opens the YouTube app or browser, not a page inside the lesson. Tests:
`launch-cleanup.test.mjs` (S5-06).

## 286. Unlisted assessment files go daily; one login stores at most 150 MB a day — 13 Oct 2026

**Status: decided by the lead's brief L8 (audit phase 3, S3-02, S3-03); migration 0049, branch `launch-cleanup`.**

**Context.** S3-02: a recording uploaded for an assessment but never submitted (app killed, offline, a failed
clean-up) stayed in `assessment-files` for ever, and `erase_student` listed only submitted files, so an erasure left
a child's recordings in Storage. S3-03: a student with one open assessment could store 10 files of 50 MB a day and
fill the free plan's 1 GB in two days.

**Decision.** `orphan_assessment_files()`: files in `assessment-files` over a day old that no `assessments.media` and
no submission's `file` / `voice_note` lists, at most 200, none while `assessments` is empty (a half-done restore).
`claim_expired_submission_files()` also returns them with `submission_id` null, so the Edge Function's existing daily
clean-up deletes them through the Storage API **without a deploy**; `orphan_files_daily()` (job `mridanga-orphan-files`)
asks for the clean-up when there are any. No new job. `erase_student` lists every file in the child's folder. Upload:
a student's or coordinator's files of the last 24 hours must total under 150 MB before another upload (besides the 10
files); the Guru has no cap.

**Why.** Reusing the claim and the job keeps the launch free of an Edge Function deploy and of a new job in the
checklist. 150 MB is about 3.5 hours of the app's audio a day per login.

**Consequences.** An erased child's files go within about two days without the runbook's hand step (OPERATIONS
"Erasure request" checks the count). The cap is counted from `storage.objects.metadata.size`; the file being uploaded
is not counted until it is stored, so the most is about 200 MB a day.

## 287. Erasure matches emails whole, takes the notices, and covers waiting sign-ups — 13 Oct 2026

**Status: decided by the lead's brief L8 (audit phase 3, S2-06, S4-05, S4-06); migration 0049, branch `launch-cleanup`.**

**Context.** S2-06: erasure blanked every audit row whose text contained the erased email, so erasing ram@ also blanked
the history of sriram@. S4-05: the mentor's inbox kept "You are now the mentor of <child>" (and other staff notices
naming the child) for a year, and `push_outbox` kept them for ever. S4-06: a sign-up that never became a student
could only be deleted in Authentication → Users, which left its name, phone, email and date of birth in `audit_log`.

**Decision.** One internal helper `audit_redact(ids, emails)`: an id (uuid) matches anywhere, an email only as a whole
JSON value (`"x@y.z"`); `erase_student`, `anonymise_staff` and the new function use it. `forget_notices_about(record,
name, urls)` deletes inbox notices and `push_outbox` rows whose url holds the record id or names her assessments to
review or her nominations, and notices (not announcements) and pushes whose title or text holds her full name as
whole words; `erase_student` calls it and returns `notices_deleted`. `inbox_cleanup()` also deletes `push_outbox` rows
older than 30 days. `erase_login(profile, reason, request_ref)`: the Guru (app) or the owner (SQL editor) erases a
`pending` login on no student record: phones, login (with its profile, About you details and Ishtagoshti rows),
audit values, tombstone in `erasures.login_profile`.

**Consequences.** An email written inside a longer text (a call note) is no longer matched; the row's ids still are.
A notice about another person with exactly the same full name goes too (inbox only). No app screen calls
`erase_login` yet: the runbook is OPERATIONS "A sign-up that never became a student". Tests: smoke-test section "0049
launch clean-up" (30 checks, finding IDs in the names).

## 291. Register a student shows every waiting sign-up, searchable — 13 Oct 2026

**Context.** Audit phase 2 R2-01 (High): the desk drew only the 10 newest waiting sign-ups, with no search
and no refresh, so on the registration weekend an earlier sign-up could not be found or accepted; R2-02: a
failed side-load hid the list without a word.

**Decision (JS).** The waiting list is kept apart from the option lists. Every sign-up `waiting_sign_ups`
returns is listed, newest first, ten at a time with "Show more (N of M shown)"; a search box finds a person
by part of the name or email, or 3 or more digits of the phone (spaces and +91 ignored). The list reloads on
focus, on pull-down (phone) and with "Refresh list" (web too); only the newest reload's answer is used. A
failed first load says so with Try again; a failed reload keeps the list and says it is the one from before.
Rules in `app/src/lib/waiting-list.ts` (unit-tested).

**Why.** The registration weekend's desk works from this list; a person it cannot find is re-typed by hand,
against Praveen's "filled once" rule.

**Consequences.** No SQL change; the server already returns the whole list (180 days, own centre).

## 292. The desk's messages for the 0047/0048 refusals; an adult's notice at Fill the form — 13 Oct 2026

**Context.** Audit phase 2 R2-03 and phase 1 FF-01: since 0047 Accept refuses a sign-up without the privacy
tick (`notice_not_accepted`), and the app showed "Something went wrong"; 0047/0048 added `name_invalid`,
`name_too_long`, `gender_unknown`, `consent_guardian_mismatch`, `consent_method_not_allowed` and
`student_withdrawn` (#281) with no message; a sign-up refused for the Guru's or a coordinator's name showed
Supabase's generic error. #290 left sending the adult's notice to the app.

**Decision (JS).**
1. A waiting sign-up with `notice_version` null has no Accept: the row says "No privacy tick at sign-up: use
   Fill the form". If Accept still answers `notice_not_accepted`, the message says to use Fill the form and
   show the notice, and Fill the form becomes the first button on the card.
2. Messages (en/te/hi) for the codes above; `student_withdrawn` ("ask the Guru") in the shared
   `fallbackErrorKey`, so Accept, the desk form, loans, practice, nominations, assessments and events all
   word it; the Guru's link (`link_student_login`) goes through it too.
3. An adult registered with Fill the form sends `p_notice_version`: the version the sign-up ticked, else the
   current one when the coordinator ticks "I showed them the privacy notice" (optional; nothing is sent
   without it). The form shows the notice link for an adult.
4. Sign-up: Supabase Auth hides a database refusal of the new login behind "Database error saving new user"
   (HTTP 500); the app shows "If your name is the same as the Guru's or a coordinator's, add your surname or
   an initial…". The app does not ask `staff_name_taken` first (anon may not call it, #288).
5. Wording: the desk's email hint for a child says a child's record is not linked to an app login and the
   child checks in with the printed QR card (R1-01 text part; #276); the waiting screen says come to the
   class desk with an ID, then tap Check again (R1-03). The import preview says "fewer than two letters" for a
   one-letter name (FF-02).

**Why.** Each refusal is a dead end on the weekend's main path unless the screen says the way through.

**Consequences.** te/hi are drafts for native review. R1-01's policy (a child's own login) stays Praveen's.

## 293. A QR scan says "Checking…" and takes no next code until its answer — 13 Oct 2026

**Context.** Audit phase 2 R2-04 / R5-03: after a scan nothing showed for up to 8 s (location) plus the call
(15 s limit since #237), "Scan the next student" was offered meanwhile, and the next student's code was read
and silently dropped.

**Decision (JS).** From the read of a code to its answer, Mark attendance shows "Checking…" with a spinner and
no "Scan the next student"; the camera stays paused. A code read while one is checked shows "Still checking
the last scan". A read with no position fix in 8 s answers `no_fix` at once for the next minute (a fix that
arrives late is kept), and the position is warmed up on "Scan the next student". The 10-minute re-scan answer
(`already_in`, #289) shows as "Already checked in".

**Why.** A dropped code at the door looks like a check-in to the student and the coordinator.

**Consequences.** On a phone without a fix the first check-in of each minute still waits 8 s.

## 294. Restart on the crash screen; start-up crashes of an update go to expo-updates; one list of LIVE web addresses — 13 Oct 2026

**Context.** Audit phase 2 R4-03: the crash screen (an error boundary, #216) caught every error, so
expo-updates never saw a bad update crash and could not roll it back; the screen offered no Restart and no
way into a fixed update. R2-08: the LIVE app opened "Print QR cards" on app.mridangaseva.com, which is not
live before the domain move, and its scanner refused labels printed from mridanga-seva.pages.dev.

**Decision (JS).**
1. The crash screen has "Restart the app" (`restartApp`: `Updates.reloadAsync` on the phone, a page reload on
   the web), looks for a newer update at once (no 30-minute wait) and shows "A new version is ready /
   Restart now" when one is downloaded.
2. A crash within 8 s of the start while a downloaded update runs is handed to React Native's global handler
   as a fatal error, so expo-updates' error recovery runs (docs.expo.dev/eas-update/error-recovery: before
   the first content shows, the update is marked failed and the app goes back to the last good one; after it,
   expo-updates looks for a fix for 5 s, then the app closes and the next start runs the fix). Once per
   update id (kept on the phone): if the same update crashes at start again, the crash screen shows, so a
   crash caused by data cannot close the app on every start. The APK's own JavaScript always shows the crash
   screen. Rule in `app/src/lib/crash-recovery.ts` (unit-tested).
3. `LIVE_WEB_ORIGINS` in `app/src/lib/asset-link.ts`: `https://mridanga-seva.pages.dev` first (where Print QR
   cards opens and what new labels carry), then `https://app.mridangaseva.com`; labels from both scan. The
   domain move = swap the two lines.

**Why.** Launch week will have several OTAs; a bad one must not trap students and the door phone. Cards for
children without phones must print from the APK before the domain moves.

**Consequences.** Goes in Friday's APK (fingerprint unchanged, 40e5832c), so it protects against bad updates
published after it. Labels printed on pages.dev keep scanning after the domain move. Phone-only checks:
NOTES.md (main folder) "13-10-2026 — Weekend app fixes".

## 301. Back returns to the screen you came from: stack copies of the tab screens — 13 Oct 2026

**Context.** Audit phase 2 R4-01. A screen on top of the tabs (Overview, Follow-ups by coordinator, My
profile) that opened a tab's address (Students, Follow-up calls, Mark attendance, My QR) made Expo Router push a
second copy of the whole tab set; Back then landed on that copy's Home, and a third Back was needed. The same
happened for "Back to home" on My progress and Attendance history (`router.navigate('/student')`: a NAVIGATE on
the stack pushes unless the route is the focused one).

**Decision (JS).** Four stack routes show the tab pages on top of the screen that opened them:
`staff/class-list` (Students, with `?status=notLeft`), `staff/calls` (Follow-up calls, with `?scope=` /
`?assignee=`), `staff/mark-attendance`, `student/qr`; each renders the tab file. The Overview tiles, the
Follow-ups rows and "Open all", and My profile → "My QR card" push these. "Back to home" and the announcement
editor's "not found" use `router.dismissTo` (back down to the tabs already there). A unit test fails when a
file outside `(tabs)/` pushes, navigates or replaces to a tab address (`tests/launch-week-app.test.mjs`).

**Why.** Praveen's rule: Back must return to the screen you came from. A copy of the tabs also kept every tab
screen mounted twice on low-end phones.

**Consequences.** A new link from a stack screen to a tab page needs a stack copy (or dismissTo); the test
says so. The web addresses of the copies differ from the tabs'.

## 302. The Guru's week-1 tools: mentor, level, wrong login, and a guarded "Make a coordinator" — 13 Oct 2026

**Context.** Audit phase 2 R3-01, R3-02, R3-03, R3-05. "Mentor needed" notices led to a student page with no
way to give a mentor; Accept and the desk make everyone Beginner, joined today; a wrong login link had no
undo in the app (`unlink_student_login` refuses in the SQL editor); since 0046 every adult sign-up waits in
Coordinators → "Waiting for a role", where "Make a coordinator" was one confirm away and cannot be undone.

**Decision (JS, no migration).**
1. Student profile, the Guru only: "Facilitator: this record" with Choose / Change mentor (active staff,
   `reassign_mentees`), Set level and "Joined the class on" (a direct update; the database allows it to the
   Guru only and writes level_history), and "Take the login off this record" (asks in place;
   `unlink_student_login`; the login goes back to waiting).
2. Coordinators: "Waiting for a role" shows the count and a search (2+ letters of a name or email, 3+ phone
   digits); the whole queue is never drawn. "Make a coordinator" warns in red that the role sees every child's
   record and cannot be taken back, and is enabled only when the person's name is typed (case, accents and
   spaces do not matter). Rules in `app/src/lib/guru-tools.ts` (unit-tested).
3. R3-04 (remove a duplicate, undo an import) is not built: it needs a migration (a `delete_student_record`
   that refuses linked or visited records, and an import undo). Until then duplicates go to the Guru and
   Praveen cleans up in SQL (`erase_student`, OPERATIONS.md).

**Why.** The registration weekend fills these lists; the Guru needs to act from the phone in week 1.

**Consequences.** Status (New) is not set by hand: it follows the usual rules. A record whose login was taken
off can be linked again on Coordinators (Link to a student record).

## 303. My QR is saved on the phone from the student home — 13 Oct 2026

**Context.** Audit phase 2 R1-02: the card was saved only when My QR was opened online, so a student accepted on
the weekend who first opened My QR at the door without signal saw "Could not load your QR card".

**Decision (JS).** The student home's load also asks for the card (`keepMyCardSaved`, data/my-student.ts): once
per app run and login, again after a failure; sign-out still deletes it (#186) and resets the once-per-run mark.

**Why.** The door often has no signal; #21 promises My QR without internet.

**Consequences.** One small extra read per app start for students. A student who never opens the app online
after sign-in still has no card (printed card or roll number at the door).

## 304. Reads give up after 10 s, once — 13 Oct 2026

**Context.** Audit phase 2 R5-01: the database library retries a failed read (GET) three times with waits of
1, 2 and 4 s, and each attempt had the 15 s limit of #237, so a stalled read failed after 67 s; without
internet after 7 s.

**Decision (JS).** `db: { retry: false }` on the Supabase client, and a 10 s limit for reads (GET, HEAD); writes
and database functions keep 15 s, Storage uploads none (`timeLimitFor`, app/src/lib/timed-fetch.ts).

**Why.** People at the hall stare at grey cards for a minute and think the app is broken; every screen offers
Try again.

**Consequences.** A read hitting a passing 503/520 from the server is not retried by itself; Try again does it.
Measured in the browser on TEST: a stalled list read showed the error after ~11 s with one attempt.

## 305. A refused or failed push registration shows a quiet notice and is retried — 13 Oct 2026

**Context.** Audit phase 2 R5-04: "Don't allow" or a failed `register_push_token` left the phone without
announcement pushes and nothing said so; it was tried again only at the next cold start.

**Decision (JS).** `app/src/lib/push-state.ts` keeps the outcome of each registration. The three homes and My
profile show a plain notice: "Notifications are off on this phone" with "Turn on in Settings" (and "Not now"
on a home, remembered on the phone), or "Notifications are not working yet" after a failure. When the app
comes back to the front while push is refused or failed, it registers again without asking again. Nothing on
the web (no push there).

**Why.** Announcements are a core journey; the in-app inbox still has them, but people must know.

**Consequences.** A person who refused keeps the notice on My profile. Phone check only.

## 306. Print QR cards keeps its chosen students through web sign-in — 13 Oct 2026

**Context.** Audit phase 2 R2-08 (secondary): the phone app opens Print QR cards in the browser as
`/staff/qr-cards?ids=…`; when the browser was not signed in, the remembered address kept only the path (#30,
D14-15: no query, which can carry sign-in tokens), so the chosen students were lost.

**Decision (JS).** `keptQuery` (app/src/auth/requested-path.ts) keeps `ids` for `/staff/qr-cards` only, and
only values that are record ids (UUIDs), at most 300. Nothing else of any query is kept.

**Why.** A coordinator printing one child's card from the phone must not have to find the child again.

**Consequences.** A remembered push target still keeps no query.
## 313. Attendance by name answers at once; long people lists are drawn 50 at a time — 13 Oct 2026

**Context.** Audit phase 4 P5-04: a tap on a name on Mark attendance waited for the check-in and then for a full
reload of today's list, and every other name was locked meanwhile; on weak data each check-in took seconds.
P5-01: an announcement to everyone opened with ~600 "not seen yet" rows drawn at once; the Students tab drew the
whole class (D9-08).

**Decision (JS).** The tap's answer changes "here now" on the screen at once (`withMarked`,
data/attendance.ts: a check-in adds the student and counts a visit, a check-out takes them off), the list loads
again behind it (an older load answering late is dropped), and other names stay tappable (mark_visit changes
nothing when the student already is in that state). The seen / not-seen lists of an announcement and the
Students tab draw 50 rows, with "Show more (n left)"; the Students tab starts again at 50 when a filter or the
search changes.

**Why.** The door must keep moving; low-end phones stall on hundreds of rows.

**Consequences.** For a moment the screen shows the answer before the server's list; the reload then
corrects it if anything differs. Measured in the browser on TEST (answer faked, reload held 6 s): the button
became Check out after ~0.1 s.

## 314. TalkBack hears confirm questions and search counts — 13 Oct 2026

**Context.** Audit phase 4 P2-01: confirm questions (desk "Accept <name>?", delete an announcement, check out
everyone and 9 more) were info notices, which are not announced; four confirms only changed a button's words.
P2-03: count lines used role="status", a live region on the web only; the attendance name search said
nothing about how many were found.

**Decision (JS).** The 12 confirm notices are `announced`; the four label-swap confirms call `announce()` with
the new button words. A `StatusText` (accessibilityLiveRegion polite + role status) carries the count lines of
Students, Database, Reports and the inbox, the attendance search ("n found", "No student found", "Showing the
first n") and the desk's waiting-list search ("n found"). One new key, `common.foundCount` (en, te, hi).

**Why.** Name search is the non-visual way to check in; a confirm nobody hears looks like a broken button.

**Consequences.** Phone check with TalkBack only (the web reads role="status" already).

## 315. Large text on the core screens; a splash while the web app loads — 13 Oct 2026

**Context.** Audit phase 4 P3-01..P3-04 and P4-02: at large text a row's button squeezed the name to a few
pixels; the "taking long" start screen could not scroll, so Try again fell off at 200 %; the home's large-text
grid capped its names at 1.2x; tab names were one line ("Atten…" from ~115 %, Telugu earlier, a 320 dp phone
even at 100 %). On the web the first visit showed a blank white page while ~0.8-1 MB of script loaded.

**Decision.** (JS) From ~130 % text a list row puts its button under the name; the slow start screen scrolls
and shows a smaller drum at large text; grid tiles let the name grow (up to three lines); tab names may take
two lines (`components/tab-label.tsx`) and the bar grows for the second line from 115 %. (Web upload only)
`app/public/index.html` holds a static saffron splash inside #root (name in en/te/hi, a CSS spinner that stands
still for reduced motion, no script: the site policy allows none inline); React draws the app over it.

**Why.** Many students use the phone's large text; slow data is common.

**Consequences.** Large-text checks are phone-only (the web reports text size 100 %). The splash reaches users
with the next web upload, not the OTA.

## 316. A coordinator's login can have its own student record; the Guru links it — 13 Oct 2026

**Status: built on branch `staff-own-record` (placeholder 0061); merged after the launch of 20 Oct 2026 as migration 0053 (22 Oct 2026).**

**Context.** Praveen (13 Oct 2026): "Coordinators are students too, with more experience — that's it." Until now one login
had one role, and every link path needs a login that waits for a record (`pending`; #13, #96, #265), so a coordinator's or
the Guru's login could never be on a student record: no My QR, My progress, My attendance, practice or face scan in their
own app. For the launch each coordinator gets a student record at the desk **without a login**; colleagues check them in by
name or the printed card.

**Decision.** `link_staff_record(profile, student)` (security definer): the Guru links an active coordinator's (or Guru's)
login to ONE student record without a login, as their **own record**; the role stays. Never a withdrawn record
(`student_withdrawn`, #281), never a second one (`staff_has_record`). The Guru does it on Coordinators (G2), on the
person's page, section "Own student record"; the launch-time records made without a login are linked that way. **The Guru's
own record** is linked by Praveen in the SQL editor with the same function (`own_record` from the app): one person does
not give themselves a second kind of access. Unlinking is the student's `unlink_student_login` (G2 or the student
profile); it resets only a `student` role, so the staff login keeps its role and only loses Me.

**Not Accept, not the email link.** Neither the automatic email paths (a confirmed email, an email saved on a record) nor
Accept link a staff login. Desk records of coordinators often carry their email (the smoke test has one since 0002), and a
silent link would change what a staff login does without anyone deciding it; an existing coordinator never has a waiting
sign-up, so Accept has nothing to accept. The Guru checks the person and links on purpose (#13's reasoning).

**Consequences.** 0046-0048's link rules are untouched (`login_awaits_record`, minors never auto-linked, guardian email
rules). A student who becomes a coordinator: the Guru takes the login off the record (it waits), makes it a coordinator,
then links the record as their own (OPERATIONS.md). Tests: "0053 staff own record" in smoke-test.mjs.

## 317. The own record works like a student's for what the person does themselves — 13 Oct 2026

**Decision.** `my_student_id()` (0016) returns the caller's own record for coordinators and the Guru too (before: students
only). Practice (`log_practice`, `delete_practice`), the student's assessment functions, `event_counts` (my part, I
attended) and Phase 3's face enrolment (p3-server's functions use `my_student_id`) act on it with no change of their own.
`student_home()` already reads the caller's own record for any role. Row-level security gave staff every row before.

**Consequences.** **Face scan (P3):** once linked, a coordinator enrols like any student (start, a colleague approves:
p3-server's `approve_face_enrolment` already refuses one's own record, today with `not_allowed`; at merge it may answer
`own_record`). p3-native's Face scan screen opens from the student's My profile: for a staff member it needs a Me entry
(the p3 branches add it on their rebase). The future face self check-in RPC is a student's own proof, not a staff mark:
it must set `app.self_check_in` and `refuse_own_record` must let that through (one line) when it is built.

## 318. Nobody records about their own record — 13 Oct 2026

**Decision.** For a signed-in staff caller, the database refuses with `own_record` anything recorded about the caller's
own record, whatever the path: a check-in or check-out (the desk's name check-in, Mark attendance, a QR scan of one's own
code, `toggle_visit`, a visit time edit), a syllabus tick, remark or untick, a level change (`level_history`; the Guru's
"Set level" and "promote" alike), a promotion nomination, answer, withdrawal or decision, an assessment review, a call log.
One trigger function, `refuse_own_record`, on each table, so a new function writing these tables is covered too. An
event's attendance list leaves the caller's own row as it is, without an error (a list is saved at once). "Check out
everyone" closes the caller's own visit too: it is the end of the day, not a mark. The door tablet (its own kiosk login)
checks a coordinator in like any student. Students and the dashboard are not affected (students are refused by
row-level security first, as before).

**App.** One message for every screen (`fallbackErrorKey`): "This is your own student record: a colleague records it…".
On their own Student profile a staff member sees a note instead of Log a call, Check in / out and Tick the syllabus;
the Guru sees no Set level on their own record.

**Why.** Attendance, ticks and the level are the class's record of a student's learning, given by someone else. Praveen's
launch rule is the same: "check in each other, not yourself".

## 319. Me in the staff app; nobody is their own mentor — 13 Oct 2026

**Decision.** When the login has an own record, the staff home (Guru and coordinator) shows a **Me** circle first on the
ring (nine circles, drawn smaller, as module-ring.tsx allows). Me opens a ring of four: **My QR**, **My progress**, **My
attendance**, **Practice**, the student's own screens opened under `/staff/me` (no copies: the routes re-export
student/…; `lib/own-area.ts` sends their Back-home and practice-log links to Me). The home asks the server each time it
comes into view (the Guru may link while the app runs) and saves the My QR card on the phone; without internet the card
saved on the phone keeps Me and My QR at the door. Hidden without an own record. Assessments, events and announcements
stay in the staff screens (see #321).

**Mentors.** Nobody is their own mentor (`own_mentor`, whoever sets it, also through the Guru's mentor move) and nobody
changes their own record's mentor or level (`own_record`). The mentor rule (`assign_mentor`, #165: the referral first,
else the same-gender coordinator of the centre with the fewest students) never picks the record's own login; the link
takes off a mentor that is the login itself (the desk's rule could pick the coordinator while the record had no login)
and gives another; nobody of that gender = the Guru's "Mentor needed" notice. The Guru's mentor picker leaves out the
record's own login.

## 320. A record with a staff login is not withdrawn or erased while linked — 13 Oct 2026

**Decision.** `withdraw_consent` switches the record's login off and `erase_student` deletes it: for a coordinator's own
record that would switch off or delete their staff access. Both (and a delete in the dashboard) are refused with
`staff_login_linked` while a staff login is on the record; the Guru unlinks first, then withdraws or erases (the record
alone). When a coordinator leaves, `anonymise_staff` (0040) deletes the staff login and the record stays without one.

## 321. Coordinator-students count as students everywhere — 13 Oct 2026

**Decision.** An own record is a student record like any other, so it counts wherever students count, with no special case:
Overview and the dashboards (in class, came this week, by level and status, new joiners), reports, the class list, Here now,
follow-up calls (an irregular coordinator-student gets a call task for their mentor, another coordinator), promotion
("ready" lists), events' and assessments' audiences by level. Praveen's rule ("coordinators are students too … that's it")
and one number for "how many learn at level 2" both say so; leaving them out would need a flag on every count.

**Consequences (after launch, not built).** An assessment given to a coordinator-student's level makes an assignment they
cannot open yet (no Me > Assessments; its push opens a /student address, which the staff app does not have). Announcements
and polls "to students" reach student logins only (`audience_profiles`); a coordinator sees them as staff anyway. Asks for
Praveen (after 21 Oct): the Guru's own record (default: allowed, linked in the SQL editor, nobody self-marks); Me >
Assessments; whether follow-up calls should skip coordinators.

## 322. A create is saved once, however often Save is tapped after a lost answer — 13 Oct 2026

**Context.** Audit phase 1 P1-02 / P1-03 (F5-01, F4-01, F4-02, F3-02, F5-02). On a weak network the server can
store a row while its answer is lost; the screen said "try again", and the second Save made a second fund entry,
call note, practice entry, event or poll (which told everyone twice), assessment, material, syllabus item,
theme or reply. Some of those saves also deleted the files they had just uploaded, although the saved row listed
them. Only register_student (#126) and announcements (D6-10) were safe.

**Decision (migration 0054 + JS).** Each open form holds one request id (a uuid, `lib/use-request-id.ts`) and
sends it with every Save. Ten tables get a unique `request_id` (fund_entries, call_logs, practice_logs, events,
polls, assessments, materials, syllabus_items, ig_themes, announcement_replies). Direct inserts send it as a
column; a repeat is refused by the unique index and the app reads the first row back (`data/create-once.ts`
insertOnce). The three functions get a twin with `p_request_id` first (record_fund_entry, log_call,
log_practice) that returns the row saved earlier by the same person; the twin passes the id to the row through
a transaction setting (`app.request_id`, trigger `stamp_request_id`), so the original functions stay unchanged
and older apps keep calling them. Files: a repeated Save reuses the upload of the first try (`uploadOnce`); with
no answer the files are kept (the row may list them; unused files are cleaned up as in OPERATIONS.md); only a
refusal removes them. The same for a sloka's recording and an assessment edit.

**Why.** Money, a child's call record and a push to the whole class must not happen twice because the hall's
signal dropped.

**Consequences.** "Try again" after a network error is now safe on these forms. Two keepers cannot share an id
(the twin looks only at the caller's rows). Updates are not covered (they are idempotent already).

## 323. Shared form parts: kinds, native digits, the hint kept, linked error summary, a self-guarding button — 13 Oct 2026

**Context.** Audit phase 1 B4: P1-09 (Telugu/Hindi digits refused or deleted in number boxes), P1-11 (server
messages at the top of long forms; the summary listed nothing), F5-08 (autocorrect on names), F5-10..F5-16,
F1-11, F4-13, F4-15.

**Decision (JS).** TextField: a `kind` preset (name, email, url, phone, number, decimal, date, time, code) sets
keyboard, autocorrect, capitals and length (the caller's props win); in number-like boxes Telugu and Devanagari
digits become 0-9 as they are typed; the hint stays and the error shows under it, both read out; a 2 px primary
border while focused and a muted look when read-only; a "n of max" counter from 200 characters (`counter` gives
the real limit when maxLength leaves room for a "too long" message); a multiline box starts about four lines
tall. FormErrorSummary: given the form's fields it lists each problem as a link that scrolls to and focuses the
field, and carries the server's refusal beside the button (fund entry first; materials, inventory item, syllabus
item and Join Ishtagoshti moved their message beside the button). Button: an onPress that returns a promise keeps
the button busy until it settles. The fund form checks the 366-day limit itself and shows a server refusal at
its field (F3-08).

**Why.** One change in four shared parts lifts every form (GOV.UK error summary and error message, WCAG 3.3.1,
2.4.7; Apple HIG keyboards).

**Consequences.** Other forms keep the count-only summary until they pass their fields. Native digits are read
only where the box is number-like.

## 324. Phone numbers are kept in one format, E.164 — 13 Oct 2026

**Context.** Audit phase 1 P1-07 (F2-06, F1-05, F5-04): the same number was stored as 9876543210, 09876543210,
+919876543210 and 98765 43210; #164 had left the desk's own field national. Duplicate checks, search, dialling
and exports disagreed.

**Decision (migration 0054 + JS).** Retires #164's exception. `phone_e164()` reads a number with +, with 00, or a
national Indian number (10 digits, 11 with a leading 0, 12 starting 91); a trigger keeps students, guardians,
profiles and Ishtagoshti subscribers as E.164 on every changed phone and refuses what is not a number
(`phone_invalid`); an unchanged old value is left alone, so editing other fields never fails on it. The run
rewrites the stored numbers it can read, once. The desk, My profile and Join Ishtagoshti send E.164 (the class's
country for a national number); the import goes through the same function.

**Why.** One person, one number: duplicates are found and the call screen dials the right one.

**Consequences.** India is assumed for a national number without a code in SQL (the app sends E.164). Numbers
the run cannot read stay as they are: OPERATIONS.md "Phones that are not E.164" lists them.

## 325. Fund and inventory past 1,000 rows; CSV, stocktake, suggestions, audit log, reports — 13 Oct 2026

**Context.** Audit phase 1 B6: P1-19 (one unpaged read: past 1,000 fund entries the balance stopped at the
1,000th), P1-21 (inventory lost its label code), P1-22 (Take back deleted an approved material's file),
P1-23 (stocktake Finish / Delete on one tap), F3-09, F3-10, F3-11, F3-13, F3-17; phase 2 R3-08.

**Decision.** (JS) `lib/paged-read.ts` reads every row 1,000 at a time in a total order: fund entries,
inventory items and open loans, a count's ticks, the import's existing students, the audit log's names. The
inventory list shows and searches `code · name` again. Finish and Delete of a count each ask first (Delete in
its own section). Take back deletes the suggestion row first and its file only then. CSV exports write
YYYY-MM-DD dates; the fund CSV adds a signed "Effect on balance" column; the formula guard also covers a
leading tab, CR and the full-width = + - @. The audit log can filter and name fund entries and categories,
instruments, counts, events and polls, with paise as rupees. Reports check a custom range at its fields (both
dates, from before to, at most a year) and show only the newest load. A Settings refusal says to reload and
check, not "{{min}} to {{max}}". (Migration 0054) an approved material's file can be deleted by the Guru only.

**Why.** A treasurer must never read a wrong balance; staff search the code printed on the label.

**Consequences.** No list in these screens is capped any more; 50,000 rows is the safety stop.

## 326. The Guru deletes a record entered by mistake, and can undo an Excel import — 13 Oct 2026

**Context.** Audit phase 2 R3-04 (#302 left it): a duplicate from the desk or a mis-mapped import could only be
removed by Praveen in the SQL editor, as an "erasure".

**Decision (migration 0054 + JS).** `delete_student_record(id, reason)`, the Guru only: deletes a record that
nothing hangs on, with what was made with it (guardians, consents, About-you details, tasks, status and level
history), and writes the reason on its audit-log row (the row keeps the record's copy). It refuses a record
with a login (`student_linked`: take the login off first), a withdrawn one (`student_withdrawn`: erasure is
the way), one with visits (`student_visited`) or anything recorded about the student (`student_has_history`:
a call, a tick, practice, a loan, an assessment submission, an event, a nomination). On the student profile:
"Delete this record (entered by mistake)", with a reason and the name typed again, only for a record without a
login. Imports: each chosen file gets an id sent with every row (`students.import_id`, set only by the Guru's
import, frozen after); `undo_import(id)` deletes the import's records that nothing hangs on and lists the
others with why. The import screen offers Undo after an import and for the last 30 days' imports; rows a
dropped connection did not send are counted ("Not sent: n", Import the rest) instead of a green "finished"
(R3-07, R2-13).

**Why.** Week 1 brings duplicates and a first import; the Guru must fix them from the phone without an erasure
record.

**Consequences.** Two records of one student that both have history are merged by the app team (SQL), as
before. Roll numbers of deleted records are never given again.

## 327. Back asks before typed work is lost; a failed refresh keeps the data; screens reload after a while — 13 Oct 2026

**Context.** Audit phase 1 P1-10 (Back threw away a half-filled form, F5-05, F4-03) and phase 2 F9: R1-04 /
R2-10 (a failed reload after an action replaced the page with "Could not load"), R4-04 (a tab left open
overnight showed yesterday), R3-09 (load failures with no Try again).

**Decision (JS).** `useLeaveGuard(dirty)` (lib/use-leave-guard.ts, React Navigation's usePreventRemove from
`expo-router/react-navigation`; SDK 58 brings its own) asks "Discard what you typed?" on Back, the swipe and
the header arrow while a form holds unsaved changes (register, new announcement, event, poll, assessment, call
note, fund entry, material); on the web also before a reload or closing the tab. A form calls allowLeave()
before it leaves after a save. `useKeptLoad` keeps the last data when a reload fails and shows "Could not
refresh. Showing what was loaded at HH:MM" with Try again, on twelve screens; the first load still shows its
error. `useReloadOnResume` loads again when the app returns after 5 minutes or more (homes, Attendance, Here now,
Follow-up, the inbox). Fund entry, inventory item and a count offer Try again when they could not load.

**Why.** Two minutes of a child's registration must not vanish on a slip; a sent reply must not look lost.

**Consequences.** On the web the browser's own Back keeps the form and asks, but the address bar already shows
the previous page (a react-navigation web limit). The form drafts of #218 still cover a forced sign-out.

## 328. Event attendance per student; a withdrawn record says so — 13 Oct 2026

**Context.** Audit phase 2 F11 (R2-07: two phones marking one event replaced each other's whole list) and F12
(R3-06: a withdrawn record looked normal; staff learned it only from a refused action).

**Decision.** (Migration 0054) `change_event_attendance(event, came, not_came)` changes only the students given,
with mark_event_attendance's rules; (JS) the attendance screen sends what this phone changed since it loaded,
then loads again with the other phones' ticks. (JS) The student profile shows "Consent withdrawn on <date>"
and what that means. A Guru "Record withdrawal" form stays a team decision (withdraw_consent in SQL, OPERATIONS).

**Why.** Several coordinators mark a festival's attendance at once; a frozen record must be recognisable.

**Consequences.** mark_event_attendance stays for older apps. The Students list has no withdrawn chip yet (it
needs the overview view to carry the date).

## 329. The parent's code email is capped per address; small sign-in and message gaps closed — 13 Oct 2026

**Context.** Audit phase 1 B10 (P1-13: any address could get the code email three times a day per login, and a
few accounts could use up the app's 100 a day; the email carried the user's own text) and B8 (P1-14: no way to
get a new confirmation email after "confirm your email first"; F5-09: server codes shown as "Something went
wrong").

**Decision.** (Migration 0054) ig_send_parent_code refuses a fourth code a day to the same parent address, from
any child (`code_parent_limit`, worded in the app); the names in the email are cut to letters, marks, spaces,
' and - (no link, no lines of one's own). (JS) Sign-in shows "Send a new confirmation email" after "confirm your
email first"; `group_inactive` and `member_not_allowed` have their own words.

**Why.** The class's email sender must not be usable to send other people's text, and one parent's inbox must
not be flooded.

**Consequences.** The consent wording (#88) and a minimum age of the login stay team decisions.

## 330. Lists and homes load only what they show; long reads go page by page — 13 Oct 2026

**Context.** Audit phase 4 B4-5 (P5-03, P5-05, P5-06, P5-09, P5-10, D9-04, P1-19). The Ishtagoshti home and
sloka lists downloaded every sloka's purports in three languages (up to 20,000 characters each) on every
visit; the student home made ~10 requests, four of them for things it never shows; the Students and Calls
tabs downloaded the whole class again on every return; Supabase sends at most 1,000 rows per request, so a
class past 1,000 students (and the fund ledger past 1,000 entries) silently lost its last rows; an event's
"everyone" list drew every student; a scan right after "Scan the next student" started a second location
reading with its own 8 s wait.

**Decision (JS).** Sloka lists read a list column set (no purports, no word meanings); the I1 home reads only
counts and the sloka of the day's id, and draws Themes and All slokas at once. The student home reads ids and
the student's own reads for the News badge, not posts, group or staff names, and no week setting. The class
(`student_overview`) is kept for 60 s for the signed-in person and shared by the Students and Calls tabs; any
call that may save (every non-read call except a list of read-only database functions, `lib/data-version.ts`)
drops it, and pull to refresh / Try again always load. Whole-table reads go through `lib/read-all.ts`
(1,000-row pages, ordered on id): Students, Calls, group members, Print QR cards, the Guru's database, the
fund ledger, the import's duplicate check. Event performers and attendance draw 50 rows at a time. A scan
joins the location reading already under way and waits only its remaining time.

**Why.** Slow data in the hall and low-end phones; the 1,000-row cap was a silent data loss waiting for growth.

**Consequences.** A change made by another phone shows on Students / Calls within a minute, or at once on
pull to refresh. A new database function that only reads should be added to the list in data-version.ts,
or it costs a reload (never a stale screen). Not done here: announcement photo thumbnails (P5-11, with the
photo descriptions of P2-10 they need the attachment rules of 0010 changed: a migration round), the promotion
count on every staff home (P5-07, needs a migration), the staff Announcements seen-count second step (the
seen-count view cannot be ordered like the list), D9-05 / D9-09.

## 331. Telugu and Hindi load when chosen; fewer calls at start — 13 Oct 2026

**Context.** Audit phase 4 B4-6 (P4-03, P4-04, P4-05, P4-06, D9-11). Every start evaluated all three
languages (6,000 Telugu and Hindi strings) and the web's one script carried them for every visitor; eight
screens reloaded when the fetched profile replaced the remembered one (the sloka editor reloaded the sloka
over unsaved edits when the app came back to the front); push registration called Expo and the database on
every cold start; the loading shapes faded on the JavaScript thread.

**Decision (JS + web upload).** English stays in the app (the fallback). Telugu and Hindi load only when they
are the start language or chosen: on the phone through a `require` inside a function (`i18n/locale-loaders.ts`,
evaluated on the first call); on the web as their own files (`locale-loaders.web.ts`, `import()`), with the
app's splash kept over the app until the start language is in. The loaders return English's shape, so tsc
still fails on a missing key. Loads depend on the profile id, not the object. A push registration counts for a
week for the same login and token (`lib/push-registered.ts`, forgotten at sign-out). The fade runs on the native
driver on phones. Hashed web assets (`/assets/*`) are cached for a year like `/_expo/static/*`.

**Why.** Start-up and first web visit on slow data and small phones.

**Consequences.** Web build of TEST, measured 13 Oct 2026 (main script): before (e46ed0c) 4,458 KB raw,
1,106 KB gzip, 826 KB brotli; after 3,403 KB, 979 KB, 741 KB; Telugu and Hindi are separate files of ~51 KB
brotli each, fetched only by their readers. Expo Router's `asyncRoutes` (the rest of D9-11) is an app.json
option, which changes the fingerprint: next APK, not here.

## 332. Screen readers: focus follows the question, one stop per row, the web in the app's language — 13 Oct 2026

**Context.** Audit phase 4 B4-7 (P2-02, -04, -05, -06, -07, -08, -09, -12; F5-13; F1-11). Nothing moved
TalkBack's focus when the pressed button disappeared; the tempo buttons said "plus 5"; the My QR code, beat
marks and progress bars carried labels TalkBack never read; a double tap could delete through a same-place
"Yes, delete"; the web back button was English; the bell and profile buttons were 40 dp; plain list rows were
3-5 stops each; "Remove animations" was ignored; required fields were not exposed.

**Decision (JS).** `lib/a11y-focus.ts` moves focus (phone: an accessibility focus event; web: the element,
tabindex -1) and `Notice focused` reads a confirm as one stop: desk Accept, its result, Delete announcement,
Check out everyone, Replace QR card; the camera frame when it opens; a date, choice or tick with a form error.
Tempo buttons say "Faster by 5" and the tempo is a live region. The three views are `accessible`. A
same-place confirm ignores taps for 600 ms (`lib/second-tap.ts`). The web header's back button is our own,
named `common.back`. Bell and profile 48 dp, one-digit chips 48 wide, table rows 48. A plain row's words are
one stop (phones). `lib/reduced-motion.ts` stops the loading fade, the drop-down fade and the smooth scroll.
TextField `required` (web aria-required, ", required" on the phone), used on Register a student's name.

**Why.** Blind and low-vision members and staff; the confirm questions of #314 needed the focus too.

**Consequences.** F1-11 (a repeated identical error) is covered where a form uses useFormFocus: focus moves to
the field and its error is read as its hint. Marking optional fields on screen stays a team decision (F5-13);
other forms can pass `required`. Photo descriptions (P2-10) wait for the team and a migration. TalkBack
behaviour is a phone check.

## 333. Large text and colour polish within the palette — 13 Oct 2026

**Context.** Audit phase 4 B4-8 (P3-05, -07, -08, -12, -13; lead L2). At 200 %: drop-down rows overlapped,
the home header cut the name and the bell count spilled, header titles ended in "…", the weekly practice
bars had no room, chip labels ran past the pill; the sidebar's open tab label was 4.3:1.

**Decision (JS, no new colours).** Drop-down rows grow to two lines of the scaled text; the box shows the
whole value. At large text the home header puts the greeting and name on their own line; the bell count is
capped at 130 % (its label says the number) and the name's line height is 1.45 for Telugu and Devanagari.
Header titles are drawn whole (`components/header-title.tsx`, stacks and tabs): on the phone a long title shrinks to fit the bar's fixed height (down to 60 %), on the web it may take two lines. Weekly practice puts the
bar under week and time at large text. Chip labels shrink and wrap. The sidebar's open tab uses
onPrimarySoft (6.7:1).

**Why.** Many members use the phone's large text.

**Consequences.** Left to the design branch (new tokens, tab pill): P3-06 open tab by colour only, P3-09
green for problem states, P3-11 the ring motto size and the ring centre's line height. Phone checks at
200 %.

## 334. Telugu and Hindi fixes that need no native judgement; server refusals worded — 13 Oct 2026

**Context.** Audit phase 4 B4-9 (P1-02, P1-04, D8-21; P1-01, P1-05, P1-06 noted). Five te/hi sentences named
the "My QR" tab in English; a chosen date of birth and the web month list stayed in the old language after a
switch (the React Compiler kept the first answer); 50 database refusal codes showed "Something went wrong".

**Decision (JS).** The five sentences name the tab as it is called (“నా QR” / “मेरा QR”). The birth-date
field passes the language into its date and month helpers. 32 codes the screens can meet (a frozen record,
a locked detail, a record gone, an open loan, roll number, call log first, group off, Guru or staff only,
centre in use, fund entries kept, saved already, a visit in the future, empty setting, too many rows) map to
19 messages under `common.serverErrors` (te/hi drafts); the rest are refusals of input the screens never send.

**Why.** Words the audit was certain of; the consent word is not (P1-01).

**Consequences.** P1-01 (అనుమతి vs సమ్మతి on the minor-consent lines) is NOT changed: it is first on the review
sheet (#335). P1-05 (the web lesson video frame's English title) is done at the rebase on the launch code,
which rewrites that file (launch-cleanup S5-01). The 18 unused keys (P1-06) stay in the files and are marked
"skip" on the sheet, to keep this branch's language-file changes small.

## 335. A review sheet for the native Telugu and Hindi review — 13 Oct 2026

**Context.** All Telugu and Hindi texts are drafts (D8-10); the reviewers need every text with its English,
where it shows and what to look at first.

**Decision.** `app/scripts/translation-review.mjs` builds `docs/translation-review/te-hi-review.xlsx` from the
language files and docs/TRANSLATIONS.md: "Read me"; "Check first" (P1-01 consent lines, P1-02 changed lines,
the new texts of #332-#334, plural pairs still identical, Hindi gendered forms); "Terms" (one thing named two
ways, with counts and the texts using the less used word; the consent row carries the audit's suggestion);
"All texts" (key, English, Telugu, Hindi, what to check, screens, columns for the reviewer's fixes).
Screens are named as people call them where known, else from the file.

**Why.** One file a reviewer can work through on a laptop; rebuilt after every text change.

**Consequences.** Run `node scripts/translation-review.mjs` from app/ after changing texts and commit the new
sheet. The reviewers' fixes come back as a sheet; a worker copies them into the language files.

## 336. Design tokens from one file; option A palette by default, switchable — 13 Oct 2026

**Status: built on branch `after-launch-design` (merge after launch); the palette is a team decision (audit phase
5 question 1), answered after 21 Oct 2026.**

**Context.** Audit phase 5 (U3-01): the app and the website looked like two products — saffron band and
#B45309 in the app, night indigo, marigold and #9A4307 on the website (#128) — and the app's colours lived in
hand-written tables with "checked on <date>" comments.

**Decision.** `design/tokens.json` holds every colour (primitives, then semantic names per scheme), the spaces,
radii, the heading font and the contrast pairs to check. `node design/build-tokens.mjs` writes
`app/src/theme/tokens.generated.ts` (read by `theme/colors.ts`; `useTheme()` and `Palette` keep their names, with
new ones: surfaceRaised/Sunken, primaryPressed, link, accent, focus, warning*, info*, disabled*, tab*, overlay)
and `website/src/tokens.css` (the site's own variable names, same values as before; `build.mjs` puts it before
`styles.css`). Two switches stay one line away: `choices.header` indigo (option A, the website's night band) or
saffron (as before), and `choices.primary` deep (#9A4307, the website's accent) or bright (#B45309, as before).
Default: option A (indigo + deep). `app/tests/design-tokens.test.mjs` fails when a generated file is stale or any
declared pair is below 4.5:1 (text) or 3:1 (controls, icons), in light and dark, for all four combinations
(560 pairs on 13 Oct, lowest 4.52). The native splash, icon and the web splash stay #B45309 until the next APK
(audit step 4, prepared only). Note to #36: most members now use Android (Praveen, 13 Oct 2026).

**Why.** One source keeps app and website alike; the check replaces the dated comments.

**Consequences.** A colour is added in tokens.json only, then the build is run. Phone check in sunlight.

## 337. English headings in Cormorant Garamond, loaded at run time — 13 Oct 2026

**Status: branch `after-launch-design`.**

**Decision.** `app/assets/fonts/CormorantGaramond-SemiBold.ttf` (the website's heading font, OFL, Latin + Latin
Extended subset with the IAST letters and ₹, 164 KB; licence beside it) is loaded with expo-font `useFonts` in
the root layout (`theme/fonts.tsx`), never holding the splash; it travels in the update, no APK. AppText's
title and subtitle use it in English only (28/36 and 22/30, no fontWeight with the custom family); Telugu and
Hindi keep the phone's bold sans. `family="sans"` keeps person names, titles staff typed, bols and numbers in
sans. Header bars stay sans. The italic was left out (not needed for headings).

**Consequences.** A heading shows in sans for a moment on the very first start after the update.

## 338. "Needs attention" amber, and the open tab told by shape — 13 Oct 2026

**Status: branch `after-launch-design`.**

**Context.** Audit P3-09: ListRow had one green highlight, used for "confirmed" and for overdue or waiting
things alike. P3-06/P3-07: the open tab differed from the others by colour only (1.02:1 in dark mode).

**Decision.** ListRow `highlight="attention"`: amber surface, amber left bar and an alert sign; `"confirmed"`
(= `highlighted`): green with a tick. Amber now on fund entries waiting, overdue loans, damaged items, an open
stocktake, promotions waiting for me, a poll still to vote. Notice gains tone `warning`. The open tab shows the
filled icon in a pale pill and a bold label (`tabIcon`, `tabLabel`); colours `tabActive` / `tabInactive`.

**Why.** Traffic-light meaning; WCAG 1.4.1 (not colour alone).

## 339. "Today" line and "Scan at the door" on the staff homes — 13 Oct 2026

**Status: branch `after-launch-design`; adds to #240 (circles unchanged).**

**Decision.** Between the header and the circles of the coordinator and Guru homes (`components/staff-today.tsx`):
tappable numbers — here now, visits today, and for the Guru came this week ("–" while loading) — and one large
"Scan at the door" button that opens the Mark attendance tab (navigate, not a second copy, R4-01) with
`?scan=<new value>`, which opens the camera once per press.

**Why.** The desk's first question and most frequent action, in one look and one tap (audit U1-01).

## 340. "Waiting for you" from one request: staff_dashboard() — 13 Oct 2026

**Status: branch `after-launch-design`; migration 0050_staff_dashboard.sql (placeholder 0063 until the launch UI renumbered it, 14-10-2026).**

**Decision.** `staff_dashboard()` (read-only, security invoker, staff only) returns the Today numbers and what
waits for the caller: sign-ups waiting at the desk (= Register a student's list), calls due (coordinator: C1's
my_calls_due; Guru: the Follow-ups circle's count), promotions (feedback asked / to decide), recordings to review,
fund entries to approve (never one's own; the Guru, or a treasurer for the Guru's), material suggestions (Guru).
Each count uses the rule of the screen it opens. Both homes now make this ONE request instead of two or three; the
circles' counts come from it too. Under the Today line, "Waiting for you": one amber row per non-zero count, most
urgent first, or "Nothing is waiting. Thank you for your seva." If 0050 has not run (PGRST202) the app falls back
to the old functions, so an update can reach phones before the migration.

**Consequences.** A "Me" entry for staff (#316-#321, staff-own-record) sits with the circles, not in this block.

## 341. "Check {name} in now" after Accept or Save — 13 Oct 2026

**Status: branch `after-launch-design`.**

**Decision.** The card after the desk accepts a sign-up or saves a new student starts with "Check {name} in now"
(mark_visit, idempotent #18, with the phone's position #70; the same result card as Mark attendance). Register
another is secondary; Open the student's page and Done are links.

**Why.** The new student is at the desk; a first visit is otherwise easily never recorded (audit U2-01).

## 342. My QR at the door, and a welcome when an account becomes a student — 13 Oct 2026

**Status: branch `after-launch-design`.**

**Decision.** My QR keeps the screen awake while it is in view (expo-keep-awake, already in the APK; on focus,
not mount) and shows above the card "Not checked in yet today" / "Checked in at 16:05" (green) / "Checked out.
Today's visit began at 16:05.", from student_home() every 5 s for up to 10 minutes while in view, read out by
TalkBack. Name 22 px, roll number 18 px. Brightness: next APK (expo-brightness). A student who joined in the last
30 days sees, once per login on the phone, a welcome card in place of the circles (name, roll number, what the QR
card is for, level; Show my QR card / Go to my home); About you does not push itself over it in that run.

**Why.** The student sees that the scan worked; the first open confirms the account is ready (audit U2-02, U2-04).

## 343. One-tap dates and times on forms — 13 Oct 2026

**Status: branch `after-launch-design`.**

**Decision.** Quick buttons above the typed date and time fill them (still editable): an announcement sent later
— Tonight 19:00 (before 19:00 only), Tomorrow 07:00, Sunday 07:00; a poll's closing — in 1, 3, 7 days at 21:00;
an event's day — This Sunday, Next Sunday (`lib/quick-times.ts`). "Next class day" needs the centre's days and is
left for later.

**Why.** Typing 18-10-2026 on a phone keyboard is the slowest, most error-prone entry (audit U4-05).

## 350. Staff side menu; eight circles per home — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** The staff homes show the five bottom tabs, a ring of eight filled circles and nothing else to tap
below it; every other staff screen is in a side menu opened from a menu button at the left of the home band and of
each tab's header bar (components/side-menu.tsx). Plain React Native (Modal + Animated), no drawer package, so it
reaches installed phones as an update. Groups: Class, Teaching, Seva, Reports, Set-up (Guru), You; the maha-mantra
at its foot. It closes on the close button, a tap beside it, Android Back and Escape; focus moves into it and back
to the button; rows are 52 px and wrap at large text. No circle or button repeats a bottom tab (Praveen 14-10-2026:
Check-in and Follow-ups were there twice): the home has no Scan button (the Check-in tab starts with Scan to check
in) and the Guru has no Follow-ups circle (Follow-ups by coordinator is in the menu's Class group; the To do box
counts the calls). Guru ring: Overview, Level-ups, Newcomers, Assessments, Welcome desk, Lessons, Events & polls,
Ishtagoshti. Coordinator ring: Welcome desk, Newcomers,
Instruments, Seva roster, Events & polls, Assessments, Lessons, Ishtagoshti. Running the class stays at its
address (links) but is no longer offered: its screens are the menu's Reports and Set-up groups. One file
(components/staff-shortcuts.tsx) holds the ring and the menu, so a screen is never offered twice or forgotten
(tests/launch-ui.test.mjs). Amends #240, #241.

**Why.** Praveen 14-10-2026: the Guru home had 16 circles plus 8 behind Running the class; keep what is used in a
class week on the home, the rest in a menu, the most important in the footer.

## 351. The staff and student homes do not scroll — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** Team decision (Praveen 14-10-2026): a home fits one phone screen. Waiting for you's rows moved to
their own screen (staff/waiting.tsx, titled "To do"); the home shows three Today boxes (in class now; check-ins
today, or this week for the Guru; the "to do" total, amber when above 0). The middle box is a number only, not a
button: its screen is already the Overview circle or the Check-in tab. Under the staff rings, as on the student home, the fact of the day ("Did you know?", #242). Homes use `Screen
compact` (8 px above and below, 8 px between blocks); under an 800 px window the student home's fact card is shorter; a ring under 340 px
uses 56 px circles and a 128 px drum circle. Checked with no scroll at 375 x 812 and 360 x 760; at the phone's large
text sizes the grid and scrolling stay (nothing is cut).

**Why.** Members missed what was below the first screen; counts on circles and one total say "something waits".

## 352. Header band: night to royal blue with gold — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** The band runs from deep night (indigo.950) at the top to royal blue (new indigo.650 #22307A, the
header bars' colour) below, with a golden halo (headerGold = gold.300) behind the app's name in gold Cormorant and
its motto, a thin gold rule, then "Hare Krishna, name" on one line; a faint violet glow (headerGlow) and a wave
where it meets the page, as on the website's night band. The role line and the maha-mantra left the band (role:
side menu and screen readers; mantra: side menu foot; amends #36). Home circles are filled with the module's deep
colour and a light icon, with a light edge and a soft shadow; the ring's centre is white with a gold ring
(reference: the team's "version 3" mockup, kept outside the repository because it shows the ISKCON logo).

**Why.** Praveen: the app goes to ISKCON temples for approval and should feel calm and devotional at an
international standard.

## 353. International names and clearer icons — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** Renamed for people anywhere (en; te/hi drafts, Praveen checks te): Here now → In class now; Mark
attendance / Attendance tab → Check-in; Scan at the door → Scan to check in; visits today → check-ins today; came
this week → this week; Waiting for you → To do; Register a student → Welcome desk; New joiners → Newcomers; Follow-up
calls / Calls tab → Follow-ups; Log a call → Record a call; Syllabus and lessons → Lessons; Syllabus tick-off → Mark
progress; Material suggestions → Suggestions; Create assessment → New assessment; Give to students → Assign;
Review → Review recording; Promotions → Level-ups and nominate → recommend (the decision buttons keep "Promote to
level"); Performers → Who plays; Ishtagoshti subscribers → members; Taals → Rhythms (taals); Offline → Saved on this
phone; Instruments and assets → Instruments; Stocktake → Count instruments; Duty roster → Seva roster; Student
database → All students; Option lists → Form choices; Audit log → Change history; Running the class → Set-up; the
student ring's Announcements → News. Icons: In class now a group (not an arrow through a door), Overview a pie
chart (not a heartbeat), Level-ups a medal (not a rising arrow), Instruments the app's drum drawing. Unchanged on
purpose: Students, News, Groups, Class fund, Centres, Settings, My QR card, Ishtagoshti, sloka, seva. Database
names and addresses (routes) are unchanged.

**Why.** At the class on Sunday 11-10-2026 members misread names ("Here now" as a map's "you are here").

## 354. A screen wears its module's colour — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** The colour of a module's home circle carries into its screens: IconBadge without a tone takes the
module colour of the current route (lib/module-tone.ts by the first segment after the role; theme/module-tone.ts
reads it), so list icons, section icons and empty screens are tinted with it. Homes, the side menu and set-up
screens stay saffron.

**Why.** Like coloured signs in a temple: a person knows which part of the app they are in.

## 355. The website look in the shared parts — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** Changed once in the shared components so every screen follows: header bars in royal blue with the
title in Cormorant (English; sans for te/hi); cards 14 px corners with the website's two-layer shadow; Section cards
with a 3 px marigold top line; empty screens with a line-drawn lotus in the module's colour; pill-shaped buttons;
small text 14 px (was 13). Contrast pairs stay checked by design/tokens.json (new: headerGold on header and
headerDeep).

**Why.** Praveen: the website's colours and fonts read better than the app's.

## 356. What the side menu does not do — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** The menu opens only screens that stack on top of the tabs (router.push), never a tab screen, so Back
keeps returning to where the person came from (#301, R4-01). It is for staff only; students keep their eight
circles and four tabs. On a wide screen (900 px and up) the tabs are a sidebar as before (#36) and the menu button
stays in the header bars.

**Why.** A second copy of a tab under the stack was the cause of the Back problems fixed in #301.

## 357. Icon and splash wait for the next APK — 14 Oct 2026

**Status: branch `launch-ui`.**

**Decision.** The app icon, splash screen and notification icon keep today's saffron drum: they live in the
native build (app.json) and would change the fingerprint (59a0c569 after the rebase). The gold-on-royal look of
#352 is the brief for them at the next APK, with the ISKCON emblem only after the temple's written permission.

**Why.** The launch update must reach installed phones over the air.

## 358. Dark mode in midnight navy; light mode stays sandalwood cream — 14 Oct 2026

**Status: branch `launch-ui` (update after the launch-UI merge).**

**Decision.** Praveen chose L1 + D2 of the options shown on 14-10-2026. Dark mode's page, cards, lines and quiet boxes
use a new `night` family in design/tokens.json (page #0E1130, cards #181C45, raised #1F2350, sunken #0A0C24, lines
#2C3170, control edges #8287C4); the header band and bars stay as #352, so the page continues the band's night sky. Light
mode keeps the website's warm cream (#FBF5EC). Text, gold, marigold, the module circles and every contrast pair are
unchanged and still checked (576 pairs). The website keeps its own dark colours for now.

**Why.** The colours speak of Krishna: night blue for His śyāma complexion, gold for His pītāmbara, cream for the
sandalwood offered to Him; the old brown-black dark page fought the blue header.

## 359. Header bars and tab navigation by Material Design / iOS rules — 14 Oct 2026

**Status: branch `launch-ui` (update).**

**Decision.** Praveen: "as per international standards only". (1) In dark mode the header bars and the home band end in
the same royal blue as in light mode (indigo.650 #22307A, was indigo.800), a clear step above the midnight page
(#358), with the standard 1 px divider under the bars; no decorative line. (2) The bottom tabs (Home, Check-in,
Students, Follow-ups, News) are top-level destinations: no back arrow on them (Material Design 3 and Apple's guidelines;
the back arrow is for screens opened from another screen), the menu button (☰) stays in their header bars as in
Gmail or Google Photos, and the phone's Back from any tab returns to Home (`backBehavior="firstRoute"`, now explicit).

**Why.** In dark mode the bars merged into the page; members asked why a tab shows ☰ and not ←.

## 360. The side menu opens with the person's own card — 14 Oct 2026

**Status: branch `launch-ui` (update).**

**Decision.** The top of the side menu is the signed-in person's card, as in LinkedIn and most apps with a drawer: their
initials in an ivory circle, their name, "Signed in as Coordinator / Facilitator" and "View my profile ›", one button
that opens My profile (staff/profile). The app's name and motto left the menu's top (the home band shows them) and the
"My profile" line left the You group, so My profile is offered once. TalkBack still starts on this card when the menu
opens.

**Why.** Praveen 14-10-2026: the profile belongs at the top of the menu; the repeated app name said nothing new.

## 361. Light or dark screens: a choice on My profile — 14 Oct 2026

**Status: branch `launch-ui` (update).**

**Decision.** My profile has an Appearance section under Language: **Same as phone** (the default), **Light**, **Dark**.
The choice applies at once to every screen (theme/use-theme.ts reads it through theme/appearance.ts), is remembered on
this device only (lib/local-storage.ts key `appearance`; Same as phone removes it), and is not saved to the profile, so
two phones of one person can differ. On Android and iOS it is also handed to the phone (Appearance.setColorScheme), so
date pickers and alerts follow; the web follows the app's own colours. No new package.

**Why.** Praveen 14-10-2026 asked where to change light and dark in the app; following only the phone's setting left
no way to choose inside the app, as international apps allow.

## 362. Inner header bars in night and gold; a calmer dark mode — 14 Oct 2026

**Status: branch `launch-ui` (update).**

**Decision.** Praveen chose option 2 of three shown on the same page (royal now / night and gold / calm cream). The
header bars of every inner screen use new tokens `bar` and `barLine`: the website's night (indigo.800 #1B1E4B) in light
mode and royal blue (indigo.650) in dark mode, the title in gold (headerGold), light arrows, and a thin gold line under
the bar (rgba(224, 178, 92, 0.55)); the side menu's top uses the same bar. Amends #359 for light mode (bars were royal).
Dark mode, checked on his request: cards a quieter step above the page (night.880 #161A3D, raised #1D2148, lines
#272C5C, were #181C45 / #2C3170); the soft accent behind initials, the level chip and the open tab is bronze
(#4A3618, was the brown-black-era #3A2817); a module's icon circles are filled in dark mode (deep colour, light icon,
as on the Home ring) because the pale dark tints looked murky on night. 592 contrast pairs, 0 low.

**Why.** The flat royal bar read as a generic office app and fought the warm page; in dark mode the boxes looked like
blue panels and the brown accents like mud.

## 363. UI audit fixes before launch: one-line help, Check-in scan first, success moments, one rule for the home boxes — 14 Oct 2026

**Status: branch `launch-ui` (update).**

**Decision.** From the UI/UX audit of 14-10-2026 (overall 6.8/10; worktree shots-launch-ui/UI_AUDIT_14-10-2026.md),
Praveen chose fixes 1, 2, 4 and 7. (1) The help paragraph at the top of 29 screens and every section description show
their first sentence and an "ⓘ More" disclosure button for the rest (components/more-text.tsx ScreenIntro / MoreText,
lib/first-sentence.ts: English, Telugu and Hindi full stops, common abbreviations kept, a first sentence under 24
characters keeps the next); no new texts to translate. (2) Check-in opens with one large "Scan to check in" button, the
how-to and the location note as one line with More, the scan's answer right under the scanner, then the counts and
Find by name; the repeated "Scan to check in" heading is gone. (4) Success moments: a success notice's tick pops in
(spring; none with reduced motion) and the phone gives one short success buzz (expo-haptics, already in the APK); the
attendance card keeps its own scan buzz, and a tap on a name now buzzes like a scan; buttons sink a little (scale 0.97)
and home circles (0.94) when pressed. (7) The home boxes follow one rule: a box that opens a list shows a small ›, the
number-only box has none. JS only.

**Why.** The audit's weakest scores were inner-screen clarity (5.5) and delight (4); these are the low-risk fixes that
reach phones as an update before launch.

## 364. App icon and splash: the website's emblem on night — 15 Oct 2026

**Status: branch `launch-ui`; changes the fingerprint (needs the APK).**

**Decision.** Praveen said yes to audit fix 3 for the 15-10 preview APK (design decision 7: use the website emblem now).
The app icon, the Android adaptive icon (night background layer, emblem foreground, white monochrome layer for themed
icons and the notification icon), the splash image, the favicon and the web home-screen icons show the website's
header emblem (website/src/art.mjs emblem(): twelve gold petals round a night disc with a gold ring, a clay drum with
cream heads) on the website's night #1B1E4B with a soft lighter middle. Drawn by app/scripts/make-emblem-icons.mjs
(plain Node, no package; replaces make-placeholder-icons.mjs); the Android layers and the splash image keep the
drawing within 30 % of the size from the centre, inside the round-launcher and Android 12 splash safe circle (30.6 %).
app.json: adaptiveIcon.backgroundColor and the splash backgroundColor #1B1E4B; nothing else native. The JS splash
(`brand`, ivory `onBrand`) and the static web splash and manifest follow. Not changed: app.json web themeColor /
backgroundColor (still #B45309) and the notification accent colour, to keep this change to the icon and splash.
New fingerprint 23dc7e4a (was 59a0c569). The temple's own logo replaces the drawing when they give one.

**Why.** The first thing people see (icon, splash) was the old saffron placeholder, at odds with the night-and-gold
inside; the audit scored it as the biggest brand gap.

## 365. Light list rows: the name and one line — 15 Oct 2026

**Status: branch `launch-ui-2` (update).** UI audit 14-10-2026 fix 5 (Praveen: "do remaining too to build world class").

**Decision.** List rows carry the name and one line; the rest is on the screen the row opens. Students (C7): level, the
status only when it is not Active, and the last visit; roll number and mentor are on the profile (C8). Follow-ups (C10):
the status and the call (due date, try, for whom), or the last visit when no call is planned; roll number and last visit
are on the call screen (C11). Newcomers: "Joined … · visits: N"; level and roll number on C8. Staff announcements
(C15): one line — when (or "Scheduled for"), "Seen by N of M", replies; who it is for, who posted it, edits, files and
"Without the app" are on the announcement. Student announcements (S10): when · posted by; audience, edits and files on
the announcement. "New" was already never shown on your own post. ListRow itself is unchanged; the trimming is per
screen. The keys students.noMentor and announcements.noLoginCount are no longer used (left in the files, as P1-06).
JS only.

**Why.** The audit found 3-4 grey lines under every name (inner-screen density 5.5/10); world-class lists (Google
Classroom, Linear) show one line and let the detail screen carry the rest.

## 366. The Welcome desk in two steps: Who is joining, then More details — 15 Oct 2026

**Status: branch `launch-ui-2` (update).** UI audit 14-10-2026 fix 6.

**Decision.** Register a student (Welcome desk) is two steps. Step 1 "Who is joining": the waiting sign-ups and Accept
above, then full name, date of birth (age hint), phone, email, level; "Next: more details" checks those four fields
with the same rules as Save (checkStudentDetails) and goes to the first problem. Step 2 "More details": the name and
age at the top with "Back to the previous step", area, pincode, About-you (Dīkṣā name, instruments, gender), mentor,
the adult's privacy notice or the parent's consent for a minor, then "More about the student (optional)" folded
(components/fold.tsx: a disclosure button with aria-expanded; open by itself when a sign-up or a kept draft answered
it, or when Save finds a problem inside), and Save. Save is unchanged: every check, register_student with the form's
request id (#126 one record however often it is sent), the details after it; a problem in a step-1 field (e.g. the
parent's email typed as the student's) takes the desk back to step 1 and to the field. "Step 1 of 2" is a status line
read out when the step changes; the page returns to its top. Android's Back on step 2 goes to step 1 (only while the
desk is in front). New texts register.stepWho / stepMore / next in en/te/hi (te/hi drafts); register.studentSection
removed (unused); about.stepOf and about.previous reused. JS only.

**Why.** The audit scored forms 6/10: one long page at the desk, optional fields not tucked away. Two short steps keep
the required part on one screen at a busy door, the way world-class sign-up forms do.

## 367. Telugu and Hindi headings in Noto Serif, one font per language — 15 Oct 2026

**Status: branch `launch-ui-2` (update).** UI audit 14-10-2026 fix 8; amends #337 ("English only").

**Decision.** Telugu headings use Noto Serif Telugu SemiBold and Hindi headings Noto Serif Devanagari SemiBold, so the
serif look of the website reaches all three languages (the audit's languages score was held back by "the serif brand
exists only in English"). Both come from @expo-google-fonts (noto-serif-telugu 0.4.2, noto-serif-devanagari 0.4.1,
OFL; licences in app/assets/fonts), subset with fontTools to the letters the language uses (Telugu U+0C01-0C6F without
the archaic letters and fractions; Devanagari U+0900-0970 without the Vedic and other-language letters), digits,
punctuation, the danda, ZWJ/ZWNJ, the dotted circle and the rupee sign, with the default shaping features (every
conjunct rule kept) and no hinting: Telugu 181 KB, Hindi 158 KB (339 KB raw, about 115 KB compressed; the conjunct
shapes are most of it, so the 300 KB aim was not met without cutting them). theme/fonts.tsx loads only the current
language's font (expo-font loadAsync; on the web only that file is fetched, measured), English keeps Cormorant at its
larger sizes (serifType, bar title 22 px); Telugu and Hindi keep the sans sizes (title 26/38, subtitle 19/28, the bar's
own size), whose line heights already leave room for the marks above and below. Until the font is loaded or if it
fails, the sans as before. JS and assets only: fingerprint unchanged (23dc7e4a), reaches phones with an update.

**Why.** One brand voice in every language the class uses; Noto is Google's open family made for these scripts.

## 368. Colour by family: five module colours, a family's circles side by side — 15 Oct 2026

**Status: branch `launch-ui-2` (update), waiting for Praveen's look at before/after screenshots.** UI audit 14-10-2026
fix 9; amends #354 (the module colour thread).

**Decision.** A module colour now says what kind of thing a screen is, not which module: blue = the class at a glance
and at the door (Overview, To do, Check-in, attendance, follow-up calls, reports, My QR), green = people (Welcome desk,
Newcomers, students, In class now, groups, Ishtagoshti subscribers, About you), purple = learning (lessons and levels,
assessments, level-ups, My progress, taals), teal = seva (instruments, seva roster, class fund, suggestions, practice),
orange = community (News, Events & polls, Ishtagoshti). Pink and indigo are no longer module colours (the palette keeps
them). The rings put a family's circles side by side, so each reads as a few coloured arcs: Guru Overview · Level-ups,
Assessments, Lessons · Events & polls, Ishtagoshti · Welcome desk, Newcomers; coordinator Welcome desk, Newcomers ·
Instruments, Seva roster · Assessments, Lessons · Events & polls, Ishtagoshti; student My QR, Attendance · My progress,
Assessments · Practice · News, Events & polls · About you. The same map (lib/module-tone.ts TONE_FAMILIES) tints each
module's own screens. JS only.

**Why.** The audit found eight rainbow circles that dilute the night-and-gold palette and carry no meaning; five
families are fewer colours and teach where a thing belongs (the way Google Workspace or Apple Settings colour by kind).

## 369. The sign-in band's name and motto in gold — 15 Oct 2026

**Status: branch `launch-ui-2` (update).** Praveen during the TEST walk: "Mridanga Seva / Saṅkalpa · Sādhana · Seva in
the login page — these should be in golden colour". The signed-out screens' band (components/brand.tsx BrandHeader:
sign-in, sign-up, forgot and reset password, pending) shows the app's name and motto in headerGold, as the home band
(#352); the one-line description stays ivory. Gold on the night band passes the contrast check (headerGold on header,
headerDeep and bar are in the tested pairs). JS only.

## 370. Ring labels clear of the drum circle: the drum takes the size the labels leave — 15 Oct 2026

**Status: branch `launch-ui-2` (update).** Praveen during the TEST walk: "sometimes the icon names are colliding with the
inner circle — check and if possible make dynamic circle size". Measured at 375 px: the top label and the two upper
diagonal labels (Welcome desk, Newcomers, Ishtagoshti) overlapped the 144 px drum circle's edge. Now lib/ring-layout.ts
places the circles as far out as the ring and the screen allow (a side label stays 4 px inside the screen), then gives
the drum circle the largest diameter that keeps every label and circle 6 px clear, between 96 px and its usual size (144,
or 128 on a narrow phone). Each label's size is measured as drawn (onLayout of a box that shrinks to the text), so any
language, label and text size is handled; a guess from the label's length is used until then. Measured coordinator ring
at 375 px: drum 133 px, every label clear, the ring 8 px shorter than before (the home still does not scroll); 360 px:
drum 125 px. The fixed 44 px room under the lowest circle became the lowest label's measured height. JS only.

## 371. Dark mode: a night gradient behind every page, cards a step lighter — 15 Oct 2026

**Status: branch `dark-gradient` (update).** Praveen chose option B "gradient on every screen" of three shown (A flat as
now, B gradient on every screen, C a gold glow on Home only), then option B of two screenshot sets (A: the top stop
lowered to #181C45, cards as now; B: the mockup's top, cards lighter).

**Decision.** In dark mode every page that uses Screen (components/screen.tsx) has a vertical gradient behind its
content: bodyTop night.840 #1A1F55 at the top, the page colour night.925 #0E1130 at 45 %, bodyBottom night.950 #0A0C24
at the foot (components/page-backdrop.tsx, react-native-svg, sized in pixels once measured as the home band is). It
fills the page frame and does not scroll with the content; screen readers skip it and it takes no taps. Light mode
stays the flat cream (L1): bodyTop = bodyBottom = background, and nothing is drawn. Header bars, the tab bar, the side
menu, sheets and the navigators' own background (contentStyle / sceneStyle) stay flat. Because the top stop is lighter
than the old cards (#161A3D, #362), cards would have looked sunk into the page near the top; dark cards are a step
lighter: surface night.820 #1F2456, surfaceRaised (fields, sheets) night.760 #262B60, border and cardBorder night.700
#2C3170 (amends #362's quieter cards). The home and sign-in band (components/saffron-band.tsx) now draws itself only
down to its wave and paints nothing under it once measured, so the page, flat or gradient, shows under the wave with
no seam or hairline (it painted the flat page colour there before; a ClipPath would give a jagged edge on Android). The
contrast check also tests every colour checked on the page on bodyTop, the lightest stop: 688 pairs, 0 low. JS only;
fingerprint unchanged (23dc7e4a).

**Why.** A flat navy page read as a flat panel; a soft night sky that deepens towards the foot gives the dark mode the
calm, devotional depth of the website's night band, with the cards clearly raised on it. The range is small
(#1A1F55 to #0A0C24) so cheap screens show no bands; the real check is on a phone.

## 372. The app's name spans its band, so Android cannot hide "सेवा" — 16 Oct 2026

**Status: branch `signin-fixes`.** Praveen on the preview APK (EAS 6f4871bb, 15-10-2026): in Hindi the sign-in band shows
"मृदंग" without "सेवा". The text and the font are right (hi.json `app.name` = "मृदंग सेवा"; the Noto Serif Devanagari
subset has every glyph, checked with fontTools) and the web shows the whole name. Cause: in the centred band the name's
text box was as wide as its own words. React Native measures that width with one Android text layout and the TextView
then draws with its own; when the drawing needs a little more room (the Hindi serif's shaping, 26 px), the last word
moves to a second line that the one-line box cannot show. Fix: every centred line of the band (components/brand.tsx
`styles.line`: the sign-in name, motto, description and the splash's name) is as wide as the band (`alignSelf: 'stretch'`,
`textAlign: 'center'`), so the words have the whole width to spare; the home band's name and motto do the same and the
name shrinks to fit (`adjustsFontSizeToFit`, down to 60 %) rather than end in "…" at large text. The My QR pass keeps its
name beside the drum mark (a row; to check on a phone in Hindi). Nothing else changes on screen.
JS only, fingerprint unchanged (23dc7e4a).

**Why.** A box sized to its words leaves Android no room for a pixel of difference between measuring and drawing; a box
as wide as the band leaves plenty, in every language and at large text.

## 373. A brighter gold for every header title — 16 Oct 2026

**Status: branch `signin-fixes`.** Praveen (15-10-2026): the sign-in gold should be brighter, "as per mobile app"; then
"gold brightness on all header titles". Every band used gold.300 #FFD27A, so he chose from four mock-ups on the sign-in
band (A today, B vivid gold #FFC845, C the icon's gold #E0B25C, D the button saffron #F2A33A): **B, for all header titles**
(16-10-2026). New primitive gold.200 #FFC845; the role headerGold now points to it (design/tokens.json), so the sign-in
band's name and motto, the home bands' name, motto and gold rule, the side menu's role line, the inner header bars'
titles, the My QR pass and the band's golden halo all take it, light and dark. Contrast (headerGold on header,
headerDeep, bar): indigo 7.68 / 12.42 / 10.20 (light) and 7.68 / 12.42 / 7.68 (dark); dark saffron 7.53 / 11.01 / 7.53.
The one exception: on the light saffron header option (not in use) #FFC845 reads 4.28:1 on #9A4307 (header and bar), below
4.5, so that option keeps gold.300 (4.64 / 7.00 / 4.64). focusOnHeader (the focus ring on the bands) stays gold.300.
688 pairs, 0 low. JS only, fingerprint unchanged (23dc7e4a).

**Why.** A warmer, richer gold reads as gold rather than cream on the night band; one gold for every title keeps the
app consistent.
## 380. A new student's first day: registration on the first screen, then "Almost there" — 15 Oct 2026

**Status: branch `launch-ui-student` (update).** From the student screens audit of 15-10-2026 (worktree
shots-student/STUDENT_AUDIT_15-10-2026.md, student side 6.3/10; Praveen's picks). Most people on launch day are new
students, and the first-day path was the weakest part. (1) Sign-in: "New here? New student registration" sits right under
the language buttons, before the sign-in form, so it is on the first screen of a 375 x 812 phone (it was below it);
someone who came from an email link already has an account, so for them it stays at the foot. (2) Waiting for access,
for a new account waiting for the class desk: the title "Almost there" and the three steps of joining as a tracker
(components/join-steps.tsx): ✓ Account made (signed in as …), ● Come to the class desk with an ID (the step now), ○ Your
QR card for the door ("your home opens here by itself once you are registered"). The screen asks again by itself every
30 s and when the app comes back to the front, so the home opens without tapping; Check again stays as the quieter
button. The other waiting cases (switched off, could not load, door tablet, Ishtagoshti blocked) are unchanged. JS only.

**Why.** Duolingo and Headspace put "Get started" on the first screen and show where a newcomer is in joining; a hidden
registration button and a passive "Waiting for access" lose people on day one.

## 381. My QR is a bright pass, and a check-in is a moment — 15 Oct 2026

**Status: branch `launch-ui-student` (update).** My QR is drawn like a boarding pass in a phone wallet: a night strip
with the drum and the app's name in gold (Cormorant), then a white body with the code, the name and the roll number, the
same in light and dark mode, so the code is the brightest thing on the screen at the door (in dark mode it was a dark
card). The code's own white border is the pass's margin, so the code is larger (up to 320 px). When today's check-in is
recorded, "Checked in at 16:05" is a green box ("Hare Krishna! Your visit is recorded.") whose tick pops in (#363); the
phone gives one success buzz only when the scan lands while My QR is open (not yet checked in, then checked in), not when
the screen is opened later. "Not checked in yet today" and "Checked out" stay a quiet line. The how-to is one line with
More; the privacy line is small with an icon. JS only (a brighter screen still needs expo-brightness in an APK).

**Why.** At the door the student holds up the phone and waits; Google Wallet and airline passes show a bright card and
confirm at once. The audit scored the door moment 7: the scan worked, but only one small line turned green.

## 382. Student wording: weeks in a row, titles that match the tabs — 15 Oct 2026

**Status: branch `launch-ui-student` (update).** (1) My attendance opens with **Visits this week** and **Weeks in a
row** (weeks with at least one visit, counted back from this week, or from last week while this week has none yet;
lib/streak.ts, from the months already loaded), in place of "Days since your last visit", a staff measure that read as
blame to a student; the last visit stays as one line. This month's visits and time stay on the month's card, so the boxes
do not repeat them. (2) Titles say what their tab says: the News tab's header is **News** (en `announcements.title`; te
and hi already matched; staff News tab too), the student Slokas tab's header **Slokas** (staff keep "Ishtagoshti",
#353), and the events screen **Events & polls** (as its circle). (3) About you's initiated-name hint no longer says "the
name above stays the one on your ID" (there is no name above on About you): "Your name on the class record stays the one
on your ID" (about.dikshaHintNoName; the sign-up form keeps its own hint). Keys home.student.daysSinceVisit and
noVisitYet removed (unused).

**Why.** A streak is what learning apps use to keep people coming; a header that differs from its tab makes people
wonder whether they are in the right place.

## 383. One assessment: the mark first; recordings by number and day; an app recording is audio — 15 Oct 2026

**Status: branch `launch-ui-student` (update).** Audit fix 5 (Praveen's pick). Once a review is in, the student's
assessment (S7) opens with **Your mark**: the newest reviewed recording's total large ("8 of 15"), Accepted or Please
record it again with who reviewed it, the comment, the voice note and the score per rubric line; then the task and
rubric, the send form (for a redo) and My recordings. The "Sent. Waiting for the review." and "Sent." notices move to
the top with it. Recordings are named by number and day, "Recording 2 · 03-10-2026", numbered from the first one sent
(lib/assessment-view.ts); the date keeps the class's day-month-year (formatDate), since friendly dates (audit fix 7)
were not picked. In My recordings the reviewed one shown at the top keeps one line ("8 of 15 · Accepted"); older
reviews keep their full detail. A recording made with the app's recorder shows as **Audio**: in a browser it is a .webm,
which the database stores as 'video' (the kind must match the ending, 0016), so the screen shows the kind by the app's
own names ("recording.webm", "voice note.webm"; MediaList, also on the coordinator's review screen). A voice note's row
reads "Voice note from …" instead of its file name. JS only, no database change.

**Why.** A student opens a reviewed assessment for the mark; it sat under the task and rubric, and the files read
"recording.webm · Video · 29 KB" for a sound recording. Google Classroom shows the grade first.

## 384. Practice tools: Start under the tempo, the timer one slim line, beats 2-8 in one row — 15 Oct 2026

**Status: branch `launch-ui-student` (update).** Audit fix 6. On Practice tools (students and staff) the big Start /
Stop sits right under the tempo number, with the beat dots under it, then −5 / −1 / +1 / +5 and Tap tempo, so Start is
on the first screen of a 375 x 812 phone (it was a full screen down). The student's Practice timer card becomes one slim
line at the top: "Timer starts with Start" with **Start now**; while it runs, "Practising: 12 min" with **Stop and
save**, and Throw away this time under it. The metronome's icon is the music note ('practice'), not the clock. Beats in
a bar, 2 to 8, are one joined row (ChoiceGroup `segmented`: no wrapping, the width shared, each choice 45 px wide at
375 px); the beat dots' gap is smaller so eight stay on one line. The taal player also has Start under its tempo. JS only.

**Why.** Headspace-style: one main action per screen, and here it is Start. The timer starts with Start anyway, so its
card did not need to come first.

## 385. My profile: who you are first; the sign-in account lower and folded; a student's phone only in About you — 15 Oct 2026

**Status: branch `launch-ui-student` (update).** Audit fix 9. My profile (A3, students and staff) opens with a card:
initials, the name on the roll card, the level, "Roll number MS-2026-0001" and **My QR card** for a student (with the
line that the coordinators keep that name); the name and role for staff. Then Language and Appearance (Same as phone /
Light / Dark now one joined row, so Dark no longer wraps alone), then **Sign-in account**: the name in the app and the
email, with **Change my name** (staff: **Change my name or phone**) opening the field and Save. Then About you, held
instruments and Sign out. **Praveen 15-10-2026: a student's phone is asked only in About you** (the class record the
coordinators use); My profile no longer shows or saves it for a student, and the account's phone is left as it is
(saveMyDetails sends the phone only when the form has one). fetchMyStudent also reads the level. Keys
myProfile.rollTitle, rollNo, rollName, detailsTitle and role removed (unused). JS only.

**Why.** Two names next to each other ("My name: Student Test", "Name on the roll: Arjun Rao") confused students, and
the phone was asked twice and saved to two places. Language and Appearance were two screens down.

## 390. "Possible duplicate" at the desk: the app asks possible_duplicates — 15 Oct 2026

**Status: branch `launch-audit`.** Launch audit 15-10-2026, finding LA-01. #274 (0047) gave the desk
`possible_duplicates(full_name, dob, phone)` and said "the app shows Possible duplicate before saving (a later JS
change)"; that change was never made, so on the registration weekend a person registered by hand who also signed up
(the desk typed a different email, so no link), or a person typed in at two desks, became two student records with
nothing on screen. Now Register a student asks it at **Next** (step 1 → 2) for the name, date of birth and phone
typed, and when **Accept** opens a sign-up's card, for that sign-up's own data. Matches show as an amber notice above
Save, or on Accept's card above Accept: one line per student record (name, roll number, centre, joined) or waiting
sign-up, with why it matched (same name and date of birth / same phone), "consent withdrawn: ask the Guru" for a
withdrawn record, and a button that opens each student record. The sign-up being worked on is left out (it always
matches itself). A list asked for another name, date or phone is not shown. A warning only: the desk may still save or
accept (twins, a shared phone); a failed call or a database before 0047 shows nothing. Rules in
`app/src/lib/duplicates.ts` (unit-tested), call in `src/data/students.ts`, view `components/possible-duplicates.tsx`.
JS only; strings en/te/hi (te/hi drafts for native review).

**Why.** Praveen's rule is that a person's data is filled once; a second record splits their visits, QR code and
follow-up calls. The database part was ready and already on LIVE.

## 391. My QR asks for the card each time it comes into view — 15 Oct 2026

**Status: branch `launch-audit`.** Launch audit finding LA-02. Since My QR became a tab (#350) it stays mounted, and it
asked the server for the card only when first drawn; the home's prefetch (#303) asks once per run of the app. So a code
the Guru gave anew (reissue_qr_code, 0045: a lost printed card), or a record unlinked meanwhile, reached the phone only
after the app was closed and opened again, and the old code scanned as "Code not recognised" at the door. Now the card
is asked each time My QR comes into view (useFocusEffect); the card on screen (or the one saved on the phone) stays
until the answer comes, and without signal the saved card shows with its note as before. JS only.

**Why.** 0045 promised "My QR shows the new code the next time it is online"; the tab broke that promise.

## 392. Fill the form from a sign-up: say when the login was not connected — 15 Oct 2026

**Status: branch `launch-audit`.** Launch audit finding LA-03. When the desk fills the form from a waiting sign-up and
saves, the login is connected to the new record only for an adult whose email on the form is the sign-up's (#96,
0047/0048); a child's record never is (#276), and a corrected email is not either. The card then said only "Student
registered", the sign-up came back in the waiting list at the next reload, and the desk could register the same
person a second time (Accept with the sign-up's adult date, or the form again). Now, when the form was filled from a
sign-up and the answer says not linked, the card adds "The sign-up is still waiting": why, that the Guru links the
login if it should open this record (Coordinators, the person, "Or link to a student record"), and not to register the
person again. JS only; strings en/te/hi (te/hi drafts). Whether such a sign-up should leave the desk's list by itself is
a team question (launch audit report, Q-3).

**Why.** The registration weekend's desk works from the waiting list; an entry that never goes away invites a second
record.

## 393. A busy sign-in server never signs a person out — 15 Oct 2026

**Status: branch `launch-audit`.** Launch audit finding LA-04 (High for the door). The auth client the app uses
(@supabase/auth-js 2.117.2) keeps the login after a failed token refresh only when the failure is "no answer" or a
5xx; any other answer, once the access token has expired (the usual case when the app is opened after an hour), ends
the login (`_removeSession`). Supabase Auth answers **429** when one internet address refreshes too often (the
token-refresh rate limit, GO_LIVE_CHECKLIST R5-02): students on the temple's Wi-Fi, or behind a mobile operator's
shared address, opening the app at the door at once. They were signed out, had to type their password at the door
(sign-ins have their own, lower limit), and Sign out had deleted the My QR card saved on the phone. Now the app's fetch
(`src/lib/refresh-guard.ts`, inside the time limit in `src/lib/supabase.ts`) turns a 429 answer to a token refresh
(`POST /auth/v1/token?grant_type=refresh_token`) into a failure like no internet: the auth client keeps the login and
tries again on its next tick (30 s), the screens say "Could not reach the server" for that moment, and My QR shows the
saved card. A 429 to a password sign-in is left as it is (its message shows). Tested against the installed auth client
(app/tests/launch-audit.test.mjs: without the guard the saved login is deleted, with it the login stays). JS only.

**Why.** The door is where the app must work best; a rate limit is a moment, a sign-out is a password at the door.
The dashboard limit (R5-02) still matters: this only stops the sign-out, not the waiting.

## 394. My QR's door line asks once per tick and stops once checked in — 16 Oct 2026

**Status: branch `launch-audit` (round 2).** Launch audit finding LA-10. My QR's line "Checked in at 16:05" (#342)
asked `fetchStudentHome` every 5 s for 10 minutes while My QR was open: two requests a tick (student_home and the
week setting), about 240 per opening, and it went on after the check-in already showed. With a queue of students
holding My QR open at the door, that is a steady load on the class's small database exactly while the coordinators'
scans must answer fast. Now the line uses `fetchDoorVisit()` (src/data/home.ts: student_home only, the two values
it needs) and stops asking once it shows "Checked in"; coming back to My QR starts it again. A check-out while My QR
stays open is no longer shown until the student opens it again. JS only.

**Why.** The door line is a reassurance, not a live feed; the scan is what must be fast.

## 395. A production update is published only from a clean `main` that is on GitHub — 16 Oct 2026

**Status: branch `launch-audit` (round 5).** Launch audit finding LA-16. `npm run update:production` bundled whatever
files were on disk in the folder it ran from: a worker's branch, edits not yet committed, a new screen file not yet
added (Expo Router bundles every file in `src/app/`), or a merge not yet pushed. All checks (fingerprint, EAS
settings, bundle) passed for such code, and the class got code nobody had checked. Now `scripts/publish-update.mjs`
first asks git (`scripts/lib/release-git.mjs`): for **production** it stops unless the folder is on `main`, `git
status` is empty (tracked changes and new files that are not ignored) and `HEAD` equals `origin/main`; it names each
problem and publishes nothing. `--check-only` on production prints the same problems as "a real production run would
stop here" and goes on, so a check from a worktree still works. **Preview** only prints them as a note (trying a
branch on the test phones stays possible). Every run prints the commit it publishes. Git must run in the terminal
(`eas update` needs it anyway; OPERATIONS "Each build" shows how to add it to the path). A script change: not in the
app bundle, not in the fingerprint (npm scripts and `scripts/` are not counted), so fp 23dc7e4a is unchanged.

**Why.** `eas.json`'s `cli.requireCommit` would do part of this inside EAS CLI, but `eas.json` is in the fingerprint
(a new APK); and it checks only "committed", not "main" or "pushed". The production channel reaches every phone in
the class, so it must carry exactly what the lead checked and merged.
## 396. A day-one readiness query in the go-live checklist — 17 Oct 2026

**Status: branch `launch-audit` (round 7).** Launch audit finding LA-21. LIVE gets its structure from the migrations, but
the people and class data the app needs on day one come from no migration: the TEST project has them from `seed.sql`,
which never runs on LIVE. LIVE's own record (15 Oct 2026) shows 2 logins, the one centre 0001 makes ("Abids", 14:30-20:00,
no GPS point, no city), 3 levels and **no syllabus item**; nothing in the checklist checked that one login is the Guru,
that coordinators exist, or that staff have a gender (Accept gives a student a mentor of the same gender, else "mentor
needed"). GO_LIVE_CHECKLIST part F now has a read-only **Day one** query (7 rows: Guru logins, coordinators, staff
without a name, staff without a gender, centres with hours / GPS / city, syllabus items per level, sign-ups waiting),
each `false` naming what to do in the app. `supabase/tests/live-replay.mjs` runs it on the replayed LIVE. A PGlite probe
of a LIVE-like database (migrations only, no seed) showed the whole day-one chain works: first Guru → a coordinator made
in the app (role only; the profile's centre defaults to 1) accepts sign-ups, registers walk-ins and children, scans;
homes, reports and the nightly jobs run with an empty syllabus (the level strip shows the level without a count).

**Why.** Each of these is a click for the Guru, but found on Tuesday at the desk it is a queue.
## 397. An email that could not be sent says so, not "check your internet" — 17 Oct 2026

**Status: branch `launch-audit` (round 8).** Launch audit finding LA-22. When Supabase Auth cannot hand a sign-up
confirmation or a reset email to the mail service (Brevo's free plan sends 300 a day; an SMTP failure), it answers
500 "Error sending confirmation email" / "Error sending recovery email". supabase-js reports every 500 like a lost
connection, so the sign-up form said "Could not reach the server … check your internet connection" and people on the
temple Wi-Fi would retry for the rest of the day. Supabase's own email limit (`over_email_send_rate_limit`: 150 an hour
for the sign-up weekend, or the 60 s before a second email to one address) said "Too many tries", which is not what
the person did. Both now show `authErrors.emailNotSent`: the email could not be sent just now, try again in a few
minutes or later in the day, or come to the class and the desk registers you (en/te/hi; te/hi drafts for the native
review, Q-4). `over_request_rate_limit` keeps "Too many tries"; "Database error saving new user" keeps #292's hint;
any other 500 keeps the network message. The mapping moved to `src/auth/auth-errors.ts` (pure, re-exported by
auth-actions) so `tests/launch-audit.test.mjs` drives it with the installed auth client's real errors. JS only.

**Why.** On the sign-up weekend the email is the one thing outside the app that can run out; the person must know to
wait or come to the desk, not fight their Wi-Fi.

## 398. LIVE stays in Sydney; the privacy notice says so — 17 Oct 2026

**Status: main.** The go-live record expected the LIVE Supabase project in South Asia (Mumbai), as OPERATIONS
"Setting up a new environment" says. `supabase projects list` (17 Oct 2026) shows LIVE `qeozvv…` in **ap-southeast-2
(Sydney, Australia)**; TEST is ap-southeast-1 (Singapore). A region cannot be changed in place: moving means a new
project and the whole LIVE run again (migrations, functions, vault, mail and auth settings, EAS env, web). Praveen chose
to keep Sydney. The privacy notice (website privacy.html en/te/hi: processors table and the "outside India" paragraph),
the OPERATIONS processors table, GO_LIVE_CHECKLIST part G and the lawyer pack now say Sydney, Australia. The phase 3
drafts (DPIA, face plan, decisions for the Guru) still say Mumbai and are corrected with that work.

**Why.** Three days before launch, a second LIVE run costs more risk than it saves. Indian law (DPDP s.16) allows the
transfer except to countries the Government restricts, and Australia is not one; measured from Hyderabad, LIVE answers
as fast as TEST in Singapore (about 0.2-0.6 s). What matters is that the notice people tick tells the truth.

## 399. A child under 18 signs up at home; the parent consents by email, the desk sees the parent's ID — 21 Oct 2026

**Status: branch `minor-home-signup` (migration 0051); Praveen approves at the merge.** Until now a sign-up under 18 was
refused ("come to the class desk with a parent", #150): handle_new_user dropped a minor's date of birth and Accept
answered `minor_needs_desk`. Most students are under 17, and on 20 Oct 2026 several tried at home and gave up. Design B
of the lead chat (21 Oct 2026), read strictly by the Rules (below):

1. **Sign-up.** The child fills the normal form and, under 18, the parent's or guardian's name, relation (mother, father
   or guardian), email and mobile. The login is made as today (pending, email confirmation). `handle_new_user` keeps the
   date of birth only with the parent's details and stores them in `minor_signups` (the parent's email may not be the
   child's own sign-in email). Before the parent consents the sign-up serves only to ask for consent: About you is
   refused (`minor_awaits_parent`) and not offered to a child, and coordinators do not see the sign-up
   (`waiting_sign_ups` leaves it out).
2. **One email to the parent**, after the child confirms their own email: a 6-digit code and the address of the
   consent page `/parent-consent` on the web app (`?lang=te|hi`; never the code in a link). It goes through the Edge
   Function `notify-parents` (Brevo's API), which the every-minute job now also calls for consent emails whether or not
   check-out emails are on. The code is stored only as sha256(login id : code), lives 7 days, allows 5 wrong tries, and
   never returns to the app. Limits, from audit S3-01 (0027's parent code was an open mail relay): 5 emails per
   sign-up, 3 a day per parent address across all sign-ups, 60 a day for the whole app (Brevo's free plan sends 300,
   shared with confirmations, resets and check-out emails; each child costs 2: their own confirmation and this one),
   one request every 10 minutes; names in the email follow the name rule (letters only, #271) and a dot between two
   letters gets a space, so no name becomes a link. The email has no unsubscribe link: nothing more is sent unless the
   child asks again.
3. **The consent page** (`give_parent_consent`, the second function anon may run after `sign_up_choices`): the parent
   types the email and the code, reads a summary of the notice (what, why, who, where, how long, the rights including a
   complaint to the Data Protection Board; link to the whole notice), declares "I am this child's parent or legal
   guardian and 18 or over", ticks the data consent, and separately chooses photos (unticked). A wrong code and an
   address with no request get the same answer; the child's name is shown only after the right code; the child's own
   login signed in on that browser cannot consent (`child_signed_in`).
4. **The desk.** Once the parent consented, Register a student shows "Parent consented by email; parent's ID not yet
   seen" with Accept. Accept for a child is `accept_minor_sign_up(profile, id type)`: the coordinator sees the
   **parent's** ID document (the child brings it, or the parent comes): the parent's name and an age of 18 or over; only
   its kind is kept (#8). Then the student, the guardian and the consents (data, and photo if given; method
   `email_code`; `given_at` and `otp_verified_at` = when the parent consented; `verified_by` = the coordinator; the
   notice version the parent saw) are written in one step and the request is deleted. The record is linked to the
   child's own login: the parent consented for that very login, and staff make the link explicitly, so #276's "never
   link a child by email" stands. `accept_sign_up` (adults) is unchanged, so older app builds keep working. A parent who
   comes to the desk can still give the written consent there (Fill the form, as before).
5. **No consent, no data.** If the parent does not consent within 30 days, the daily job `mridanga-minor-signups`
   (02:15 IST) erases the child's whole sign-up with `erase_login` (0049: the login, its details, the request with the
   parent's details; a tombstone in `erasures`, reference `minor-signup-expiry`); the child's waiting screen shows the
   date. A consented sign-up the desk never accepts goes the same way after 180 days, when it leaves the desk list. Only
   the request goes when the desk registered the child by hand meanwhile (a record with the login's email).

The privacy notice (website en/te/hi) says so: two ways to consent, the parent's ID at the first class, nothing used
before consent, erased after 30 days, Brevo sends the consent email. Its version goes from 0.1-draft to **0.2-draft**
(21 Oct 2026) in `site.config.mjs` and `PRIVACY_NOTICE_VERSION` (#150). Text in en/te/hi; te/hi are drafts for the native
review.

**How we read the Rules (no lawyer).** Praveen, 21 Oct 2026: no lawyer is needed; the class is a seva, not a commercial
service, but the app goes by the Act and the Rules. Where a reading was open, the stricter one is taken:
- **DPDP Act 2023 s.9(1)**: verifiable consent of the parent before processing a child's personal data. Before consent
  the sign-up is used only to ask for consent (sending the one email; showing the child where it stands), nobody at the
  class sees it, and without consent it is erased after 30 days. Registration, attendance and everything else start
  only after Accept.
- **DPDP Rules 2025, Rule 10(1)**: due diligence that the person identifying as the parent is an identifiable adult, by
  reliable details of identity and age. The email code shows the consent came from the parent's address and the
  declaration covers parenthood and age; the reliable identity and age details are the **parent's** ID document,
  sighted by a coordinator before the child is registered (the child's own ID does not show who the parent is, so it
  does not count). A DigiLocker / virtual-token check (Rule 10(1)(b)(ii)) is not used: the in-person sighting serves the
  same purpose and keeps no copy or number.
- **Rule 3 (notice)**: the consent page shows the notice's summary in the parent's language, with the full notice, how
  to withdraw, and the right to complain to the Board.
- **s.9(3)**: no tracking, behavioural monitoring or advertising for children (unchanged).
- **Retention (s.8(7))**: the purpose ends when the parent does not consent, so the data is erased (30 days), and a
  consented sign-up the desk never accepts is erased after 180 days.
- **Commencement**, checked 21 Oct 2026: PIB release 2190014 (official, read in the browser) says the Rules were notified
  on 14 Nov 2025, "marking the full operationalisation" of the Act, with an 18-month phased compliance timeline. The
  phases (Rules 1, 2, 17-21 at once; Rule 4 after one year; Rules 3, 5-16, 22, 23 and Act ss.3-17, s.9 included, after
  18 months, i.e. 13 May 2027; G.S.R. 846(E) and 843(E) of 13 Nov 2025) are as in docs/phase3/DPIA_DRAFT.md and law-firm
  notes; the Gazette PDF itself (egazette.gov.in) could not be opened from the office network (certificate error). The
  class follows s.9 and Rule 10 now, before they bind.

**Mail on LIVE (what Praveen must set before this ships).** Supabase Auth's SMTP cannot send it: it sends only Auth's
own templates (confirmation, reset, magic link), and using one would make the parent a login. So it is
`notify-parents`, which on LIVE has **no `BREVO_API_KEY`** (dry run): until it does, every consent email is skipped and
the child sees "emails to parents are not switched on yet; come to the desk with your parent". In order: (1) run 0049
if not yet (0051 uses its `erase_login`); (2) deploy `notify-parents` from the merged commit with the LIVE ref
(checklist C7); (3) in Brevo verify the sender and make an API key; (4) Supabase → Edge Functions → Secrets:
`BREVO_API_KEY` and `NOTICE_FROM` (the verified sender; the Brevo sender today is a Gmail address, the domain sender
`noreply@mridangaseva.com` waits for D2), optionally `NOTICE_REPLY_TO` = the desk; (5) run 0051; (6) one test sign-up
with a team member's address; (7) the OTA and the website upload (notice 0.2-draft). Setting the key does not switch on
check-out emails (G10 setting, still off) and does not touch the Vault: the Ishtagoshti parent code
(`mridanga_brevo_key`, S3-01) stays off. Without step 4 nothing breaks; children wait for the desk.

**Why.** Children can join from home with a consent the parent gives from their own email, the class sees the
parent's ID before anything is recorded about the child, nothing is kept without consent, and an outsider cannot use
the form to mail strangers in bulk.

## 400. A weekly practice goal each student can change — 21 Oct 2026

**Status: branch `claude/practice-features-61c475`; migration 0052_practice_more.sql.** Praveen asked for more on the
student's Practice, chosen by looking at other practice apps (shortlist: NOTES_practice_research.md, worker chat
practice-features). On 21 Oct 2026 he picked features 1-5 and 7 of it, and the hands view (#404), through the lead chat.

**Context.** Practice logged minutes and showed weekly bars, but nothing told a child whether this week was enough.
Practice apps (Soundbrenner, SurTaal, Duolingo) show a goal and a run of good weeks.

**Decision.** A weekly goal of days a week and minutes a day: **4 days x 15 minutes** (Praveen), **which each student
can change** for themselves (`practice_goals`, through `set_my_practice_goal`; "Use my class's goal" goes back). Without
the student's own, the level's goal from the practice of the week (#401) counts, else 4 x 15. A day counts when it has
the minutes; Practice tools, My progress and the staff student page show this week Monday to Sunday ("3 of 4 days this
week"), what is left or "goal met", whose goal it is, and the **weeks in a row with the goal met**, counted like the
visits' weeks in a row (#382): a week is not broken before it ends, and a missed day is never called a loss. No points,
no badges, no leaderboard (children are not compared with each other). Data: `practice_days()` (minutes per day of up to
53 weeks with the goal, row-level security of the asker).

**Why.** A week fits a weekly class and is kinder to children than a daily streak (Duolingo moved away from tying the
streak to a daily amount; critics note loss pressure on children). A goal the child picks is one they keep.

**Consequences.** The student's own goal is a small new fact about the child (days and minutes they chose); it belongs
with "practice minutes" in the privacy notice's Learning row: Praveen to add "and the practice goal you set" when the
notice is next edited (the under-18 worker owns the notice files now). It goes with the record at erasure (cascade) and
is refused for a withdrawn record (#281). All JavaScript: fingerprint stays 23dc7e4a (APK 90c6d1cd). 0052 must run on
TEST and LIVE before the OTA and web upload; without it the week card is left out. Tests: app/tests/practice-more.test.mjs,
smoke-test "0052 more practice".

## 401. Practice of the week per level — 21 Oct 2026

**Status: branch `claude/practice-features-61c475`; migration 0052_practice_more.sql.**

**Context.** Volunteers say in class what to practise; children forget by Tuesday. Practice apps for teachers (Tonara,
PracticeSpace, Modacity) let the teacher set the week's items. The class has levels, not batches (#2); Praveen: per
level now, per group later.

**Decision.**
- **practice_plans:** one row per level: the level's weekly goal (#400; 4 x 15 until changed), a note (300 characters)
  and **up to three items**, each a switched-on taal at a tempo (30-240) or an approved lesson video (YouTube or the
  team's file) that the level may open (its own level or lower). **The Guru and coordinators write it** (coordinators are
  the teachers, #11); a student reads only their own level's row; no delete from the app (an empty plan has no items).
  Every write is checked by `guard_practice_plan()` and audited. Class content only: no personal data.
- Staff open **Practice of the week** from Practice tools (staff/practice-plan): a level, the goal (days 1-7, minutes
  as chips), the items and the note; edits of other levels are kept until saved. Students see it **at the top of
  Practice tools** with **Start** (the taal at its tempo, full speed, after the count-in) and **Watch** (the lesson
  player); an item the student cannot use (taal switched off since, lesson not open to them) is left out.

**Why.** One place for "this week's practice" saves volunteers repeating it and lets parents on a shared phone see it.

**Consequences.** If 0052 has not run, Practice tools shows no plan and the editor says it could not load. A deleted
lesson or taal leaves its item in the row; the app hides it until a teacher saves the plan again. #384 (Start on the
first screen) still holds for the tools; with a practice of the week, its own Start comes first. 0051 (under-18 sign-up)
is another branch: the checklist rows go 0050, 0051, 0052 when both are on main.

## 402. A daily practice reminder made on the phone — 21 Oct 2026

**Status: branch `claude/practice-features-61c475`; app only, no database change.**

**Context.** Habit apps remind at a chosen time. The Android app already has expo-notifications (announcements push,
#33); iPhone users have the web version, which has no push yet.

**Decision.** On Practice tools a student may choose **a time** (06:30, 07:30, 17:00, 18:00, 19:00, 20:00; off by
default). The phone schedules **one-off local notifications for the next 14 days** ("Khol practice" / Praveen's words:
"Time for your khol practice. Even 10 minutes helps. Hare Krishna!"), on its own channel "Practice reminder", without
today once the student saved practice today on this phone or the time has passed. Every visit to Practice tools and
every saved practice schedules the 14 days again; a phone not opened for two weeks stops reminding. A tap opens
Practice tools. Nothing is sent to a server; the choice is kept per login on the device and **removed at every
sign-out** with the other traces (#186, #283). The web version says "Reminders work in the Android app." Android without
the exact-alarm right shows it within some minutes of the time (expo-notifications falls back to an inexact alarm).

**Why.** A cue at a fixed time builds a habit; local notifications need no server, no new data and no new APK. Not
reminding on a day already practised, and stopping when the app is not used, keeps it gentle for children.

**Consequences.** Needs Praveen's phone check before the production OTA (list in the worker's READY report and NOTES).
iPhone reminders need web push, a separate project. te/hi wording is a draft for native review.

## 403. Count-in, cycle counter, speed trainer, screen on — 21 Oct 2026

**Status: branch `claude/practice-features-61c475`; app only.**

**Context.** The metronome and taal player started at once, ran at one tempo, never stopped by themselves, and the phone
dimmed mid-practice. Metronome apps (Time Trainer, Soundbrenner, Unchained) count in, count bars and raise the tempo.

**Decision.**
- **Count-in** (a tick box, on by default): one bar of clicks before beat 1 when Start is pressed (also the practice of
  the week's Start); the metronome's bar, or a taal's first vibhag (2-8 clicks). In the browser the clicks are on the
  audio clock, exact. On the phone the loop is one mixed WAV that loops on the audio hardware; it cannot start a second
  sound at an exact time, so the count-in is a second short file and the loop (loaded, paused) starts when its time is
  over by a JavaScript timer: sam may come a few milliseconds early or late, once; from then on the loop keeps time.
  Record myself starts at once (its takes are compared with the sound from its start).
- **Cycle counter:** "Bar 3" / "Cycle 3" (or "Cycle 3 of 8") under Start, "Count-in…" before beat 1, and **stop after**
  4, 8, 16 or 32 bars or cycles ("Stopped after 8 cycles."). Cycles are counted from the player's position: the browser
  counts them, the phone's loop starts again at 0 (a jump back of more than half a cycle is one cycle); the phone player
  gives no position while it reloads the loop at a new tempo or counts in, so neither is a cycle.
- **Speed trainer:** faster by +10/+20/+30/+40 in all, +1/+2/+5/+10 a step, a step after every 1/2/4/8 bars or cycles.
  The tempo shown is the trainer's while it plays; Stop (or the trainer off, or the other tool) keeps the tempo reached.
- **The screen stays on while the sound plays** (expo-keep-awake, already in the APK; the browser's wake lock where it has
  one).

**Why.** Counting in and counting rounds are how a teacher starts and ends a practice; raising the laya step by step is
how riyaz is done; a dimmed phone hides the beat.

**Consequences.** All JavaScript (fp 23dc7e4a). The phone's count-in-to-sam step is to be heard on a real phone.

## 404. Hands in the taal player — 21 Oct 2026

**Status: branch `claude/practice-features-61c475`; app only.** Praveen: "for taal player, add the hand movements too to
get clarity".

**Context.** lib/bols.ts already holds, for every known bol, the head (dayan = right hand, baya = left), the zone, what
touches (index, middle, three fingers, flat hand, fingers, wrist and fingers, slide) and open/closed; the two-head view
lit the zone and named the touch in small words. No practice app found shows hand drawings per stroke; hand-drum
notation writes a right-hand and a left-hand row, and teaching describes a muffled stroke as the hand staying on the
skin.

**Decision.**
- Under each head, **a drawing of the hand that plays it** (react-native-svg, already in the app): seen from above, the
  fingers towards the drum, the parts that touch lit in the drum's highlight colour (index; middle; index-middle-ring;
  four fingers; heel of the hand and fingers; the whole flat hand); an **arrow up = strike and lift (it rings)**, an
  **arrow down onto a line = press and stay (damped)**; and the same in words ("Right hand · index finger · edge of the
  syahi", "Strike and lift: it rings"). The hand that does not play is drawn faint ("rests").
- In the beat grid, **under each beat which hand plays it**: L, R or L+R (te ఎ / కు, hi बा / दा), ? for a bol the app
  does not know.
- **Learn stroke by stroke** (a tick box): the loop stops; Previous / Next go through the taal's strokes (rests left
  out), the grid lights the beat, the heads and hands show the stroke, and **Hear it** plays that one stroke once.
- Nothing about a stroke is decided by the view: it reads lib/bols.ts, whose unverified mappings (tin → tī, kha/khe →
  ka, ge/gi → ga, dhi → dhin) are for the Guru to confirm.

**Why.** Seeing which fingers land where, and whether the hand lifts or stays, is what a child copies from the teacher;
one stroke at a time is how a new theka is learnt.

**Consequences.** Drum colours stay the instrument's in dark mode; the hands use the theme's surface and outline colours
with the saffron highlight, so they read in both modes. If the Guru changes a mapping in lib/bols.ts, the drawings,
words and the L/R row follow by themselves.

## 405. Mantra before practice — 21 Oct 2026

**Status: branch `claude/practice-features-61c475`; migration 0052_practice_more.sql.** Praveen: "i want mridanga mantra
to be in some part of app so that we can open the mantra to read before practise as i am currently searching in
internet and reading before starting practise".

**Context.** The mantra the class reads before practice is not in the app; Praveen looks it up on the internet each
time. The Ishtagoshti slokas (0021) already show verses with Devanagari and transliteration, edited by the Guru and
Ishtagoshti editors.

**Decision.**
- **practice_mantras** (in 0052): title (1-80), the mantra in **Devanagari, Telugu script and/or Roman transliteration**
  (at least one, 3000 characters each), the **meaning in en/te/hi** (optional, 2000), a source note (200), an order and
  "students see it". Checked by `guard_practice_mantra()` and audited. **Everyone with a class role reads the ones
  switched on; the Guru and Ishtagoshti editors (`is_ig_editor`, 0021) read all and write**, as for slokas. More than
  one is allowed (e.g. the mridanga pranam and a guru pranam).
- **The text comes only from the Guru**, typed or pasted in the app (staff/mantras/[id]). The app and the migration
  contain no mantra text: nothing typed from memory or copied from the internet.
- **"Mantra before practice"** is the first row of Practice tools (students and staff): one tap opens a calm reader
  (staff/mantra, student/mantra): the mantra in large type, a script switch (the reader's language's script first), the
  meaning with a language switch, the source, a **light or dark reading page** (kept on the phone), the **screen kept
  awake** while it is open, and "Go to practice". The last list loaded is kept on the phone, so it reads **offline**
  after the first load. Until a mantra exists students see nothing; the Guru and editors see "Add the mantra".

**Why.** Reading the mantra before taking up the mridanga is part of the practice; it should be one tap away, the same
text for everyone, and the Guru's own.

**Consequences.** No personal data. 0052 must run before the update that shows it (without the table the row stays
hidden and the editor cannot save). Praveen (or the Guru) adds the text in the app after 0052 runs. te/hi screen text is
a draft for native review; the mantra text itself is never translated by the app.

## 406. What's new: release notes bundled with each update, behind an ⓘ on My profile — 21 Oct 2026

**Status: branch `whats-new` (lead chat 11's brief, Praveen's ask "add a info icon with whats new … track the changes as
per versions through app"). JS only (OTA + web), fingerprint 23dc7e4a unchanged; no migration.**

**Decision.** My profile (students and staff, one screen) has "ⓘ What's new" just above the version line: a button
with a spoken label and a 44 px target. It opens What's new (`student/whats-new`, `staff/whats-new`): the releases
newest first, each with its version label ("Version 1.0.0 · update (01a14a74)" / "· the app as installed (90c6d1cd)"),
date and 3-8 plain lines in the reader's language (en/te/hi; te/hi drafts for native review). The notes are one
bundled file, `app/src/content/whats-new.json`, so every update carries its own notes: no table, no migration, works
offline. The newest **dated** entry is the one running ("You have this"), because the file came in the same bundle;
for it the id shown is what the version line shows (the update id, or the web commit). An entry with `date: null` is
not published yet and shows as "Coming in the next update". A small dot on the ⓘ shows until What's new is opened for
the newest dated entry (device storage `whatsNewSeen`, nothing on the server).

**Guard.** `scripts/lib/whats-new-check.mjs`: `update:production` stops when the newest entry has no date, still has a
`_todo`, or is dated before the last commit to `app/src`, `app/assets` or `package-lock.json` (the notes file left out);
preview and `--check-only` only print it. Two releases on one day are not told apart (dates have no time). The web
export is not guarded: the live web goes up with the same commit as the production update.

**Seeded** from OPERATIONS and git: APK 90c6d1cd (16 Oct 2026, launch), update 01a14a74 = group 4bcc0e21 (17 Oct
2026, #397), and a waiting entry for main after it (Practice #400-#405, under-18 home sign-up #399, launch clean-up
#283-#284; 8 lines, the most); the lead sets its date at publish time.

**Why.** Praveen wants students and staff to see in the app what each version changed. Notes in the bundle can never
disagree with the code they describe, and the publish guard makes writing them part of every release.

## 470. Tap pad: a play-along graded on the sound's own clock — 22 Oct 2026

**Status: branch `creative-tools`; no migration.** Praveen 22-10-2026: start the next phase of advanced features; the
research note NOTES_creative_tools_research.md ranked a tap-pad play-along among the first.

**Decision.** Practice tools → Play and learn → **Tap pad**: two big pads (baya left, dayan right, each a drum face with
the hand drawing of #404). The taal loops after one vibhag of count-in; the student taps each stroke on its pad (dhā:
both). Each tap is graded against the player's position at that moment, never a JavaScript clock: **on time within 70
ms, a little early or late within 160 ms** (narrower when two strokes of the same hand are closer), else an "extra tap".
Each cycle gets **0-3 stars** (on time 1, close ½, an extra tap −¼; 85 / 60 / 30 %), so mashing both pads earns
nothing. **"Tune to this phone"** measures the phone's sound delay once (12 clicks; the middle value of the taps, taken
only when the taps are even) and takes it off every tap. Options: the taal plays, or **only the beat** and the taps
sound the strokes; the guide lights the pad and shows the bol. The **best cycle per taal** (stars, then tempo) is kept
on the phone for the person signed in and wiped at sign-out. One tempo while playing.

**Why.** Practice away from the drum (bus, waiting room) with a game feel, training timing and which hand, as rhythm
apps do; no leaderboard and nothing shown to others (children use it).

**Consequences.** JS only (expo-audio, expo-keep-awake, react-native-svg are in the APK; fingerprint 23dc7e4a). Phone
latency differs; tuning is per phone. On phones the pads use onPressIn (React Native hands a second finger to the
other pad: check on a real phone); in the browser onPointerDown, one pointer per finger.

## 471. "Which bol?": an ear quiz by level — 22 Oct 2026

**Status: branch `creative-tools`; no migration.**

**Decision.** The app sounds a bol, or a phrase of 2-4 bols, and the student picks it from **three cards** with the
hands that play it. The bols are those of the chosen level's taals, lower levels' and every level's (a student starts at
their own level), each sound once (ke = ka, tin = tī share a card, written as the Guru's taal writes it); a few first
bols fill up to three. Phrases follow a taal round its cycle; the wrong cards change one bol, so the ear must follow the
whole phrase. After the answer each card can be heard to compare. A gentle **"in a row"** count and its best per level
and length on the phone; no time limit, no ranking.

**Why.** Ear training was missing; it builds on Hear it (#404) and the hand drawings.

**Consequences.** Bols the app does not know are left out. When the Guru records real strokes (#473) the quiz uses them.

## 472. Echo me: call and response — 22 Oct 2026

**Status: branch `creative-tools`; no migration.**

**Decision.** The app plays one **vibhag** of a taal (the call), then leaves **as long silent** (the answer) with soft
clicks on its beats (can be switched off), then the next vibhag, or one vibhag again and again. The screen says
**Listen** / **Your turn** with the vibhag's bols (hidden while answering if wished). The student answers on the drum or
on the **tap pads**; pad answers are graded as in #470 (only the answer's strokes; extra taps count only while
answering) with stars per round and a best per taal. **Record myself** on this screen keeps Echo me's takes apart
(`RecordingSetting` mode `echo`, speed always 1; Practice tools lists the others), and "Play with the sound" plays the
calls beside the recorded answers. Takes stay on the phone (#283).

**Why.** It is how the class is taught: the Guru plays, the student plays it back.

## 473. Real khol sounds: the setting and the loader, no recordings yet — 22 Oct 2026

**Status: branch `creative-tools`; no migration.**

**Decision.** `lib/khol-samples.ts` lists recorded strokes (`KHOL_SAMPLE_FILES`, **empty**) and, when the student
chooses "Real khol", reads each WAV from the app's assets, cuts the quiet before the stroke, evens the loudness, limits
it to 1.5 s and gives it to every practice sound in place of the synthesised one; a stroke without a file stays
synthesised. Until files exist Play and learn says real strokes come once the Guru has recorded them, and offers no
choice. **docs/KHOL_RECORDINGS.md** says exactly what the Guru records: 9 single strokes (tā, nā, tī, ra, te, ka, gha,
ga, gin), 5 takes each in a quiet room, WAV 16-bit mono, and how the team adds them.

**Why.** Children copy what they hear; the class's own drum is the best model. Recordings need the Guru, so the app is
ready first.

**Consequences.** Adding the files is an over-the-air update (assets; expo-asset in the APK). Recordings are of the
instrument only. A CC BY sample would need a credit in About; NC or unknown licences are not used.

## 474. Learn more: a short list of links the Guru keeps — 22 Oct 2026

**Status: branch `creative-tools`; migration 0055_practice_links.sql.**

**Context.** Lesson materials have no "link" kind and are tied to levels and syllabus items; an app version that does
not know a new kind would show it wrongly.

**Decision.** A small table **practice_links** (title 1-80, an https link to a site, a note ≤ 200, order, on/off):
class roles read the ones switched on, **only the Guru** reads all and writes (row-level security), checked by
`guard_practice_link` and audited. Practice → Play and learn → **Learn more** lists them with the **site's name** under
each title, so a child or parent sees where it goes, and opens them in the browser; the Guru adds, edits, orders,
switches off and deletes on the same screen. The list is kept on the phone for offline. Nothing is copied into the app;
nothing is seeded (the Guru chooses, e.g. the kksongs khol course).

**Consequences.** 0055 must run on TEST and then LIVE before the update that shows Learn more (without it the list is
empty and saving fails; the other tools work).

## 490. Silent bars and cycles: keep the time without the sound — 22 Oct 2026

**Status: branch `practice-extras`; app only.** Shortlist item 6 (NOTES_practice_research.md), Praveen's "next phase of
advanced features" (22 Oct 2026).

**Context.** A kirtan player keeps the taal while the singers and other drums come and go. Time Trainer's "bar breaks"
and Unchained's silent bars train exactly that: the click plays, falls silent, and comes back; landing together shows
whether the inner time held.

**Decision.**
- A tick box under the metronome and the taal player, "Silent bars / cycles": **play 1-4, then 1-4 silent**, round again
  (default 2 + 2). Count-in, stop after N and the speed trainer work as before and count every cycle, silent or not.
- The loop itself holds the silent cycles (`withSilentCycles`), so both engines play them with no change of their own:
  the browser schedules nothing there, the phone's one looping WAV has silence there.
- During a silent cycle the **beat grid stays lit** (children may follow the count with their eyes), the two-head view
  shows nothing and "Silent: keep playing" appears under the cycle counter.
- The phone mixes the whole loop into one file: **at most 160 seconds** (about 7 MB). A slow taal with many cycles that
  would be longer plays without the silent part and the screen says so ("choose fewer cycles or a faster tempo").

**Why.** Inner time is the skill this trains; showing the beat keeps it kind for beginners (the sound, not the eye, is
taken away). The cap keeps a cheap phone's memory safe without a second engine.

**Consequences.** JavaScript only (fp 23dc7e4a). The kartal layer (#492) falls silent with the strokes.

## 491. Layakari: dugun, tigun and chaugun in the taal player — 22 Oct 2026

**Status: branch `practice-extras`; app only.** Shortlist item 8.

**Decision.**
- A choice under the speed: **Barabar 1× · Dugun 2× · Tigun 3× · Chaugun 4×.** At k×, each beat of the cycle holds k
  written beats (beat b holds written beats b·k … b·k + k − 1, round the cycle), each a 1/k of the beat with its bols
  evenly inside it (a written 'te.re' keeps its two halves). The theka goes round k times in one cycle; sam, the vibhags
  and the tempo stay.
- **The grid shows it:** each written beat as one word inside the beat ("dhā ti", "tere dhā", a rest "–"), the hands
  under it per written beat ("L+R R", "R·R L+R").
- Barabar is exactly the old pattern (same key and strokes, tested). The step mode goes through the bols as written,
  so its grid goes back to 1×. A Record myself take keeps its layakari, so "play with the sound" matches.

**Why.** Dugun-tigun-chaugun is the standard next step of riyaz once a theka is steady; the cycle and sam staying put is
what makes it layakari and not just a faster tempo.

**Consequences.** At chaugun of a fast tempo the synthesised strokes overlap; the mix is kept below clipping. The Guru may
find a taal whose layakari is written differently in the class: the rule is in `layaGroups` (lib/practice-pattern.ts).

## 492. A kartal layer under the taal — 22 Oct 2026

**Status: branch `practice-extras`; app only.** Shortlist item 9.

**Decision.**
- A tick box "Kartal under the taal" (off by default) with its own volume 25 / 50 / 75 / 100 % (default 50 %).
- Two synthesised kartal sounds (bright inharmonic partials over a hiss): **a ringing stroke on the first beat of each
  vibhag, a short closed one on every other beat**, on the beats also at layakari. This is a plain time-keeping pattern,
  **a placeholder until the Guru gives the class's kartal pattern** (one function, `withKartal`).
- Each player has a volume per layer (`setLayerVolume`): the browser through its own gain (instant); the phone mixes the
  kartal into its loop, so a volume change mixes the loop again at the same beat, like a tempo change.

**Why.** Kirtan is played against kartals; practising with them feels like the class and gives a steady pulse under the
bols.

**Consequences.** The sound is a likeness; recorded kartals can replace it with the sample loader (creative-tools). Count-in
clicks and the step mode's single stroke have no kartal.

## 493. Practice milestones, seen only by the student and staff — 22 Oct 2026

**Status: branch `practice-extras`; migration 0056 (`practice_history`).** Shortlist item 10.

**Decision.**
- Milestones on the Practice block of **My progress (the student) and the Student profile (staff)** only: first
  practice; 7, 30 and 100 practice days; 10, 25, 50 and 100 hours; the weekly goal 4 and 12 weeks in a row; every day of
  one week. Each reached one is a gold-ringed medal with the day it was reached, newest first; the two nearest next show
  a bar with how far ("6 h 20 min of 10 hours").
- Worked out on the phone (lib/milestones.ts) from `practice_history(student)`, every practice day ever (practice_days
  stops at a year). The weeks in a row use the student's goal of today. A reached milestone stays (the history only
  grows; an entry deleted within its 14 days may take one back).
- **No points, no ranking, no leaderboard, nothing compared between children,** and no "lost" wording.

**Why.** Children like a small celebration of steady practice; comparing them would show one child's data to others and
is not the class's spirit (research note: "Not recommended").

**Consequences.** Nothing new is stored. Without 0056 the milestones are simply left out.

## 494. "How did it go?" after a practice session — 22 Oct 2026

**Status: branch `practice-extras`; migration 0056 (`practice_logs.feeling`, `practised`, `set_practice_feeling`).**
Shortlist item 11.

**Decision.**
- After Stop and save of the practice timer, a card: **three faces (Hard, Okay, Good)** and **"What did you practise?"
  Taal / Lesson / Free practice** (Taal ticked at first when the timer played a taal). **Tapping a face saves at once**;
  a chip changed after that saves again; **Skip** is one tap and saves nothing. The typed-in entry (My practice log) has
  the same faces and chips, optional.
- Saved on that practice entry: `feeling` 1-3 and `practised` (taal, lesson, free), only through
  `set_practice_feeling` — the student, an own entry of the last 14 days (as Delete). Read as practice entries are: the
  student and staff. Staff see it on the Student profile ("how the sessions of the last 4 weeks went": Good / Okay /
  Hard counts) and in the practice-this-week list (#495).
- The faces are drawn (SVG), not emoji, so they look the same on every phone and follow light and dark.

**Why.** A coordinator can spot a child who keeps finding practice hard and call with help, not a reminder.

**Consequences.** **New data about minors (a self-rating):** the privacy notice's "Learning" row must name it before the
update that asks it reaches phones. Nothing is asked again after Skip.

## 495. Staff: practice this week per student, least first — 22 Oct 2026

**Status: branch `practice-extras`; migration 0056 (`staff_practice_week`).** Shortlist item 12.

**Decision.**
- A staff screen "Practice this week" (button "Students' practice this week" on Practice tools, Guru and coordinators):
  each student still in the class with that week's minutes and days against their goal, "Weekly goal met", the last day
  they practised and the week's Good / Okay / Hard; **least practice first**; a row opens the Student profile. This
  week, last week or two weeks ago; filters My students (mentees) and level.
- **Scope = the Students tab's:** staff see the whole class (row-level security gives staff every student's practice;
  no student list in the app is scoped by centre). The function runs as the caller (security invoker), refuses anyone
  who is not staff (`not_allowed`), and leaves out students who left, withdrawn records and the caller's own record
  (0053).
- "Goal met" here is a guess from the week's days and total minutes (the list has no minutes per day).

**Why.** Coordinators already read each child's practice on the profile; one list sorted for follow-up calls saves
opening every profile, and starts with those who may need a kind word.

**Consequences.** Nothing new is stored. Nothing of this list is shown to students.

## 510. A login waiting for the desk may already practise — 23 Oct 2026

**Status: branch `onboarding-offline` (world-class audit 22-10-2026 fix 8, work package E); migration
0057_practice_while_waiting.sql. JS only (OTA + web), fingerprint 23dc7e4a unchanged.**

**Context.** A signed-up person is `pending` until a coordinator accepts them at the temple, and until then could open
only the waiting page, About you and Ishtagoshti: no metronome, taal player, lesson or mantra, so the app gave nothing
before the first class (audit 2.1, onboarding 4/10).

**Decision.** The waiting page shows **"While you wait"** with three rows: **Practice tools** (metronome and taal player:
`PracticeTools area="waiting"`, the tools only, no timer, log, plan, goal or reminder, which belong to a student's
record), **Mantra before practice** (the reader of #405) and **Beginner lessons** (the approved lesson videos of the first
level by `levels.sort`, opening the V3 player). Routes `src/app/waiting/` under the `pending` guard. The database
decides: `practice_while_waiting()` returns the first level's id for a login that may, else null, and three new read
policies `waiting_read` (taals and mantras switched on, Beginner videos: YouTube or the team's own file, no PDFs or
photos, so Storage is untouched) sit beside the existing ones; nothing is written and no existing policy changes. The
app asks the function first and shows nothing before 0057 (PGRST202).

**Why.** Duolingo-style value before the desk: a newcomer can learn the first bols and taal at home and comes to the
first class already practising, and the class content is not personal data.

## 511. Practice while waiting gives class content only — 23 Oct 2026

**Status: as #510.** The waiting login reads the taals and mantras switched on and the Beginner videos, and nothing
else: the smoke test sweeps every table and view as that login (own profile and the open group names aside, as for any
pending login) and every write. It logs no practice (`log_practice` still refuses), so no minutes, timer or history
exist for it; once the desk accepts it, it is a student and the student rules apply (`my_role()` = student, the function
then answers null). The "may practise" answer and the Beginner lessons list are kept on the device for offline use, per
login, and forgotten at sign-out with the other traces (#186).

## 512. Who may practise while waiting: an adult by the sign-up's date of birth, or a child after the parent's consent — 23 Oct 2026

**Status: as #510.** Under the DPDP Rules read strictly (#399) nothing beyond the sign-up is processed about a child
before verifiable parental consent. So `practice_while_waiting()` counts only a pending login (active, no student record,
not a door tablet) that is **not** a public Ishtagoshti subscriber (their own area) **and** either has a sign-up date of
birth 18 or more years ago **or** has a parent's consent recorded by email (0051 `minor_signups.consented_at`). A child
waiting for the parent, and a login with no date of birth (age unknown: an old sign-up, or a minor's date dropped
before 0051), get nothing and see no "While you wait". Reading class content records nothing about the person; the rule
is strict anyway, so the app never has to judge an age it does not know.

## 513. The web version keeps itself offline with a service worker that never touches anyone's data — 23 Oct 2026

**Status: as #510 (audit fix 7, work package D; closes LA-12 / Q-5).** Web only; the phone app keeps itself already.

**Decision.** `scripts/service-worker.js` is a template; `npm run export:web` writes `dist/sw.js` with the build id and
the list of the site's own files (the page as `/`, scripts, fonts, icons, manifest; never `version.txt`, `_headers`,
source maps, Expo's metadata or the QR reader's WebAssembly) and checks it parses. The worker keeps those files at
install (one cache per build; a new build replaces the old cache when it takes over), serves the build's files from the
device, and the page network-first with the kept copy after 4 s or offline. **It never answers a request to another
host** (Supabase, YouTube): not even passed through, so a slow or missing network behaves exactly as without a worker
(the trap of the test-only stall workers of October). What a member sees offline (My QR, practice tools, the mantra,
the Beginner list) is what the app already keeps in localStorage (#21, #37, #405, #511). `src/lib/offline-shell.web.ts`
registers it only in an exported build (NODE_ENV production) on a secure origin, after a sign-in (`keep` adds missing
files); at every sign-out (lib/device-traces.ts) and whenever the app starts signed out it posts `forget`, unregisters
it and deletes every cache it made. `_headers`: `/sw.js` is `Cache-Control: no-cache`; the CSP is unchanged (it already
allowed `worker-src 'self'`).

**Why.** Most members use iPhones (#1) and could not open My QR without a signal. Keeping only the public app files,
the same for everyone, means nothing personal is ever in the cache, and the clean-up at sign-out leaves nothing on a
shared phone.

**Consequences.** The first visit still needs the network. A video lesson needs the network (YouTube). Tested in a
sandbox (`app/tests/offline-shell.test.mjs`) and in the browser on a local copy of the TEST export.

## 514. A shorter sign-up; the rest in About you; /sign-up opens itself — 23 Oct 2026

**Status: as #510 (audit fix 9).** The sign-up asked up to 12 fields. It now asks the **name as on the ID, email,
password (one box with the eye; no "type it again"), date of birth, the privacy-notice tick**, and the centre only when
the class has more than one (one centre is chosen by itself). **Under 18 the parent's name, relation, email and mobile
stay** (0051). The **Diksha name, mobile number, gender and instruments** moved to About you, which opens once after the
first sign-in and already asks them (#164); the desk's Accept needs only the name, date of birth, tick and confirmed
email (0046-0048), and `handle_new_user` already treats the moved fields as optional, so no migration. A child is told
the rest is recorded at the desk after the parent's consent. **Deep links:** `/sign-up` and `/forgot-password` opened
the sign-in page because `requested-path.belongsTo` knew no signed-out screens; they now open themselves, so the
website's "Register" can link straight to Create an account. A waiting login's `/waiting/...` links work too.

## 530. A weekly email to the parent about their child's week at the class — 23 Oct 2026

**Status: branch `parents-digest` (audit 22-10-2026 work package H, fix 19; the lead's brief of 23 Oct 2026 under
Praveen's delegation). Migration 0058, Edge Function `notify-parents` (deploy), JS-only app (fingerprint 23dc7e4a).
Off until the Guru switches it on (#534), and then only to parents who said yes (#531).**

**Context.** The world-class audit scored the parent experience 3/10 (§2.14): parents have no login and hear nothing
except an optional check-out email (#224, #246, off) and the consent code of a home sign-up (#399). ClassDojo-class
apps give parents a regular picture of the child's progress in their language.

**Decision.** Once a week, from Sunday 20:30 India time, a short email to the parent of each active student under 18
who agreed to it: that week's visits (days, check-in and check-out times), practice minutes and days against the goal,
newly ticked syllabus items, a level change, and the next event for the child (#532); in the parent's language
(en / te / hi: the guardian's `notice_language`, set on the student's page, else the child's app language). Warm,
devotional and short ("Hare Krishna", a kind line for a quiet week, praise when the goal is met, "Thank you for
supporting <name>'s seva"). Sent by `notify-parents` through Brevo, with a dry run without `BREVO_API_KEY`, a one-click
Unsubscribe of its own and staff's "Send again" (#535). Queue `parent_digests`, job `mridanga-parent-digests`.

**Why email, weekly.** No parent login, no new role, no APK; Brevo's free plan; once a week is useful without being
noise. A parent app or web page stays a separate, larger project (audit gap 3, announcements for parents, is not
in this package).

## 531. Opt-in: the parent's own written yes, recorded as a consent with scope `digest` — 23 Oct 2026

**Status: approved by the lead on 23 Oct 2026 (decision under Praveen's delegation of 23 Oct): opt-in per guardian, consent
scope `digest` recorded at the desk from the parent's written yes (form line D); nobody gets one until then.**

**Context.** The check-out email is opt-out under the class data consent, with the line on the paper form (#227,
#230, #247). The weekly email carries more (practice, progress, events): a purpose of its own. The DPDP Act asks
consent to be specific to a purpose (s.6(1)); the Rules are read strictly, without a lawyer (#399).

**Decision.** Opt-in. A guardian gets the weekly email only with a `consents` row of scope **`digest`** (new value in
the scope check) on the student: the parent's written yes (form line D below), recorded at the desk by a coordinator
or the Guru (`set_guardian_digest`: method `written`, signed form, verified by the caller, now, the notice version
shown). One address, one choice: a yes on any guardian row of the student with that email counts. The data consent
alone is not enough, and a minor without a current data consent gets nothing either. A child of a home sign-up
(#399) is no different: once accepted, the parent's yes is recorded at the desk the same way (the parent's ID was
seen at Accept). No email is ever sent to ask for the yes (that would use the address for the new purpose first).
No new personal data: the yes is a consent record.

**Withdrawal** is as easy as giving (s.6(4)): the email's one-click Unsubscribe or "Stop the weekly email" at the
desk sets `revoked_at` (the record stays as proof); `withdraw_consent` revokes it with every other consent; an
erasure deletes it with the record.

**Form line D (draft en, for the team and the paper form; te/hi follow the form's other lines):**
> *Weekly email (optional).* Once a week we can email you a short summary of your child's week at the class: the
> days and times they came, their practice at home against the goal, what they newly learnt, a level change, and
> the next class event. It never includes your child's location or photo, or anything about another child. You can
> stop it at any time with the Unsubscribe link in the email or by telling the class desk.
> ☐ Yes, please send me the weekly email. Parent's email: ________

## 532. What the weekly email says, and what it never says — 23 Oct 2026

**Decision.** `parent_digest_content(student, week)` returns only: the home centre and level; each visit of the week
(Monday-Sunday) with its day and check-in / check-out time at the centre ("no check-out recorded" when open); practice
minutes, days practised and days at the goal's minutes against the goal (the student's own, else the level's, else
4 x 15, as `practice_days`); the titles of items ticked that week (at most 8, and how many more); a level change that
week; the next event for the child within 31 days (`audience_students`; title, day, time, centre). **Never** a
location, distance, area flag or photo (#212), a mark, a remark, a call note, an event's `place` text, or anything
about another child (each email is about one child; a sibling gets their own). The child's full name as on the record
(#228); level names in the parent's language. The queue holds ids and outcomes only: the text is built when it goes.

## 533. When it goes, and the daily ceilings shared with every parent email — 23 Oct 2026

**Decision.** India time throughout. The job (every 5 minutes) queues the week from Sunday 20:30 to Monday 20:30
(a late run catches up; never twice for a week); emails go only between 07:00 and 21:30, at most 10 a run; a digest
not sent within 48 hours expires. Ceilings: **100 digests a day** and **240 parent emails a day for the whole app** —
consent codes (0051), check-in / check-out notices (0043) and digests counted together (`app_parent_mails_today`),
which leaves about 60 of Brevo's free 300 for sign-up confirmations and password resets. The digest yields: it
claims only what is left under both. Outcomes as for notices: `sent`, `skipped` (dry run), `switched_off`, `stopped`,
`not_eligible`, `expired`, `gave_up`, or Brevo's refusal; rows kept 30 days. The notices' own cap (200, #229) and the
consent codes' (60) are unchanged.

## 534. The Guru's switch is a function, not a G10 box — 23 Oct 2026

**Decision.** Setting `parent_digest_enabled` (false), changed only by `set_parent_digest(on)` (the Guru; the change
is in the audit log through `audit_setting`, with who). The screen "Weekly email to parents" (from G10's "Emails to
parents") holds the switch, asked twice (#332). Switching off ends every waiting digest at once (`switched_off`).

**Why not a G10 checkbox.** That needs `guard_setting` to know the key, and `guard_setting` is replaced by several
branches at once (0048, face-scan's 0070): a second copy would silently drop the other's keys. Written by a security
definer function, the key passes the guard; a direct update of it from the app is refused (`setting_unknown`), so the
switch has exactly one door.

## 535. Staff: the parent's yes, Stop, Send again, who gets it — 23 Oct 2026

**Decision.** On the student's page, under each guardian of a minor (after the attendance-email line): why no weekly
email goes, or "Gets the weekly email" with the day of the yes and the last one sent (`guardian_digest_status`);
"Parent signed the weekly-email line (D)" (asked twice; `set_guardian_digest(on)`), "Stop the weekly email (parent
asked)", and "Send the weekly email again" (`resend_parent_digest`: the latest week once more, one per parent in
24 hours, within the sending hours and ceilings). Coordinators and the Guru, like the attendance-email switch (#227).
The overview (`parent_digest_overview`, staff) counts parent addresses that would get it (as if on) and why the others
do not, the latest week by outcome, today's emails against both ceilings and the job's last answer.

## 536. The preview is built by the Edge Function that sends — 23 Oct 2026

**Decision.** "Preview the weekly email" (student's page) opens the screen with that student: the app calls
`notify-parents` with the person's own sign-in and `{preview: <student>}`; the function runs `preview_parent_digest`
**as that person** (staff only, checked in the database) and returns the email built by `digest.ts`, the code that
sends it, in each guardian's language (or one chosen), with each guardian's reason for none. Nothing is sent; CORS is
open on that path only. Until the function from this commit is deployed, the screen says the preview is not
available yet.

**Why.** "Exactly what a parent would get" can only be promised by the sending code itself; a copy of the template in
the app would drift.

## 537. Withdrawal, erasure, Unsubscribe and the switch stop it at once — 23 Oct 2026

**Decision.** Every claim re-checks each waiting row (`parent_digest_block`) right before the email is built, so a
withdrawal (`withdraw_consent`), a revoked data consent, a stopped yes, a student who left, paused or turned 18, or
the switch going off ends the row (`not_eligible`, `stopped`, `switched_off`) and nothing is sent. Erasure deletes the
rows with the record (cascade). The digest's Unsubscribe link is signed for its own purpose (`?stop_digest=`, HMAC of
"parent-digest-stop:<guardian>"): it cannot stop the check-out emails, and their link cannot stop the digest.

## 538. Before the Guru switches on the check-out emails at LIVE (fix 20) — 23 Oct 2026

**Decision.** The check-out emails (#246) stay off on LIVE until every item of OPERATIONS "Parent notices by email" →
"Before switching on at LIVE" is true: the paper form in use carries line E (#247, check-out wording) in the
parent's language; parents of current minors who signed an older form without it are stopped per guardian until
they sign it; the privacy notice says what parents receive and lists Brevo for these emails; the sender, reply-to
and class contact are set; one test email went to a team member's test record and its Unsubscribe was tried.
Praveen (or the Guru) switches; the lead records it in OPERATIONS.

## 539. Parent wording, and the lines the privacy notice needs — 23 Oct 2026

**Decision.** The email texts are in `supabase/functions/notify-parents/digest.ts`; English is the reference, Telugu
and Hindi are drafts for native review (docs/TRANSLATIONS.md), as #228. The privacy notice (notice 1.0, another
work package; this branch does not change the notice or its version) needs: a purpose "Telling parents about their
child" (check-out email, opt-out, line E; weekly email, opt-in, line D); a short "What parents receive" section; the
Brevo row extended to these emails; retention "records of parent emails (no text): 30 days".

## 550. My data and rights in the app — 23 Oct 2026

**Status: branch `data-rights` (migration 0059); the lead decides under Praveen's delegation of 23 Oct 2026 ("take
decisions … score full vs world class").** The world-class audit of 22 Oct 2026 (§2.10, fix 17) found no data-principal
self-service: access, correction, erasure, withdrawal and complaints worked only by emailing the team, and the Guru ran
`withdraw_consent` / `erase_student` / `erase_login` in the SQL editor, which the lead cannot do on LIVE and which is
error-prone for a volunteer.

**Decision.** My profile has **My data and rights** (`student/my-data`, `staff/my-data`) for students and for staff with
their own login. (a) **A summary of my data** from `my_data_summary()`: the sign-in account, the student record (no QR
token), About you, parents, every consent with its scope, how it was given, the date, the kind of ID seen and the notice
version, the level and status history, visits, practice, and counts of the rest (ticks, follow-up calls, assessments,
events, loans, phones, notices, replies, answers, votes), the processors of the privacy notice (the app's list is tested
against the notice's table), and the person's own requests. Each read goes to the access log. It downloads as JSON
(phone: the share sheet through expo-sharing, already in the APK; web: a download) and prints or saves as a PDF in the
web app (an escaped page under `<body>`, as the label sheets). (b-e) **Ask us**: correct something (the field and what
is wrong), withdraw the photo consent (offered only while one is current), withdraw consent (the record), erase, name a
nominee (DPDP Act s.14), make a complaint; each with a plain warning of what stops. Each becomes a row in
`data_requests` with type, status, made / answer-by / closed times; the person sees where it stands and the answer, and
may take an open one back. One open request per kind, at most 5 a day.

Not in the app yet: a waiting login or an Ishtagoshti subscriber (no My profile) asks by email and the Guru records it;
the summary refuses them (`not_allowed`) because the database sweep forbids a function answering a subscriber with data.

**Why.** DPDP Act ss.11-14 and Rule 14 want the means to exercise the rights published and usable; GDPR Arts. 15-20 the
same for EU/UK residents. In the app the rights are as easy as the consent was to give (s.6(4)), every request has a
reference and a clock, and nothing depends on the Guru reaching the SQL editor.

## 551. Every data request is answered within 30 days — 23 Oct 2026

**Decision (lead, under Praveen's delegation).** `answer_by` = made + **30 days** for every kind. The Gurus get a notice
when a request is filed (no name in the phone's bar) and once more three days before the date (job
`mridanga-data-requests`); the To do list shows open requests first, amber at three days or less. (The phone push needs
`notify-announcements` deployed with its new screen list; before that the notices reach the inbox only.) The privacy notice
already says "We reply within 30 days", with a [[TEAM]] blank to confirm: this confirms it.

**Why 30 and not more.** Rule 14(3) allows a grievance period of up to 90 days; GDPR Art. 12(3) gives one month. The
stricter reading (#399) is the shorter one, and a class of ~100 people can meet it. A withdrawal should be carried out
much sooner (s.6(6) "within a reasonable time"): the runbook asks for it in days, the 30 days are the outer limit.

## 552. A child's requests come from the parent, at the desk or by email — 23 Oct 2026

**Decision.** A record under 18 (`is_minor`) cannot file in the app (`parent_asks`): the child reads their summary and
is told that their parent or guardian asks, at the class desk (the coordinator sees the parent's ID, as at Accept,
Rule 10) or by email from the address the class has for them. The Guru records it on Data requests ("Record a request":
roll number, desk / email, asked by parent / guardian, what was checked); `record_data_request` refuses "the person
themselves" for a child. What a parent or the desk recorded is not shown to the child (the person reads only requests
they made). A child's home sign-up that has no record yet (0051): the parent writes from the address that got the
consent email, the Guru records it with the child's sign-in email and erases with `erase_login`. A parent request
through the consent page is **not built**: it needs a second parent-code channel (sending, hashing, limits as 0051)
for a case the 30-day expiry and the email path already cover.

**Why.** DPDP s.9 and Rule 10: the parent acts for the child, and the class must check that the person is the parent.
The desk check is the one already used for consent.

## 553. How long data requests are kept — 23 Oct 2026

**Decision.** A request's text (`field`, `body`, `answer`) is blanked **one year after the request closed**, with its
audit-log copies (`audit_redact`); the bare row (kind, status, dates, reference) is deleted **two years after it
closed**. Open requests are never purged. After an erasure carried out from a request, the request keeps only its type,
dates and reference at once (the person asked to be forgotten; the tombstone in `erasures` holds the reason).

**Why.** Rule 8(3) keeps logs of processing for at least a year; the request is the proof that a right was honoured
and may be questioned before the Board. Two years is the audit log's own upper limit in the notice.

## 554. The Guru acts on a request in the app, with the roll number typed — 23 Oct 2026

**Decision.** Data requests (`staff/data-requests`, Guru only; coordinators read no request and can neither record nor
act: tested). A request is answered in words (done, with "I corrected the record" for a correction, or refused) or,
for a withdrawal or an erasure, carried out by `act_on_data_request`: the Guru types the person's **roll number** (or,
for a login without a record, its email) and a note (the answer and the reason, 1-500). The action must fit the request
(`action_not_for_kind`); "done" on a withdrawal or erasure is refused (`use_the_action`). Photo withdrawal revokes the
current photo consents (the app keeps no student photo: `photo_path` is unused); data withdrawal runs
`withdraw_consent` (note `DR-…: …`). Everything is audited (`audit_row` on `data_requests`, plus the functions' own
audit rows). A request made in the app sends the person a notice when it is answered.

**Why.** A typed roll number is the confirmation the audit asked for, the database checks it too, and the SQL editor
stays only for the owner.

## 555. An erasure from a request keeps its reference — 23 Oct 2026

**Decision.** Erase runs `erase_student(record, note, 'DR-…')` for a person with a record, else
`erase_login(login, note, 'DR-…')`; the tombstone in `erasures` carries the request's reference, and the request
stays (done, no person, no text). Every key from `data_requests` to a person is `on delete set null`, so the erasure
cannot be blocked or cascade the proof away. A staff login without a record is not erased here (`not_pending`):
`anonymise_staff` in the SQL editor (OPERATIONS "Staff who leave"). The private erasure register (Backups → Restoring,
step 5) still gets the roll number and the reference: a restore from an older backup would bring the person back.

## 556. Lines the privacy notice needs for 0059 — 23 Oct 2026

For the privacy-notice 1.0 work (website/content/*/privacy.html is not edited on this branch):
1. **In short**: "You can see and download your data in the app (My profile → My data and rights) and ask there to
   correct or delete it, withdraw your consent or complain; or write to {{email:privacy}}."
2. **Your rights**, after the list: "In the app: My profile → My data and rights shows what we keep about you and lets
   you download it; there you can also ask for a correction or an erasure, withdraw a consent, name someone to act for
   you, or make a complaint, and see our answer." Replace "[[TEAM: confirm the reply period]]" with: "We answer every
   request, complaints included, within 30 days."
3. **Children**: "For a student under 18 the parent or guardian makes these requests: at the class desk, where we see
   their ID first, or by email from the address the class has for them. The child can read their own data in the app."
4. **Withdrawal**: "Withdrawing your consent freezes your record and switches your sign-in off; withdrawing the photo
   consent only stops photos."
5. **How long we keep data**: "Data requests: the text one year after we answered, the request itself (type and dates)
   two years; after an erasure only its type, dates and reference."
6. **Who can see it**: "Data requests are read only by the facilitator (Guru); reading your own summary is logged."
7. **Complaints**: "Use My data and rights → Make a complaint, or write to the privacy contact."
Bump the notice version when these go in (#150): the app's `PRIVACY_NOTICE_VERSION` and `site.config.mjs` together.

## 570. Privacy notice 0.3-draft: the lines for 0056-0059 go in before the release that asks for the data — 24 Oct 2026

**Status: branch `claude/privacy-1-0-633d76` (audit 22-10-2026 work package C, step 1); lead approval needed. Website
en/te/hi + `PRIVACY_NOTICE_VERSION`; JS only, fingerprint 23dc7e4a unchanged.**

**Decision.** The notice gets, in en/te/hi (te/hi drafts for the native review), before the LIVE release of 0055-0059:
- **Learning** row (#494): "how a practice session went (hard / okay / good) and what was practised, if the student
  chooses to say it" (te/hi use the app's own face labels).
- **Parents** (#539): the parents' row names the weekly-email yes (a consent record of its own) and the record of each
  email sent (when, kind, outcome; never the text); a purpose "Telling parents about their child" (check-out email,
  opt-out under the class consent; weekly email, opt-in, separate consent); a new section **What parents receive**
  (`#parents`: consent email, check-out email, weekly email, what each holds and never holds, how to stop it); the
  Brevo row covers these emails; retention "records of emails to parents (no text): 30 days"; a line in In short.
- **Data rights** (#556 lines 1-7 as worded there): In short, Your rights (in-app line; "We answer every request,
  complaints included, within 30 days" replaces the reply-period blank, #551), Children, withdrawal, retention of
  requests, who reads requests, complaints; plus a row **Your requests** in "What the app keeps".
- **Practice while waiting** (#510-#512): one paragraph "While you wait for the desk": practice tools, mantra and
  Beginner lessons before registration, an adult by the sign-up's date of birth, a child only after the parent's
  consent; using them records nothing. (The web service worker of #513 keeps only the site's own files: no line.)

The version goes **0.2-draft → 0.3-draft** (dated 2026-10-24) in `site.config.mjs` and `PRIVACY_NOTICE_VERSION`
together: the meaning changed, so consents recorded from this release name the text they were given under. It stays a
draft: the D4 blanks are closed in step 2 (notice 1.0).

**Why now.** #494 asks for a self-rating of minors and #531 for a new purpose: the notice must name both before the
update that asks for them reaches phones (DPDP Act s.5, notice before or with the request for consent).

## 571. Privacy notice 1.0: the strict reading of the Act and Rules stands in for a legal review; translations — 24 Oct 2026

**Status: branch `claude/privacy-1-0-633d76` (audit 22-10-2026 fix 5, work package C); lead approval needed.**

**Decision.** The notice is **version 1.0** (website `privacyNotice` and `PRIVACY_NOTICE_VERSION` together, dated
2026-10-24; re-date it to the publish day if it ships later). The "[[TEAM: legal review before the class opens]]" line
is replaced by what is true (Praveen, 21 Oct 2026, #399: no lawyer; the Act and the Rules are followed, the stricter
reading where one is open): "It follows India's Digital Personal Data Protection Act 2023 and the DPDP Rules 2025;
where a rule can be read in more than one way, we follow the stricter reading." The page is **final**: a new page
option `final: true` (website/src/site.mjs, build.mjs) drops the Draft note and the noindex on the privacy page only,
because the rest of the site keeps `draft: true` (its own [[TEAM]] blanks: classes 7, contact 3, home 2, join 1 per
language, and the domain is not attached yet).

**Translations.** "This notice is in English, Telugu and Hindi, and you may read it in any of them. If a translation and
the English text differ, the meaning that protects you more applies; please tell us, and we correct the translation."
Not "English prevails": DPDP Act s.5(3) gives the person the notice in their language, and a parent who consented on
the Telugu text must be able to rely on it. te/hi stay drafts for the native review (docs/TRANSLATIONS.md).

**Why.** Real people, children included, consent to this text every day (audit §2.10); a notice with "proposal, not
agreed" blanks is not a notice. One blank stays, a fact only the team can read: the Zoho data centre (#575).

## 572. Retention (D4-07): the periods, kept by the database every night — 24 Oct 2026

**Status: as #571; migration 0060 (`retention_daily`, job `mridanga-retention`, 02:45 IST); lead approval needed.**

**Decision.** DPDP Act s.8(7): erase when the purpose is no longer served (or consent is withdrawn), unless the law
asks to keep it; Rule 8(3): logs at least a year. The periods (the audit's proposal, made true, and enforced, not
promised):
- a student who **left**: erased two years after the last change to Left (`erase_student`, reference `retention`);
- a **sign-up the desk never registered**: erased 180 days after sign-up (`erase_login`), not an Ishtagoshti reader
  (their own area, kept while they read; leaving deletes the details, 0027) and not a child's sign-up (0051's job: 30
  days without consent, 180 after). The draft's "logins never linked: 30 days" was wrong: staff and Ishtagoshti logins
  are never linked to a student, and the waiting list already shows sign-ups for 180 days (#399);
- a record whose consent was **withdrawn**: 30 days after (#573);
- **phones** that have not opened the app for 90 days: push tokens deleted (the app registers again when it starts);
- **change log** (`audit_log`): two years; **access log**: 400 days (0034, unchanged); **in-app notices**: a year
  (0015); parent email records 30 days (0043/0058); data requests as #553;
- by hand (OPERATIONS "Retention"): **paper consent forms** destroyed when the record is erased; **emails to the
  team** a year after the matter is closed (a data request: as #553); **backups** the last 8 weekly copies.
After an erasure only the tombstone stays (roll number, date, reason, reference), so numbers are never reused and the
erasure can be shown. An erasure the job cannot do (an instrument still lent out: `open_loan`) is skipped and tried the
next night. Nothing on LIVE is old enough on 24-10-2026 (class since 20-10-2026; app since 28-09-2026).

**Why automatic.** A promise that depends on a volunteer remembering is not kept; the stricter reading of s.8(7) is
that the fiduciary erases, not that the person must ask.

## 573. A withdrawn record is erased 30 days after the withdrawal — 24 Oct 2026

**Status: as #572; changes #75 ("freeze, erase later"); lead approval needed.**

**Decision.** `withdraw_consent` still freezes at once (sign-in off, consents revoked, nothing new recorded). The
retention job then erases the record **30 days** after `withdrawn_at`, unless consent was given again (OPERATIONS
"Consent withdrawal": `withdrawn_at` cleared). The Guru may erase sooner (Erasure request). The app's words follow:
My data and rights → Withdraw my consent, and the Student profile's "Consent withdrawn" note (en/te/hi).

**Why 30 days.** s.6(6) and s.8(7)(a): processing stops and the data is erased within a reasonable time after
withdrawal. Freezing indefinitely (#75) kept a child's data with no consent behind it. 30 days leave room for a
mistaken or hurried withdrawal (a parent changes their mind; a desk error) and match the 30-day answer of #551.

## 574. Who sees parents' details (D4-09): every coordinator, every read logged and checked monthly — 24 Oct 2026

**Status: as #571; no code change; lead approval needed.**

**Decision.** Kept as built (0034, #146-#151): coordinators and the Guru read a student's parents, consents and call
notes through `get_guardians` / `get_consents` / `get_call_notes`, each read written to `access_log`, which the Guru
reviews monthly (OPERATIONS "Reviewing the access log"). The notice says so in plain words: any coordinator on duty may
need to call a parent; each opening is written down and the facilitator checks the log every month.

**Why not mentor-plus-Guru (#151 option 1).** A child's follow-up call (C11) and an emergency at the class go to
whoever is on duty, not only the mentor, and many students have no mentor yet. DPDP Rules 2025 Rule 6 asks for
appropriate access control and logs of access; per-read logging, monthly review and, from 0061, staff sign-in codes
(#580-#584) meet it without stopping the desk. 0060 does not touch these functions (0061 redefines them).

## 575. Services and transfers abroad (D4-12): the table is the complete list; the Zoho fact stays with the team — 24 Oct 2026

**Status: as #571; lead approval needed.**

**Decision.** The notice's processor table (Supabase Sydney, Expo USA, Firebase Cloud Messaging, Brevo EU, Cloudflare,
Zoho Mail, YouTube) is declared **complete**, plus one line for the encrypted weekly backups in the team's private
cloud storage (unreadable without the password; added to OPERATIONS's register with the provider as a team blank).
DPDP Act s.16: transfer is allowed except to a country the Government restricts by notification; the notice says we
check that list before using a service and stop using one in a listed country, and that a new service is listed, with a
new notice version, before it receives data. EU/UK: standard contractual clauses or adequacy, as before.
**Left for the team (a fact, not a decision):** the Zoho Mail data centre (`[[TEAM: confirm the Zoho data centre]]`,
one per language): Zoho Mail admin → Organization shows it.

**Found on the way (for Praveen, urgent):** on 24-10-2026 public DNS for mridangaseva.com has only Zoho's name servers
and **no MX record** (checked with 1.1.1.1 and 8.8.8.8), so mail to privacy@ / info@ cannot arrive, yet the notice, the
app's data-rights screen and the Ishtagoshti parent email name privacy@ as the contact (Rule 9 / s.8(10)). The phone
number in the notice works meanwhile. The mail records (Zoho MX, SPF, DKIM) must go in before the website upload.

**Not in this list yet:** the face scan's Google Play Integrity check (branch face-scan, not on main). Its merge needs
a notice line and a new notice version (biometric data, #248), per this rule.

## 576. The reply period is 30 days; emails to the team are kept a year — 24 Oct 2026

**Status: as #571.** "We answer every request, complaints included, within 30 days" (#551, #556 line 2) replaced the
reply-period blank in 0.3-draft (#570). Emails to the team: deleted a year after the matter is closed; an email that is
a data request is kept as data requests are (#553). Why a year: long enough for a follow-up question or a complaint to
the Board about our answer, and as long as a request's text (#553); shorter would lose the context of an open matter.

## 577. The app asks again when the notice changes; at 18, the student's own consent — 24 Oct 2026

**Status: as #571; migration 0060 (`notice_acceptances`, `privacy_notice_ask`, `accept_privacy_notice`); JS only (OTA),
fingerprint 23dc7e4a unchanged; lead approval needed.**

**Context.** The audit's fix 5 asks to "bump the version so the app asks again", but nothing in the app asked: the
version was only recorded on new consents. And the notice promised "At 18, a student is asked to give their own
consent" with a [[TEAM: confirm]]: nothing did that either.

**Decision.** On the homes (S1, C1, G1) a card under the band, once per notice version, until answered; nothing is
blocked meanwhile:
- **an adult** (a student 18 or over by the record's date of birth, or staff): "Our privacy notice has changed", the
  notice link, a tick "I have read the privacy notice and agree" and Agree → `accepted` for that version;
- **a student registered as a child who is 18 now** (current data consent is a parent's, never agreed themselves):
  "You are 18 now: your own consent", the same tick; the text says how to withdraw instead → `accepted`. Until then
  the parent's consent stays the basis and the student may withdraw it themselves (the notice says so);
- **a student under 18** (or no date of birth): "please show it to your parent or guardian" and Done → `shown`. The
  parent's consent remains the basis; the purposes it covers did not change (a new purpose waits for its own
  consent, as the weekly email did, #531).
A waiting login, an Ishtagoshti subscriber and a door tablet are not asked (they ticked the notice of their sign-up;
they have no home with the card). Before 0060 the card stays hidden (the call fails). `my_data_summary` does not list
these rows yet (a follow-up for the next 0059 change).

**Why.** s.5 and Rule 3: the notice comes with the request for consent; a material change is given to the person,
not only posted. An announcement (the old line) is easy to miss; a card with a tick is the same act as at sign-up.

## 578. The Ishtagoshti parent email gets its real text; minors' Ishtagoshti stays off — 24 Oct 2026

**Status: as #571; migration 0060 (`ig_send_parent_code` replaced); audit fix 21; lead approval needed.**

**Decision.** The parent email (0027/0054, "[TEST - …]") now says, in the child's app language (en, te, hi; te/hi
drafts): who asked and the year of birth; what is kept (the child's name, email, year of birth, optional phone; the
parent's name, email and relation; notes and memorised slokas), for what (reading the slokas), who sees it (only the
facilitator; nothing to other members, no advertising); that **giving the code declares the parent is the child's
parent or legal guardian and 18 or over, and consents**; how to withdraw (Leave Ishtagoshti in the app, or
privacy@); the notice's address in that language; the code and its 24 hours. Limits unchanged.

**Not switched on.** Ishtagoshti for a minor stays closed: `IG_JOIN_FOR_WAITING` is false, the app's join texts are
still placeholders ("TEST —", `IG_TERMS_VERSION` placeholder-2026-10), and LIVE's Vault has no `mridanga_brevo_key`.
Read strictly, Rule 10(1) wants reliable details of the parent's identity and age; an emailed code and a declaration
alone are the "email only" route #399 rejected for the class (there the parent's ID is seen at the desk). **For the
lead:** before minors' Ishtagoshti opens, either require the same ID sighting at the desk (#399) or keep Ishtagoshti
18+ only. Until then this text only replaces the placeholder that OPERATIONS would otherwise send.

## 579. Lines from the parallel work packages, and what the notice still waits for — 24 Oct 2026

**Status: as #571.** In notice 1.0 (en/te/hi) ahead of their merges, at the lead's request:
- **#585 / #586 (staff-mfa, 0061): app errors.** Security: "When the app breaks, we keep, for 30 days, the kind of
  error, the screen and the app version, never who it happened to." Staff sign-in codes need no line.
- **#593 / #595 (bundle-door-queue): entries kept offline.** What the app keeps → "On your phone": "If you check
  someone in or log practice without a connection, the app keeps that entry on the phone until it is sent (a check-in
  until the end of that class day, practice at most 14 days), then deletes it; signing out deletes it too."
If either work package changes what it keeps before it merges, its line changes with it. The face scan (#575) and
minors' Ishtagoshti (#578) each need their own notice change and version before they ship.

## 580. Staff sign in with a code from an authenticator app (TOTP) — 24 Oct 2026

**Status: branch `claude/staff-mfa-72bdd5` (migration 0061); the lead decides under Praveen's delegation of 23 Oct 2026.**
The world-class audit of 22 Oct 2026 (§2.9, fix 16) found no second factor for staff: a Guru or coordinator password
alone reads every child's record, parent phone and consent. **Decision.** Gurus and coordinators may set up a
sign-in code in an authenticator app (Google Authenticator, Microsoft Authenticator, Authy …) on My profile → My
sign-in code, with **Supabase Auth's own MFA** (TOTP factors in `auth.mfa_factors`, supabase-js `mfa.enroll`,
`challengeAndVerify`): no native module, so it ships as an OTA at fingerprint 23dc7e4a. Set-up: on a phone a button
opens the authenticator with the `otpauth://` link; a QR code (drawn by the app's own QR component) for a second
phone; the key in groups of four to type; one code confirms it. Setting it up again (a new phone) replaces the old
code once the new one is confirmed (one phone holds the code). Students and waiting logins are not offered codes.

**Why TOTP, not SMS or passkeys.** Free and offline on the phone the staff member already has; Supabase's SMS factor
needs a paid SMS provider and leaks to SIM swaps; passkeys (WebAuthn) are not offered by Supabase for every
platform the app runs on (APK, iPhone home-screen web app) yet.

## 581. Once set up, the code is asked at every sign-in; no skip — 24 Oct 2026

**Decision.** A login with a confirmed code whose session has not given it (`aal1`, read from the access token) gets
its own area, **Sign-in code**, and nothing else: its profile is not fetched, its remembered copy is forgotten (so a
restart without internet cannot open its screens), Sign out is the only other way. A right code upgrades the session
to `aal2` (Supabase refreshes keep it). There is no "skip": a lost phone is a reset (#584). A code that is set up but
never confirmed counts as none.

**Why.** A skip would make the code decoration for whoever holds the password. The cost (a lost phone locks a
coordinator out until the Guru resets) is small in a class of a few staff who meet weekly.

## 582. The Guru's switch, and why nothing can lock out the only Guru — 24 Oct 2026

**Decision.** Setting `staff_mfa_required` (off), changed only by `set_staff_mfa_required` (the Guru; G10's
`save_settings` refuses the key; audited). **On** needs the Guru's own session to have given the code and a
confirmed code for **every active Guru and coordinator** (`staff_without_code` with the count); the Sign-in codes
screen lists who has one. **Off** needs the code given, or a Guru who has **no** code. So the only Guru can always get
back: if their phone is lost, another Guru or the project owner removes their code (#584), and the Guru — now without
a code — switches it off or sets up a new code. A coordinator made after the switch went on has no code: they use the
app as before, and private details tell them to set one up (#583). Tested in the smoke test ("0061 #582").

## 583. What the code guards while the switch is on — 24 Oct 2026

**Decision.** `private_reads_open()` = switch off, or the token's `aal` is `aal2`. It is checked by the four logged
reads of 0034 — `get_guardians` (parent details), `get_consents`, `get_call_notes`, `get_audit_log` (error
`mfa_required`) — by the Guru's direct `guru_read` policies on `guardians`, `consents`, `call_logs` and `access_log`
(rows simply do not show), and by `waiting_sign_ups`, which leaves out the parent's email and phone of a child's home
sign-up (name, relation and consent still show for Accept). The app treats `mfa_required` on those reads as **held
back**, not failed: the student page, the call screen, Change history and Accept show everything else with "Private
details need your sign-in code" and the way to set it up, and never a false "consent missing".

**Why these.** They are what the access log already treats as the most sensitive reads (#146), plus the audit log the
audit named; call notes are included with them because they hold what parents said on the phone. Other staff work
(attendance, ticks, announcements) stays on `aal1`: the switch is about private data, not about every action.

## 584. A lost phone: the Guru resets a staff member's code; the Guru's own by another Guru or the owner — 24 Oct 2026

**Decision.** `reset_staff_mfa(profile)` (the Guru) removes every code of another Guru or coordinator (never one's
own: `not_yourself`; not a student: `not_staff`), needs the code given while the switch is on, and writes one
`audit_log` row (table `mfa_factors`, the login's id, how many codes; never a secret). The person sets up a new code
at their next sign-in. If the database may not delete from `auth.mfa_factors` (`reset_in_dashboard`), the owner does
it in Supabase → Authentication → Users. The Guru's own recovery is written in OPERATIONS "Staff sign-in codes"
(another Guru, else the owner in the dashboard or the SQL editor).

## 585. A client error log that holds no person — 24 Oct 2026

**Status: same branch, audit fix 15 (§2.13).** **Decision.** The app reports a crashed screen (the crash screen)
and errors nobody caught (web `error` / `unhandledrejection`; on phones React Native's global handler and, in release
builds, Hermes's rejection tracker) to `log_client_error` with five things only: the kind (`crash`, `unhandled`), the
error's **name** (`TypeError`; a name that is not a plain identifier becomes `Error`; never the message, which can hold
data), the screen's route **pattern** from Expo Router's segments (`/staff/students/[id]`; letters only, no digits, so
no id, phone or email fits), the app version (`1.0.0+a1b2c3d4`, `web-test+244e9f8`) and the platform. The database adds
staff / student / other from the role and keeps one row per UTC hour and combination, counted. No login id is stored
with an error. Limits: once per error per run and 20 a run in the app; 10 calls a login an hour (a quota table with
the login and the hour, no policy, gone after two days) and 300 new rows a day in the database; over a limit nothing
is written and nothing is said. Signed-out errors are not sent (the function is for signed-in people).

**Why not Sentry or similar.** A third-party crash reporter sends stack traces, device data and breadcrumbs abroad
and needs a privacy-notice line and a processor agreement; minors use the app. This log answers "what broke, where,
on which version" — what the class needs — without any of that.

## 586. Errors are kept 30 days; the 15th scheduled job — 24 Oct 2026

**Decision.** Job `mridanga-client-errors-purge` (01:55 UTC) deletes errors not seen for 30 days and quota rows
older than two days. Scheduled jobs are now 15: the GO_LIVE_CHECKLIST verification query, the replay check and the
M0061 row say so.

## 587. App errors for the Guru — 24 Oct 2026

**Decision.** Set-up → App errors (Guru only; RLS `guru_read`, nobody writes the table from the app): the newest 200
lines with name, route, kind, staff / student / other, platform, version, times and last seen. The technical words
are not translated. Something that repeats goes to the maintainer.

## 588. Uptime checks of LIVE: a plan for Praveen, not built here — 24 Oct 2026

**Decision.** OPERATIONS "App errors and uptime" holds the plan: a free external monitor (UptimeRobot or Better Stack,
or a scheduled GitHub Actions check in the existing repository, no new account) on the LIVE web address and on
Supabase's health endpoint, alerting Praveen and a second person by email. No account was made and no workflow added
on this branch: an alert recipient and a provider are Praveen's choice.

## 589. Left for later — 24 Oct 2026

Recovery codes (supabase-js has them only as an experiment, not on the server yet), passkeys, a code for every staff
action (not only private reads), and errors from signed-out screens. None blocks fixes 15 and 16.

## 590. The web version loads the staff and Guru screens only for staff — 24 Oct 2026

**Status: branch `claude/bundle-door-queue-cbb4df` (audit 22-10-2026 work package D rest, fix 14; the lead's brief of
24 Oct 2026 under Praveen's delegation). JS only, fingerprint 23dc7e4a; no migration.**

**Context.** The web version was one JavaScript file of 3,842 KB (1,119 KB gzip): every iPhone member downloaded and
read the register, fund, inventory, reports and every other staff screen to see their QR card.

**Decision.** The web starts from its own file, `src/entry.web.tsx` (package.json `main` is `./src/entry`; the phones'
`src/entry.ts` is Expo Router's own start, unchanged). It hands Expo Router its own screen list
(`src/web-routes/route-context.ts`): every file of `src/app` as before, except the 106 staff screens, which are
stand-ins. A stand-in holds nothing of its screen; when opened it loads `src/web-routes/staff-area.ts` (one `import()`,
so the export makes it one file, `staff-area-<hash>.js`, with everything only staff use) and then shows the real screen.
The two staff layouts stay in the first download, so the tabs, the side menu and the Back anchor work as before. A staff
login starts the download at once (root layout, `preloadStaffArea`), so the staff home rarely waits; while it does,
"Loading…"; a load that fails says the page needs the internet the first time, with Try again. Expo Router must know
every route at start, so the staff screens' names are listed in `src/web-routes/staff-screens.ts`, written by
`npm run staff-screens`; `export-web` and the tests refuse a list that no longer matches the folder (a new staff screen
would otherwise not open on the web), and `export-web` checks there is exactly one staff file and no `__common` file.

**Measured** (TEST export, 24 Oct 2026; before 6199ece, after 84f832d): first-download script 3,842 → 3,008 KB
(gzip 1,119 → 854 KB, brotli 841 → 659 KB); staff file 824 KB (gzip 261 KB), loaded by staff only. On a 1.6 Mbit/s,
150 ms link (local copy, throttled server, browser pane): the sign-in screen showed at 7.9 s before, 6.4 s after;
its icons at 9.3 s before, 6.7 s after.

**Not taken.** Expo Router's own async routes (one file per route) were measured: 165 files, and everything two
routes share goes into a `__common` file every visit loads (entry 1,087 + common 2,003 = 3,090 KB), and it needs an
app.json change (fingerprint). One staff file keeps shared staff code out of the first download.

**Consequences.** What is left in the first download is the React Native web base, Expo Router, Supabase, the English
texts (~360 KB), libphonenumber (201 KB, every sign-up and About-you form) and the student screens. A staff screen added
later: run `npm run staff-screens` and commit.

## 591. The offline copy keeps only what this device uses — 24 Oct 2026

**Status: as #590.** The service worker (#513) kept every file of the build at install. It now leaves out, like the
Telugu and Hindi scripts before, the staff file (#590) and the Telugu and Hindi heading fonts (340 KB; the app loads
only the current language's, #367). Each is kept when the page loads it: the page sends what it loaded with `keep`
after a sign-in and again when the staff file has loaded, and the worker keeps any build file it serves. An English
student's phone keeps 29 files, 3,373 KB (before: 31 files, 4,867 KB).

## 592. The app's icon font holds only the app's icons — 24 Oct 2026

**Status: as #590.** Every visit downloaded the whole Ionicons font (381 KB, 205 KB gzip, 1,300+ shapes) for the
95 the app uses. `npm run icons` (scripts/make-icon-font.mjs, Python fontTools) cuts the shapes named in
`src/components/icon.tsx` SHAPES and the filled twin of each outline (the open tab, #338) from @expo/vector-icons'
Ionicons.ttf (MIT; the licence stays in the font's name table) into `assets/fonts/app-icons.ttf` (181 shapes, 52 KB,
30 KB gzip) and writes their characters to `src/components/icon-glyphs.ts`; `icon.tsx` draws with
`createIconSet(GLYPHS, 'mridanga-icons', …)`. Same font on the phones (it reaches them with an update, as Ionicons did).
A test fails while the font does not hold every name in SHAPES.

## 593. Door check-ins and practice wait on the device when there is no connection — 24 Oct 2026

**Status: as #590 (audit fix 18).** Writes were online only: a check-in in a hall without signal failed, and the
practice timer stopped offline kept running and counting.

**Decision.** When a save finds no connection (the app's "Could not reach the server", which includes no answer in
time), it is kept on the device (`src/lib/offline-queue.ts`, localStorage) and sent when the connection is back
(`src/lib/offline-send.ts`): at start, when the app comes to the front, when the browser says it is online, every
30 s while something waits, and from **Send now**. Oldest first; the first "no connection" ends the round.
- **Practice** (Practice tools' Stop, My practice log's Save): sent with the entry's own request id (#322), so an entry
  the server saved before its answer was lost is saved once (log_practice's twin returns the first row). "How did it
  go?" is kept with it and saved after it. A timer entry older than the database's 6 hours for timer starts is sent as
  typed practice for the day it was stopped, the same minutes.
- **A tapped name** on Mark attendance: `mark_visit` with its meaning, in or out; "already in" changes nothing (#18).
- **A scanned code**: `scan_qr` toggles, so a resend could check the student out. It is sent only when the student is
  not checked in today (one read of today's open visits per round, the tokens in the answer, never in an address);
  when they are, nothing is sent. So a queued scan always means a check-in; the screen says so.
- The time the database records for a queued check-in is when it arrives (no migration; the screen says so).
- Only what the save needs: the request id, the login it belongs to, the entry or the student's id / QR token and the
  phone's position at the check-in; no names. It is sent only while that login is signed in, and leaves the device as
  soon as the server answered. A check-in of an earlier class day and practice older than the 14 days the log takes are
  not sent; they and the refused ones are counted once in a notice ("Some saves from this phone did not go through").
  Sign-out deletes all of it (lib/device-traces.ts).
- Mark attendance, Practice tools and My practice log show how many wait ("2 check-ins are waiting for the signal"),
  in en/te/hi (te/hi drafts for native review).

**Why.** A check-in must not be lost because the hall's signal dropped, nor counted twice or flipped to a check-out by a
resend; practice minutes must be the ones at Stop.

**Consequences.** Tested with a stand-in database (`app/tests/offline-queue.test.mjs`). Not covered: check-ins from
Who is here now, a student's page and Check in now (they still say "no connection"); signing out with saves waiting
loses them (the notice asks not to). A real check-in time for queued scans would need a database change (later).

## 594. The practice timer counts the minutes at Stop — 24 Oct 2026

**Status: as #593.** Stop with no connection used to leave the timer running ("kept running, so nothing is lost"), so
the minutes saved later were the time until the next successful Stop. Now Stop counts the minutes there and then,
stops the timer and keeps that entry (#593): "No connection: 25 min kept on this phone. It is saved to your log when the
signal is back." Any other refusal still leaves the timer running, as before.

## 595. A line the privacy notice may need for #593 — 24 Oct 2026

For the privacy-notice work: "If you check someone in or log practice without a connection, the app keeps that entry
on the phone until it is sent (a check-in until the end of that class day, practice at most 14 days), then deletes it;
signing out deletes it too."

## 596. Web push for the web version: announcements and notices, as the phone gets them — 24 Oct 2026

**Status: web-push worker under the lead's delegation (audit 22-10-2026 fix 13, work package L); lead approval
needed.** "Most members use iPhones" (#15) and the iPhone has only the web version: until now it never got a
notification. Web Push works in the iPhone home-screen app from iOS 16.4 and in Chrome, Edge, Firefox and Safari on
Android and computers.

**Decision.** A signed-in student or staff member can switch notifications on for a browser in My profile
(migration 0062, `app/src/lib/web-push.web.ts`, `components/web-push-section.tsx`). That browser then gets **the same
pushes the Android app gets**: announcements of its audience and the notices of `push_outbox` (assessments, reviews,
promotions, events, polls, team tools, data requests), with the same text and the same screens, from the same queue
and the same Edge Function (`notify-announcements`). Nothing new is sent to anybody who does not switch it on.

**Why.** One rule for phones and browsers is easier to explain and to test than a second list; the notices are as
useful on an iPhone as on Android, and they say no more than the phone's (#602).

## 597. The daily practice reminder stays on the Android app (not by web push now) — 24 Oct 2026

**Status: as #596.** The phone's reminder (#402) is a local notification: the server knows nothing of it. By web push
it would need the reminder time and days of each person kept on the server, "practised today" read there, and a job
every quarter hour sending them: new personal data and a seventeenth job for a convenience. **Not now.** Practice tools
keeps saying reminders work in the Android app. If members ask for it, a later package can add it on the same queue
(a `practice_reminders` table, a job, a notice line).

## 598. Browsers are kept in push_tokens, not in a table of their own — 24 Oct 2026

**Status: as #596.** A browser's subscription is three values: its push service address (the endpoint, an https URL
of Google, Apple, Mozilla or Microsoft) and two public keys of the browser (`p256dh`, `auth`).

**Decision.** `push_tokens` takes them as platform `web`: the address is the token, the keys go in `web_p256dh` and
`web_auth` (a check keeps phone rows without keys and browser rows with both). Saved only by `save_web_push` (an
active student, coordinator or Guru; https address up to 1000 plain characters; keys of the right length; at most 5
browsers a person, the oldest dropped), removed by `remove_web_push` (own only); a person reads only their own rows
(0011's policies).

**Why.** Eleven places already forget a login's phones: sign-out's delete, a login switched off or on a withdrawn
record (0039, 0048), `erase_student`, `erase_login`, `anonymise_staff` (0049), Expo's DeviceNotRegistered (0031), the
90-day retention (0060), and the data-rights count of devices (0059). A separate table would need a copy of each, and
one missed would keep a child's browser address after an erasure. In `push_tokens` every one of them covers browsers
unchanged (the smoke test checks sign-out, retention and the count).

## 599. The queue hands phones and browsers to separate senders — 24 Oct 2026

**Status: as #596.** `claim_push_queue` (0031) is what the deployed function calls.

**Decision.** 0062 replaces it with **the same columns**: it now queues a row per phone and per browser
(`push_queue.web`), gives up on stale rows of both, and claims **phone rows only**. The function then calls
`claim_web_push` (browser rows with their address and keys, at most 200, the same 5-minute lease) and
`finish_web_push` (sent / retry 2-8-18-32 minutes / refused, as `finish_push`); the browser run's counts go to
`push_status.last_web_run`. Both are for the service role only.

**Why.** A function deployed before 0062 (LIVE until the deploy) keeps working and never sends a browser address to
Expo; the order of migration and deploy does not matter (browser rows wait and are given up after a day). The old
`claim_due_push` / `claim_push_outbox` (0011/0016, kept for functions older than 0031, deployed nowhere now) would
return browser rows: they stay as they are, and no such function may be deployed again.

## 600. Dead browser addresses go at once, unused ones after 90 days (no new job) — 24 Oct 2026

**Status: as #596.** A push service answers 404 or 410 when the browser ended the subscription (notifications switched
off in its settings, site data cleared, the home-screen app removed).

**Decision.** `finish_web_push` deletes such an address at once (refused `endpoint_gone`), as Expo's
DeviceNotRegistered deletes a phone token. A browser that is not used keeps nothing for long: the app saves its
subscription again at most once a week when it starts, and 0060's `mridanga-retention` job already deletes
`push_tokens` rows not refreshed for 90 days, browsers included. **No new job: still 16.** 401/403 (the site's VAPID keys
refused, e.g. a subscription made with an older key pair) are tried again up to 5 times, then given up; such an address
goes with the 90 days or at the person's next Turn on.

## 601. The encryption is written on Web Crypto and checked against the RFC author's code — 24 Oct 2026

**Status: as #596.** Web Push needs the message encrypted for the browser (RFC 8291, aes128gcm of RFC 8188) and signed
for the push service (VAPID, RFC 8292). The usual npm package (`web-push`) runs on Node's crypto and request modules.

**Decision.** `supabase/functions/notify-announcements/webpush.ts` does both on the Web Crypto API (ECDH P-256, HKDF,
AES-128-GCM, ECDSA P-256) that Deno and Node share: no package runs in the function. `supabase/tests` checks it by
decrypting with **http_ece 1.2.1** (Martin Thomson's reference implementation, an exact devDependency of the tests only)
and verifying the VAPID signature with Node's own ECDSA; the browser part's sending (`web-send.ts`) runs in the smoke
test against the real SQL. On TEST it was checked end to end with Mozilla's real push service (NOTES_web_push.md).

## 602. What a web push carries — 24 Oct 2026

**Status: as #596.** The payload is `{title, body, url, tag}`: the announcement's or notice's title, the first 150
characters of its text (as on the phone), the app screen to open (only the screens the phone may open; anything else
is dropped as bad_url) and a tag so a repeat replaces instead of piling up. Nothing else: no name or detail of a child
beyond what the announcement or notice itself says. The push service sees only an encrypted body, the browser's address
and the site's public key; it keeps an undelivered message for at most a day (TTL 86400).

## 603. Asked only on a tap in My profile, never on load, never in the phone app — 24 Oct 2026

**Status: as #596.** **Decision.** My profile → "Notifications on this browser" is the only place: the browser's
permission question comes from the Turn on button itself (Safari asks only inside a tap; nothing is awaited before
it). A start never asks: it only keeps an existing subscription current (#604). Where it cannot work the section
says why instead of offering a button: on an iPhone or iPad outside the home-screen app it gives the Add to Home Screen
steps; below iOS 16.4 it says to update; a browser without the Push API says announcements are under the bell. A site
built without a public key (#605) and the development server show no section. The Android app shows none: the phone
version of `lib/web-push` answers 'native' and loads nothing; no native module, no app.json change, fingerprint
**23dc7e4a** unchanged.

## 604. A browser's notifications belong to the login that switched them on there — 24 Oct 2026

**Status: as #596.** On a shared family computer or phone a child and a parent may use the same browser.

**Decision.** The device notes whose the subscription is (login, address, last save). A start with another login, or
with no note, **ends** the subscription instead of handing it over; the next person switches on for themselves. Turn
off and sign-out remove the server row while the login still works, then end the subscription; sign-out also
unregisters the service worker (#513), which ends it in the browser anyway, and drops the note. A forced sign-out
(the server ended the login) leaves the row until the push service answers 410 or the 90 days pass. **DPDP:** a minor's
browser is subscribed only by the minor's own login and own tap; the class never subscribes anyone.

## 605. One VAPID key pair per site: public key in the build, private key only in the project's secrets — 24 Oct 2026

**Status: as #596.** **Decision.** `node scripts/web-push-keys.mjs --out <file>` (in app/) makes a pair: the file holds
the Edge Function secrets `WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_PRIVATE_KEY`, set with `supabase secrets set
--env-file` and then deleted; it prints only the public key, which goes into the site's settings file as
`EXPO_PUBLIC_WEB_PUSH_KEY`. `WEB_PUSH_SUBJECT` (mailto: or https:) is the contact the push services see (default
mailto:privacy@mridangaseva.com). `export-web` takes the key when it is a public key (refuses a private-key-sized value)
and checks it reached the bundle; without it the site has no notifications section. The function sends to browsers only
when both secrets are set and form a pair. TEST has its own pair (24-10-2026); LIVE gets one from Praveen (OPERATIONS
"Push notifications" part C). A new pair makes every browser switch on again: make it once per project.

## 606. The service worker shows every push and opens only app screens — 24 Oct 2026

**Status: as #596.** `scripts/service-worker.js` gains `push` (always shows a notification, title and text cut to 120
and 300 characters, the app icon; Safari ends the subscription of a site whose pushes show nothing) and
`notificationclick` (focuses an open window of the app and posts it the screen, which the page opens only when it
belongs to the signed-in area, as a phone tap does; else opens a window at it). Only a path like `/student/...` is
opened, never another address. The offline behaviour (#513, #591) and the staff-only file (#590) are unchanged; the
site's Content-Security-Policy needs no new host.

## 607. Privacy notice 1.0 gets the browser lines before it is published — 24 Oct 2026

**Status: as #596.** Notice 1.0 (#571) is on main and not yet published on LIVE, so its lines are added to 1.0 itself
(no new version): the "Messages" row names a browser's notification address and keys when the person turns them on;
the processors table adds "Browser push services (Google, Apple, Mozilla, Microsoft)", worldwide, encrypted (also in
the app's My data and rights list, `PROCESSORS`); retention says browser addresses go after 90 days unused and at once
at Turn off or sign-out. My data and rights counts "Phones and browsers for notifications". en + te/hi (te/hi drafts for
native review, as #571). If 1.0 is published before this merges, this becomes a 1.1 with the card asking again.

## 608. Order of the LIVE steps — 24 Oct 2026

**Status: as #596.** 0062 after 0061 (it does not need 0060's tables but the retention of #600 is 0060's job), then the
LIVE secrets, then the function deploy from main, then the LIVE web export with the LIVE public key. Any other order
breaks nothing: phones keep getting pushes; browsers simply get nothing until all three are in place.

## 609. Left for later — 24 Oct 2026

The practice reminder by web push (#597); a "send me a test" button; showing in My data which browsers (only a count
now); the old `claim_due_push` / `claim_push_outbox` could be dropped in a later clean-up (#599); Declarative Web Push
(Safari 18.4, no service worker needed) when older iPhones are rare.

## 610. Browser tests (Playwright) live in their own e2e/ folder — 24 Oct 2026

**Status: audit 22-10-2026 fix 24 (package M).** The app had no test that runs a screen: most tests read source text.
**Decision.** Playwright tests of the web version in `e2e/`, with their own `package.json` and lock file. Playwright
is not added to `app/package.json`: the app's fingerprint (23dc7e4a) stays, the app's `npm ci` stays as fast, and
nothing in the APK or an update changes. They test the real TEST export (`npm run export:web -- --site test` into
`app/dist`) served by a small Node server, not the dev server, so the bundle, service worker and Content-Security-Policy
are the ones the test site gets.

## 611. Five flows, on the TEST project, with three dedicated logins — 24 Oct 2026

**Status: as #610.** **Decision.** The flows a class day depends on: sign in (student, coordinator with the sign-in
code, Guru, a wrong password), register an adult at the welcome desk, check a student in and out by name, log practice
online and offline, read an announcement and What's new. They run against TEST (dummy data), never a local database:
the access rules, functions and triggers under test are the real ones. Logins `e2e.student@`, `e2e.coordinator@`,
`e2e.guru@example.com`, made in the TEST dashboard and set up by `e2e/setup-test-logins.sql` (no passwords in it; it
refuses unless the three users exist, so it cannot act on LIVE). Passwords and the coordinator's code key live only in
the gitignored `e2e/.env.e2e`. Every script stops unless `app/.env.test` names the TEST project.

## 612. Selectors are what a screen reader hears; the app gets no test ids — 24 Oct 2026

**Status: as #610.** **Decision.** Roles and English accessible names (`getByRole('button', { name: 'Save student' })`).
The app's labels were already complete (#314 and the a11y rounds), so no `testID` was needed and no app code changed.
A test then fails when a person would notice the change (a renamed button), which is the point; a reworded English
string means updating the test with it.

## 613. Each test cleans up what it writes — 24 Oct 2026

**Status: as #611.** **Decision.** Desk records are named "Endtoend Desk <time in letters>" (names take letters only)
and deleted by the E2E Guru with `delete_student_record` (0054) after the test, pass or fail; practice entries carry a
note "E2E <time>" and every such entry is deleted after each practice test; the check-in test ends with Check out and
starts with one if a stopped run left the student in. What stays by design: visits (history), the used roll number,
the change-history row of a deleted record. `npm run e2e:check` counts leftovers. Chosen over a database reset: TEST is
shared with volunteers and other workers.

## 614. Chromium and WebKit, phone-sized, one test at a time — 24 Oct 2026

**Status: as #610.** **Decision.** A Pixel 7 sized Chromium and an iPhone 15 sized WebKit (Safari's engine: the
iPhones use the web version). One worker: the flows share the E2E logins and TEST rows. Sessions are signed in once per
browser through the screens (the sign-in flow) and reused from `e2e/.auth/` by the other flows, so a run signs in 6
times, not 30, and stays under Supabase's sign-in limits. When Playwright's own Chromium cannot be downloaded (the
office firewall re-signs storage.googleapis.com) the installed Google Chrome is used.

## 615. The local server serves the site's own headers, without upgrade-insecure-requests — 24 Oct 2026

**Status: as #610.** **Decision.** `e2e/scripts/serve-dist.mjs` sends `dist/_headers` with every file, so a page the
site's CSP would block fails in the tests too. Two exceptions, both meaningless on plain http://127.0.0.1: HSTS, and
`upgrade-insecure-requests`, which WebKit applies to 127.0.0.1 (Chrome does not) and so asked https://127.0.0.1 for the
app's script and never started.

## 616. The staff sign-in code step is tested with a real TOTP code — 24 Oct 2026

**Status: as #611 (0061).** **Decision.** `npm run e2e:code` sets up a code for the E2E coordinator the same way
My sign-in code does (Supabase Auth TOTP, with the coordinator's own password and the publishable key) and keeps the
set-up key in `.env.e2e`; the tests compute the six digits (RFC 6238, `e2e/scripts/lib/totp.mjs`, checked against the
RFC's vectors) and wait for the next 30 s window when fewer than 5 s are left. The E2E Guru keeps no code, so both
sign-in paths run.

## 617. E2E is not in CI yet; source-text tests stop growing — 24 Oct 2026

**Status: as #610.** CI needs no secrets today (#141); the E2E tests need three passwords and a code key.
**Decision.** Run `npm run e2e` locally before merging app changes; the CI job (repository secrets, `main` and manual
runs only, never pull requests from forks) is proposed in `e2e/README.md` for Praveen to decide. New behaviour on the
five flows gets an E2E step, not another regex over a screen's source; `e2e/SOURCE_TEXT_TESTS.md` lists the existing
source-text tests and which flow covers each. None is deleted without the lead's agreement.

## 618. The Material Symbols font leaves the Android app — 26 Oct 2026

**Status: built (branch claude/app-size), JS only, fingerprint 23dc7e4a unchanged.** The Android export carried a
970 KB font nobody sees: every expo-router layout reaches NativeTabs' icon converter, which imports expo-symbols, which
registers Material Symbols as an asset (plus a 77 KB name table in the bundle). The app draws its icons with its own
font (#592) and uses neither NativeTabs nor SymbolView. **Decision.** `app/metro.config.js` resolves `expo-symbols` to
`src/lib/expo-symbols-stub.tsx` on Android only (web and iOS untouched): Android assets 1,573 → 603 KB, Hermes bundle
−105 KB. The next APK is 0.4-1 MB smaller; updates to today's APK gain nothing (the font is already inside it). A
screen that one day uses SymbolView gets an empty icon and a loud error, not a silent megabyte. When face-scan is
merged, its metro.config.js (`assetExts.push('tflite')`) and this one become one file.

## 619. Updates are exported with source maps — 26 Oct 2026

**Status: built (branch claude/app-size), JS only.** `publish-update.mjs` exported without source maps, so Hermes kept
its debug tables inside the bytecode: 8,889 KB per update against 7,410 KB in the APK's own bundle (Gradle passes a
source map) and in what `eas update` makes by itself. **Decision.** Export with `--source-maps` (−1.4 MB on each phone
that takes an update, about −540 KB to download with brotli), then move the maps to `dist-update-maps/` (ignored)
before the bundle checks: they are not part of the update (EAS uploads maps only with `--upload-source-maps`, not
used) and they hold the app's source, which names the test project (src/lib/asset-link.ts) and would stop a
production publish. They stay on the publishing PC to read an App errors stack against that update.

## 620. The level path: "7 of 20 in Beginner" and what comes next — 24 Oct 2026

**Status: built (level-path worker, audit 22-10-2026 fix 12).** The student home's strip under the ring now reads
"7 of 20 in Beginner" (was "My level: Beginner · 7 of 20") with the next item to learn under the bar ("Next: …"), or
"Every item of Beginner is ticked." My progress (S4; also Me > My progress for staff) shows the same count with the bar,
"Next to learn" with the first two items not yet ticked in teaching order, and the level after ("After Beginner comes
Intermediate. Moving up is the facilitator's decision.", or "Advanced is the last level."). Counted as before: items
in use of the current level; a retired item does not count and never comes next (#44). Pure logic in
`app/src/lib/level-path.ts`, tested in `app/tests/level-path.test.mjs`.

**No migration.** A student already reads every syllabus item, their own ticks, their own level history and their own
practice history (0001, 0056), so the home reads those (`app/src/data/level-path.ts`) instead of a new function
(0063 stays free). The bar keeps student_home's numbers; the path is read after the home's numbers, so the ring never
waits, and at most every 2 minutes on coming back to the home (pull to refresh reads at once), so the home does not add
five requests on every return (P5-06).

## 621. Small celebrations, once per event — 24 Oct 2026

**Status: built, as #620.** A calm card on the student home, in place of the circles like the welcome (#342), when an
item was ticked in class, a practice milestone was reached (#493) or the Guru moved the student up a level
(level_history from a lower level to a higher one; the first placement and a move down are not celebrated): "Hare
Krishna! A step forward", up to three lines (level first, then milestones, then ticks, newest first) and "and 2 more
steps", a line of blessing ("Keep offering your practice with love, one step at a time.") and Continue. No points, no
confetti, nothing compared between children.

Once per event: the keys of the events already known (`tick:<item>`, `milestone:<id>`, `level:<history row>`) are kept
on the phone per login (`celebrated:<profile id>`, lib/local-storage.ts) and count as shown the moment the card comes,
so leaving the home does not bring it back; an item unticked and ticked again is not celebrated twice. The first time
on a phone only events of the last 7 days are new, so an update does not celebrate a whole year. Nothing is checked
when the level history or practice history could not be read (their old events would look new next time), nor while
the welcome is due. A new phone or a cleared browser may show a recent event again: harmless.

## 622. Celebrations respect reduced motion and screen readers — 24 Oct 2026

**Status: built, as #620.** The card fades in and rises 8 px over 0.7 s, once (no loop, no spring); with Android's
"Remove animations", iOS "Reduce motion" or the browser's prefers-reduced-motion it simply appears
(`AccessibilityInfo.isReduceMotionEnabled`, as Notice does, #332/#363). TalkBack and VoiceOver hear the whole text
once (`announce`), the browser's reader through `role="status"`. No buzz: an unexpected vibration on opening the home
is not calm.

## 623. No privacy-notice change for #620-#622 — 24 Oct 2026

The path and the celebrations show the student data they already see on My progress and in the practice milestones;
the only thing new kept on the phone is the list of event keys already shown (item ids, milestone names, level-history
row ids), never sent anywhere and deleted with the app's data. DECISIONS #624-#629 stay free.

## 640. A read-only parent page, opened from the weekly email — 27 Oct 2026

**Status: branch `parent-view` (re-score of 26 Oct 2026, gap 10: Parents 4.5/10, the lowest dimension; the lead's brief
of 27 Oct 2026 under Praveen's delegation). Migration 0063, Edge Function `notify-parents` (deploy), JS-only app
(fingerprint 23dc7e4a). Off until the Guru switches it on (#646).**

**Context.** Parents get a weekly email (0058, #530) and, once switched on, check-out emails (#246); they have no page
of their own. Many students are children: a parent supporting practice at home wants to see more than one week, the
level path and what comes next.

**Decision.** `/parent` on the web app: for one child, read-only, the level and the syllabus of that level (done of all,
the next three items), items learnt in the last 8 weeks, level changes in the last year, visits per week for 8 weeks and
the last 5 visits with times, practice per week for 4 weeks against the goal and the current run of days, events for the
child in the next 31 days, and the announcements addressed to the child in the last 30 days (#644). The only thing a
parent can do there is stop the weekly email and the page (#647). In the parent's language (the email's `?lang=`, the
language picker).

## 641. A signed link from the weekly email, not a parent login — 27 Oct 2026

**Decision.** The weekly email carries `<web app>/parent?lang=te#v=<guardian id>.<expiry>.<signature>`: an HMAC-SHA256 of
"parent-view:<guardian>:<expiry>" with the push secret (as the unsubscribe links, #537, with a purpose of its own), good
for **14 days** (two weekly emails, so last week's link still works when this week's comes). The page sends the token to
`notify-parents` in a POST body; the function checks the signature (constant time) and the age, then the database decides
(#643).

**Why not a parent login (option considered).** A login linked through the guardian's confirmed email would create a new
account per parent (email, password hash, sessions, devices: new personal data and a new breach surface), a fourth role
through every policy and the grant sweep, a sign-up flow for adults the class has only met at the desk, and a clash with
#184 (a child's record never holds a parent's email; parent and child sharing one address). The link adds **no new
personal data**: it uses the address the parent already gave and the written yes already recorded at the desk, where the
parent's ID was seen (verifiable consent, DPDP Act s.9, Rule 10). A forwarded link shows one child for at most 14 days and
the parent can stop it; the Guru can stop all at once.

**Consequences.** A parent without the weekly email has no page. A parent who loses the link waits for the next email or
asks for "Send again" at the desk (#535).

## 642. Row-level security stays closed: the page is the service role's, for one guardian row — 27 Oct 2026

**Decision.** Parents have no database identity, so no policy changes and nothing opens to anon (the anon allow-list stays
`sign_up_choices`, `give_parent_consent`). `parent_view(guardian)`, `stop_parent_view(guardian)` and `parent_view_on()`
are granted to the service role only (`notify-parents`); signed-in people may run only the staff overview and the Guru's
switch (both check the role inside; on the allow-list of the function sweep). `parent_view` reads the one student of that
guardian row and nothing keyed by anything else, so a token for one child can never show another: a brother or sister has
their own guardian row, email and link. The token sits after `#`, so it never reaches Cloudflare or Supabase in an address
or a Referer (`strict-origin-when-cross-origin` already); the page reads it on the web only.

## 643. Exactly the parents who may get the weekly email, checked at every opening — 27 Oct 2026

**Decision.** `parent_view` answers only while `parent_digest_block(student, guardian, ignore the weekly email's switch)`
is null: the parent's written yes to the weekly email on any guardian row of the child with that address (#531), a current
data consent, an active student under 18, not withdrawn. Otherwise `not_available`, **never why** (a forwarded or old link
learns nothing). So a withdrawal (`withdraw_consent`), an erasure (the guardian row goes, and the access log's id is
blanked, 0034), the child turning 18 (then the student's own consent, #577), a pause or leaving, Stop on the page or
Unsubscribe in an email end it at the next opening, without waiting for the link to expire.

## 644. What the page shows, and what it never shows — 27 Oct 2026

**Decision.** Only what the child already sees in the app (My progress, the level path #620, attendance, practice,
events, announcements), for that child: see #640. **Never** a location, distance or area flag (#212), a photo, a mark or
an assessment, a coordinator's remark on a tick, a call note, an event's `place` text, a file or a reply, or anything
about another child. Announcements: those `audience_students` gives the child (as events; never staff-only), published,
the last 30 days, at most 5, title and text (at most 1000 characters). Staff write announcements to students knowing a
parent may read them (OPERATIONS "The parent page" says so).

## 645. Each opening is in the access log — 27 Oct 2026

**Decision.** Each page answered with content writes one `access_log` row (`function_name` `parent_view`, no reader,
the student, 1 row): the Guru sees it under the audit log's Reads as "Parent page (link in the weekly email)", reader
"System". Kept a year, as every read (0034). No address, device or IP is kept. The staff overview counts openings in 7 and
30 days and the children, no names (`parent_view_overview`).

## 646. The Guru's switch, off by default — 27 Oct 2026

**Decision.** Setting `parent_view_enabled` (false), changed only by `set_parent_view(on)` (the Guru; audited through
`audit_setting`; a direct update is refused, `setting_unknown`, as #534). On the screen "Weekly email to parents" beside
the weekly email's switch, asked twice. Off: every link answers "switched off" at once and the next weekly emails carry no
link (`notify-parents` asks `parent_view_on()` once a run). It is separate from the weekly email's switch: the Guru may run
the email without the page. Switched on only after form line D carries the page sentence (#649).

## 647. One consent for the email and the page; Stop on the page — 27 Oct 2026

**Decision.** No new consent scope: the page is the same purpose as the weekly email ("telling the parent about their
child's progress", #531) for the same person, reached from that email. The parent's yes (scope `digest`) covers both once
form line D says so (#649). The page's one control, "Stop the weekly email and this page" (asked twice), runs
`stop_parent_view` = `stop_parent_digests`: every `digest` yes of that address is revoked (kept, with the time) and waiting
emails end as stopped, exactly as the email's Unsubscribe (s.6(4): as easy to withdraw as to give). Starting again is at
the desk. The child's own login signed in on the same browser can open the page (it shows what the child already sees).

## 648. The link is written as text; the preview shows none — 27 Oct 2026

**Decision.** In the email the link is a plain line of text in both the text and the HTML part, never an `<a>`, so a
sender's click tracking (Brevo's) does not rewrite it through a tracking address; mail apps make it tappable. Its line says
the link is for the parent and works 14 days. Staff's preview (#536) shows the email without the link line: a link is made
per guardian when the email goes. States the page can show: the page; switched off; not available; expired (a correctly
signed link past 14 days: "the next weekly email brings a new one"); a link that is not ours ("open the whole link from the
email"); stopped.

## 649. The privacy notice needs lines; form line D a sentence — 27 Oct 2026

**Decision.** Yes, the notice needs them before the Guru switches the page on (the lead handles the notice version, #150;
this branch does not edit `website/content/*/privacy.html`). Drafts (English the reference; Telugu and Hindi for the
native review, docs/TRANSLATIONS.md):

1. **What parents receive**, after the weekly email:
   - en: "The weekly email also has a link to a page about your child: level and syllabus, visits, practice at home, coming
     class events and class announcements to your child. The link works for 14 days and shows only that child; each
     opening is logged. Stopping the weekly email also stops the page."
   - te: "వారపు ఈమెయిల్‌లో మీ పిల్లల గురించి ఒక పేజీ లింక్ కూడా ఉంటుంది: స్థాయి, పాఠ్యాంశం, తరగతికి రాకలు, ఇంట్లో సాధన,
     రాబోయే తరగతి కార్యక్రమాలు, మీ పిల్లలకు తరగతి ప్రకటనలు. లింక్ 14 రోజులు పనిచేస్తుంది, ఆ పిల్లలను మాత్రమే చూపిస్తుంది;
     ప్రతిసారి తెరిచినది నమోదవుతుంది. వారపు ఈమెయిల్ ఆపితే పేజీ కూడా ఆగుతుంది."
   - hi: "साप्ताहिक ईमेल में आपके बच्चे के बारे में एक पेज का लिंक भी होता है: स्तर और पाठ्यक्रम, कक्षा में आना, घर पर
     अभ्यास, आने वाले कक्षा कार्यक्रम और आपके बच्चे के लिए कक्षा की घोषणाएँ। लिंक 14 दिन चलता है और केवल उसी बच्चे को
     दिखाता है; हर बार खोलना दर्ज होता है। साप्ताहिक ईमेल बंद करने से पेज भी बंद हो जाता है।"
2. **How long we keep data**: "Openings of the parent page: one year, in the access log (no address or device)."
   (te: "తల్లిదండ్రుల పేజీ తెరిచినవి: ఒక సంవత్సరం, యాక్సెస్ లాగ్‌లో (చిరునామా, పరికరం ఉండవు)." hi: "अभिभावक पेज खोलने का
   रिकॉर्ड: एक वर्ष, एक्सेस लॉग में (कोई पता या डिवाइस नहीं)।")
3. No new processor: the page is served by Cloudflare Pages and Supabase, already listed; the email by Brevo, already listed.

**Form line D** gets one sentence (draft en; te/hi follow the form's other lines): "The email also carries a link to a page
with your child's last weeks (attendance, practice, progress, class events and announcements). The link works for 14 days
and is only for you; please do not forward it."

**Order at LIVE.** 0063 (TEST first), then `notify-parents` from main, then the web upload with `/parent`; the notice and
form line D with the next notice version; then the Guru switches the page on. In any other order nothing breaks: an older
function sends no link; the switch is off.

## 650. The web version loads the student screens beyond the tabs later, with the code they share with staff — 27 Oct 2026

**Status: branch `web-entry-diet` (re-score 26-10-2026 gap 13, the lead's brief of 27 Oct 2026). JS and the export script
only, fingerprint 23dc7e4a; no migration.**

**Context.** After #590 the web version's first download was still 3,058 KB (gzip 869, brotli 671): every visit, signed
out or not, downloaded the practice tools, Echo me, the tap pad, lessons, assessments, events, polls, My profile and My
data. Praveen's rule (27 Oct 2026): speed and any phone first, size second; no slower first screen, no broken offline
start, no native code.

**Decision.** Like the staff screens (#590), every student and waiting screen except their layouts and the student's
four tabs (Home, My QR, Announcements, Ishtagoshti) is a stand-in on the web that loads one file, `student-area.ts`
(`student-area-<hash>.js`, 31 screens). The four tabs stay in the first download, so the student home never waits. The
loader is now one for both areas (`src/web-routes/lazy-area.tsx`); the lists of later screens are
`src/web-routes/area-screens.ts`, written by `npm run area-screens` (was `staff-screens`), refused by export-web and the
tests when stale. A student's or waiting login starts the student file 1.5 s after the first screen
(`src/lib/web-areas.web.ts`), so the home's own requests go first on a slow line; a staff login starts the staff file at
once, as before. The service worker keeps the student file at install (after sign-in), so practice offline works from
the first visit as before; the staff file stays out of its list (#591).

**The shared code.** Nearly all student-screen code is also used by staff screens (practice tools, Echo me, lesson
player, events, polls, assessments). Expo's export puts code two later files share into `__common-<hash>.js`, which
index.html loads at start: the first cut moved only 37 KB (3,058 → 3,025 KB). export-web therefore folds `__common` into
each area file (step 2b, `scripts/lib/fold-common.mjs`): a copy at the head of the staff and of the student file, new
content hashes in their names, the entry's table of later files and index.html rewritten, `__common` deleted. Safe
because `__common` only defines modules (it runs nothing), none of them is in the entry, and Metro's `define()` keeps
the first copy of a module and ignores a second. Anything unexpected (two `__common` files, a name found other than
once) stops the export.

**Practice as its own file: not taken.** Measured: code only the practice screens use is 3 KB; the rest is shared. A
separate practice file would carry its own copy of the shared code, so a student would download it twice.

**Measured** (TEST export, 27 Oct 2026; before 5e7e06f, after this branch): first download 3,058 → 2,657 KB (entry
2,647 + Expo's runtime file 10; gzip 869 → 741, brotli 671 → 579); student file 404 KB (gzip 130), loaded by students
and waiting logins after the home; staff file 842 → 1,210 KB (it now carries the shared code that was in the entry; a
staff phone's total 3,900 → 3,867 KB). Service worker install list 29 files 3,423 KB → 31 files 3,425 KB (a student
phone keeps what it kept before). Sign-in screen on a 1.6 Mbit/s, 150 ms link (local copy, gzip, browser pane, two runs
each): 6.7 / 6.5 s before, 5.5 / 6.0 s after.

**Looked at, left.** Telugu and Hindi already load only when chosen (#331) and are kept offline once loaded (#591);
English stays in the first download as the fallback and the start language of most (only ~4 KB of its texts is used
by staff screens alone, so splitting it would not pay). The heading fonts already load per language at run time
(#337, #367); the QR reader is not in the first download. What is left is mostly the framework: Expo Router 429 KB,
react-native-web 276, react-dom 175, Supabase ~240, and libphonenumber-js 201 KB (sign-up, About you, parent consent:
Metro does not tree-shake and the package's `exports` blocks its small entry points, so As-you-type, find-numbers
and the rest come along; the metadata alone is 81 KB). Next candidates: libphonenumber's metadata and code loaded only by the forms that need them, and the
announcement upload code (expo-image-manipulator, -image-picker, -document-picker, ~30 KB) split from the readers'
`announcement-files.ts`.

## 660. A login from a password-reset link stays on the new-password screen — 27 Oct 2026

**Context.** E5 of the LIVE sign-up test (27 Oct 2026): the reset link signs the person in and is used up. Supabase says
PASSWORD_RECOVERY only on that first page load, and the app kept it in memory only, so Back (the browser goes back to
the used link, which reloads the app) or a reload opened the person's home with the old password still set.
**Decision.** `src/auth/recovery-mark.ts` keeps the user id of that login on the device (local storage) from
PASSWORD_RECOVERY until USER_UPDATED (the new password is saved) or SIGNED_OUT; a sign-in with the password ends it
first. While it is there that login's area is `recovery`, also before the login is restored and while it waits for
internet: the remembered profile never opens home or pending. Another login is never held back (the id must match).
**Privacy.** Only the user id, on this device, deleted at the save or sign-out: no notice change.

## 661. Forgot password: plainer "sent", and "wait a minute" for the second request — 27 Oct 2026

**Decision.** The sent message says the link went to the address "if it is registered here", with spam folder and
sign-up as next steps, and the screen offers New student registration to everyone, so it still says nothing about
whether the email has an account. Supabase's 60 s per address limit (429 `over_email_send_rate_limit`, "only request
this after N seconds") gets `authErrors.waitAMinute`; the hourly project limit with the same code keeps
`emailNotSent`. te/hi are drafts for the native review. Known limit: Supabase answers 429 only for an address that
has an account, so a second request within a minute can tell that apart; the server does it, the app cannot hide it.

## 662. Uptime check: GitHub Actions every 15 minutes, no secret — 27 Oct 2026

**Decision.** Replaces the plan of #588. `.github/workflows/uptime.yml` runs `.github/uptime-check.mjs`, which only reads
the LIVE web app and its code, Supabase Auth's health address and the website; the publishable key for the health
address is read from the LIVE app code, so nothing is stored in the repository or its secrets. A failed scheduled run
is the alert (GitHub's email to the account that last changed the schedule). **Why.** No new account, nothing to pay
(public repository), one place with the code; UptimeRobot-style 5-minute checks stay an option if 15 minutes proves too
slow. Praveen's one-time steps are in OPERATIONS "App errors and uptime".

## 663. Staff governance before the switch: at most two Guru logins, owner MFA recorded — 27 Oct 2026

**Context.** Gap 6 of the 26-10-2026 re-score: five Guru logins read every child's record; the owner's MFA was never
recorded; the sign-in codes of 0061 count only once switched on. **Decision.** The Day one query gets row 8 `Guru logins
at most 2` (names the Guru logins); GO_LIVE_CHECKLIST part F lists the order (Guru count, owner MFA, every staff code,
then the Guru's Ask for codes) and G has a row for each. Docs only: a Guru role is still given and taken in the
dashboard (`guru_role_dashboard_only`), so no migration.

## 664. One English word for the Guru role: facilitator — 27 Oct 2026

**Decision.** Follows #40: the English strings that still said "Guru" (35 places) (including `roles.guru` in the data-rights
roles) now say "facilitator" ("The facilitator" at a sentence start); the website already did. The privacy notice's
"the facilitator (Guru)" stays as a gloss. Telugu and Hindi keep గురువు / गुरु (#40); the spots that use the plain
form instead of గురువుగారు / गुरुजी are listed for the native review in NOTES_ops_signin_polish.md.
DECISIONS #665-#669 stay free.

## 670. The student's four tabs: Home, Learn, Practice, Me — 27 Oct 2026

**Context.** Re-score gap 12 and Sarvesh Prji's student module spec (27-10-2026, sections 1-2). **Decision.** The student
tabs are Home | Learn | Practice | Me (amends #57, #353): Learn = My Level, syllabus and lessons, assessments, milestones,
Learn more; Practice = Today's Practice, the practice tools, Weekly Practice, My Practice Goal, Practice History, the
games; Me = who I am with My QR, attendance, My Details, notifications, language and appearance, Privacy & Data, What's
new, Help, Sign out. My QR, Updates (announcements) and Śloka Study (Ishtagoshti) left the tab bar: their files moved
from student/(tabs)/ to student/ at the same addresses (/student/my-qr, /student/announcements, /student/ishtagoshti), so
links, notifications and What's new open them as before, now with a back button. The Practice tab is
/student/my-practice: /student/practice stays the practice tools (the reminder's address). The lesson, event and
assessment screens did not move. **Why.** The spec's order, and the tabs stay light for the web's first download (#650):
the three old tabs are now in the student area, the first download went from 2,675 KB to 2,665 KB.

## 671. Practice is drawn as the Śrī Khol — 27 Oct 2026

**Decision.** components/khol-icon.tsx: a monoline two-headed khol (24-unit box, 1.5 stroke like the Ionicons outlines,
wide bass head left, small treble head right, two straps); the open tab tints the body. Icon name `practice` draws it
everywhere (Practice tab, Today's Practice, every Practice shortcut). react-native-svg, not the icon font: the font is
cut from Ionicons (#592) and stays as it is; no native change (fp 23dc7e4a). Never a Western drum or an emoji (spec 2).

## 672. Updates behind the bell; the notifications inbox in Me — 27 Oct 2026

**Decision.** The student bell (home band and every tab's header bar, components/updates-bell.tsx) opens Updates with the
count of announcements not opened; the notifications inbox (A2) is a row in Me with its own count. My profile's person
button left the student band (Me replaces it). **Why.** The spec puts Updates behind the bell; one bell, not two.

## 673. Daily Mission (Today's Practice) without a new table — 27 Oct 2026

**Name.** Sarvesh Prji (via Praveen, 27-10-2026): the card is called "Daily Mission" in English, not "Today's Practice" or "Today's Sādhana"; Start / Continue stay. Telugu and Hindi wait for the native review (no draft wording; the keys keep the earlier drafts until then). **Decision.** lib/today-practice.ts: one item of the level's Weekly Practice a day (taals still in the list, lessons the
student may open), else the level path's next item, else free practice; guna = ekgun for a taal (the plan keeps no guna,
Start plays at layakari 1); minutes = the goal's minutes a day; progress = minutes logged today; Start / Continue /
done. Start opens the practice tools. **Open.** A guna per plan item needs a practice_plans column (a migration), for
the Guru to decide.

## 674. The student home: compact band, Today's Practice first, cards under it — 27 Oct 2026

**Decision.** Replaces the ring of #240 on S1: the band without the rule, then the Daily Mission card (#673), Śloka Study across the
row, and cards for Lessons, Assessments (count to do), My QR, Events (polls to vote), My Growth (Practice History) and,
while unfinished, My Details. The fact of the day stays at the foot; the level strip moved to Learn. Welcome and
celebration cards still take the cards' place once.

## 675-677. Learn, Practice and Me hold rows only — 27 Oct 2026

**Decision.** The three new tabs are lists of rows and cards that open existing screens; nothing heavy is imported
(the assessments count is one head request, fetchMyOpenAssessmentCount), so the first download does not grow.

## 678. Sign-out warns while saves wait on the phone — 27 Oct 2026

**Decision.** SignOutButton (everywhere): while practice entries or check-ins of this login wait in the offline queue
(#593), the first tap shows how many and that signing out deletes them, with Stay signed in first and Sign out anyway
second (spec section 11).

## 679. Sarvesh Prji's English terms — 27 Oct 2026

**Decision.** English only, keys kept: Updates (News), Śloka Study (Slokas), My Learning (My progress), Practice History
(My practice log), Weekly Practice (Practice of the week), My Practice Goal (This week), My Details (About you), Privacy
& Data (My data and rights). Telugu and Hindi wait for the native review (NOTES_student_nav.md lists them).

## 680. Learn screens from the Guru's student-module specification — 27 Oct 2026

**Status: branch `learn-screens` (the lead's brief of 27 Oct 2026; Praveen agreed the three items with Sarvesh Prabhu
the same day). Migration 0064, JS-only app (fingerprint 23dc7e4a unchanged).**

**Context.** Sarvesh Prabhu's "Student module change specification" (27-10-2026, 16 pages) asks, among much else, for
event details, one lesson screen with Video / Audio / Notes, and clear assessment statuses (§4 rows p.8, p.13, p.15,
§10.4). Its pictures are AI concepts, not designs. The PDF on `\\fileserver02` was not reachable from the worker's PC on
27-10-2026; this was built from the lead's summary of those rows. **Decision.** Three changes inside the event, lesson
and assessment screens and their staff forms (#681-#688); student navigation, Home and the icon set are another
worker's (`student-nav`) and are not touched. Kartāl and harmonium stay Phase 2.

## 681. Event details for those taking part — 27 Oct 2026

**Decision.** Six optional columns on `events`: reporting time (`reporting_at`, the same day on the form, at or before the
start, at most 12 hours before), rehearsal (free text: day, time, place), dress code and what to bring, the role of those
taking part, the staff member to contact (`coordinator_id`, an active coordinator or the Guru), and an https maps link.
Staff set them in a "For those taking part" section of C16; students see them on the event card (S11) — "Report by
17:30", "Rehearsal: …", "Wear and bring: …", "Role: …", "Questions: ask …" — with Open the map, and the calendar entry
carries them. **Venue** is the existing centre and/or place (0022), now headed "Venue" on the form: no second venue
field. A performer's own part (Performers, 0022) still shows as "Your part"; the role here is everyone's. **RSVP:**
events have no answer deadline — answers close when the event starts (0022, unchanged); a separate deadline was not
added. Changing only a detail tells nobody (as before, only a new time or place is told). Checked by a trigger of its
own (`guard_event_details`), so 0022's guard is untouched.

## 682. No new personal data; the privacy notice needs no new line — 27 Oct 2026

**Decision.** Event details are class logistics, not data about a student. The contact is a staff member's **name**,
which students already see on events ("Created by") and announcements; no phone number or email is shown (a student
asks in class or through the coordinator's usual channel). Lesson audio and notes are teaching material. The
assessment receipt and "Under review" show times the database already kept (`submitted_at`) or a staff action on a
recording (`review_started_at`). **The privacy notice needs no new line.**

## 683. A lesson's audio and notes live on the lesson's own row — 27 Oct 2026

**Decision.** A lesson is one material row of kind `youtube` or `video` (0013, 0020); its audio (`audio_path`, name,
size) and notes (`notes`, at most 4000 characters) are columns on that row, not a new table, so every lesson list, the
suggestion flow (C18) and the Guru's edit form keep working with no other change. The audio file is in the private
bucket `material-files` (10 MB, as PDFs and photos; the bucket now takes audio types), played through a signed link
that works for an hour, never stored in a table row. Unlike a PDF or photo, a lesson's audio may be added, replaced or
removed later; the app removes the old file after the row is saved. The Storage rules count `audio_path` as a file the
material lists (read by those who may read the lesson; a listed file cannot be uploaded again). Notes are plain text;
notation PDFs stay separate materials.

## 684. One lesson screen: tabs only for what the lesson has — 27 Oct 2026

**Decision.** The lesson player (V3) shows Video / Audio / Notes chips only for the formats the lesson has, in that
order, and no tab bar when it has only the video — never an empty tab. The video is the first tab. The audio's signed
link is made and its player created only when the Audio tab is first opened; leaving a tab pauses what it plays;
nothing plays by itself. A lesson card names the extra formats on its kind line ("YouTube video · Audio · Notes"): one
card, one screen. The Audio tab has Play / Pause, back and forward 5 s, the time and 0.75x / 1x.

## 685. Watching is not mastery — 27 Oct 2026

**Decision.** Progress stays at lesson (syllabus-item) level and is ticked by the teacher (C9, `student_progress`).
Opening, watching or listening records nothing; the lesson screen says "Your teacher ticks a lesson as learnt in class;
watching or listening here does not."

## 686. Student assessment statuses: Assigned, Submitted, Under review, Reviewed, Redo requested — 27 Oct 2026

**Decision.** Students see five statuses mapped from what is stored: `assigned` and `seen` → Assigned; `submitted` →
Submitted; `submitted` with the newest recording's `review_started_at` set → **Under review**; `reviewed` → Reviewed;
`redo` → Redo requested. Staff keep their tracker words (Not seen / Seen / Submitted / Reviewed / Redo): the coordinators
need to know who has opened it. "Under review" needed one fact the data did not hold: `assessment_submissions.
review_started_at`, set once by `start_submission_review` when a staff member opens C14 on the newest recording waiting
for its review (never on their own work). No status value was added or rewritten, so every existing assignment reads
as before (null = Submitted). **Option considered:** "Under review" = an accepted level-up waiting for the Guru's
decision; rejected — it would never appear for ordinary assessments.

## 687. A receipt for every recording sent — 27 Oct 2026

**Decision.** Each recording on S7 shows "Receipt no. <id> · received <day> at <time>": the submission's id and the
database's `submitted_at` (not the phone's clock). After Send the success notice carries the same line. No new data.

## 688. Teachers see only authorised records, as before — 27 Oct 2026

**Decision.** No policy changes. `start_submission_review` is staff-only (security definer), touches only
`review_started_at` on one recording and is logged by the existing audit trigger; students cannot call it.

## 689. Left out on purpose — 27 Oct 2026

**Decision.** Not in this change: the Beginner lessons list of a waiting login (its offline copy keeps title and link
only; its lesson screen still shows the tabs); a staff "Under review" column on the tracker; Notes as rich text or PDF;
a contact's phone on events. Telugu and Hindi strings are drafts for the native review (docs/TRANSLATIONS.md).

## 690. Rhythm Playground: design answered on the real stack, for Prji's sign-off — 28 Oct 2026

**Status: design only (branch `claude/playground-design-504412`); no app code, no migration file.** Prji's master
prompt and the Rhythm Playground spec v3.0 assume React.js + Java Spring Boot; the app is Expo SDK 57 + Supabase.
**Decision.** docs/RHYTHM_PLAYGROUND.md answers the prompt's deliverables 1-17 and "first task" steps 1-7 against the
real code, with a two-page plain-English summary for Prji, the 12-point card for all 14 games (what exists vs what is
new), and every statement marked Confirmed / Proposed / Assumption / Needs approval. Nothing is built until Prji
approves the design (prompt §20: architecture first, then one beginner proof of concept).

## 691. One bol notation for every game; the bol dictionary lives in the database — 28 Oct 2026

**Decision.** All Playground content uses the taal notation of migration 0018 (beats of '-' or 1-4 bols joined by '.',
bols matched in plain form, guna/tempo/vibhags as separate fields). lib/bols.ts keeps the stroke anatomy for the
drawings; a new table `play_bols` (migration 0065, design) says which bols Prji has approved, at which level, with
which recording, which sound alike and which are close pairs. A bol not approved there never appears in a generated
challenge. **Why.** The practice tools already share this notation; a second one would split the content.

## 692. Playground placement: one entry on the Practice tab, existing addresses kept — 28 Oct 2026

**Decision (proposal).** One "Rhythm Playground" card on the student Practice tab replaces the Games tiles; inside:
Listening, Rhythm, Voice, Kīrtan, Surprise me, My Playground progress, circular icons, unreleased games dimmed "Coming
soon". The tap pad, "Which bol?" and Echo me become Tap the Beat, Sound Detective and Echo Challenge at their present
addresses. Daily Sādhana Quest is the Daily Mission card (#673) with 2-3 Playground lines, not a second daily plan. No
separate Home icon while Home is the card layout; if the ring version returns, a circle links to the same screen.
Facilitators: Teaching → Rhythm Playground, plus a section on the Student profile.

## 693. The engine: seeded generation on the phone, checked by the server — 28 Oct 2026

**Decision (proposal; migration 0065 drafted in the design document only).** Tables `play_assets`, `play_bols`,
`play_templates`, `play_exercises`, `play_publications`, `play_assignments`, `play_student_settings`, `play_rounds`,
`play_skill_weeks`, `play_ratings`, bucket `playground-audio`. Rounds are generated on the phone from the published
pack with a seed (works offline, replayable for QA); curriculum guard (approved, published, level, approved bols,
ticked prerequisite, sounds present, BPM/guna in range), repeat guard (never back-to-back, recent exclusion, spaced
review 1/3/7 days labelled Review), low-content "Review practice", rules-based adaptive offers. `record_round`
recomputes correctness, refuses unpublished content and is idempotent. One row per round, not per question (free-tier
size). Only the head facilitator login approves and publishes; placeholders can never be published on LIVE.

## 694. Recognition and performance kept apart; recordings for review go through assessments — 28 Oct 2026

**Decision (proposal).** Results are recognition (quiz accuracy with sample size), measured performance (tap timing,
only on calibrated phones) or performance judged by a facilitator (0-3 rubric). Labels Exploring / Practising / Steady
/ Ready for Review with starting thresholds Prji may change after the pilot; "Ready for Review" asks for a class check.
"Send to my facilitator" reuses the assessment flow (an assessment marked `playground_game`), so review, receipt and the
30-days-after-review deletion already exist.

## 695. Audio: what works now, what needs research, what needs a new APK — 28 Oct 2026

**Decision.** Phases 1-3 are JavaScript only (fingerprint 23dc7e4a): recorded strokes through khol-samples, phrases
rendered at exact times (phone loop file, web audio clock), recorded clips, tap timing with calibration, recording with
permission at the moment of use. Research without a new APK: a web pitch line, the WebView microphone route on Android,
clip slow-down with pitch kept. A new APK only for native microphone analysis on Android (Phase 4), after a spike and
validation, bundled with another planned APK. Microphone off by default; no audio leaves the phone without "Send".

## 696. Playground retention and the free-tier numbers — 28 Oct 2026

**Decision.** As the lead decided 28-10: rounds 180 days, then folded into weekly per-skill summaries kept while the
account exists and deleted with it; sent takes deleted 30 days after review, 60 days if never reviewed (nightly
`playground_daily`), at most 2 open Playground takes per student, takes ≤ 90 s. Estimates: database ≈ 25 MB of rounds
for 200 students plus ≈ 15 MB of summaries a year (limit 500 MB); content audio ≈ 25 MB in Storage, takes ≤ 200 MB
worst case for 100 students (limit 1 GB shared). The lead checks current LIVE Storage use before Phase 3.

## 697. The content gate and TEST placeholders — 28 Oct 2026

**Decision.** No game reaches students before Prji approves 30-50 prompts across the first four games, the bol
dictionary, the real taals (the three in the app are placeholders), tempo ranges and guna per level, and his 9 stroke
recordings; kīrtan clips need each performer's written permission. Until then work and tests use synthesised strokes
shown as "TEST sounds" and placeholder rows that `publish_playground` refuses unless a TEST-only setting is on.
Recordings: own or written permission; CC BY with credit; NC or unknown licences not used (#473).

## 698. Build in five packages; Sound Detective is the proof of concept — 28 Oct 2026

**Decision (proposal; the lead allocates numbers).** W1 engine + shell (migration 0065), W2 student Playground +
listening games, W3 facilitator content manager, W4 rhythm games + Daily Quest, W5 voice, kīrtan, instruments and
microphone research. W1 first; W2-W4 in parallel; W5 last. All but W5's real content can start before the recordings.
First proof of concept: Sound Detective (beginner), end to end, because it needs only the 9 strokes, upgrades a game
students know at the same address and exercises the whole engine without timing or microphone uncertainty.

## 699. Open for Prji and Praveen — 28 Oct 2026

**Open.** The guna convention (1/2/4/8 or the app's 1/2/3/4) and guna 8; the four unverified bol mappings (tin,
kha/khe, ge/gi, dhi); whether Voice Companion / Vocal Sādhana Studio and the two kīrtan games share one engine each;
whether Playground time counts towards the weekly practice goal (suggested: no); the pilot group's members; label
thresholds; the privacy-notice line for game results and the consent form for recordings sent from games; who owns
accessibility QA and go/no-go. DECISIONS #720 onwards are free for the build packages.

## 700. The facilitator's Home is eleven modules — 28 Oct 2026

**Context.** Sarvesh Prji's "Facilitator Module 360° review" (27 Oct 2026, locked by the product owner): 11 circular
module icons on the facilitator's Home, an inverted tree (Home → module → feature), no "More" menu.
**Decision.** The facilitator's Home (G1, role value `guru`) shows, under the band (wordmark, motto, menu button, bell),
the Needs attention strip (#702) and eleven circles in this order: Admin · Coordinators · Students · Teaching ·
Inventory · Media · Events & Seva · Funds · Reports · Security & Audits · Settings, then "Did you know?". A phone shows
three to a row, 3 + 3 + 3 + 2 with the last two centred, each label under its circle, wrapping (never cut); a wide
window shows up to six to a row in the same order; when three cells would be narrower than a label needs (320 px at
large text, the browser at 200 %) two or one (`gridColumns`, lib/facilitator-modules.ts). The ring of eight of #350
leaves the facilitator's Home; the coordinator home (C1) keeps its ring and menu (task 4: only the unused `guru` and
`promotionsWaiting` props went from its `<StaffModules>` call). JS only, no new APK.

## 701. Module landing screens on one route; every way in moved, no screen moved — 28 Oct 2026

**Decision.** A circle opens `/staff/modules/<key>` (`app/staff/modules/[key].tsx`): the module's sections (the spec's
submodules) with rows, each opening a screen that already existed at its own address; Back returns to the module,
Back again to Home. A row that is a bottom tab with a copy for screens on top uses that copy (Check-in →
`/staff/mark-attendance`, Students → `/staff/class-list`, Follow-ups → `/staff/calls`, R4-01); Updates and Ishtagoshti,
which have none, are opened in the tabs with `router.navigate` (no second copy of the tabs; Back there goes Home, #359).
On a wide web window a one-line "Home › Module" stands above the sections. The tree is plain data
(lib/facilitator-modules.ts, labels checked by tsc as i18n keys); docs/SCREENS.md "Facilitator modules" has the
old → new map. **Why one route.** Eleven near-identical files would be eleven places to keep in step; an unknown key
says so.

## 702. Needs attention: the Today boxes, folded with one tap — 28 Oct 2026

**Decision.** The overview of SOP p.3 stays as a small strip, not a second menu: a heading button "Needs attention"
(amber when anything waits, the To do total shown while folded) over the three Today boxes of #351 (in class now, this
week, to do → To do). Open by default; folding is remembered on the device (local storage, no personal data). Teaching
keeps the Level-ups count the old ring had. The bell opens Notifications as before.

## 703. Media is "Coming soon"; Inventory is live — 28 Oct 2026

**Decision.** Lead decision 28-10: a module with nothing built is dimmed with "Coming soon" under its name, is not a
button (read as "Media, Coming soon", disabled) and has no screens; its address says Coming soon. Only Media is so: no
media library exists (announcement and lesson files belong to their screens). Inventory is built (instruments C19,
scan, stocktake, labels) and opens; its Phase 2 parts (maintenance, vendors, transport) are not shown at all rather than
as empty screens.

## 704. Modules are filtered by role; hiding is never the guard — 28 Oct 2026

**Decision.** Each module and row names the staff roles that may open it. Admin, Coordinators and Security & Audits are
the facilitator's; so are the rows All students, Import students, Referral Sources and Class settings. A coordinator who
types a module's address sees the "Only the facilitator uses this page" notice or the rows left for them. Every screen
keeps its own role check and row-level security refuses the data, as before; no policy changed. Today only the
facilitator's Home shows the modules, so the filter matters for typed addresses; it is ready for a coordinator Home in
modules later.

## 705. One tree: the side menu lists the modules; the tabs stay — 28 Oct 2026

**Decision.** The facilitator's side menu (from every tab's header) lists the same modules in the same order, each
opening its landing screen; Media is left out of the menu (nothing to open). Notifications and My profile are in
Settings → Personal and stay on the bell and the person card. The bottom tabs (Home, Check-in, Students, Follow-ups,
Updates) stay: they are shared with the coordinators and are the daily shortcuts; in the tree each of their screens has
its one module. Every destination of the old ring, menu and tabs is in exactly one module (tests/facilitator-home.test.mjs).

## 706. No "Guru" anywhere a person reads it; the internal name stays — 28 Oct 2026

**Context.** The SOP review: "never use Guru in user-facing screens, emails, notifications, error messages,
documentation or role display". **Decision.** Amends #40 and #664 for Telugu and Hindi: the role is ఫెసిలిటేటర్ /
फ़ैसिलिटेटर (the words of the website and the translation glossary), with గారు after it in Telugu where the sentence had
గురువుగారు (149 te and 143 hi strings); where English says "your teacher(s)" Telugu says ఉపాధ్యాయులు and Hindi शिक्षक.
గురు / गुरु as Thursday (duty weekdays, the duty-hours example) stay. Past What's new entries and the website's app and
classes pages (en/te/hi) changed too. The database writes two te/hi notice lines with గురువుగారు / गुरुजी, so
migration **0067** replaces `promotion_push_line` and `team_push_line` with those four lines changed (English and
privileges unchanged; no table, policy or row). **Kept on purpose:** the role's value `guru` and every table, column,
function (`guru_ids`, `guru_read` ...), file and route name and the screen codes G1-G16 (#40: renaming means a migration
on both projects for nothing anyone sees); code comments; the privacy notice's gloss "facilitator (Guru)" in 0060 and on
the website's privacy pages, which is versioned legal text (drop it in the next notice version); docs/print/sop-guru
and docs/guide, which the app does not link (re-render as "Facilitator Guide" with the new Home's screenshots: follow-up).
Telugu and Hindi are drafts for the native review.

## 707. The spec's plain relabels — 28 Oct 2026

**Decision.** Applied where it is a word only: Set-up → Administration, Class fund → Funds, Change history → Audit
History, App errors → App Diagnostics, How students found us → Referral Sources, Sign-in codes → Sign-in Security, Make a
coordinator → Approve coordinator (en/te/hi; the sentences naming the old menu path follow). Not applied: All students →
Students (the module is Students; the database list keeps "All students" so a module and its row do not share a name);
Mentees → Assigned students and Level-ups → Level Advancement (the spec allows both to stay); Switch off → Deactivate
access and Delete this record → Delete duplicate record (the coordinator-disable and erasure screens belong to the
facilitator-p0 work, #710-#719); Ishtagoshti keeps its name, "(Śloka Study)" added on its Teaching row.

## 708. Module colours keep the five families — 28 Oct 2026

**Decision.** No palette change (lead decision 28-10: indigo #22307A + gold #FFC845 header). The circles use the families
of #368: green Coordinators and Students, purple Teaching, teal Inventory and Funds (as their screens), orange Media and
Events & Seva, blue Reports; Admin, Security & Audits and Settings are set-up, saffron. Pink and indigo stay unused.

## 709. Left out on purpose — 28 Oct 2026

**Decision.** Not in this change: a coordinator Home in modules (task 4: unchanged); search across modules (UAT-NAV-09);
breadcrumbs beyond the one line on a wide web window; three instruments, Media library, Inventory maintenance and
vendors (Phase 2 in the spec); the website upload of the en/te/hi app and classes pages (with the next website release);
re-rendering the facilitator SOP PDF. No new personal data and no privacy-notice change.

## 710. Nobody decides their own fund entry, and a refused try is logged — 28 Oct 2026

**Decision.** Sarvesh's Facilitator Module review (27-10-2026, FUND-01: "blocked and logged"). `decide_fund_entry`
already refused the maker (#80) but only inside the function, and the refusal left no trace (a raised error undoes
any log row in the same call). Now (0066): a table rule `fund_entries_not_own_decision` (an approved or declined entry
was decided by someone other than its maker, whatever writes it), and `decide_fund_entry` returns `{ status }` or
`{ refused: own_entry | not_approver }` instead of raising for those two, writing an `audit_log` row with action
`REFUSED` (who, which entry, approve or decline). The Guru sees them on Change log (filter "Refused try"). Other
refusals (not a fund keeper, already decided, no reason) still raise. **Older app:** it ignores the answer, so a refused
self-approval looks done there, but nothing changes in the ledger; the app has never offered Approve on one's own entry.

## 711. A reversal after a month's report changes nothing in that month — 28 Oct 2026

**Decision.** FUND-02 was already true (#80): entries are never changed or deleted; a reversal is a new entry dated
the day it is made, linked by `reverses_id`, so a closed month's total stays and the balance reconciles. 0066 adds the
proof (smoke: a last-month income reversed this month: the month's total, the original row and the balance) and no
code.

## 712. An erasure takes two Gurus; how the person asking was checked is recorded — 28 Oct 2026

**Decision.** PRIV-01 ("dual authorization for erasure, verified requester"). `approve_data_erasure` (the first Guru)
records `identity_check` — `own_login` (filed from the person's own signed-in app; only then), `id_seen` (the person's,
or for a child the parent's, ID seen at the desk), `registered_email`, `phone_callback` — with `approved_by` and
`approved_at`; a code only, never a document number (as at Accept). The Guru who recorded a desk request (`made_by`)
does not approve it. `act_on_data_request` then erases only an approved request and never by the approver, so two
different staff members always take part; both, the times and the check stay on the bare request after the erasure.
**Considered:** a coordinator as second approver — rejected for now: coordinators do not read data requests (#554).
With one active Guru login the owner erases in the SQL editor (OPERATIONS "Erasure request"), as before.

## 713. The app cannot erase without the request — 28 Oct 2026

**Decision.** `erase_student` and `erase_login` lose `execute` for `authenticated`: a Guru calling them straight from
the API would skip #712. They still run through `act_on_data_request` (security definer), the retention jobs (0060)
and the SQL editor. `withdraw_consent` and the photo withdrawal stay one-person (reversible in effect; not erasure).

## 714. An import can be all or none, and checked with the database first — 28 Oct 2026

**Decision.** STU-01/02. The preview (every row checked before anything is saved), duplicates (in the file and against
saved records), under-18 rows refused to the parent's form and undo were already there (#46, #326). Added:
`import_all_or_none(rows, dry_run)` runs `import_students` inside a step that is undone when any row is refused (the
good rows come back `held`) or always for a dry run; so "Check with the class database" shows what the database would
refuse before anything is written, and roll numbers are not used up. The Guru chooses **Partial** (each good row on its
own, as before) or **All or none** (only for a file without problems, at most 500 rows); the result says which. The rows
with problems download as a CSV — the file's own columns plus "Problem" — to fix in Excel and import again (before and
after the import). `import_students` itself is unchanged, so older apps keep working.

## 715. A login switched off is signed out — 28 Oct 2026

**Decision.** AUTH-02. Mentees must already be moved first (`has_mentees`, 0014) and phones and browsers were already
forgotten (0039); every rule already refused a switched-off login. Now its Supabase Auth sessions and refresh tokens
are deleted in the same step (trigger `profiles_end_sessions`), so the next token refresh fails and the app signs out;
the access token it still holds (at most an hour) opens nothing. Proved on TEST's real Auth tables in a rolled-back
transaction (a coordinator's 15 sessions and 43 refresh tokens → 0). Switching on again does not restore sessions: the
person signs in again.

## 716. The error log keeps only error class names — 28 Oct 2026

**Decision.** AUD-02. The log already held no message, id or address (#585). An error's *name* could still be anything
a library set (a person's name, a number, a token). The app now sends a name only when it reads as an error class
(a capital, letters only, ending in Error or Exception), else "Error"; the database applies the same rule
(`client_error_name`), so an older app cannot store one either.

## 717. Level-up decisions were already conflict-safe — 28 Oct 2026

**Decision.** LEVEL-01 ("two reviewers decide at once → one result"). `decide_promotion` (0017) locks the nomination
(`for update`), refuses a decided one (`nomination_closed`), locks the student and refuses `level_changed`; one open
nomination per student (`promotion_one_open`). The second of two simultaneous Gurus waits for the first and is then
refused. No change; the smoke test covers the second decision (PGlite has one connection, so not the wait itself).

## 718. New words say "facilitator" — 28 Oct 2026

**Decision.** The new English strings (approval, import modes) say "facilitator", never "Guru" (Sarvesh's review;
the wider relabel is facilitator-home's, #700-#709). Telugu and Hindi are drafts for the native review
(docs/TRANSLATIONS.md). The privacy notice needs no new line: no new personal data (the identity check is a code).

## 719. Left for later — 28 Oct 2026

**Decision.** Not in 0066: a reason and approver for a manual level change (SOP p.8), coordinators scoped by centre
(AUTH-03: one class today), export logging (EXPORT-01), a TEST two-session walk of LEVEL-01. Listed in
NOTES_facilitator_p0.md.

## 720. Playground content: coordinators write drafts, only the Guru approves and publishes — 28 Oct 2026

**Decision (W1, migration 0065).** The four content tables (`play_bols`, `play_assets`, `play_templates`,
`play_exercises`) are written directly by staff under row-level security, like `taals` and `practice_links`, instead of
the design's `play_save_*` functions: one trigger per table checks the content, and one shared trigger
(`guard_play_status`) owns status, revision and publication. Coordinators move rows between draft and in_review; only
the Guru (or the SQL editor) approves, retires or takes a row out of approved/retired (`approval_guru_only`); editing
an approved row sends it back to in_review with revision + 1 and out of the published set; `published_in` and
`first_published_in` are set only inside `publish_playground` (a session flag the app cannot set: the trigger also
checks that it runs as the owner). `publish_playground` gives every approved, unpublished row one new version number
and refuses placeholder rows unless the TEST-only setting `playground_allow_placeholders` is on. The four Playground
settings are not in `guard_setting`, so the app cannot change them: placeholders and the Playground switch are set in
the SQL editor only. Students read approved, published, non-placeholder rows directly; the app reads the pack through
`playground_pack` (which honours the TEST setting). A change reaches phones with the next publish (the pack is cached
by version). Deleting: only a draft never published, by the Guru or its author.

**Prji, 28 Oct 2026 (relayed by Praveen; design D1):** the design is approved as a **preliminary version** — build it,
Prji tries it on TEST, then it is refined. Hence rules and thresholds stay data, not code: label numbers in the setting
`playground_labels`, steps and round length in `play_templates`, tempo ranges and guna on each exercise.

## 721. Rounds: one row each, saved by `record_round`, idempotent by the phone's id — 28 Oct 2026

**Decision.** A round is made on the phone with a seed (`hash32(student|game|day|round of the day)`, mulberry32) and
saved as one `play_rounds` row with short item keys (e, r, q, a, ok, rp, ms, rv, tr) and a `skill` column (one
template = one skill per round; the labels count per skill). `record_round` takes rounds started in the last 14 days,
1-40 items, each of an exercise of the round's game that has been published at least once in a version up to the
round's (so an offline round survives a later edit) and is not a placeholder unless TEST allows it; the revision played
is kept when it is not newer than today's. The same id again answers `duplicate` and changes nothing; another student's
id is `round_id_taken`; at most 200 rounds a day; a withdrawn record is refused. Students never update or delete rounds.

## 722. The Playground notation: dictionary ids in the taal shape — 28 Oct 2026

**Decision.** Exercises are written with the dictionary's ids (plain forms, a-z, 1-10 letters): a beat is `-` or 1-4 ids
joined with `.`, as `guard_taal`; answers and distractors are the same beats joined by spaces (`te.re ka`). The class's
spelling is the dictionary's `written`, used for display only. Two answers sound the same when every bol matches the
other's or is in its `sounds_like` list (either way round, not transitive), the same rule in `lib/playground/notation.ts`
and the database's `play_same_answer`.

**Prji, 28 Oct 2026 (design D2):** the first dictionary is the four bīja strokes of the seed mantra **te | re | khe | ta**
("khe" is the spelling). The TEST seed approves only these four (still `placeholder = true` until his recordings exist)
and writes every exercise with them; tin, kha, ge/gi, dhi and the other bols stay out of the first pack. A TEST project
seeded earlier with 14 bols gets the others and their exercises retired (TEST pack version 2, 28-10-2026). With four
bols Sound Detective has four items, so its rounds show "Review practice" (#724) until more bols are approved.

## 723. The curriculum guard and the checks, on the phone and again on the server — 28 Oct 2026

**Decision.** `lib/playground/eligibility.ts` applies §8.5 rules 1-5 and 7 (levels compared by id, as the practice
tools do; one level up with `level_up_ok`; a bol must be in the pack and taught at or below that level and soundable —
an approved recording or a stroke `lib/bols.ts` knows). The challenge check drops a challenge whose answer is not among
the cards, whose cards sound alike, whose gap is a rest, whose tempo is outside the range or whose guna is not allowed;
a drop is reported to App errors as `PlayCheck_<reason>_e<exercise>_t<template>_v<version>` (kind `unhandled`, screen
`/student/playground`) — never the student, seed or answer. The server re-marks Sound Detective, Missing Beat, Rhythm
Builder, Tempo Detective and Sound Explorer answers from the exercise and the saved question (`play_expected`); a
changed `ok` does not count; Tempo Detective tempos outside the range refuse the round. Timing and self-check items keep
the phone's mark.

## 724. Repeat guard, spaced review and the low-content fallback as specified — 28 Oct 2026

**Decision.** §8.6-§8.7 implemented in `lib/playground/repeat-guard.ts`: never back-to-back (also across the previous
round), recent exclusion K = min(8, pool − round length), fresh items (3+ days) three times as likely, assigned skills
twice, review boxes 1/3/7 days (a right review moves on, a wrong one starts again; three right reviews end it), at most
a third of a round review and labelled; low content below max(6, 2 × round length) repeats items without making any up.
`pickDailyGames` gives the Daily Mission / Surprise me no skill twice in a row and not yesterday's set. History = this
phone's rounds (30 days, kept in local storage) merged with the server's last 30 days.

## 725. The generator only selects and transforms — 28 Oct 2026

**Decision.** `lib/playground/generator.ts` builds Sound Detective (single bols with distractors from the exercise's
list, close pairs at the close-pair step, the other head at step 1; phrases with distractors from the exercise or other
eligible phrases of the same length — never a new phrase), Missing Beat (1-2 gaps on non-rest beats; single-beat cards),
Rhythm Builder (the sequence's tiles plus extra tiles that sound like none of them), Tempo Detective (two tempos inside
the range, rounded so the second never leaves it; a range too narrow for the step drops the challenge) and Sound
Explorer (instrument cards). Other games get the approved sequence at an approved tempo and guna, no cards; W4/W5 add
their transforms. Rounds are 4-8 (template `roundLen`, default 6; the Daily Mission may ask for fewer).

## 726. Adaptive offers are advice only; the facilitator's limits win — 28 Oct 2026

**Decision.** `stepAdvice` offers harder after 2 rounds in a row at the step with ≥ 80 % right and ≤ 1 replay per item,
easier after 2 below 50 %, nothing for mixed results; after 14 days away it starts one step lower; by hand the student
picks any step up to the highest reached; the facilitator's minimum and maximum (student settings and assignment, the
narrower) always win; timing games offer nothing on an uncalibrated phone. Correctness and replays only, never speed.

## 727. Labels worked out in the app from rounds; numbers in a setting — 28 Oct 2026

**Decision.** `lib/playground/labels.ts` gives Exploring / Practising / Steady / Ready for Review per skill (§12.2),
recognition and timing separately; timing counts only rounds measured on a calibrated phone, so an uncalibrated phone
never shows a timing label above Exploring (DYN-08). The thresholds are the setting `playground_labels` (sent with the
pack; missing numbers fall back to the defaults) so Prji changes them without an app update. Staff get rounds through
`staff_playground_progress` / `staff_playground_class` and use the same code, so the student and the facilitator see
the same label. `play_ratings` (0-3, a staff member never rates their own record) hold the judged skills.

## 728. Offline: pack cache and round queue; shared shell components — 28 Oct 2026

**Decision.** The pack is cached in local storage by version (`playground_pack(p_have_version)` answers null while it
is unchanged); finished or left rounds wait in their own queue (not lib/offline-queue.ts, whose kinds are fixed) and are
sent oldest first while their login is signed in, one sending at a time; saved and refused rounds leave, rounds older
than 14 days are dropped. Sign-out deletes the queue, the history and the pack (lib/device-traces.ts). The five shell
components (`GameShell`, `ChoiceCards`, `FeedbackPanel`, `RoundSummary`, `InstructionsPreview`) use kind words only
("That's it!", "Not yet — listen again"), icon + word for every result, targets ≥ 48 dp (cards ≥ 88), no animation,
screen-reader labels and one announcement per result; their strings are `playEngine.*` (te/hi drafts for review).

## 729. Retention: 180-day fold, 60-day unreviewed game recordings — 28 Oct 2026

**Decision.** Job `mridanga-playground` (`playground_daily`, 21:30 UTC = 03:00 IST, after `mridanga-retention`) folds
rounds older than 180 days into `play_skill_weeks` (Monday weeks, India time; opportunities, right answers, rounds, the
calibrated timing averages) and deletes them. Every student table cascades with the record, so `erase_student` and the
retention job of 0060 remove Playground data with the person. Recordings sent from a game: `submission_file_expired` is
replaced with 0017's rules plus "never reviewed and sent 60+ days ago, when its assessment has `playground_game`"; the
existing clean-up chain deletes the file. Not in 0065 (W5, with the send wiring): the cap of 2 open takes per student
and the 90-second limit (#696). `my_data_summary` (0059) does not list Playground data yet — a follow-up for the lead.

## 730. Rhythm Playground home: one card on the Practice tab, games by group, unbuilt ones dimmed — 28 Oct 2026

**Decision (package W2).** The Practice tab's Games tiles are replaced by one large "Rhythm Playground" card
(`/student/playground`). The home lists Surprise me, then the games as circles three to a row by group — Listening,
Rhythm, Voice, Kīrtan — and My Playground progress. A game not built yet has no address: dimmed, "Coming soon", read
out as "…, coming soon", not a button. Tap the Beat and Echo Challenge open today's tap pad and Echo me at their old
addresses until W4 changes them; Surprise me waits for W4. The Daily Sādhana Quest is the Daily Mission card, not a
tile. A "TEST sounds" badge shows on every Playground screen while no recording is bundled or the pack is a TEST
placeholder pack (§19.3).

## 731. Sound Detective at the address of "Which bol?" — 28 Oct 2026

**Decision.** `/student/which-bol` opens Sound Detective: **Rounds** (the engine's seeded rounds from the published
pack, 2-4 cards, saved for progress) and **Free play** (the old quiz of #471 on the level's taals, nothing kept). The
facilitators' `/staff/which-bol` keeps the old quiz until W3's preview. A card (W1's ChoiceCards) shows the bol as the
class writes it and the hand(s); it plays its own beats, so its sound is its label (the hand drawings stay in Free play). Two tries per card: "That's it!",
"Not yet — listen again", then the answer is shown and played; every card can be heard after the answer. Nothing
sounds until the student taps Start (then Next plays the next prompt).

## 732. Missing Beat, Rhythm Builder, Tempo Detective on the screen — 28 Oct 2026

**Decision.** The engine (W1, lib/playground/generator.ts) builds every round; the screens only play and check it
(lib/playground-games/listening.ts). **Missing Beat:** the approved sequence with the gap beats silent, "?" on the grid
(hidden when the step hides it), one pick per gap in order, then the whole pattern with the grid filled. **Rhythm
Builder** (#733): tap a tile, then its place; tap a place to take it back; rests are already placed; vibhag lines while
the grid shows; Play mine; Check marks the places that sound different ("listen" + Hear place n again); a tile that
sounds the same (ke for ka) is right; after the last try the approved order is placed and played. **Tempo Detective**
(#734): A, two quiet beats, then B on one player clock (same strokes, B spaced by bpmA/bpmB); Hear A / Hear B alone;
after the answer a still picture of both as beat dots spaced by time (nothing moves, so reduced motion needs nothing
more). Missing Beat's "which place was changed?" step and Sound Detective's phrase steps come with content and a
template step for them; the screens already play phrase cards.

## 733. Rhythm Builder: tap-to-place, no dragging — 28 Oct 2026

**Decision.** See #732. Every tile and place is a button with its contents in words ("Place 3: te·re", "Place 2:
rest", "dhā, placed"), so a screen reader and a keyboard can build the pattern; the same bol twice is two tiles.

## 734. Tempo Detective plays A and B on one clock — 28 Oct 2026

**Decision.** See #732. One rendered pattern for A and B avoids a gap of unknown length between two player starts on
phones (expo-audio cannot schedule a start), so the only difference the student hears is the tempo.

## 735. My Playground progress: label words, recognition and performance apart — 28 Oct 2026

**Decision.** One row per skill: its name, the label word with an icon (Exploring / Practising / Steady / Ready for
Review, never a number alone), "12 of 15 right in the last weeks" (recognition) or rounds measured (timing), the trend
against two weeks before, timing confidence, the last day, and "Practise this" for a built game. Recognition and
performance are two blocks under "Playing on your khol is checked by your facilitator in class." No points, no
comparison, nothing "lost". Worked out on the phone from the saved rounds and those on the phone (W1's labels.ts), so it
shows offline too.

## 736. One round hook and frame for the listening games; rounds saved through the phone's queue — 28 Oct 2026

**Decision.** `screens/playground/use-game-round.ts` loads the pack (the phone's copy first), the student's state and
rounds, offers the steps W1's adaptive rules allow (warm-up after 14 days, harder/easier offers after the round — the
student chooses), asks the engine for a round with the seed of student + game + day + round of the day, and counts
tries, replays and time. A round is queued on the phone when it ends, or with the items answered so far when the
student leaves mid-round, then sent by record_round when online (W1's round queue; a resend saves nothing twice).
Recognition counts the first pick only (a second-try right is practice). `screens/playground/game-parts.tsx` puts the
games in W1's shared components (GameShell, InstructionsPreview, ChoiceCards, FeedbackPanel, RoundSummary) with the
step choice; `screens/playground/playground-data.ts` is the one file that calls W1's data module. W1 does not keep the
student's state on the phone, so W2 keeps the last one (`lib/playground-games/state-cache.ts`, wiped at sign-out) and
the games open offline from the cached pack; "offline" means the state could not be read (the pack loader also says
`fromCache` when the version is unchanged). Dropped challenges are reported (`reportDroppedChallenges`). Found in the
TEST walk: `syncRounds` (W1, round-queue.ts) on an empty queue runs to its `finally` before `sending` is assigned, so
`sending` keeps a finished promise and every later sync returns `{saved: 0}` without sending; W2 syncs on opening only
when this login has rounds waiting. The fix belongs in round-queue.ts (clear `sending` after the assignment, e.g.
`.finally(() => { sending = null; })` on the promise) — for W1/the lead.
## 737. Prji's first pack: the bīja strokes te | re | khe | ta; the design is a preliminary version — 28 Oct 2026

**Decision (Prji, relayed by Praveen through the lead on 28-10).** The Playground design is approved as a
**preliminary version**: build it, Prji tries it, then it is refined. The first pack uses only the four bīja strokes
**te | re | khe | ta** ("khe" is the spelling) in all four listening games: Sound Detective with 2, then 3, then 4
cards at the Beginner steps; phrases only from these four in approved patterns. W1 seeds them. The screens need no
change for it: in the app te and re are dayan strokes (re sounds as ra), khe is the closed baya stroke (as ka — one of
the four mappings Prji still confirms, §16.2 D2) and tā is dayan, so all four play; with only four items a round shows
"Review practice", and Rhythm Builder adds no extra tile when no fifth bol exists (tested in
app/tests/listening-games.test.mjs).

## 740. Facilitator Playground under Teaching → Rhythm Playground — 28 Oct 2026

**Decision (package W3).** One row "Rhythm Playground" in the Teaching module's Practice section
(`lib/facilitator-modules.ts`) opens `/staff/playground`: where the content stands (the version students have, what
waits for approval, how many changes the next publish brings) and the rows Content library, Waiting for approval,
Publish (head facilitator only), Assignments, Class progress, Recordings to review (the existing Assessments list,
#694). Every screen is open to both staff roles; the database decides (0065). The word "Guru" is never shown: the
approver is "the head facilitator" in en/te/hi (the role value stays `guru`). The Playground settings (on/off, pilot
group, label thresholds) stay SQL-editor only as 0065 made them (`guard_setting`); the screen says so in one line.

## 741. Content library: four tabs, status words, pool sizes — 28 Oct 2026

**Decision.** Bols · Sounds · Exercises · Templates (segmented, the tab in the address), each row with Draft /
Waiting for approval / Approved / Retired, its revision, "not published yet" for an approved row outside the pack and
"TEST placeholder"; retired rows last. The Exercises tab shows per game and level the approved and waiting counts
and "enough for variety" against max(6, 2 × round length) (§8.7), so thin pools are visible.

## 742. Editors write drafts straight into the tables; 0065's triggers keep the rules — 28 Oct 2026

**Decision.** The bol, sound, template and exercise editors insert and update `play_bols`, `play_assets`,
`play_templates`, `play_exercises` directly (staff RLS; no save RPCs): the triggers already check the notation,
approval, revision + 1 when an approved row changes, and who may change status. Each editor waits for the content
and then mounts its form once (keyed by the row's `updated_at`), so a status change reloads the saved values. A bol's
id is typed once (the plain form, a-z) and then fixed. Every row the app inserts has `placeholder = false`
(§19.3): placeholders come only from the TEST seed, so nothing the app saves can block a LIVE publish (tested).

## 743. Sounds: the file is chosen once; licence details before approval — 28 Oct 2026

**Decision.** Upload a sound = kind, then an m4a/mp3/wav file of at most 15 MB (the existing document picker of
assessments, renamed into `<kind>/<random uuid>.<ending>` as 0065's storage rule asks) or, for a stroke, a stroke the
app carries (`bundled_key`); then licence, performer, where the signed permission is kept, the CC BY credit, the
recorded tempo, instruments. The row is written after the upload; if it is refused the file is removed again. The
file of a sound is never replaced (a new recording is a new sound; old rounds stay explainable). Play uses a signed
link of an hour. Not done: measuring length and loudness on upload (§10.1) — `duration_ms` stays empty for now.

## 744. Templates are typed as JSON — 28 Oct 2026

**Decision.** A template = game, skill, answer mode, level range, steps and params. Steps and params are JSON text
fields with the known keys listed under them (choices, len, grid, gaps, closePairs, otherHead, extraTiles,
tempoDiff, same; roundLen, reviewShare, gunaByLevel), checked as 0065 does (1-20 steps, each a distinct whole step).
**Why:** a game needs one or two templates, written once by whoever sets the game up; a form per key would freeze
the keys the game packages are still adding. A new template of a listening game starts from the TEST seed's steps.

## 745. Exercises: the class's spelling in, dictionary ids stored; preview of five generated variants — 28 Oct 2026

**Decision.** The pattern is typed as the class writes it ("Te.Re khe tā -", `notation.ts plainBeat`) or copied from a
taal, shown on the beat grid; the answer is asked only where it can differ from the pattern (Sound Detective's bols,
Rhythm Builder's order, Sound Explorer's instruments; 0065 `play_expected`); distractors one per line; tempo range;
guna 1/2/3/4/8; recorded prompts; attribution. The editor warns which bols are not approved yet. **Preview generated
variants** (§10.1, DYN-06): W1's `generateRound` on a pack of this exercise alone (as the form stands, unsaved), every
non-retired bol and its template, at a chosen step, with five fixed seeds (101…505) so two facilitators see the same
samples; each sample in words (plays, silent place, second tempo, cards, answer) or why the check dropped it. Kept to
one skill per exercise in the form (the table allows up to 5). Not in the form yet: the prerequisite syllabus item.

## 746. Approval: the editor is the approval screen — 28 Oct 2026

**Decision.** "Waiting for approval" lists every `in_review` row, bols first (an exercise needs its bols approved),
oldest first; a row opens its editor, whose Approval section shows the buttons the login may use: coordinators Send
for approval / Take back to draft; the head facilitator Approve, Send back to draft, Retire, Bring back as a draft;
Delete for a draft never published (its author or the head facilitator, asked twice) — `play_set_status` and the
triggers check it again. **Not done:** "send back with a note" (`play_set_status` has no note; it needs a migration —
proposed 0069 if Prji wants it) and "Flag a problem" by a coordinator on an approved item (the trigger refuses a
coordinator moving an approved row; also 0069 material).

## 747. Publish shows what the next version changes — 28 Oct 2026

**Decision.** Head facilitator only (others see the existing "only the facilitator" notice). The version students
have and its note; New in the next version (approved, never published), Changed (approved, a new revision), Leaving at
the next publish (published before, now retired or back in review, changed since the last publish — phones keep them
until the next version); the pool sizes; a TEST-placeholder warning; a note (≤ 300); Publish (disabled with nothing
to publish). The database refuses placeholders on LIVE (`placeholders_not_allowed`).

## 748. Assignments: level, group, or one student from the profile — 28 Oct 2026

**Decision.** Game, optional skill, for a level or an active group (or one student when opened from that student's
profile), optional lowest/highest step, due day none / 1 / 2 / 4 weeks (no date field), a note. The list shows running
and coming assignments (no due day, or due today or later) with End (deletes the row, asks twice). Any staff login.

## 749. Class progress and the Student profile's Playground section — 28 Oct 2026

**Decision.** Class progress: a level or a group; per student the label of each skill (W1's `labels.ts` on the 30 days
of rounds from `staff_playground_class`, with the published pack's label rules and templates) with its sample size
and the last day played; students with a "Ready for Review" first, then the longest without practice (never played
first), then by name — never by score. A row opens the Student profile. The profile's "Rhythm Playground" section
(after Practice): the same labels, the assigned games, the facilitators' ratings (`staff_playground_progress`), and —
not on the facilitator's own record (0053) — Rate a skill (performance skills only, 0-3: not yet / beginning / nearly
there / shown, a note; `play_ratings`) and Assign a game. Rubric words are drafts for Prji (§18.2 item 6).

## 750. Rhythm games: a run of taps graded on the phone, timing only from a tuned phone — 28 Oct 2026

**Decision.** Tap the Beat (pulse mode), Echo Challenge, Tāla Cycle Master and Rhythm Switching (docs/RHYTHM_PLAYGROUND.md
§7.2, §7.3, §7.11, §7.12; package W4) share `screens/playground/use-rhythm-round.ts` (as W2's round hook, #736: the
phone's pack and state first, the adaptive steps, a seeded round, the round queued for record_round, kept when the
student leaves) and `use-timed-run.ts`: the run plays once through on the practice player (one loop holding the whole
run plus a quiet beat, so nothing sounds again after the end), taps are read on the player's own clock and moved by
the phone's tuned delay, as the tap pad does (#470). `lib/tap-grading.ts` gains `gradePulse` (each tap to the nearest
pulse within 0.4 beat / 250 ms; taps in silent cycles count against the hidden pulse), the median error and the spread
of the middle half, and the words "Steady" / "A little rushed" / "A little slow" (median within 45 ms, 80 ms with the
facilitator's "Relaxed timing"). The round's `timing` is that median and spread with `calibrated` = the phone was tuned;
an item's `ok` is set only on a tuned phone (otherwise the run is practice only, no timing word shown, spec §11).
Tap the Beat and Echo Challenge keep their addresses: Rounds on top for students, the old play-along / call and
response as Free play (the staff routes are unchanged). Pulse steps (template data): clicks on every beat → guide hidden
→ silent cycles → clicks only on sam. **Why.** One timing path for all four games, on the clock the tap pad already
trusts; the design's rule that timing is evidence only when the phone is calibrated (§12.1).

## 751. Rhythm Switching: guna sections in one loop; guna, orders and tempo caps are data (D3, D4) — 28 Oct 2026

**Decision.** `lib/practice-pattern.ts` `gunaSections` plays the cycle's sections one after the other at guna 1, 2, 3, 4
or 8 (beat b holds written beats b·g … b·g+g−1, as the taal player's layakari, #491), so the pulse is identical in every
section. What a level may use is the template's data, not code: `gunaByLevel` (W1), `orders` (the approved switch
orders), `gunaBpmMax` (a guna is never offered above its cap) and `cyclesPerSection` (fewer when the loop would pass the
phone's 160 s). Without `orders`: up through the playable guna and back to 1. Step 1 names the guna of a second part;
steps 2-3 tap the beat through the switches with and without the section's name and dots; feedback per section.
**Default (TEST seed only, for Prji's D3/D4):** Beginner 1-2, Intermediate 1-2-4, Advanced 1-2-3-4-8; orders 1-2-1,
1-2-4-1, 1-2-4-2-1, 1-2-4-8-1; guna 4 up to 90 bpm, guna 8 up to 60; tempo 56-72 from the exercises. **Why.** The class's
convention (1/2/4/8 or 1/2/3/4) is open; Prji sets it as content without a new app release.

## 752. Echo Challenge: calls from the bank, answers graded by order of hands — 28 Oct 2026

**Decision.** `lib/echo.ts` `echoCall`: an approved sequence (2-8 beats) as the call, optional silent cycles (recall
after a delay, step data `delay`), then an answer window exactly as long as the call, with soft clicks when `clicks`.
Pad answers: only taps inside the window count; the order of hands (left = bāyā, right = dāyā; both at once in any
order) is the recognition answer saved (`a` = "R R L R"), each stroke's timing goes to the round's timing (tuned phones).
Khol answers: the student's own "Did it sound the same?" after hearing the call again, saved with no right or wrong
(spec: not scored by the app). "Send to my facilitator" for khol answers is left to the assessments wiring (W5, §10.4).

## 753. Tāla Cycle Master: restart place, cycle count, sam taps — 28 Oct 2026

**Decision.** Steps (template data `ask`): "restart" — the sound starts at a random beat after sam and runs to the end
of the next whole cycle; the student taps the place where the cycle starts again (bols shown, then dots only; every
place where the whole cycle begins is right, for cycles that repeat inside themselves); "count" — 2-4 cycles, how many
(the answer as "3 cycles = 12 beats"); "sam" — one cycle sounds, 1-2 go on in silence, tap every sam. The question
comes from a generator seeded with the round's seed and the challenge's place (`challengeRng`), so a replay asks the
same (DYN-06); nothing is saved beyond W1's query and the answer. Skill `rhythm.cycle_sam` (timing evidence from the sam
steps; the pick steps are counted as items). Kartāl-only accompaniment (§7.11 progression) waits for content.

## 754. Daily Sādhana Quest on the Daily Mission card — 28 Oct 2026

**Decision.** `lib/today-practice.ts` `questLines`: 2-4 lines (template `daily_quest` param `lines`, default 2) under
the khol line, which stays first: the weakest skill first (assigned games, then never played, lower label, longest
unpractised), then a game of the other group (one listening, one rhythm), then the next weakest, never a skill twice in
a row; ties broken by a generator seeded with student + date; picks worked out over the last 7 days so a day is never
the day before's games. A line ("Listen · Missing Beat · 2 min") opens the game with `?mode=daily&len=N` (3 challenges
for listening, 2 for rhythm, `screens/playground/round-params.ts`), the round is saved with mode `daily`, and the line
is ticked when such a round exists today (saved or on the phone). W2's listening hook reads the same parameters. The
card loads the quest with a dynamic import (`screens/playground/daily-quest-load.ts`), only for students, so the home's
first web download does not grow (#650); without the Playground (LIVE before release, offline first open) no lines
show. No penalty or "missed" wording; D7 stands (Playground time is not khol practice time). **Why.** §7.10 with no new
table: the rounds already say what was played.

## 755. Surprise me — 28 Oct 2026

**Decision.** `/student/playground/surprise` (the home's row, no longer "Coming soon"): three games the student can play
now (an approved template for their level and an eligible exercise), chosen with W1's `pickDailyGames` (no skill twice
in a row) seeded with student + day + the surprise's number; "Another surprise" after all three, not the same three.
Each line opens its game with a one-challenge round saved with mode `surprise`. The student switches Surprise me off
and on there (`play_set_surprise`); off, no picks are shown. **Why.** §7.15; one round of three games is three rounds
because a round belongs to one game (record_round).
## 770. My data lists the Playground (0068) — 28 Oct 2026

**Context.** W1's 0065 added student data (game settings, rounds, weekly skill summaries, ratings) that the person's
data summary (0059, #550) did not show: a gap in the right to know what the class holds (DPDP Act s.11), flagged by W1.

**Decision.** A separate migration 0068 replaces `my_data_summary` with a `playground` part (counts and dates of rounds
by game rather than every round's items — the rounds are many and hold only taps and answers; weekly summaries and
ratings in full). Separate from 0065 because 0065 is already on TEST; 0068 goes to LIVE right after 0065, with the
Playground release. Erasure already removes the rows (`on delete cascade` from `students`). Migration numbers: W5 takes
0069 if it needs one (0070/0071 stay face).

## 771. The student home: the ring back under the Daily Mission — 28 Oct 2026

**Decision.** The team (Sarvesh Prji) and Praveen 28-10-2026, after comparing both homes on the phone. Amends #674: under
the band and a slimmer Daily Mission card (one row and a thin progress bar), the ring of #240 (My QR, Lessons,
Assessments with its count, My Growth, Śloka Study, Events & polls and, while unfinished, My Details) takes the cards'
place. The ring is sized to the room left above the tabs so the home never scrolls; the fact of the day stays only while
the ring can still be 300 px with it. ShortcutTiles stays for the Practice tab's games.
