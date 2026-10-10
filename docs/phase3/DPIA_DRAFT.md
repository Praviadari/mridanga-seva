# Phase 3 — Data protection impact assessment (DRAFT, 09-10-2026)

> **UPDATE 10-10-2026 (DECISIONS #248):** the design is now **self-scan on the student's own phone only** (no door tablet, no coordinator face scan; no phone = printed QR card or roll number). Sections on modes A/B, the kiosk cache and the tablet are history; work package P3-8 in [WORK_PLAN.md](WORK_PLAN.md) revises this draft for self-scan **before** it goes to the lawyer.

> **Not legal advice.** This draft was written by an AI assistant from public sources for the team
> to take to a qualified Indian data-protection lawyer (and an EU/UK adviser before any expansion
> abroad). Quotes of the law were read on secondary sites that reproduce the Act and Rules
> (dpdpa.com) on 09-10-2026, **not** on the official Gazette; check every quote against
> G.S.R. 846(E) (13-11-2025) and the Act as published. §9 lists what the lawyer must confirm.

Closes (when reviewed): audit **D4-18** ("Face recognition of children planned without an
impact-assessment step"). Related: D4-12 (processors abroad), D4-07 (retention), DECISIONS #8, #16,
#55, #70, #74, #75, #76, #131, #146, #150, #167, #212, #213.

## 1. The processing

| Item | Description |
|---|---|
| Data fiduciary | The class's controller as named in the privacy notice (#131 — legal name and address still "to confirm") |
| Purpose | Record a student's arrival and departure at the class (attendance, DECISIONS #2) with certainty that the right person is marked; tell the parent of a minor when the child is checked in and out |
| Data subjects | Students (~200, **many under 18**), at Abids (Hyderabad) first; coordinators as operators |
| Data | (a) **Face template** (numeric embedding computed on the device; no image kept); (b) the face consent record; (c) per visit: method `face`, match score, liveness pass, location **result** inside/outside + distance (never the position, #70); (d) parent's email for notices |
| Not collected | Face images, video, continuous or background location, location history, the raw coordinates, emotion/attention/behaviour analysis, any use of face data for anything but attendance |
| Where | On the scanning device (encrypted cache); Supabase Postgres in Mumbai (ap-south-1) for templates (encrypted) and visits; Brevo for notice emails (processor — D4-12 register) |
| Who sees | Templates: no person; the scanner app of the student's centre through a logged function. Visits: as today (#70). Notices: the parent |
| Retention | §7 |
| Scale | ~200 people, one centre; more centres and abroad later |
| Technology | On-device face detection, liveness and embedding models (MODEL_OPTIONS.md); GPS at the moment of check-in/out |

## 2. Is a DPIA required?

- **DPDP:** a periodic DPIA is a duty of a **Significant Data Fiduciary** (s.10, Rule 13). The class
  is not one (not notified; small). So this DPIA is **voluntary good practice**, recommended by
  audit D4-18 because children's biometric data is the highest-risk area of the Act.
- **GDPR (if expanding to the EU/UK):** mandatory under Art. 35 — biometric data for unique
  identification (Art. 9) of vulnerable subjects (children) with a new technology meets several
  EDPB criteria. The Swedish DPA fined a school partly for not doing one (§5).

## 3. Legal basis under DPDP (India)

| Requirement | Where | How Phase 3 meets it |
|---|---|---|
| Notice before consent, itemised data and purpose, how to withdraw and complain | s.5, Rule 3 | Face section added to the privacy notice (#131) + the consent text itself (CONSENT_DRAFT.md); notice version stored on the consent (#150) |
| Consent "free, specific, informed, unconditional and unambiguous", clear affirmative action, limited to necessary data | s.6(1) | A **separate** opt-in, never bundled with the class data consent; no tick pre-filled; class access never depends on it (#213) |
| Withdrawal as easy as giving | s.6(4) | Switch in the app / at the desk; template deleted (plan §6.4) |
| Verifiable consent of the parent before processing a child's data | **s.9(1), Rule 10** | Parent signs the face consent at the desk with the coordinator checking the parent's ID type (as #16/#74 for data consent: the parent is an identifiable adult per Rule 10(1)(b)(i), details voluntarily provided). Lawyer to confirm this is "verifiable" (§9) |
| No processing likely to harm a child's well-being | s.9(2) | No profiling, no ranking, no disadvantage for opting out, no public display; false-accept risk managed (§6) |
| **No tracking or behavioural monitoring of children** | **s.9(3)** | Decided (#212, Praveen 09-10-2026): no live or continuous tracking at all; location read **only** at a check-in/out action, foreground, against the class geofence, result only; no live location, no history, no "where is my child" map; no behaviour/emotion analysis of faces |
| Reasonable security safeguards: encryption, access control, logs + review, continuity, contracts with processors | s.8(5), **Rule 6** | Template encryption with a Vault key; no direct table access; logged reads (`access_log`, #146); processor terms (D4-12) |
| Breach notice to the Board and each affected person | s.8(6), **Rule 7** | Existing breach runbook (OPERATIONS, brief 7) gains "template exposure": tell parents without delay, Board report within 72 hours (Rule 7(2)) |
| Erase when consent is withdrawn or purpose ends | s.8(7) | §7 retention |
| Grievance, rights (access, correction, erasure, nomination) | s.11-14 | Existing privacy contact and erasure (#76) cover templates |
| Transfers abroad | s.16 | Allowed except to countries the government restricts; none notified (audit D4-12). On-device design keeps face data in India |

**Commencement:** rules 3, 5-16, 22 and 23 (including Rules 6, 7, 10 and 12) apply from
**13-05-2027**; Phase 3 goes live 30-04-2027, so it is built to the Rules from day one.

**Penalties (Act, Schedule):** breach of the children's obligations (s.9) up to ₹200 crore; failure
of reasonable security safeguards up to ₹250 crore; failure to notify a breach up to ₹200 crore.

**Biometric data is not a special category in DPDP** (the Act has one class of personal data). The
older IT (Reasonable Security Practices…) Rules 2011 treat biometrics as sensitive personal data
requiring written consent; they hang on IT Act s.43A, which DPDP s.44(2) omits. Whether s.44(2) is
already in force — **lawyer to confirm**; until then follow both (written consent satisfies both).

## 4. The Fourth Schedule exemption (Rule 12)

- **Rule 12(1)** (heading "Exemptions from certain obligations applicable to processing of personal
  data of child"): "The provisions of sub-sections (1) and (3) of section 9 of the Act shall not be
  applicable to processing of personal data of a child by such class of Data Fiduciaries as are
  specified in Part A of Fourth Schedule, subject to such conditions as are specified in the said
  Part." Rule 12(2) does the same for the purposes in Part B.
- **Fourth Schedule, Part A, item 3 — educational institution:** processing "restricted to tracking
  and behavioural monitoring" (a) "for the educational activities of such institution; or" (b) "in
  the interests of safety of children enrolled with such institution." The Schedule's note defines
  an educational institution as "an institution of learning that imparts education, including
  vocational education".
- (Note: one reproduction heads the Schedule "[See rule 11]" while the operative rule is 12 — a
  cross-reference to check in the Gazette.)
- Item 4 covers crèches/day-care for safety; item 5 covers transport engaged by an institution for
  location tracking during travel. Part B (purposes) has nothing relevant to attendance.

**Assessment:**
1. It is **uncertain** whether a temple's mridanga seva class (informal, drop-in, no registration as
   a school) is an "institution of learning that imparts education". Arguable (it teaches a skill,
   has levels and assessments), not settled.
2. Even if it applies, the exemption only lifts s.9(1) and 9(3) **for tracking and behavioural
   monitoring** for education or safety. It does not lift s.9(2), s.6 consent quality, notice,
   security or erasure, and it would not cover face recognition as such.
3. **Recommendation: do not rely on it.** Design to comply without it: parental consent for face
   (s.9(1)) and no tracking beyond the single check-in/out point (s.9(3)). If the lawyer confirms the
   class qualifies, that is a safety margin (e.g. for the parent notice), not a licence to track.
4. Is a check-in/out location point "tracking"? A single foreground reading at an action the student
   takes, stored only as inside/outside, is in our view an attendance record, not tracking —
   **lawyer to confirm**. A live or periodic location of a child would be tracking.

## 5. Necessity and proportionality

- **Less intrusive means exist and work today:** QR check-in (#17, #21) and coordinator taps, with
  the GPS flag (#70). Face adds certainty against QR screenshots and friends marking friends, and
  saves coordinator time; the **parent notice works without face** (plan §1).
- **Precedent — Sweden, 2019:** the Swedish DPA (Datainspektionen, DI-2019-2221) fined the
  Skellefteå secondary-education board SEK 200,000 for a 3-week trial of face recognition for
  attendance of 22 pupils: breaches of GDPR Art. 5 (minimisation/proportionality), Art. 9 (no valid
  basis: **consent was not freely given** given the imbalance between pupils and school) and
  Art. 35-36 (no DPIA, no prior consultation); "less intrusive ways" existed.
- **What makes our case different, and must stay true:** face is strictly optional with an equally
  easy QR path; no disadvantage, pressure or ranking for those who say no; images never kept;
  templates on our infrastructure in India; the child's own refusal is respected; deletion at will.
  If the team cannot keep these, face should not go ahead for minors.
- **Proposed conclusion (for the Guru/lawyer):** proportionate **only** as an optional convenience
  with the safeguards in §6; for minors, start with supervised scanning (door tablet/coordinator) and
  consider a minimum age (DECISIONS_FOR_GURU #3).

## 6. Risks and mitigations

Scale: likelihood L/M/H × impact L/M/H, after mitigation.

| # | Risk | Before | Mitigation | After |
|---|---|---|---|---|
| R1 | Template database leaked or stolen | M×H | On-device matching; templates encrypted (Vault key); no direct table access; logged reads; cache encrypted, wiped on logout; no images exist to leak | L×M |
| R2 | Templates reused for another purpose (surveillance, marketing, sharing with police without legal process) | L×H | Purpose limited in the consent and notice; function only returns templates to the centre's scanner; any new purpose needs new consent and a DECISIONS entry; legal requests via the privacy contact only | L×M |
| R3 | **Wrong child marked present** (false accept) → parent told the child arrived when they didn't | M×H | Conservative threshold + margin; liveness; coordinator glance (mode A/B); notice says how it was marked; parents can query; pattern review | L×M |
| R4 | Child repeatedly not recognised (false reject), embarrassment | M×M | QR on the same screen after one failure; re-enrol; no public "failed" display | L×L |
| R5 | Bias: worse accuracy for some faces (children, darker skin, siblings) | M×M | Own calibration on our students' conditions; minimum age; re-enrol minors yearly; monitor failure rates by age band (aggregate only) | L×M |
| R6 | Consent not free (pressure from class, peers, Guru's wish) | M×H | QR equal and permanent; no reminders at the door; consent collected by the desk, not by the Guru; child's refusal respected; withdrawal one tap | L×M |
| R7 | Location misused as tracking / perceived as tracking by parents | M×H | #212: only at the action, foreground, result only; no map; notice says "never tracked"; no background permission in the APK | L×M |
| R8 | Spoofed location / photo for self-scan | M×M | Mocked check, Play Integrity, active liveness, minors not on self-scan initially; staff fallback | L×L |
| R9 | Parent notice to the wrong person (stale guardian email) | L×M | Notice only to the guardian on record; first notice asks to confirm; one-click unsubscribe; content minimal (first name, time, centre) | L×L |
| R10 | Processor exposure (Brevo emails; a cloud face API if Plan B) | M×M | On-device first; processor register + DPAs (D4-12); a cloud face API would need this DPIA updated | L×M |
| R11 | Model licence / training-data provenance challenge | M×M | Apache-licensed weights; lawyer opinion on training data (MODEL_OPTIONS §6) | L×M |
| R12 | Lost/stolen tablet | M×M | Kiosk login switched off from the dashboard; encrypted cache; device PIN; lost-device runbook | L×L |
| R13 | Templates kept after a child leaves | M×M | Auto-delete at Left + 30 days, yearly expiry for minors, deletion in withdraw/erase (#75, #76) | L×L |

## 7. Retention (proposal)

| Data | Kept | Deleted |
|---|---|---|
| Face template | While face consent is current | At once on withdrawal / switch-off / erasure; 30 days after status Left; 12 months after enrolment (minors) / 24 months (adults); on model change |
| Images | Never stored | — |
| Face consent record (who consented, when, notice version, revoked when) | As long as the class keeps consent proof (D4-07) | With the student's erasure (#76) |
| Visit method/score/liveness/location result | Visit retention (D4-07) | As visits |
| Logs of template reads (`access_log`) | 400 days (0034) — meets Rule 6(1)(e)'s one year | Purged after 400 days |
| Parent notice emails | Brevo's log only | Per Brevo's retention; record in the processor register |

## 8. GDPR note (planned expansion abroad)

- Face templates for identification are **special category** data (Art. 9(1)); needs **explicit
  consent** (Art. 9(2)(a)); the Skellefteå decision shows consent from pupils may be invalid where
  there is an imbalance — a real alternative (QR) and no detriment are essential.
- Child consent for online services: Art. 8 (age 13-16 depending on the country); parental consent
  below it.
- DPIA mandatory (Art. 35); consult the authority if high residual risk (Art. 36).
- Privacy by design (Art. 25): on-device, no images, minimal location — already the design.
- **UK:** ICO Children's Code standard 10 "geolocation" — switch geolocation off by default and make
  it obvious when it is on; and for schools, the Protection of Freedoms Act 2012 s.26-28 requires
  written consent from a parent and an alternative, and **any parent's objection or the child's own
  refusal stops biometric processing** — we propose adopting that rule everywhere (CONSENT_DRAFT).
- **USA (if ever):** Illinois BIPA and similar state laws: written release, published retention
  schedule, destruction within 3 years of the last interaction at most. Not researched in depth.
- The DPIA must be redone per country before face is switched on there; `centres.country_code`
  (0033) lets the app keep face off per country.

## 9. What a lawyer must confirm

1. Is the parent's signed paper consent with the coordinator noting the parent's ID type (no copy, no
   number — #8) "verifiable consent" under s.9(1) and Rule 10 for biometric processing, or is a
   DigiLocker/virtual-token check expected for this risk level?
2. Does the class qualify as an "educational institution" under the Fourth Schedule note? Does it
   matter for the parent notice?
3. Is a single foreground location reading at check-in/out, stored only as inside/outside, outside
   "tracking or behavioural monitoring" in s.9(3)? Is the parent notice of arrival/departure
   "monitoring"?
4. Is face matching itself (no behaviour analysis) "behavioural monitoring"? Any risk under s.9(2)?
5. Status of IT Act s.43A / SPDI Rules 2011 (biometric = sensitive) and DPDP s.44(2) commencement.
6. Rule 6(1)(e) "retain such logs and personal data for a period of one year": does it require
   keeping any personal data (e.g. a deleted template) for a year, or only logs? Our design deletes
   templates at once and keeps read logs 400 days.
7. Training-data provenance of the chosen model weights (MODEL_OPTIONS §6) — any exposure?
8. Wording of the consents (CONSENT_DRAFT) in en/te/hi, including the child's own refusal.
9. Who is the data fiduciary (the temple trust? a society? an individual?) and the grievance
   officer — open since #131.
10. Whether to tell the Data Protection Board anything in advance (no prior-consultation duty in
    DPDP for a non-SDF; confirm).

## Sources (read 09-10-2026)

- DPDP Act 2023, s.9 (reproduction) — https://dpdpa.com/dpdpa2023/chapter-2/section9.html
- DPDP Rules 2025, Rule 10 — https://dpdpa.com/dpdparules/rule10.html ; Rule 12 — https://dpdpa.com/dpdparules/rule12.html ; Rule 6 — https://dpdpa.com/dpdparules/rule6.html ; Fourth Schedule — https://dpdpa.com/schedule/schedule4.html ; Rule 13 / notification G.S.R. 846(E) — https://dpdpa.com/dpdparules/rule13.html
- Commencement phases (secondary) — https://www.scconline.com/blog/post/2025/11/14/meity-notified-digital-personal-data-protection-rules-2025/ ; https://dpdpa.com/dpdpa_enforcement_timeline.html
- Commentary on the schools exemption — https://www.storyboard18.com/digital/dpdp-rules-carve-out-key-exemptions-for-healthcare-providers-schools-and-childcare-services-processing-childrens-data-84208.htm ; https://ssrana.in/articles/schools-coaching-centres-platforms-processing-childrens-data-are-you-compliant/ ; https://tsaaro.com/blogs/regulatory-carve-outs-examining-exemptions-under-the-dpdp-act-2023-and-dpdp-rules-2025
- Swedish DPA decision DI-2019-2221 (English PDF) — https://Datainspektionen.se/globalassets/dokument/beslut/facial-recognition-used-to-monitor-the-attendance-of-students.pdf ; EDPB news 22-08-2019 — https://edpb.europa.eu/news/national-news/2019/facial-recognition-school-renders-swedens-first-gdpr-fine_sv ; IAPP analysis — https://iapp.org/news/a/how-to-interpret-swedens-first-gdpr-fine-on-facial-recognition-in-school
- Not re-read this session (from knowledge; verify): GDPR Art. 8, 9, 25, 35, 36; ICO Age Appropriate Design Code standard 10; UK Protection of Freedoms Act 2012 ss.26-28; DPDP Schedule penalty amounts; Illinois BIPA.
