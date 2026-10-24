// Checks the message-building part of the notify-announcements Edge Function
// (supabase/functions/notify-announcements/messages.ts) with plain Node, which reads TypeScript
// files by itself from version 23.6, and its sending part (send.ts) against an imitated Expo. The
// queue's SQL with send.ts is checked in smoke-test.mjs; Expo and a real phone only on a project:
// docs/OPERATIONS.md "Push notifications".
//
//   cd supabase/tests && npm run test:push

import {
  BATCH_SIZE,
  BODY_LENGTH,
  CHANNEL_ID,
  batches,
  screenFor,
  pickServiceKey,
  shortBody,
  toMessages,
  toOutboxMessages,
  unregisteredTokens,
} from '../functions/notify-announcements/messages.ts';
import { expoPost, runPush, sendAll, toItems } from '../functions/notify-announcements/send.ts';
import { resultOf, runWebPush, toWebItems, webPost } from '../functions/notify-announcements/web-send.ts';
import { encryptFor, fromBase64Url, toBase64Url, vapidFrom, vapidHeader } from '../functions/notify-announcements/webpush.ts';

let failures = 0;

/** Prints PASS or FAIL for one check. */
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

check('staff open the staff screen of the announcement', screenFor('coordinator', 7) === '/staff/announcements/7'
  && screenFor('guru', 7) === '/staff/announcements/7');
check('students open their own screen', screenFor('student', 7) === '/student/announcements/7');

check('a short text is kept, on one line', shortBody('Meet at\n16:00.  ') === 'Meet at 16:00.', shortBody('Meet at\n16:00.  '));
const long = shortBody('a'.repeat(300));
check('a long text is cut with "…"', long.length === BODY_LENGTH && long.endsWith('…'), String(long.length));

const [message] = toMessages([{ announcement_id: 3, title: 'Kirtan', body: 'Sunday 17:00', token: 'ExponentPushToken[x]', role: 'student' }]);
check('a message goes to the phone, with the title, text and screen to open',
  message.to === 'ExponentPushToken[x]' && message.title === 'Kirtan' && message.body === 'Sunday 17:00'
  && message.data.url === '/student/announcements/3' && message.data.announcementId === 3, JSON.stringify(message));
check('... on the announcements channel, high priority', message.channelId === CHANNEL_ID && CHANNEL_ID === 'announcements'
  && message.priority === 'high');

const split = batches(Array.from({ length: 250 }, (_, i) => i));
check('messages go in batches of at most 100', BATCH_SIZE === 100 && split.map((b) => b.length).join(',') === '100,100,50');
check('no messages means no batches', batches([]).length === 0);

const sent = toMessages(['A', 'B', 'C'].map((t) => ({ announcement_id: 1, title: 't', body: 'b', token: t, role: 'student' })));
const gone = unregisteredTokens(sent, [
  { status: 'ok', id: '1' },
  { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
  { status: 'error', message: 'bad key', details: { error: 'InvalidCredentials' } },
]);
check('only tokens Expo no longer knows are dropped', gone.join(',') === 'B', gone.join(','));

const outbox = toOutboxMessages([
  { outbox_id: 1, title: 'Ekatala', body: 'New assessment. Due 03-10-2026.', url: '/student/assessments/4', token: 'T1' },
  { outbox_id: 2, title: 'Ekatala', body: 'Arjun sent a recording.', url: '/staff/assessments/review/4', token: 'T2' },
  { outbox_id: 3, title: 'Odd', body: 'x', url: 'https://example.com', token: 'T3' },
]);
check('assessment notifications open their screen; any other address is dropped', outbox.length === 2
  && outbox[0].data.url === '/student/assessments/4' && outbox[1].data.url === '/staff/assessments/review/4'
  && outbox[0].channelId === CHANNEL_ID, JSON.stringify(outbox.map((m) => m.data.url)));
const promotionOutbox = toOutboxMessages([
  { outbox_id: 4, title: 'Meera Iyer', body: 'Please give your feedback.', url: '/staff/promotion/7', token: 'T4' },
  { outbox_id: 5, title: 'Mridanga Seva', body: 'Congratulations!', url: '/student/progress', token: 'T5' },
  { outbox_id: 6, title: 'Odd', body: 'x', url: '/student/progress/7', token: 'T6' },
  { outbox_id: 7, title: 'Odd', body: 'x', url: '/staff/promotion/', token: 'T7' },
]);
check('promotion notifications open the nomination or My progress; near misses are dropped',
  promotionOutbox.map((m) => m.data.url).join(',') === '/staff/promotion/7,/student/progress',
  JSON.stringify(promotionOutbox.map((m) => m.data.url)));
const eventOutbox = toOutboxMessages([
  { outbox_id: 8, title: 'Kirtan', body: 'New event.', url: '/student/events/3', token: 'T8' },
  { outbox_id: 9, title: 'Kirtan', body: 'New event.', url: '/staff/events/3', token: 'T9' },
  { outbox_id: 10, title: 'Which day?', body: 'New poll.', url: '/student/polls/2', token: 'T10' },
  { outbox_id: 11, title: 'Which day?', body: 'New poll.', url: '/staff/polls/2', token: 'T11' },
  { outbox_id: 12, title: 'Odd', body: 'x', url: '/student/events/new', token: 'T12' },
  { outbox_id: 13, title: 'Odd', body: 'x', url: '/student/polls/2/x', token: 'T13' },
]);
check('event and poll notifications (0022) open their screen; near misses are dropped',
  eventOutbox.map((m) => m.data.url).join(',') === '/student/events/3,/staff/events/3,/student/polls/2,/staff/polls/2',
  JSON.stringify(eventOutbox.map((m) => m.data.url)));
const teamOutbox = toOutboxMessages([
  { outbox_id: 14, title: 'Kaherva slow', body: 'Ravi suggested a lesson material.', url: '/staff/suggestions', token: 'T8' },
  { outbox_id: 15, title: 'Abids · 10-10-2026', body: 'You are on duty tomorrow: 14:30-17:00', url: '/staff/duty', token: 'T9' },
  { outbox_id: 16, title: 'Balaram blue 3', body: 'Marked damaged: head torn', url: '/staff/inventory/3', token: 'T10' },
  { outbox_id: 17, title: 'Odd', body: 'x', url: '/staff/inventory/', token: 'T11' },
  { outbox_id: 18, title: 'Odd', body: 'x', url: '/student/duty', token: 'T12' },
]);
check('team-tools notifications open suggestions, the duty roster or the item; near misses are dropped',
  teamOutbox.map((m) => m.data.url).join(',') === '/staff/suggestions,/staff/duty,/staff/inventory/3',
  JSON.stringify(teamOutbox.map((m) => m.data.url)));

// 0059 (#550): a data request for the Guru, an answer for the person; near misses are dropped.
const rightsOutbox = toOutboxMessages([
  { outbox_id: 31, title: 'DR-0001', body: 'New data request DR-0001: answer by 22-11-2026.', url: '/staff/data-requests', token: 'T21' },
  { outbox_id: 32, title: 'DR-0001', body: 'Your data request DR-0001 has been answered.', url: '/student/my-data', token: 'T22' },
  { outbox_id: 33, title: 'DR-0002', body: 'Your data request DR-0002 has been answered.', url: '/staff/my-data', token: 'T23' },
  { outbox_id: 34, title: 'Odd', body: 'x', url: '/student/data-requests', token: 'T24' },
  { outbox_id: 35, title: 'Odd', body: 'x', url: '/staff/data-requests/1', token: 'T25' },
]);
check('data-request notices open Data requests (staff) or My data and rights; near misses are dropped',
  rightsOutbox.map((m) => m.data.url).join(',') === '/staff/data-requests,/student/my-data,/staff/my-data',
  JSON.stringify(rightsOutbox.map((m) => m.data.url)));

const fundOutbox = toOutboxMessages([
  { outbox_id: 19, title: 'Rs 2500 · Prasadam', body: 'An entry by Ravi needs your approval.', url: '/staff/fund/7', token: 'T13' },
  { outbox_id: 20, title: 'Odd', body: 'x', url: '/student/fund/7', token: 'T14' },
  { outbox_id: 21, title: 'Odd', body: 'x', url: '/staff/fund/', token: 'T15' },
]);
check('fund notifications (0026) open the entry; near misses are dropped',
  fundOutbox.map((m) => m.data.url).join(',') === '/staff/fund/7', JSON.stringify(fundOutbox.map((m) => m.data.url)));

// ---------------------------------------------------------------- sending (send.ts, 0031, audit brief 11)
// Expo is imitated: it refuses a request holding tokens of two projects (PUSH_TOO_MANY_EXPERIENCE_IDS),
// refuses a request holding a message it finds invalid (400), and answers one ticket per message.
const ours = (n) => `ExponentPushToken[ours${n}]`;
const FOREIGN = 'ExponentPushToken[foreignApp1]';
const INVALID = 'ExponentPushToken[invalid1]';
function fakeExpo({ gone = [], ticketErrors = {}, down = false } = {}) {
  const requests = [];
  const delivered = [];
  const post = async (messages) => {
    requests.push(messages.length);
    if (down) return { kind: 'failed', reason: 'http_503' };
    const tokens = messages.map((m) => m.to);
    const foreign = tokens.filter((t) => t === FOREIGN);
    if (foreign.length > 0 && foreign.length < tokens.length) {
      return { kind: 'refused', status: 400, code: 'PUSH_TOO_MANY_EXPERIENCE_IDS',
        details: { '@mridanga-seva/mridanga-seva': tokens.filter((t) => t !== FOREIGN), '@someone/other-app': foreign } };
    }
    if (tokens.includes(INVALID)) return { kind: 'refused', status: 400, code: 'VALIDATION_ERROR' };
    const tickets = messages.map((m) => {
      if (gone.includes(m.to)) return { status: 'error', details: { error: 'DeviceNotRegistered' } };
      if (ticketErrors[m.to]) return { status: 'error', details: { error: ticketErrors[m.to] } };
      delivered.push(m.to);
      return { status: 'ok', id: 'x' };
    });
    return { kind: 'ok', tickets };
  };
  return { post, requests, delivered };
}
const itemsFor = (tokens) => tokens.map((to, i) => ({ id: i + 1, message: { ...message, to } }));

const many = itemsFor([...Array.from({ length: 150 }, (_, i) => ours(i)), FOREIGN, ...Array.from({ length: 49 }, (_, i) => ours(150 + i))]);
const e1 = fakeExpo();
const r1 = await sendAll(many, e1.post);
check('D2-01: a foreign token in a batch no longer blocks it: the other 199 are delivered',
  r1.sent.length === 199 && e1.delivered.length === 199 && new Set(e1.delivered).size === 199, JSON.stringify({ sent: r1.sent.length, requests: e1.requests }));
check('... the foreign token is refused as OtherProject and never sent', r1.refused['151'] === 'OtherProject'
  && !e1.delivered.includes(FOREIGN) && Object.keys(r1.refused).length === 1 && r1.retry.length === 0, JSON.stringify(r1.refused));
check('... no request holds more than 100 messages', e1.requests.every((n) => n <= 100) && e1.requests[0] === 100, e1.requests.join(','));

const e2 = fakeExpo();
const r2 = await sendAll(itemsFor([ours(1), ours(2), INVALID, ours(3), ours(4), ours(5)]), e2.post);
check('a message Expo refuses is found by halving the request; the others are delivered once',
  r2.sent.length === 5 && e2.delivered.length === 5 && r2.refused['3'] === 'VALIDATION_ERROR' && r2.retry.length === 0,
  JSON.stringify({ r2, requests: e2.requests }));

const e3 = fakeExpo({ gone: [ours(2)], ticketErrors: { [ours(3)]: 'MessageRateExceeded', [ours(4)]: 'InvalidCredentials', [ours(5)]: 'MessageTooBig' } });
const r3 = await sendAll(itemsFor([ours(1), ours(2), ours(3), ours(4), ours(5)]), e3.post);
check('ticket errors: DeviceNotRegistered and MessageTooBig refused, the others tried again later (D2-03)',
  r3.sent.join(',') === '1' && r3.refused['2'] === 'DeviceNotRegistered' && r3.refused['5'] === 'MessageTooBig'
  && r3.retry.join(',') === '3,4', JSON.stringify(r3));
check('... error codes are counted', r3.errors.DeviceNotRegistered === 1 && r3.errors.InvalidCredentials === 1, JSON.stringify(r3.errors));

const e4 = fakeExpo({ down: true });
const r4 = await sendAll(itemsFor([ours(1), ours(2)]), e4.post);
check('Expo down: everything is tried again later, nothing refused', r4.retry.join(',') === '1,2'
  && r4.sent.length === 0 && Object.keys(r4.refused).length === 0 && r4.failedRequests === 1);

const { items: built, dropped } = toItems([
  { claim: 'c', message_id: 7, announcement_id: 3, title: 'Kirtan', body: 'Sunday 17:00', token: 'T', role: 'student', url: null },
  { claim: 'c', message_id: 8, announcement_id: null, title: 'Kirtan', body: 'New event.', token: 'T', role: null, url: '/staff/events/3' },
  { claim: 'c', message_id: 9, announcement_id: null, title: 'Odd', body: 'x', token: 'T', role: null, url: 'https://example.com' },
]);
check('queue rows keep the message shapes: announcement screen + id, notice screen; a bad screen is dropped',
  built.length === 2 && JSON.stringify(built[0].message) === JSON.stringify(toMessages([{ announcement_id: 3, title: 'Kirtan', body: 'Sunday 17:00', token: 'T', role: 'student' }])[0])
  && built[1].message.data.url === '/staff/events/3' && built[1].message.data.announcementId === undefined
  && dropped.join(',') === '9', JSON.stringify(built));

// expoPost reads Expo's HTTP answer; fetch is imitated.
const answer = (status, body) => async () => new Response(JSON.stringify(body), { status });
const headers = { 'Content-Type': 'application/json' };
const ok = await expoPost(answer(200, { data: [{ status: 'ok', id: 'a' }] }), headers)([message]);
check('expoPost: 200 gives the tickets', ok.kind === 'ok' && ok.tickets.length === 1);
const refused = await expoPost(answer(400, { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'x', details: { a: ['t'] } }] }), headers)([message]);
check('expoPost: 400 gives Expo\'s error code and details', refused.kind === 'refused' && refused.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS'
  && refused.details.a[0] === 't');
check('expoPost: 429 and 5xx are tried again later', (await expoPost(answer(429, {}), headers)([message])).kind === 'failed'
  && (await expoPost(answer(502, {}), headers)([message])).kind === 'failed');
const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
const keepAlive = setTimeout(() => {}, 5000); // AbortSignal.timeout's timer alone does not keep Node running
const slow = await expoPost(hang, headers, 50)([message]);
clearTimeout(keepAlive);
check('expoPost: no answer within the time limit = failed (timeout), tried again later', slow.kind === 'failed' && slow.reason === 'timeout', JSON.stringify(slow));
const offline = await expoPost(async () => { throw new TypeError('fetch failed'); }, headers)([message]);
check('expoPost: no connection = failed', offline.kind === 'failed' && offline.reason === 'no_answer');

// runPush logs counts only: never a token or a title (D2-12).
const logged = [];
const realError = console.error;
console.error = (...args) => logged.push(args.join(' '));
const finishes = [];
const fakeRpc = async (name, args) => name === 'claim_push_queue'
  ? { data: [{ claim: 'k', message_id: 1, announcement_id: 3, title: 'Secret title', body: 'b', token: ours(1), role: 'student', url: null },
             { claim: 'k', message_id: 2, announcement_id: 3, title: 'Secret title', body: 'b', token: FOREIGN, role: 'student', url: null }], error: null }
  : (finishes.push(args), { data: null, error: null });
const summary = await runPush(fakeRpc, fakeExpo().post);
console.error = realError;
check('runPush finishes the claim with each row\'s outcome', finishes.length === 1 && finishes[0].p_claim === 'k'
  && finishes[0].p_sent.join(',') === '1' && finishes[0].p_refused['2'] === 'OtherProject' && summary.sent === 1, JSON.stringify(finishes));
check('... and its log holds no token and no title', logged.length > 0 && logged.every((line) => !line.includes('PushToken') && !line.includes('Secret')),
  logged.join(' | '));
// D2-14: an emoji at the cut point is kept or dropped whole, never split into a lone half.
const emojiCut = shortBody('a'.repeat(BODY_LENGTH - 2) + '🙏🙏🙏');
check('D2-14 an emoji at the cut is not split into a broken character',
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(emojiCut) && emojiCut.endsWith('🙏…'), JSON.stringify(emojiCut));
check('D2-14 Telugu text is cut by letters, 150 at most', Array.from(shortBody('క'.repeat(200))).length === BODY_LENGTH);

// D2-16: only a JSON object of texts is read; anything else falls back to the older variable.
const keyOf = (keys, legacy) => pickServiceKey(keys, legacy);
check('D2-16 the "default" secret key is used and named by its variable',
  JSON.stringify(keyOf('{"other":"sb_secret_b","default":"sb_secret_a"}', 'legacy')) === '{"key":"sb_secret_a","source":"SUPABASE_SECRET_KEYS.default"}');
check('D2-16 without "default", the first text value is used', keyOf('{"x":7,"y":"sb_secret_y"}', undefined)?.key === 'sb_secret_y');
check('D2-16 a JSON string is not taken letter by letter (falls back)', keyOf('"sb_secret_a"', 'legacy')?.source === 'SUPABASE_SERVICE_ROLE_KEY');
check('D2-16 an array, raw text or empty object falls back', keyOf('["sb_secret_a"]', 'legacy')?.key === 'legacy'
  && keyOf('sb_secret_a', 'legacy')?.key === 'legacy' && keyOf('{}', 'legacy')?.key === 'legacy');
check('D2-16 nothing usable at all = null (not_configured)', keyOf('{"default":""}', undefined) === null && keyOf(undefined, undefined) === null);

// ---------------------------------------------------------------- web push (0062, #599-#602)
// The encryption is checked by decrypting with http_ece, the reference implementation of RFC 8188/8291 by their
// author (not this repository's code), as a browser would; the VAPID token with Node's own ECDSA verify.
{
  const ece = (await import('http_ece')).default;
  const { createECDH, createPublicKey, randomBytes, verify } = await import('node:crypto');
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const authSecret = randomBytes(16);
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def',
    p256dh: browser.getPublicKey().toString('base64url'),
    auth: authSecret.toString('base64url'),
  };
  const text = JSON.stringify({ title: 'కీర్తన', body: 'Sunday 17:00 🙏', url: '/student/announcements/7', tag: 'announcement-7' });
  const sealed = await encryptFor(subscription, new TextEncoder().encode(text));
  const opened = ece.decrypt(Buffer.from(sealed), { version: 'aes128gcm', privateKey: browser, authSecret: subscription.auth });
  check('web push: http_ece (the RFC author\'s code) decrypts the message as the browser would', opened.toString('utf8') === text, opened.toString('utf8'));
  check('web push: the header carries the record size 4096 and a 65-byte sender key', new DataView(sealed.buffer).getUint32(16) === 4096
    && sealed[20] === 65 && sealed[21] === 4);
  const again = await encryptFor(subscription, new TextEncoder().encode(text));
  check('web push: each message has a new salt and key (two copies differ)', toBase64Url(again.slice(0, 86)) !== toBase64Url(sealed.slice(0, 86)));
  let wrongKey = '';
  try {
    const other = createECDH('prime256v1');
    other.generateKeys();
    ece.decrypt(Buffer.from(sealed), { version: 'aes128gcm', privateKey: other, authSecret: subscription.auth });
  } catch (e) {
    wrongKey = String(e.message);
  }
  check('web push: another browser\'s key cannot decrypt it', wrongKey !== '');
  let refusedKeys = 0;
  for (const bad of [{ ...subscription, p256dh: 'AAAA' }, { ...subscription, auth: 'AAAA' }]) {
    try {
      await encryptFor(bad, new Uint8Array(1));
    } catch {
      refusedKeys++;
    }
  }
  check('web push: keys of the wrong length are refused before any sending', refusedKeys === 2);
  check('web push: base64url both ways', toBase64Url(fromBase64Url('_-8A')) === '_-8A' && fromBase64Url('AQ==').length === 1);

  // VAPID: a pair as app/scripts/web-push-keys.mjs makes it.
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const vapid = await vapidFrom(publicKey, d, 'mailto:privacy@mridangaseva.com');
  const header = await vapidHeader(vapid, subscription.endpoint, 1_800_000_000);
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header) ?? [];
  const [h, c, s] = (token ?? '').split('.');
  const claims = JSON.parse(Buffer.from(c ?? '', 'base64url').toString());
  check('web push: the VAPID header names the push service\'s origin, 12 hours, the subject and the public key',
    k === publicKey && claims.aud === 'https://fcm.googleapis.com' && claims.exp === 1_800_000_000 + 43200
      && claims.sub === 'mailto:privacy@mridangaseva.com' && JSON.parse(Buffer.from(h, 'base64url').toString()).alg === 'ES256', header);
  const jwk = { kty: 'EC', crv: 'P-256', x: Buffer.from(fromBase64Url(publicKey).slice(1, 33)).toString('base64url'),
    y: Buffer.from(fromBase64Url(publicKey).slice(33)).toString('base64url') };
  check('web push: the token\'s ES256 signature verifies with the public key (Node\'s own ECDSA)',
    verify('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  let refusedVapid = 0;
  for (const [pub, priv, sub] of [[publicKey.slice(2), d, 'mailto:a@b.c'], [publicKey, 'AAAA', 'mailto:a@b.c'], [publicKey, d, 'a@b.c']]) {
    try {
      await vapidFrom(pub, priv, sub);
    } catch {
      refusedVapid++;
    }
  }
  check('web push: a short public key, a short private key or a subject without mailto:/https: is refused', refusedVapid === 3);

  // The answers of push services.
  const kinds = [201, 202, 404, 410, 413, 401, 403, 429, 503, 400].map((status) => resultOf(status));
  check('web push: 2xx sent; 404/410 gone (address deleted); 413 too big; 401/403 VAPID refused and 429/5xx tried again; other 4xx refused',
    JSON.stringify(kinds) === JSON.stringify([{ kind: 'sent' }, { kind: 'sent' }, { kind: 'refused', code: 'endpoint_gone' },
      { kind: 'refused', code: 'endpoint_gone' }, { kind: 'refused', code: 'MessageTooBig' }, { kind: 'retry', code: 'vapid_refused' },
      { kind: 'retry', code: 'vapid_refused' }, { kind: 'retry', code: 'http_429' }, { kind: 'retry', code: 'http_503' },
      { kind: 'refused', code: 'http_400' }]), JSON.stringify(kinds));

  // The payloads: the same screens as the phone's, nothing more.
  const webRow = (over) => ({ claim: 'w', message_id: 1, announcement_id: null, title: 'T', body: 'B', endpoint: subscription.endpoint,
    p256dh: subscription.p256dh, auth_secret: subscription.auth, role: null, url: null, ...over });
  const { items: webItems, dropped: webDropped } = toWebItems([
    webRow({ message_id: 1, announcement_id: 7, role: 'student', body: 'x'.repeat(300) }),
    webRow({ message_id: 2, announcement_id: 8, role: 'coordinator' }),
    webRow({ message_id: 3, url: '/student/assessments/12' }),
    webRow({ message_id: 4, url: 'https://evil.example/' }),
    webRow({ message_id: 5, url: '/staff/students/9' }),
  ]);
  check('web push: an announcement opens the student\'s or the staff screen, text cut like the phone\'s',
    webItems[0].payload.url === '/student/announcements/7' && webItems[0].payload.body.length === BODY_LENGTH
      && webItems[1].payload.url === '/staff/announcements/8' && webItems[0].payload.tag === 'announcement-7');
  check('web push: a notice opens only a screen the phone may open; others are dropped (bad_url)',
    webItems.length === 3 && webItems[2].payload.url === '/student/assessments/12' && webDropped.join(',') === '4,5', webDropped.join(','));
  check('web push: the payload has only title, text, screen and tag', Object.keys(webItems[0].payload).sort().join(',') === 'body,tag,title,url');

  // webPost: what goes to the push service.
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: url.endsWith('gone') ? 410 : 201 });
  };
  const posted = await webPost(fakeFetch, vapid)({ id: 1, subscription, payload: webItems[0].payload });
  const sentHeaders = requests[0]?.init.headers ?? {};
  check('web push: one POST to the browser\'s address with aes128gcm, a TTL of a day and the VAPID header',
    posted.kind === 'sent' && requests[0].url === subscription.endpoint && requests[0].init.method === 'POST'
      && sentHeaders['Content-Encoding'] === 'aes128gcm' && sentHeaders.TTL === '86400' && sentHeaders.Authorization.startsWith('vapid t='),
    JSON.stringify(sentHeaders));
  const sentBody = ece.decrypt(Buffer.from(requests[0].init.body), { version: 'aes128gcm', privateKey: browser, authSecret: subscription.auth });
  check('web push: ... whose body the browser decrypts to the payload', JSON.parse(sentBody.toString()).url === '/student/announcements/7');
  const failed = await webPost(async () => { throw new TypeError('fetch failed'); }, vapid)({ id: 1, subscription, payload: webItems[0].payload });
  check('web push: no answer = tried again later', failed.kind === 'retry' && failed.code === 'no_answer');

  // runWebPush: claim, send, finish, with an imitated database.
  const webFinishes = [];
  const webLogged = [];
  const realWebError = console.error;
  console.error = (...a) => webLogged.push(a.join(' '));
  const webRpc = async (name, args) => name === 'claim_web_push'
    ? { data: [webRow({ message_id: 11, announcement_id: 7, role: 'student', title: 'Secret title' }),
        webRow({ message_id: 12, announcement_id: 7, role: 'student', endpoint: 'https://push.example/gone', title: 'Secret title' }),
        webRow({ message_id: 13, url: '/nowhere' })], error: null }
    : (webFinishes.push(args), { data: null, error: null });
  const webSummary = await runWebPush(webRpc, webPost(fakeFetch, vapid));
  console.error = realWebError;
  check('web push: runWebPush finishes the claim with each row\'s outcome', webFinishes.length === 1 && webFinishes[0].p_claim === 'w'
    && webFinishes[0].p_sent.join(',') === '11' && webFinishes[0].p_refused['12'] === 'endpoint_gone' && webFinishes[0].p_refused['13'] === 'bad_url'
    && webSummary.sent === 1 && webSummary.refused === 2, JSON.stringify(webFinishes));
  check('web push: ... and its log holds no address and no title', webLogged.length > 0
    && webLogged.every((line) => !line.includes('push.example') && !line.includes('fcm.') && !line.includes('Secret')), webLogged.join(' | '));
  const nothing = await runWebPush(async () => ({ data: [], error: null }), webPost(fakeFetch, vapid));
  check('web push: nothing waiting = no finish call', nothing.messages === 0);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
