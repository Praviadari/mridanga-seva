# Phase 3 — Data protection impact assessment (DRAFT v2, 10-10-2026)

> **Not legal advice.** Written by an AI assistant from public sources so that the team can take it to
> a qualified Indian data-protection lawyer (and an EU/UK adviser before any expansion abroad). The
> law was read on secondary sites that reproduce the Act and Rules (dpdpa.com and law-firm notes), on
> 09-10-2026 and again on 10-10-2026, **not** in the official Gazette. Check every quote against the
> Act as published and the Rules, G.S.R. 846(E), with the commencement notification G.S.R. 843(E)
> (both 13-11-2025). §9 lists what the lawyer must confirm; question 1 comes first.

**v2 (10-10-2026, work package P3-8, DECISIONS #253-#255)** rewrites v1 (09-10-2026) for the decided
design (#248): face scan is **only the student's own phone checking that the face is that student
(1:1)**. There is no door tablet, no kiosk, no coordinator face scan, no 1:N search and no centre-wide
template cache. The tablet "modes A/B" of v1 are history (FACE_ATTENDANCE_PLAN.md, UPDATE box).
Summary for the lawyer: [LAWYER_PACK.md](LAWYER_PACK.md). Build plan: [WORK_PLAN.md](WORK_PLAN.md).

Closes (when reviewed): audit **D4-18** ("Face recognition of children planned without an
impact-assessment step"). Related: D4-12 (processors abroad), D4-07 (retention), DECISIONS #8, #16,
#55, #70, #74, #75, #76, #131, #146, #150, #167, #212, #213, #224-#231 (parent emails; check-out only
since 0044), #248.

## 1. The processing

| Item | Description |
|---|---|
| Data fiduciary | The class's controller as named in the privacy notice (#131 — legal name and address still "to confirm") |
| Purpose | Record a student's arrival and departure at the class (attendance, DECISIONS #2) with certainty that the right person is marked, without a coordinator; tell the parent of a minor when the child's check-out is recorded |
| Data subjects | Students (~200, **many under 18**) at Abids (Hyderabad) first; parents/guardians of minors (email); coordinators (enrolment confirmation) |
| Data | (a) **Face template** of the student (numbers computed on the phone; no image kept); (b) the face consent record; (c) per visit: method `face`, match score, liveness pass, location **result** inside/outside + distance in metres (never the position, #70); (d) the guardian's email for the check-out notice (#227) |
| Not collected | Face images or video; location coordinates; continuous, periodic or background location; location history; any location outside a check-in/out action; emotion, attention or behaviour analysis; any face data of anyone except the enrolled student |
| Where | The **student's own phone** (their own template, encrypted with the Android Keystore); Supabase Postgres in Mumbai (ap-south-1) — encrypted server copy of the template (for re-install and deletion proof) and the visits; Brevo (EU) sends the parent email (processor — D4-12 register) |
| Who sees | Templates: no person; only the student's own app reads its own template, through a logged function. Visits: as today (#70). Check-out email: the guardian on record |
| Retention | §7 |
| Scale | ~200 people, one centre; more centres and abroad later |
| Technology | On-device face detection (ML Kit), passive liveness (MiniFASNet) + an active challenge (blink / turn), embedding (SFace) — MODEL_OPTIONS.md; one GPS fix at the check-in/out tap; Google Play Integrity verdict for the phone and app |

### 1.1 The flow in one paragraph

**Enrolment, once, supervised:** after the face consent is signed at the desk (the parent's for a
minor, §3), the student opens "Face scan" on **their own phone at the desk**; the phone takes 3-5
frames with a liveness check, computes the template, discards the frames, and keeps the template
encrypted on the phone; a coordinator confirms on the spot that it is the right student (design in
P3-4), and only then the server stores its encrypted copy. **Each check-in / check-out:** inside the
centre's class window the student taps "Check in"; the phone reads its location **once** (foreground,
≤ 8 s), runs active + passive liveness, compares the live face with **its own stored template only**,
gets a Play Integrity verdict, and sends the server: the match result and score, the liveness result,
the location result computed from that one fix, and the integrity token. The server re-checks
consent, window, location result and integrity and saves the visit. Self-scan is **refused**
outside the area, offline, with a mocked location, without integrity, or outside the window; the
student is always offered "Ask a coordinator (QR card / roll number)". Check-out: the same, except
that outside the area it is saved and flagged, never blocked; a recorded check-out of a minor
queues the parent email (0043/0044).

## 2. Is a DPIA required?

- **DPDP:** a periodic DPIA is a duty of a **Significant Data Fiduciary** (s.10(2)(c), Rule 13). The
  class is not one (not notified; small). So this DPIA is **voluntary good practice**, recommended by
  audit D4-18 because children's biometric data is the highest-risk area of the Act.
- **GDPR (if expanding to the EU/UK):** mandatory under Art. 35 — biometric data used to identify a
  person (Art. 9) of vulnerable subjects (children) with a new technology meets several EDPB
  criteria. The Swedish DPA fined a school partly for not doing one (§5).

## 3. Legal basis under DPDP (India)

| Requirement | Where | How Phase 3 meets it |
|---|---|---|
| Notice before consent: itemised data and purpose, how to withdraw and complain | s.5, Rule 3 | Face, location and parent-email sections added to the privacy notice ([PRIVACY_NOTICE_DRAFT.md](PRIVACY_NOTICE_DRAFT.md)) + the consent forms ([CONSENT_DRAFT.md](CONSENT_DRAFT.md)); notice version stored on the consent (#150) |
| Consent "free, specific, informed, unconditional and unambiguous", clear affirmative action, limited to necessary data | s.6(1) | A **separate** opt-in, never bundled with the class data consent; nothing pre-ticked; class access never depends on it; QR / coordinator path for good (#213) |
| Withdrawal as easy as giving | s.6(4) | "Turn face scan off" — one tap in the app — or a word at the desk; template deleted (§7) |
| Verifiable consent of the parent before processing a child's data | **s.9(1), Rule 10** | The parent signs the face consent **in person at the desk**; the coordinator sees an ID document and notes only its type (#8, #16, #74). We read this as Rule 10(1)(b)(i): identity and age details voluntarily provided by an identifiable adult. Lawyer to confirm (§9 Q3) |
| No processing likely to harm a child's well-being | s.9(2) | No profiling, no ranking, no disadvantage or reminders for opting out, nothing public; false accept managed (§6 R3) |
| **No tracking or behavioural monitoring of children** | **s.9(3)** | **§4.** One foreground location reading at the moment of the student's own check-in/out tap, result only (#212); no live location, no history, no map; no behaviour or emotion analysis |
| Reasonable security safeguards: encryption, access control, logs + review, continuity, contracts with processors | s.8(5), **Rule 6** | Template encrypted on the phone (Keystore) and on the server (Vault key); no direct table access; only one's own template through a logged function (`access_log`, 0034); Play Integrity; processor terms (D4-12) |
| Breach notice to the Board and each affected person | s.8(6), **Rule 7** | The breach runbook (OPERATIONS) gains "template exposure": tell the people affected without delay; detailed report to the Board within 72 hours of becoming aware (Rule 7(2)) |
| Erase when consent is withdrawn or the purpose ends | s.8(7) | §7 |
| Grievance, rights (access, correction, erasure, nomination) | s.11-14 | The privacy contact and erasure (#76) cover templates |
| Transfers abroad | s.16 | Allowed except to countries the government restricts; none notified (D4-12). The template stays on the phone and in Mumbai; only the parent email leaves India (Brevo, EU) and it carries no face or location data |

**Commencement (re-verified 10-10-2026, secondary sources):** the Rules and the commencement
notification were published on 13-11-2025 (PIB and one law firm say the Gazette is dated
14-11-2025). Rules 1, 2, 17-21 and Act ss.1(2), 2, 18-26, 35, 38-43, 44(1) and 44(3) applied at once;
Rule 4 (consent managers) after one year; **Rules 3, 5-16, 22, 23 and Act ss.3-17 (most of s.6),
27-34, 36, 37 and 44(2) after 18 months — 13-05-2027** (some firms count 14-05-2027). Phase 3 goes
live 30-04-2027, so it is built to the Rules from day one.

**Penalties (Act, Schedule, ceilings "may extend to"; re-verified 10-10-2026):** security safeguards
(s.8(5)) up to ₹250 crore; breach notice (s.8(6)) up to ₹200 crore; the children's duties (s.9) up
to ₹200 crore.

**Biometric data is not a special category in DPDP** (one class of personal data). The IT
(Reasonable Security Practices…) Rules 2011 treat biometrics as sensitive personal data needing
written consent; they hang on IT Act s.43A, which **DPDP s.44(2) omits from 13-05-2027** (re-verified
10-10-2026 in secondary sources: s.44(2) is in the 18-month group of G.S.R. 843(E)). Until then the
SPDI Rules still apply; the class's written consent satisfies both. Lawyer to confirm (§9 Q6).

## 4. Why one location reading at the child's own check-in is not "tracking" (s.9(3))

**This is the lawyer's first question (§9 Q1).** v1 used a fixed door tablet, so a child's phone never
sent location; in v2 the child's **own phone** reads location at check-in and check-out. Our argument
that this is not "tracking or behavioural monitoring of children":

1. **What is read.** One location fix, in the foreground, only when the student taps Check in or
   Check out, inside the class window (#212). Never in the background, on a timer, while the app is
   merely open, or on the way to or from class. The APK has no background-location permission, no
   foreground service and no iOS background mode (`blockedPermissions`, brief 9).
2. **What is kept.** Only the result against **one fixed point** — inside / outside the class area and
   the distance in metres — computed by the database; the coordinates are never stored (#70) and are
   not in the visit, the logs, the parent email (#228) or any report.
3. **Why it is not tracking.** The Act does not define "tracking". In its ordinary meaning, and in
   the Rules' own usage, tracking is following where a person is or goes over time: the Fourth
   Schedule (Part A item 5) separately exempts "tracking the location of such children ... during
   the course of their travel" by school transport — i.e. the Rules treat a running location record
   of a journey as tracking. A single yes/no at an action the child chooses, against the class
   address, answers "was this check-in made at the class?" — an attendance fact the class already
   records today by coordinator check-ins (#70). No sequence, no route, no position.
4. **Why it is not behavioural monitoring.** Nothing is inferred about the child's behaviour,
   habits or interests; the face match answers only "is this the enrolled student?" The visit times
   are the same attendance record a QR check-in creates. No profiling, ranking or analytics on
   individual children; staff see only counts of failed self-scans by reason (P3-6, #213).
5. **The parent email.** Since 0044 the guardian of a minor gets an email only when a check-out is
   recorded in the app (name, centre, time; never the location or the area result — #228, #231
   answers). It reports a recorded attendance event, not where the child is.
6. **Fallback if the lawyer disagrees** (no rebuild of anything else): minors self-scan without the
   location step and with the coordinator's glance instead, or minors use only the QR card /
   coordinator path; adults keep self-scan. Proposal for P3-5: put the location step for minors
   behind a setting, so either answer can be applied without a new APK.

**The Fourth Schedule exemption (Rule 12; re-read 10-10-2026).** Rule 12(1) lifts s.9(1) and 9(3) for
the classes in Part A of the Fourth Schedule. Part A item 3 is "a Data Fiduciary who is an
educational institution", "restricted to tracking and behavioural monitoring" for its educational
activities or "in the interests of safety of children enrolled with such institution"; the note
defines an educational institution as "an institution of learning that imparts education, including
vocational education". (The reproduction heads the Schedule "[See rule 11]" while the operative rule
is 12 — check in the Gazette.) It is **uncertain** whether a temple's drop-in mridanga class
qualifies, and the exemption would not lift s.9(2), consent quality, notice, security or erasure.
**We do not rely on it**; if the lawyer confirms the class qualifies, it is a margin of safety, not a
licence to track.

## 5. Necessity and proportionality

- **Less intrusive means exist and stay:** the coordinator's QR scan (#17, #21), the printed QR card
  or roll number for students without phones (P3-1), coordinator taps, with the area flag (#70). The
  **parent email works without face** (it is built on today's check-outs). Face adds certainty
  against QR screenshots and friends marking friends, and lets a student check in without queuing.
- **Precedent — Sweden, 2019:** the Swedish DPA (DI-2019-2221) fined the Skellefteå
  secondary-education board SEK 200,000 for a 3-week face-recognition attendance trial of 22 pupils:
  GDPR Art. 5 (minimisation), Art. 9 (consent not freely given, given the pupil–school imbalance)
  and Art. 35-36 (no DPIA); "less intrusive ways" existed.
- **What makes our case different, and must stay true:** face is optional with an equally easy QR
  path; no disadvantage, pressure or ranking for those who say no; no images kept; the student's
  template stays on their phone and our server in India; matching is 1:1 only (the app never
  searches a face among others); the child's own refusal counts; deletion at will. If the team cannot
  keep these, face should not go ahead for minors.
- **Proposed conclusion (for the Guru/lawyer):** proportionate **only** as an optional convenience
  with the safeguards in §6, after the lawyer's answer on §4, and from a minimum age (DECISIONS_FOR_GURU
  item 3, recommended 13).

## 6. Risks and mitigations

Scale: likelihood L/M/H × impact L/M/H, after mitigation.

| # | Risk | Before | Mitigation | After |
|---|---|---|---|---|
| R1 | Server template table leaked or stolen | M×H | Templates encrypted with a Vault key; no direct table access for any role; a student's app can fetch only its own template, logged; no images exist; no centre-wide copy exists on any device | L×M |
| R2 | Templates reused for another purpose (surveillance, marketing, police without legal process) | L×H | 1:1 design has no search function to misuse; purpose limited in consent and notice; a new purpose needs new consent and a DECISIONS entry; legal requests via the privacy contact only | L×M |
| R3 | **Wrong child marked present** (false accept) → parent told of a check-out that was someone else | M×H | Conservative threshold (prefer "use your QR"); active + passive liveness; the match is only against the logged-in student's own template, so another child must also have the phone and login; supervised enrolment; parents can query; pattern review | L×M |
| R4 | Child repeatedly not recognised (false reject), embarrassment | M×M | After a failure the screen offers the coordinator path; three failures → suggest the coordinator; re-enrol; no public display | L×L |
| R5 | Bias: worse accuracy for some faces (children, darker skin, siblings) | M×M | Own calibration with consenting adult volunteers, then the pilot; minimum age; minors re-enrol yearly; failure counts by age band only (aggregate) | L×M |
| R6 | Consent not free (pressure from class, peers, the Guru's wish) | M×H | QR equal and permanent; no reminders; consent taken by the desk, not the Guru; child's refusal respected; switch-off one tap | L×M |
| R7 | **Location seen as tracking** (by law or by parents) — the child's own phone reads it | M×H | §4: one fix at the action, foreground, result only, no coordinates stored, no map, not in the parent email; no background permission in the APK; lawyer question 1; fallback in §4.6 | L×M |
| R8 | Spoofing: fake location, photo/video of the student, a friend holding the phone, a rooted phone injecting a camera stream | H×M | Supervised first enrolment; active random challenge + passive liveness; Android `mocked` check; **Play Integrity** verdict checked by the server with a nonce; refused offline; class window only; pattern review; coordinator path always open | L×M |
| R9 | Parent email to the wrong person (stale guardian email) | L×M | Only the guardian on record; one-click Unsubscribe (#227); minimal content (full name, centre, time, check-out); never location | L×L |
| R10 | Processor exposure (Brevo emails; Google Play Integrity sees device/app attributes) | M×M | No face data and no location reach any processor; Play Integrity added to the processor register and notice; a cloud face API is **not** planned and would need this DPIA redone | L×L |
| R11 | Model licence / training-data provenance challenge | M×M | Apache-licensed weights; lawyer opinion on training data (MODEL_OPTIONS §6) | L×M |
| R12 | Lost / stolen / shared student phone | M×M | Template encrypted in the Keystore, unusable off that phone; sign-out wipes it; self-scan also needs the login and a live face; the desk can turn face off for the student at once (server copy deleted, self-scan refused server-side) | L×L |
| R13 | Templates kept after a child leaves | M×M | Server copy deleted at Left + 30 days, yearly expiry for minors, in withdraw/erase (#75, #76); the phone copy is wiped when the app next sees no server template | L×L |

**Open technical caveat on R8 (for P3-0 / P3-6, not the lawyer):** the app is today an APK installed
from a link, not from Google Play (OPERATIONS "Android app"). Play Integrity needs the app linked to
a Play Console / Cloud project, and its app-recognition verdict expects a Play-distributed build; a
link-installed APK may get only the device verdict. If Play Integrity cannot be used, R8's "after"
rises to **M×M** and self-scan for minors should wait (or keep the coordinator path only) until the
app is on Play. The spike must check this.

## 7. Retention and withdrawal

| Data | Kept | Deleted |
|---|---|---|
| Face template — **server copy** (encrypted) | While the face consent is current | **At once** on switch-off, withdrawal (#75), erasure (#76); 30 days after status Left; 12 months after enrolment (minors) / 24 months (adults); on a model change |
| Face template — **phone copy** (Keystore-encrypted) | While face scan is on for that login on that phone | At once on "Turn face scan off" and on sign-out; with the app's data on uninstall; when the app, at its next start online, finds no current server template (withdrawn at the desk, expired, erased) — and until then the server refuses any self-scan without a current consent and template |
| Images / video frames | Never stored (processed in memory) | — |
| Face consent record (who, when, notice version, revoked when) | As long as the class keeps consent proof (D4-07) | With the student's erasure (#76) |
| Visit method / score / liveness / location result | Visit retention (D4-07) | As visits |
| Logs of template reads (`access_log`) | 400 days (0034) — meets Rule 6(1)(e)'s one year | Purged after 400 days |
| Parent email queue rows (`parent_notices`) | 30 days (#229) | Purged by each run |
| Parent emails sent | Brevo's log only | Per Brevo's retention; record in the processor register |

**Withdrawal (DPDP s.6(4))**: the student taps "Turn face scan off" (adult, or a minor themself), or
the parent tells the desk (no parent login exists); the Guru's `withdraw_consent` and `erase_student`
also delete it. Effect: template deleted, QR continues, nothing else changes. The child's own "no"
stops face scan even with the parent's signature.

## 8. GDPR note (planned expansion abroad)

- Face templates used to identify a person are **special category** data (Art. 9(1)); they need
  **explicit consent** (Art. 9(2)(a)); Skellefteå shows consent may be invalid where there is an
  imbalance — a real alternative (QR) and no detriment are essential.
- Child consent for online services: Art. 8 (age 13-16 depending on the country); parental consent
  below it.
- DPIA mandatory (Art. 35); consult the authority if high residual risk remains (Art. 36).
- Privacy by design (Art. 25): on-device, 1:1, no images, minimal location — already the design.
- **UK:** ICO Children's Code standard 10 "geolocation" — off by default, obvious when on (our
  location is read only at the tap, with the reason on screen). Protection of Freedoms Act 2012
  ss.26-28 (schools): written parental consent, an alternative, and **any parent's objection or the
  child's own refusal stops biometric processing** — adopted everywhere as good practice
  (CONSENT_DRAFT, line C).
- **USA (if ever):** Illinois BIPA and similar: written release, published retention schedule,
  destruction within 3 years of the last interaction at most. Not researched in depth.
- Redo this DPIA per country before face is switched on there; `centres.country_code` (0033) lets
  the app keep face off per country.

## 9. What a lawyer must confirm (in this order)

1. **s.9(3) and the child's own phone.** Is one foreground location reading on the child's own
   phone at the child's check-in/out tap, compared with the class address and stored only as
   inside/outside + distance, outside "tracking or behavioural monitoring" (§4)? Is the parent's
   check-out email "monitoring"? If not safe, which fallback in §4.6?
2. **Face matching for attendance.** Is 1:1 face verification (no behaviour analysis) itself
   "behavioural monitoring", or a risk under s.9(2)? Any minimum age you would advise?
3. **Verifiable parental consent.** Is the parent's signed paper consent, given in person with the
   coordinator noting the ID type seen (no copy, no number — #8), "verifiable consent" under s.9(1)
   and Rule 10(1)(b)(i) for biometric data, or is a DigiLocker / virtual-token check expected?
4. **Consent texts.** Are CONSENT_DRAFT F-P / F-A / L / W adequate (s.6, Rule 3), including the
   child's own refusal (line C) and the separate location wording without its own database scope
   (DECISIONS_FOR_GURU item 9)? Is "face code (biometric data)" the right word for parents?
5. **Educational institution.** Does the class qualify under the Fourth Schedule note? Does it matter?
6. **SPDI Rules until 13-05-2027.** Confirm the s.44(2) commencement and whether anything beyond
   written consent is needed for biometrics before then (Phase 3 goes live 30-04-2027).
7. **Rule 6(1)(e) "one year".** Does it require keeping any personal data (e.g. a deleted template)
   for a year, or only logs? We delete templates at once and keep read logs 400 days.
8. **Who is the data fiduciary** (temple trust? society? an individual?) and the grievance officer —
   open since #131; plus the training-data question of the model weights (MODEL_OPTIONS §6) if the
   lawyer covers IP.

## Sources

Read 09-10-2026 (v1) and **re-verified 10-10-2026** where marked ✓:
- DPDP Act 2023 s.9 (reproduction) — https://dpdpa.com/dpdpa2023/chapter-2/section9.html
- DPDP Rules 2025, Rule 10 ✓ — https://dpdpa.com/dpdparules/rule10.html ; Rule 12 — https://dpdpa.com/dpdparules/rule12.html ; Rule 6 — https://dpdpa.com/dpdparules/rule6.html ; Fourth Schedule ✓ — https://dpdpa.com/schedule/schedule4.html ; Rule 13 — https://dpdpa.com/dpdparules/rule13.html
- Commencement ✓ — Mondaq, "Digital Personal Data Protection Rules 2025 notified" (Rule 7 72 hours, Rule 6 one year, phases) https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified ; King Stubb & Kasiva, SPDI Rules after DPDP (s.44(2) omits IT Act s.43A from 13-05-2027) https://ksandk.com/data-protection-and-data-privacy/what-happens-spdi-rules-after-dpdp-enforcement/ ; PIB backgrounder (14-11-2025) https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ; https://www.dpdpa.com/dpdpa_enforcement_timeline.html ; SCC Online 14-11-2025 https://www.scconline.com/blog/post/2025/11/14/meity-notified-digital-personal-data-protection-rules-2025/
- Penalties ✓ — Schedule reproduction https://dpdpa.com/theschedule.html ; AM Legals https://amlegals.com/penalties-under-the-digital-personal-data-protection-act2023/
- s.9(3) commentary ✓ (none defines "tracking"; scope contested) — CyberPeace https://cyberpeace.org/resources/blogs/prohibition-of-behavioral-tracking-and-targeted-advertising-for-children-under-the-dpdp-act-2023 ; CUTS https://cuts-ccier.org/?p=28209
- Schools exemption — https://www.storyboard18.com/digital/dpdp-rules-carve-out-key-exemptions-for-healthcare-providers-schools-and-childcare-services-processing-childrens-data-84208.htm ; https://ssrana.in/articles/schools-coaching-centres-platforms-processing-childrens-data-are-you-compliant/
- Play Integrity quota ✓ (default 10,000 requests per day per Cloud project; price not stated) — https://developer.android.com/google/play/integrity/setup
- Swedish DPA DI-2019-2221 — https://Datainspektionen.se/globalassets/dokument/beslut/facial-recognition-used-to-monitor-the-attendance-of-students.pdf ; EDPB news 22-08-2019 — https://edpb.europa.eu/news/national-news/2019/facial-recognition-school-renders-swedens-first-gdpr-fine_sv
- Not re-read (from knowledge; verify): GDPR Art. 8, 9, 25, 35, 36; ICO Children's Code standard 10; UK PoFA 2012 ss.26-28; Illinois BIPA.
