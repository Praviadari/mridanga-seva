# Phase 3 — Consent wording drafts (DRAFT v2, 10-10-2026)

> **Drafts for the team and a lawyer — not final, not legal advice.** English is the master text.
> **Telugu and Hindi are machine-assisted drafts: NATIVE REVIEW NEEDED** before any use (meaning,
> tone, and the words for "face code", "consent", "withdraw", "location"). `[ … ]` = to fill in.
> Each consent is **separate**: never on the same tick as the class data consent (#16) or the photo
> consent. Nothing is pre-ticked. Saying no changes nothing about the class (#213).

**v2 (P3-8, DECISIONS #253-#255)** rewrites v1 for the decided design (#248): face scan happens **only
on the student's own phone**, matching the face only with that student's own face code (1:1). No
class tablet, no class devices hold face codes. The first set-up is at the desk with a coordinator.
Parent emails: **check-out only** (#231 answers, 0044). Background: [DPIA_DRAFT.md](DPIA_DRAFT.md),
lawyer summary [LAWYER_PACK.md](LAWYER_PACK.md), notice text [PRIVACY_NOTICE_DRAFT.md](PRIVACY_NOTICE_DRAFT.md).

Texts:
- **F-P** Face scan — parent/guardian of a student under 18
- **F-A** Face scan — adult student (18+)
- **C** a short line for the child (under 18), read out by the coordinator
- **L-P / L-A** Location at check-in and check-out — parent / adult student
- **E** Check-out email to the parent (the #230 line, now check-out only)
- **W** Stopping (withdrawal) — form and in-app text

Storage: each face agreement is a `consents` row (`scope = 'face'`, method `written`, notice version
#150). Location has no consent scope; it is told in the notice, on this form and in the phone's
permission prompt (DECISIONS_FOR_GURU item 9; lawyer question 4). The parent email is opt-out (#227):
told on the form, stopped by the Unsubscribe link or the desk.

---

## English (master)

### F-P — Face scan for attendance (parent or guardian)

**Face scan for attendance — optional** · Form version [v, date]

[Class name] can let your child check in and out of class **on their own phone** with a quick face
scan, instead of showing a QR code to a coordinator. This is **optional**. If you say no, your child
checks in with the QR code, the printed QR card or the coordinator, exactly as now, and nothing else
changes.

**What happens if you agree**
- **Set-up, once, at the class desk:** your child opens the app on their own phone, and the phone
  takes a few pictures of their face. The phone turns them into a **face code** (a list of numbers;
  this is biometric data) and **deletes the pictures at once**. No photo of your child's face is kept
  for this. A coordinator checks on the spot that it is your child.
- The face code is kept **encrypted on your child's phone**, and an encrypted copy on the class's
  server in India (so it can be restored if the app is reinstalled, and so we can prove it is deleted).
  Nobody can look at it.
- **At each check-in and check-out**, your child's phone compares the face in front of it **only with
  your child's own face code** — it never searches for anyone else. It also checks that it is a real,
  live face (for example, asking to blink) and that the phone has not been tampered with.
- It is **never** used for anything else, never sold, never shared, and never used to watch or
  analyse your child's behaviour.

**How long**
- Until you or your child say stop, or your child leaves the class (deleted 30 days after leaving),
  and in any case for at most **12 months**, after which we ask you again.

**Your child's own wish**
- If your child does not want the face scan, we will not use it, even with your signature.

**Stopping**
- You can stop at any time: tell the desk or [privacy contact]; your child can also tap "Turn off
  face scan" in the app. The face code is deleted at once from the server and from the phone. Your
  child keeps using the QR code.

**Questions or complaints:** [privacy contact] · Privacy notice: [link, version]. You may also
complain to the Data Protection Board of India.

☐ I am the parent / lawful guardian of [student name], and I **agree** to the face scan for
attendance as described above.

Parent/guardian name: ________ Relation: ________ Signature: ________ Date: ________
(Coordinator: ID type seen ________ — do not write the number. Child's answer to line C: yes / no.)

### F-A — Face scan for attendance (adult student)

Same text as F-P, with "you" / "your phone" in place of "your child" / "your child's phone", without
"Your child's own wish", and with the period **24 months**:

☐ I **agree** to the face scan for attendance as described above. I know I can stop at any time and
keep using my QR code.

Name: ________ Signature: ________ Date: ________

### C — Line for the child (read out by the coordinator)

"Your parent has said yes to the face scan. It only helps you check in and out on your phone. Do
**you** want to use it? If not, that is fine — you can keep using your QR code." → record the child's
answer (yes / no) on the form.

### L-P / L-A — Location at check-in and check-out

**Location when checking in and out**

When [your child / you] check[s] in or out **with the app**, the phone checks its location **once,
at that moment**, to confirm it is at the class. The app keeps only **"inside" or "outside" the
class area and the distance in metres** — never the location itself.

- The app **never follows** [your child's / your] location: not in the background, not while the
  app is open, not on the way to or from class. There is no live map, and the location is never in
  the parent email.
- If the phone is outside the class area, offline, or its location cannot be trusted, a self
  check-in is not allowed and a coordinator checks [your child / you] in instead (QR card or roll
  number). At check-out, an outside location is noted for the staff; leaving is never blocked.
- The phone asks for location permission "only while using the app". [You / Your child] can refuse;
  then check in with the coordinator.

☐ I understand and agree that the location is checked once at each check-in and check-out as
described.

### E — Check-out email to the parent

When the class's attendance emails are switched on, we will email you when your child's
**check-out** is recorded at the class (name, centre, time). These emails never contain your child's
location or photo. You can stop them at any time with the Unsubscribe link in the email or by telling
the class desk.

Parent's email: ________

### W — Stopping (withdrawal)

**Stop the face scan**

From now on the face scan will not be used for [name]. The face code is **deleted** today from the
server; on [name]'s phone it is deleted the next time the app opens with internet (until then the
server refuses any face check-in). [Name] keeps checking in with the QR code or the coordinator.
Nothing else changes. If you change your mind later, you can agree again; a new face code is set up
at the desk.

In-app (student, Face scan screen): **Face scan: On** → "Turn off face scan? Your face code will be
deleted now from this phone and from the server. You will check in with your QR code." [Turn off]
[Keep]

---

## తెలుగు (Telugu) — DRAFT, NATIVE REVIEW NEEDED

### F-P — హాజరు కోసం ముఖ స్కాన్ (తల్లిదండ్రులు లేదా సంరక్షకులు)

**హాజరు కోసం ముఖ స్కాన్ — ఐచ్ఛికం (మీ ఇష్టం)** · ఫారం వెర్షన్ [v, తేదీ]

[క్లాస్ పేరు] మీ పిల్లలు సమన్వయకర్తకు QR కోడ్ చూపించడానికి బదులుగా, **వారి సొంత ఫోన్‌లో** త్వరిత ముఖ
స్కాన్‌తో క్లాస్‌కు వచ్చినట్లు, వెళ్లినట్లు నమోదు చేసుకునే వీలు కల్పించగలదు. ఇది **ఐచ్ఛికం**. మీరు
వద్దంటే, మీ పిల్లలు ఇప్పటిలాగే QR కోడ్, ముద్రించిన QR కార్డ్ లేదా సమన్వయకర్త ద్వారా హాజరు వేస్తారు;
ఇంకేమీ మారదు.

**మీరు అంగీకరిస్తే ఏమి జరుగుతుంది**
- **ఒక్కసారి, క్లాస్ డెస్క్ వద్ద ఏర్పాటు:** మీ పిల్లలు తమ సొంత ఫోన్‌లో యాప్ తెరుస్తారు; ఫోన్ వారి
  ముఖం యొక్క కొన్ని చిత్రాలు తీస్తుంది. ఫోన్ వాటిని ఒక **ముఖ కోడ్**‌గా (అంకెల జాబితా; ఇది బయోమెట్రిక్
  డేటా) మార్చి, **చిత్రాలను వెంటనే తొలగిస్తుంది**. దీని కోసం మీ పిల్లల ముఖ చిత్రం ఏదీ ఉంచబడదు. అది
  మీ పిల్లలేనని సమన్వయకర్త అక్కడే నిర్ధారిస్తారు.
- ముఖ కోడ్ **మీ పిల్లల ఫోన్‌లో ఎన్‌క్రిప్ట్ చేసి** ఉంచబడుతుంది; దాని ఎన్‌క్రిప్ట్ చేసిన ప్రతి భారతదేశంలోని
  క్లాస్ సర్వర్‌లో ఉంటుంది (యాప్ మళ్లీ ఇన్‌స్టాల్ చేస్తే తిరిగి పొందడానికి, తొలగించామని
  నిరూపించడానికి). దాన్ని ఎవరూ చూడలేరు.
- **ప్రతి హాజరు మరియు వెళ్లే సమయంలో**, మీ పిల్లల ఫోన్ ఎదుట ఉన్న ముఖాన్ని **మీ పిల్లల సొంత ముఖ కోడ్‌తో
  మాత్రమే** పోలుస్తుంది — వేరెవరినీ వెతకదు. అది నిజమైన, ప్రత్యక్ష ముఖమేనా (ఉదా. కళ్లు రెప్పవేయమని
  అడగడం), ఫోన్‌ను ఎవరూ మార్చలేదా అని కూడా చూస్తుంది.
- ఇది వేరే ఏ పనికీ **ఎప్పుడూ** వాడబడదు, అమ్మబడదు, ఎవరితోనూ పంచుకోబడదు, మీ పిల్లల ప్రవర్తనను
  గమనించడానికి లేదా విశ్లేషించడానికి వాడబడదు.

**ఎంత కాలం**
- మీరు లేదా మీ పిల్లలు ఆపమని చెప్పే వరకు, లేదా క్లాస్ వదిలే వరకు (వదిలిన 30 రోజుల తర్వాత
  తొలగిస్తాము), ఏ సందర్భంలోనైనా గరిష్టంగా **12 నెలలు**; ఆ తర్వాత మళ్లీ అడుగుతాము.

**మీ పిల్లల సొంత ఇష్టం**
- మీ పిల్లలకు ముఖ స్కాన్ ఇష్టం లేకపోతే, మీ సంతకం ఉన్నా మేము దాన్ని వాడము.

**ఆపడం**
- ఎప్పుడైనా ఆపవచ్చు: డెస్క్‌కు లేదా [గోప్యత సంప్రదింపు]కు చెప్పండి; మీ పిల్లలు యాప్‌లో "ముఖ స్కాన్
  ఆపండి" కూడా నొక్కవచ్చు. ముఖ కోడ్ సర్వర్ నుండి, ఫోన్ నుండి వెంటనే తొలగించబడుతుంది. మీ పిల్లలు QR
  కోడ్ వాడుతూనే ఉంటారు.

**ప్రశ్నలు లేదా ఫిర్యాదులు:** [గోప్యత సంప్రదింపు] · గోప్యతా ప్రకటన: [లింక్, వెర్షన్]. మీరు భారత
డేటా ప్రొటెక్షన్ బోర్డుకు కూడా ఫిర్యాదు చేయవచ్చు.

☐ నేను [విద్యార్థి పేరు] యొక్క తల్లి/తండ్రి / చట్టబద్ధ సంరక్షకుడిని, పైన వివరించిన విధంగా హాజరు కోసం
ముఖ స్కాన్‌కు **అంగీకరిస్తున్నాను**.

తల్లిదండ్రి/సంరక్షకుని పేరు: ________ సంబంధం: ________ సంతకం: ________ తేదీ: ________

### F-A — (వయోజన విద్యార్థి)
పై పాఠమే, "మీ పిల్లలు / మీ పిల్లల ఫోన్" బదులు "మీరు / మీ ఫోన్", "మీ పిల్లల సొంత ఇష్టం" భాగం లేకుండా,
కాలం **24 నెలలు**.
☐ పైన వివరించిన విధంగా హాజరు కోసం ముఖ స్కాన్‌కు నేను **అంగీకరిస్తున్నాను**. ఎప్పుడైనా ఆపి QR కోడ్
వాడవచ్చని నాకు తెలుసు.

### C — పిల్లలకు (సమన్వయకర్త చదివి వినిపిస్తారు)
"మీ అమ్మానాన్నలు ముఖ స్కాన్‌కు ఒప్పుకున్నారు. ఇది నీ ఫోన్‌లో హాజరు వేయడానికి, వెళ్లేటప్పుడు నమోదు
చేయడానికి మాత్రమే. **నీకు** వాడాలని ఉందా? లేకపోతే పర్వాలేదు — నువ్వు QR కోడ్ వాడుతూనే ఉండొచ్చు."

### L-P / L-A — హాజరు వేసేటప్పుడు, వెళ్లేటప్పుడు స్థానం
[మీ పిల్లలు / మీరు] **యాప్‌తో** హాజరు వేసినప్పుడు లేదా వెళ్లినప్పుడు, ఫోన్ క్లాస్ వద్ద ఉందని
నిర్ధారించడానికి **ఆ క్షణంలో ఒక్కసారి మాత్రమే** స్థానం చూస్తుంది. యాప్ **"క్లాస్ ప్రాంతం లోపల" లేదా
"బయట" మరియు మీటర్లలో దూరం** మాత్రమే ఉంచుతుంది — స్థానాన్ని ఎప్పుడూ కాదు.
- యాప్ [మీ పిల్లల / మీ] స్థానాన్ని **ఎప్పుడూ అనుసరించదు**: నేపథ్యంలో కాదు, యాప్ తెరిచి ఉన్నప్పుడు
  కాదు, క్లాస్‌కు వచ్చే, వెళ్లే దారిలో కాదు. లైవ్ మ్యాప్ లేదు; తల్లిదండ్రుల ఈమెయిల్‌లో స్థానం ఎప్పుడూ
  ఉండదు.
- ఫోన్ క్లాస్ ప్రాంతం బయట ఉన్నా, ఇంటర్నెట్ లేకపోయినా, లేదా స్థానాన్ని నమ్మలేకపోయినా, సొంతంగా హాజరు
  వేయడం కుదరదు; సమన్వయకర్త (QR కార్డ్ లేదా రోల్ నంబర్‌తో) హాజరు వేస్తారు. వెళ్లేటప్పుడు బయట ఉంటే
  సిబ్బందికి గుర్తుగా ఉంటుంది; వెళ్లడం ఎప్పుడూ ఆపబడదు.
- ఫోన్ "యాప్ వాడుతున్నప్పుడు మాత్రమే" స్థానం అనుమతి అడుగుతుంది. [మీరు / మీ పిల్లలు] నిరాకరించవచ్చు;
  అప్పుడు సమన్వయకర్త వద్ద హాజరు వేయండి.
☐ ప్రతి హాజరు మరియు వెళ్లే సమయంలో ఒక్కసారి స్థానం చూడబడుతుందని అర్థం చేసుకుని అంగీకరిస్తున్నాను.

### E — తల్లిదండ్రులకు వెళ్లిన సమయం ఈమెయిల్
క్లాస్ హాజరు ఈమెయిల్‌లు ప్రారంభించినప్పుడు, మీ పిల్లలు క్లాస్ నుండి **వెళ్లినట్లు నమోదు** అయినప్పుడు మీకు
ఈమెయిల్ పంపుతాము (పేరు, కేంద్రం, సమయం). ఈ ఈమెయిల్‌లలో మీ పిల్లల స్థానం లేదా ఫోటో ఎప్పుడూ ఉండవు.
ఈమెయిల్‌లోని Unsubscribe లింక్‌తో లేదా క్లాస్ డెస్క్‌కు చెప్పి ఎప్పుడైనా ఆపవచ్చు.
తల్లిదండ్రుల ఈమెయిల్: ________

### W — ఆపడం (ఉపసంహరణ)
ఇకపై [పేరు]కు ముఖ స్కాన్ వాడబడదు. ముఖ కోడ్ ఈ రోజే సర్వర్ నుండి **తొలగించబడుతుంది**; [పేరు] ఫోన్‌లో
యాప్ తదుపరి సారి ఇంటర్నెట్‌తో తెరిచినప్పుడు తొలగించబడుతుంది (అప్పటి వరకు సర్వర్ ఏ ముఖ హాజరునూ
అంగీకరించదు). [పేరు] QR కోడ్ లేదా సమన్వయకర్త ద్వారా హాజరు వేస్తూనే ఉంటారు. ఇంకేమీ మారదు. తర్వాత
మనసు మారితే మళ్లీ అంగీకరించవచ్చు; డెస్క్ వద్ద కొత్త ముఖ కోడ్ ఏర్పాటు చేస్తారు.
యాప్‌లో: "ముఖ స్కాన్ ఆపాలా? మీ ముఖ కోడ్ ఇప్పుడే ఈ ఫోన్ నుండి, సర్వర్ నుండి తొలగించబడుతుంది. మీరు
QR కోడ్‌తో హాజరు వేస్తారు." [ఆపండి] [ఉంచండి]

---

## हिन्दी (Hindi) — DRAFT, NATIVE REVIEW NEEDED

### F-P — हाज़िरी के लिए चेहरा स्कैन (माता-पिता या अभिभावक)

**हाज़िरी के लिए चेहरा स्कैन — वैकल्पिक (आपकी मर्ज़ी)** · फ़ॉर्म संस्करण [v, तारीख़]

[कक्षा का नाम] आपके बच्चे को समन्वयक को QR कोड दिखाने के बजाय **उसके अपने फ़ोन पर** एक छोटे चेहरा
स्कैन से कक्षा में आने और जाने की हाज़िरी लगाने दे सकता है। यह **वैकल्पिक** है। अगर आप मना करते हैं, तो
आपका बच्चा अभी की तरह QR कोड, छपे हुए QR कार्ड या समन्वयक से हाज़िरी लगाएगा, और कुछ नहीं बदलेगा।

**सहमति देने पर क्या होगा**
- **एक बार, कक्षा की डेस्क पर सेट-अप:** आपका बच्चा अपने फ़ोन पर ऐप खोलता है, और फ़ोन उसके चेहरे की कुछ
  तस्वीरें लेता है। फ़ोन उन्हें एक **चेहरा कोड** (अंकों की सूची; यह बायोमेट्रिक डेटा है) में बदलता है और
  **तस्वीरें तुरंत मिटा देता है**। इसके लिए आपके बच्चे के चेहरे की कोई तस्वीर नहीं रखी जाती। समन्वयक
  वहीं पुष्टि करते हैं कि यह आपका ही बच्चा है।
- चेहरा कोड **आपके बच्चे के फ़ोन पर एन्क्रिप्ट करके** रखा जाता है, और उसकी एन्क्रिप्ट की हुई प्रति भारत
  में कक्षा के सर्वर पर (ताकि ऐप दोबारा इंस्टॉल होने पर वापस मिल सके, और हम साबित कर सकें कि वह मिटा दिया
  गया)। इसे कोई देख नहीं सकता।
- **हर बार आने और जाने के समय**, आपके बच्चे का फ़ोन सामने के चेहरे की तुलना **केवल आपके बच्चे के अपने
  चेहरा कोड से** करता है — किसी और को नहीं खोजता। वह यह भी जाँचता है कि चेहरा असली और जीवित है (जैसे
  पलक झपकाने को कहना) और फ़ोन से छेड़छाड़ नहीं हुई है।
- इसका उपयोग किसी और काम के लिए **कभी नहीं** होगा — न बेचा जाएगा, न साझा किया जाएगा, न आपके
  बच्चे के व्यवहार पर नज़र रखने या उसका विश्लेषण करने के लिए।

**कितने समय तक**
- जब तक आप या आपका बच्चा मना न करें, या बच्चा कक्षा न छोड़ दे (छोड़ने के 30 दिन बाद मिटा दिया
  जाएगा), और हर हाल में अधिकतम **12 महीने**; उसके बाद हम फिर पूछेंगे।

**आपके बच्चे की अपनी इच्छा**
- अगर आपका बच्चा चेहरा स्कैन नहीं चाहता, तो आपके हस्ताक्षर होने पर भी हम इसका उपयोग नहीं करेंगे।

**रोकना**
- आप कभी भी रोक सकते हैं: डेस्क या [गोपनीयता संपर्क] को बताएँ; आपका बच्चा ऐप में "चेहरा स्कैन बंद
  करें" भी दबा सकता है। चेहरा कोड सर्वर और फ़ोन से तुरंत मिटा दिया जाएगा। आपका बच्चा QR कोड का
  उपयोग करता रहेगा।

**प्रश्न या शिकायत:** [गोपनीयता संपर्क] · गोपनीयता सूचना: [लिंक, संस्करण]। आप भारत के डेटा
संरक्षण बोर्ड (Data Protection Board of India) में भी शिकायत कर सकते हैं।

☐ मैं [विद्यार्थी का नाम] का/की माता-पिता / वैध अभिभावक हूँ, और ऊपर बताए अनुसार हाज़िरी के लिए चेहरा
स्कैन के लिए **सहमति देता/देती हूँ**।

माता-पिता/अभिभावक का नाम: ________ संबंध: ________ हस्ताक्षर: ________ तारीख़: ________

### F-A — (वयस्क विद्यार्थी)
ऊपर वाला पाठ, "आपका बच्चा / आपके बच्चे का फ़ोन" की जगह "आप / आपका फ़ोन", "आपके बच्चे की अपनी इच्छा"
वाला भाग हटाकर, अवधि **24 महीने**।
☐ मैं ऊपर बताए अनुसार हाज़िरी के लिए चेहरा स्कैन के लिए **सहमति देता/देती हूँ**। मुझे पता है कि मैं कभी
भी रोककर QR कोड का उपयोग कर सकता/सकती हूँ।

### C — बच्चे के लिए (समन्वयक पढ़कर सुनाएँ)
"तुम्हारे माता-पिता ने चेहरा स्कैन के लिए हाँ कहा है। यह सिर्फ़ तुम्हारे फ़ोन पर आने-जाने की हाज़िरी लगाने
में मदद करता है। क्या **तुम** इसे इस्तेमाल करना चाहते हो? अगर नहीं, तो कोई बात नहीं — तुम QR कोड
इस्तेमाल करते रह सकते हो।"

### L-P / L-A — आने और जाने के समय स्थान
जब [आपका बच्चा / आप] **ऐप से** हाज़िरी लगाते हैं या जाते हैं, तो फ़ोन यह पुष्टि करने के लिए कि वह
कक्षा में है, **उसी क्षण केवल एक बार** स्थान देखता है। ऐप केवल **"कक्षा क्षेत्र के अंदर" या "बाहर"
और मीटर में दूरी** रखता है — स्थान स्वयं कभी नहीं।
- ऐप [आपके बच्चे के / आपके] स्थान का **कभी पीछा नहीं करता**: न पृष्ठभूमि में, न ऐप खुला रहने पर,
  न कक्षा आते-जाते रास्ते में। कोई लाइव मैप नहीं है, और माता-पिता के ईमेल में स्थान कभी नहीं होता।
- अगर फ़ोन कक्षा क्षेत्र से बाहर है, इंटरनेट नहीं है, या स्थान पर भरोसा नहीं किया जा सकता, तो ख़ुद हाज़िरी
  नहीं लगेगी; समन्वयक (QR कार्ड या रोल नंबर से) हाज़िरी लगाएँगे। जाते समय बाहर होने पर स्टाफ़ के लिए
  नोट होता है; जाना कभी रोका नहीं जाता।
- फ़ोन "केवल ऐप उपयोग करते समय" स्थान की अनुमति माँगता है। [आप / आपका बच्चा] मना कर सकते हैं; तब
  समन्वयक से हाज़िरी लगवाएँ।
☐ मैं समझता/समझती हूँ और सहमत हूँ कि हर बार आने और जाने के समय एक बार स्थान देखा जाएगा।

### E — माता-पिता को जाने का ईमेल
जब कक्षा के हाज़िरी ईमेल चालू होंगे, तो आपके बच्चे के कक्षा से **जाने की हाज़िरी दर्ज** होने पर हम आपको
ईमेल भेजेंगे (नाम, केंद्र, समय)। इन ईमेल में आपके बच्चे का स्थान या फ़ोटो कभी नहीं होता। आप ईमेल के
Unsubscribe लिंक से या कक्षा की डेस्क को बताकर इन्हें कभी भी बंद कर सकते हैं।
माता-पिता का ईमेल: ________

### W — रोकना (सहमति वापस लेना)
अब से [नाम] के लिए चेहरा स्कैन का उपयोग नहीं होगा। चेहरा कोड आज ही सर्वर से **मिटा दिया जाएगा**;
[नाम] के फ़ोन से अगली बार इंटरनेट के साथ ऐप खुलने पर मिट जाएगा (तब तक सर्वर कोई चेहरा हाज़िरी नहीं
मानेगा)। [नाम] QR कोड या समन्वयक से हाज़िरी लगाते रहेंगे। और कुछ नहीं बदलेगा। बाद में मन बदले तो फिर
से सहमति दे सकते हैं; डेस्क पर नया चेहरा कोड बनेगा।
ऐप में: "चेहरा स्कैन बंद करें? आपका चेहरा कोड अभी इस फ़ोन और सर्वर से मिटा दिया जाएगा। आप QR कोड से
हाज़िरी लगाएँगे।" [बंद करें] [रहने दें]

---

## Notes for the reviewers

- "Face code" is used for parents, with "(biometric data)" once in F-P; the lawyer may prefer
  another word (DPIA §9 Q4).
- te/hi now use the website notice's words for coordinator (సమన్వయకర్త / समन्वयक) and location
  (స్థానం / स्थान) instead of v1's loanwords; native reviewers choose one set for both papers.
- Durations (12/24 months, 30 days after leaving) follow DPIA §7; change both together.
- Line C adopts the UK schools rule (PoFA 2012 s.26) as good practice; the lawyer should confirm it
  fits DPDP (the parent consents; the child can still refuse — we think yes).
- E is the #230 line made check-out only (#231 answers); keep it identical to the notice text.
- The F-P form needs a version number and date printed on it, matching the notice version stored on
  the consent (#150).
- v1 text about class tablets, class check-in devices and "within one day for devices that are
  offline" is gone: no class device holds a face code (#248).
