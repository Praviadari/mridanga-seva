# Phase 3 face-scan attendance — decisions for the Guru (09-10-2026)

Each item has a **recommended default**; the Guru can accept it or choose otherwise. Answers by
**15 Nov 2026** keep the 1 Mar - 25 Apr 2027 build on track. Details: FACE_ATTENDANCE_PLAN.md,
MODEL_OPTIONS.md, DPIA_DRAFT.md, CONSENT_DRAFT.md.

Already settled (DECISIONS #212 — Praveen, 09-10-2026 — and #213): **no live or continuous
location tracking at all**; location is read **only** at the moment of check-in and check-out,
against the class area, and only "inside/outside + distance" is kept; verifiable parental consent
is taken; face is a **separate biometric opt-in**, and QR / coordinator check-in stays for everyone
for good. Settled 10-10-2026 (Praveen, #248): **self-scan on the student's own phone only, no
tablet, ₹0 budget**; no phone → printed QR card or roll number at the coordinator; parent emails on
check-out only (#231 answers). Still open for the Guru: items 1, 3 (minimum age), 4, 7, 8, 9, 11, 12.

1. **Go-ahead gate.** *Recommended:* face is switched on only after a lawyer has reviewed the DPIA
   and consent texts and the Guru signs off (closes audit D4-18). If the review comes late, ship
   parent notices first and face after.

2. **Who scans.** **DECIDED by Praveen 10-10-2026 (DECISIONS #248):** face scan is the
   **student's own phone only** (self-scan). No door tablet, no face scan on coordinator phones.
   A student **without a phone** shows a **printed QR card** or tells the coordinator their **roll
   number** (or name), and the coordinator checks them in as today (C5). The first face enrolment
   is done at the desk on the student's phone, with a coordinator confirming it is the right
   student.

3. **Face for minors.** Self-scan is open to minors with parental face consent (#248). *Still for
   the Guru:* face only from age **13** (recommended — younger children by QR; faces change fast and
   errors are higher). Re-enrol minors every 12 months.

4. **Geofence radius at Abids.** *Recommended:* **100 m** for self-scan (blocked outside, with
   "ask a coordinator"), **150 m** kept for staff check-ins (saved and flagged, #70). Fine-tune from
   pilot data.

5. **Check-out.** *Recommended:* check-out by self-scan or coordinator tap (QR card / roll number
   for students without phones). The nightly auto-close never makes up a leaving time and sends
   parents nothing (#231 answers). Self-scan check-out also checks location once (flagged, never
   blocked).

6. **Parent notifications.** **DECIDED 10-10-2026 (DECISIONS #231 answers, #246; 0043 built, 0044 makes it check-out only):**
   email to the guardian of a **minor** only when a **check-out is recorded in the app** — no
   check-in email, no night "no check-out" email (both G10 switches, off); opt-out with an
   Unsubscribe link; full name; never the location. Already built on today's QR check-in; switched
   on by the Guru on G10.

7. **Model and where it runs.** *Recommended:* **on the device** (no face image ever leaves the
   student's phone), with Apache-licensed open models (SFace + MiniFASNet, ML Kit detection). Not
   InsightFace's free models (non-commercial only). Cloud (AWS Rekognition, Mumbai) only as Plan B.

8. **Data location and keeping.** *Recommended:* face codes encrypted on the class's Supabase server
   in Mumbai and on the student's own phone only (no class device holds face codes, #248); no photos kept; deleted at once on withdrawal, 30 days
   after a student leaves, after 12 months (minors) / 24 months (adults), or on a model change.

9. **Location consent.** *Recommended:* tell it in the notice and the consent form (L-P / L-A text),
   plus the phone's own permission prompt; no separate database consent scope unless the lawyer
   asks for one.

10. **Budget.** **DECIDED by Praveen 10-10-2026 (DECISIONS #248): ₹0.** No tablet (students scan
    on their own phones); on-device open models (ML Kit, SFace, MiniFASNet — free, Apache 2.0);
    Supabase, Expo and Brevo free plans. Still recommended: a lawyer's review of the DPIA and
    consent texts — the team looks for a devotee lawyer to do it free. (A cloud face API, ≈$5-80/
    month, is not planned.)

11. **If a parent (or child) says no.** *Recommended:* nothing changes for that child — QR or
    coordinator, no reminders, no "face missing" mark, no difference in any report. The child's own
    "no" counts even if the parent signed.

12. **Schedule.** *Recommended:* keep 1 Mar - 25 Apr build / 30 Apr live, with a one-week native
    spike in Jan-Feb 2027 and face consents collected in Feb. Fallback for 30 Apr: parent notices
    + QR (cards for students without phones); face later. Work packages: [WORK_PLAN.md](WORK_PLAN.md).
