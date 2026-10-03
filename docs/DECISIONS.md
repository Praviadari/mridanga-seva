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

## 43. Assessments: the Guru sets them, coordinators run and grade them — 2 Oct 2026

**Status: confirmed by Praveen 3 Oct 2026, on the branch `phase2-assessments` only.** Phase 2 reaches
main, and with it the volunteers' phones, only when Praveen decides. He confirmed the storage cap,
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

**Consequences.** Migration `0012_assessments.sql` (TEST project only until Phase 2 goes live).
The Edge Function must be deployed again for the assessment notifications and the file deletion;
until then those rows wait and nothing breaks, and the old function ignores them. S7 was kept by
Praveen although the Screen List doc has no team pick for it yet. The Telugu and Hindi texts, in the app and in the
notification lines in the migration, are drafts for the native-speaker review. Slice 2 is the
promotion approval (C22, C23, G7).
## 44. The team edits the syllabus and lessons; ticks are never lost — 3 Oct 2026

(Number #43 is left to the Phase 2 branch phase2-assessments, which may take it.)

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

## 45. Promotion: coordinators nominate and give feedback, only the Guru promotes — 3 Oct 2026

**Status: decided 3 Oct 2026, on the branch `phase2-promotion` only** (from `phase2-assessments`
with main merged in). Praveen left the open points to the build chat ("take the best viable
decisions; we will configure later if it does not suit"): criteria advise and do not block, the
nominating coordinator counts as one of the 2 answers, students see only the promotion push (no
nomination status until S8 is picked), level-up recordings kept 30 days after the decision (180
days if never nominated), no ring circle for promotions. The numbers are settings; the rest is a
small change if the team wants it otherwise. Phase 2 reaches main and the phones only when
Praveen decides.

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
  level-up assessment *of the current level* sent to the Guru (`send_level_up`, #43).
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

**Consequences.** Migration `0014_promotion.sql` (TEST only until Phase 2 goes live; after 0013).
The Edge Function `notify-announcements` must be deployed again from this branch to send the
promotion notifications (it now accepts `/staff/promotion/<id>` and `/student/progress`); until
then they wait in `push_outbox`. The Telugu and Hindi texts are drafts (docs/TRANSLATIONS.md).