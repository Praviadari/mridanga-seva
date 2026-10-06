# Translations

Every word the app shows is in three files, one per language. Screens never contain the words
themselves ([DECISIONS.md #12](DECISIONS.md)).

| Language | File | State |
|---|---|---|
| English | [`app/src/i18n/locales/en.json`](../app/src/i18n/locales/en.json) | Source: every key is defined here first |
| Telugu | [`app/src/i18n/locales/te.json`](../app/src/i18n/locales/te.json) | Draft, **needs review by a Telugu speaker** |
| Hindi | [`app/src/i18n/locales/hi.json`](../app/src/i18n/locales/hi.json) | Draft, **needs review by a Hindi speaker** |

## How it works

- The files are grouped by screen or topic: `signIn.title`, `pending.body`, `common.email`.
- A screen shows text with `t('signIn.title')` (from `useTranslation()` in react-i18next).
- `{{name}}` in a text is filled in by the app, e.g. `"Hare Krishna, {{name}}"`. Keep the
  `{{...}}` part exactly as it is when translating; move it wherever the sentence needs it.
- TypeScript checks the files: `npx tsc --noEmit` fails if a key is misspelt in a screen, or if
  Telugu or Hindi is missing a key that English has. So a missing translation is caught before
  release, not seen by a student.
- Some values are stored in the database as a code and translated only on screen: levels by
  number (`levels.1` = Beginner), relations (`relations.mother`), ID types (`idTypes.aadhaar`),
  student statuses (`statuses.irregular`), call outcomes (`callOutcomes.paused`), reasons for a
  call (`callReasons.studies`) and who an announcement is for (`announcements.audience.all`,
  `announcements.compose.audienceChoices.level` ...). The codes are listed in
  [DATABASE.md](DATABASE.md#registering-a-student), [DATABASE.md](DATABASE.md#follow-up-calls)
  and [DATABASE.md](DATABASE.md#announcements); never translate a code itself.
- The title and message of an announcement, replies, file names, and group names and purposes
  are shown exactly as people typed them, in whatever language they wrote; the app does not
  translate them. The words around them are in `announcements.*` (including
  `announcements.edit.*`, `announcements.replies.*` and `announcements.files.*`) and `groups.*`.
- A push notification shows the announcement's own title and text, so it is never translated.
  Only the name of the Android notification channel, which people see in the phone's settings,
  is in `push.*`; it is set in the language the app shows when the person signs in.
- Reasons for a call are a list the Guru can extend (`settings.call_reasons`). A reason added
  there without a translation in these files is shown as the Guru typed it, in every language,
  until a translator adds `callReasons.<code>` ([DECISIONS.md #19](DECISIONS.md)).
- The location check at check-in stores a code (`visits.location_check`: `outside`, `refused`,
  `no_fix`, `no_location`) that `attendanceLocation.*` words three ways: `flag.*` (the sentence on the
  result card), `short.*` (a list line, with `{{distance}}` in metres) and `reason.*` (the reports).
  `app/src/i18n/location-flag.ts` picks the right one ([DECISIONS.md #70](DECISIONS.md)). The phone's own
  permission prompt uses app.json's text (English), not these files.
- The helpers in `app/src/i18n/labels.ts` (`levelName`, `statusName`, `callReasonName`,
  `lastVisitText`, `audienceName` ...) turn codes into words, so every screen words them the same way.
- Language names in the language picker are always written in their own script (English,
  తెలుగు, हिन्दी), so people can find their language whatever the app shows now.

## Which language the app shows

1. The language the person picked on this device: the picker on the sign-in screens and, once
   signed in, at the bottom of the home screen (S1, C1, G1) and on My profile (A3). The
   choice is also saved to their profile — at once when they are signed in, otherwise when they
   sign in.
2. Otherwise the language saved on their profile (after they sign in on a new phone).
3. Otherwise the phone's or browser's language, if it is Telugu or Hindi.
4. Otherwise English.

The code is in `app/src/i18n/index.ts`, `app/src/components/language-picker.tsx`, and
`syncLanguageWithProfile` / `saveProfileLanguage` in `app/src/auth/auth-provider.tsx`.

## Adding or changing text

1. Add the key and the English text to `en.json`.
2. Add the same key to `te.json` and `hi.json`. If you cannot translate it, copy the English text
   and say so in the pull request, so a translator can pick it up.
3. Use it in the screen with `t('group.key')`.
4. Run `npx tsc --noEmit` in `app/`.

## Style for translators

- Plain, everyday words; short sentences. Many users are young students or their parents.
- Keep the devotional register the class uses: "Hare Krishna" as the greeting, "గురువుగారు" /
  "गुरुजी" in sentences about the Guru.
- Mridanga words (bol, taal, dayan, baya) stay as they are; see [GLOSSARY.md](GLOSSARY.md).
- Technical words people already know in English are fine in the local script: ఈమెయిల్ / ईमेल,
  పాస్‌వర్డ్ / पासवर्ड.
- The motto "Saṅkalpa · Sādhana · Seva" (`app.motto`) is the same in all three files, in Latin letters
  with diacritics ([DECISIONS.md #39](DECISIONS.md)); do not translate it. The tab labels
  (`tabs.*`), the mantra lines (`home.mantraLine1/2`), the module names (`modules.*`) and the Coming
  soon lines (`comingSoon.*`) in Telugu and Hindi are drafts that still need the review.
- **Phase 2 assessments** ([DECISIONS.md #52](DECISIONS.md)): every
  Telugu and Hindi line under `assessments.*` is a draft for the native-speaker review, and so are
  the notification lines in `assessment_push_line()` in `supabase/migrations/0016_assessments.sql`
  (the server words those in the person's app language). Words to check first: మూల్యాంకనం /
  मूल्यांकन (assessment), రూబ్రిక్ / रूब्रिक (rubric), స్థాయి పెంపు / स्तर-उन्नति (level-up),
  కోఆర్డినేటర్ / कोऑर्डिनेटर (coordinator, as elsewhere in the app). Checked for mixed Telugu-Devanagari words on 2 Oct 2026.
- **Round 7 keys for the review (3 Oct 2026):** `syllabusEditor.*` (G4), `materials.*` (G5),
  `visitHistory.*` (S9), `months.*` (month names), `myProfile.*` (A3),
  `progress.levelLessons`, `progress.retired` and `syllabus.errors.retired`. Words to check:
  "retire" (విరమించు / हटाना, against "delete" = తొలగించు / मिटाना), "lesson" (పాఠం / पाठ),
  "syllabus item" (అంశం / विषय), and "Share", "Copy link" kept in English as YouTube shows them.
- **Round 8 keys for the review (3 Oct 2026):** `admin.*` ("Running the class" on G1),
  `coordinators.*` (G2), `database.*` (G3), `importStudents.*` and `importErrors.*` (the import),
  `settings.*` (G10), `auditLog.*` (G11), `weekMeaning.*` ("this week" as the last 7 days) and
  `mentorTask.line` (C10). Words to check: "coordinator" kept as కోఆర్డినేటర్ / कोऑर्डिनेटर, "mentee"
  (మెంటీ / मेंटी, from "mentor"), "switch off" a login (ఆపివేయండి / बंद करें), "import" (దిగుమతి /
  आयात), "audit log" (ఆడిట్ లాగ్ / ऑडिट लॉग, kept as the English term), "duty hours" (డ్యూటీ సమయాలు /
  ड्यूटी का समय), and the settings labels, which are long sentences.
- **Round 9 keys for the review (3 Oct 2026):** `inbox.*` (A2 Notifications), `reports.*` (C21 My
  reports, G8 Reports, the CSV column headings in `reports.csv.*`), `centres.*` (G9) and
  `admin.reportsLine`, `admin.centresLine`, `admin.myReportsLine`. Words to check: "notification"
  (నోటిఫికేషన్ / सूचना), "unread" (చదవనివి / बिना पढ़ी), "report" (నివేదిక / रिपोर्ट), "visits" as
  attendance (హాజరులు / हाज़िरी), "attendance area" (హాజరు ప్రాంతం / हाज़िरी क्षेत्र), "radius"
  (వ్యాసార్ధం / त्रिज्या: maybe too technical; "దూరం" / "दूरी" may read better), "switch off" a centre,
  and the long lines `reports.levelLine` and `reports.callsLine`. The CSV headings are in the
  language the person uses when they download it.
- **Phase 2 promotion approval** ([DECISIONS.md #53](DECISIONS.md)):
  every Telugu and Hindi line under `promotion.*` and `assessments.edit.*` is a draft for the
  review, and so are the notification lines in `promotion_push_line()` in
  `supabase/migrations/0017_promotion.sql`. Words to check first: సిఫారసు / नामांकन (nomination),
  స్థాయి పెంపు / स्तर-उन्नति (promotion, as for level-up), సిద్ధం · దాదాపు · ఇంకా కాదు /
  तैयार · लगभग · अभी नहीं (the three answers), అభిప్రాయం / राय (feedback), నియమాలు / शर्तें
  (criteria), సూచనలు / मार्गदर्शन (guidance). Coordinator and Guru as in the rest of the app
  (కోఆర్డినేటర్ / कोऑर्डिनेटर, గురువుగారు / गुरुजी). Checked for mixed Telugu-Devanagari words on 3 Oct 2026.
- **Phase 2 practice tools** ([DECISIONS.md #54](DECISIONS.md)): every
  Telugu and Hindi line under `practice.*`, `practiceLog.*` and `taals.*` (146 keys each) is a draft
  for the review. Bols are never translated: they come from the taal data, written in the usual
  romanised form (tā, dhin, te.re). Words to check first: the drum's parts written in the local
  script, బాయా · దాయాన్ · కినార్ · మైదాన్ · స్యాహీ / बाया · दायाँ · किनार · मैदान · स्याही (Hindi
  "दायाँ · दायाँ हाथ" reads twice as "right": maybe "दायाँ मुख"); the vibhag marks సమ్ · తాళి · ఖాళీ /
  सम · ताली · खाली; "beat" as బీట్ / मात्रा; "practice" అభ్యాసం / अभ्यास; "placeholder" తాత్కాలికం /
  अस्थायी; the strokes' fingers (`practice.touch.*`) and open / damped (మోగుతుంది · మూసిన / गूँजता
  · बंद). Checked for mixed Telugu-Devanagari words on 3 Oct 2026.
- **Phase 2 merge (3 Oct 2026, [DECISIONS.md #55](DECISIONS.md)):** the locale files were merged key by key (1593 keys in each
  of en/te/hi, no key changed on both sides). `settings.promotionTitle` and `settings.promotionHint` (G10)
  were reworded, since promotion is now used; their Telugu and Hindi are drafts.
- **Phase 2 media** (branch `phase2-media`, [DECISIONS.md #56](DECISIONS.md)): every Telugu and Hindi
  line under `lessonPlayer.*`, `recording.*` and `recordMyself.*` (including `recordMyself.sendToAssessment` … `attached`), the new `materials.kinds.video`,
  `materials.kinds.videoPanes`, `materials.errors.videoLinkInvalid`, `materials.errors.panesInvalid`,
  `materials.videoLinkLabel`, `materials.videoLinkHint`, `materials.panesLabel`, `materials.panesHint`,
  and the changed `assessments.submit.hint`, `assessments.review.commentHint`,
  `assessments.errors.comment_required` are drafts for the review. Words to check first: "mirror"
  అద్దంలా / दर्पण जैसा, "as filmed" తీసినట్లే / जैसा फ़िल्माया, "camera angle" కెమెరా కోణం / कैमरा
  कोण, "A-B loop" kept as is, "voice note" వాయిస్ నోట్ / वॉइस नोट, "record myself" నన్ను నేను రికార్డ్
  చేసుకోవడం / ख़ुद को रिकॉर्ड करें. `recording.fileName` and `recording.voiceNoteName` are the names of
  the uploaded files and stay in English. Checked for mixed Telugu-Devanagari words on 3 Oct 2026.
- **Phase 2 Ishtagoshti** (branch `phase2-ishtagoshti`, [DECISIONS.md #57](DECISIONS.md)): every Telugu
  and Hindi line under `ishtagoshti.*` (about 140 keys), `tabs.ishtagoshti`, `settings.translator*`,
  `settings.fields.ig_translator`, `coordinators.igEditor*` and `auditLog.tables.ig_*` is a draft for the
  review. Words to check first: the tab "Slokas" శ్లోకాలు / श्लोक; ఇష్టగోష్ఠి / इष्टगोष्ठी; "purport"
  భావార్థం / तात्पर्य; "word meanings" పదార్థాలు / शब्दार्थ; "transliteration" లిప్యంతరీకరణ /
  लिप्यंतरण; "theme" అంశం / विषय (the same words as "syllabus item": maybe ఇతివృత్తం / प्रसंग);
  "memorised" కంఠస్థం / कंठस्थ; "recitation" పఠనం / पाठ (पाठ is also "lesson"); "draft" చిత్తు ప్రతి /
  मसौदा; "editor" ఎడిటర్ / संपादक; "sloka of the day" ఈ రోజు శ్లోకం / आज का श्लोक. The slokas
  themselves (verse, translation, purport) are content typed by the team in each language, not
  interface text. Checked for mixed Telugu-Devanagari words on 3 Oct 2026.
- **Phase 2 events and polls** (branch `phase2-events`, [DECISIONS.md #61](DECISIONS.md)): every Telugu
  and Hindi line under `events.*` and `polls.*` (226 keys) is a draft for the review, and so are the
  notice lines written in the database (`event_push_line` in `0022_events_polls.sql`: new event, time
  or place changed, cancelled, reminder, "please tell us", your part, new poll, poll reminder). Words to
  check first: "event" కార్యక్రమం / कार्यक्रम; "poll" ఓటింగ్ / मतदान (also used for the ring label
  "Events & polls" కార్యక్రమాలు, ఓటింగ్ / कार्यक्रम, मतदान); "anonymous" అజ్ఞాతం / गुमनाम; the answers
  "Going / Maybe / Not going" వస్తాను / బహుశా / రాలేను and आएँगे / शायद / नहीं आएँगे (also used as count
  labels); "performer" వాయించేవారు / बजाने वाले and "part" పాత్ర / भूमिका; the parts మృదంగం,
  కరతాళాలు, ప్రధాన గాయకులు, హార్మోనియం / मृदंग, करताल, मुख्य गायक, हारमोनियम; "who came" ఎవరు వచ్చారు /
  कौन आया. Event titles, places, reasons and poll questions and answers are typed by staff and shown
  as typed. Checked for mixed Telugu-Devanagari words on 5 Oct 2026.
- **Phase 2 team tools** (branch `phase2-team-tools`, [DECISIONS.md #65](DECISIONS.md)): every Telugu and Hindi
  line under `suggestions.*` (C18), `inventory.*` (C19) and `duty.*` (C20) is a draft for the review, and
  the notice lines in `team_push_line` (migration 0023). Words to check first: "suggestion" సూచన / सुझाव,
  "decline" తిరస్కరించండి / मना करें, "lend" ఇవ్వండి / दें and "take back" వెనక్కి తీసుకోండి / वापस लें,
  the conditions (బాగుంది, శ్రద్ధ కావాలి, పాడైంది, మరమ్మతులో / ठीक, देखभाल चाहिए, ख़राब, मरम्मत में),
  "retire" an item (విరమించండి / हटाएँ: may read oddly), "shift" (షిఫ్ట్ / पाली), "duty roster"
  (డ్యూటీ పట్టిక / ड्यूटी रोस्टर), the kinds "Clay khol", "fibreglass", "skin heads", and the short
  weekdays in `duty.weekdays.*`. Checked for mixed Telugu-Devanagari words on 3 Oct 2026.
- **Phase 2 class fund** (branch `phase2-fund`, [DECISIONS.md #80](DECISIONS.md)): every Telugu and Hindi line
  under `fund.*`, `coordinators.treasurer*`, `settings.fund*` is a draft for the review, and the notice lines in
  `fund_push_line` (migration 0026). Words to check first: "class fund" తరగతి నిధి / कक्षा कोष, "treasurer"
  కోశాధికారి / कोषाध्यक्ष, "balance" నిల్వ / शेष राशि, "income" ఆదాయం / आय, "expense" ఖర్చు / खर्च,
  "approve" ఆమోదించండి / स्वीकृत करें, "reversal" రద్దు నమోదు / उलट प्रविष्टि, "bill" బిల్లు / बिल,
  "financial year" ఆర్థిక సంవత్సరం / वित्त वर्ष, the categories (విరాళం, ప్రాయోజకత్వం … / दान, प्रायोजन …).
  Amounts are shown as ₹ with Indian grouping in every language.

- **Security round** (0025, [DECISIONS.md #72-#77](DECISIONS.md)): three new keys, drafts for the review:
  `common.studentWithdrawn` (shown when a coordinator marks or calls a student whose consent was
  withdrawn), `auditLog.tables.consents` and `auditLog.tables.guardians` (G11 filter). Words to check:
  "withdrawn" వెనక్కి తీసుకోబడింది / वापस ले ली गई, "consent" అనుమతి / सहमति (as in the registration form). The
  signed-form tick `register.writtenConsent` keeps its wording (Praveen, 5 Oct 2026). Checked for mixed
  Telugu-Devanagari words on 5 Oct 2026.
- **Security round 2** (0028, [DECISIONS.md #97](DECISIONS.md)): two new keys, drafts for the review:
  `myProfile.errors.nameInvalid` (a name with a hidden or control character) and
  `myProfile.errors.nameTaken` (the name of the Guru or a coordinator); `myProfile.errors.phoneInvalid`
  now says 7 to 15 digits. Words to check: "coordinator" సమన్వయకర్త / समन्वयक, "Guru" గురువు గారు /
  गुरुजी, "surname" ఇంటి పేరు / उपनाम. Checked for mixed Telugu-Devanagari words on 6 Oct 2026.
- **Phase 2 Ishtagoshti public sign-up** (branch `phase2-ishtagoshti-public`, [DECISIONS.md #88](DECISIONS.md)):
  every Telugu and Hindi line under `ishtagoshtiJoin.*` (I14, with its `errors.*`), `subscriberAccount.*`,
  `igSubscribers.*` (I15), `pending.ig*`, `tabs.account` and the longer `signUp.subtitle` is a draft for the
  review. **The notice and consent texts are PLACEHOLDERS** in all three languages (`ishtagoshtiJoin.termsBody`,
  `ishtagoshtiJoin.parentTerms`, starting "TEST —"), and so is the English email to the parent in
  `ig_send_parent_code` (migration 0027): the team's wording replaces them, and `IG_TERMS_VERSION`
  changes with it. Words to check first: "subscriber / member" సభ్యులు / सदस्य; "block" నిలిపివేయండి /
  रोकें and "unblock" తిరిగి అనుమతించండి / फिर से अनुमति दें; "parent" తల్లిదండ్రులు / माता-पिता; "code"
  కోడ్ / कोड; "facilitator" ఫెసిలిటేటర్ / फ़ैसिलिटेटर; the Hindi "रहा/रही" and "रहूँगा/रहूँगी" (gendered
  first person: maybe a neutral wording). Checked for mixed Telugu-Devanagari words on 5 Oct 2026.
- **Round 10** ([DECISIONS.md #105, #106, #111](DECISIONS.md)): two new keys and two rewritten ones, drafts for the
  review: `common.fixFieldsAbove` (beside a submit button when fields need a fix), `attendance.loadFailedBody`
  (today's list did not load; scanning and name check-in still work), `pending.studentHint` (now "ask the Guru")
  and `callLog.confirmLeftBody` (what Left keeps: login, messages, notifications). Words to check: "fields"
  వివరాలు / जानकारी, "link" జత చేయు / जोड़ना, "switches the login off" లాగిన్‌ను ఆపే / लॉगिन बंद. Checked for mixed
  Telugu-Devanagari words on 6 Oct 2026.
- Telugu and Devanagari letters are taller than Latin ones. The app's line heights allow for this;
  if a translated label looks cut off, report it with a screenshot.
