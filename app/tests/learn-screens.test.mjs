// Unit tests for the learn screens (migration 0064, docs/DECISIONS.md #680-#689): an event's optional details on the
// form, a lesson's tabs (only the formats it has), the student's assessment statuses, the strings in all three
// languages, and the screens wired to the right pieces. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const events = await import('../src/data/events.ts');
const materials = await import('../src/data/materials.ts');
const assessments = await import('../src/data/assessments.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (json, key) => key.split('.').reduce((o, k) => o?.[k], json);

/** The form checked as on 01-12-2099, a month before the event. */
const NOW = Date.parse('2099-12-01T00:00:00Z');
const check = (form) => events.checkEventForm(form, NOW);
const filled = { ...events.EMPTY_EVENT_FORM, title: 'Ratha Yatra', date: '30-12-2099', time: '18:00', place: 'Abids', audience: 'all' };

test('#681: every event detail is optional; reporting is at or before the start, at most 12 hours before', () => {
  assert.deepEqual(check(filled), {});
  assert.deepEqual(check({ ...filled, reportingTime: '17:30' }), {});
  assert.deepEqual(check({ ...filled, reportingTime: '18:00' }), {});
  assert.equal(check({ ...filled, reportingTime: '18:15' }).reportingTime, 'events.errors.reporting_invalid');
  assert.equal(check({ ...filled, time: '23:00', reportingTime: '10:30' }).reportingTime, 'events.errors.reporting_invalid');
  assert.equal(check({ ...filled, reportingTime: 'soon' }).reportingTime, 'events.form.timeInvalid');
});

test('#681: the maps link is https without spaces; long texts are refused as the database does', () => {
  assert.equal(events.mapsLinkOk('https://maps.app.goo.gl/abc123'), true);
  assert.equal(events.mapsLinkOk('http://maps.example.com/x'), false);
  assert.equal(events.mapsLinkOk('https://maps example'), false);
  assert.equal(check({ ...filled, mapsUrl: 'maps.google.com' }).mapsUrl, 'events.errors.maps_link_invalid');
  assert.equal(check({ ...filled, dressCode: 'x'.repeat(201) }).dressCode, 'events.errors.dress_code_too_long');
  assert.equal(check({ ...filled, rehearsal: 'x'.repeat(201) }).rehearsal, 'events.errors.rehearsal_too_long');
  assert.equal(check({ ...filled, attendeeRole: 'x'.repeat(121) }).attendeeRole, 'events.errors.attendee_role_too_long');
});

test('#684: a lesson shows only the formats it has, video first; other materials have none', () => {
  const lesson = { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', audioPath: null, notes: null };
  assert.deepEqual(materials.lessonFormats(lesson), ['video']);
  assert.deepEqual(materials.lessonFormats({ ...lesson, audioPath: 'a/b.mp3' }), ['video', 'audio']);
  assert.deepEqual(materials.lessonFormats({ ...lesson, audioPath: 'a/b.mp3', notes: 'Dha Ge' }), ['video', 'audio', 'notes']);
  assert.deepEqual(materials.lessonFormats({ ...lesson, notes: 'Dha Ge' }), ['video', 'notes']);
  assert.deepEqual(materials.lessonFormats({ kind: 'pdf', url: null, audioPath: null, notes: null }), []);
  assert.equal(materials.isLessonKind('video'), true);
  assert.equal(materials.isLessonKind('image'), false);
});

test('#686: the student\'s statuses come from the stored status and the newest recording\'s review start', () => {
  assert.equal(assessments.studentStatusOf('assigned', null), 'assigned');
  assert.equal(assessments.studentStatusOf('seen', null), 'assigned');
  assert.equal(assessments.studentStatusOf('submitted', null), 'submitted');
  assert.equal(assessments.studentStatusOf('submitted', '2026-10-27T10:00:00Z'), 'under_review');
  assert.equal(assessments.studentStatusOf('reviewed', '2026-10-27T10:00:00Z'), 'reviewed');
  assert.equal(assessments.studentStatusOf('redo', null), 'redo');
});

test('#686: opening a review asks the database once for the newest recording', async () => {
  const calls = [];
  globalThis.__testSupabase = { rpc: (name, args) => (calls.push({ name, args }), Promise.resolve({ data: null, error: null })) };
  await assessments.startReview(42);
  assert.deepEqual(calls, [{ name: 'start_submission_review', args: { p_submission: 42 } }]);
  assert.match(src('app/staff/assessments/review/[id].tsx'), /result\.status === 'submitted' && newest && !newest\.reviewStartedAt\) void startReview\(newest\.id\)/);
});

test('the screens: details on the event card, tabs on the lesson, statuses and receipts for the student', () => {
  const detail = src('screens/event-detail.tsx');
  assert.match(detail, /\.\.\.details,/);
  assert.match(detail, /events\.detail\.openMap/);
  const player = src('screens/lesson-player.tsx');
  // The tab bar only with two or more formats; the audio mounts only after its tab was opened (#684).
  assert.match(player, /formats\.length > 1 \?/);
  assert.match(player, /audioOpened && material\.audioPath \?/);
  assert.match(player, /if \(current === 'video' && next !== 'video'\) send\(\{ cmd: 'pause' \}\)/);
  assert.doesNotMatch(src('components/lesson-audio.tsx'), /\.play\(\)\s*;?\s*\n\s*\}, \[/, 'the audio never plays by itself');
  assert.match(src('components/material-row.tsx'), /lessonFormats\(material\)/);
  const mine = src('app/student/assessments/[id].tsx');
  assert.match(mine, /StudentStatusChips/);
  assert.match(mine, /assessments\.submit\.receipt/);
  assert.match(src('app/student/assessments/index.tsx'), /studentStatusName\(t, item\.studentStatus\)/);
});

test('the new strings are in English, Telugu and Hindi', () => {
  const keys = [
    'events.form.detailsTitle', 'events.form.reportingTime', 'events.form.contact', 'events.form.mapsUrl', 'events.detail.reportBy',
    'events.detail.contact', 'events.errors.reporting_invalid', 'events.errors.coordinator_invalid', 'materials.lessonExtrasTitle',
    'materials.audioAdd', 'materials.errors.notAudio', 'lessonPlayer.tabs.video', 'lessonPlayer.tabs.audio', 'lessonPlayer.tabs.notes',
    'lessonPlayer.progressNote', 'assessments.studentStatus.under_review', 'assessments.studentStatus.redo', 'assessments.submit.receipt',
    'assessments.submit.underReview',
  ];
  for (const lang of ['en', 'te', 'hi']) {
    const json = locale(lang);
    for (const key of keys) assert.equal(typeof get(json, key), 'string', `${lang} ${key}`);
    assert.match(get(json, 'assessments.submit.receipt'), /\{\{number\}\}.*\{\{date\}\}.*\{\{time\}\}|\{\{number\}\}.*\{\{time\}\}|\{\{number\}\}/);
  }
  assert.equal(get(locale('en'), 'assessments.studentStatus.redo'), 'Redo requested');
});
