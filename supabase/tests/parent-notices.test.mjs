// Checks the Edge Function notify-parents (supabase/functions/notify-parents) with plain Node: the
// email texts (template.ts), the signed unsubscribe link, Brevo's answers and a whole run against
// an imitated queue and an imitated Brevo (send.ts); the weekly email to parents (digest.ts, 0058). The queue's SQL with send.ts is checked in
// smoke-test.mjs ("0043 parent notices"); Brevo and a real inbox only on TEST:
// docs/OPERATIONS.md "Parent notices by email".
//
//   cd supabase/tests && npm run test:parents

import { buildEmail, dayFirst, escapeHtml, languageOf } from '../functions/notify-parents/template.ts';
import { BREVO_URL, brevoMailer, checkStop, runNotices, stopSignature, stopUrl } from '../functions/notify-parents/send.ts';
import { buildDigestEmail, buildDigestPreview, DIGEST_CLAIM_LIMIT, runDigests } from '../functions/notify-parents/digest.ts';

let failures = 0;

/** Prints PASS or FAIL for one check. */
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const GUARDIAN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const row = (over = {}) => ({
  claim: 'c1', notice_id: 1, guardian_id: GUARDIAN, kind: 'in', email: 'parent@example.com', language: 'en',
  student_name: 'Arjun Rao', centre: 'Abids', event_date: '2026-10-10', event_time: '17:02', method: 'qr',
  contact: '98480 00000', ...over,
});

// ---------------------------------------------------------------- the email
{
  const mail = buildEmail(row());
  check('check-in: subject names the student and centre', mail.subject === 'Arjun Rao checked in at Abids', mail.subject);
  check('check-in: body says centre, time, date and how', mail.text.includes('Arjun Rao checked in at Abids at 17:02 on 10-10-2026 (QR code scanned).'), mail.text);
  check('the email gives the class contact', mail.text.includes('Questions: 98480 00000'));
  check('the email says how to stop it', mail.text.includes('To stop these emails'));
  check('the email says it never holds a location or photo', mail.text.includes('never includes your child\'s location or photo'));
  const out = buildEmail(row({ kind: 'out', method: 'manual' }));
  check('check-out: its own subject and body, no method', out.subject === 'Arjun Rao checked out of Abids'
    && out.text.includes('checked out of Abids at 17:02 on 10-10-2026.') && !out.text.includes('coordinator'), out.text);
  const closed = buildEmail(row({ kind: 'no_checkout', event_time: '20:00' }));
  check('no check-out: says none was recorded and that 20:00 is not when they left',
    closed.subject === 'Arjun Rao: no check-out recorded' && closed.text.includes('this is not the time Arjun Rao left'), closed.text);
  check('a coordinator\'s tap is said so', buildEmail(row({ method: 'manual' })).text.includes('(marked by a coordinator)'));
  check('no contact given: no "Questions" line', !buildEmail(row({ contact: ' ' })).text.includes('Questions'));
  const te = buildEmail(row({ language: 'te' }));
  const hi = buildEmail(row({ language: 'hi' }));
  check('Telugu text', te.text.includes('చెక్-ఇన్') && te.text.includes('17:02') && te.text.includes('Arjun Rao'), te.subject);
  check('Hindi text', hi.text.includes('चेक-इन') && hi.text.includes('17:02') && hi.text.includes('Abids'), hi.subject);
  check('an unknown language falls back to English', languageOf('fr') === 'en' && buildEmail(row({ language: 'xx' })).subject.includes('checked in'));
  check('dates are day first', dayFirst('2026-01-31') === '31-01-2026');
  const odd = buildEmail(row({ student_name: 'A <b>&</b>\r\nBcc: x@y', centre: '{name}' }));
  check('a name cannot break the subject line', !/[\r\n]/.test(odd.subject), JSON.stringify(odd.subject));
  check('the HTML part escapes names', odd.html.includes('A &lt;b&gt;&amp;&lt;/b&gt;') && !odd.html.includes('<b>'));
  check('a value is never read as a placeholder', odd.subject.includes('{name}'), odd.subject);
  check('escapeHtml escapes quotes', escapeHtml(`"'`) === '&quot;&#39;');
  const all = [mail, out, closed, te, hi].map((m) => m.text + m.html).join(' ');
  check('no email holds a location, distance or photo word', !/(lat|lng|longitude|latitude|distance|metre|photo_path|\.jpg)/i.test(all.replace(/location or photo|స్థానం లేదా ఫోటో|स्थान या फ़ोटो/g, '')));
}

// ---------------------------------------------------------------- the unsubscribe link
{
  const secret = 'x'.repeat(64);
  const link = await stopUrl('https://abc.supabase.co/functions/v1/notify-parents', secret, GUARDIAN);
  const value = new URL(link).searchParams.get('stop');
  check('the link carries the guardian id and a signature', value?.startsWith(`${GUARDIAN}.`) === true, link);
  check('a correctly signed link is accepted', (await checkStop(secret, value)) === GUARDIAN);
  check('a link signed with another secret is refused', (await checkStop('y'.repeat(64), value)) === null);
  const other = '1f8fad5b-d9cb-469f-a165-70867728950e';
  check('another guardian\'s id with this signature is refused', (await checkStop(secret, `${other}.${value.split('.')[1]}`)) === null);
  check('a missing or malformed value is refused', (await checkStop(secret, null)) === null && (await checkStop(secret, 'abc')) === null
    && (await checkStop(secret, `${GUARDIAN}.`)) === null);
  check('the signature is URL-safe', /^[A-Za-z0-9_-]+$/.test(await stopSignature(secret, GUARDIAN)));
}

// ---------------------------------------------------------------- Brevo's answers
/** An imitated fetch: answers with `status` and records the requests. */
function fakeFetch(statuses) {
  const calls = [];
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const status = statuses[Math.min(i++, statuses.length - 1)];
    if (status === 'network') throw new Error('offline');
    return new Response('{}', { status });
  };
  return { fn, calls };
}
{
  const brevo = fakeFetch([201]);
  const mailer = brevoMailer(brevo.fn, 'key-1', { email: 'notices@example.org', name: 'Mridanga Seva' }, 'desk@example.org');
  const result = await mailer('parent@example.com', buildEmail(row()), 'https://abc.supabase.co/functions/v1/notify-parents?stop=x.y');
  const sent = brevo.calls[0];
  check('201 = sent', result.status === 'sent');
  check('one POST to Brevo\'s transactional API with the key in its header', sent.url === BREVO_URL
    && sent.init.method === 'POST' && sent.init.headers['api-key'] === 'key-1');
  check('to the guardian only, from the sender, replies to the desk', sent.body.to.length === 1 && sent.body.to[0].email === 'parent@example.com'
    && sent.body.sender.email === 'notices@example.org' && sent.body.replyTo.email === 'desk@example.org');
  check('text and HTML parts', typeof sent.body.textContent === 'string' && sent.body.htmlContent.startsWith('<p>'));
  check('one-click unsubscribe headers', sent.body.headers['List-Unsubscribe'] === '<https://abc.supabase.co/functions/v1/notify-parents?stop=x.y>'
    && sent.body.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  const answer = async (status) => brevoMailer(fakeFetch([status]).fn, 'k', { email: 'a@b.c', name: 'n' }, null)('p@x.y', buildEmail(row()), null);
  check('429 and 5xx are tried again', (await answer(429)).status === 'retry' && (await answer(503)).status === 'retry');
  check('a network failure is tried again', (await answer('network')).status === 'retry');
  const bad = await answer(401);
  check('401 (wrong key) is tried again and stops the run', bad.status === 'retry' && bad.stopRun === true && bad.code === 'brevo_401');
  const refused = await answer(400);
  check('400 (unverified sender, bad address) refuses the row', refused.status === 'refused' && refused.code === 'brevo_400');
  const noLink = fakeFetch([201]);
  await brevoMailer(noLink.fn, 'k', { email: 'a@b.c', name: 'n' }, null)('p@x.y', buildEmail(row()), null);
  check('without a link: no unsubscribe header, no replyTo', noLink.calls[0].body.headers === undefined && noLink.calls[0].body.replyTo === undefined);
}

// ---------------------------------------------------------------- a whole run
/** An imitated database: claim returns `rows`; finish is recorded. */
function fakeDb(rows, { claimError = null, finishError = null } = {}) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === 'claim_parent_notices') return claimError ? { data: null, error: { message: claimError } } : { data: rows, error: null };
    if (name === 'finish_parent_notices') return finishError ? { data: null, error: { message: finishError } } : { data: null, error: null };
    return { data: null, error: { message: 'unknown' } };
  };
  return { rpc, calls, finish: () => calls.find((c) => c.name === 'finish_parent_notices')?.args };
}
const quiet = () => {};
const noLink = async () => null;
{
  const logs = [];
  const db = fakeDb([row({ notice_id: 1 }), row({ notice_id: 2, language: 'hi', kind: 'out' })]);
  const result = await runNotices(db.rpc, null, noLink, (...parts) => logs.push(parts.join(' ')));
  check('dry run: every row is finished as skipped', result.dryRun === true && JSON.stringify(db.finish().p_skipped) === '[1,2]'
    && db.finish().p_sent.length === 0, JSON.stringify(db.finish()));
  check('dry run: logs "would send" with id, kind and language only', logs.includes('would send 1 in en') && logs.includes('would send 2 out hi'), logs.join(' | '));
  check('logs never hold an address or a name', !logs.join(' ').includes('@') && !logs.join(' ').includes('Arjun'));
  check('claims 50 rows at a time', db.calls[0].args.p_limit === 50);
}
{
  const db = fakeDb([]);
  const result = await runNotices(db.rpc, null, noLink, quiet);
  check('nothing claimed: nothing finished', result.claimed === 0 && !db.finish());
}
{
  const brevo = fakeFetch([201, 400, 503]);
  const db = fakeDb([row({ notice_id: 1 }), row({ notice_id: 2 }), row({ notice_id: 3 })]);
  const result = await runNotices(db.rpc, brevoMailer(brevo.fn, 'k', { email: 'a@b.c', name: 'n' }, null), noLink, quiet);
  const f = db.finish();
  check('each row gets its own outcome: sent, refused, retry', JSON.stringify(f.p_sent) === '[1]' && f.p_refused['2'] === 'brevo_400'
    && JSON.stringify(f.p_retry) === '[3]' && f.p_claim === 'c1', JSON.stringify(f));
  check('the summary counts them', result.sent === 1 && result.refused === 1 && result.retry === 1 && result.codes.brevo_503 === 1, JSON.stringify(result));
}
{
  const brevo = fakeFetch([401]);
  const db = fakeDb([row({ notice_id: 1 }), row({ notice_id: 2 }), row({ notice_id: 3 })]);
  await runNotices(db.rpc, brevoMailer(brevo.fn, 'k', { email: 'a@b.c', name: 'n' }, null), noLink, quiet);
  check('a wrong key stops the run after one call; all rows wait for a retry', brevo.calls.length === 1
    && JSON.stringify(db.finish().p_retry) === '[1,2,3]', JSON.stringify(db.finish()));
}
{
  const db = fakeDb([], { claimError: 'function claim_parent_notices() does not exist' });
  const result = await runNotices(db.rpc, null, noLink, quiet);
  check('before 0043 runs: claim_failed, nothing else', result.error === 'claim_failed' && db.calls.length === 1);
  const db2 = fakeDb([row()], { finishError: 'boom' });
  check('a failed finish is reported', (await runNotices(db2.rpc, null, noLink, quiet)).error === 'finish_failed');
}

// ---------------------------------------------------------------- the weekly email (0058, #530-#539)
const week = (over = {}) => ({
  week_start: '2026-10-19', week_end: '2026-10-25', centre: 'Abids', level: 1, level_name: 'Beginner',
  visits: [{ on: '2026-10-20', in: '17:02', out: '18:30' }, { on: '2026-10-23', in: '17:10', out: null }],
  practice: { minutes: 75, days: 4, days_met: 4, goal_days: 4, goal_minutes: 15 },
  ticks: ['Dha Ge Na Ti'], ticks_count: 1,
  level_change: null,
  next_event: { title: 'Kartik Deepotsav', on: '2026-10-28', at: '18:00', centre: 'Abids' },
  ...over,
});
const digest = (over = {}, content = {}) => ({
  claim: 'c9', digest_id: 7, guardian_id: GUARDIAN, email: 'parent@example.com', language: 'en',
  student_name: 'Arjun Rao', contact: '98480 00000', content: week(content), ...over,
});
{
  const mail = buildDigestEmail(digest());
  check('digest: the subject names the child and the week, days first', mail.subject === 'Arjun Rao\'s week at Mridanga Seva, 19-10-2026 to 25-10-2026', mail.subject);
  check('digest: opens with Hare Krishna and the week', mail.text.startsWith('Hare Krishna,\n\nHere is Arjun Rao\'s week at the Mridanga Seva class, 19-10-2026 to 25-10-2026.'));
  check('digest: each visit with its weekday, day and times; an open visit says no check-out was recorded',
    mail.text.includes('At class: 2 visits.') && mail.text.includes('• Tue 20-10: 17:02 to 18:30')
    && mail.text.includes('• Fri 23-10: from 17:10 (no check-out recorded)'), mail.text);
  check('digest: practice against the goal, and praise when it is reached',
    mail.text.includes('75 minutes on 4 of 7 days. The goal is 4 days of 15 minutes; reached on 4.') && mail.text.includes('Well done!'));
  check('digest: the newly ticked item and the next event with its centre',
    mail.text.includes('Newly learnt: Dha Ge Na Ti.') && mail.text.includes('Coming up: Kartik Deepotsav, 28-10-2026 at 18:00, Abids.'));
  check('digest: says why it comes, never a location, photo or another child; contact; how to stop',
    mail.text.includes('because you agreed to it') && mail.text.includes('never includes your child\'s location or photo, or anything about another child')
    && mail.text.includes('Questions: 98480 00000') && mail.text.includes('To stop these weekly emails'));
  const quietWeek = buildDigestEmail(digest({}, { visits: [], practice: { minutes: 0, days: 0, days_met: 0, goal_days: 4, goal_minutes: 15 },
    ticks: [], ticks_count: 0, next_event: null }));
  check('digest: a quiet week is said kindly (missed at class, a word on daily practice), with no empty lines',
    quietWeek.text.includes('we missed Arjun Rao this week') && quietWeek.text.includes('A few minutes every day')
    && !quietWeek.text.includes('Newly learnt') && !quietWeek.text.includes('Coming up') && !quietWeek.text.includes('\n\n\n'), quietWeek.text);
  const short = buildDigestEmail(digest({}, { practice: { minutes: 30, days: 2, days_met: 1, goal_days: 4, goal_minutes: 15 } }));
  check('digest: no praise before the goal is reached', !short.text.includes('Well done'));
  const up = buildDigestEmail(digest({}, { level_change: { from: 1, from_name: 'Beginner', to: 2, to_name: 'Intermediate' },
    ticks: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], ticks_count: 10 }));
  check('digest: a level up is congratulated; more ticks than listed are counted',
    up.text.includes('Arjun Rao has moved up to the Intermediate level. Congratulations!') && up.text.includes('G, H, and 2 more.'), up.text);
  const te = buildDigestEmail(digest({ language: 'te' }, { level_change: { from: 1, from_name: 'Beginner', to: 2, to_name: 'Intermediate' } }));
  const hi = buildDigestEmail(digest({ language: 'hi' }));
  check('digest: Telugu: greeting, weekdays and the level in Telugu', te.text.includes('హరే కృష్ణ') && te.text.includes('మంగళ 20-10')
    && te.text.includes('మధ్యమ') && te.text.includes('Arjun Rao'), te.subject);
  check('digest: Hindi: greeting and weekdays in Hindi', hi.text.includes('हरे कृष्ण') && hi.text.includes('मंगल 20-10') && hi.text.includes('17:02'), hi.subject);
  const odd = buildDigestEmail(digest({ student_name: 'A <b>\r\nBcc: x@y' }, { ticks: ['<i>{name}</i>'], next_event: { title: '{from}', on: '2026-10-28', at: '18:00', centre: null } }));
  check('digest: a name cannot break the subject, HTML is escaped, a value is never a placeholder',
    !/[\r\n]/.test(odd.subject) && odd.html.includes('&lt;i&gt;{name}&lt;/i&gt;') && odd.text.includes('Coming up: {from}, 28-10-2026 at 18:00.'), odd.text);
  const all = [mail, quietWeek, te, hi].map((m) => m.text + m.html).join(' ');
  check('digest: no email holds a location, distance or photo word', !/(lat|lng|longitude|latitude|distance|metre|photo_path|\.jpg)/i.test(
    all.replace(/location or photo|స్థానం, ఫోటో|स्थान, फ़ोटो/g, '')));
}
{
  const secret = 'x'.repeat(64);
  const noticeLink = new URL(await stopUrl('https://abc.supabase.co/functions/v1/notify-parents', secret, GUARDIAN)).searchParams.get('stop');
  const digestLink = new URL(await stopUrl('https://abc.supabase.co/functions/v1/notify-parents', secret, GUARDIAN, 'digest')).searchParams.get('stop_digest');
  check('digest unsubscribe: its own parameter and a correctly signed value is accepted', (await checkStop(secret, digestLink, 'digest')) === GUARDIAN);
  check('digest unsubscribe: a check-out email\'s link cannot stop the weekly email, nor the other way round',
    (await checkStop(secret, noticeLink, 'digest')) === null && (await checkStop(secret, digestLink, 'notice')) === null && (await checkStop(secret, digestLink)) === null);
}
{
  const brevo = fakeFetch([201]);
  await brevoMailer(brevo.fn, 'k', { email: 'a@b.c', name: 'n' }, null, 'parent-digest')('p@x.y', buildDigestEmail(digest()), 'https://l');
  check('digest: tagged parent-digest in Brevo', JSON.stringify(brevo.calls[0].body.tags) === '["parent-digest"]');
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    return name === 'claim_parent_digests' ? { data: [digest({ digest_id: 1 }), digest({ digest_id: 2, language: 'te' })], error: null } : { data: null, error: null };
  };
  const logs = [];
  const dry = await runDigests(rpc, null, noLink, (...parts) => logs.push(parts.join(' ')));
  const finish = calls.find((c) => c.name === 'finish_parent_digests').args;
  check('digest dry run: every row skipped, logs ids and languages only, 10 a run', dry.skipped === 2 && JSON.stringify(finish.p_skipped) === '[1,2]'
    && logs.includes('would send digest 2 te') && !logs.join(' ').includes('@') && !logs.join(' ').includes('Arjun')
    && calls[0].args.p_limit === DIGEST_CLAIM_LIMIT && DIGEST_CLAIM_LIMIT === 10, logs.join(' | '));
  const sentTo = [];
  const real = await runDigests(rpc, async (to, email, link) => { sentTo.push([to, link]); return { status: 'sent' }; },
    async (id) => `https://l/?stop_digest=${id}`, quiet);
  check('digest real run: each email with its unsubscribe link', real.sent === 2 && sentTo[0][1] === `https://l/?stop_digest=${GUARDIAN}`);
}
{
  const data = { enabled: false, student_name: 'Arjun Rao', app_language: 'hi', contact: '', content: week(),
    guardians: [{ guardian_id: 'g1', block: null, language: 'te' }, { guardian_id: 'g2', block: 'no_digest_consent', language: null }] };
  const p = buildDigestPreview(data, null);
  check('preview: each guardian\'s language (else the child\'s app language) and the email in each',
    p.guardians[0].language === 'te' && p.guardians[1].language === 'hi' && !!p.emails.te && !!p.emails.hi && !p.emails.en && p.enabled === false);
  check('preview: exactly the email that is sent', p.emails.te.text === buildDigestEmail({ ...digest({ language: 'te', contact: '' }) }).text);
  check('preview: one language on request', Object.keys(buildDigestPreview(data, 'en').emails).join() === 'en');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll parent-notice checks passed');
process.exit(failures ? 1 : 0);
