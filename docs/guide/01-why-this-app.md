# 1. Why this app exists

Hare Krishna. This page explains what the class is, what the mridanga is, what problem the app
solves, and the spirit in which it was made.

[← Back to the guide](README.md) · Next: [2. Student guide →](02-student-guide.md)

---

## The class

The mridanga seva class meets at **ISKCON Abids**, in Hyderabad. It teaches the mridanga, the drum
played in kirtan (congregational singing of the holy names).

The class is **drop-in**:

- It is open every day from **14:30 to 20:00**.
- There are **no batches** and no fixed class times. Each student comes when it suits them, and
  stays as long as they can.
- New people join almost every week, often about one a week.
- Students learn at their own pace through three **levels**: **Beginner**, **Intermediate** and
  **Advanced**.
- About **200** students and coordinators are expected. Some students are **under 18**.

Three kinds of people run and use the class:

| Person | What they do |
|---|---|
| **Guru** (called **Facilitator** on the English screens) | The senior teacher. Leads the class, sets the syllabus, decides when a student moves up a level |
| **Coordinator** | A senior student or devotee who runs the daily class: welcomes new students, marks attendance, teaches, phones students who stop coming. In this class a coordinator is also the teacher |
| **Student** | Comes to learn the mridanga |

Why "Facilitator"? The team asked that the English screens use that word. Telugu and Hindi keep
"Guru" (గురువుగారు / गुरुजी). Inside the code and database the role is still called `guru`
([DECISIONS.md #40](../DECISIONS.md)).

## The instrument

> In short: the **mridanga** (also called **khol**) is the clay or fibreglass drum of Bengali
> kirtan. It is **not** the South Indian *mridangam*. The app never mixes the two.

**Name.** In the ISKCON spelling it is *mṛdaṅga*, written *mridanga*. The name comes from Sanskrit
*mrit* (clay) and *anga* (body): a body of clay. In Bengali it is called **khol**.
[[kksongs, lesson 1](https://www.kksongs.org/khol/); [Wikipedia: Khol](https://en.wikipedia.org/wiki/Khol)]

**Not the Carnatic mridangam.** The South Indian *mridangam* of Carnatic music has a wooden body,
different strokes (bols) and different rhythm cycles (taals). The two are different instruments
with different teaching traditions. This app is for the Gaudiya Vaishnava mridanga only.

**History.** The mridanga is tied to the sankirtan movement of **Sri Caitanya Mahaprabhu** in Bengal
in the 15th century. In the tradition, the mridanga is described as Krishna's flute incarnate, or an
expansion of Lord Balarama. [[kksongs, lesson 1](https://www.kksongs.org/khol/)]

In the early 1970s Srila Prabhupada asked his disciples to make a drum "that they cannot break",
using western materials. A devotee apprenticed with a drum maker in Mayapur, and from about 1976
fibreglass mridangas with synthetic heads were made in Los Angeles. This is the **Balaram
mridanga**; the **Tilak** mridanga is a later model made in the Philippines.
[[krishna.org: history of the fibreglass mridanga](https://krishna.org/history-of-the-fibreglass-balaram-tilak-mridanga/)]

**Kinds of mridanga.**

| Kind | Body and heads | Notes |
|---|---|---|
| Clay khol | Terracotta body, skin heads, leather straps | The best sound. Fragile; reacts to heat and humidity |
| Fibreglass (Balaram, Tilak) | Fibreglass body, synthetic heads tuned with an Allen key | Almost unbreakable and safe in rain, so it is used for street kirtan (Harinam) |
| Fibreglass with skin heads | Fibreglass body, leather heads | A middle option |

[[kksongs, lesson 1](https://www.kksongs.org/khol/); [krishna.org](https://krishna.org/history-of-the-fibreglass-balaram-tilak-mridanga/); [Wikipedia: Khol](https://en.wikipedia.org/wiki/Khol)]

**Parts.** The drum has two heads. The small, high head is the **dayan**, played with the right
hand. The large bass head is the **baya**, played with the left hand. Each head has rings, from
the outside in: the **kinar** (outer ring), the **maidan** (middle field) and the **syahi** (the black
centre). [[kksongs, lesson 1](https://www.kksongs.org/khol/)]

**How it is taught.** A student first learns the **bols**: syllables that name each stroke, such as
*tā*, *nā*, *ghe* and *dhin*. Then come the **taals**, rhythm cycles with a fixed number of beats,
such as Kaherva (8 beats) and the Dasapahira or "Prabhupada beat" (16 beats). Then the student
learns to play them in kirtan, with changes of speed and endings.
[[kksongs course index](https://www.kksongs.org/khol/); [Art of Kirtan, Mridanga 1](https://artofkirtan.org/mridanga1-course-signup)]

The words above are explained again in the [glossary](../GLOSSARY.md#mridanga-and-kirtan-terms).
The app's syllabus is entered by the Facilitator; the one in the test data is only a placeholder in
the order of the kksongs course. The real syllabus will come from the class.

## The problem the app replaces

Before this app, the class ran on **ten WhatsApp groups** and **Excel sheets**. That works for a
small fixed batch. It does not work for a drop-in class:

- **Attendance.** With no batches there is no roll call. Students arrive and leave all afternoon.
  An Excel sheet cannot easily say who came this week, or who has not come for a month. Attendance
  for Beginners was not being kept at all.
- **Students who drift away.** Nobody could see, in one place, which students had stopped coming,
  who had phoned them, and what they said.
- **Progress.** Each student learns at their own pace. A coordinator teaching today often cannot
  know what another coordinator taught that student last week.
- **Messages.** Announcements in ten WhatsApp groups get lost under other messages. Nobody knows
  who has read them. Files are forwarded again and again.
- **Children's data.** Some students are minors. Their details sat in chats and sheets with no
  record of a parent's consent.

The app puts these in one place:

| Before | With the app |
|---|---|
| Names ticked on paper or not at all | A student shows a **QR code** on their phone; the coordinator scans it. Each arrival and departure is a **visit** |
| Nobody knew who stopped coming | Students with no visit for 14 days are marked **Irregular**, and their **mentor** coordinator gets a call to make |
| "Did you call him?" in a chat | Every call is recorded: the outcome, the reason, what was said |
| Progress in each teacher's memory | A **syllabus** per level; a coordinator ticks each item when the student shows it in class |
| Ten WhatsApp groups | **Announcements** to all students, one level, a mentor's students, staff or a group, with "Seen by N of M" |
| Minors' details with no consent record | A student under 18 **cannot be saved** without a parent's signed consent |

## The spirit: built as seva

*Seva* means voluntary service. The class is seva, and this app was made as seva too: an offering
to Lord Krishna, so that the devotees who teach can spend their time on the students and the
kirtan, not on spreadsheets.

That spirit shows in practical choices, written down in [DECISIONS.md](../DECISIONS.md):

- **It costs nothing to run** in Phase 1. Every service it uses is on a free plan, and the Android
  app is shared by a link instead of a paid store ([DECISIONS.md #6](../DECISIONS.md)).
- **It keeps as little personal data as it can.** It stores only a student's area and pincode,
  never the full address. When a coordinator looks at a parent's ID for consent, the app records
  only the *type* of ID, never its number ([DECISIONS.md #8](../DECISIONS.md)).
- **Children are protected by the database itself.** A minor without a parent's consent is refused
  by the database, whichever screen or app version tries to save them
  ([DECISIONS.md #16](../DECISIONS.md)). India's data-protection law (the DPDP Act and Rules)
  requires verifiable parental consent for children; the class follows a signed paper form for now.
- **Nothing is hidden from those who take over.** The code is open source under the MIT licence.
  Every important choice has a written reason. These guides exist so that the app never becomes
  something only one person understands.
- **Content is respected.** Lesson videos stay on YouTube and are only linked, never downloaded
  and uploaded again. Scripture translations with copyright are not copied into the app
  ([DECISIONS.md #9](../DECISIONS.md)).
- **It was built carefully.** Every change is checked before it reaches a phone: see
  [How it was built](07-how-it-was-built.md).

The motto on the sign-in screen and the home screens says it in three words:
**Saṅkalpa · Sādhana · Seva** (resolve, practice, service).

---

[← Back to the guide](README.md) · Next: [2. Student guide →](02-student-guide.md)
