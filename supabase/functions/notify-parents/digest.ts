// The weekly email to a parent about their child's week at the class (migration 0058, docs/DECISIONS.md
// #530-#539): visits (days and times), practice against the goal, newly ticked syllabus items, a level change and
// the next event, in the guardian's language (en, te, hi). Never a location, a photo, a mark or a remark, and
// nothing about another child (#532). Warm and short; the last lines say why it comes, give the class contact
// and how to stop it.
//
// One run: claim_parent_digests() → one email per row through Brevo (or, in a dry run, a "would send" log
// line) → finish_parent_digests(). The staff preview builds the same email from preview_parent_digest()
// (index.ts), so what staff see is exactly what a parent gets. Kept apart from Deno so plain Node can test it
// (supabase/tests/parent-notices.test.mjs, and smoke-test.mjs against the real SQL). Logs ids and counts
// only, never an address, a name or a text.
//
// The Telugu and Hindi texts are DRAFTS for a native speaker on the team to check (docs/TRANSLATIONS.md);
// the English is the reference.

import type { Mailer, Rpc, RunSummary } from './send.ts';
import { dayFirst, escapeHtml, languageOf, type Email, type Language } from './template.ts';

/** One week of one student, as parent_digest_content returns it. */
export type DigestContent = {
  /** 'YYYY-MM-DD', a Monday. */
  week_start: string;
  /** 'YYYY-MM-DD', the Sunday. */
  week_end: string;
  centre: string;
  level: number;
  level_name: string | null;
  /** Each visit: its day at the centre, check-in and check-out ('HH:MM'; out null = none recorded). */
  visits: { on: string; in: string; out: string | null }[];
  practice: { minutes: number; days: number; days_met: number; goal_days: number; goal_minutes: number };
  /** Titles of the items ticked that week (at most 8) and how many in all. */
  ticks: string[];
  ticks_count: number;
  level_change: { from: number | null; from_name: string | null; to: number; to_name: string } | null;
  next_event: { title: string; on: string; at: string; centre: string | null } | null;
};

/** One claimed row, as claim_parent_digests returns it. */
export type DigestRow = {
  claim: string;
  digest_id: number;
  guardian_id: string;
  email: string;
  language: string;
  student_name: string;
  /** The class desk's phone or email (setting parent_notice_contact); '' = none given. */
  contact: string;
  content: DigestContent;
};

type Texts = {
  subject: string;
  greeting: string;
  intro: string;
  visitsOne: string;
  visitsMany: string;
  visitLine: string;
  visitOpen: string;
  noVisits: string;
  practice: string;
  goalMet: string;
  noPractice: string;
  ticks: string;
  ticksMore: string;
  levelUp: string;
  levelNow: string;
  event: string;
  eventAt: string;
  closing: string;
  about: string;
  questions: string;
  stop: string;
  signature: string;
  weekdays: string[];
  levels: Record<number, string>;
};

const TEXTS: Record<Language, Texts> = {
  en: {
    subject: '{name}\'s week at Mridanga Seva, {from} to {to}',
    greeting: 'Hare Krishna,',
    intro: 'Here is {name}\'s week at the Mridanga Seva class, {from} to {to}.',
    visitsOne: 'At class: 1 visit.',
    visitsMany: 'At class: {count} visits.',
    visitLine: '{day} {date}: {in} to {out}',
    visitOpen: '{day} {date}: from {in} (no check-out recorded)',
    noVisits: 'At class: we missed {name} this week, and hope to see {name} soon.',
    practice: 'Practice at home: {minutes} minutes on {days} of 7 days. The goal is {goalDays} days of {goalMinutes} minutes; reached on {met}.',
    goalMet: 'The week\'s goal is reached. Well done!',
    noPractice: 'Practice at home: none recorded in the app this week. A few minutes every day, offered with devotion, make a big difference.',
    ticks: 'Newly learnt: {items}.',
    ticksMore: '{items}, and {more} more',
    levelUp: '{name} has moved up to the {level} level. Congratulations!',
    levelNow: '{name}\'s level is now {level}.',
    event: 'Coming up: {title}, {date} at {time}.',
    eventAt: 'Coming up: {title}, {date} at {time}, {centre}.',
    closing: 'Thank you for supporting {name}\'s seva.',
    about: 'This weekly email comes from the Mridanga Seva class because you agreed to it. It never includes your child\'s location or photo, or anything about another child.',
    questions: 'Questions: {contact}',
    stop: 'To stop these weekly emails: use Unsubscribe in your mail app, or tell the class desk.',
    signature: 'Mridanga Seva',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    levels: { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' },
  },
  te: {
    subject: 'మృదంగ సేవలో {name} వారం, {from} నుండి {to}',
    greeting: 'హరే కృష్ణ,',
    intro: '{from} నుండి {to} వరకు మృదంగ సేవ తరగతిలో {name} వారం ఇది.',
    visitsOne: 'తరగతికి: 1 సారి వచ్చారు.',
    visitsMany: 'తరగతికి: {count} సార్లు వచ్చారు.',
    visitLine: '{day} {date}: {in} నుండి {out}',
    visitOpen: '{day} {date}: {in} నుండి (చెక్-అవుట్ నమోదు కాలేదు)',
    noVisits: 'తరగతికి: ఈ వారం {name} రాలేదు; త్వరలో కలుస్తామని ఆశిస్తున్నాము.',
    practice: 'ఇంట్లో సాధన: 7 రోజుల్లో {days} రోజులు, మొత్తం {minutes} నిమిషాలు. లక్ష్యం: {goalMinutes} నిమిషాల చొప్పున {goalDays} రోజులు; {met} రోజులు చేరారు.',
    goalMet: 'ఈ వారం లక్ష్యం చేరారు. చాలా బాగుంది!',
    noPractice: 'ఇంట్లో సాధన: ఈ వారం యాప్‌లో నమోదు కాలేదు. భక్తితో రోజూ కొన్ని నిమిషాల సాధన ఎంతో మేలు చేస్తుంది.',
    ticks: 'కొత్తగా నేర్చుకున్నవి: {items}.',
    ticksMore: '{items}, ఇంకా {more}',
    levelUp: '{name} {level} స్థాయికి చేరారు. అభినందనలు!',
    levelNow: '{name} ఇప్పుడు {level} స్థాయిలో ఉన్నారు.',
    event: 'రాబోయేది: {title}, {date} న {time} కి.',
    eventAt: 'రాబోయేది: {title}, {date} న {time} కి, {centre}.',
    closing: '{name} సేవకు మీ సహకారానికి ధన్యవాదాలు.',
    about: 'మీరు అంగీకరించినందున ఈ వారపు ఈమెయిల్ మృదంగ సేవ తరగతి నుండి వస్తుంది. ఇందులో మీ పిల్లల స్థానం, ఫోటో, లేదా వేరే పిల్లల గురించి ఏదీ ఎప్పుడూ ఉండదు.',
    questions: 'ప్రశ్నలు: {contact}',
    stop: 'ఈ వారపు ఈమెయిల్స్ ఆపడానికి: మీ మెయిల్ యాప్‌లో Unsubscribe నొక్కండి, లేదా తరగతి డెస్క్‌కు చెప్పండి.',
    signature: 'మృదంగ సేవ',
    weekdays: ['సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని', 'ఆది'],
    levels: { 1: 'ప్రారంభ', 2: 'మధ్యమ', 3: 'ఉన్నత' },
  },
  hi: {
    subject: 'मृदंग सेवा में {name} का सप्ताह, {from} से {to}',
    greeting: 'हरे कृष्ण,',
    intro: '{from} से {to} तक मृदंग सेवा कक्षा में {name} का सप्ताह।',
    visitsOne: 'कक्षा में: 1 बार आए।',
    visitsMany: 'कक्षा में: {count} बार आए।',
    visitLine: '{day} {date}: {in} से {out}',
    visitOpen: '{day} {date}: {in} से (चेक-आउट दर्ज नहीं हुआ)',
    noVisits: 'कक्षा में: इस सप्ताह {name} नहीं आए; जल्द मिलने की आशा है।',
    practice: 'घर पर अभ्यास: 7 में से {days} दिन, कुल {minutes} मिनट। लक्ष्य: {goalDays} दिन, हर दिन {goalMinutes} मिनट; {met} दिन पूरा हुआ।',
    goalMet: 'इस सप्ताह का लक्ष्य पूरा हुआ। बहुत बढ़िया!',
    noPractice: 'घर पर अभ्यास: इस सप्ताह ऐप में दर्ज नहीं हुआ। भक्ति से रोज़ कुछ मिनट का अभ्यास बहुत फ़र्क़ लाता है।',
    ticks: 'नया सीखा: {items}।',
    ticksMore: '{items}, और {more} और',
    levelUp: '{name} अब {level} स्तर पर पहुँच गए हैं। बधाई!',
    levelNow: '{name} का स्तर अब {level} है।',
    event: 'आगे: {title}, {date} को {time} बजे।',
    eventAt: 'आगे: {title}, {date} को {time} बजे, {centre}।',
    closing: '{name} की सेवा में आपके सहयोग के लिए धन्यवाद।',
    about: 'आपकी सहमति से यह साप्ताहिक ईमेल मृदंग सेवा कक्षा से आता है। इसमें आपके बच्चे का स्थान, फ़ोटो, या किसी दूसरे बच्चे के बारे में कुछ भी कभी नहीं होता।',
    questions: 'प्रश्न: {contact}',
    stop: 'ये साप्ताहिक ईमेल बंद करने के लिए: अपने मेल ऐप में Unsubscribe दबाएँ, या कक्षा डेस्क को बताएँ।',
    signature: 'मृदंग सेवा',
    weekdays: ['सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि', 'रवि'],
    levels: { 1: 'प्रारंभिक', 2: 'मध्यम', 3: 'उन्नत' },
  },
};

/** Puts the values into {placeholders}; a value is never read as a placeholder itself. */
function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

/** '2026-10-20' → its weekday, Monday = 0 (a calendar date: no time zone involved). */
function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return (new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7;
}

/** A level's name in the language: the class's three by number, else the name stored. */
function levelName(texts: Texts, id: number | null, stored: string | null): string {
  return (id !== null && texts.levels[id]) || stored || '';
}

/** The email for one student's week, in `language`. */
export function buildDigestEmail(row: Pick<DigestRow, 'language' | 'student_name' | 'contact' | 'content'>): Email {
  const texts = TEXTS[languageOf(row.language)];
  const c = row.content;
  const name = row.student_name.trim();
  const from = dayFirst(c.week_start);
  const to = dayFirst(c.week_end);
  const contact = row.contact.trim();
  const v = { name, from, to };

  const visits = c.visits.length === 0
    ? fill(texts.noVisits, v)
    : [
        c.visits.length === 1 ? texts.visitsOne : fill(texts.visitsMany, { count: c.visits.length }),
        ...c.visits.map((visit) => `• ${fill(visit.out ? texts.visitLine : texts.visitOpen, {
          day: texts.weekdays[weekdayOf(visit.on)], date: dayFirst(visit.on).slice(0, 5), in: visit.in, out: visit.out ?? '' })}`),
      ].join('\n');

  const p = c.practice;
  const practice = p.minutes > 0
    ? [fill(texts.practice, { minutes: p.minutes, days: p.days, goalDays: p.goal_days, goalMinutes: p.goal_minutes, met: p.days_met }),
       p.days_met >= p.goal_days ? texts.goalMet : null].filter(Boolean).join(' ')
    : texts.noPractice;

  const learnt: string[] = [];
  if (c.ticks_count > 0) {
    const items = c.ticks.map((t) => t.trim()).filter(Boolean).join(', ');
    const more = c.ticks_count - c.ticks.length;
    learnt.push(fill(texts.ticks, { items: more > 0 ? fill(texts.ticksMore, { items, more }) : items }));
  }
  if (c.level_change) {
    const level = levelName(texts, c.level_change.to, c.level_change.to_name);
    const up = c.level_change.from === null || c.level_change.to > c.level_change.from;
    learnt.push(fill(up ? texts.levelUp : texts.levelNow, { name, level }));
  }

  const event = c.next_event
    ? fill(c.next_event.centre ? texts.eventAt : texts.event, {
        title: c.next_event.title.trim(), date: dayFirst(c.next_event.on), time: c.next_event.at, centre: c.next_event.centre?.trim() ?? '' })
    : null;

  // One line for the subject: a name with a line break cannot add mail headers or lines.
  const subject = fill(texts.subject, v).replace(/[\r\n]+/g, ' ');
  const paragraphs = [
    texts.greeting,
    fill(texts.intro, v),
    visits,
    practice,
    learnt.length ? learnt.join('\n') : null,
    event,
    fill(texts.closing, v),
    [texts.about, contact ? fill(texts.questions, { contact }) : null, texts.stop].filter(Boolean).join('\n'),
    texts.signature,
  ].filter((part): part is string => !!part);
  return {
    subject,
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join(''),
  };
}

/** How many rows one run claims (claim_parent_digests takes at most 10). */
export const DIGEST_CLAIM_LIMIT = 10;

/**
 * One digest run, as runNotices (send.ts) for the check-out emails. `mailer` null = dry run: each row is
 * logged as "would send" and finished as skipped. `linkFor` makes the guardian's unsubscribe link.
 */
export async function runDigests(
  rpc: Rpc,
  mailer: Mailer | null,
  linkFor: (guardianId: string) => Promise<string | null>,
  log: (...parts: unknown[]) => void = console.log,
): Promise<RunSummary | { error: string }> {
  const claimed = await rpc('claim_parent_digests', { p_limit: DIGEST_CLAIM_LIMIT });
  if (claimed.error) {
    log('claim_parent_digests failed', claimed.error.message);
    return { error: 'claim_failed' };
  }
  const rows = (claimed.data ?? []) as DigestRow[];
  const summary: RunSummary = { dryRun: mailer === null, claimed: rows.length, sent: 0, skipped: 0, retry: 0, refused: 0, codes: {} };
  if (rows.length === 0) return summary;

  const sent: number[] = [];
  const skipped: number[] = [];
  const retry: number[] = [];
  const refused: Record<string, string> = {};
  let stopped = false;
  for (const row of rows) {
    if (stopped || !row.content) {
      // No content: the student is gone since the claim; tried again, then ended by the next claim.
      retry.push(row.digest_id);
      continue;
    }
    const email = buildDigestEmail(row);
    if (!mailer) {
      log('would send digest', row.digest_id, languageOf(row.language));
      skipped.push(row.digest_id);
      continue;
    }
    const result = await mailer(row.email, email, await linkFor(row.guardian_id));
    if (result.status === 'sent') sent.push(row.digest_id);
    else {
      summary.codes[result.code] = (summary.codes[result.code] ?? 0) + 1;
      if (result.status === 'retry') {
        retry.push(row.digest_id);
        if (result.stopRun) stopped = true;
      } else refused[String(row.digest_id)] = result.code;
    }
  }
  summary.sent = sent.length;
  summary.skipped = skipped.length;
  summary.retry = retry.length;
  summary.refused = Object.keys(refused).length;

  const finished = await rpc('finish_parent_digests', {
    p_claim: rows[0].claim,
    p_sent: sent,
    p_skipped: skipped,
    p_retry: retry,
    p_refused: refused,
    p_summary: summary,
  });
  if (finished.error) {
    // The rows' lease ends in 5 minutes and they are claimed again; Brevo may then send a second copy.
    log('finish_parent_digests failed', finished.error.message);
    return { error: 'finish_failed' };
  }
  log('parent digests', JSON.stringify(summary));
  return summary;
}

/** What preview_parent_digest returns (staff). */
export type DigestPreviewData = {
  enabled: boolean;
  student_name: string;
  app_language: string;
  contact: string;
  content: DigestContent | null;
  guardians: { guardian_id: string; block: string | null; language: string | null }[];
};

/**
 * The staff preview: the email in each language a guardian of this student would get it in (the guardian's,
 * else the child's app language), and in `language` when asked; with each guardian's reason for none.
 */
export function buildDigestPreview(data: DigestPreviewData, language: string | null): {
  enabled: boolean;
  guardians: { guardian_id: string; block: string | null; language: Language }[];
  emails: Partial<Record<Language, Email>>;
} {
  const guardians = data.guardians.map((g) => ({ guardian_id: g.guardian_id, block: g.block, language: languageOf(g.language ?? data.app_language) }));
  const wanted = new Set<Language>(language ? [languageOf(language)] : guardians.map((g) => g.language));
  if (wanted.size === 0) wanted.add(languageOf(data.app_language));
  const emails: Partial<Record<Language, Email>> = {};
  if (data.content) {
    for (const lang of wanted) {
      emails[lang] = buildDigestEmail({ language: lang, student_name: data.student_name, contact: data.contact, content: data.content });
    }
  }
  return { enabled: data.enabled, guardians, emails };
}
