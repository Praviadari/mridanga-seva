// Checks the message-building part of the notify-announcements Edge Function
// (supabase/functions/notify-announcements/messages.ts) with plain Node, which reads TypeScript
// files by itself from version 23.6. The sending part (Deno, Expo's service) can only be tried
// on a real project and phone: docs/OPERATIONS.md "Push notifications".
//
//   cd supabase/tests && npm run test:push

import {
  BATCH_SIZE,
  BODY_LENGTH,
  CHANNEL_ID,
  batches,
  screenFor,
  shortBody,
  toMessages,
  unregisteredTokens,
} from '../functions/notify-announcements/messages.ts';

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

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
