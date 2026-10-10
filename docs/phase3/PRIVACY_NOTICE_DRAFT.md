# Phase 3 — Privacy notice: draft additions for face scan, location and parent emails (10-10-2026)

> **Draft, not legal advice; not yet on the website.** P3-8 (DECISIONS #253-#255). The live notice
> is `website/content/{en,te,hi}/privacy.html` (version `0.1-draft`, 07-10-2026, #131), built from
> `website/site.config.mjs`. The blocks below are written in the same HTML so they can be pasted in.
> **When to paste (#255):** part **N1** (parent emails) before the Guru switches parent emails on at
> LIVE (#230); parts **N2-N4** (face, self-scan location, Play Integrity) only after the lawyer's review
> and with the Phase 3 APK (P3-7). Each paste raises `privacyNotice.version` and `date`.
> **Telugu and Hindi: NATIVE REVIEW NEEDED** (machine-assisted, words matched to the existing te/hi
> notice).

Related: [DPIA_DRAFT.md](DPIA_DRAFT.md) · [CONSENT_DRAFT.md](CONSENT_DRAFT.md) ·
[LAWYER_PACK.md](LAWYER_PACK.md).

## Where each part goes

| Part | Section of privacy.html | Change |
|---|---|---|
| N1 | "What the app keeps" table, row *Parents and guardians* + new paragraph after *Location*; "Services" table, row *Brevo* | Guardian email; check-out emails; Brevo also sends them |
| N2 | "What the app keeps": new row *Face scan (optional)* | Face code, 1:1, on the student's phone |
| N3 | Replace the *Location* paragraph | Adds the student's own phone at a self check-in/out |
| N4 | "Why we use it": new bullet; "Children": new paragraph; "How long": new bullet; "Services": new row *Google Play Integrity* | Purpose, basis, children, retention, processor |

---

## English

**N1 — parent emails**

Row *Parents and guardians of students under 18* — append: `, and an email address if the parent gives one for attendance emails`.

```html
<p><strong>Attendance emails to parents:</strong> when the class switches these emails on, the parent or guardian of a student under 18 gets an email when the student's check-out is recorded in the app: the student's name, the centre and the time. The email never contains the child's location, the area check or a photo. Parents can stop these emails at any time with the Unsubscribe link in the email or by telling the class desk. Adult students' parents get no emails.</p>
```

Brevo row, "What it does": `Sends sign-up and password-reset emails, and attendance emails to parents`.

**N2 — face scan**

```html
<tr><th scope="row">Face scan (optional)</th><td>Only for a student who chose it, with a separate written consent (a parent's for a student under 18): a <strong>face code</strong>, a list of numbers made from a few pictures of the student's face on the student's own phone. The pictures are deleted at once; no face photo is kept for this. The face code is kept encrypted on the student's phone and, encrypted, on the class's server in India. At each check-in and check-out the phone compares the face only with that student's own face code — it never searches among other people — and checks that the face is live. Each visit then records that it was marked by face scan, the match score and whether the live-face check passed.</td></tr>
```

**N3 — location (replaces the current paragraph)**

```html
<p><strong>Location:</strong> the app checks a location only at the moment of a check-in or check-out, never in the background, never while the app is merely open and never on the way to or from class. When a coordinator checks a student in, it checks the coordinator's phone. When a student who uses face scan checks in or out on their own phone, it checks that phone once, at that moment; outside the class area, offline or with a location that cannot be trusted, the student is asked to check in with a coordinator instead. In every case only the result (inside the class area, outside, or not known) and the distance in metres are kept, never the position itself. There is no live map and no location history, and the location is never sent to parents.</p>
```

**N4 — purpose, children, retention, processor**

"Why we use it" — new bullet:
```html
<li><strong>Face scan for attendance (optional)</strong>: letting a student check in and out on their own phone with certainty that it is really them. Basis: a separate, explicit consent, for a child the parent's or guardian's (DPDP Act sections 6 and 9; GDPR Article 9(2)(a)). Saying no, or stopping later, changes nothing else: the QR code and the coordinator stay for everyone.</li>
```

"Children" — new paragraph:
```html
<p>Face scan for a child needs the parent's or guardian's separate written consent, given at the desk, and the child's own agreement: if the child does not want it, it is not used. The first set-up is done at the desk with a coordinator. Face scan is never used to watch or analyse a child's behaviour. [[TEAM: minimum age for face scan — DECISIONS_FOR_GURU item 3]]</p>
```

"How long we keep data" — new bullet:
```html
<li>Face codes: deleted at once when the student or parent stops face scan or consent is withdrawn; otherwise 30 days after the student leaves, and at the latest 12 months after set-up for a student under 18 (24 months for an adult), when we ask again. The copy on the phone is deleted when face scan is turned off, at sign-out, or the next time the app opens online after it was stopped at the desk.</li>
```

"Services" — new row:
```html
<tr><td>Google Play Integrity</td><td>When a student uses face scan, checks that the phone and the app have not been tampered with. It receives information about the phone and the app, never the face or the location</td><td>Worldwide [[TEAM: confirm with Google's terms]]</td></tr>
```

---

## తెలుగు — DRAFT, NATIVE REVIEW NEEDED

**N1** — *తల్లిదండ్రులు/సంరక్షకులు* వరుసకు జోడించండి: `, హాజరు ఈమెయిల్‌ల కోసం తల్లిదండ్రులు ఇస్తే ఒక ఈమెయిల్ చిరునామా`.

```html
<p><strong>తల్లిదండ్రులకు హాజరు ఈమెయిల్‌లు:</strong> తరగతి ఈ ఈమెయిల్‌లను ప్రారంభించినప్పుడు, 18 ఏళ్ల లోపు విద్యార్థి తరగతి నుండి వెళ్లినట్లు యాప్‌లో నమోదైనప్పుడు వారి తల్లిదండ్రులు లేదా సంరక్షకులకు ఈమెయిల్ వస్తుంది: విద్యార్థి పేరు, కేంద్రం, సమయం. ఈమెయిల్‌లో పిల్లల స్థానం, ప్రాంత తనిఖీ ఫలితం లేదా ఫోటో ఎప్పుడూ ఉండవు. ఈమెయిల్‌లోని Unsubscribe లింక్‌తో లేదా తరగతి డెస్క్‌కు చెప్పి తల్లిదండ్రులు ఎప్పుడైనా వీటిని ఆపవచ్చు. వయోజన విద్యార్థుల తల్లిదండ్రులకు ఈమెయిల్‌లు రావు.</p>
```

Brevo వరుస: `సైన్-అప్, పాస్‌వర్డ్ రీసెట్ ఈమెయిల్‌లు, తల్లిదండ్రులకు హాజరు ఈమెయిల్‌లు పంపుతుంది`.

**N2**
```html
<tr><th scope="row">ముఖ స్కాన్ (ఐచ్ఛికం)</th><td>దాన్ని ఎంచుకున్న విద్యార్థికి మాత్రమే, ప్రత్యేక లిఖిత సమ్మతితో (18 ఏళ్ల లోపు వారికి తల్లిదండ్రుల సమ్మతి): విద్యార్థి సొంత ఫోన్‌లో వారి ముఖం యొక్క కొన్ని చిత్రాల నుండి తయారైన ఒక <strong>ముఖ కోడ్</strong> (అంకెల జాబితా). చిత్రాలు వెంటనే తొలగించబడతాయి; దీని కోసం ముఖ ఫోటో ఏదీ ఉంచబడదు. ముఖ కోడ్ విద్యార్థి ఫోన్‌లో, భారతదేశంలోని తరగతి సర్వర్‌లో ఎన్‌క్రిప్ట్ చేసి ఉంచబడుతుంది. ప్రతి హాజరు, వెళ్లే సమయంలో ఫోన్ ముఖాన్ని ఆ విద్యార్థి సొంత ముఖ కోడ్‌తో మాత్రమే పోలుస్తుంది — ఇతరులలో వెతకదు — ముఖం ప్రత్యక్షమైనదేనా అని చూస్తుంది. ప్రతి హాజరులో ముఖ స్కాన్‌తో నమోదైందని, సరిపోలిక స్కోర్, ప్రత్యక్ష ముఖ తనిఖీ ఫలితం నమోదవుతాయి.</td></tr>
```

**N3**
```html
<p><strong>స్థానం:</strong> యాప్ హాజరు లేదా వెళ్లే నమోదు చేసే క్షణంలో మాత్రమే స్థానం తనిఖీ చేస్తుంది; నేపథ్యంలో ఎప్పుడూ కాదు, యాప్ తెరిచి ఉన్నంత మాత్రాన కాదు, తరగతికి వచ్చే, వెళ్లే దారిలో కాదు. సమన్వయకర్త విద్యార్థి రాకను నమోదు చేసినప్పుడు, సమన్వయకర్త ఫోన్‌ను తనిఖీ చేస్తుంది. ముఖ స్కాన్ వాడే విద్యార్థి తన సొంత ఫోన్‌లో హాజరు వేసినప్పుడు లేదా వెళ్లినప్పుడు, ఆ ఫోన్‌ను ఆ క్షణంలో ఒక్కసారి తనిఖీ చేస్తుంది; తరగతి ప్రాంతం బయట, ఇంటర్నెట్ లేకుండా, లేదా నమ్మలేని స్థానంతో ఉంటే, సమన్వయకర్త వద్ద హాజరు వేయమని అడుగుతుంది. ప్రతి సందర్భంలో ఫలితం (తరగతి ప్రాంతం లోపల, బయట, లేదా తెలియదు), మీటర్లలో దూరం మాత్రమే భద్రపరుస్తాము, స్థానాన్ని ఎప్పుడూ కాదు. లైవ్ మ్యాప్ లేదు, స్థాన చరిత్ర లేదు, స్థానం తల్లిదండ్రులకు ఎప్పుడూ పంపబడదు.</p>
```

**N4**
```html
<li><strong>హాజరు కోసం ముఖ స్కాన్ (ఐచ్ఛికం)</strong>: విద్యార్థి తన సొంత ఫోన్‌లో, నిజంగా వారేనని నిర్ధారణతో, హాజరు వేయడానికి, వెళ్లడానికి. ఆధారం: ప్రత్యేక, స్పష్టమైన సమ్మతి; పిల్లలకు తల్లిదండ్రులు లేదా సంరక్షకుల సమ్మతి (DPDP చట్టం సెక్షన్లు 6, 9; GDPR ఆర్టికల్ 9(2)(a)). వద్దనడం, లేదా తర్వాత ఆపడం వల్ల ఇంకేమీ మారదు: QR కోడ్, సమన్వయకర్త అందరికీ ఉంటారు.</li>
```
```html
<p>పిల్లలకు ముఖ స్కాన్ కోసం డెస్క్ వద్ద ఇచ్చే తల్లిదండ్రులు లేదా సంరక్షకుల ప్రత్యేక లిఖిత సమ్మతి, పిల్లల సొంత అంగీకారం అవసరం: పిల్లలకు ఇష్టం లేకపోతే వాడము. మొదటి ఏర్పాటు డెస్క్ వద్ద సమన్వయకర్తతో జరుగుతుంది. పిల్లల ప్రవర్తనను గమనించడానికి లేదా విశ్లేషించడానికి ముఖ స్కాన్ ఎప్పుడూ వాడబడదు. [[TEAM: ముఖ స్కాన్‌కు కనీస వయస్సు]]</p>
```
```html
<li>ముఖ కోడ్‌లు: విద్యార్థి లేదా తల్లిదండ్రులు ముఖ స్కాన్ ఆపినప్పుడు లేదా సమ్మతి ఉపసంహరించినప్పుడు వెంటనే తొలగిస్తాము; లేకపోతే విద్యార్థి వెళ్లిపోయిన 30 రోజుల తర్వాత; ఏ సందర్భంలోనైనా ఏర్పాటు చేసిన గరిష్టంగా 12 నెలల తర్వాత (18 ఏళ్ల లోపు వారికి; వయోజనులకు 24 నెలలు), అప్పుడు మళ్లీ అడుగుతాము. ఫోన్‌లోని ప్రతి ముఖ స్కాన్ ఆపినప్పుడు, సైన్-అవుట్ చేసినప్పుడు, లేదా డెస్క్ వద్ద ఆపిన తర్వాత యాప్ ఇంటర్నెట్‌తో తెరిచినప్పుడు తొలగించబడుతుంది.</li>
```
```html
<tr><td>Google Play Integrity</td><td>విద్యార్థి ముఖ స్కాన్ వాడినప్పుడు, ఫోన్‌ను, యాప్‌ను ఎవరూ మార్చలేదని తనిఖీ చేస్తుంది. దీనికి ఫోన్, యాప్ గురించిన సమాచారం వెళ్తుంది; ముఖం లేదా స్థానం ఎప్పుడూ కాదు</td><td>ప్రపంచవ్యాప్తంగా [[TEAM: Google నిబంధనలతో నిర్ధారించండి]]</td></tr>
```

---

## हिन्दी — DRAFT, NATIVE REVIEW NEEDED

**N1** — *माता-पिता और अभिभावक* पंक्ति में जोड़ें: `, और हाज़िरी ईमेल के लिए माता-पिता द्वारा दिया गया ईमेल पता`.

```html
<p><strong>माता-पिता को हाज़िरी ईमेल:</strong> जब कक्षा ये ईमेल चालू करती है, तो 18 वर्ष से कम के विद्यार्थी के कक्षा से जाने की हाज़िरी ऐप में दर्ज होने पर उसके माता-पिता या अभिभावक को ईमेल मिलता है: विद्यार्थी का नाम, केंद्र और समय। ईमेल में बच्चे का स्थान, क्षेत्र जाँच का परिणाम या फ़ोटो कभी नहीं होता। माता-पिता ईमेल के Unsubscribe लिंक से या कक्षा की डेस्क को बताकर इन्हें कभी भी बंद कर सकते हैं। वयस्क विद्यार्थियों के माता-पिता को ईमेल नहीं जाते।</p>
```

Brevo पंक्ति: `साइन-अप और पासवर्ड रीसेट ईमेल, और माता-पिता को हाज़िरी ईमेल भेजता है`.

**N2**
```html
<tr><th scope="row">चेहरा स्कैन (वैकल्पिक)</th><td>केवल उस विद्यार्थी के लिए जिसने इसे चुना, अलग लिखित सहमति के साथ (18 वर्ष से कम के लिए माता-पिता की): विद्यार्थी के अपने फ़ोन पर उसके चेहरे की कुछ तस्वीरों से बना एक <strong>चेहरा कोड</strong> (अंकों की सूची)। तस्वीरें तुरंत मिटा दी जाती हैं; इसके लिए चेहरे की कोई फ़ोटो नहीं रखी जाती। चेहरा कोड विद्यार्थी के फ़ोन पर और भारत में कक्षा के सर्वर पर एन्क्रिप्ट करके रखा जाता है। हर बार आने और जाने पर फ़ोन चेहरे की तुलना केवल उसी विद्यार्थी के अपने चेहरा कोड से करता है — दूसरों में नहीं खोजता — और जाँचता है कि चेहरा जीवित है। हर हाज़िरी में दर्ज होता है कि वह चेहरा स्कैन से लगी, मिलान स्कोर, और जीवित-चेहरा जाँच का परिणाम।</td></tr>
```

**N3**
```html
<p><strong>स्थान:</strong> ऐप स्थान केवल आने या जाने की हाज़िरी लगाने के क्षण में जाँचता है; पृष्ठभूमि में कभी नहीं, ऐप केवल खुला रहने पर नहीं, और कक्षा आते-जाते रास्ते में नहीं। जब समन्वयक किसी विद्यार्थी की उपस्थिति दर्ज करते हैं, तो समन्वयक का फ़ोन जाँचा जाता है। जब चेहरा स्कैन वाला विद्यार्थी अपने फ़ोन पर आने या जाने की हाज़िरी लगाता है, तो उसी क्षण उस फ़ोन को एक बार जाँचा जाता है; कक्षा क्षेत्र के बाहर, बिना इंटरनेट, या भरोसे लायक़ स्थान न होने पर विद्यार्थी से समन्वयक के पास हाज़िरी लगवाने को कहा जाता है। हर स्थिति में केवल परिणाम (कक्षा क्षेत्र के अंदर, बाहर, या पता नहीं) और मीटर में दूरी रखी जाती है, स्थान स्वयं कभी नहीं। कोई लाइव मैप नहीं, कोई स्थान इतिहास नहीं, और स्थान माता-पिता को कभी नहीं भेजा जाता।</p>
```

**N4**
```html
<li><strong>हाज़िरी के लिए चेहरा स्कैन (वैकल्पिक)</strong>: विद्यार्थी को अपने फ़ोन पर, इस निश्चितता के साथ कि वह सचमुच वही है, आने-जाने की हाज़िरी लगाने देना। आधार: अलग, स्पष्ट सहमति; बच्चे के लिए माता-पिता या अभिभावक की (DPDP अधिनियम धारा 6 और 9; GDPR अनुच्छेद 9(2)(a))। मना करने या बाद में रोकने से और कुछ नहीं बदलता: QR कोड और समन्वयक सबके लिए रहते हैं।</li>
```
```html
<p>बच्चे के चेहरा स्कैन के लिए डेस्क पर दी गई माता-पिता या अभिभावक की अलग लिखित सहमति और बच्चे की अपनी हाँ ज़रूरी है: अगर बच्चा नहीं चाहता, तो इसका उपयोग नहीं होता। पहला सेट-अप डेस्क पर समन्वयक के साथ होता है। चेहरा स्कैन का उपयोग बच्चे के व्यवहार पर नज़र रखने या उसका विश्लेषण करने के लिए कभी नहीं होता। [[TEAM: चेहरा स्कैन की न्यूनतम आयु]]</p>
```
```html
<li>चेहरा कोड: विद्यार्थी या माता-पिता के चेहरा स्कैन रोकने या सहमति वापस लेने पर तुरंत मिटा दिए जाते हैं; वरना विद्यार्थी के छोड़ने के 30 दिन बाद, और 18 वर्ष से कम के लिए सेट-अप के अधिकतम 12 महीने बाद (वयस्क के लिए 24 महीने), तब हम फिर पूछते हैं। फ़ोन की प्रति चेहरा स्कैन बंद करने पर, साइन-आउट पर, या डेस्क पर रोके जाने के बाद ऐप के अगली बार इंटरनेट के साथ खुलने पर मिट जाती है।</li>
```
```html
<tr><td>Google Play Integrity</td><td>जब विद्यार्थी चेहरा स्कैन का उपयोग करता है, तो जाँचता है कि फ़ोन और ऐप से छेड़छाड़ नहीं हुई है। इसे फ़ोन और ऐप की जानकारी मिलती है, चेहरा या स्थान कभी नहीं</td><td>विश्वभर [[TEAM: Google की शर्तों से पुष्टि करें]]</td></tr>
```
