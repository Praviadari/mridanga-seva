# 3. Coordinator guide

Hare Krishna, and thank you for your seva. This page walks a coordinator through a day at the
class, screen by screen. Words in **bold** are the words the app shows in English.

[← Back to the guide](README.md) · Previous: [2. Student guide](02-student-guide.md) · Next: [4. Facilitator guide →](04-facilitator-guide.md)

---

**Contents**

1. [Getting a coordinator account](#getting-a-coordinator-account)
2. [Your home screen (dashboard)](#your-home-screen-dashboard)
3. [Register a student](#register-a-student)
4. [Mark attendance](#mark-attendance)
5. [Who is here now, and closing time](#who-is-here-now-and-closing-time)
6. [The student list](#the-student-list)
7. [A student's profile](#a-students-profile)
8. [Syllabus tick-off](#syllabus-tick-off)
9. [Follow-up calls](#follow-up-calls)
10. [Log a call](#log-a-call)
11. [Announcements](#announcements)
12. [Groups](#groups)
13. [My reports](#my-reports)
14. [Syllabus and lessons (read only)](#syllabus-and-lessons-read-only)
15. [Slokas (Ishtagoshti)](#slokas-ishtagoshti)
16. [Team tools: instruments, duty roster, suggesting a lesson](#team-tools-instruments-duty-roster-suggesting-a-lesson)
17. [What a coordinator can and cannot see](#what-a-coordinator-can-and-cannot-see)
18. [Assessments, promotion, practice, events and polls](#assessments-promotion-practice-events-and-polls)

## Getting a coordinator account

1. Install the app ([5. Phones, install and updates](05-phones-and-updates.md)).
2. Create an account with your name, email and a password, and confirm the email (the same steps
   as a student: [Create your account](02-student-guide.md#create-your-account)).
3. You see **Waiting for access**. Tell the Facilitator. They make you a coordinator on their
   **Coordinators** screen.
4. Tap **Check again**, or open the app again. Your coordinator home appears.

## Your home screen (dashboard)

At the bottom are five tabs: **Home**, **Attendance**, **Students**, **Calls** and **News**. On a
laptop they become a sidebar on the left, with a sixth, **Slokas**.

The **Home** tab shows:

| Part | What it does |
|---|---|
| **Mark attendance** (big button) | Opens the attendance screen |
| **Here now** | How many students are checked in. Tap to open **Who is here now** |
| **Visits today** | Visits so far today. Tap to open attendance |
| **Calls due for my students** | Follow-up calls due for the students you mentor. Tap to open **Follow-up calls** |
| **New joiners (last 4 weeks)** | Students who joined recently, newest first, with their number of visits. Tap a name to open the profile. Someone with no visits yet may need a call |
| **Promotions** | **Your feedback asked: N** and **Your students ready: N** (see [promotion](09-learning-and-community.md#moving-up-a-level-promotion)) |
| **My reports** (under the ring) | Your mentees' visits, statuses, calls and progress, with a CSV file (see [My reports](#my-reports)) |
| Bell on the header | Your **Notifications** inbox, with the unread count (as for students: [Notifications](02-student-guide.md#notifications)) |
| Foot of the page | Language, **My profile**, **Notifications**, **Sign out**, version line |

Pull down to refresh on a phone. On Android, **A new version is ready** with **Restart now**
appears when an update has arrived.

## Register a student

Open the **Students** tab and tap **Register a student** at the top. It takes about two minutes.
Only the name and date of birth are required.

**Student**

| Field | Notes |
|---|---|
| **Full name** | Required |
| **Date of birth** | Required. Day-month-year, for example 15-06-2012. The app shows the age |
| **Phone** | 10 digits |
| **Email** | The student's own email, if they will use the app. Their login is joined to this record by this email |
| **Area** | Only the area, for example Koti. **Not the full address** |
| **Pincode** | 6 digits |
| **Level** | Beginner, Intermediate or Advanced |
| **Mentor coordinator** | The coordinator who follows this student up, or **Not yet** |

**Parent or guardian (under 18 only).** If the date of birth makes the student under 18, the app
says *Age N — under 18, a parent's consent is needed* and adds this section:

1. **Parent's full name**, **Parent's phone** (required) and **Parent's email**.
2. **Relation to the student**: Mother, Father or Other guardian.
3. **Which ID did you see?** Look at the parent's ID to confirm who they are (Aadhaar, PAN card,
   driving licence, passport, voter ID or other). **Do not write down the number.** The app keeps
   only the type of ID.
4. Tick **The parent agrees to a photo of the student on the class record** only if they agree.
5. Tick **The parent has filled in and signed the paper consent form, and I have kept it with the
   class records.** Keep the signed form in the class file.

Tap **Save student**. You see **Student registered** with the new **roll number**, for example
`MS-2026-0016`. If the student already made an app account with the same confirmed email, the app
says *Their app login is now connected to this record.*

Why so strict? The database itself refuses a student under 18 without the parent's consent, from
any screen or app version ([DECISIONS.md #16](../DECISIONS.md)). Roll numbers are given by the
database, can never be changed, and are never reused ([DECISIONS.md #3](../DECISIONS.md)).

## Mark attendance

Open the **Attendance** tab (**Mark attendance**). The top line says **Here now: N · Visits today: N**.

**By QR code (quickest)**

1. Ask the student to open **My QR** on their phone.
2. Tap **Scan a QR code**. The first time, allow the camera (*Nothing is recorded or saved.*).
3. Hold the student's code in front of the camera.
4. The app says **Checked in at 16:05.** When the same student leaves and you scan again, it
   says **Checked out at 18:10. Stayed 2 h 5 min.**
5. Tap **Scan the next student**, or **Close the camera**.

A scan **toggles**: it checks the student in if they are out, and out if they are in.

**By name (no phone, no camera, or on a laptop)**

1. Under **Find by name**, type at least 2 letters of the name or the roll number.
2. Tap **Check in** or **Check out** next to the student. A student already in shows **Here since**.

A tap does exactly what it says. If the student is already in, **Check in** changes nothing and
says **Already checked in. Nothing changed.** ([DECISIONS.md #18](../DECISIONS.md)). The answer
appears under the name you tapped. A second scan of the same student within 30 seconds also says
**Already checked in**, so a student is never checked out by a double scan.

If **Could not load today's attendance** appears, tap **Try again**. Meanwhile scanning and the
name search still work: a name then shows **Check in**, and the app says so if the student is
already in.

If a code is not a student code of this class, the app says **Code not recognised**: search the name
instead. Two phones marking the same student at the same moment are handled safely, one after the
other.

Each check-in makes a quiet student **Active** again and closes their open follow-up calls.

**Location at check-in.** When you check a student in, the app checks where **your** phone is (only
while the app is open, to confirm you are at the class). The first time, the phone asks: tap **While
using the app**. If you are outside the centre's area, refuse, or the phone finds no position within a
few seconds, the student is **still checked in**, but the card adds a line such as **Outside the class
area (320 m away) — flagged for the facilitator.** The facilitator sees these flags in the reports;
**Who is here now** shows them too. To allow location later: phone **Settings → Apps → Mridanga Seva
→ Location** ([DECISIONS.md #70](../DECISIONS.md)).

## Who is here now, and closing time

Open **Here now** from the home screen or the ring. **Who is here now** lists every student checked
in, with **Since** (time) and how long they have stayed. Tap **Refresh** to update it.

At closing time, tap **Check out all**. The app asks **Check out everyone here now (N)?** Tap
**Yes, check out all**. Each visit ends now. A visit left open from an earlier day ends at that
day's closing time.

If nobody does this, a nightly job closes any visit still open at 21:00, at the centre's closing time.

## The student list

Open the **Students** tab.

- **Register a student** is at the top.
- **Search**: type a name or roll number.
- **Filters**: **Level**, **Status**, **Mentor** (including **My students** and **No mentor**), and
  **Not seen for** (for example 14+ days). **Clear filters** removes them.
- **Showing N of M** says how many match.
- Each row shows the name, roll number, level and status, the last visit
  (**Last visit 12-09-2026 · 21 days ago**, or **Here now**), and the mentor.

On a laptop the list shows two columns.

**Statuses** (shown as coloured labels):

| Status | Means |
|---|---|
| **New** | Registered, no visit yet |
| **Active** | Coming |
| **Irregular** | No visit for 14 days (a call is due) |
| **Inactive** | No visit for 30 days |
| **Paused** | Taking a break until a date, recorded in a call |
| **Left** | Stopped coming, recorded in a call. Keeps the roll number; a new visit makes them Active again |

The day limits (14, 30) are settings the Facilitator can change.

## A student's profile

Tap a student anywhere (list, new joiners, a call) to open the **Student profile**.

- At the top: name, roll number, level and status, and (if paused) **Paused until**.
- **Log a call** and **Check in** / **Check out** buttons.
- **Details**: joined, date of birth and age, phone, email, area, mentor, and **App login** (yes or no).
- **Parent or guardian** (minors): the parent's details and consent lines, such as
  *Consent for the student's details · signed paper form · date*, with **ID seen**. *Only
  coordinators and the facilitator can see this.* If consent is missing, the profile says so; tell
  the Facilitator.
- **Follow-up calls**: the open call task (due date, try number, who it is for) and every call
  logged, with **Logged by**.
- **Visits**: **Last 30 days: N · All: N**, the latest visits, and **All visits by month**, which
  opens the full attendance history.
- **Syllabus**: the student's level, **N of M done**, and **Tick syllabus items**.
- **Level history**: each level change and who approved it.
- **Promotion**: the criteria check and **Nominate for promotion**
  ([how](09-learning-and-community.md#moving-up-a-level-promotion)).
- **Practice**: the practice the student logged, week by week.
- **Items on loan**: temple instruments the student has borrowed.

Changing a student's name or phone in the app is not built yet; ask the Facilitator. A level changes only through [promotion](09-learning-and-community.md#moving-up-a-level-promotion). A
mentor is chosen at registration; the Facilitator can move students to another mentor.

## Syllabus tick-off

From the profile, tap **Tick syllabus items** to open **Syllabus tick-off**.

- It shows the student's level (**Level now**) and every level's items in teaching order, with a
  progress bar.
- **Tap the box** when the student shows the item in class. Today's date and your name are saved
  with the tick: **Ticked 03-10-2026 by** your name.
- **Tick with a remark** ticks and saves a note in one step, for example *needs a steadier tempo*.
  **Add a remark** or **Change the remark** works on an item already ticked.
- To untick, tap the box again. The app asks **Untick "…"?** Use it only for a mistake. The class
  records keep a copy ([DECISIONS.md #22](../DECISIONS.md)).
- When every item is ticked, the app says *Every item of Beginner is ticked. Moving up a level is
  the facilitator's decision.*

If someone else ticked the same item a moment earlier, their tick is kept and the app tells you.

## Follow-up calls

The **Calls** tab (**Follow-up calls**) lists students who have stopped coming. Tap a name to phone
them and record the call.

**Show: Everyone** or **My students** (those you mentor; when none of yours is left, the list
shows everyone again). Students are grouped:

| Group | Who |
|---|---|
| **Needs the facilitator** | Several calls with no answer, or no call made before the student became Inactive. The Facilitator sees these |
| **Call due** | A call is due, with the date and the try number |
| **Call later** | A call is planned for a later date |
| **No call planned** | Irregular or Inactive students with no call task yet |

**How calls appear.** Each morning the app marks students with no visit for 14 days as
**Irregular** and gives their mentor a call, due in 3 days. Each call is **for** the student's
mentor; if the mentor changes, the call moves with the student
([DECISIONS.md #48](../DECISIONS.md)). Any coordinator may still make it. When a pause ends, the
student becomes **Irregular** and the mentor gets a call too. The try number starts again after a
visit ([DECISIONS.md #107, #108](../DECISIONS.md)).

## Log a call

Tap a student in **Follow-up calls**, or **Log a call** on a profile.

1. Tap **Call student: 98…** (or **Call Parent** for a minor). The phone's dialler opens.
2. After the call, under **What happened on the call?**, choose the **Outcome**:

   | Outcome | What the app does |
   |---|---|
   | **Coming back** | Asks **Expected on** (date). If they have not come by the day after, a new call is due |
   | **Taking a break** | Asks **Paused until** (date). Status becomes **Paused**; no reminders until then |
   | **Not reachable** | A new try is due in a few days. After several tries the Facilitator is told |
   | **Stopped coming** | Status becomes **Left**. They keep their roll number; a new visit makes them Active again |

3. Choose a **Reason**: Studies / exams, Work or timing clash, Moved / too far, Health, Family,
   Lost interest, Joined another class, Travel, or Other (say in the comment).
4. Write **What was said**. It is required: a short note for whoever calls next.
5. Tap **Save call**. For **Stopped coming** the app asks once more: **Mark … as Left?** Left
   changes nothing else: their login keeps working, and they still get class messages and
   notifications, until the Guru switches the login off ([DECISIONS.md #111](../DECISIONS.md)).
   If a field needs a fix, a red note beside the button says so.

**Why only through a call?** A student becomes **Paused** or **Left** only through a logged call,
never by editing a field. So every student who leaves has a recorded reason, and nobody is dropped
by mistake ([DECISIONS.md #4](../DECISIONS.md)).

## Announcements

Announcements replace the WhatsApp groups. Open the **News** tab (**Announcements**).

**The list** shows each announcement with **Seen by N of M** (M = people it is for who use the app),
**Without the app: N**, **Replies: N** and **Files: N**. **Pinned** ones are on top; scheduled ones
say **Scheduled for**.

**Post one**: tap **New announcement**.

1. **Title** (short, for example *No class on Friday*) and **Message**.
2. **Photos and PDFs** (optional, up to 3): **Add photos** or **Add a PDF** (up to 5 MB). Photos are
   made smaller before sending. **Only add a photo that shows a student if their parent has given
   photo consent.**
3. **Who is it for?** **All students**, **One level**, **My mentees**, **Staff only** or **A group**.
4. **Pin it to the top of the list** if it should stay on top.
5. **When should students see it?** **Now**, or **Later** with a date and a 24-hour India time.
6. Tap **Post announcement** (or **Schedule announcement**).

Within about a minute, Android phones of the people it is for get a notification. Coordinators and
the Facilitator see every announcement, whatever its audience.

**One announcement** shows the full text and files, and:

- **Who has seen it**: **Seen by**, the **Not seen yet** list, and **Show who has seen it**. Tell
  students without the app in class.
- **Replies**: private replies from students. Only you (the author) and the Facilitator see them.
  Answer in person or by phone.
- **Edit announcement**: change the text, audience or files. Once published, it shows **Edited**
  with the time, and people who read it stay counted.
- **Pin to the top** / **Unpin**.
- **Delete announcement**: asks first. It disappears for everyone, with its files. The class records
  keep a copy of the text.

You can edit, pin or delete your own announcements; the Facilitator can do so for any.

## Groups

Groups replace the WhatsApp groups for announcements to "A group". Open **Groups** in the ring.

- The list shows each group and **Members: N**.
- **New group**: a **Name** (for example *Sunday Harinam*) and **What is it for?**, then
  **Create group**.
- In a group: change the name and purpose (**Save name and purpose**), **Switch off** a group no
  longer used (or **Switch on again**), see the members and **Remove** one, and **Add people**
  (search for students who use the app, coordinators and the Facilitator).

Groups are never deleted, only switched off, so old announcements keep their audience
([DECISIONS.md #28](../DECISIONS.md)). Students without the app cannot be added.

## My reports

Tap **My reports** under the ring on your home screen. It covers **your mentees**.

1. Choose the **Dates**: **This month**, **Last month**, **Last 4 weeks**, **Last 3 months**, or
   **Other dates** (type **From** and **To**, then **Show**). A report covers at most one year.
2. Read the summary: **Students in class now**, **Joined in these dates**, visits and how many
   students came, **Calls made**, **Calls due now** and **Left in these dates**.
3. Below: **Students by status, now**, **Visits per week** and **Visits per month** (visits,
   students, hours), **Follow-up calls** (by outcome), and **Syllabus progress per level**.
4. **Students**: one line per student (visits, hours, calls, last visit, syllabus). Tap a line to
   open the profile. On a laptop it is a table.
5. **CSV file**: one line per student, for Excel or Google Sheets. On the web, **Download CSV**; on
   Android, **Save to a folder** or **Share**.

The database gives each coordinator only their own mentees' report; the Facilitator sees the whole
class ([DECISIONS.md #50](../DECISIONS.md)).

## Syllabus and lessons (read only)

**Syllabus and lessons** in the ring shows each level's syllabus in teaching order, and the lessons
(videos, PDFs, photos) for each item. Coordinators can open the lessons; only the Facilitator
changes them.

## Slokas (Ishtagoshti)

The **Slokas** tab (on a phone: the **Ishtagoshti** button under the ring on your home) works for you as for students: the sloka of the day, themes, your own notes and
memorised ticks (see the [student guide](02-student-guide.md#slokas-ishtagoshti)). If the Facilitator
has made you an **Ishtagoshti editor**, you also get **Add a sloka**, **Add a theme**, **Edit sloka**
and **Make it the sloka of that day**. Type only the temple's own translation, word meanings and
purport, never text copied from BBT books or vedabase; the app will not publish a sloka until you
tick that it is the temple's own.

## Team tools: instruments, duty roster, suggesting a lesson

Phase 2 ([DECISIONS.md #65](../DECISIONS.md)).

**Instruments** (the ring) lists the temple's mridangas, kartals and other items, with their
condition and who has each. Filter: **In use**, **In the store**, **Lent out**, **Needs attention**,
**Retired**. Tap an item:

- **Lend**: type 2 or more letters of a student's or coordinator's name (or a roll number), pick the
  person, choose the condition you see now (**Good** or **Needs care**; a damaged item cannot go
  out), add a note and, if you like, a date to bring it back (day-month-year). **Lend it**.
- **Take back**: choose the condition you see now. Anything but **Good** needs a note ("Baya strap
  loose"). **Damaged** tells the facilitator.
- **Condition check**: the same, without lending; use it when an item goes to or comes back from the
  drum maker (**In repair**, then **Good**).
- **History** shows every condition seen, who lent it to whom, and when.

A student sees the items they hold on **My profile**; you see them on the student's profile under
**Items on loan**.

**QR labels and stocktake** (since 7 Oct 2026, [DECISIONS.md #156-#161](../DECISIONS.md)). Every seva asset
(drums, kartals, harmonium, sound, books, furniture, altar items ...) has a code such as **KHOL-007** and a QR
sticker.

- **Scan a label** (on Instruments and assets, or the camera on **Mark attendance**): point the camera at the
  sticker and the item opens: lend, take back or check it as above. A phone's own camera app opens the same
  item in the browser after you sign in. "Another centre's item" means it belongs to another centre: tell
  its coordinator. "Label not found": tell the facilitator.
- **Print labels** works on a computer with a printer, in the browser (on the phone the button opens the
  browser). Tick the items (**Not printed yet** shows those without a sticker), tap the first free label on
  the sheet (a half-used sheet starts later), **Print**. In the print window: A4, scale 100 % ("Actual
  size"), margins None, headers and footers off. After a good print tap **mark printed**. New pack or new
  printer: first tick **Test print** and print on plain paper; hold it against a label sheet up to the light;
  if the outlines are off, type the shift in **Move right / Move down** (mm) and print the test again.
- **Stocktake**: **Start or join a count** for your centre, then scan every sticker (or tap **Seen** for an
  item whose sticker is damaged). **Not seen yet** shrinks as you go; two people can count at once. **Finish
  the count** saves the summary: seen, **missing** (not seen and not lent out) and lent out, with who did it.
  Look for the missing ones and tell the facilitator.

**Duty roster** (under the ring) shows **My shifts** for the next 4 weeks and the whole roster by
date, with who is on each shift. The facilitator plans it. At 18:00 the evening before a shift you
get a notice in your inbox (and a push on Android).

**Material suggestions** (under the ring): **Suggest a material** opens the lesson form (a YouTube
link, a video-file link, a PDF or a photo, for a level and optionally an item) with **Why this
helps**. **Send to the facilitator**. Students do not see it until the facilitator adds it. Each
suggestion shows **Waiting**, **Added to lessons** or **Declined** with the facilitator's reason;
you can take back a waiting one or remove a declined one. You get a notice either way. At most 10
a day.

## What a coordinator can and cannot see

| You can | You cannot |
|---|---|
| See and work with every student: register, mark attendance, log calls, tick the syllabus | Give roles, switch logins off, or move mentees |
| See parents' details and consent records of minors | See the audit log, change the settings, edit the syllabus or lessons |
| Post announcements and manage groups | Edit or delete someone else's announcement |
| Read replies to your own announcements | Read replies to other people's announcements |
| See reports on your own mentees | See the whole-class report, or change centres |

These rules live in the database, not only in the screens, so no old app version or typed web
address gets around them ([6. How the app works](06-how-it-works.md#the-rules-live-in-the-database)).

## Assessments, promotion, practice, events and polls

These Phase 2 tools have their own page, with every step for coordinators:
[9. Learning and community](09-learning-and-community.md).

- [Assessments](09-learning-and-community.md#assessments): give the Facilitator's assessment to
  students, follow up, and review recordings with a score, a comment and a voice note.
- [Promotion](09-learning-and-community.md#moving-up-a-level-promotion): nominate a student who is
  ready, and give feedback when another coordinator nominates.
- [Practice tools](09-learning-and-community.md#practice-tools-metronome-taal-player-both-heads) and
  [lesson videos](09-learning-and-community.md#lesson-videos-speed-repeat-mirror) to teach with.
- [Events](09-learning-and-community.md#events) with performers and who came, and
  [polls](09-learning-and-community.md#polls).

- The [class fund](09-learning-and-community.md#class-fund): every coordinator reads it; a treasurer also records
  entries, reverses mistakes and approves the Facilitator's own big expenses.

Still to come: the door tablet ([still to come](09-learning-and-community.md#still-to-come)).

---

[← Back to the guide](README.md) · Previous: [2. Student guide](02-student-guide.md) · Next: [4. Facilitator guide →](04-facilitator-guide.md)
