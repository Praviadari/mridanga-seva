// Unit tests for the second round of UI audit fixes (UI_AUDIT_14-10-2026 fixes 5, 6, 8, 9; docs/DECISIONS.md #365
// onwards, Praveen 14-10-2026 "do remaining too to build world class"): light list rows.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

/** The props of the first `<Tag` in a source text, up to its closing `/>`. */
function element(text, tag) {
  const start = text.indexOf(`<${tag}`);
  assert.ok(start >= 0, `<${tag} not found`);
  return text.slice(start, text.indexOf('/>', start));
}

// ---------------------------------------------------------------- #365 light list rows

test('Students, Follow-ups and Newcomers rows: the name and one line; the rest is on the profile or call screen', () => {
  const students = element(src('app/staff/(tabs)/students.tsx'), 'ListRow');
  assert.match(students, /details=\{\[lastVisitText\(t, student\)\]\}/);
  assert.match(students, /status: student\.status === 'active' \? undefined : student\.status/);
  assert.doesNotMatch(students, /rollNo|students\.mentor/);

  const followUp = element(src('app/staff/(tabs)/follow-up.tsx'), 'ListRow');
  assert.match(followUp, /details=\{\[entry\.task \? taskText\(entry\) : lastVisitText\(t, entry\.student\)\]\}/);
  assert.match(followUp, /chips=\{\{ status: entry\.student\.status \}\}/);
  assert.doesNotMatch(followUp, /rollNo/);

  const joiners = element(src('screens/coordinator-home.tsx').slice(src('screens/coordinator-home.tsx').indexOf('function NewJoinersList')), 'ListRow');
  assert.doesNotMatch(joiners, /rollNo|chips=/);
  assert.match(joiners, /details=\{\[t\('home\.staff\.joinedVisits'/);
});

test('announcement cards: one short meta line; "New" never on your own post; the rest on the announcement', () => {
  const staff = src('app/staff/(tabs)/announcements.tsx');
  const card = element(staff, 'AnnouncementCard');
  assert.match(card, /unread=\{!byMe && !a\.readByMe\}/);
  for (const moved of ['noLoginCount', 'postedBy', 'audienceName', 'files.count', 'announcements.edited']) {
    assert.ok(!card.includes(moved), `${moved} left the staff card`);
  }
  assert.match(card, /details=\{\[\n\s+\[/, 'one joined line');
  const detail = src('app/staff/announcements/[id].tsx');
  for (const kept of ['noLoginNote', 'postedBy', 'audienceName', 'announcements.edited']) assert.ok(detail.includes(kept), `${kept} on the detail`);

  const student = element(src('app/student/(tabs)/announcements.tsx'), 'AnnouncementCard');
  assert.ok(!student.includes('files.count') && !student.includes('audienceName') && !student.includes('announcements.edited'));
  assert.match(student, /\[formatDateTime\(a\.publishAt\), \.\.\.authorLine\(/);
});
