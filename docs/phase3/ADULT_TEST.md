# Phase 3 — Face scan class test with consenting adults (DRAFT, 22-10-2026)

The first real use of face scan: **adults only (18 and over), volunteers, on the separate test app "Mridanga Seva
TEST" and the TEST server**, never the class's app or LIVE data. Agreed 22-10-2026 (lead chat 12 with Praveen); rules in
[DECISIONS.md #433](../DECISIONS.md). No lawyer: the DPDP Act 2023 and the DPDP Rules 2025 are followed strictly, as
for the under-18 sign-up (#399). Branch `face-scan`; the app: OPERATIONS.md "Face scan: the test app"; the deletion
afterwards: OPERATIONS.md "Face scan: deleting the test face data".

Contents: 1. Consent for adult testers (en, te, hi) · 2. Test plan · 3. Before any minor uses face scan.

## 1. Consent for adult testers

One paper form per tester, **separate** from every other consent of the class, nothing pre-ticked, read and signed at
the desk before enrolment. The desk records it in the app (C25 "Face scan at the desk": the adult's own written
consent) and keeps the paper. English is the master; **Telugu and Hindi are machine-assisted drafts: NATIVE REVIEW
NEEDED before use.** `[ … ]` = filled in before printing (the same [[TEAM]] facts as the privacy notice: the
controller's name, postal address and privacy contact).

### English (master)

**Face scan test — consent of an adult volunteer**

[Class name, postal address] ("the class") is testing a face check-in for its app, before deciding whether to offer it
to students. We ask adult volunteers to try it. **Taking part is your free choice.** Saying no, or stopping later,
changes nothing for you in the class: you keep checking in with your QR code or at the desk.

**What the test does.** You install a separate test app, "Mridanga Seva TEST", next to the class's app. At the desk the
test app takes a few pictures of your face and turns them into a **face code** (a list of numbers). The pictures are
not kept. During the test you check in and out with the test app: it reads your face, compares it **only with your own
face code** (it never searches among other people), reads the phone's location **once**, at that moment, and asks
Google Play to confirm the phone and the app are genuine.

**What is kept, and where.**
- Your **face code**: only on your phone, locked by Android (Keystore). It never leaves the phone.
- On the class's **test server** (Supabase, in **Singapore**, outside India): a record that you enrolled (which phone,
  which model, who confirmed it, when); for each test check-in or check-out its time, whether it was inside the class
  area and how far, whether the live-face check passed, and the match score; counts of failed tries (no names).
- **Google Play** receives a check request from the phone (about the phone and the app; no face, no location).
- No photos, no video, no location trail. Nothing of this is in the class's real app or real records.

**Why.** Only to find out whether face check-in works reliably and fairly at our class (wrong person accepted, right
person refused, photo tricks, speed), so the class can decide whether to offer it.

**How long.** The test runs from [date] to [date]. Within **7 days** after it ends, all face data is deleted: you turn
face scan off and uninstall the test app at the desk, and the test server's face records are deleted. You will be told
when it is done.

**Your rights.** You can stop at any time: "Turn face scan off" in the test app, or tell the desk; your face data is
then deleted. You can ask what is kept about you, ask for a correction or deletion, and name someone to act for you.
Questions or complaints: [privacy contact]. If we do not resolve your complaint, you may complain to the Data
Protection Board of India.

☐ I am **18 or older** and I **agree** to take part in the face scan test as described above. I know I can stop at
any time and keep checking in with my QR code.

Name: ________ Tester code (filled by the desk): T__ Signature: ________ Date: ________
Desk: consent recorded in the app by ________ on ________.

### తెలుగు — DRAFT, NATIVE REVIEW NEEDED

**ముఖ స్కాన్ పరీక్ష — వయోజన స్వచ్ఛంద పాల్గొనేవారి అంగీకారం**

[తరగతి పేరు, చిరునామా] ("తరగతి") తన యాప్ కోసం ముఖంతో హాజరు వేయడాన్ని, విద్యార్థులకు ఇవ్వాలా వద్దా అని
నిర్ణయించే ముందు, పరీక్షిస్తోంది. దీన్ని ప్రయత్నించమని వయోజన స్వచ్ఛంద సేవకులను కోరుతున్నాం. **పాల్గొనడం పూర్తిగా మీ
ఇష్టం.** వద్దు అన్నా, తర్వాత ఆపేసినా తరగతిలో మీకు ఏమీ మారదు: మీ QR కోడ్‌తో లేదా డెస్క్ వద్ద హాజరు వేస్తూనే ఉంటారు.

**పరీక్షలో ఏమి జరుగుతుంది.** తరగతి యాప్‌తో పాటు "Mridanga Seva TEST" అనే వేరే పరీక్ష యాప్‌ను వేసుకుంటారు. డెస్క్ వద్ద
పరీక్ష యాప్ మీ ముఖపు కొన్ని చిత్రాలు తీసి వాటిని **ముఖ కోడ్**‌గా (సంఖ్యల జాబితా) మారుస్తుంది. చిత్రాలు ఉంచబడవు.
పరీక్ష సమయంలో పరీక్ష యాప్‌తో హాజరు వేసి, వెళ్లేటప్పుడు నమోదు చేస్తారు: అది మీ ముఖాన్ని **మీ సొంత ముఖ కోడ్‌తో మాత్రమే**
పోలుస్తుంది (ఇతరుల మధ్య ఎప్పుడూ వెతకదు), ఆ క్షణంలో ఫోన్ స్థానాన్ని **ఒక్కసారి** చూస్తుంది, ఫోన్, యాప్ అసలైనవని
Google Play ద్వారా నిర్ధారిస్తుంది.

**ఏమి, ఎక్కడ ఉంచబడుతుంది.**
- మీ **ముఖ కోడ్**: మీ ఫోన్‌లో మాత్రమే, Android తాళంలో (Keystore). అది ఫోన్ దాటి వెళ్లదు.
- తరగతి **పరీక్ష సర్వర్**‌లో (Supabase, **సింగపూర్**‌లో, భారతదేశం బయట): మీరు నమోదు చేసుకున్న వివరం (ఏ ఫోన్, ఏ
  మోడల్, ఎవరు నిర్ధారించారు, ఎప్పుడు); ప్రతి పరీక్ష హాజరుకు సమయం, తరగతి ప్రాంతం లోపలా బయటా, ఎంత దూరం, ప్రత్యక్ష ముఖ
  తనిఖీ నెగ్గిందా, పోలిక స్కోరు; విఫల ప్రయత్నాల లెక్కలు (పేర్లు లేకుండా).
- **Google Play**‌కు ఫోన్ నుండి ఒక తనిఖీ అభ్యర్థన వెళ్తుంది (ఫోన్, యాప్ గురించి; ముఖం, స్థానం కాదు).
- ఫోటోలు, వీడియో, స్థాన చరిత్ర ఏవీ ఉండవు. ఇవేవీ తరగతి అసలు యాప్‌లో గానీ అసలు రికార్డుల్లో గానీ ఉండవు.

**ఎందుకు.** మా తరగతిలో ముఖ హాజరు నమ్మకంగా, న్యాయంగా పనిచేస్తుందో లేదో (తప్పు వ్యక్తిని అంగీకరించడం, సరైన వ్యక్తిని
తిరస్కరించడం, ఫోటో మోసాలు, వేగం) తెలుసుకోవడానికి మాత్రమే.

**ఎంత కాలం.** పరీక్ష [తేదీ] నుండి [తేదీ] వరకు. ముగిసిన **7 రోజుల్లో** ముఖ డేటా అంతా తొలగించబడుతుంది: డెస్క్ వద్ద
ముఖ స్కాన్ ఆపి పరీక్ష యాప్ తీసేస్తారు, పరీక్ష సర్వర్‌లోని ముఖ రికార్డులు తొలగించబడతాయి. పూర్తయినప్పుడు మీకు చెబుతాం.

**మీ హక్కులు.** ఎప్పుడైనా ఆపవచ్చు: పరీక్ష యాప్‌లో "ఫేస్ స్కాన్ ఆఫ్ చేయండి" (యాప్‌లోని బటన్), లేదా డెస్క్‌కు చెప్పండి; అప్పుడు మీ ముఖ డేటా
తొలగించబడుతుంది. మీ గురించి ఏమి ఉంచారో అడగవచ్చు, సవరణ లేదా తొలగింపు కోరవచ్చు, మీ తరఫున ఒకరిని నియమించవచ్చు.
ప్రశ్నలు, ఫిర్యాదులు: [గోప్యతా సంప్రదింపు]. మేము పరిష్కరించకపోతే Data Protection Board of India‌కు ఫిర్యాదు చేయవచ్చు.

☐ నాకు **18 ఏళ్లు లేదా ఎక్కువ**, పైన వివరించిన ముఖ స్కాన్ పరీక్షలో పాల్గొనడానికి నేను **అంగీకరిస్తున్నాను**. ఎప్పుడైనా
ఆపి నా QR కోడ్‌తో హాజరు వేయవచ్చని నాకు తెలుసు.

పేరు: ________ పరీక్ష కోడ్ (డెస్క్ నింపుతుంది): T__ సంతకం: ________ తేదీ: ________

### हिन्दी — DRAFT, NATIVE REVIEW NEEDED

**चेहरा स्कैन परीक्षण — वयस्क स्वयंसेवक की सहमति**

[कक्षा का नाम, डाक पता] ("कक्षा") अपने ऐप के लिए चेहरे से हाज़िरी का परीक्षण कर रही है, यह तय करने से पहले कि इसे
विद्यार्थियों को दिया जाए या नहीं। हम वयस्क स्वयंसेवकों से इसे आज़माने का अनुरोध करते हैं। **भाग लेना पूरी तरह आपकी मर्ज़ी
है।** मना करने या बाद में रोकने से कक्षा में आपके लिए कुछ नहीं बदलता: आप QR कोड से या डेस्क पर हाज़िरी लगाते रहेंगे।

**परीक्षण में क्या होता है।** आप कक्षा के ऐप के साथ एक अलग परीक्षण ऐप "Mridanga Seva TEST" इंस्टॉल करते हैं। डेस्क पर
परीक्षण ऐप आपके चेहरे की कुछ तस्वीरें लेकर उन्हें एक **चेहरा कोड** (संख्याओं की सूची) में बदलता है। तस्वीरें रखी नहीं
जातीं। परीक्षण के दौरान आप परीक्षण ऐप से आने-जाने की हाज़िरी लगाते हैं: वह आपके चेहरे की तुलना **केवल आपके अपने चेहरा
कोड** से करता है (दूसरों में कभी नहीं खोजता), उसी पल फ़ोन का स्थान **एक बार** देखता है, और Google Play से पुष्टि करता है
कि फ़ोन और ऐप असली हैं।

**क्या रखा जाता है, और कहाँ।**
- आपका **चेहरा कोड**: केवल आपके फ़ोन में, Android के ताले (Keystore) में। वह फ़ोन से बाहर नहीं जाता।
- कक्षा के **परीक्षण सर्वर** पर (Supabase, **सिंगापुर** में, भारत के बाहर): आपके नामांकन का रिकॉर्ड (कौन-सा फ़ोन, कौन-सा
  मॉडल, किसने पुष्टि की, कब); हर परीक्षण हाज़िरी का समय, कक्षा क्षेत्र के अंदर या बाहर और कितनी दूर, जीवित-चेहरा जाँच
  सफल हुई या नहीं, और मिलान स्कोर; असफल प्रयासों की गिनती (बिना नाम)।
- **Google Play** को फ़ोन से एक जाँच अनुरोध जाता है (फ़ोन और ऐप के बारे में; चेहरा या स्थान नहीं)।
- कोई फ़ोटो, वीडियो या स्थान का इतिहास नहीं। इनमें से कुछ भी कक्षा के असली ऐप या असली रिकॉर्ड में नहीं है।

**क्यों।** केवल यह जानने के लिए कि हमारी कक्षा में चेहरे से हाज़िरी भरोसेमंद और निष्पक्ष रूप से काम करती है या नहीं (गलत
व्यक्ति स्वीकार, सही व्यक्ति अस्वीकार, फ़ोटो से धोखा, गति)।

**कितने समय।** परीक्षण [तारीख] से [तारीख] तक है। समाप्ति के **7 दिनों** के भीतर सारा चेहरा डेटा मिटाया जाता है: डेस्क
पर आप चेहरा स्कैन बंद करके परीक्षण ऐप हटा देते हैं, और परीक्षण सर्वर के चेहरा रिकॉर्ड मिटा दिए जाते हैं। पूरा होने पर
आपको बताया जाएगा।

**आपके अधिकार।** आप कभी भी रोक सकते हैं: परीक्षण ऐप में "फ़ेस स्कैन बंद करें" (ऐप का बटन), या डेस्क को बताएँ; तब आपका चेहरा
डेटा मिटा दिया जाता है। आप पूछ सकते हैं कि आपके बारे में क्या रखा है, सुधार या मिटाने को कह सकते हैं, और अपनी ओर से किसी
को नामित कर सकते हैं। प्रश्न या शिकायत: [गोपनीयता संपर्क]। यदि हम आपकी शिकायत हल न करें, तो आप Data Protection Board
of India में शिकायत कर सकते हैं।

☐ मेरी आयु **18 वर्ष या अधिक** है और मैं ऊपर बताए अनुसार चेहरा स्कैन परीक्षण में भाग लेने के लिए **सहमत** हूँ। मुझे
पता है कि मैं कभी भी रोक सकता/सकती हूँ और अपने QR कोड से हाज़िरी लगाता/लगाती रह सकता/सकती हूँ।

नाम: ________ परीक्षण कोड (डेस्क भरेगा): T__ हस्ताक्षर: ________ तारीख: ________

## 2. Test plan

**Who.** 4-10 adult volunteers (18+), each with their **own Android phone**. Asked by a notice or the Guru to the whole
group, never one by one by their own coordinator, so nobody feels pressed; a "no" is never recorded anywhere. No minors,
not even with a parent's yes (section 3). Each tester gets a **TEST student login** (made by the lead on TEST; not
their LIVE account) and a tester code T1…Tn; results use the codes, never names. Two **TEST coordinator logins** (two
people) confirm the desk codes: nobody confirms their own enrolment (0070 refuses it).

**Ready before the first session** (the lead ticks each in NOTES_face_scan.md):
1. TEST has 0070 + 0071 with both verify rows as expected (OPERATIONS "Face scan: integrity check" step 2, "Face
   self-scan" step 2); `face_min_age` 18 (the default); the TEST centre has its point, radius and open hours (G9).
2. Google Cloud project, service account secret, `verify-integrity` deployed on TEST, `PLAY_INTEGRITY_PACKAGE =
   org.mridangaseva.app.test` and the test key's SHA-256 (OPERATIONS "Face scan: integrity check" 1-3, "Face scan: the
   test app" After the build 1); the project number in `face-settings.ts` **before** the build.
3. The facetest APK built by Praveen (one of the month's free builds), its SHA-256 noted; the link only to the testers.
4. Signed consent forms (section 1) for every tester, recorded in C25.

**Each session.** `face_enabled` true on TEST at the start and false at the end (SQL editor, OPERATIONS "Switching face
scan on or off"); LIVE never.

**Enrolment at the desk (once per tester).** Consent read and signed → coordinator A records it in C25 → the tester
opens Face scan (S15) in the TEST app → blink / turn, 5 pictures → a 6-digit code on the tester's phone → coordinator A
types it on C25 on **their own** phone → "Face scan is on". Coordinator B enrols coordinator A if A also tests (with
their TEST student login).

**What is checked** (each row: tester code, phone model, Android version, result, time):

| # | Check | Expected |
|---|---|---|
| 1 | Enrolment as above | On; C25 shows the enrolment; the phone keeps the code |
| 2 | Enrolment without a recorded consent | Refused before the camera |
| 3 | Check in at the class, inside the area, open hours | Saved, method face; Who is here now shows the tester |
| 4 | Check out within 10 minutes | "Less than 10 minutes" (desk path) |
| 5 | Check out after 10 minutes, ≥ 150 m outside | Saved and flagged "away from the class" |
| 6 | Check in from outside the area / location off / fake-GPS app / outside open hours / airplane mode | Refused, each with "Or ask a coordinator" |
| 7 | Another tester's face on an enrolled phone (each tester tries 2 others, 3 tries each) | **Never accepted** |
| 8 | A printed photo of the tester; a video of the tester on another phone | Refused (live-face check) |
| 9 | The tester themself, normal light, glasses on/off | Accepted; count the tries needed (false refusals) |
| 10 | Dim light, strong backlight | Note result and tries; refusal is acceptable, a wrong accept is not |
| 11 | Turn face scan off in the app | Server enrolment ended, code wiped; the home circle is gone |
| 12 | Throughout | QR check-in still works; the class's own app on the same phone is untouched and still signed in |
| 13 | Staff: Reports → Face scan use (C27) | Counts by reason, no names |
| 14 | Timings | Location read, scan, integrity, save (seconds) into SPIKE_RESULT §9 |

**Stop at once** (face_enabled false on TEST, tell the lead): any check 7 or 8 accepted; any face data showing up on
LIVE or in the class's app; a tester asks to stop (then their own data first: turn off at the desk).

**Pass for this round:** checks 7 and 8 never accepted; check 9 accepted within 3 tries for most testers (the number
goes to the Guru, with the threshold `face_match_percent` used); no LIVE effect. The results (counts only) go to
NOTES_face_scan.md and SPIKE_RESULT §9; then the deletion runbook, within 7 days of the last session, with its verify
row pasted.

## 3. Before any minor uses face scan

Nothing here starts before every item is done and written down; the Guru signs off (no lawyer, #399: the Rules are
followed strictly).
1. **The adult test passed** (section 2) and its data is deleted (verify row pasted).
2. **Minimum age decided by the Guru** (DECISIONS_FOR_GURU item 3; recommended **13**); then `face_min_age` is set to
   it in the SQL editor. Younger children use QR only.
3. **Written, verifiable parent consent** (DPDP Act s.9(1); DPDP Rules 2025 rule 10): the F-P form (CONSENT_DRAFT.md),
   signed by the parent or guardian at the desk, who is checked to be an identifiable adult (an ID seen, its kind noted,
   never its number: as 0051 does for the home sign-up). The **child's own yes** is asked (line C) and recorded
   (`child_assent`); a child's no stops it even if the parent signed.
4. **No tracking or behavioural monitoring of children** (s.9(3)): the DPIA's argument that one location read at the
   check-in or check-out tap is not tracking is final and signed off by the Guru; nothing in the app reads location at
   any other time.
5. **Papers final:** DPIA v-next (Sydney for LIVE, Singapore for TEST, Google Play Integrity as a processor), the
   privacy notice's face section published on the website in en/te/hi, and the te/hi native review of F-P, C, L-P and W
   done.
6. **The production path:** minors use face scan only in the class's own app, after face is merged into main and a new
   production APK is out (DECISIONS #432), on LIVE with 0070/0071 run there, the LIVE service account and certificate
   set, and `face_enabled` true on LIVE only on Praveen's word. Minors never use the TEST app.
7. **Coordinators who are also students** (staff-own-record on main): the one-line `own_record` exception for the
   self-scan path and the Me entry to Face scan, so a coordinator's own face check-in works.
8. Re-enrolment of minors every 12 months (`face_expiry_months_minor`), and the parent's check-out email (0043/0044)
   tested with a face check-out on TEST.
