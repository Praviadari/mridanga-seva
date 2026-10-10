# Mridanga Seva — face-scan attendance: summary for legal review (10-10-2026)

*Prepared by the volunteer team with an AI assistant. **Not legal advice** — this page asks for it.
Draft for a pro-bono review; nothing described here is built or switched on yet.*

## Who we are and what we ask

Mridanga Seva is a free volunteer class teaching the mridanga (khol drum) at a temple in Abids,
Hyderabad: about 200 students, **many under 18**. An Android app records attendance (check-in /
check-out) by QR code scanned by a coordinator. From **30-04-2027** (two weeks before the DPDP Rules'
main duties apply on 13-05-2027) we would like to add an **optional face scan**. Please review the
design, the consent forms and the notice text, and answer the questions below.

## What the app would do

1. **Optional, separate consent.** Face scan only with its own written consent — the parent's, given
   in person at the desk, for a minor — plus the child's own "yes". Saying no changes nothing: the QR
   code, a printed QR card or the roll number at the coordinator stay for everyone, permanently.
2. **Own phone, 1:1 only.** The student's own phone compares the face in front of it with **that
   student's own face code** (a list of numbers; no photo kept). It never searches among other
   people. No class tablet, no camera at the door.
3. **Supervised set-up.** The face code is made once at the desk on the student's phone, with a
   coordinator confirming it is the right student. Kept encrypted on the phone and, encrypted, on
   our server in Mumbai.
4. **Anti-spoofing.** Live-face check (blink / turn + a passive model), Android's fake-location flag,
   Google Play Integrity (phone/app not tampered with). Refused offline or outside the class window.
5. **Location, once.** At the student's check-in / check-out tap only, the phone reads its location
   once, in the foreground. The server keeps only **inside / outside the class area + distance in
   metres**, never the coordinates. No background location, no history, no map. Outside the area a
   self check-in is refused (ask a coordinator); a check-out is saved and flagged.
6. **Parent email, check-out only.** For a minor, the guardian gets an email when a check-out is
   recorded: name, centre, time. Never location or photo. One-click unsubscribe. (Built; off.)
7. **Deletion.** One tap "turn off face scan", or a word at the desk, deletes the face code at once.
   Also deleted 30 days after leaving, after 12 months (minors) / 24 months (adults), on a model change.

## Questions (please answer in this order)

1. **s.9(3) — is this "tracking or behavioural monitoring" of a child?** One location reading on the
   child's **own phone**, at the child's own check-in/out tap, stored only as inside/outside + distance
   (DPIA §4 argues it is an attendance record, not tracking). Is the parent's check-out email
   "monitoring"? If it is not safe, which fallback (DPIA §4.6)?
2. **Face verification itself.** Is 1:1 face matching for attendance (no behaviour analysis)
   behavioural monitoring, or a risk under s.9(2)? Would you advise a minimum age (we propose 13)?
3. **Verifiable parental consent (s.9(1), Rule 10).** Is a signed paper form, given in person with the
   coordinator noting the *type* of ID seen (no copy, no number), enough for children's biometric
   data, or is a DigiLocker / virtual-token check expected?
4. **Consent and notice texts (s.5, s.6, Rule 3).** Adequate? Including the child's own refusal, the
   word "face code (biometric data)", and telling location in the form + notice without a separate
   consent tick.
5. **Fourth Schedule, Part A item 3.** Is this class an "educational institution"? (We do not rely on
   the exemption.)
6. **Until 13-05-2027:** do the IT Act s.43A / SPDI Rules 2011 (biometrics = sensitive data) need
   anything beyond written consent? (We read DPDP s.44(2) as omitting s.43A from 13-05-2027.)
7. **Rule 6(1)(e) "one year":** logs only, or also personal data such as a deleted face code?
8. **Who is the data fiduciary** (temple trust, a society, an individual?) and the grievance officer?

## What to read

| File (docs/phase3/) | Why | Length |
|---|---|---|
| [DPIA_DRAFT.md](DPIA_DRAFT.md) | The impact assessment: legal basis table (§3), the s.9(3) argument (§4), risks (§6), retention (§7), your questions in full (§9), sources | ~6 pages |
| [CONSENT_DRAFT.md](CONSENT_DRAFT.md) | The forms: face (parent / adult), the child's line, location, parent email, stopping — English master; Telugu/Hindi drafts | ~4 pages (English part) |
| [PRIVACY_NOTICE_DRAFT.md](PRIVACY_NOTICE_DRAFT.md) | Text to add to the class's privacy notice (website `/privacy/`, version 0.1-draft) | ~2 pages |
| Optional: [FACE_ATTENDANCE_PLAN.md](FACE_ATTENDANCE_PLAN.md) §3 (geofence), [MODEL_OPTIONS.md](MODEL_OPTIONS.md) §6 (model licences) | Background; the plan's tablet "modes A/B" are dropped | — |

Contact: [privacy contact / Praveen]. Please mark answers against the question numbers.
