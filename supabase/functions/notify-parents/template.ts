// The check-in / check-out email to a parent (migration 0043, docs/DECISIONS.md #224-#231): plain,
// short, in the guardian's language (en, te, hi). It names the student, the centre, the local time
// and how the check-in was marked; never a location, a distance or a photo (#212). The last lines
// give the class contact and how to stop the emails.
//
// The Telugu and Hindi texts are DRAFTS for a native speaker on the team to check
// (docs/TRANSLATIONS.md); the English is the reference.

/** One claimed queue row, as claim_parent_notices returns it. */
export type NoticeRow = {
  claim: string;
  notice_id: number;
  guardian_id: string;
  kind: 'in' | 'out' | 'no_checkout';
  email: string;
  language: string;
  student_name: string;
  centre: string;
  /** 'YYYY-MM-DD' at the centre. */
  event_date: string;
  /** 'HH:MM' at the centre. */
  event_time: string;
  /** visits.method: qr, manual, face, phone. */
  method: string;
  /** The class desk's phone or email (setting parent_notice_contact); '' = none given. */
  contact: string;
};

export type Language = 'en' | 'te' | 'hi';

type Texts = {
  subject: Record<NoticeRow['kind'], string>;
  body: Record<NoticeRow['kind'], string>;
  how: Record<string, string>;
  greeting: string;
  about: string;
  questions: string;
  stop: string;
  signature: string;
};

const TEXTS: Record<Language, Texts> = {
  en: {
    subject: {
      in: '{name} checked in at {centre}',
      out: '{name} checked out of {centre}',
      no_checkout: '{name}: no check-out recorded',
    },
    body: {
      in: '{name} checked in at {centre} at {time} on {date} ({how}).',
      out: '{name} checked out of {centre} at {time} on {date}.',
      no_checkout:
        'No check-out was recorded for {name} at {centre} on {date}. The visit was closed at {time}, the centre\'s closing time; this is not the time {name} left.',
    },
    how: { qr: 'QR code scanned', manual: 'marked by a coordinator', face: 'face scan', phone: 'marked by the class' },
    greeting: 'Hare Krishna,',
    about: 'This is an automatic notice from the Mridanga Seva class. It never includes your child\'s location or photo.',
    questions: 'Questions: {contact}',
    stop: 'To stop these emails: use Unsubscribe in your mail app, or tell the class desk.',
    signature: 'Mridanga Seva',
  },
  te: {
    subject: {
      in: '{name} చెక్-ఇన్ – {centre}',
      out: '{name} చెక్-అవుట్ – {centre}',
      no_checkout: '{name}: చెక్-అవుట్ నమోదు కాలేదు',
    },
    body: {
      in: '{name} {date} న {time} కి {centre} లో చెక్-ఇన్ అయ్యారు ({how}).',
      out: '{name} {date} న {time} కి {centre} నుండి చెక్-అవుట్ అయ్యారు.',
      no_checkout:
        '{date} న {centre} లో {name} చెక్-అవుట్ నమోదు కాలేదు. కేంద్రం మూసే సమయం {time} కి హాజరు మూసివేయబడింది; ఇది {name} వెళ్ళిన సమయం కాదు.',
    },
    how: { qr: 'QR కోడ్ స్కాన్', manual: 'సమన్వయకర్త నమోదు చేశారు', face: 'ముఖ స్కాన్', phone: 'తరగతి నమోదు చేసింది' },
    greeting: 'హరే కృష్ణ,',
    about: 'ఇది మృదంగ సేవ తరగతి నుండి వచ్చిన స్వయంచాలక సందేశం. ఇందులో మీ పిల్లల స్థానం లేదా ఫోటో ఎప్పుడూ ఉండదు.',
    questions: 'ప్రశ్నలు: {contact}',
    stop: 'ఈ ఈమెయిల్స్ ఆపడానికి: మీ మెయిల్ యాప్‌లో Unsubscribe నొక్కండి, లేదా తరగతి డెస్క్‌కు చెప్పండి.',
    signature: 'మృదంగ సేవ',
  },
  hi: {
    subject: {
      in: '{name} का चेक-इन – {centre}',
      out: '{name} का चेक-आउट – {centre}',
      no_checkout: '{name}: चेक-आउट दर्ज नहीं हुआ',
    },
    body: {
      in: '{name} का चेक-इन {date} को {time} बजे {centre} में हुआ ({how})।',
      out: '{name} का चेक-आउट {date} को {time} बजे {centre} से हुआ।',
      no_checkout:
        '{date} को {centre} में {name} का चेक-आउट दर्ज नहीं हुआ। केंद्र बंद होने के समय {time} बजे उपस्थिति बंद की गई; यह {name} के जाने का समय नहीं है।',
    },
    how: { qr: 'QR कोड स्कैन', manual: 'समन्वयक द्वारा दर्ज', face: 'चेहरा स्कैन', phone: 'कक्षा द्वारा दर्ज' },
    greeting: 'हरे कृष्ण,',
    about: 'यह मृदंग सेवा कक्षा का स्वचालित संदेश है। इसमें आपके बच्चे का स्थान या फ़ोटो कभी नहीं होता।',
    questions: 'प्रश्न: {contact}',
    stop: 'ये ईमेल बंद करने के लिए: अपने मेल ऐप में Unsubscribe दबाएँ, या कक्षा डेस्क को बताएँ।',
    signature: 'मृदंग सेवा',
  },
};

/** The language to write in: the row's if known, else English. */
export function languageOf(code: string): Language {
  return code === 'te' || code === 'hi' ? code : 'en';
}

/** '2026-10-10' → '10-10-2026' (the class writes dates day first). */
export function dayFirst(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}-${m}-${y}` : isoDate;
}

/** Puts the values into {placeholders}; a value is never read as a placeholder itself. */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** Text safe inside HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export type Email = { subject: string; text: string; html: string };

/** The email for one queue row. */
export function buildEmail(row: NoticeRow): Email {
  const texts = TEXTS[languageOf(row.language)];
  const name = row.student_name.trim();
  const values = {
    name,
    centre: row.centre.trim(),
    date: dayFirst(row.event_date),
    time: row.event_time,
    how: texts.how[row.method] ?? texts.how.phone,
    contact: row.contact.trim(),
  };
  // One line for the subject: a name with a line break cannot add mail headers or lines.
  const subject = fill(texts.subject[row.kind], values).replace(/[\r\n]+/g, ' ');
  const paragraphs = [
    texts.greeting,
    fill(texts.body[row.kind], values),
    [texts.about, values.contact ? fill(texts.questions, values) : null, texts.stop].filter(Boolean).join('\n'),
    texts.signature,
  ];
  return {
    subject,
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''),
  };
}
