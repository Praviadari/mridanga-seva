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
  toOutboxMessages,
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

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
