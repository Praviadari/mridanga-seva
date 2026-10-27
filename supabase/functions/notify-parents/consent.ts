// The parent-consent email of a child's sign-up at home (migration 0051, docs/DECISIONS.md #399): one
// email to the parent with a 6-digit code and the address of the consent page, where the parent types
// the code. The code is never in the link. Kept apart from Deno, like ./send.ts, so plain Node tests it
// (supabase/tests/parent-notices.test.mjs, and smoke-test.mjs against the real claim SQL).
//
// One run: claim_consent_codes() → one email per row through the same Brevo mailer as the check-out
// notices (no unsubscribe link: the parent asked for nothing yet, and nothing more is sent unless the
// child asks again) → finish_consent_codes(). In a dry run (no Brevo key) it logs "would send consent
// <language>" and nothing goes. Logs counts and languages only: never an address, a name or a code.
//
// The Telugu and Hindi texts are DRAFTS for a native speaker on the team to check (docs/TRANSLATIONS.md).

import type { Mailer, Rpc } from './send.ts';
import { dayFirst, escapeHtml, languageOf, type Email, type Language } from './template.ts';

/** One claimed request, as claim_consent_codes returns it. */
export type ConsentRow = {
  claim: string;
  profile_id: string;
  email: string;
  language: string;
  parent_name: string;
  child_name: string;
  /** 'YYYY-MM-DD', or null when missing. */
  child_dob: string | null;
  centre: string;
  code: string;
  /** 'YYYY-MM-DD' in India: the last day the code works. */
  expires_on: string;
};

/** How many requests one run claims (claim_consent_codes takes at most 20). */
export const CONSENT_CLAIM_LIMIT = 20;

/** The web app of each Supabase project: the consent page is <web app>/parent-consent. */
const WEB_APPS: Record<string, string> = {
  qeozvvizcojzxcjgnaei: 'https://app.mridangaseva.com', // LIVE (pages.dev until 26-10-2026)
  fhuqykssenuhczdqbafu: 'https://mridanga-seva-test.pages.dev', // TEST
};

/**
 * The consent page's address for this project: the function secret APP_WEB_URL when set, else the
 * web app of the project's ref, else LIVE's. Always https, never with a code or a name in it.
 */
export function consentPageUrl(supabaseUrl: string | undefined, override: string | undefined, language: Language): string {
  return `${webAppUrl(supabaseUrl, override)}/parent-consent${language === 'en' ? '' : `?lang=${language}`}`;
}

/** The web app of this project, as consentPageUrl chooses it, without a trailing slash (the parent page too, 0063). */
export function webAppUrl(supabaseUrl: string | undefined, override: string | undefined): string {
  const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(supabaseUrl ?? '')?.[1] ?? '';
  return (override && /^https:\/\/[^\s/?#]+$/.test(override.replace(/\/$/, '')) ? override : WEB_APPS[ref] ?? WEB_APPS.qeozvvizcojzxcjgnaei)
    .replace(/\/$/, '');
}

/**
 * A name as it goes into the email. Names follow the name rule (letters and . ' - only, 0047), so they
 * hold no link; a dot between two letters still gets a space after it, so a name like "pay.example"
 * cannot be turned into a link by a mail app (audit S3-01).
 */
export function mailName(name: string): string {
  return name.trim().replace(/[\r\n]+/g, ' ').replace(/(\p{L})\.(?=\p{L})/gu, '$1. ');
}

type Texts = {
  subject: string;
  greeting: string;
  asked: string;
  page: string;
  steps: string;
  code: string;
  valid: string;
  desk: string;
  notYou: string;
  signature: string;
};

const TEXTS: Record<Language, Texts> = {
  en: {
    subject: 'Mridanga Seva: consent for {child} to join the class',
    greeting: 'Hare Krishna {parent},',
    asked:
      '{child} (born {dob}) has signed up for the Mridanga Seva class at {centre} and gave this email address as their parent\'s or guardian\'s. A child under 18 can join only with the consent of a parent or guardian (Digital Personal Data Protection Act, 2023).',
    page: 'To give your consent, open this page:',
    steps: 'Type this email address and the code below, read the summary of the privacy notice, and tick the boxes.',
    code: 'Your code: {code}',
    valid: 'The code works until {date}. Do not share it with anyone, not even your child: the page is for you.',
    desk: 'At the first class, the class desk will ask to see your ID (your child can bring it, or you come): your name and that you are 18 or over. Only the kind of ID is noted, never its number.',
    notYou: 'If you do not know about this sign-up, or do not agree, do nothing: without your consent the sign-up is deleted after 30 days.',
    signature: 'Mridanga Seva',
  },
  te: {
    subject: 'మృదంగ సేవ: {child} తరగతిలో చేరడానికి మీ సమ్మతి',
    greeting: 'హరే కృష్ణ {parent},',
    asked:
      '{child} ({dob} న జన్మించారు) {centre} లోని మృదంగ సేవ తరగతికి నమోదు చేసుకున్నారు, మరియు ఈ ఈమెయిల్‌ను తమ తల్లిదండ్రులు లేదా సంరక్షకుల ఈమెయిల్‌గా ఇచ్చారు. 18 ఏళ్ల లోపు పిల్లలు తల్లిదండ్రులు లేదా సంరక్షకుల సమ్మతితో మాత్రమే చేరగలరు (డిజిటల్ వ్యక్తిగత డేటా రక్షణ చట్టం, 2023).',
    page: 'మీ సమ్మతి ఇవ్వడానికి ఈ పేజీని తెరవండి:',
    steps: 'ఈ ఈమెయిల్ చిరునామా మరియు క్రింది కోడ్‌ను టైప్ చేసి, గోప్యతా నోటీసు సారాంశాన్ని చదివి, పెట్టెలను టిక్ చేయండి.',
    code: 'మీ కోడ్: {code}',
    valid: 'ఈ కోడ్ {date} వరకు పనిచేస్తుంది. దీన్ని ఎవరితోనూ, మీ పిల్లలతో కూడా పంచుకోవద్దు: ఈ పేజీ మీ కోసమే.',
    desk: 'మొదటి తరగతిలో, తరగతి డెస్క్ మీ గుర్తింపు కార్డును చూడమని అడుగుతుంది (మీ పిల్లలు తీసుకురావచ్చు, లేదా మీరే రావచ్చు): మీ పేరు, మీ వయస్సు 18 లేదా అంతకు మించి. కార్డు రకం మాత్రమే నమోదు చేస్తారు, దాని నంబర్ ఎప్పుడూ కాదు.',
    notYou: 'ఈ నమోదు గురించి మీకు తెలియకపోతే, లేదా మీరు అంగీకరించకపోతే, ఏమీ చేయకండి: మీ సమ్మతి లేకుండా ఈ నమోదు 30 రోజుల తర్వాత తొలగించబడుతుంది.',
    signature: 'మృదంగ సేవ',
  },
  hi: {
    subject: 'मृदंग सेवा: {child} के कक्षा में शामिल होने के लिए आपकी सहमति',
    greeting: 'हरे कृष्ण {parent},',
    asked:
      '{child} (जन्म {dob}) ने {centre} में मृदंग सेवा कक्षा के लिए पंजीकरण किया है और यह ईमेल पता अपने माता-पिता या अभिभावक का बताया है। 18 वर्ष से कम आयु का बच्चा केवल माता-पिता या अभिभावक की सहमति से शामिल हो सकता है (डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023)।',
    page: 'अपनी सहमति देने के लिए यह पेज खोलें:',
    steps: 'यह ईमेल पता और नीचे दिया गया कोड टाइप करें, गोपनीयता सूचना का सारांश पढ़ें, और बॉक्स पर टिक करें।',
    code: 'आपका कोड: {code}',
    valid: 'यह कोड {date} तक काम करता है। इसे किसी के साथ साझा न करें, अपने बच्चे के साथ भी नहीं: यह पेज आपके लिए है।',
    desk: 'पहली कक्षा में, कक्षा डेस्क आपका पहचान पत्र देखना चाहेगा (बच्चा ला सकता है, या आप स्वयं आएँ): आपका नाम और कि आपकी आयु 18 वर्ष या अधिक है। केवल पहचान पत्र का प्रकार लिखा जाता है, उसका नंबर कभी नहीं।',
    notYou: 'अगर आपको इस पंजीकरण के बारे में नहीं पता, या आप सहमत नहीं हैं, तो कुछ न करें: आपकी सहमति के बिना यह पंजीकरण 30 दिन बाद मिटा दिया जाता है।',
    signature: 'मृदंग सेवा',
  },
};

/** Puts the values into {placeholders}; a value is never read as a placeholder itself. */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** The email for one claimed request. `pageUrl` is the consent page (consentPageUrl). */
export function buildConsentEmail(row: ConsentRow, pageUrl: string): Email {
  const texts = TEXTS[languageOf(row.language)];
  const values = {
    parent: mailName(row.parent_name),
    child: mailName(row.child_name) || '-',
    dob: row.child_dob ? dayFirst(row.child_dob) : '-',
    centre: row.centre.trim() || '-',
    code: row.code,
    date: dayFirst(row.expires_on),
  };
  // One line for the subject: a name with a line break cannot add mail headers or lines.
  const subject = fill(texts.subject, values).replace(/[\r\n]+/g, ' ');
  const paragraphs = [
    fill(texts.greeting, values),
    fill(texts.asked, values),
    `${texts.page}\n${pageUrl}`,
    texts.steps,
    fill(texts.code, values),
    fill(texts.valid, values),
    texts.desk,
    texts.notYou,
    texts.signature,
  ];
  const html = paragraphs
    .map((p) => {
      if (p.endsWith(pageUrl)) {
        const [line] = p.split('\n');
        return `<p>${escapeHtml(line)}<br><a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></p>`;
      }
      if (p === fill(texts.code, values)) return `<p><strong>${escapeHtml(p)}</strong></p>`;
      return `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  return { subject, text: paragraphs.join('\n\n'), html };
}

export type ConsentSummary = {
  dryRun: boolean;
  claimed: number;
  sent: number;
  skipped: number;
  retry: number;
  refused: number;
  codes: Record<string, number>;
};

/**
 * One run of consent emails. `mailer` null = dry run (logged, finished as skipped). `pageFor` gives the
 * consent page in a language. A database without 0051 (claim_consent_codes missing) is not an error:
 * the run reports nothing claimed, so the check-out notices still go.
 */
export async function runConsentCodes(
  rpc: Rpc,
  mailer: Mailer | null,
  pageFor: (language: Language) => string,
  log: (...parts: unknown[]) => void = console.log,
): Promise<ConsentSummary | { error: string }> {
  const summary: ConsentSummary = { dryRun: mailer === null, claimed: 0, sent: 0, skipped: 0, retry: 0, refused: 0, codes: {} };
  const claimed = await rpc('claim_consent_codes', { p_limit: CONSENT_CLAIM_LIMIT });
  if (claimed.error) {
    if (/claim_consent_codes/.test(claimed.error.message) && /(not find|does not exist)/i.test(claimed.error.message)) return summary;
    log('claim_consent_codes failed', claimed.error.message);
    return { error: 'consent_claim_failed' };
  }
  const rows = (claimed.data ?? []) as ConsentRow[];
  summary.claimed = rows.length;
  if (rows.length === 0) return summary;

  const sent: string[] = [];
  const skipped: string[] = [];
  const retry: string[] = [];
  const refused: Record<string, string> = {};
  let stopped = false;
  for (const row of rows) {
    if (stopped) {
      retry.push(row.profile_id);
      continue;
    }
    const language = languageOf(row.language);
    if (!mailer) {
      log('would send consent', language);
      skipped.push(row.profile_id);
      continue;
    }
    const result = await mailer(row.email, buildConsentEmail(row, pageFor(language)), null);
    if (result.status === 'sent') sent.push(row.profile_id);
    else {
      summary.codes[result.code] = (summary.codes[result.code] ?? 0) + 1;
      if (result.status === 'retry') {
        retry.push(row.profile_id);
        if (result.stopRun) stopped = true;
      } else refused[row.profile_id] = result.code;
    }
  }
  summary.sent = sent.length;
  summary.skipped = skipped.length;
  summary.retry = retry.length;
  summary.refused = Object.keys(refused).length;

  const finished = await rpc('finish_consent_codes', {
    p_claim: rows[0].claim,
    p_sent: sent,
    p_skipped: skipped,
    p_retry: retry,
    p_refused: refused,
  });
  if (finished.error) {
    // The requests' lease ends in 5 minutes; they are claimed again with a new code, and the parent may get two emails.
    log('finish_consent_codes failed', finished.error.message);
    return { error: 'consent_finish_failed' };
  }
  log('consent emails', JSON.stringify(summary));
  return summary;
}
