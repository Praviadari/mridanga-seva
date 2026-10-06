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
new APK until over-the-air updates (EAS Update) are chosen. *(Last point no longer holds: see #35.)*

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
header shows no Back arrow; the browser's Back still works. *(Last point no longer holds: since #36
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
