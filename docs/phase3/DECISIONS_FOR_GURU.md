# Phase 3 face-scan attendance — decisions for the Guru (09-10-2026)

Each item has a **recommended default**; the Guru can accept it or choose otherwise. Answers by
**15 Nov 2026** keep the 1 Mar - 25 Apr 2027 build on track. Details: FACE_ATTENDANCE_PLAN.md,
MODEL_OPTIONS.md, DPIA_DRAFT.md, CONSENT_DRAFT.md.

Already settled (DECISIONS #212 — Praveen, 09-10-2026 — and #213): **no live or continuous
location tracking at all**; location is read **only** at the moment of check-in and check-out,
against the class area, and only "inside/outside + distance" is kept; verifiable parental consent
is taken; face is a **separate biometric opt-in**, and QR / coordinator check-in stays for everyone
for good.

1. **Go-ahead gate.** *Recommended:* face is switched on only after a lawyer has reviewed the DPIA
   and consent texts and the Guru signs off (closes audit D4-18). If the review comes late, ship
   parent notices first and face after.

2. **Who scans.** *Recommended:* a **door tablet** at the entrance plus **coordinator phones**
   (same screen, a coordinator present) first; **student self-scan on their own phone for adults
   only** in the first term; review after the pilot.

3. **Self-scan and face for minors.** *Recommended:* minors use the supervised scan (tablet /
   coordinator), **no self-scan** for under-18s in the first term; face only from age **13**
   (younger children by QR — faces change fast and errors are higher). Re-enrol minors every 12
   months.

4. **Geofence radius at Abids.** *Recommended:* **100 m** for self-scan (blocked outside, with
   "ask a coordinator"), **150 m** kept for staff check-ins (saved and flagged, #70). Fine-tune from
   pilot data.

5. **Check-out.** *Recommended:* check-out by face scan or coordinator tap; the nightly auto-close
   tells parents "no check-out recorded" (never a made-up time). Self-scan check-out also checks
   location once (flagged, never blocked).

6. **Parent notifications.** *Recommended:* **email** on check-in and check-out, on by default for
   minors (parent can turn off), off for adults; contains first name, centre, time and how it was
   marked — never the location. A parent app login is a later project. Can start in Dec 2026 on
   today's QR check-in, before face.

7. **Model and where it runs.** *Recommended:* **on the device** (no face image ever leaves the
   tablet/phone), with Apache-licensed open models (SFace + MiniFASNet, ML Kit detection). Not
   InsightFace's free models (non-commercial only). Cloud (AWS Rekognition, Mumbai) only as Plan B.

8. **Data location and keeping.** *Recommended:* face codes encrypted on the class's Supabase server
   in Mumbai and on the check-in devices; no photos kept; deleted at once on withdrawal, 30 days
   after a student leaves, after 12 months (minors) / 24 months (adults), or on a model change.

9. **Location consent.** *Recommended:* tell it in the notice and the consent form (L-P / L-A text),
   plus the phone's own permission prompt; no separate database consent scope unless the lawyer
   asks for one.

10. **Budget.** *Recommended:* one Android tablet with a good front camera and a stand
    (≈₹15-25k, estimate) + ₹0/month for on-device recognition; email notices on Brevo's free plan.
    Lawyer's review fee — team to arrange. (Plan B cloud: ≈$5-80/month.)

11. **If a parent (or child) says no.** *Recommended:* nothing changes for that child — QR or
    coordinator, no reminders, no "face missing" mark, no difference in any report. The child's own
    "no" counts even if the parent signed.

12. **Schedule.** *Recommended:* keep 1 Mar - 25 Apr build / 30 Apr live, with a one-week native
    spike in Jan-Feb 2027 and face consents collected in Feb. Fallback for 30 Apr: tablet face +
    parent notices only; self-scan later.
