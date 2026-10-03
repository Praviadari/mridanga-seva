# 4. Facilitator (Guru) guide

Hare Krishna. This page is for the Guru who leads the class. The English screens call this role
**Facilitator**; Telugu and Hindi say Guru. The Facilitator can do everything a coordinator does
(see the [coordinator guide](03-coordinator-guide.md)), and also runs the class: the syllabus, the
lessons, the coordinators, the whole student database, the settings and the audit log.

[← Back to the guide](README.md) · Previous: [3. Coordinator guide](03-coordinator-guide.md) · Next: [5. Phones, install and updates →](05-phones-and-updates.md)

---

**Contents**

1. [The first Facilitator account](#the-first-facilitator-account)
2. [Your dashboard](#your-dashboard)
3. [Syllabus and lessons](#syllabus-and-lessons)
4. [Lessons and materials](#lessons-and-materials)
5. [Coordinators: roles, mentees, duty hours](#coordinators-roles-mentees-duty-hours)
6. [Student database](#student-database)
7. [Import students from Excel or CSV](#import-students-from-excel-or-csv)
8. [Settings](#settings)
9. [Reports](#reports)
10. [Centres](#centres)
11. [Audit log](#audit-log)
12. [Announcements and replies](#announcements-and-replies)
13. [Coming later](#coming-later)

## The first Facilitator account

The Facilitator role is never given inside the app. This is on purpose: nobody can make themselves
Facilitator from a phone. The first Facilitator signs up like anyone else; then the person who runs
the system sets the role once in the Supabase dashboard (steps in
[OPERATIONS.md "Setting up a new environment"](../OPERATIONS.md#setting-up-a-new-environment), step 7).
After that, the Facilitator gives every other role from the app.

## Your dashboard

The **Home** tab, from top to bottom:

| Part | What it shows |
|---|---|
| **Mark attendance** (big button) | Opens attendance, as for coordinators |
| **Students who came this week** | From Monday, or the last 7 days (a setting). The line under it says from which date |
| **Students in class (not left)** | Everyone who has not left |
| **New joiners** | Joined in the last 4 weeks |
| **Follow-ups overdue or with you** | Calls past their date and students handed to you. Tap to open **Follow-up calls** |
| **Students per level** | Beginner, Intermediate, Advanced, among students who have not left |
| **Students per status** | New, Active, Irregular, Inactive, Paused, Left, among every student |
| **Follow-ups per coordinator** | For each coordinator: **Overdue: N · With the facilitator: N**. Tap to open the calls |
| **Screens** (the ring) | The same modules as the coordinator home |
| **Running the class** | **Coordinators** (roles for new sign-ups, mentees, duty hours), **Student database** (every record, and the Excel import), **Settings** (open window, this week, follow-up days), **Audit log** (who changed what, and when), **Reports** (visits, statuses, calls and progress, with a CSV file), **Centres** (places, address, GPS point and attendance area) |
| Bell on the header | Your **Notifications** inbox, with the unread count |

The bottom tabs are the same as a coordinator's: **Home**, **Attendance**, **Students**, **Calls**,
**News**. On a laptop they become a sidebar.

## Syllabus and lessons

Open **Syllabus and lessons** in the ring. It shows the three levels (Beginner, Intermediate,
Advanced) with **Items: N · Lessons and materials: N**. The three levels are fixed; their items are
yours to enter.

**A level** shows its syllabus in teaching order.

- **Up** / **Down** move an item.
- **Add an item** adds one at the end.
- Each item shows **Ticked for N students · Lessons: N**. Tap it to edit it.
- **Retired items** are listed under the others, with **Put back**.

**One item** (**Syllabus item**):

- **Title** (what the student learns, for example *Kaherva taal, slow*) and **Description**
  (what to show in class to have it ticked). Tap **Save**. Ticks already given stay when you
  change the text.
- **Lessons for this item**: see the next section.
- **Retire or delete**:
  - **Retire this item** when it is no longer taught. It stops being taught, ticked or counted in
    progress, but the students who have it ticked keep their ticks. You can put it back later.
  - **Delete this item** only for a mistake: it works only when nobody has ticked it and no lesson
    points to it. Otherwise the app says to retire it instead.
  - Both ask first.

Why retire instead of delete? A tick is a record that a student showed something in class. The
database never lets those records be lost ([DECISIONS.md #44](../DECISIONS.md)).

Coordinators see this screen read-only.

## Lessons and materials

Lessons are added inside the level and item pages. Students see them in **My progress**, from
their level upward.

1. On a level page (**Lessons for the whole level**) or an item page (**Lessons for this item**),
   tap **Add a lesson**.
2. **Kind**: **YouTube video**, **PDF** or **Photo**.
   - **YouTube link**: in YouTube, tap Share and Copy link, then paste it here. Unlisted videos work.
   - **Choose a PDF** (up to 10 MB, for example notation) or **Choose a photo** (made smaller before
     sending).
3. **Title** (what students see) and an optional **Note** (for example *Practise with the metronome
   at 60*).
4. **Where it belongs**: the **Level**, and an **Item** or **Whole level**.
5. Tap **Add the lesson**.

**Edit** changes the title, link, note, level and item. **Delete this lesson** asks first; a PDF or
photo is deleted too, a YouTube video stays on YouTube.

Videos are never copied into the app: lesson videos stay on YouTube (the class's own, or public
ISKCON videos shown through the YouTube player with credit) ([DECISIONS.md #9](../DECISIONS.md)).

## Coordinators: roles, mentees, duty hours

Open **Running the class → Coordinators**.

The page has three lists:

- **Waiting for a role**: people who signed up and are waiting. (Students whose email matches their
  record get their role by themselves and never appear here.)
- **Facilitator and coordinators**: each with **Mentees: N** and **On duty**. A line warns when
  students have no mentor.
- **Put aside**: logins that were switched off.

Open a person to:

- **Make a coordinator**: for someone waiting. *Check who this is before you give a role.* The app
  asks **Make … a coordinator?** and explains what they will be able to do.
- **Or link to a student record**: for a student whose record has a different email, or none.
  Search the name or roll number; only records without a login are shown. Tap **Link**, then **Link
  the login**. That login becomes the student's app: their QR card, progress and announcements.
- **Duty hours**: when this coordinator is usually at the class, for example *Mon, Thu 16:00-19:00*.
  **Save duty hours**.
- **Mentees**: pick students (**Pick all**, **Pick none**), choose **Move to**, and tap **Move the
  picked students**. Their open calls go with them.
- **Switch off** / **Switch on**: a switched-off login can sign in but sees nothing; records and
  history stay. A coordinator who still mentors students must hand them over first.

Every change asks first and is kept in the audit log. Nobody can change their own role or switch
themselves off; the Facilitator role is given only in the dashboard
([DECISIONS.md #45](../DECISIONS.md)).

## Student database

Open **Running the class → Student database**. It lists **every student record, Left ones too**
(coordinators use the Students tab instead).

- **Search name, roll number, phone or email**.
- Filters for level, status, mentor and area.
- On a laptop it is a table (**Roll no.**, **Name**, **Level**, **Status**, **Mentor**, **Area**,
  **Phone**, **Joined**, **App**); on a phone, rows. **Show more** loads the next ones.
- Tap a student to open their profile.

## Import students from Excel or CSV

For bringing the existing student list into the app. From the Student database, tap **Import from
Excel or CSV**.

1. **Choose a file**: an Excel file (`.xlsx`) or a CSV file, up to 5 MB. The first sheet is read; its
   first row must hold the column headings. (An old `.xls` must be saved as `.xlsx` or CSV first.)
2. **Match the columns**: the app guesses from the headings which column is **Name**, **Date of
   birth**, **Phone**, **Email**, **Area**, **Pincode**, **Level**, **Joined on** and **Old roll
   number** (used only to find repeats). Change a match if it is wrong. Name and date of birth
   are needed.
3. **Check the rows**: **Ready to import: N** and **With problems: N**. Each problem is explained,
   for example *The date of birth is missing*, *This phone number is already used by another
   student*, or *Under 18: register with the form, so the parent's consent is recorded.*
4. Tap **Import the good rows (N)** and confirm. Each new student gets a roll number from the
   database, as in a registration.
5. **Import finished** lists what was saved (**Row 4 → MS-2026-0021**) and anything refused.

Rows with problems are left out. Fix them in the file and import it again: rows already imported
are found as repeats.

**Students under 18 are never imported.** Register them with the form at the desk, so the
parent's signed consent is recorded ([DECISIONS.md #46](../DECISIONS.md)).

## Settings

Open **Running the class → Settings**. Changes take effect at once; the daily follow-up job uses
them the next morning. Every change is kept in the audit log.

| Section | Settings |
|---|---|
| **Open window** | **Opens at** and **Closes at** (for example 14:30 and 20:00). Visits still open at night are closed at the closing time |
| **"This week" on the home screens** | **From Monday** or **Last 7 days** |
| **Follow-up** | **Days without a visit before Irregular** (14), **Days without a visit before Inactive** (30), **Days to make the call** (3), **Days before trying again when not reachable**, **Tries before the facilitator is asked** |
| **New joiners** | **Weeks a student counts as a new joiner** (4) |
| **Promotion criteria (not used yet)** | Kept ready for Phase 2: visits needed, in how many weeks, share of the syllabus ticked, whether a level-up assessment is needed, and how many coordinators must answer |

Tap **Save the settings**. The database checks every value (for example, Inactive must come after
Irregular) ([DECISIONS.md #47](../DECISIONS.md)).

## Reports

Open **Running the class → Reports**. It is the same screen coordinators know as
[My reports](03-coordinator-guide.md#my-reports), but for **the whole class**. Under **Whose
students**, choose **Everyone** or one coordinator's mentees; the student lines then show a mentor
column. Choose the dates, read the totals, visits per week and month, calls and syllabus progress,
and save the **CSV file** for Excel or Google Sheets ([DECISIONS.md #50](../DECISIONS.md)).

## Centres

Open **Running the class → Centres**: *Where the class meets, with its address and the area where
attendance counts.* Today that is Abids; a new centre is a setting, not new code.

- **Add a centre**, or tap one to change it: **Name**, **Address**, **Opens at** / **Closes at**.
- **Attendance area**: paste the **GPS point or Google Maps link** (in Google Maps, press and hold
  the place, copy the numbers or the long link). The app shows **Point read** and a **Check on
  Google Maps** link. Set the **Radius in metres** around it.
- **Switch off** / **Switch on**: a centre is never deleted, so its visits stay. At least one centre
  must stay in use.

The attendance area is stored now; phones will check it from the next Android app version, which
adds location ([DECISIONS.md #51](../DECISIONS.md)).

## Audit log

Open **Running the class → Audit log**. It is read-only.

It lists every change to students, logins, calls, levels, the syllabus, ticks, lessons,
announcements, settings and centres, newest first, 50 at a time (**Show older changes**). Filters:
**Record**, **Changed by** (a person, or *The system or the dashboard*), **Change** (Added, Changed,
Deleted) and **When** (last 24 hours, last N days, any time). Tap a change to see the values before
and after.

The log is written by the database itself, so it records changes made from any app version, and
from the dashboard too.

## Announcements and replies

As Facilitator you can post like a coordinator, and also:

- edit, pin, unpin or delete **any** announcement;
- read **every** reply, and delete a reply.

## Coming later

- **Checking the attendance area on phones** (the centre's GPS area): with the next Android app.
- **Assessments** (you create a piece to learn; coordinators pass it on, follow up and review),
  **promotion approval** (a mentor nominates, coordinators give feedback, you decide **Promote**,
  **Not yet** or **More feedback**), practice tools, events, polls, instruments, Ishtagoshti and
  the fund: Phase 2, being built on branches. See
  [How it was built](07-how-it-was-built.md#phases-and-dates).

---

[← Back to the guide](README.md) · Previous: [3. Coordinator guide](03-coordinator-guide.md) · Next: [5. Phones, install and updates →](05-phones-and-updates.md)
